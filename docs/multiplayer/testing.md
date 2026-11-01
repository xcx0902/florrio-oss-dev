# 多人测试与路径交接（M00—M06）

本文区分已实现入口与后续计划；任何未来测试必须在对应阶段写出真实断言并同步清单，不能提前注册空 suite 或永久 skip。所有路径相对仓库根目录，不读取 `archive/`。

## 当前可执行入口

| 入口 | 用途 | 清单/证据 |
| --- | --- | --- |
| `npm run test:all` | 重跑完整当前在线 + 显式离线回归（17 gate，含 M01 native 构建/CTest） | `tools/verification/gates.mjs`；`reports/runs/<runId>/run.json` |
| `npm run test:engine` | native Release + 18 项 CTest 封闭清单，含 15 个 M02、26 个 M03、12 个 M04 场景 | `tests/product-tests.json` 的 engine.expected |
| `npm run build:server`、`test:server:native` | 已实现：锁定 Boost 归档、根构建、core-only 链接、29 项封闭 CTest；含 M05 的 29 个场景 | `build/native/native-build.json`；构建工具仍输出到 `reports/multiplayer/m01/<runId>/{build,ctest}.json` |
| `npm run test:multiplayer:baseline` | M00 已实现：单玩家固定种子双进程重放、冻结领域摘要比较与新报告 | `tools/multiplayer-baseline.mjs`；不表示多人验收通过 |
| `npm run test:unit`、`test:tools`、`test:integration` | 现有字节/工具/跨 C++→TS 测试 | `tools/test-manifest.mjs` 校验每个实际测试文件 |

M00 的单玩家场景入口及报告见 [baseline.md](baseline.md)。它只证明当前单玩家行为与确定性，不是多人通过报告。

## 三项必须落实的限制回归

| 需求 ID | 当前限制与复现落点 | 实现阶段/精确测试名 | 必须断言 |
| --- | --- | --- | --- |
| MP-REG-001 | M02 已移除唯一 `world.player()` 限制 | M02 `engine_multiplayer_state_tests::two_players_spawn_in_one_world` 等真实领域回归已实现 | 两个非零不同 PlayerId、同一 World、不同 body；独立 profile/loadout/zone/death；无临时 set_player 绕过 |
| MP-REG-002 | M02 领域输入不维护全局序号；M05 已实现真实网络会话 | M02 `engine_multiplayer_state_tests::same_input_sequence_is_independent`；M05 `server_runtime_tests::independent_sequences_latest_input_and_ttl`、`server_network_tests::real_two_clients_input_and_chat` | A/B 同 inputSeq 各自生效；刷包不增加 World tick 或 B 的队列；旧 LifeEpoch/SessionEpoch 拒绝 |
| MP-REG-003 | M04 已消除发布时消费 World 事件 | M04 `engine_replication_tests::two_viewers_receive_same_tick_events` | 相同可见删除/命中双方都收到；A→B/B→A 发布结果等价；World/RNG 不因发布改变，统一 finish 后才清理 |

以上在 M00 是验收需求。M02 验证领域与 received/applied 序号夹具；M04 验证只读双观察者与世代契约；M05 已通过真实 WebSocket、token 竞争/接管、慢写/超时/取消和 SIGINT/SIGTERM 生命周期测试。没有占位测试或永久 skip。原始失败与修复证据保留在阶段交接中。

## 各阶段测试入口（M01—M06 已实现；M07—M08 计划新增）

