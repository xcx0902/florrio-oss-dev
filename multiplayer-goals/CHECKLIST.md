# 多人联机执行跟踪

> M00—M04 已完成；M05—M08 尚未开始。状态只使用「未开始 / 进行中 / 已完成 / 阻塞」；阻塞必须说明具体依赖，不以预计进度代替实际结果。

## 1. 阶段看板

| 阶段 | 状态 | 实际提交 | 验收 runId/报告 | 备注 |
| --- | --- | --- | --- | --- |
| M00 基线与契约 | 已完成 | 回归/驱动修复 `2bb33bf`；架构契约 `07b36d9` | `2026-10-31T15-09-18.267Z-4432f606`；`reports/multiplayer/baseline/summary.json` | 15/15 gate；12 CTest + 249 Node/浏览器测试通过；失败记录保留 |
| M01 原生 core 边界 | 已完成 | 工作区实现，未创建提交 | `2026-10-31T23-43-46.442Z-f638c98a`；`reports/multiplayer/m01/2026-10-31T23-43-46.442Z-f638c98a/summary.json` | 17/17 gate；engine 13/13、根 CTest 18/18、Node/浏览器 251/251；20 tick smoke 与纯 core 双 World 通过 |
| M02 多玩家状态 | 已完成 | 工作区实现，未创建提交 | `2026-11-01T00-18-30.561Z-577c7708`；`reports/multiplayer/m02/2026-11-01T00-18-30.561Z-577c7708/summary.json` | 17/17 gate；engine 14/14、根 CTest 19/19、15 个 M02 场景及 ASan/UBSan；冻结 M00 摘要一致 |
| M03 PVP 与玩法归属 | 已完成 | 工作区实现，未创建提交 | `2026-11-01T01-54-57.347Z-2c94ac23`；`reports/multiplayer/m03/2026-11-01T01-54-57.347Z-2c94ac23/summary.json` | 17/17 gate；engine 16/16、根 CTest 21/21；26 个新增场景、100 次生命周期及 ASan/UBSan 通过 |
| M04 协议与复制 | 已完成 | 工作区实现，未创建提交 | `2026-11-01T02-58-18.343Z-05f8fff5`；`reports/multiplayer/m04/2026-11-01T02-58-18.343Z-05f8fff5/summary.json` | 17/17 gate；engine 18/18、根 CTest 23/23；12 个新增 native 场景、259 个 Node/浏览器测试与 ASan/UBSan |
| M05 原生网络服务 | 未开始 | — | — | — |
| M06 联机客户端 | 未开始 | — | — | — |
| M07 延迟与预测 | 未开始 | — | — | — |
| M08 验收与发布 | 未开始 | — | — | — |

## 2. 可执行任务清单

### M00：基线

- [x] MP-000：保存当前版本、环境和工作区状态；重新运行完整现有验收，15/15 gate 通过，见 [基线证据](../docs/multiplayer/baseline.md)。
- [x] MP-001：记录单玩家领域摘要和三项多人限制回归需求，见 `docs/multiplayer/baseline.md`、`testing.md`。
- [x] MP-002：ADR 0002 固定身份、时序、规则、断线和依赖选择；`cmake/dependencies.lock.json` 固定精确归档/校验。
- [x] MP-003：固定配置契约与新增命令/测试清单，见 `docs/multiplayer/configuration.md`、`testing.md`。

### M01：构建边界

- [x] MP-010：拆 `engine_core` / `engine_worker_adapter` 源表与链接关系。
- [x] MP-011：根 CMake + server target + 有限 tick smoke。
- [x] MP-012：共享初始化/RNG 契约、纯 native 链接与双 World 回归。
- [x] MP-013：native 源码身份/依赖锁定接入；旧 ABI/Worker 回归通过。

### M02：多玩家

- [x] MP-020：PlayerId/State/Registry 与 handle 反向索引。
- [x] MP-021：profile/loadout/input/death/zone/respawn 字段迁移。
- [x] MP-022：出生、输入、恢复生命和控制显式指定玩家。
- [x] MP-023：按模拟阶段遍历全部玩家，世界只推进一次。
- [x] MP-024：destroy/离线适配/重复出生/换代回归。

### M03：PVP

- [x] MP-030：控制根、物理 owner、击杀来源分别建模。
- [x] MP-031：装备、花瓣、宠物、投射物、DOT 与治疗归属隔离。
- [x] MP-032：双方实际等级伤害、真实击杀经验/昵称。
- [x] MP-033：唯一拾取、死亡掉落、尸体、重生事务与生命周期回归。
- [x] MP-034：原生双玩家完整对战闭环及两 World 隔离。

