# 多人测试与路径交接（M00—M01）

本文区分已实现入口与后续计划；任何未来测试必须在对应阶段写出真实断言并同步清单，不能提前注册空 suite 或永久 skip。所有路径相对仓库根目录，不读取 `archive/`。

## 当前可执行入口

| 入口 | 用途 | 清单/证据 |
| --- | --- | --- |
| `npm run test:all` | 重跑完整当前 WASM/Worker 产品验收（17 gate，含 M01 native 构建/CTest） | `tools/verification/gates.mjs`；`reports/runs/<runId>/run.json` |
| `npm run test:engine` | native Release + CTest 封闭清单 | `tests/product-tests.json` 的 engine.expected |
| `npm run build:server`、`test:server:native` | M01 已实现：锁定 Boost 归档、根构建、core-only 链接、18 项封闭 CTest | `build/native/native-build.json`；`reports/multiplayer/m01/<runId>/{build,ctest}.json` |
| `npm run test:multiplayer:baseline` | M00 已实现：单玩家固定种子双进程重放、冻结领域摘要比较与新报告 | `tools/multiplayer-baseline.mjs`；不表示多人验收通过 |
| `npm run test:unit`、`test:tools`、`test:integration` | 现有字节/工具/跨 C++→TS 测试 | `tools/test-manifest.mjs` 校验每个实际测试文件 |

M00 的单玩家场景入口及报告见 [baseline.md](baseline.md)。它只证明当前单玩家行为与确定性，不是多人通过报告。

## 三项必须落实的限制回归

| 需求 ID | 当前限制与复现落点 | 实现阶段/精确测试名 | 必须断言 |
| --- | --- | --- | --- |
| MP-REG-001 | `spawn_player` 检查唯一 `world.player()`；第二次正常出生被阻止 | M02 `engine_multiplayer_state_tests::two_players_spawn_in_one_world` | 两个非零不同 PlayerId、同一 World、不同 body；独立 profile/loadout/zone/death；不能依靠临时 set_player 绕过 |
| MP-REG-002 | `WorkerApi::last_sequence_` 一份；连接未分离 | M02 `engine_multiplayer_state_tests::same_input_sequence_is_independent`，M05 `server_session_tests::same_sequence_two_connections` | A/B 同 inputSeq 各自生效；A 重复包不影响 B；旧连接/旧 LifeEpoch 不操作新身体 |
| MP-REG-003 | `SnapshotPublisher::publish` 消费 World 删除/命中/拾取记录 | M04 `engine_replication_tests::two_viewers_receive_same_tick_events` | 相同可见删除/命中双方都收到；A→B/B→A 发布结果等价；World/RNG 不因发布改变，统一 finish 后才清理 |

以上在 M00 是验收需求，没有占位测试、没有声称通过。每一项均必须先看到对应阶段真实失败，再通过实现修复；记录原始失败与修复 runId。

## 各阶段测试入口（M01 已实现；M02—M08 计划新增）

| 阶段 | CTest/Node 文件名或场景 | 计划入口与覆盖 |
| --- | --- | --- |
| M01 | `engine_native_link_tests`、`server_native_tests`、`server_help/version/smoke/invalid_config` | 已实现 `build:server`、`test:server:native`；core-only 双 World 交错推进、有限 tick smoke、无 Worker/cheat ABI、保留原有 native/wasm/ABI 回归 |
| M02 | `engine_multiplayer_state_tests` | 现有 engine suite 中显式追加 target；双出生、独立输入/资料、死亡/重生 LifeEpoch、销毁反向索引、全世界只推进一次 |
| M03 | `engine_multiplayer_combat_tests` | engine suite；真实等级系数、petal/pet/projectile/DOT/治疗归属、怪物 XP、无 PVP 额外 XP、唯一拾取、同时致死、死亡掉落一次性、两个 World 隔离 |
| M04 | `engine_replication_tests`、`engine_multiplayer_protocol_tests`、`tests/integration/multiplayer-snapshot.test.mjs`、`client/tests/unit/multiplayer-codec.test.mjs` | engine/integration/client-unit；手工字节向量 + native→TS，公开/私有、双观察者、AOI、full/delta/epoch、序号回绕、损坏包事务性、无奖励重放 |
| M05 | `server_config_tests`、`server_session_tests`、`server_room_tests`、`server_connection_tests`、`server_websocket_tests` | `test:server:native`、`test:server:network`；fake clock 20Hz/TTL/grace/补帧、双真实 WebSocket、限流、token 唯一胜者、慢写、超时/信号/重复 close 一次清理 |
| M06 | `client/tests/unit/network-session.test.mjs`、`client/tests/integration/multiplayer-browser.test.mjs` | `test:multiplayer:browser`；独立 BrowserContext，显式控制对象/死亡相机、重连全量、后台标签、未知版本拒绝、真实入口无 wasm/worker 请求 |
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
| `client/src/net/network-transport.ts`、`input-pump.ts`、GameSession/WorldState | M06 客户端 | 显式注入 transport；固定上报输入；全量原子替换；无在线 think/flush |
| `client/src/net/network-clock.ts`、`movement-prediction.ts` | M07 客户端 | 只预测自己移动显示；不裁决生命、掉落、伤害 |
| `tools/lib/identity.mjs`、native identity、`tools/verification/*`、releaseEvidence | M01/M08 证据 | 新源码/依赖/配置/测试均纳入；不降低既有 delivery 严格校验 |
| `reports/multiplayer/<stage>/<runId>/` | 各阶段报告 | runId、source identity、构建配置、平台、种子或明确不适用、完整性标记；失败原样保留 |

## 完成与发布边界

新增消费者前完成有限参数/错误路径；按阶段读写本地最小闭环后再进入依赖阶段。M08 新增多人验收 profile，不把 M00 单机 `test:all` 账本当成联机发布证据。产物同时记录 native binary、client manifest、protocol/catalog hash 与实际负载配置。计划入口只有实现并验证后才加入根 package.json/产品 README。
