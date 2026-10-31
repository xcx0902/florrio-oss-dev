# M00 基线证据

日期：2026-10-31（Asia/Shanghai）。起点提交：`e99d816d05bbed036f594aacf5437b22ae3b0aaa`；开始时工作区干净，无用户改动需要保留/重置。M00 不改游戏领域实现、当前产品入口或原生/离线玩法数值。

## 当前验收记录

完整命令为 `npm run test:all`，没有复用以前的 passed JSON。初次运行 `2026-10-31T14-41-57.971Z-9188f20b` 的前 12 gate 通过，第 13 gate 在受限环境启动系统 Chrome 时失败；环境同时记录系统 Chrome 为 `156.0.8078.74`，不满足仓库固定的 `156.0.8078.47`。这发生在修改任何产品/测试源码之前，属于环境问题，不能称为通过。

原失败保存在 `reports/multiplayer/baseline/initial-failed-run.json`、`test-all.log` 和对应 `reports/runs/<runId>/` 日志，没有覆盖。随后找到本机已预置的固定版本 headless shell，以该 executable、允许浏览器启动的进程权限重跑，未修改 `.chromium-version` 或放宽校验：

```sh
CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell npm run test:all
```

固定浏览器重跑 runId：`2026-10-31T14-43-15.420Z-c9c64049`。该次前 14/15 gate 通过，最后 integration performance 完整完成 600 帧 × 5 次采样、无浏览器错误、源码/交付身份稳定，但第 2 次重生后立即读取到 `lifecycle.pending=1`，其余四次为 0，所以仍为 **FAIL**。CPU/解码预算本身满足；不能把它称为通过，也不降低 pending=0 门槛。原报告及性能数据冻结在 `pinned-failed-run.json` 与 `failed/<runId>/`。浏览器路径是本机证据，不是产品默认配置。

原因是性能驱动在重生可见后继续运行 50ms 生产者，却在任意时刻采样 pending。M00 修复 `tools/performance/browser.mjs`：所有计时采样和生命周期操作完成后才 freeze，等待真实在途请求排空，且 UI 错误仍抛错；不写死 pending=0、不削减帧数/重复数/预算。`client/tests/integration/worker-rpc.test.mjs` 用延迟发送的真实 Worker step 与注入的错误 completion 验证成功排空和失败拒绝，两条新回归连同原有 3 项共 **5/5** 通过。

`2026-10-31T15-03-14.015Z-7803cb3f` 是补齐错误完成保护前主动中断的重跑，保留 `guard-interrupted-run.json` 和 `test-all-before-error-guard.log`，不当成验收成功。修复后的最终源码已重新完整运行全部 15 gate，结果为 **PASS**，详见下一节。

两次完整运行开始时的 source identity 为 `11acc5cc354b70dc5bb4c738337f52c8c4f4e4fdc101802758a027c3b72d5a30`；verification identity 为 `b15461bfcb68d26e8850b004c4cbb6c150999d76132c0551dacff95f83398dcc`。环境文件记录 Node 24.13.0、npm 11.6.2、CMake 4.2.1、Apple Clang 21.0.0、Emscripten 6.0.10-git（满足版本 pin）及两种浏览器的实际版本。

## 最终验收与交付身份

最终完整 runId 为 `2026-10-31T15-09-18.267Z-4432f606`，于 2026-10-31 23:24:53 +08:00 完成，**15/15 gate 通过，passed=true、stable=true**。该次从构建、打包到全部性能验收使用同一份源码、校验输入和交付物；完成后的文档收尾不改变这些输入身份。实现提交为 `2bb33bf`，架构契约提交为 `07b36d9`。

| 测试集合 | 实际通过 / 总数 | 失败 / 跳过 |
| --- | ---: | ---: |
| native CTest 目标 | 12 / 12 | 0 / 0 |
| schema / protocol 单元测试 | 40 / 40 | 0 / 0 |
| 工具测试 | 22 / 22 | 0 / 0 |
| 客户端单元测试 | 102 / 102 | 0 / 0 |
| 跨端集成测试 | 4 / 4 | 0 / 0 |
| 浏览器场景测试 | 81 / 81 | 0 / 0 |

Node/浏览器测试合计 **249/249**；native 数量是 CTest 目标数，不与目标内部断言数混算。浏览器性能保留 12 个场景组合、600 帧 × 5 次重复；引擎性能与实战生命周期性能均通过。最终 5 次实战采样均完成装备、死亡和重生，实际排空后 `pending=0`，未放宽预算或完整性要求。

| 身份 | SHA-256 |
| --- | --- |
| source | `e4cbf0db8ad7a772573f79f6b29b4a1e58a890b6fa02774aac34a05d16cc179b` |
| verification | `13aa984b7907ba441a6e62836f7901e314b2eede33136c80e5343c497c36fc2a` |
| client | `22991fe6843f62bec81145e6b2a2ef2ae9fe0b081fc336481549c04cc6992d99` |
| 交付目录 | `852dce0b119d114d4897993b8983f1c4ded6b044c2c91e194a876340453b18d0` |
| WASM | `39e22812dc79b79e1bf32ea91e65e64729b3e511c2b2979ff8070c93a3040cb4` |
| native 场景可执行文件 | `6548015174b9a7a6c2fa86215ac6fc7456d9cb05daba417ac47f255b3d1e35bc` |

最终 ledger 保存在 `reports/multiplayer/baseline/accepted-run.json`；它引用的 TAP、入口 smoke 和三类性能报告另存到 `accepted/2026-10-31T15-09-18.267Z-4432f606/`。该目录 `index.json` 保存原路径、SHA-256 与各 gate 的日志哈希，避免后续运行覆盖顶层性能报告而丢失证据。阶段 `summary.json` 已标记 complete/passed，并关联全部三次失败/中断记录，未用成功覆盖历史。

