# 多人联机执行跟踪

> M00—M08 已完成。状态只使用「未开始 / 进行中 / 已完成 / 阻塞」；阻塞必须说明具体依赖，不以预计进度代替实际结果。

## 1. 阶段看板

| 阶段 | 状态 | 实际提交 | 验收 runId/报告 | 备注 |
| --- | --- | --- | --- | --- |
| M00 基线与契约 | 已完成 | 回归/驱动修复 `2bb33bf`；架构契约 `07b36d9` | `2026-10-31T15-09-18.267Z-4432f606`；`reports/multiplayer/baseline/summary.json` | 15/15 gate；12 CTest + 249 Node/浏览器测试通过；失败记录保留 |
| M01 原生 core 边界 | 已完成 | 工作区实现，未创建提交 | `2026-10-31T23-43-46.442Z-f638c98a`；`reports/multiplayer/m01/2026-10-31T23-43-46.442Z-f638c98a/summary.json` | 17/17 gate；engine 13/13、根 CTest 18/18、Node/浏览器 251/251；20 tick smoke 与纯 core 双 World 通过 |
| M02 多玩家状态 | 已完成 | 工作区实现，未创建提交 | `2026-11-01T00-18-30.561Z-577c7708`；`reports/multiplayer/m02/2026-11-01T00-18-30.561Z-577c7708/summary.json` | 17/17 gate；engine 14/14、根 CTest 19/19、15 个 M02 场景及 ASan/UBSan；冻结 M00 摘要一致 |
| M03 PVP 与玩法归属 | 已完成 | 工作区实现，未创建提交 | `2026-11-01T01-54-57.347Z-2c94ac23`；`reports/multiplayer/m03/2026-11-01T01-54-57.347Z-2c94ac23/summary.json` | 17/17 gate；engine 16/16、根 CTest 21/21；26 个新增场景、100 次生命周期及 ASan/UBSan 通过 |
| M04 协议与复制 | 已完成 | 工作区实现，未创建提交 | `2026-11-01T02-58-18.343Z-05f8fff5`；`reports/multiplayer/m04/2026-11-01T02-58-18.343Z-05f8fff5/summary.json` | 17/17 gate；engine 18/18、根 CTest 23/23；12 个新增 native 场景、259 个 Node/浏览器测试与 ASan/UBSan |
| M05 原生网络服务 | 已完成 | 工作区实现，未创建提交 | `2026-11-01T09-57-01.230Z-e1098481`；`reports/multiplayer/m05/2026-11-01T09-57-01.230Z-e1098481/summary.json` | 17/17 gate；engine 18/18、根 CTest 28/28、259 个 Node/浏览器测试；29 个新增宿主场景及 ASan/UBSan |
| M06 联机客户端 | 已完成 | 工作区实现，未创建提交 | `2026-11-01T14-40-27.450Z-12bf3d91`；`reports/multiplayer/m06/2026-11-01T14-40-27.450Z-12bf3d91/summary.json` | 17/17 gate；engine 18/18、根 CTest 29/29、273 个 Node/浏览器测试；真实双浏览器 PVP 全程无 WASM/Worker |
| M07 延迟与预测 | 已完成 | 工作区实现，未创建提交 | `2026-11-02T11-11-30.262Z-39513c97`；`reports/multiplayer/m07/2026-11-02T11-11-30.262Z-39513c97/summary.json` | 17/17 gate；engine 19/19、根 30/30 CTest；16 组延迟对照与 250ms PVP，预测响应 p95 29.6—40.7ms |
| M08 验收与发布 | 已完成 | 本次 v2.0.0 发布提交 | `2026-11-02T19-49-24.133Z-e2008e5f`；`reports/multiplayer/current-verification.json` | 17/17 offline + 6/6 MP；12 项双浏览器、3×2×8 容量、100 生命周期、慢读者、30 分钟浸泡；package `2.0.0-e53b647e9821-…` |

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

- [x] MP-050：配置、依赖、监听、health/readiness 与异步 Connection。
- [x] MP-051：握手/连接绑定、输入与离散命令分离、限流和幂等。
- [x] MP-052：固定 tick/补帧/TTL/过载，RoomManager 容量与隔离。
- [x] MP-053：grace/token 轮换/旧连接失效/房间回收/有界停服。
- [x] MP-054：真实双 WebSocket、错误清理、指标与正式包无 cheat。

### M06：客户端

- [x] MP-060：Transport 注入、公开连接配置、连接状态机。
- [x] MP-061：InputPump/CommandResult，移除在线 think/flush。
- [x] MP-062：显式控制身份、selfState HUD、远端 owner 与死亡相机。
- [x] MP-063：全量重置、重连、后台标签页与错误 UI。
- [x] MP-064：双 BrowserContext 完整 PVP，真实入口无 WASM/Worker 请求。