### M04：协议和复制

- [x] MP-040：v2 schema/生成/手工字节与 native→TS fixture。
- [x] MP-041：Room/Session/Life epoch、控制 handle、selfState、输入采用确认。
- [x] MP-042：冻结 TickChanges、只读发布、统一清理、发布顺序不影响世界。
- [x] MP-043：每连接 AOI/baseline/full/delta，公开/私有字段分离。
- [x] MP-044：重入、损坏包、resync、慢连接和回绕边界测试。

### M05：服务端

- [ ] MP-050：配置、依赖、监听、health/readiness 与异步 Connection。
- [ ] MP-051：握手/连接绑定、输入与离散命令分离、限流和幂等。
- [ ] MP-052：固定 tick/补帧/TTL/过载，RoomManager 容量与隔离。
- [ ] MP-053：grace/token 轮换/旧连接失效/房间回收/有界停服。
- [ ] MP-054：真实双 WebSocket、错误清理、指标与正式包无 cheat。

### M06：客户端

- [ ] MP-060：Transport 注入、公开连接配置、连接状态机。
- [ ] MP-061：InputPump/CommandResult，移除在线 think/flush。
- [ ] MP-062：显式控制身份、selfState HUD、远端 owner 与死亡相机。
- [ ] MP-063：全量重置、重连、后台标签页与错误 UI。
- [ ] MP-064：双 BrowserContext 完整 PVP，真实入口无 WASM/Worker 请求。

### M07：延迟

- [ ] MP-070：真实网络时钟、targetTick 与采用/TTL 反馈。
- [ ] MP-071：远端按 serverTick 的快照缓冲/插值/有限外推。
- [ ] MP-072：纯移动 C++/TS 契约及有界预测/重演/校正。
- [ ] MP-073：死亡/重生/epoch 清理，RTT/抖动矩阵和实际体验报告。

### M08：交付

- [ ] MP-080：清单/runner/gates/native identity/releaseEvidence 全部接入。
- [ ] MP-081：真实 PVP 12 项验收与当前源码完整账本。
- [ ] MP-082：2×8 容量、集中战斗、慢连接、100 次生命周期、30 分钟浸泡。
- [ ] MP-083：联机打包、启动器、默认入口切换与离线 profile 边界。
- [ ] MP-084：Linux 发行包、配对 manifest、TLS 代理/健康/排空/回退 smoke。
- [ ] MP-085：更新产品文档/版本说明，记录最终容量与限制。

## 3. 每阶段交接记录模板

完成阶段时复制并填写，保留原始失败和修复后的结果，不覆盖历史：

```text
阶段 / 任务编号：
实际提交：
实现范围 / 文件：
执行命令：
测试数量与结果：
runId / source identity / binary-client hash：
报告路径：
规则或接口偏离计划之处及理由：
未解决问题与受影响的后续阶段：
下一步：
```

只有全部完成条件和适用回归满足才标记阶段「已完成」。功能跑通但缺少身份隔离、事件完整性、真实入口或发布证据时，仍保持「进行中」。

## 4. M00 完成交接

