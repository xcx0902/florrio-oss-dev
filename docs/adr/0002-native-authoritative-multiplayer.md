# ADR 0002：原生权威多人服务

- 状态：接受（架构契约）；M01—M08 的实现与容量尚未验收。
- 日期：2026-10-31（Asia/Shanghai）。
- 扩展：[ADR 0001](0001-cpp-core-and-canvas2d-client.md)；执行范围：[M00](../../multiplayer-goals/00-baseline-and-contracts.md)。

## 背景与运行时边界

保留 ADR 0001 的 C++20 领域规则、TypeScript/Canvas2D、schema 单一事实来源及领域行为等价原则。将其中「服务端编译为 WASM」扩展为两种适配器：联机产品的唯一权威是原生 `florr_server`；WASM/Worker 只服务明确选择的离线兼容与诊断。M00 不切换产品入口，也不声称当前代码已支持多人。

目标依赖为 `florr_server → server_runtime → engine_core`。离线 `engine_worker_adapter → engine_core` 持有 WorkerApi、WASM ABI 与本地诊断；网络服务不得链接它。`engine_core` 保留 model/sim/共享字节 codec，不依赖 socket、事件循环、浏览器或 `current_worker_api()`。不复制第二套 damage/petal/snapshot codec，不使用可切换的全局 current-player。

## 身份契约

| 名称 | 范围与表示 | 生命周期 |
| --- | --- | --- |
| RoomId | 配置/握手中的房间名，不是安全凭据 | 同名房间可销毁重建 |
| RoomEpoch | 房间实例的随机 128-bit 值 | 新建房间重新生成；旧实例消息无效 |
| PlayerId | 房间内非零 u32，递增分配、不复用 | 死亡、重生、grace 内重连保持；最终离场后失效 |
| EntityHandle | 现有 u32：14-bit slot + 18-bit generation，0 无实体 | 每次重生换 handle；不得充当持久玩家身份 |
| LifeEpoch | PlayerState 的 u32，未出生为 0 | 每次成功出生递增；死亡时保留；旧生命命令不得操作新身体 |
| ConnectionId | 进程内非零 u64，递增、不复用；宿主内部使用 | 每次 transport 连接新建；不得由客户端选取 |
| SessionEpoch | 非零 u32，进程内递增分配、不复用 | 初次入房、重连换连接时分配；旧回调/包不能更新新会话 |

所有身份判断包含房间实例与当前连接绑定。客户端发送 LifeEpoch 是声明期望生命，不能选择 PlayerId/handle。inputSeq、commandSeq、snapshotSeq、baselineId 均为非零 u32；序号不回绕。计数接近上限时有界排空并换会话/房间，LifeEpoch/PlayerId 耗尽则结束该身份，ConnectionId 耗尽则排空进程。serverTick 内部 u64、v2 线格式 u32；到线格式上限前排空房间。禁止用浮点 number 保存 u64 身份。

## 所有权、时序和 RNG

一个 Room 独占一个 World（共享实体、地图、模拟时钟、RNG、碰撞与 tick 事件）、PlayerState registry 和 PeerSession registry。PlayerState 持有 profile/loadout/input/body/zone/death/respawn；PeerSession 持有连接绑定、序号、限流、AOI 与复制基线。物理 owner、控制根 PlayerId 与击杀归因分别表示，不能把宠物的物理父引用直接当持久玩家身份。

首版一个 `io_context::run()` 线程串行运行网络与调度；网络回调只校验并写入有界命令队列。World 只在房间 tick 边界由模拟执行器修改。未来并行以整个房间分片，仍保持单房间单写者。

每个固定 50ms tick：按 PlayerId 升序处理生命周期/离散命令 → 采用所有玩家输入 → 对所有玩家执行当前玩家阶段 → 执行下一模拟阶段 → 冻结 TickChanges → 各连接只读编码/入队 → 统一清理事件。不能对每个玩家各跑一次完整 tick。保持 `engine/src/sim/tick.cpp` 的再生、掉落、花瓣行为、约束、补怪、AI、延迟发射、效果、区域效果、装备、轨道、控制、移动、接触、死亡与尸体清理顺序。