### M07：延迟

- [x] MP-070：真实网络时钟、targetTick 与采用/TTL 反馈。
- [x] MP-071：远端按 serverTick 的快照缓冲/插值/有限外推。
- [x] MP-072：纯移动 C++/TS 契约及有界预测/重演/校正。
- [x] MP-073：死亡/重生/epoch 清理，RTT/抖动矩阵和实际体验报告。

### M08：交付

- [x] MP-080：清单/runner/gates/native identity/releaseEvidence 全部接入。
- [x] MP-081：真实 PVP 12 项验收与当前源码完整账本。
- [x] MP-082：2×8 容量、集中战斗、慢连接、100 次生命周期、30 分钟浸泡。
- [x] MP-083：联机打包、启动器、默认入口切换与离线 profile 边界。
- [x] MP-084：Linux 发行包、配对 manifest、TLS 代理/健康/排空/回退 smoke。
- [x] MP-085：更新产品文档/版本说明，记录最终容量与限制。

## 12. M08 完成交接

- 阶段 / 任务编号：M08；MP-080—MP-085 全部完成，2026-11-02/03（Asia/Shanghai）。
- 实际提交：`acf8a1f`（v2.0.0 主体）+ `4da62eb`（Linux/GCC 兼容修复）；tag `v2.0.0`。此前 M08 为工作区实现，未创建中间提交；`refactor-goals/` 不进入发布。
- 实现范围：`tools/verification/gates.mjs` 的 6 个 multiplayer gates、`tools/run-multiplayer-verification.mjs`、`tools/perf-multiplayer*.mjs`、`tools/verify-multiplayer-performance.mjs`、`tools/multiplayer-browser.mjs`、`tools/pack-native.mjs`、`tools/deploy-smoke.mjs`、`tools/prepare-multiplayer-release.mjs`；`multiplayerReleaseEvidence` 绑定 offline/multiplayer ledger 与 native package。在线交付 `dist-multiplayer` 由 `main-online.ts` 组成，`GameApp` 不再静态导入 Worker；离线测试显式注入 `LocalWorkerTransport`。部署示例在 `server/deploy/`，Linux workflow 在 `.github/workflows/multiplayer-linux.yml`。
- 执行命令：`npm run test:all`；`M08_REUSE_CAPACITY=… M08_REUSE_SOAK=… npm run perf:multiplayer`；`CHROME_PATH=… node tools/run-multiplayer-verification.mjs --profile all`；`npm run release:multiplayer`。测试固定 Chrome `156.0.8078.47`，容量/浸泡真实原生二进制 + 真实 WebSocket；浏览器 12 项真实双 BrowserContext。
- 测试数量与结果：offline **17/17 gate**（`ed3980a4`），engine 19/19、根 30/30 CTest，Node/浏览器 305/305；M08 **6/6 gate**，12/12 浏览器、100/100 lifecycle、慢读者有界关闭、3 次 2×8 容量、30 分钟浸泡全部通过。source identity `e53b647e9821a1ce5df734400e33a783ac206550bf3e4fb20ffb10e5d8627f5c`；native binary `a9789dfcf0e2877f8778ee32109955f843a98edca2033aadacc51b9e9f0bca34`。
- 容量：三次 15 分钟 2×8 的 room p99 **10.257/10.948/11.744 ms**，round p99 **17.428/17.184/18.306 ms**；均低于 20/25 ms。一个失败 attempt（`capacity-2-0`）有 1 个 round 服务端 CPU 样本 >50 ms，未计为通过；重试通过，原始失败报告保留。wall >50 ms 且进程 CPU <20 ms 的样本单列为宿主暂停，不冒充服务端工作；host pause 原始值仍在报告中。
- 浸泡：2×8 30 分钟（5 分钟预热）；RSS 中位数 66,863,104 → 69,926,912 bytes（+3.06 MiB，低于 16 MiB 允许值）；末/首实体 1,813/1,836（两房上限）；room p99 9.625 ms、round p99 16.910 ms。
- 交付：macOS `release/multiplayer/2.0.0-e53b647e9821-2026-11-02T19-49-24.133Z-e2008e5f`，98 files，server `a978…`，client 89 files/550,421 bytes，protocol 2，catalog `9d66e1aff774927d6bc7cdc709f16913bda06e56fb5cdd52f3172aeedbe7f287`；deploy smoke 8/8（health/readyz、drain、proxy switch、rollback）。Linux x86_64 CI run `41523376166`：`2.0.0-e53b647e9821-gh-41523376166-2`，98 files，server `bd1d296882ce004cae931b3c155ce3ec2cb3365fa3c9e1f93a1c806401a9cf77`，同 source/protocol/catalog，workflow 的 build/verify/package/deploy smoke 全部通过。`dist-multiplayer` tree `7b80867e626d328c21d9e975b5243453da6820e42fc00dc7d4dcab69ae6c704c`，无 WASM/Worker/dev 模块。
- 报告路径：`reports/runs/2026-11-02T20-32-45.860Z-ed3980a4/run.json`；`reports/multiplayer/runs/2026-11-02T19-49-24.133Z-e2008e5f/run.json`；`reports/multiplayer/{performance-summary,capacity/summary,browser-pvp,deploy-smoke}.json`；soak 原始/重校验 `reports/multiplayer/soak-final/soak/`。报告目录按仓库惯例不入 Git。
- 失败与修复：Linux GCC 13 对生成字段单行 `if` 报 `-Wmisleading-indentation`、对测试 CTAD `std::pair` 报硬错误、对 `100 + uint16` 报 sign-compare；分别用 CI 局部关闭该生成格式误报和显式 `TestCase`/`100u` 修复，未降低运行时门禁。浏览器首个 offline 回归仍按旧默认构造 `GameApp`，已显式注入 `LocalWorkerTransport`；`perf` 的 soak 标志漏传导致 RSS/实体检查未执行，补齐后重跑 30 分钟；实体检查曾把两房总实体与单房上限比较，改为乘房间数；suite 报告路径曾多一层 `reports/`，已固定为 `reports/multiplayer/runs/<runId>`；releaseEvidence 允许已单独校验的 `dist-multiplayer/build-manifest.json` 作为构建门禁证据。没有降低 p99/50ms/RSS/生命周期阈值。
- 未解决问题：macOS 宿主调度暂停会造成少量 wall 尖峰；Linux x86_64 包必须由 GitHub Actions 构建，不能用本地 macOS 包替代。会话仍是内存态，升级会中断在线房间。详细限制见 `docs/releases/v2.0.0-verification.md`。
- 下一步：推送 `v2.0.0` tag，等待 `.github/workflows/multiplayer-linux.yml` 产出 Linux x86_64 artifact，将 macOS/Linux 包与 `PUBLISH-MANIFEST.json`、`SHA256SUMS` 附到 GitHub Release。

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