- 阶段 / 任务编号：M00；MP-000—MP-003 全部完成，2026-10-31。
- 实际提交：`2bb33bf495bb59041f5ef23e787c01ae3f0afdce`（单玩家冻结回归、证据命令、性能收尾修复）；`07b36d92b15f5fccdd0b0b832a12fdeb1db46bc0`（ADR、依赖锁、配置与测试契约）。
- 实现范围 / 文件：`tests/fixtures/product/multiplayer/`、`tests/integration/single-player-baseline.test.mjs`、`tools/multiplayer-baseline.mjs` 及现有清单/runner；`docs/adr/0002-native-authoritative-multiplayer.md`、`docs/multiplayer/{configuration,testing,baseline}.md`、`cmake/dependencies.lock.json`。保留现有产品入口和领域实现。
- 执行命令：`npm run test:engine`、`npm run test:integration`、`npm run test:multiplayer:baseline`；完整验收使用 `CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell npm run test:all`，浏览器版本固定为 `156.0.8078.47`。
- 测试数量与结果：完整 15/15 gate；native CTest 12/12；Node/浏览器 249/249（40 单元、22 工具、102 客户端单元、4 跨端、81 浏览器），无失败或跳过。真实 Worker 排空回归共 5/5；单玩家七个检查点在两个独立进程重放，均与修改测试前的原始领域观测一致。
- runId：完整验收 `2026-10-31T15-09-18.267Z-4432f606`，`passed=true`、`stable=true`；单玩家重放 `m00-2026-10-31T15-08-52.986Z-cc65dce1`。
- source identity：`e4cbf0db8ad7a772573f79f6b29b4a1e58a890b6fa02774aac34a05d16cc179b`；verification identity：`13aa984b7907ba441a6e62836f7901e314b2eede33136c80e5343c497c36fc2a`。
- binary/client hash：native 场景 `6548015174b9a7a6c2fa86215ac6fc7456d9cb05daba417ac47f255b3d1e35bc`；client `22991fe6843f62bec81145e6b2a2ef2ae9fe0b081fc336481549c04cc6992d99`；WASM `39e22812dc79b79e1bf32ea91e65e64729b3e511c2b2979ff8070c93a3040cb4`。
- 报告路径：`reports/multiplayer/baseline/{environment,original-single-player,single-player,accepted-run,summary}.json`；`accepted/2026-10-31T15-09-18.267Z-4432f606/index.json` 冻结 gate 报告副本与哈希；原日志位于 `reports/runs/<runId>/`。`reports/` 依既有策略不入 Git，可审查的夹具、命令和结果摘要已提交。
- 失败与修复：首次系统浏览器启动失败/版本不匹配，改用已有固定版本浏览器；第二次完整运行最后一项因重生后继续生产请求而采样到 pending=1。仅修复性能驱动在测量完成后冻结生产者并等待真实排空，同时拒绝错误 completion；600 帧、5 次重复和预算保持不变。三次失败/中断 ledger 与原性能数据均保留，详情见 [基线记录](../docs/multiplayer/baseline.md)。
- 规则或接口偏离及理由：未改变玩法规则。M00 为可重复比较加入一个真实 native CTest 目标和跨端夹具回归；针对发现的既有验收收尾竞争加入两条浏览器回归，避免以偶然 pending 值阻断基线。
- 未解决问题与受影响后续阶段：M00 无未解决项；多人功能与 Linux/macOS 网络库编译仍按 M01—M08 实现和验收，不能以本次单玩家基线宣称多人通过。
- 下一步：M01 拆分 native core / Worker adapter，接入原生服务有限 tick smoke、双 World 隔离和 Boost 1.86.0 固定归档；按锁定归档仅消费头文件，不尝试构建其 Boost CMake project。


## 5. M01 完成交接