M01 提取共用初始化与 tick RNG 约定：当前 `WorkerApi::init(true)` 补怪前两次 game RNG draw，`WorkerApi::think()` 每 tick 六次兼容 draw；不能拆适配器时遗失。句柄 LCG、game RNG、死亡 shuffle RNG 分开记录。连接数、发布顺序、重连和编码不得推进 game RNG；密码学 resume token 与 RoomEpoch 使用宿主熵源。

## 生命、断线与重置

| 操作 | 行为 |
| --- | --- |
| 加入 | Hello 验证后创建 PlayerState/绑定；出生命令成功才创建 body、递增 LifeEpoch |
| 死亡 | 一次性结算归因/掉落/保留物，body 留 20 tick 尸体；PlayerId/profile 死亡资料保留 |
| 重生 | 按既有 profile 保留规则、出生门槛创建新 handle，递增 LifeEpoch；清除旧生命输入和命令 |
| 断线 | 立即使旧连接/SessionEpoch 失效；PlayerState 保留 200 tick；身体继续受伤，输入按 TTL 中立 |
| 显式 Leave | 停止新输入、撤销 resume token，仍保留 200 tick 可受伤身体，不能用退出避伤 |
| grace 内恢复 | token 验证并原子轮换，恢复同 PlayerId、当前真实死活/LifeEpoch，新 ConnectionId/SessionEpoch/全量基线 |
| grace 到期 | 统一清理该玩家的关联实体/效果/队列/缓存；不伪造击杀、XP 或第二次死亡掉落 |
| 房间销毁 | 无活跃或保留玩家后再计空房 TTL；取消房间全部任务；同名重建换 RoomEpoch |

出生门槛从上次**成功出生**起算 50 tick，不从死亡重新起算。断线保留从检测到断线的 tick 起算，不能被旧输入续期。只有整体房间初始化/销毁可以 reset World；死亡、重生、离场、重连均不可 reset。

## 复制与 v2 网络边界

M04 在 `schema/multiplayer.yaml` 固化协议并生成 C++/TS/docs。envelope 固定 16 bytes：ASCII `FLR2`、u16 version=2、u8 type、u8 flags、u32 sessionEpoch、u32 payloadBytes；多字节整数 little-endian。Hello epoch=0；Welcome 后必须匹配绑定。一条 WebSocket binary message 对应一条完整 envelope；不发送 C++ struct/padding，不猜测 v1/v2，不把 Worker funcName 或 cheat RPC 暴露给网络。

每个连接独立 AOI/known handles/fields/baselineId/snapshotSeq。发布接口以 `const World&`、冻结事件、显式 ViewerContext 和该连接 ReplicationSession 为参数；对世界只读。所有观察者处理完成后统一清理删除/命中/拾取，事件按房间 epoch + tick + tick 内编号去重。公开昵称、等级、owner 取实体所属玩家；inventory/XP/冷却/死亡保留物只给本连接 selfState。controlledHandle 可为空，客户端不能取第一个 kind=1。

首次加入、成功重连、resync、基线失效均发送新 baseline 的全量；客户端事务性清空旧 decoder/component/event/prediction 缓存后应用，保留传输身份的校验。增量必须同 epoch/baseline 且序号连续，否则请求全量；不半应用损坏包。普通发布不丢单个 delta；写队列超限关闭慢连接并使重连建立全量。恢复死亡态从 PlayerState 获取，不重放历史奖励。

## FFA、归因与拾取规则

保持现有地图、花瓣数值、50ms 步长、物理与接触遍历顺序。玩家本体相撞沿用系数 `clamp((max(levelA, levelB) - 5) * 0.2, 0, 1)`，但读取**双方各自实际等级**；原代码两次读同一 World.profile 是 M03 的修复点。花瓣、宠物、投射物和 DOT 沿用已有伤害/友伤过滤，以真实控制根归因；治疗和装备只作用所属玩家。

首版玩家击杀不额外产生 XP；怪物 XP 只给实际击杀者的 PlayerState。双方致死命中按既有稳定接触顺序逐项结算，保留同一次接触已有的双向伤害规则，不额外按网络包先后排序。死亡结算必须幂等。

