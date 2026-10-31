# M05：实现原生 WebSocket 游戏服务

状态：未开始。依赖：M01；连接真实房间依赖 M03、M04。产出：原生 `florr_server`，具备独立时钟、多人房间、连接绑定、限额和重连。

## 05.1 目录、类与职责

| 计划新增文件/组件 | 职责 |
| --- | --- |
| `server/src/main.cpp` | 参数、配置、信号、启动与退出码 |
| `server/src/config.cpp` | 读取并校验 `server/config/default.json`，拒绝未知/无界参数 |
| `server/src/net/listener.cpp` | TCP/HTTP accept、`/ws` upgrade、health/readiness |
| `server/src/net/connection.cpp` | 异步读写、帧限额、发送队列、超时、关闭状态 |
| `server/src/session.cpp` | Hello、连接绑定、epoch、输入序号、命令幂等、限流 |
| `server/src/room.cpp` | World/players/peers、tick、事件冻结、快照发布 |
| `server/src/room_manager.cpp` | 创建/查找房间、容量、空房回收、准入 |
| `server/src/runtime/fixed_tick_scheduler.cpp` | 单调时钟、固定步长、补帧与过载统计 |
| `server/src/metrics.cpp` | 有界日志/指标、来源身份脱敏 |
| `server/tests/` | 可注入时钟、会话、房间、网络生命周期回归 |

首版使用单个 `io_context::run()` 线程，房间调度与网络回调在同一串行执行上下文中运行。网络回调仅入队命令；Room 在 tick 边界修改领域状态。不先引入每连接线程、全局 World 锁或复杂线程池。

若 M08 显示单线程无法满足已声明容量，再按「房间整体分片」扩展；一个 World 仍由单个执行器独占。多线程时 Connection 仍需固定 strand，不能因为不同 socket 看起来独立就并发操作同一个 stream。

## 05.2 建立最小网络宿主

1. 按 M00 锁定依赖构建；默认采用异步网络 API，显式错误码和确定的资源所有权。若选 Beast，HTTP→WebSocket 的 timeout/关闭策略按它的 WebSocket 接口配置，不照搬底层 TCP timeout。
2. 实现 `/healthz`（进程存活）和 `/readyz`（允许加入）；排空、过载拒绝或初始化失败时 readiness 为非就绪。响应不泄漏 token、玩家私有资料或编译机路径。
3. `/ws` 仅接受二进制 v2，Hello 前不创建玩家。握手限 5 秒；客户端完成 Hello 前发送 Input/Command 会被拒绝。
4. 检查协议/目录 hash、昵称和房间参数；同房玩家昵称不作为身份键。房间满返回 `ROOM_FULL`，不可悄悄把用户送到另一个房间。
5. 成功后由服务端生成 PlayerId/SessionEpoch 和至少 256-bit 的密码学随机 resume token；token 不使用游戏 RNG，不记录完整值，不放 URL。
6. 每个连接最多一个 active read、一个 active write；写操作通过 FIFO 串行排队，字节缓冲持有到 completion。close 也走状态机，不能与尚未完成的 write 随意并发。
7. 对异步回调使用明确生命周期对象/weak token；关闭后晚到回调只清理自身，不再查写新连接同名玩家。所有失败最终走一次统一 teardown。

## 05.3 输入队列、顺序与限额

初始参数：移动输入持续 40 帧/秒、突发 10；离散命令持续 10 条/秒、突发 20；聊天独立 1 条/秒、突发 3；允许有明确短暂突发，但持续超限关闭连接。连接、未握手连接、房间总数也必须有配置上限，默认最多 2 个房间、64 条总连接、16 条未握手连接。

执行顺序：

1. Connection 检查帧长度/类型 → decoder 全包校验 → Session 检查绑定/epoch/速率/序号 → 入队。任何失败都不能部分修改 World。
2. Input 仅接收 buttons 的合法 bit、有限 angle、范围为 0..200 的 strength。未知按钮和越界强度明确拒绝；既有离线 sanitized_float 的宽松行为不直接成为公网规则。
3. Input 的 targetTick 只允许本房间当前 tick 附近的有限窗口；过去输入可映射到下一个未执行 tick，超过允许未来窗口的输入拒绝，不能让客户端改变服务端时间。
4. 每个目标 tick 最多保留最新移动意图，最多缓存未来 2 tick；离散 commandQueue 单独 FIFO、有界，不被移动覆盖。
5. 房间 tick 开始时按 PlayerId 顺序处理 join/leave/reconnect/Command，再为玩家采用本 tick 合格的最新 Input；更新 `lastAppliedInputSeq` 和实际采用 tick。每连接每 tick 最多执行 4 条离散命令；生命周期改变后重新检查 LifeEpoch，丢弃旧生命消息。
6. 只有采用新输入序号才延长 TTL，不能因为复用旧意图就永久续期。到期将移动/攻击/防御设为中立，速度仍按现有物理衰减。
7. spawn、swap、discard、suicide 由领域接口再次验证玩家当前生命/槽位/冷却；协议层通过不代表领域命令必然成功。
8. CommandResult 保留有限重复检测窗口；窗口外旧命令拒绝，不重新执行。epoch 切换后清空旧命令和移动缓存。