- 阶段 / 任务编号：M01；MP-010—MP-013 全部完成，2026-11-01（Asia/Shanghai）。
- 实际提交：本轮为工作区实现，未创建 Git 提交。验收绑定当前源码/验证身份；`reports/multiplayer/m01/2026-10-31T23-43-46.442Z-f638c98a/source-changes.json` 保存基准 HEAD、全部本轮文件内容和哈希，可从基准重建本次修改；不能把基准 HEAD 当作 M01 提交号。
- 实现范围 / 文件：根 `CMakeLists.txt`、`cmake/Dependencies.cmake` 与原锁定文件；`engine/sources.cmake`、core/worker/perf 适配器 target；`model/world_config.*`、显式 World 的 `diagnostics/entities.*`；`server/` 的 CLI/有限 tick runtime/测试；`tools/build-server.mjs`、native identity、test manifest/runner 和两项新增 gate。浏览器默认产品入口与单玩家规则保持既有路径。
- 执行命令：`npm run build:engine`、`node tools/run-tests.mjs engine`、`npm run build:engine:wasm`、`node tools/verify-abi.mjs`、`npm run test:unit`、`npm run test:tools`、`npm run test:integration`、`npm run test:multiplayer:baseline`；`FLORR_BOOST_ARCHIVE=/private/tmp/florr-boost-1.86.0.tar.bz2 npm run test:server:native`；完整验收为同一 archive 环境加 `CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell npm run test:all`。固定浏览器仍为 `156.0.8078.47`。
- 独立边界验证：`cmake -S . -B build/native-core-only -DCMAKE_BUILD_TYPE=Release -DFLORR_BUILD_SERVER=OFF`、构建/运行 `engine_native_link_tests` 通过，无 Boost/Worker 前置。错误归档配置真实返回 1，并明确报告锁定 SHA256 不一致；CLI 未知/缺值/越界参数返回 2。
- 测试数量与结果：完整 **17/17 gate**，`passed=true`、`stable=true`；独立 engine **13/13 CTest**，根构建 **18/18 CTest**（包含同一 13 项及 5 项宿主回归）；Node/浏览器 **251/251**（40 单元、24 工具、102 客户端单元、4 跨端、81 浏览器），无失败或跳过。绘制性能 3 profile × 4 场景 × 5 次 × 600 帧全部通过；native/WASM 引擎性能和真实 Worker 跨端性能 5 次均通过。原始单玩家冻结摘要继续匹配。
- runId：`2026-10-31T23-43-46.442Z-f638c98a`；UTC 完成时间 `2026-11-01T00:01:00.413Z`（北京时间 2026-11-01 08:01:00）。
- source identity：产品 `5209d906b1539edf8f5853b63e71f013d2521e3134f08ca2d25c6a3e30e65e4c`；native `b3eb33209c945a6babdbade3172dfe5cc3c38dc9b628a39f9e3e1f6f5f0f1a02`；verification `84d3c6541021df0018cd08e12801fe271d45b46f9c18f492fe32382bde3ed759`。native identity 另外记录 15829 个实际 Boost 头文件/许可证输入、编译器二进制、CMake、实际 compile commands/cache 和产物哈希；core 严格编译参数未进入宿主。
- binary/client hash：native host `f9c1985a2d65e90458088aedbdf12625dc9f067e31759aa33f4a33dab3cd4916`；WASM `e706d259c7aaafd254cac36b091f5d59c0cc8fbadddddec1bf9e896b334230a0`；client/wasm/static 组合身份 `993ff27011596e448a987e38f423658f6657b734bea5597c4bd8674bfe150a96`。
- smoke 实测：`--smoke-ticks 20` 输出 tick=20、timeMs=1000、entities=866、seed=285456437、game RNG state=2044652668/draws=8457、handle RNG state=11065635568950165505、death RNG state=1；无墙钟等待，无 WASM/Worker 初始化。宿主实际链接行为仅 `server_runtime + engine_core`，core/宿主 `nm` 检查无 Worker/cheat ABI。
- 报告路径：`reports/runs/2026-10-31T23-43-46.442Z-f638c98a/run.json`、`reports/multiplayer/m01/2026-10-31T23-43-46.442Z-f638c98a/{build,ctest,summary}.json`；`accepted/index.json` 冻结当前 gate 报告、交付 manifest、toolchain 和日志哈希。`releaseEvidence()` 已真实通过，新增 native gate 未降低既有交付校验。
- 失败与修复：首次普通沙箱的官方归档下载因本机代理不可达失败；随后下载同一官方归档，并通过锁定 SHA256 预置给 CMake，未变更依赖版本或回退到系统库。网络失败原日志和篡改归档的预期失败日志保存于本次证据目录。实现期间发现部分原有测试自己使用异常，保留其原有异常支持，只有 core/adapter/perf engine target 禁异常/RTTI；没有把这些参数传播到宿主/Boost。完整 17-gate 运行无失败。
- 规则或接口偏离及理由：未改玩法/阶段/浮点顺序。手工根构建命令使用 `cmake --build build/native -j 6` 而非只构建 florr_server，以确保接下来的全部 CTest 可执行文件存在；宿主当前配置解析仅覆盖 CLI，完整配置文件与网络监听留给 M05。M01 实现不宣称网络或多人通过。
- 未解决问题与受影响的后续阶段：M01 无功能阻塞；本轮尚未提交，提交号待后续提交时补录。Linux 发行包/网络/PVP/容量仍按后续阶段实现和验证。
- 下一步：M02；显式 PlayerId/PlayerState/Registry、玩家输入与生命周期隔离、按全世界阶段推进。M02 尚未执行。


## 6. M02 完成交接