## 9. M05 完成交接

- 阶段 / 任务编号：M05；MP-050—MP-054 全部完成，2026-11-01（Asia/Shanghai）。
- 实际提交：工作区实现，未创建提交；基准 HEAD 为 `b527a474113739bfea9a1e9c09c9dc92da904ab4`。归档 `source-changes.json` 保存修改文件内容及 SHA256，基准 HEAD 不是 M05 提交号。
- 实现范围：`server/config/default.json`、严格配置解析、`net/{listener,connection}`、Session、Room/RoomManager、可注入时钟调度器、系统随机 token、固定标签 metrics 与信号停服。单 `io_context` 串行拥有网络和领域状态；只在 tick 边界准入/解绑与执行命令，全房一次模拟、冻结、分别发布和统一清理。根 CMake、显式源表、native identity、产物清单及既有 native gate 均已接入。运行及配置见 [宿主说明](../server/README.md)。
- 身份与生命周期：Hello 前无玩家；房间容量包括 grace 身份；256-bit token 来自 `getentropy`，重连/在线接管保留 PlayerId、轮换 token 和 SessionEpoch，并创建全新复制基线。断线及 Leave 立即拒绝新输入，身体继续模拟，200 tick grace 到期统一清理；同名房间重建使用新 RoomEpoch。所有帧先完整校验再入队，输入/离散命令/聊天/控制消息独立限流。
- I/O 与运维：每连接一个 active read、一个 FIFO active write，拥有缓冲直到 completion；active+pending 发送字节上限 1MiB。握手、Hello、心跳、write、close 和停服均有单调墙钟期限，错误/取消/迟到回调统一一次 teardown。排空期间 `/healthz` 保持 200、`/readyz` 与新 `/ws` 返回 503，期限到达关闭全部任务。启动日志包含构建/协议/目录身份；日志和指标不记录 token、昵称、路径；正式服务不链接 Worker/cheat ABI，故障注入仅存在于测试 target。
- 执行命令：`npm run build:server`、`node tools/run-tests.mjs server-native`、`./build/native/server/florr_server --check-config`、`npm run test:multiplayer:baseline`。完整验收使用 `env 'CHROME_PATH=/private/tmp/florr-m05-chrome/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:all`，在沙箱外运行真实 socket/浏览器测试；Boost 继续使用锁定的官方 1.86.0 归档，Chromium 固定为 `156.0.8078.47`。
- sanitizer：根构建 `build/native-m05-asan` 使用 Debug、`-fsanitize=address,undefined -fno-omit-frame-pointer`；以 `ASAN_OPTIONS=detect_leaks=0:abort_on_error=1 UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1 ctest --test-dir build/native-m05-asan --output-on-failure -R '^server_(runtime_tests|network_tests|network_faults_tests|process_tests)$'` 执行四个目标，29/29 场景通过。macOS 不支持 LeakSanitizer，未宣称泄漏检测通过；实际编译选项、环境、可执行文件和日志哈希保存在 `sanitizer.json`。
- 测试数量与结果：完整 **17/17 gate**，`passed=true`、`stable=true`；独立 engine **18/18 CTest**、根构建 **28/28 CTest**；Node/浏览器 **259/259**（41 单元、24 工具、106 客户端单元、7 跨端、81 浏览器），无跳过。新增 runtime 13、真实 network 8、network faults 6、process 2，共 **29** 场景；Release 和 ASan/UBSan 均通过。原有 60 轮渲染、native/WASM 引擎和 5 轮跨端性能均通过，未放宽预算。
- 覆盖：fake clock 的 20Hz/4 tick 补帧上限/TTL/冷却/grace/空房回收；两房隔离；A/B 相同 inputSeq 分别生效与刷包不加速；真实双 WebSocket 各自控制身份/快照；重连死亡态/在线接管/token 竞争/旧世代拒绝；Origin、协议、损坏帧、超时、心跳、读写错误、慢连接、重复 close、晚到回调、计数耗尽；真实进程 SIGINT/SIGTERM 与有界排空。四个专用测试目标归并了计划中的运行时与网络测试，没有新增替代验收入口。
- runId：`2026-11-01T09-57-01.230Z-e1098481`；UTC 完成时间 `2026-11-01T10:13:47.724Z`。M00 冻结单玩家摘要重放 `m00-2026-11-01T09-56-25.040Z-d305534e`，两个独立进程均与冻结值精确一致。
- source identity：产品 `e182bf67184bb6a82b2a5627031c05088b122d61d42cfd250ca9a88ea6df2e99`；native `27f5e33115c709ecf4e6af2b29be2454f0f4f201910a08168ecf23036c380c88`；verification `ae8b6812da2ffcea0fb732462f0b83e4c24b952f649595762d6dc55aab4f7032`；依赖锁 `652d8b9eaa5ac6f86d7db807307c83d8fb6ebf2c82346b0072e5e36cac9b4037`。
- binary/client hash：native host `36933c386440b9576d5fc0d024e7889d20584b653e0d64ce9a22523b8cb977ff`；WASM `e974c275724e7135037f16beb2cab0c9ea4dcc66c0d082d0becc879aa56b6264`；client `1ad232c1a7336108de931b118a16b79e094eda47483c4c26d7aa5fb7c8d997aa`；delivery tree `8815dc53a20e14a34a2c3cad367cdaba171cf4da4c6dc968862184555383a15d`。
- 报告路径：`reports/multiplayer/m05/2026-11-01T09-57-01.230Z-e1098481/{summary,build,ctest,baseline,sanitizer,source-changes,browser-environment}.json` 及四份场景 TAP；`accepted/index.json` 冻结所有 gate 日志/报告、交付 manifest、native toolchain/编译命令及哈希。完整账本为 `reports/runs/2026-11-01T09-57-01.230Z-e1098481/run.json`；`releaseEvidence()` 校验有效。报告目录按仓库惯例不入 Git。
- 失败与修复：`2026-11-01T09-24-34.325Z-f28d00cb` 因系统 Chrome 自动升级为 `.74` 而与 `.47` pin 不符，使用官方同版本 CfT 修复，未改版本约束。`2026-11-01T09-39-15.811Z-0399303a` 在渲染阶段主动中断，用于修复排空期间 HTTP 探针被提前拒绝，并补真实 socket 回归后完整重跑。ASan 下创建房间触发合法过载 503，测试客户端仅对显式 503 有界重试，服务端保护保持原样。另修复计数耗尽清理后重算条件导致房间残留，加入边界断言。失败 ledger 和原日志保留于 `reports/multiplayer/m05/failures/` 与对应 run 目录。
- 规则或接口具体化：未改变玩法数值、地图、50ms 步长或接触顺序。M04 的 Leave 改为产生宿主生命周期请求，由 Room 执行 grace，避免立即移除身体造成退出免伤；输入接收层立即停止。调度器丢弃超额墙钟积压但不虚增模拟 tick。调度器采用 header-only 可注入实现；四套测试按职责归并，全部进入既有清单。默认 Origin allowlist 为空、`allowMissingOrigin=false`；开发/原生测试必须显式配置。
- 未解决问题与后续阶段：M05 无未解决阻塞。当前浏览器产品仍走离线 Worker，真实在线 GameSession、双浏览器 PVP 属于 M06；网络延迟处理属于 M07；默认仍为每房两人、最多两房，2×8 容量、Linux 发行包、TLS 代理和生产交付属于 M08。本阶段没有宣称这些后续验收已完成。
- 下一步：M06，按现有 v2 协议实现 NetworkTransport、连接状态机、InputPump、重连和真实双浏览器入口。

