# 多人配置契约（M00）

状态：契约已固定，运行时消费者在 M04/M05 实现。唯一初始参数表在本文；`server/config/default.json` 在 M05 生成/实现，本阶段不创建假可用配置或改变当前单机入口。ADR 语义见 [0002](../adr/0002-native-authoritative-multiplayer.md)。

## 模拟与容量

tick 参数以**实际执行的模拟 tick**计时；墙钟超时一律使用单调时钟。所有数值必须是有限整数，未知键/负数/0（除明确允许处）拒绝，不使用无限默认值。

| 键 | 初值 | 单位/校验 | 归属/变更类别 |
| --- | ---: | --- | --- |
| tickMs | 50 | ms；当前只接受 50 | M01/M05；玩法时序 |
| snapshotEveryTicks | 1 | tick；首版固定 1 | M04/M05；复制策略 |
| inputSendMs | 50 | ms；不等待快照 | M06；连接保护 |
| initialMaxPlayersPerRoom | 2 | 活跃+grace 保留的 PlayerState 总上限 | M05；容量 |
| certificationPlayersPerRoom | 8 | M08 测试覆盖；不是默认准入值 | M08；容量验收目标 |
| certificationRooms | 2 | 独立房间测试数 | M08；容量验收目标 |
| maxRooms | 2 | 现存房间含空房 TTL 期间实例 | M05；容量 |
| maxConnections | 64 | 含 HTTP/未握手/关闭中的连接 | M05；连接保护 |
| maxPendingHandshakes | 16 | 包含 upgrade 后未完成 Hello 的连接；≤maxConnections | M05；连接保护 |
| inputTtlTicks | 5 | tick；250ms；仅采用新 inputSeq 续期 | M02/M05；玩法/断线规则 |
| reconnectGraceTicks | 200 | tick；10 秒模拟时间；身体可受伤 | M05；玩法/断线规则 |
| emptyRoomTtlTicks | 1200 | tick；无活跃或保留玩家后 60 秒模拟时间 | M05；容量 |
| maxCatchupTicks | 4 | 每轮调度上限；达到上限记录积压并限制准入 | M05；容量 |
| spawnCooldownTicks | 50 | tick；从成功出生起算 2500ms | M02/M03；既有玩法 |
| corpseTicks | 20 | tick；从死亡起算 1000ms | M02/M03；既有玩法 |

达到模拟时序/身份计数上限前排空，不能改变 dt 或回绕。M08 的 2×8 压测必须显式覆盖准入容量为 8 的测试配置；未通过则发布仍为 2（或更低实测值），不得把 certification 值直接用作默认上限。

## 字节、文本与队列

| 键 | 初值 | 单位/校验 | 归属 |
| --- | ---: | --- | --- |
| nicknameMaxUtf8Bytes | 128 | UTF-8 bytes；与码点限制同时满足 | M04/M05 |
| nicknameMaxCodePoints | 32 | Unicode scalar values；非法 UTF-8、控制字符拒绝；不按 UTF-16 code unit 计数 | M04/M05 |
| roomIdMaxUtf8Bytes | 64 | 房间名仅 `[A-Za-z0-9_-]{1,64}` | M04/M05 |
| chatMaxUtf8Bytes | 512 | 同时最多 256 码点；非法 UTF-8、控制字符拒绝 | M04/M05 |
| chatMaxCodePoints | 256 | 不含协议前缀 | M04/M05 |
| maxClientFrameBytes | 4096 | 一条重组后的 WebSocket message 总 bytes，含 16-byte envelope；不继承 Worker 64KiB | M04/M05 |
| maxServerFrameBytes | 1048576 | 一条全量/增量/事件 message 总 bytes，含 envelope；超限拒绝/关闭并记录，不能截断 | M04/M05 |
| maxSnapshotEntities | 16384 | 不超过现有 entity slot 数；还必须满足总字节上限 | M04 |
| maxSnapshotEvents | 4096 | 每条快照事件数上限；超限显式失败，不丢事件继续发 delta | M04 |
| maxEntityFieldBytes / maxEntityFieldRecords | 2048 / 16 | 每个独立公开实体字段块的字节/记录上限；不改变实体数值 | M04 |
| counterDrainAt | 4294966271 | u32 最大值前预留 1024；达到前排空并换 epoch，不能回绕 | M04/M05 |
| maxQueuedWriteBytes | 1048576 | 每连接所有待发送及 active write 的拥有缓冲总 bytes；超限 `SLOW_CONSUMER` | M05 |
| maxQueuedCommands | 128 | 每连接离散队列条数；移动输入独立 latest-state | M05 |
| maxCommandsPerTick | 4 | 每连接每 tick；入队与执行前都校验 LifeEpoch | M05 |
| maxFutureInputTicks | 2 | 未来输入窗口/缓存上限 | M04/M05 |
| maxPastInputTicks | 5 | 过去窗口；合格输入映射到下一未执行 tick，过旧拒绝 | M04/M05 |
| maxSequenceAdvance | 1024 | 当前已接收序号的最大前跳；0/回绕/超过窗口拒绝 | M04/M05 |
| commandResultWindow | 128 | 每会话幂等结果缓存；窗口外旧命令拒绝 | M04/M05 |
| resumeTokenBytes | 32 | 至少 256-bit 宿主密码学随机；不使用 game RNG | M05 |