- 阶段 / 任务编号：M02；MP-020—MP-024 全部完成，2026-11-01（Asia/Shanghai）。
- 实际提交：本轮为工作区实现，未创建 Git 提交。`reports/multiplayer/m02/2026-11-01T00-18-30.561Z-577c7708/source-changes.json` 保存基准 HEAD、全部本轮文件内容与哈希；验收绑定实际源码身份，不把基准 HEAD 当作实现提交号。
- 实现范围 / 文件：新增 `model/player_id.hpp`、`player_state.hpp`、`player_registry.*`、`sim/player_commands.*`；World 移除隐式单玩家字段，玩家控制/回血/区域/装备/轨道按稳定 PlayerId 顺序逐阶段推进，AI/碰撞/世界时间只推进一次。实体回调按真实 body/orbit 解析玩家；WorkerApi、diagnostics、v1 snapshot 显式指定本地/观察者 ID。新增 core-only `engine_multiplayer_state_tests` 和真实领域辅助层，旧单玩家测试迁到测试专用适配器；源表、CMake 与两套 CTest 清单同步。
- 领域边界：PlayerId 房间内单调不复用，完整代际 body 反向索引、稳定 PlayerState 地址；LifeEpoch 每次成功出生递增，旧生命的输入/装备命令拒绝。默认输入 TTL=5 tick，控制每 tick 最多一次；成功出生后 50 tick 冷却，尸体保留 1000ms；身体删除保留档案和死亡统计。网络输入序号与连接身份仍属于 M05。
- 执行命令：`npm run build:engine`、`node tools/run-tests.mjs engine`、`node --test tests/integration/single-player-baseline.test.mjs`、`npm run test:unit`、`npm run test:tools`、`npm run build:engine:wasm`；完整验收使用 `FLORR_BOOST_ARCHIVE=/private/tmp/florr-boost-1.86.0.tar.bz2 CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell npm run test:all`。浏览器固定 `156.0.8078.47`，Boost 仍为锁定归档与 SHA256。
- 内存安全：`cmake -S engine -B build/m02-sanitize -DCMAKE_BUILD_TYPE=Debug '-DCMAKE_CXX_FLAGS=-fsanitize=address,undefined -fno-omit-frame-pointer' -DCMAKE_EXE_LINKER_FLAGS=-fsanitize=address,undefined`，构建/运行 `engine_multiplayer_state_tests`，15/15 通过，无 ASan/UBSan 错误。配置、二进制与日志哈希见 `reports/multiplayer/m02/2026-11-01T00-18-30.561Z-577c7708/sanitizer.json`。
- 测试数量与结果：完整 **17/17 gate**，`passed=true`、`stable=true`；独立 engine **14/14 CTest**、根构建 **19/19 CTest**；新多人状态 **15/15** 场景；Node/浏览器 **251/251**（40 单元、24 工具、102 客户端单元、4 跨端、81 浏览器），无失败/跳过。绘制性能 3 profile × 4 场景 × 5 次 × 600 帧通过，native/WASM 引擎及真实 Worker 跨端性能通过；原冻结 M00 JSON 不变，双进程精确重放一致。
- runId：`2026-11-01T00-18-30.561Z-577c7708`；UTC 完成时间 `2026-11-01T00:34:47.181Z`。
- source identity：产品 `424460bc140395adfbdaad4088577878a52aeb5be4dade819b4871024a64ef6a`；native `face3075a2ea5aa2589fc18f5f2d2a8065145471250d7effc3e90d96ae0d6fe6`；verification `43f7df772dac57e0700756fccf0caa755989fd2bad02a5ab1c3a5a341c57a296`。
- binary/client hash：native host `20b44c52d4c942484d41812d3f2905c145698766fbf27b7fa9a31257384f77b9`；WASM `ffc6b73c786c91187c0afec080373a01791e19b863fa59ba22fa674a7c03f676`；client/wasm/static 组合身份 `4935013af48ea839dca11ba138a5a8816873f96125cb7619fabe8b0cdc20d278`。
- 报告路径：`reports/runs/2026-11-01T00-18-30.561Z-577c7708/run.json`、`reports/multiplayer/m02/2026-11-01T00-18-30.561Z-577c7708/{summary,build,ctest,baseline,sanitizer,source-changes}.json` 和 `multiplayer-state.tap`；`accepted/index.json` 冻结全部 gate 日志/报告、交付 manifest、toolchain 的副本及哈希。构建工具仍输出 `reports/multiplayer/m01/<runId>/`，M02 证据目录按实际 runId 归档，不冒充新构建 profile。`releaseEvidence()` 真实通过，现有发布校验和性能预算均未降低。
- 失败与修复：`2026-11-01T00-13-27.083Z-ab1b22b1` 在冻结 M00 对比发现离线尸体期遗留花瓣轨道坐标变化；修复显式离线持久输入租期兼容分支，保留旧死亡/身体删除时的输入与轨道语义，成功重生仍无条件清空输入，原冻结预期不改。`2026-11-01T00-17-12.307Z-fed00421` 前 14 gate 通过，但 Chromium 被 macOS 沙箱拒绝 MachPortRendezvous；使用同一源码在沙箱外完整重跑，得到本次通过记录。两次原始失败 ledger/日志保留于 `failures/`。
- 规则或接口偏离及理由：保留旧离线 ABI 的无限输入租期，不将其用于原生多人默认入口；重生不新增区域计时重置。`same_input_sequence_is_independent` 是分别保存 received/applied 序号并调用真实领域输入的宿主夹具，不宣称 M05 网络会话已完成。v1 snapshot 仍消费 World 事件，只读多观察者复制留给 M04。
- 未解决问题与受影响后续阶段：M02 无阻塞；尚未创建提交。特殊花瓣/宠物/投射物的完整 PVP 归属、每连接复制、真实 WebSocket、容量及 Linux 发布按 M03—M08 继续实现，不能把本次进程内双玩家结果当成联网发布验收。
- 下一步：M03；控制根/物理 owner/伤害来源分离，完整多人战斗、拾取、掉落与生命周期回归。本轮未开始 M03。