## 原生单玩家领域场景

M00 在扩展测试清单前，用当前 native Release `engine_core` 库录下固定输入场景，并在两个全新进程中重放得到完全一致结果。原记录为 `reports/multiplayer/baseline/original-single-player.json`，带初始 M00 runId、起点源码身份、平台、编译参数、场景驱动/可执行文件/library SHA-256 和 complete/passed 标记。

句柄初始化 LCG seed=0，game seed=285456437；进入死亡分支前显式改 game seed=47、death shuffle seed=1，关闭自动补怪以隔离场景。真实 Worker opcode6 出生、opcode12 移动、领域 `damage_entity` 处理怪物/玩家伤害与 XP、opcode3 自杀，再按 50ms think 推进尸体/出生冷却，以 opcode6 重生。战斗步骤直接调用共用领域 API，不声称覆盖双玩家接触或网络。

| 检查点 | tick / ms | 等级 | 活跃实体 | game RNG / draws | 死亡掉落 typeId（登记顺序） |
| --- | --- | ---: | ---: | --- | --- |
| spawn | 0 / 0 | 1 | 6 | 203103298 / 3 | — |
| movement | 10 / 500 | 1 | 6 | 823971322 / 63 | — |
| combat | 10 / 500 | 1 | 7 | 1368621272 / 70 | — |
| death | 10 / 500 | 30 | 10 | 433348016 / 17 | 34, 15, 19 |
| corpse-removed | 30 / 1500 | 30 | 8 | 1641471394 / 137 | 34, 15, 19 |
| cooldown-blocked | 49 / 2450 | 30 | 8 | 1975982756 / 251 | 34, 15, 19 |
| respawn | 50 / 2500 | 22 | 15 | 807195693 / 260 | 34, 15, 19 |

死亡阶段设置 level=30、16 件固定携带物、score=1234.5 与 XP=2.5，以覆盖既有死亡保留/降级规则；这些是测试注入，不是产品数值修改。夹具记录每个活跃实体的 handle/kind/type/owner/坐标 f32 bits/health bits/maxHealth bits/death 状态，以及 profile/loadout、死亡保留物、RNG 各流。比较显式领域值，不比较对象地址、struct 字节或 padding；u64 RNG 状态存十进制字符串避免 JS 精度损失。

## M00 可重跑回归

新增场景源码归属 `tests/fixtures/product/multiplayer/single_player_baseline.cpp`，冻结的观测值归属同目录 `single-player.expected.json`。`engine_single_player_baseline_tests` 注册到 CMake/engine.expected；`tests/integration/single-player-baseline.test.mjs` 注册到现有 integration suite，以两次 native 输出对比完整冻结夹具。没有新增空 suite 或 skip 多人测试。

```sh
npm run test:engine
npm run test:integration
npm run test:multiplayer:baseline
```

最后一条是 **M00 新增已实现** 的单玩家证据入口：先 native build，再 `tools/multiplayer-baseline.mjs`；生成新 runId 的 environment/single-player 报告及顶层 `single-player.json` 索引。每份记录包含当前 source/verification identity、Release 配置、平台、种子、binary/library/fixture hash、两次重放及完整性结果；不能用它替代 `test:all` 或未来多人 gate。冻结夹具没有自动更新命令，修改必须说明领域行为/规则变化。

M00 增加测试/CMake/npm 编排后 source/verification identity 已改变；最终单玩家重放 runId 为 `m00-2026-10-31T15-08-52.986Z-cc65dce1`，使用与最终完整验收完全一致的 source/verification identity，两次独立进程输出均与原观测相同。原完整验收仍按运行时的旧身份保留。新增内容不改 `engine/src`、`engine/include`、schema 或客户端产品源码，已逐文件核对这些产品实现与起点的 hash 不变；native 回归明确验证与原单玩家观测等价。性能驱动修复与其浏览器回归属于验收工具，校验身份中保留。

## 证据文件归属

| 文件 | 含义 |
| --- | --- |
| `reports/multiplayer/baseline/environment.json` | 开始时的提交/空工作区 diff、工具版本、源码/校验身份与平台 |
| `reports/multiplayer/baseline/retry-environment.json` | 固定浏览器重跑的真实 executable/版本及初始环境关联 |
| `reports/multiplayer/baseline/initial-failed-run.json` | 首次失败的完整 ledger；原始日志保留在 run 目录 |
| `reports/multiplayer/baseline/pinned-failed-run.json`、`failed/<runId>/` | 固定浏览器下发现的原有采样收尾失败及完整原始性能数据 |
| `reports/multiplayer/baseline/guard-interrupted-run.json` | 主动中断以补错误完成保护的运行，未宣称通过 |
| `reports/multiplayer/baseline/accepted-run.json`、`accepted/<runId>/index.json` | 本次完整验收成功的 ledger 与不可覆盖的报告副本/哈希索引 |
| `reports/multiplayer/baseline/original-single-player.json` | 改测试清单前的原库两次确定性观测 |
| `reports/multiplayer/baseline/<m00-runId>/{environment,single-player}.json` | 新回归接入后可重跑的完整证据 |
| `reports/multiplayer/baseline/summary.json` | 本阶段结果、实际 runId、源码身份与报告 hash 索引 |

`reports/` 按仓库既有策略 gitignore，不强制提交本机生成物；可审查的场景源码/冻结领域值/命令/结果摘要进入版本管理。三项多人限制是 [测试交接](testing.md) 的 MP-REG-001—003，分别在 M02/M04/M05 引入实际回归；M00 不能标成多人通过。
