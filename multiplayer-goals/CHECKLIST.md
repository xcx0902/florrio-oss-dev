# 多人联机执行跟踪

> M00 已完成；M01—M08 尚未开始。状态只使用「未开始 / 进行中 / 已完成 / 阻塞」；阻塞必须说明具体依赖，不以预计进度代替实际结果。

## 1. 阶段看板

| 阶段 | 状态 | 实际提交 | 验收 runId/报告 | 备注 |
| --- | --- | --- | --- | --- |
| M00 基线与契约 | 已完成 | 回归/驱动修复 `2bb33bf`；架构契约 `07b36d9` | `2026-10-31T15-09-18.267Z-4432f606`；`reports/multiplayer/baseline/summary.json` | 15/15 gate；12 CTest + 249 Node/浏览器测试通过；失败记录保留 |
| M01 原生 core 边界 | 未开始 | — | — | — |
| M02 多玩家状态 | 未开始 | — | — | — |
| M03 PVP 与玩法归属 | 未开始 | — | — | — |
| M04 协议与复制 | 未开始 | — | — | — |
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

- [ ] MP-010：拆 `engine_core` / `engine_worker_adapter` 源表与链接关系。
- [ ] MP-011：根 CMake + server target + 有限 tick smoke。
- [ ] MP-012：共享初始化/RNG 契约、纯 native 链接与双 World 回归。
- [ ] MP-013：native 源码身份/依赖锁定接入；旧 ABI/Worker 回归通过。

### M02：多玩家

- [ ] MP-020：PlayerId/State/Registry 与 handle 反向索引。
- [ ] MP-021：profile/loadout/input/death/zone/respawn 字段迁移。
- [ ] MP-022：出生、输入、恢复生命和控制显式指定玩家。
- [ ] MP-023：按模拟阶段遍历全部玩家，世界只推进一次。
- [ ] MP-024：destroy/离线适配/重复出生/换代回归。

### M03：PVP

- [ ] MP-030：控制根、物理 owner、击杀来源分别建模。
- [ ] MP-031：装备、花瓣、宠物、投射物、DOT 与治疗归属隔离。
- [ ] MP-032：双方实际等级伤害、真实击杀经验/昵称。
- [ ] MP-033：唯一拾取、死亡掉落、尸体、重生事务与生命周期回归。
- [ ] MP-034：原生双玩家完整对战闭环及两 World 隔离。

### M04：协议和复制

- [ ] MP-040：v2 schema/生成/手工字节与 native→TS fixture。
- [ ] MP-041：Room/Session/Life epoch、控制 handle、selfState、输入采用确认。
- [ ] MP-042：冻结 TickChanges、只读发布、统一清理、发布顺序不影响世界。
- [ ] MP-043：每连接 AOI/baseline/full/delta，公开/私有字段分离。
- [ ] MP-044：重入、损坏包、resync、慢连接和回绕边界测试。

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