拾取只在符合当前资格的存活玩家中选择距离最近者，以坐标提升到 binary64 后比较同一模拟阶段的平方距离，不引入 epsilon；相同距离按 PlayerId 升序。原有距离、容量和转移动画条件不变。一次 drop 原子绑定一个接收 PlayerId，直到转移完成保留归属；接收者失效按取消/回收路径清理，不发给第二名玩家，也不重复入包奖励。

## 网络库与构建决策

选择 **Boost 1.86.0 的 Asio + Beast**，固定源码归档、SHA-256 与 BSL-1.0，见 [`cmake/dependencies.lock.json`](../../cmake/dependencies.lock.json)。选择已有版本以冻结可复现输入，不追踪 latest。Asio 提供事件循环/单调 timer，Beast 提供 HTTP 与 WebSocket 异步读写/关闭/限额；相比自行实现 RFC6455，复用一个网络栈更容易验证读写生命周期。未选择独立 Asio + 另一套 WebSocket 依赖；不在 M00 引入额外库或修改产品链接。

M01 的根 CMake 读取锁定归档，以 `URL_HASH SHA256=...` 校验后解压，支持预置同一归档的离线构建，不接受系统任意版本、浮动 Git ref 或静默降级。Linux GCC/Clang、macOS Apple Clang 均由工程 C++20 + CMake 消费归档根 include：Asio、Beast、System 使用 header-only 模式，创建工程自己的 `florr_boost_headers` INTERFACE target，并链接 `Threads::Threads`，校验 `BOOST_VERSION=108600`。不需要额外的 Boost 动态运行库或单独 b2 构建。官方该版本发布归档移除了 CMake 构建布局，**不得直接 add_subdirectory/尝试构建归档里的 Boost CMake project**；根工程仅负责校验、解压和头文件 target。严格浮点/禁异常参数只作用于 engine，不污染网络代码。Linux/macOS 实际编译验收在 M01/M05 完成，M00 不声称已验证该依赖的编译。

Connection 使用 `async_accept`/`async_read`/`async_write`/`async_close` 与 error_code completion；每连接最多一个 read、一个 write，写 FIFO 缓冲持有到 completion，close 进入同一状态机。upgrade 前 HTTP/TCP 截止时间有界；upgrade 后关闭底层 tcp_stream 超时，设置 `websocket::stream_base::timeout`，并保持 read 以交付 timeout。应用 Hello 另计 5 秒，Ping/Pong 由单调 timer 明确执行 5/15 秒契约，不能把 Beast 自动 keep-alive 的半 idle 周期当成 5 秒。配置 `read_message_max`、二进制帧、禁压缩与 Origin allowlist。

官方依据（固定版本）：[归档校验](https://archives.boost.io/release/1.86.0/source/boost_1_86_0.tar.bz2.json)、[Beast timeout](https://www.boost.org/doc/libs/1_86_0/libs/beast/doc/html/beast/using_websocket/timeouts.html)、[System header-only](https://www.boost.org/doc/libs/1_86_0/libs/system/doc/html/system.html)、[发布归档/CMake 布局限制](https://raw.githubusercontent.com/boostorg/cmake/boost-1.86.0/README.md)、[许可证](https://www.boost.org/LICENSE_1_0.txt)。

## 配置、文件和验证交接

- 参数唯一契约：[`docs/multiplayer/configuration.md`](../multiplayer/configuration.md)；M05 才落地 `server/config/default.json`，变更注明规则/容量/连接保护类别。
- 路径/API/测试与命令的归属：[`docs/multiplayer/testing.md`](../multiplayer/testing.md)；M00 不创建永远 skip 的多人测试，也不注册不存在的 suite。
- 本次实际基线、失败/修复证据：[`docs/multiplayer/baseline.md`](../multiplayer/baseline.md)；原始报告在 `reports/multiplayer/baseline/`。
- M08 发布容量从 2 起；2×8 容量目标只有通过实测才可宣称支持。联机真实入口必须全程无 WASM/Worker 请求，不静默回退离线。