| 阶段 | CTest/Node 文件名或场景 | 计划入口与覆盖 |
| --- | --- | --- |
| M01 | `engine_native_link_tests`、`server_native_tests`、`server_help/version/smoke/invalid_config` | 已实现 `build:server`、`test:server:native`；core-only 双 World 交错推进、有限 tick smoke、无 Worker/cheat ABI、保留原有 native/wasm/ABI 回归 |
| M02 | `engine_multiplayer_state_tests` | 已追加到 engine/server-native 清单；15 场景覆盖双出生、稳定迭代、独立输入/资料/zone、TTL/控制去重、死亡/重生 LifeEpoch、实际槽位换代、反向索引、离场和双 World；另保留冻结 M00 精确比较 |
| M03 | `engine_multiplayer_combat_tests`、`engine_multiplayer_lifecycle_tests` | 已加入 engine/server-native 清单；17+9 场景覆盖等级 1/5/6/10 全组合、38 个非空花瓣的现有行为、pet/petal/projectile/DOT/治疗/经验归属、真实槽位换代、唯一拾取、同时致死、完整闭环、100 次生命和双 World；审查范围与实际能力边界见 [玩法归属](gameplay-ownership.md) |
| M04 | `engine_replication_tests`、`engine_multiplayer_protocol_tests`、`tests/integration/multiplayer-snapshot.test.mjs`、`client/tests/unit/multiplayer-codec.test.mjs` | 已实现并加入 engine/integration/client-unit 清单；12 个 native 场景、手工字节向量 + native→TS，公开/私有、双观察者、AOI、full/delta/epoch、序号回绕、损坏包事务性、无奖励重放 |
| M05 | `server_default_config`、`server_runtime_tests`、`server_network_tests`、`server_network_faults_tests`、`server_process_tests` | 已合并进 `test:server:native` 与既有 native gate；13+8+6+2 场景覆盖配置、fake clock 20Hz/TTL/冷却/grace/空房/补帧、真实双 WebSocket/两房间、限流、token 唯一胜者、断线中死亡恢复、慢写/active-write close/取消/两个进程信号；故障注入仅专用 target |
| M06 | `client/tests/unit/{network-session,local-player-identity,input-pump}.test.mjs`、`client/tests/integration/network-browser.test.mjs`、`server_browser_fixture_check` | 已接入 client-unit/client-integration/delivery 和既有 17 gate；真实双 BrowserContext PVP/死亡掉落/重生/重连/房间隔离、原生时钟独立、neutral/TTL/resync、严格错误与队列、默认在线入口无 WASM/Worker |
| M07 | `client/tests/unit/network-prediction.test.mjs`、`tests/integration/multiplayer-movement.test.mjs` | `test:multiplayer:latency`；C++/TS 纯移动 fixture、RTT/抖动、插值/有限外推、预测校正、death/respawn/epoch 清缓存 |
| M08 | `tests/multiplayer/acceptance.test.mjs`、`tests/multiplayer/capacity.test.mjs`、`tests/multiplayer/lifecycle.test.mjs`、`tests/multiplayer/release.test.mjs` | `test:multiplayer`、`test:multiplayer:capacity`、`test:multiplayer:soak`、`verify:multiplayer:release`；12 项 PVP、2×8、100 生命周期、30 分钟浸泡、Linux 包/health/TLS代理/排空/回退 |

命名在对应阶段可细拆，但不得删覆盖项。新 suite 必须先实现 `tools/test-manifest.mjs` 的已知名称、非空/遗漏/不存在文件校验、runner 及 `tests/tools/test-runner.test.mjs`，再加入 gates。新增 CTest 同步 engine.expected 或新的 server 原生清单；根构建和独立 engine 构建分别验证 CTest 不漏项。不可用绕过清单的启动脚本代替正式验收。

## 路径与接口所有权

| 路径/API | 阶段/所有者 | 约束 |
| --- | --- | --- |
| 根 `CMakeLists.txt`、`server/CMakeLists.txt`、`cmake/dependencies.lock.json` | M01 宿主构建 | lock 已在 M00 固定；M01 实现获取、hash、core/adapter、native identity |
| `engine/include/engine/model/player_state.hpp`、`player_registry.hpp` | M02 领域 | PlayerId 显式传入，handle 反向查所属玩家；无 set_current_player |
| `engine/include/engine/model/world_config.hpp`、共用初始化/tick 兼容函数 | M01 领域 | 原生/离线共用；保留初始化与每 tick RNG 约定 |
| `schema/multiplayer.yaml`、`schema/generated-outputs.json`、生成的 C++/TS/docs | M04 schema | 只改源 schema/生成器，不手改输出；v1/v2 明确分离 |
| `engine/include/engine/net/tick_changes.hpp`、`replication_session.hpp` | M04 复制 | `publish(const World&, const TickChanges&, const ViewerContext&, ReplicationSession&)`；房间统一 finish |
| `server/include/florr/server/`、`server/src/{net,runtime}/`、`room/session/room_manager/config/metrics` | M05 宿主 | 单写者、固定时钟、连接绑定、有界队列/生命周期；无远程诊断导出 |
| `server/config/default.json` | M05 配置 | 对齐 [configuration.md](configuration.md)，不散布常量 |
| `client/src/net/{transport,websocket}.ts`、`client/src/app/input-pump.ts`、GameSession/WorldState | M06 客户端 | 显式注入 transport；固定上报输入；全量原子替换；无在线 think/flush |
| `client/src/net/network-clock.ts`、`movement-prediction.ts` | M07 客户端 | 只预测自己移动显示；不裁决生命、掉落、伤害 |
| `tools/lib/identity.mjs`、native identity、`tools/verification/*`、releaseEvidence | M01/M08 证据 | 新源码/依赖/配置/测试均纳入；不降低既有 delivery 严格校验 |
| `reports/multiplayer/<stage>/<runId>/` | 各阶段报告 | runId、source identity、构建配置、平台、种子或明确不适用、完整性标记；失败原样保留 |

## 完成与发布边界

新增消费者前完成有限参数/错误路径；按阶段读写本地最小闭环后再进入依赖阶段。M08 新增多人验收 profile，不把 M00 单机 `test:all` 账本当成联机发布证据。产物同时记录 native binary、client manifest、protocol/catalog hash 与实际负载配置。计划入口只有实现并验证后才加入根 package.json/产品 README。