## 05.4 固定 tick 与发布

调度器使用 `steady_clock` 或等价单调时钟；测试可注入 fake clock。服务端无客户端连接时也按配置推进已存在房间；客户端隐藏/冻结标签页不会停止 World。

```text
poll scheduler
  为到期房间执行最多 maxCatchupTicks 个固定 50ms tick
    处理生命周期请求与领域命令
    采用全部玩家的本 tick 输入
    执行一次全房间的 sim::tick
    更新输入采用确认
    冻结 TickChanges
    为每个 peer 编码并入队自己的快照
    统一结束事件批次
  返回 I/O 执行器处理读写与下一次定时器
```

- 不把一次网络请求直接映射成一次 think；发送频率翻倍不能让世界加速。
- 达到 4 个补帧上限后记录超额墙钟积压，限制新加入并产生 overload 指标；可以丢弃过量墙钟积压以恢复调度，但不能声称那些模拟 tick 已执行，也不能增大 dt。持续过载视为容量验收失败。
- 序号、生命冷却和 input TTL 按实际执行的模拟 tick 计算；连接握手/心跳超时按单调墙钟计算，不能混用。
- 游戏 RNG 仅由初始化/模拟所需操作推进；有多少观察者、连接发送顺序或重连次数不得改变同一固定输入场景的领域结果。

## 05.5 重连、离场与房间销毁

1. 丢失连接后立即解绑旧 connection/epoch，清空旧队列；保留 PlayerState 200 tick。输入在 TTL 后归零，身体仍可受伤。
2. 合法 token 在 grace 内恢复同 PlayerId；原子轮换 token、生成新 SessionEpoch、建立全新复制基线，并返回当前真实生命状态。断线期间死亡则恢复死亡界面。
3. 两个连接竞争同一 token 时串行决定唯一胜者；已轮换 token 不能再次使用。重连接管后旧连接所有晚到输入无效。
4. grace 到期统一调用离场清理，释放玩家剩余实体/关联效果/待执行命令/复制缓存，避免遗留幽灵宠物或引用；清理不重复执行死亡/掉落。
5. 显式 Leave 立即停止接受该连接新输入，但身体仍按相同保留策略处理。客户端是否持有有效重连 token 的规则要明确，不能靠关闭 UI 获得无敌。
6. 房间没有活跃或保留玩家后启动空房 TTL；到期从 RoomManager 删除，取消 timer、回调和缓存。再建同名 roomId 使用新的 RoomEpoch。
7. 服务停止时先关闭准入，通知当前连接并在有界期限内排空；最终取消所有异步任务后退出，不能关闭一半仍保留后台模拟线程。

## 05.6 传输与部署边界

默认本机监听 `127.0.0.1:8787`，开发者显式配置才绑定外网。生产采用同源反向代理：静态资源走 `/`，WebSocket 走 `/ws`，代理终止 TLS。联机服务运行时无需 Node/Emscripten；若使用动态 C++/Boost 运行库，发行包明确列出并校验。

Origin 使用配置 allowlist；开发代理和无 Origin 的原生测试客户端策略分开配置，不能把测试宽松选项带入正式包。HTTP/WSS 代理的真实来源头只信任配置的代理。

心跳初值：5 秒发送 Ping，15 秒无响应关闭；写入队列限 1MiB。首版慢连接超限直接关闭并记录 `SLOW_CONSUMER`，让后续重连发新全量，不盲丢增量。默认禁用 per-message compression，压测后再决定是否启用。

## 05.7 测试与完成条件

- [ ] fake clock 验证 20Hz、补帧上限、TTL、冷却、grace 和空房回收，不靠长 sleep。
- [ ] A/B inputSeq 相同仍分别生效；一人刷包不增加 tick、伤害次数或 B 的延迟队列。
- [ ] 两房间实体/随机数/事件/连接完全隔离；离场只影响目标玩家。
- [ ] 重连保持 PlayerId，替换 SessionEpoch，旧连接不能继续控制；恢复死亡态正确。
- [ ] 超时、读错、写错、慢连接、重复 close、进程信号均完成一次清理。
- [ ] 原生服务接两个真实 WebSocket 客户端，输出不同控制身份和正确的各自快照。
- [ ] 正式服务没有可远程调用的 debug/cheat 命令；测试注入仅在专用测试 target。
- [ ] 源码/依赖/配置进入 native identity，服务启动日志可识别构建和协议版本。

建议提交顺序：配置/监听 → Connection → Session 输入 → Room 调度 → 重连清理 → 指标与宿主回归。