## 7. M03 完成交接

- 阶段 / 任务编号：M03；MP-030—MP-034 全部完成，2026-11-01（Asia/Shanghai）。
- 实际提交：本轮为工作区实现，未创建 Git 提交；基准 HEAD 为 `611e99b1bdc715ca33b41763b642d41b8cefbd35`。`reports/multiplayer/m03/2026-11-01T01-54-57.347Z-2c94ac23/source-changes.json` 保存本轮文件内容和哈希，可从基准重建修改；基准 HEAD 不是 M03 提交号。
- 实现范围 / 文件：`model/entity*`、`world*`、`effect_payload.hpp` 与 `player_state.hpp`；`sim/{combat,damage,death,effects,petal_effects,petal_lifecycle,petals,pets,player,player_commands,species_attacks,targeting}.*`。物理 owner、控制根、DamageSource 值快照分离；PlayerId/LifeEpoch/昵称贯穿花瓣、宠物、投射物、DOT、子实体死亡和事件，源实体销毁或槽位换代不改写归属。经验显式接收 PlayerId；离场按持久身份清理孤立攻击和区域；效果 ID 属于各 World。
- 事务与规则：拾取按距离、PlayerId 确定唯一胜者，提交后的转移动画不重复发物品；死亡只结算一次，保留原掉落、尸体和重生时序。出生最多尝试 1000 次，无安全位置明确失败，不创建新生命；其他玩家仍继续模拟。来源、刷新键与控制根各自保存，保留同 owner 的 Honey/毒刷新和 Web 多实例叠加；效果遍历持有 payload，避免死亡回调清理子实体时悬空。详细接口和 38 个实际支持花瓣的逐项核查见 [玩法归属](../docs/multiplayer/gameplay-ownership.md)。
- 测试入口：新增 `engine/tests/unit/test_multiplayer_combat.cpp`（17 场景）、`test_multiplayer_lifecycle.cpp`（9 场景）及共享 `tests/support/gameplay.hpp`；两个目标仅链接 engine_core，接入 engine/server-native 封闭 CTest 清单、verification identity、原有 runner 与门禁，未创建替代验收入口。
- 执行命令：`npm run build:engine`、`node tools/run-tests.mjs engine`；完整验收使用 `FLORR_BOOST_ARCHIVE=/private/tmp/florr-boost-1.86.0.tar.bz2 CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell npm run test:all`；验收结束后执行 `CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell node tools/multiplayer-baseline.mjs`，两个独立进程与原冻结 JSON 精确一致。浏览器固定 `156.0.8078.47`，Boost 沿用锁定归档及校验。
- 内存安全：`cmake -S engine -B build/m03-sanitize -DCMAKE_BUILD_TYPE=Debug '-DCMAKE_CXX_FLAGS=-fsanitize=address,undefined -fno-omit-frame-pointer' -DCMAKE_EXE_LINKER_FLAGS=-fsanitize=address,undefined`，构建并执行 `engine_multiplayer_combat_tests`、`engine_multiplayer_lifecycle_tests`，26/26 通过，无 ASan/UBSan 错误；配置、构建日志、TAP 与二进制哈希见 `sanitizer.json` 及配套文件。
- 测试数量与结果：完整 **17/17 gate**，`passed=true`、`stable=true`；engine **16/16 CTest**，根构建 **21/21 CTest**；新增 **26/26** 场景，覆盖双方等级 1/5/6/10 的 16 组合、来源实际槽位复用、100 次死亡/重生（Egg/Peas/Web/effect）、双 World 的事件/分数/RNG/payload ID 隔离。Node/浏览器 **251/251**（40 单元、24 工具、102 客户端单元、4 跨端、81 浏览器），无失败或跳过；渲染 3 profile × 4 场景 × 5 次 × 600 帧、native/WASM 引擎及真实 Worker 跨端性能均通过，原预算未降低。
- runId：`2026-11-01T01-54-57.347Z-2c94ac23`；UTC 完成时间 `2026-11-01T02:11:01.032Z`；冻结 M00 重放 `m00-2026-11-01T02-11-33.290Z-28e31ca4`。
- source identity：产品 `27d71a09ea34fc71f3ca59e5c9474ea221335cf4a36dd1a333a4624e331fce48`；native `6eb1ce2ee48d87535bf53b96c4e80f98c3eb960855de5ea44d7d83539ecd73be`；verification `aab4f2a4b7b0b94a9e973de7a85df350ece1a08221f77407e23d7bb157b62646`。
- binary/client hash：native host `3097c2ae3100ed4808104adeb7e30c368c5f7f2ac87b71750be7b69842cb36b2`；WASM `b56a2740d0728be46eecf38e340bb57b2285f931bcfd9fd2d1f933ba5759606c`；client/wasm/static 组合身份 `c86ae6102ded4fabeaa7d7c3b68cc1ab084f05c893b8cdc084c6da8ed0bf84b1`。
- 报告路径：`reports/runs/2026-11-01T01-54-57.347Z-2c94ac23/run.json`、`reports/multiplayer/m03/2026-11-01T01-54-57.347Z-2c94ac23/{summary,build,ctest,baseline,sanitizer,source-changes}.json`、两份 `multiplayer-*.tap`；`accepted/index.json` 冻结全部 gate 日志/报告、交付 manifest 与 native toolchain 的副本及哈希。`releaseEvidence()` 校验真实通过；`reports/` 依现有策略不入 Git。
- 失败与修复：`2026-11-01T01-35-48.887Z-07f7397c` 因 macOS 沙箱拒绝 Chromium MachPort 而失败；使用同一固定浏览器在沙箱外运行。`2026-11-01T01-38-29.217Z-285209b1` 与 `2026-11-01T01-48-33.854Z-91ee816a` 在渲染采样阶段主动中断，分别补齐物理父实体销毁后的控制根保存，以及已销毁 DOT 来源向死亡子实体继续传递；随后以最终源码完整重跑。三次原始 ledger/日志和早期编译/测试记录保留于 `prechecks/`，不覆盖失败。
- 规则或接口偏离及理由：双方实际等级的本体系数在 M02 已按玩家读取，本轮增加全部组合断言，保留公式和仅玩家本体适用范围。保留花瓣之间不接触、目录数值、地图、50ms 步长及接触顺序，不新增玩家击杀 XP。Salt/Rice/Corn 目前仅有目录数值、普通轨道和接触，全部当前行为已覆盖；不声称新增按名称推测的反伤、特殊回充或额外被动。
- 未解决问题与受影响后续阶段：M03 无阻塞；尚未创建提交。本阶段仅完成原生同 World 玩法，v1 离线发布器仍消费事件；每连接只读复制、真实 WebSocket 与双浏览器在线入口分别留给 M04—M06，容量和 Linux 发布留给 M08。
- 下一步：M04；v2 schema/协议、冻结 TickChanges、每连接可见集与全量/增量复制。本轮未开始 M04。

