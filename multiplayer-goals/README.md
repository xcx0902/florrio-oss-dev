# 多人联机 PVP 执行计划

> 创建日期：2026-10-31（Asia/Shanghai）。目标路线：原生 C++ 服务端链接 `engine_core`，浏览器通过 WebSocket 收发输入和快照。本文档集是实施计划，所有里程碑初始状态均为「未开始」；先前可行性实验不等于多人功能已完成。

## 1. 最终交付

交付一个可以启动、测试和部署的原生游戏服务，以及默认连接该服务的 TypeScript/Canvas2D 客户端。同一房间的玩家共享实体池、地图、怪物、掉落和战斗结果；服务端独立推进模拟，并按连接发布快照。联机客户端启动、游玩、死亡与重生均不加载 `server.wasm` 或 `server-worker.js`。

首个功能里程碑是双玩家 PVP；第一版容量验收目标是每房间 8 名玩家、至少 2 个房间。这里的数字是待验证的工程目标，不是现有容量结论；默认房间上限先设为 2，只有通过容量验收后才提高为 8。

本轮包含：匿名连接、按房间加入、独立玩家状态、花瓣/宠物/投射物归属、PVP 伤害、死亡掉落、重生、每连接可见集、断线重连、基础移动预测、构建/验收/部署。聊天只保留已有能力并补齐发送者和限流。

本轮不扩展账号数据库、跨进程世界迁移、排行榜服务、付费系统、排位匹配、组队阵营、完整客户端物理回滚或历史命中回溯。它们不作为当前里程碑的前置条件。

## 2. 阅读与实施顺序

| 阶段 | 执行文件 | 核心产物 | 前置依赖 |
| --- | --- | --- | --- |
| M00 | [00：基线与架构契约](00-baseline-and-contracts.md) | 基线证据、目录/接口/参数约定、测试入口 | 无 |
| M01 | [01：核心库与原生构建边界](01-native-core-boundary.md) | 可独立链接的 `engine_core`、原生宿主构建骨架 | M00 |
| M02 | [02：多人玩家状态](02-multi-player-state.md) | 同一 World 的多个 PlayerState，输入与生命周期隔离 | M01 |
| M03 | [03：PVP 与玩法归属](03-pvp-and-gameplay-ownership.md) | 花瓣/宠物/经验/死亡/拾取的多人正确性 | M02 |
| M04 | [04：协议与每连接复制](04-protocol-and-replication.md) | v2 协议、只读发布、全量/增量、身份与重连契约 | M02、M03 |
| M05 | [05：原生网络服务](05-native-server-runtime.md) | WebSocket 服务、固定 tick、房间和连接管理 | M01；房间接入依赖 M03、M04 |
| M06 | [06：浏览器联机客户端](06-network-client.md) | NetworkTransport、显式控制对象、双浏览器联机 | M04、M05 |
| M07 | [07：延迟与移动预测](07-latency-and-prediction.md) | 网络时钟、远端插值、本地移动预测与校正 | M06 |
| M08 | [08：验收与发布](08-verification-and-release.md) | 多人测试/压测、独立验收账本、原生部署包 | M00—M07 |
| 跟踪 | [执行清单](CHECKLIST.md) | 每个阶段的状态、验收证据与完成定义 | 全程维护 |

严格执行主线：`M00 → M01 → M02 → M03 → M04 → M05 → M06 → M07 → M08`。M05 的依赖配置、网络空壳可以在 M01 后预备，但不能用它代替多人核心的验收。

每个阶段内部按文档中的步骤顺序提交。一次提交只解决一个可验证的问题；阶段完成后在 CHECKLIST 中记录实际命令、测试结果和提交号，再进入依赖它的阶段。未执行的命令不得标成通过。

## 3. 目标架构与所有权

```text
Browser A / Browser B
  InputPump + GameSession + WorldState + Canvas2D
                 ⇅ binary WebSocket / production WSS
florr_server
  HTTP health / WebSocket accept / bounded I/O queues
  RoomManager
    Room
      World：entities / simulation clock / RNG / collision / tick events
      PlayerState[]：profile / loadout / body / input / death / respawn
      PeerSession[]：connection binding / input sequence / visibility / baseline
      固定 50ms：输入 → 各模拟阶段 → 冻结事件 → 各连接发布 → 清理
```

- `PlayerId` 是房间内玩家身份；重生和短暂断线不改变它。
- `EntityHandle` 是带代际的实体引用；玩家重生获得新 handle，不能当持久身份。
- `LifeEpoch` 是该玩家的一次生命代次；重生递增，旧生命的在途输入/装备命令不能作用于新身体。
- `ConnectionId` 是一次传输连接；重连一定得到新连接身份。
- `SessionEpoch` 是当前连接/复制世代；旧连接回调和旧快照不能更新新会话。
- `RoomId + RoomEpoch` 标识一次房间实例，防止销毁重建后的同名房间接受旧消息。
- 领域对象由房间模拟线程独占修改；网络回调只产生有界命令，不持有可随意修改的 World 指针。

