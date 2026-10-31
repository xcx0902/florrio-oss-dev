# M04：网络协议与每连接复制

状态：未开始。依赖：M02、M03。产出：可跨 C++/TypeScript 校验的 v2 协议，以及不会消费世界状态的多观察者快照发布器。

## 04.1 schema 与文件边界

计划新增 `schema/multiplayer.yaml`，描述网络 envelope、握手、输入、控制对象、快照元数据、错误码与字段可见性；扩展现有生成器和 `schema/generated-outputs.json`，生成 `engine/include/engine/net/generated_multiplayer.hpp`、`client/src/schema/multiplayer.ts` 和 `docs/multiplayer-protocol.md`。

继续复用当前实体字段 codec。v1 Worker envelope 与 v2 网络 envelope 分开命名/分开测试；不能让客户端猜测一个包究竟是哪一版，也不能把 Worker 的 `funcName` RPC 直接暴露为网络 API。

计划新增 `net/replication_session.hpp`、`net/tick_changes.hpp`，修改 `snapshot_publisher.*` 和 `snapshot_codec.*`，新增原生/TS fixture 与手工字节向量。

## 04.2 先固定线格式

所有多字节整数使用 little-endian；varint/字符串/数组均有长度与上限校验。原生 struct 布局不能成为线格式。

建议 envelope 固定 16 字节，M00 ADR 后由 schema 固化：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| magic | 4 bytes | ASCII `FLR2` |
| protocolVersion | u16 | 值 2，未知版本明确拒绝 |
| messageType | u8 | 按 schema 枚举；未知类型拒绝 |
| flags | u8 | 未定义 bit 必须为 0 |
| sessionEpoch | u32 | Hello 为 0；Welcome 后必须匹配连接绑定 |
| payloadBytes | u32 | 必须与帧剩余长度相等，解码前检查上限 |

一条 WebSocket binary message 承载一条 envelope；不允许在 application 层隐式拼多个消息。WebSocket fragmentation 由网络库处理，再按最终消息大小限额校验。

RoomEpoch 是房间实例随机 128-bit ID；出现在 Welcome 和快照元数据中。PlayerId、SessionEpoch、inputSeq、commandSeq、snapshotSeq、baselineId 使用非零 u32。LifeEpoch 为 u32，尚未出生为 0，每次成功出生递增。serverTick 内部可用 u64，首版线格式使用 u32 并在房间 tick 接近上限前有序排空/重建，禁止回绕后继续用普通 `<=` 比较；输入和会话计数接近上限时也必须换 epoch。

## 04.3 消息列表

| 方向/消息 | 必需字段 | 行为 |
| --- | --- | --- |
| C→S Hello | protocolVersion、catalogHash、roomId、nickname、可选 resumeToken | 协议/目录不符时拒绝；客户端不能指定 PlayerId |
| S→C Welcome | roomId、roomEpoch、playerId、sessionEpoch、tickMs、serverTick、resumeToken | 建立身份；token 只返回本连接 |
| C→S Input | inputSeq、lifeEpoch、targetTick、buttons、angle、strength | 只更新本连接绑定玩家的当前生命意图；目标 tick 受服务端窗口限制 |
| C→S Command | commandSeq、类型、参数；生命相关命令另带 lifeEpoch | spawn/swap/discard/suicide/chat/leave；按队列一次执行；spawn 使用预期的当前生命代次 |
| S→C CommandResult | commandSeq、结果码、可选 nextSpawnTick | 明确接受/失败；重复命令不重复执行 |
| S→C Snapshot | roomEpoch、snapshotSeq、baselineId、serverTick、lastAppliedInputSeq、inputAppliedTick、controlledHandle、实体载荷、selfState | 全量/增量明确标记；selfState 包含 lifeEpoch、速度、有效输入及 inputExpiresTick |
| C→S ResyncRequest | 当前 baselineId、最后 snapshotSeq、原因码 | 请求新 baseline，不重置世界 |
| 双向 Ping/Pong | nonce、服务端 tick/时间采样 | RTT/时钟估计，不接受客户端修改模拟时钟 |
| S→C Error/CloseReason | 稳定错误码、可显示说明、可重试标志 | 区分满房、版本、冷却、协议错误、停服 |

`controlledHandle` 在全量、出生、死亡身体删除、重生后明确更新；为空是合法状态。不能依赖接收顺序选第一个玩家实体。

## 04.4 输入与确认语义

1. 移动 inputSeq 与离散 commandSeq 使用独立序列，不能因移动覆盖而丢掉装备/出生指令。
2. sequence=0 在网络 v2 非法。序号以服务端接收/执行窗口校验，握手更换 epoch 后重置；客户端不能发一个任意巨大的序号永久压住正常输入。
3. `lastReceivedInputSeq` 只表示解码合法；`lastAppliedInputSeq` 仅在该输入被当前 tick 的玩家控制阶段实际采用后更新。Snapshot 返回后者。
4. 连续移动对每个目标 tick 只保留采用前最新的一条，未来缓存最多 2 tick。TTL 过期使用中立输入；同一意图在若干 tick 继续有效时，每 tick 记录实际采用的序号和中立状态；只有采用新序号才延长 TTL。
5. Command 按 commandSeq 入有界队列，执行完返回成功/失败结果。拒绝重复执行；重连新 epoch 不自动重发旧生命的 suicide/swap/discard/spawn。
6. 旧 epoch、跨 roomEpoch、重复/乱序非法包必须在修改玩家状态前处理。上层出现序列间隙或 decoder 无法建立基线时请求 resync 或断开，不能合并一半包。
7. Input 和生命相关 Command 的 LifeEpoch 在入队和实际执行前均校验；重生递增后丢弃旧生命的在途输入、swap/discard/suicide，防止同一连接的旧消息操作新身体。LifeEpoch 只标识期望生命，不能用来选择他人的身体。