## 8. M04 完成交接

- 阶段 / 任务编号：M04；MP-040—MP-044 全部完成，2026-11-01（Asia/Shanghai）。
- 实际提交：工作区实现，未创建提交；沿用前面阶段的工作区交接方式。
- 实现范围：`schema/multiplayer.yaml`、统一生成器/manifest 与生成的 C++/TS/docs；`net/{multiplayer_wire,tick_changes,replication_session,peer_session}.*`、只读 v1 publisher/Worker 统一 finish；PlayerState 的输入采用世代/序号与持久死亡视点；TS `NetworkSnapshotDecoder`；真实 native fixture、手工向量及产品测试清单。接口见 [复制交接](../docs/multiplayer/replication.md)。
- 执行命令：`npm run schema:generate`、`npm run schema:check`、`npm run build:engine`、`npm run build:client`、`node tools/run-tests.mjs engine`、`node tools/run-tests.mjs integration`、`node tools/run-tests.mjs client-unit`、`npm run test:unit`、`npm run test:tools`、`npm run test:multiplayer:baseline`。完整验收使用 `CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell npm run test:all`，固定 Chromium `156.0.8078.47`，沙箱外运行。
- sanitizer：`cmake -S engine -B build/m04-sanitize -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS='-fsanitize=address,undefined -fno-omit-frame-pointer'`；构建 `engine_replication_tests engine_multiplayer_protocol_tests`；`ASAN_OPTIONS=detect_leaks=0 ctest --test-dir build/m04-sanitize -R 'engine_(replication|multiplayer_protocol)_tests' --output-on-failure`。两项、12 场景全部通过。
- 测试数量与结果：完整 17/17 gate；独立 engine 18/18、根构建 CTest 23/23；Node/浏览器 259/259（41 单元、24 工具、106 客户端单元、7 跨端、81 浏览器），无跳过。新增原生 6 个协议 + 6 个复制场景；4 个 TS codec、3 个 native→TS 和 1 个 schema 归属测试。原有渲染、引擎和游戏循环性能预算全部通过。
- 覆盖：发布顺序交换/World 与 RNG 不变、共同删除/命中/拾取、远距离 AOI/移出重入/真实槽位换代、两种编码隐私、各自昵称/等级/owner、死亡与尸体删除后重连视点、控制 handle 重生、full/delta/resync/新连接全量、事件去重、输入接收与实际采用/TTL、未来窗口/非法前跳/回绕前拒绝、旧 session/跨 World/旧生命拒绝、命令有界幂等、超大全量与慢写队列不半提交。真实网络慢连接由 M05 继续验证。
- runId：`2026-11-01T02-58-18.343Z-05f8fff5`，`passed=true`、`stable=true`；M00 冻结摘要双进程重放 `m00-2026-11-01T02-54-16.925Z-73be6f4e` 通过。
- source identity：`a732fac5eb76efdf0e79d031ccb9ce81e575c41aeba82bbbc22946c7ef2627e3`；verification identity：`27ce40c1e97db2fa68d0389a12046a9dfaa2ae6926b850ad20e14567ada51361`；native source：`17d1e06bdbe1fca4b7dc0b6525611042da507996c4e96c013c58ec56d4f4cc41`。
- catalog hash：`9d66e1aff774927d6bc7cdc709f16913bda06e56fb5cdd52f3172aeedbe7f287`；WASM：`e974c275724e7135037f16beb2cab0c9ea4dcc66c0d082d0becc879aa56b6264`；delivery tree：`a0873b69b6220ab345021d3eeb161dd92976260697e91a792a75646005b6dc89`。新原生 fixture、测试和宿主的字节数/哈希记录在 summary 中。
- 报告路径：`reports/multiplayer/m04/2026-11-01T02-58-18.343Z-05f8fff5/summary.json`，同目录保存 sanitizer/基线日志及 SHA；完整账本 `reports/runs/2026-11-01T02-58-18.343Z-05f8fff5/run.json`。报告目录按仓库惯例不入 Git。
- 失败与修复：首轮 `2026-11-01T02-54-23.380Z-9cc25ec9` 的前 14 项通过，Chromium 因沙箱 MachPort 权限启动失败；失败账本保留，改为沙箱外完整重跑。macOS 不支持 `detect_leaks=1`，保留原日志并用 `detect_leaks=0` 执行 ASan/UBSan；sanitizer 还发现换代测试夹具在复制旧 handle 后再次用新 handle 查找返回 null，已改为复制前保存实体引用，修复前后日志均保留。未放宽任何预算或实体数值。
- 与计划的具体化：v2 增量粒度为变化实体的完整公开字段块，继续复用原字段 codec；每块固定内部 sequence=1/ack=0，并限制 2048 bytes/16 records。dense 仅公开 116/120/140/152 base。新增 counterDrainAt 预留 1024 个 u32 值用于排空；均为连接保护参数，见配置契约。网络调度前先落实了 PeerSession 的纯字节/领域命令契约；它不监听网络。
- 未解决问题：M04 无未解决阻塞。M05 仍需实现真实 WebSocket、Room/Connection 生命周期、crypto token/grace、限流、排空与日志；M06 仍需将真实浏览器 GameSession 接入网络。当前宿主仍是有限 tick smoke，本阶段不宣称已完成真实双浏览器联机或容量验收。
- 下一步：按主线进入 M05，消费既有 codec、PeerSession、TickChanges、ReplicationSession 和拥有缓冲写队列契约。