nickname 修剪首尾空白后非空，随后检查完整 Unicode/字节上限；拒绝而非按字节破坏 UTF-8。roomId/nickname 都不能用作授权键。chat 也计入 Command 桶，另受独立聊天桶约束。序号在换 epoch 时重新开始；缓存和窗口有界。

## 连接与传输保护

| 键 | 初值 | 单位/语义 | 归属 |
| --- | --- | --- | --- |
| listenAddress | `127.0.0.1` | 对外监听必须显式配置 | M05 |
| listenPort | 8787 | 1..65535 | M05 |
| websocketPath | `/ws` | 二进制 v2；生产同源 WSS 代理 | M05 |
| httpHeaderMaxBytes | 8192 | HTTP parser header limit | M05 |
| httpTimeoutMs | 5000 | 接受 TCP 到 HTTP 请求完成 | M05 |
| websocketHandshakeTimeoutMs | 5000 | upgrade 握手（Beast timeout） | M05 |
| helloTimeoutMs | 5000 | upgrade 完成到合法 Hello；不能由其他包续期 | M05 |
| pingIntervalMs | 5000 | 定时发送 Ping；有 nonce | M05 |
| pongTimeoutMs | 15000 | 无有效对应 Pong 时关闭；普通流量不能伪造 Pong | M05 |
| writeTimeoutMs | 10000 | active write 的单调 deadline；超时统一 teardown | M05 |
| closeTimeoutMs | 5000 | WebSocket closing handshake；超时强制清理 | M05 |
| shutdownDrainMs | 5000 | 停服排空总期限 | M05 |
| inputRatePerSecond / inputBurst | 40 / 10 | 每连接 token bucket；允许短突发，耗尽拒绝并关闭持续违规连接 | M05 |
| commandRatePerSecond / commandBurst | 10 / 20 | 独立 token bucket | M05 |
| chatRatePerSecond / chatBurst | 1 / 3 | 独立 token bucket；发送者取连接绑定 | M05 |
| perMessageCompression | false | 首版必须禁用 | M05 |
| allowedOrigins | `[]` | 默认不接受浏览器 Origin；部署时显式填 UI origin，无通配符 | M05 |
| allowMissingOrigin | false | 原生测试配置可打开，正式包不继承测试配置 | M05/M08 |
| trustedProxies | `[]` | 默认不信任任何转发来源头 | M05 |

仅声明心跳不足以实现可靠超时：M05 必须验证 Ping/Pong、active write/close 与 shutdown 的取消顺序。WebSocket 超时使用 Beast WebSocket 层，不能同时保留冲突的底层 tcp_stream 超时。Hello 尚未成功时绝不创建 PlayerState。

## 修改与验收

每次变更记录旧值、新值、类别（玩法规则 / 容量实测 / 连接保护）、理由、覆盖测试与报告 runId。接口重构不暗改数值。M05 的默认配置必须逐键对齐本表；M04 的 schema 字段上限必须引用此契约，增加消费者前先补有限默认值及边界测试。根 CMake/依赖锁、配置和选项在 M01/M08 纳入 native source identity；现有 WASM 身份校验继续保持。

2026-11-01 M04 新增有限实体块上限 2048 bytes/16 records 和 counterDrainAt=4294966271，原值未定义；类别为连接保护。前者约束复用字段 codec 的独立块，后者给安全排空预留序号窗口。原生/TS 损坏块、数组和回绕前拒绝测试覆盖，runId 见 M04 CHECKLIST 交接。其余初值未变。