## 04.5 多观察者发布：先冻结，再广播，最后清理

执行步骤：

1. 将 World 的 destroyed/hit/pickup 和聊天等本 tick 输出收集成 `TickChanges`，给事件分配 `EventId = serverTick + tick内序号`。
2. 命中事件由模拟结果产生，不再以「某个观察者已经 known」作为领域记录的前置条件。世界级 `known_entities_`/pending hit 缓存的网络语义迁到 ReplicationSession。
3. 每个 PeerSession 持有独立 `ReplicationSession`：known handles、published fields、viewer position/scale、baselineId、snapshotSeq、已发送控制身份。
4. 将发布接口改为显式参数，例如 `publish(const World&, const TickChanges&, const ViewerContext&, ReplicationSession&)`。它可以更新自身 session，但不得 clear/destroy/award 或改变 World RNG。
5. ViewerContext 明确包含观察玩家身份；视野和死亡镜头保留位置按这个玩家读取。尸体删除后可以保持最后视点，但不能回到原点或跟随另一个玩家。
6. 遍历可见实体时，公开等级/分数/外观从实体所属玩家读取；私有 inventory、recharge、XP 细节、死亡保留物和可重生 tick 只写进接收者的 selfState。
7. 审查现有 dense 默认分组：不能因它携带固定槽位而把自己的背包复制到所有玩家，也不能用伪造零值作为远端玩家真实装备。v2 区分公开组件 mask 与私有 selfState。
8. 花瓣的 slot/instance 是所属玩家局部编号；必要的公开 owner handle/PlayerId 一并投影，客户端不能把所有同槽花瓣合成自己的 HUD。
9. 对每个连接分别计算 AOI 增删。实体离开可见集发送 remove 并清除其 session 缓存；再次进入必须发送完整初始化，不能沿用另一个连接的历史。
10. 所有连接的字节包构建/入队完成后，Room 统一 `finish_tick_changes()`。某个连接断开或发布失败不允许提前清空其他连接需要的记录；完成清理后所有异步队列持有独立拥有的字节，不引用临时 World 内存。
11. 聊天等广播事件从房间事件集筛选；拾取向动画目标公开必要信息，但不得泄露接收者完整背包。

## 04.6 全量、增量、慢连接与重连

- 全量：携带新 baselineId、控制身份、完整可见实体和私有 selfState；客户端事务性清空旧 decoder/component/事件缓存后应用。
- 增量：必须属于同 baseline/epoch 且 snapshotSeq 连续；基础 ACK 通过同一有序连接携带，不再照搬 Worker 的可靠 ACK 字段含义。
- 初次入房、成功重连、客户端请求 resync、视图基线失效时发送全量。持久死亡资料从 PlayerState 读取，不能依赖已清理的历史命中事件重播。
- 常规阶段不直接丢弃已编码或已入队的增量。超出写队列上限时首版选择关闭慢连接，让重连建立新全量，避免复杂的中途抛包逻辑。
- 如后续增加主动合并，必须丢弃整个未发送旧 baseline 序列并原子切换到新 baseline；不能仅保留「最新一个 delta」。
- 为 server→client 快照设置总大小和实体/事件计数上限；首版建议总包 1MiB，入房构建超限时明确拒绝或断开并记录。全量分片协议只有在实测需要时另行加入，禁止隐式截断。

## 04.7 必须通过的测试

- 两个观察者交换发布顺序，World 摘要/RNG 不变；两者都收到同一应可见删除和命中事件。
- 两个相距很远的观察者得到不同可见集；移入/移出/重入与 handle 换代正确。
- A/B 的公开等级与昵称不同，selfState 不泄露给对方；完整 dense 路径也遵守该约束。
- A 死亡、B 活着时，A 的相机/死亡统计不切到 B；重生控制 handle 更新。
- 全量/增量跨 C++→TS 的真实字节 fixture 一致；另外用手工向量测试解码边界，不能 encoder/decoder 共同犯错而自证。
- 未知版本/类型、长度不符、截断、超大 varint、非法 UTF-8/非有限浮点和超过数组限额均无半提交。
- 重复事件按 epoch+EventId 去重；resync 不重复发装备/掉落奖励。
- 同序号不同连接独立接受；序号回绕前换 epoch，seq=0、非法跳跃有确定拒绝路径。
- 首个全量、普通增量、断线重连全量分别验证 header、控制身份、实体与私有数据完整性。

## 04.8 完成条件

- [ ] schema 可生成 C++/TS/docs，并通过 `schema:check`。
- [ ] 发布器对 World 只读，所有观察者发布结束后才清理事件。
- [ ] 每连接身份、AOI、baseline 和输入确认独立。
- [ ] 真实 native→TS 快照测试、隐私测试和损坏包测试通过。
- [ ] 先实现本阶段字节/状态契约，再实现网络传输，不让传输层重新发明协议。

建议提交顺序：v2 schema → TickChanges → 只读发布与 viewer → public/self 拆分 → full/delta/epoch → 跨语言测试。
