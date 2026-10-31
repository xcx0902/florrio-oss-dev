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

`2026-10-31T15-03-14.015Z-7803cb3f` 是补齐错误完成保护前主动中断的重跑，保留 `guard-interrupted-run.json` 和 `test-all-before-error-guard.log`，不当成验收成功。最终源码将重新完整运行全部 15 gate；实际最终 runId/结果同步到执行清单和 `reports/multiplayer/baseline/summary.json`。

两次完整运行开始时的 source identity 为 `11acc5cc354b70dc5bb4c738337f52c8c4f4e4fdc101802758a027c3b72d5a30`；verification identity 为 `b15461bfcb68d26e8850b004c4cbb6c150999d76132c0551dacff95f83398dcc`。环境文件记录 Node 24.13.0、npm 11.6.2、CMake 4.2.1、Apple Clang 21.0.0、Emscripten 6.0.10-git（满足版本 pin）及两种浏览器的实际版本。

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

M00 增加测试/CMake/npm 编排后 source/verification identity 会改变，单玩家证据使用新的实际身份；原完整验收仍按运行时的旧身份保留。新增内容不改 `engine/src`、`engine/include`、schema 或客户端产品源码，已逐文件核对这些产品实现与起点的 hash 不变；后续 native 回归明确验证与原单玩家观测等价。性能驱动修复与其浏览器回归属于验收工具，源码身份中保留。

## 证据文件归属

| 文件 | 含义 |
| --- | --- |
| `reports/multiplayer/baseline/environment.json` | 开始时的提交/空工作区 diff、工具版本、源码/校验身份与平台 |
| `reports/multiplayer/baseline/retry-environment.json` | 固定浏览器重跑的真实 executable/版本及初始环境关联 |
| `reports/multiplayer/baseline/initial-failed-run.json` | 首次失败的完整 ledger；原始日志保留在 run 目录 |
| `reports/multiplayer/baseline/pinned-failed-run.json`、`failed/<runId>/` | 固定浏览器下发现的原有采样收尾失败及完整原始性能数据 |
| `reports/multiplayer/baseline/guard-interrupted-run.json` | 主动中断以补错误完成保护的运行，未宣称通过 |
| `reports/multiplayer/baseline/accepted-run.json` | 本次完整验收成功后才保存的 ledger |
| `reports/multiplayer/baseline/original-single-player.json` | 改测试清单前的原库两次确定性观测 |
| `reports/multiplayer/baseline/<m00-runId>/{environment,single-player}.json` | 新回归接入后可重跑的完整证据 |
| `reports/multiplayer/baseline/summary.json` | 本阶段结果、实际 runId、源码身份与报告 hash 索引 |

`reports/` 按仓库既有策略 gitignore，不强制提交本机生成物；可审查的场景源码/冻结领域值/命令/结果摘要进入版本管理。三项多人限制是 [测试交接](testing.md) 的 MP-REG-001—003，分别在 M02/M04/M05 引入实际回归；M00 不能标成多人通过。