## 10. M06 完成交接

- 阶段 / 任务编号：M06；MP-060—MP-064 全部完成，2026-11-01（Asia/Shanghai）。
- 实际提交：工作区实现，未创建提交；保留进入本轮时已有的 M05 改动。基准 HEAD 为 `b527a474113739bfea9a1e9c09c9dc92da904ab4`；归档 `source-changes.json` 保存完整工作区修改文件内容及 SHA256，基准 HEAD 不是 M06 提交号。
- 实现范围：`net/{transport,websocket,multiplayer-codec,connection-config,local-worker}.ts`、`app/input-pump.ts` 与 GameApp/GameSession/SimulationLoop；WorldState/DeathLifecycle、HUD/相机/远端 owner/昵称和装备命令。默认 NetworkTransport，`connection.json` 承载公开配置，`?profile=offline` 显式使用离线适配器；在线失败不切换 profile。`serve.mjs --server` 只覆盖公开运行时端点，普通入口不构造 Worker，不请求 WASM，不安装 `?test`/`?cheat` 离线权限入口。运行与接口见 [网络客户端契约](../docs/multiplayer/network-client.md)。
- 输入与连接：50ms 独立 InputPump，不调用在线 think/flush/step；Input/Command 分别编号，CommandResult/五秒超时/128 条队列和 1MiB 发送缓冲有界。首个合法 full 后 connect 完成；损坏包/缺口原子保留旧状态并请求一次有界 resync。socket generation、epoch、token 轮换、0.5/1/2/4 秒退避、终态错误和 leave/dispose 清理已实现；blur/hidden 中立输入、服务端 TTL、focus/visible resync 均实测。
- 本地身份：PlayerId/controlledHandle 显式绑定，自己的身体暂缺时不选取远端玩家。等级/经验/分数/装备/recharge/相机/死亡/冷却来自 selfState；远端公开 owner/slot/instance、昵称和动作独立。full/新生命清理 decoder、实体/事件与视觉历史；旧生命命令取消，对手拾取/死亡不触发本地 HUD/死亡界面。
- 真实闭环：专用 `server_browser_fixture` 链接同一 runtime/core，固定出生点和目录装备，不增加公开 debug RPC。两个独立 BrowserContext 从真实 main/index 启动，用正常键盘意图完成移动、攻击、防御、接触击杀、掉落、死亡、重生和恢复；另一个房间验证快照/聊天隔离。B 重生保留 PlayerId、更新 handle/LifeEpoch；恢复保留身体、轮换 SessionEpoch 并取新 full；A 持续推进且不跳到 B。停止输入泵不停止 server tick。普通 serve.mjs 入口另有真实 smoke。
- 执行命令：`npm run build:client`、`npm run build:server`、`npm test`、`node tools/run-tests.mjs client-unit`、`node tools/run-tests.mjs client`、`node tools/smoke-entrypoints.mjs`、`npm run test:multiplayer:baseline`；完整验收为 `env 'CHROME_PATH=/private/tmp/florr-m05-chrome/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:all`。真实 socket/Chromium 在沙箱外运行，版本继续固定为 `156.0.8078.47`，未修改版本 pin。
- 测试数量与结果：完整 **17/17 gate**，`passed=true`、`stable=true`；独立 engine **18/18 CTest**、根构建 **29/29 CTest**；Node/浏览器 **273/273**（41 单元、24 工具、118 客户端单元、7 跨端、83 浏览器），无跳过。新增 12 项客户端单元、2 项真实浏览器测试及 1 项原生 fixture 检查，全部进入既有清单和门禁；适用 Canvas/UI/触控/资源释放回归继续通过。原有 60 轮渲染、native/WASM 引擎及 5 轮真实 Worker 跨端性能全部通过，采样和预算不变；这些离线性能数据不冒充在线容量认证。
- runId：`2026-11-01T14-40-27.450Z-12bf3d91`；UTC 完成时间 `2026-11-01T14:57:28.034Z`。M00 冻结摘要双进程重放 `m00-2026-11-01T14-29-45.987Z-e5626cff` 通过。
- source identity：产品 `6dad2836f50b6b0071201dcdbbee8530b21fc5eb6adcf089b283b6bdb7205e6a`；native `d25a1c65b584440d09f92f4ed42d005e0bc1c3903cec8d3c79d89e6d37f98f66`；verification `fd490fd3684f8ba3c1b9c8e51e6fb9fb9980e74d94fda462fbafb3832bba5a5f`。
- binary/client hash：native host `27d4f0409dd59515580788b92e936541b9c28b96ecb85ec2dd475c6b1270293a`；browser fixture `b879e8ddadd57975b99c1735f1ba9359479de282c2ca918d89018e8354a6ecbd`；WASM `e974c275724e7135037f16beb2cab0c9ea4dcc66c0d082d0becc879aa56b6264`；client `5734350f6fbb839a7cab0fff2f433731c0e521f1bb5994cdd2bf1bbd1ddd50cb`；delivery tree `5e26a563e0516b76d7f7f5b1d7346f78557e267bbeebf19bc854f559fddf9fc0`。
- 报告路径：`reports/multiplayer/m06/2026-11-01T14-40-27.450Z-12bf3d91/{summary,build,ctest,baseline,browser-pvp,entrypoint-smoke,source-changes,browser-environment}.json`、截图与日志；`accepted/index.json` 冻结所有 gate 日志/报告、交付 manifest、native toolchain/编译命令及哈希。完整账本为 `reports/runs/2026-11-01T14-40-27.450Z-12bf3d91/run.json`；`releaseEvidence()` 校验有效，浏览器 PVP 报告的 runId/source/native 产物与本次账本绑定。报告目录按仓库惯例不入 Git。
- 失败与修复：普通沙箱监听遇到 EPERM，改为沙箱外执行。实现期发现 Playwright 1.49 的 waitForFunction 不等待 async predicate，改为同步观察真实 app；固定接触时长会在正常击退后错过目标，测试改用公开位置和普通键盘追踪。首轮完整验收 `2026-11-01T14-34-15.391Z-17060a11` 为 82/83 浏览器通过，失败发生在重生首包早于 fixture 定位、相机尚未到达固定点；验收改为等待权威位置与实际画面一致，并显式等待重连新 full 基线。未改变玩法、超时预算或用 fake transport 代替 PVP；原 ledger/TAP/当时测试源码和观测保留在 `reports/multiplayer/m06/failures/`。
- 规则或接口具体化：字段投影复用 M04 的生成 codec/NetworkSnapshotDecoder，私有 enrichment 集中在 WorldState，无需复制修改旧 v1 snapshot-projection/net/input。现有离线资产继续显式保留，默认在线路径不加载。Input targetTick 暂取最近收到的 serverTick + 1；自动恢复采用默认 grace 的十秒保守上限，更短期限由服务端拒绝，更长期限不延长客户端重试。
- 未解决问题与后续阶段：M06 无未解决阻塞。网络时钟、采用反馈、快照缓冲与本地移动预测属于 M07；Linux/TLS 代理发布、2×8 容量、30 分钟浸泡和版本发布属于 M08，未宣称这些验收通过。
- 下一步：M07，按服务端 tick 建立网络时钟、远端快照缓冲和纯移动预测/校正，保留当前权威生命、伤害、掉落与命令边界。