模拟阶段必须保持全房间顺序：先对所有玩家执行某一玩家阶段，再执行下一阶段。不能对每个玩家分别跑一次完整 `tick(world)`，否则怪物、时间、碰撞与 RNG 都会被重复推进。

## 4. 全局执行约束

1. 保留 `schema/` 单一事实来源；多人字段由新的 v2 schema 生成，禁止手改生成的 C++/TS 文件。
2. `engine_core` 不依赖 WebSocket、操作系统事件循环、浏览器、Worker 或全局 `current_worker_api()`。
3. 通过函数参数/PlayerId 显式指定玩家，禁止使用 `set_current_player()` 在循环中切换全局上下文。
4. 一个房间只模拟一次，共享 World；一个连接维护一个复制基线，不能广播同一个玩家视角的增量包给所有人。
5. 发布快照不清空 World 事件。对所有连接发布结束后，房间统一结束该 tick。
6. 输入身份由连接绑定决定，客户端不能指定要控制的别人的 PlayerId/EntityHandle。
7. 出生、死亡、装备、掉落、经验和伤害由服务端裁决；客户端预测只影响自己的移动显示。
8. 联机产品不暴露本地 `?cheat` 的传送/生成怪物/改装备 RPC。已有离线诊断保持在明确的离线/测试适配层。
9. 不改变既有花瓣数值、地图尺寸、50ms 步长和接触顺序来掩盖架构问题。确需改变的 PVP 规则单独配置、测试和记录。
10. 新增测试、原生代码和依赖配置必须进入测试清单、源码身份、构建清单和验收账本，不能只增加一个绕过现有校验的启动脚本。

## 5. 第一版参数基准

这些是计划采用的初始值，M00 写入正式配置说明，M05 落到 `server/config/default.json`，M08 按实测复核。定义在同一处，其他代码引用，不散布常量。

| 参数 | 初始目标 | 解释 |
| --- | --- | --- |
| `tickMs` | 50ms | 固定 20Hz 模拟；网络快慢不改变 dt |
| `snapshotEveryTicks` | 1 | 首版每 tick 对每个已加入连接发布 |
| `inputSendMs` | 50ms | 浏览器定时上报当前意图，不等快照回应 |
| `initialMaxPlayersPerRoom` | 2 | 通过 8 人容量验收后配置提升 |
| `certificationPlayersPerRoom` | 8 | 测试目标，不预先声称已支持 |
| `certificationRooms` | 2 | 测试独立房间并存与互不影响 |
| `inputTtlTicks` | 5 | 连续 250ms 无新移动输入后清零移动/攻击/防御 |
| `reconnectGraceTicks` | 200 | 10 秒重连保留；身体仍可受伤，输入失效归零 |
| `emptyRoomTtlTicks` | 1200 | 无活跃或保留玩家后 60 秒回收房间 |
| `maxCatchupTicks` | 4 | 每轮调度最多补 4 tick；过载必须计数并触发准入限制 |
| `spawnCooldownTicks` | 50 | 沿用成功出生后 2500ms 门槛 |
| `corpseTicks` | 20 | 沿用 1000ms 尸体窗口 |
| `nicknameMaxUtf8Bytes` | 128 | 同时限制 32 个 Unicode 码点；禁止控制字符 |
| `maxClientFrameBytes` | 4096 | 新网络输入帧上限；不继承旧 Worker 的 64KiB 容限 |
| `maxQueuedWriteBytes` | 1MiB/连接 | 初始内存上限；超限断开慢连接，不能盲丢增量 |
| `maxQueuedCommands` | 128/连接 | 离散指令队列上限；移动只保留最新状态 |

传输速率、握手超时、心跳、全量快照上限和命令突发桶在 M04/M05 定义为可测参数；必须在实现其消费者前完成，不留运行时无限默认值。

## 6. 完成定义

- 两个独立浏览器接入同一原生房间，控制各自角色，互相看到移动、花瓣、伤害、死亡、掉落与重生。
- 八玩家、两房间的目标负载通过 M08；失败则降低发布容量并保留失败报告，不能宣称通过。
- 断线后旧连接不能继续操作，重连不复制玩家，跨房间消息不串流。
- 普通用户真实入口全程无 WASM/Worker 请求；协议不匹配会明确拒绝，不静默回落单机。
- 本地输入预测不授予客户端生命值、坐标或伤害的权威。
- 全部既有适用回归和新增多人门禁通过；发布包能在不安装 Node/Emscripten 的游戏服务运行环境启动。
- 有可复现构建、依赖锁定、日志/指标、健康检查、停止/排空和回退说明。

## 7. 实施时的状态声明

本目录先于实现提交。文中的新文件、API、npm 命令、报告和部署包均为「计划新增」，不是当前仓库已具备的能力。变更时只更新真实完成的部分，不把计划命令复制进现有 README 当成可用指令。