## 11. M07 完成交接

- 阶段 / 任务编号：M07；MP-070—MP-073 全部完成，2026-11-02（Asia/Shanghai）。
- 实际提交：工作区实现，未创建 Git 提交；保留进入本轮时已有修改。`reports/multiplayer/m07/2026-11-02T11-11-30.262Z-39513c97/source-changes.json` 保存基准 HEAD、完整修改文件内容和 SHA256；`reports/multiplayer/m07/entry.patch` 保存进入本轮时的 tracked diff，基准 HEAD 不是 M07 提交号。
- 实现范围：schema 生成独立 motion C++/TS 常量，selfState 增加真实 position、f64 velocity/acceleration、慢速倍率、身体半径与边界；快照区分 received/adopted seq、实际采用 tick、有效意图与 TTL。Pong 返回宿主单调时间和真实模拟时间；客户端滚动采样 RTT/偏移，targetTick 不再依赖最近收到的快照。接口见 [延迟与预测](../docs/multiplayer/latency-and-prediction.md)。
- 插值 / 预测：每 handle 最多 8 份 tick 排序样本，初始 100ms、自适应 50—200ms 延迟，最多外推 50ms 后冻结。纯移动契约保留 f32 narrowing、f64 速度、摩擦分组、慢速与夹取的实际顺序及中间 dirty 标记。输入历史最多 256 条，按阶段合并、迟到映射和采用 ACK 重演最多 4 tick；小显示偏移至多 100ms 衰减，超过身体半径直接对齐。缓存超限 / 持续超出前瞻范围清环并请求一次 resync。
- 生命周期：full、死亡、body 删除、重生、断线 / 离开及房间 / 会话换代清理输入和对应历史。相机与健康本地身体共用显示位置；自己的附着花瓣只有限平移。权威实体表、血量、掉落、装备与交互权限不由预测修改。修复 retained death transform 查询已删除 handle、旧生命死亡快照中断重生入场，以及 Spawn 确认被自身 LifeEpoch 换代取消的竞争。
- 执行命令：`npm run schema:generate`、`npm run build:engine`、`npm run build:server`、`npm run build:engine:wasm`、`npm run build:client`、`npm run build:dist-next -- --skip-build`、`node tools/run-tests.mjs client-unit`、`node tools/run-tests.mjs integration`、`npm run test:multiplayer:baseline`；完整验收为 `env 'CHROME_PATH=/private/tmp/florr-m05-chrome/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:all`。固定 Chrome `156.0.8078.47`，真实 socket / 浏览器在授权的沙箱外运行。
- 测试数量与结果：完整 **17/17 gate**，`passed=true`、`stable=true`；独立 engine **19/19 CTest**、根构建 **30/30 CTest**；Node / 浏览器 **301/301**（41 单元、24 工具、140 客户端单元、9 跨端、87 浏览器），无跳过。8 类纯移动轨迹共 640 步，C++ 与提取前独立计算精确相同，TS 位置精确一致、f64 速度容差 1e-14；ASan/UBSan 的 motion/protocol/replication 3/3 通过。冻结 M00 双进程重放继续匹配。原有 3 profile × 4 场景 × 5 次 × 600 帧渲染及 native/WASM/Worker 性能预算通过，未减少采样或放宽预算。
- 延迟实测：0/80/150/250ms RTT × 0/±20ms RTT 抖动 × 预测开关，共 16 组，128 次真实按键。预测开启的 DOM 事件到完成绘制的身体位移 p95 **29.6—40.7ms**；关闭预测为 **141.9—324.5ms**。250ms RTT 停止后最慢 **580.0ms** 收敛至距最新权威轨迹 ≤1 world unit，且必须先收到松键中立输入的实际采用 ACK；最终位置误差最大 0.000533。16 组实际 render CPU p95 最大 **2.5ms**（原预算 8ms）；逐组 RTT、server processing、误差 / 校正次数与距离、CPU、缓存深度、resync 和恢复均保存于 matrix。
- 真实闭环：250ms RTT、±20ms 抖动下，预测 on/off 两组均通过完整双 BrowserContext 移动、攻击、防御、死亡、掉落、重生、恢复和两房隔离；权威血量始终等于 decoder 数据。每场两名观察者使用相反预测设置，下一场互换；双方同一 serverTick 的血量和掉落逐项一致。两场胜负摘要一致：胜者 Alice、败者 health=0、重生 LifeEpoch=2、房内人数=2。300ms 有序流阻塞与 socket 中断后恢复新 SessionEpoch / full；离开后计时器、预测和快照历史归零，在线无 Worker/WASM 请求。额外 40/40 次真实首次入场通过。
- runId：`2026-11-02T11-11-30.262Z-39513c97`；UTC 完成时间 `2026-11-02T11:32:01.607Z`。产品 source identity：`364c828404aa7a8de86ec21e1cfec0d4d7a06aa7f72049df02db44c65bfccabd`；verification：`c0c4fc6f21fd91417d988f7004938238a8d7d72b39abd402e538ed15c93f34fd`；native source：`0c091be94dd18075771a1223de1f9f68c59430ab35d700a7d3fc1ecc3603d8d0`。
- binary/client hash：native host `ae645f9f18d57fbaac174b479a644c132d18d0574cf04bb2cdfeecbee2571ee3`；browser fixture `1f049da57016b9794f98388edd0ec7ecdc796af3b4ca350ab85c54060e89f65e`；WASM `53ca5377524f099c30a855d028c107962013cafe47a3cbcda4559c6eaf536414`；client/wasm/static `983c7ad69e8cc3ca3c5c5e3cae7141b917e27148d35a26ae1c09262e2ef4bc03`；delivery tree `9d3b8e38b8d6cc8bd3a6a76974f11643bff823470e7d7b6d2c52337ba3cd817c`。
- 报告路径：`reports/multiplayer/m07/2026-11-02T11-11-30.262Z-39513c97/{summary,build,ctest,baseline,latency-matrix,pvp-on,pvp-off,sanitizer,source-changes}.json`；`accepted/index.json` 冻结 gate 日志、报告、交付 manifest、native toolchain、编译命令及哈希。完整账本为 `reports/runs/2026-11-02T11-11-30.262Z-39513c97/run.json`；`releaseEvidence()` 真实通过，M07 matrix/PVP 报告纳入该账本的哈希校验。报告依仓库惯例不入 Git。
- 失败与修复：早期事件定时器提前触发而丢失待发送意图，实测 p95=62.7ms，改为按截止时间重排；提取移动时一度漏掉边界夹取前的位置 dirty 标记，原 peer visibility 回归发现并修复。第一次完整验收 `2026-11-02T10-30-35.776Z-3ea5ecaf` 为 85/86 浏览器通过：延迟代理逐块独立计时器会乱序转发字节，真实 TCP 双向字节比较复现失败；改成每方向单一有序队列并加入逐字节回归。它还暴露 Spawn 生命周期竞争，补齐确认先后两种顺序回归。第二次 `2026-11-02T10-42-05.520Z-6303c2c7` 的 87/87 浏览器及矩阵通过后，主动在渲染性能首轮中断，强化停止收敛的中立输入采用 ACK 条件。第三次 `2026-11-02T10-48-09.747Z-d3442dce` 的 85/87 浏览器通过，250ms 一组仅记录 7/8 次停止：驱动在 600ms 后已发下一输入，短于 1 秒验收预算；改为每次观察 1100ms，仍严格拒绝超过 1000ms 的收敛；同轮另有一次 native fixture 排空 hook 达到原有 5s 截止时间，后续独立 PVP 与最终全量通过，未放宽截止时间。第四次 `2026-11-02T11-07-13.785Z-d008387f` 在根 CTest 为 29/30：既有 slow-consumer 注入整 MiB 时仍有普通快照 / 排行榜待写；测试改为填满剩余容量，仍断言总量恰为 1MiB 且多 1 字节拒绝，20 次重复通过，生产上限不变。PVP 扩展对照曾错误要求不同实时战斗的随机掉落完全相同，实测出现 [19,25,25] 与 [25,25,25]；现改为同一共享战斗、同一 serverTick 的预测开关观察者严格比较，保留每场随机结果，并互换角色模式重跑。开发期还保留错误使用旧 dist 的一次失败，随后核对构建退出状态并重建；所有失败 / 中断 ledger、TAP、矩阵、相关原始源码与观察保留在 `reports/multiplayer/m07/failures/` 及同级 attempt 日志。
- 规则或接口具体化：预测环保存输入、seq / 计划阶段，并按当前权威基点重算至多 4 tick；当前预测状态按渲染时刻缓存，不为每个被合并 packet 保存独立状态，避免把包数当 tick 数。开发中 v2 字段布局已扩展，旧 v2 客户端 / 服务端须配套重建；没有改变领域玩法数值。随机掉落保持原有 RNG 时序，不人为固定死亡抽样；同 tick 对照证明预测不改权威结果，跨独立实时战斗只比较可重复的胜负 / 身份事务。离散权威状态在对应快照 / 事件 receipt 原子应用，不等待视觉 delay。
- 未解决问题与后续阶段：M07 无未解决阻塞。实际网络测试使用同机原生服务和有序 TCP 字节流延迟 / 抖动代理，不声称完成运营商网络或真实丢包重传认证；动态碰撞 / 击退仍接受服务端校正，没有命中回溯。Linux/TLS 发布、2×8 容量与 30 分钟浸泡留给 M08。
- 下一步：M08，按当前实际能力执行独立多人验收、容量和生命周期压力、Linux 配对发布包与 TLS 代理 / 健康 / 排空 / 回退。

### 11.1 M07 后续修复：正常游玩画面抖动（2026-11-02）

- 已修复整 50ms 预测状态直接显示导致的停顿跳动：显示按估计模拟时间在相邻固定步之间插值，并移除额外提前的一步；包含插值端点的重演仍不超过 4 tick。时钟偏移 / 自适应 delay 渐进校准，自身花瓣以同缓冲时间的身体坐标计算有限平移。物理数值和服务端代码保持本阶段已验收版本。
- 新增持续移动浏览器回归进入 client-integration / delivery 清单、源码身份和浏览器 gate 报告，补齐原首次响应 / 最终收敛测试遗漏的中间连续性。0/80/250ms RTT、预测开关共 6 组，996 个稳定移动帧间隔，身体 / 相机停顿及回拉均为 0；修复前预测开启时约 66% 帧间隔停顿。
- 定向回归：143/143 客户端单元、88/88 浏览器、41/41 协议 / schema 单元、24/24 工具、9/9 跨端，合计 305 项通过；16 组延迟矩阵及 250ms RTT 双浏览器 PVP 继续通过。预测响应 p95 31.5—42.6ms，停止收敛最大 571.8ms，render CPU p95 最大 2.4ms。已重新构建 / 校验 `dist-next`，未重新执行整套 17 gate 发布 / 离线性能认证。
- 报告：`reports/multiplayer/jitter-fix/summary.json`，记录 `jitter-fix-2026-11-02`、源码 / 构建身份及日志哈希；同目录保留 `before.json`、`smoothness.json`、`latency-matrix.json`、PVP 和单元 / 浏览器日志。历史 M07 完整验收目录保持原样。
