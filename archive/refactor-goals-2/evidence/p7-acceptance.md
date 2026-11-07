# P7 最终验收

本文件保留此前 P7 的历史实施记录。当前源码的重新验收见
[2026-11-07 验收记录](08-verification.md)；下述 runId 和数量仅对应当时源码。

最终验收按 `08-verification.md` 的 RF-V1–V7 执行：逐模块按六项用户要求复审、
规范与类型检查、可复现生成、完整 `test:all`、干净副本重建、身份/行为/ABI 核对、
Git 差异审阅和交付说明。

## 1. 六项要求逐模块复审

| 模块             | 1 字段命名/去无用                                                                            | 2 无原版引用                                  | 3 具名常量                                     | 4 统一格式            | 5 无用参数                                  | 6 死代码/重复                                      |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- | --------------------- | ------------------------------------------- | -------------------------------------------------- |
| `engine/core`    | `byte_reader`/`fixed_step`/`rng`/`vec2` 字段与常量按语义命名；`kVarintOverflow` 取代越界说明 | 注释仅描述当前读取规则                        | `kVarintOverflow`、`kParkMiller*`              | clang-format 21.1.8   | 无 `(void)` 参数                            | 单一 varint reader                                 |
| `engine/model`   | 删除 `PetalSlot::instances` 镜像；`entity.hpp`/`world.hpp` 字段按域命名                      | `AI+60`/`entity+144` 等偏移注释清零           | `EntityKind`、`EffectType`、`AiFamily`         | 同上                  | 无                                          | `loadout.handles()` 单一权威                       |
| `engine/sim`     | `spawn` 收敛三条出生路径；`petal_lifecycle` 单一 `take_orbit`                                | 函数号引用清零（`orbit_angle_for` 已删除）    | 全部 species/petal 比较改 `catalog::*_type_id` | 同上                  | `spawn_band_entity` 取代重复分支            | `detach`/`destroy`/`remove_slot` 共用解绑步骤      |
| `engine/net`     | 快照写入参数按域命名（0 个 `fieldN`）                                                        | `native`/`shipped` 注释改写                   | `Component`、`DenseFieldGroup`                 | 同上                  | 删除 `(void)version`/`(void)flags` 局部保活 | 单一 `component_mask` 语义                         |
| `server`         | 无字段改动                                                                                   | 注释不含原版引用                              | 复用 engine 常量                               | 同上                  | 无                                          | `main` 唯一入口                                    |
| `client`         | 删除 10 个 snapshot alias；`snapshot-fields.ts` 只读访问器                                   | 注释与测试名改写，`original` 仅保留“前值”语义 | `EntityKind`、`Component`、`SNAPSHOT_EVENT`    | prettier 3.9.10       | `byteField(entity, field)` 取代三处合并逻辑 | `dense-codec` 单表；`state/snapshot.ts` 仅转发     |
| `schema`/`tools` | `protocol.yaml` 字段名与生成表一致；生成物 26/26 未手改                                      | 生成器错误信息不含字段编号                    | `NO_TYPE_ID`、`MIN_TYPE_ID`、catalog ids       | prettier/cmake-format | —                                           | `CMakeLists` 单次选项定义；`package.json` 别名删除 |
| `tests`          | 54 处裸 id 改 catalog 枚举；测试名去 `original`                                              | `check-refactor` 0 命中                       | 全部断言用具名常量                             | 同上                  | —                                           | `DenseGroupDecoder` 表驱动                         |
| `docs`           | `ai.md` 改域字段表；`tick.md` 改当前阶段名                                                   | 当前文档不含偏移/函数号；历史材料单独标注     | 使用 schema 字段名                             | prettier              | —                                           | 文档不重复描述代码细节                             |

复审结论：六项要求在九个模块均无未处置项；`archive/` 未改动，构建/缓存/依赖目录
不参与整改。

## 2. 规范、类型与生成检查

| 检查     | 命令                                | 结果                                                                              |
| -------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| 格式     | `npm run format:check`              | 523 个手写文件通过（clang-format 21.1.8 / cmake-format 0.6.13 / prettier 3.9.10） |
| Lint     | `npm run lint`                      | 通过（`--max-warnings=0`）                                                        |
| 历史表示 | `npm run check:refactor`            | `patterns: 0`，`structural: 0`，`scanned: 492`；台账 `patterns: {}`               |
| 生成只读 | `npm run schema:check`              | 26/26 输出与生成器一致                                                            |
| 类型     | `npm --prefix client run typecheck` | 通过                                                                              |

生成可复现性由 `schema:check` 与 `--update-baseline` 的原子写入保证；`tools/generate.mjs`
在写入前完成全部校验，任一失败不产生部分输出。

## 3. 完整验收

见 §7 的最终 `test:all` 记录（20 个 gate，未跳过、未降低阈值）。

## 4. 干净副本

见 §8。

## 5. 身份、行为、存储与 ABI

| 项目              | 结论                                                                     | 证据                                   |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| petal/entity 身份 | 未改变：所有 ID 来自 `schema/catalogs/*.json`，测试用枚举断言相同整数    | `test:engine` 19/19、`test:unit` 45/45 |
| wire 字节         | 未改变：手写字节向量逐字节相等（`protocol-contracts`、`snapshot-codec`） | `test:unit`、client integration        |
| 物理/随机         | 未改变：出生次序、RNG 抽取次数、tick 顺序由 golden/结构与 R04 测试覆盖   | `test:engine` 19/19                    |
| 存档/设置         | 未改变：`profile`/settings 编解码无 diff                                 | `git diff` 无相关文件                  |
| 外部 ABI          | 未改变：导出清单与签名由 `verify-abi` 与 30 项 server CTest 覆盖         | `test:server:native` 30/30             |

## 6. Git 差异与交付

- `git status` 只包含手写源码、测试、文档和证据；`build/`、`dist-next/`、`reports/`、
  `release/`、`archive/`、依赖和缓存均未进入差异。
- 新增产品文件：`client/src/state/snapshot-fields.ts`；新增证据：
  [p6-simplification](p6-simplification.md)、[p7-acceptance](p7-acceptance.md)。
- 环境说明：本机 Boost 归档被 `/tmp` 清理后重新下载并按 `cmake/dependencies.lock.json`
  校验 SHA256（`1bed88e…513b`）；系统 Google Chrome 已自动升级到 `157.0.8103.38`，
  验收改用 `.chromium-version` 固定的 `chrome-headless-shell 156.0.8078.47`
  （Chrome for Testing 官方包）并通过 `CHROME_PATH` 显式指定，运行前后版本由
  `assertBrowserVersion` 校验。

## 7. 最终运行记录

`npm run test:all`（环境：`FLORR_BOOST_ARCHIVE=/private/tmp/florr-boost-1.86.0.tar.bz2`，
`CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell`）：

| 项目     | 值                                                                                     |
| -------- | -------------------------------------------------------------------------------------- |
| runId    | `2026-11-05T16-09-11.442Z-77483174`                                                    |
| 结果     | 20/20 gate 通过，`passed: true`，`stable: true`                                        |
| 时间     | 2026-11-05 16:09:11Z–16:29:17Z（本地 00:09–00:29，约 20.1 分钟）                       |
| 工具     | Node v24.13.0、Emscripten 6.0.10-git、Chromium 156.0.8078.47、CMake 4.2.1              |
| 交付身份 | `385402f9c36692385ad753f6cfe65ee1d630ae023d74d6150cb87ca2cc77ba9d`                     |
| 报告     | `reports/runs/2026-11-05T16-09-11.442Z-77483174/run.json`（含 20 个步骤日志与 SHA256） |

Gate 顺序（全部通过）：format、lint、refactor rules、schema、native build、native CTest、
server build、server native CTest、wasm build、client build、package、unit、tools、
client unit、cross-end integration、ABI consistency、delivery integrity、
browser scenarios and performance、engine performance、integration performance。

套件计数：unit 45/45、tools 30/30（含新增的空台账断言）、client unit 143/143、
cross-end integration 9/9、browser scenarios 88/88、client integration 88/88、
engine CTest 19/19、server native CTest 30/30。

性能：renderer 全档 12 场景 × 5 次 × 600 帧，`budgetMet: true`（desktop/moving-camera
frame p95 ≤ 20 ms，FPS ≥ 55，全部场景 render CPU p95 ≤ 8 ms）；engine 与 integration
性能 gate 同 run 通过。没有跳过、放宽或复用历史结果。

## 8. 干净副本

副本用 `rsync -a` 从工作树生成，排除 `.git`、`archive/`、`node_modules/`、`build/`、
`engine/build-*`、`dist-*`、`reports/`、`release/`、`.codegraph/`、`.vscode/` 和
`.DS_Store`，即不含归档、旧构建产物、旧报告和依赖；`.emcache/`（格式化工具与编译缓存）
单独复制，`node_modules` 由副本内 `npm ci` 重新安装（100 packages，616 ms）。副本内没有
任何来自原树的 `dist-next`、`reports` 或 CMake 缓存。

| 项目  | 值                                                                           |
| ----- | ---------------------------------------------------------------------------- |
| 位置  | `/tmp/florrio-clean`（615 MB，其中 `.emcache` 609 MB）                       |
| runId | `2026-11-05T16-31-42.144Z-eee1b178`                                          |
| 结果  | 20/20 gate 通过，`passed: true`，`stable: true`                              |
| 时间  | 2026-11-05 16:31:42Z–16:53:28Z（本地 00:31–00:53，约 21.8 分钟）             |
| 工具  | Node v24.13.0、Emscripten 6.0.10-git、Chromium 156.0.8078.47                 |
| 报告  | `/tmp/florrio-clean/reports/runs/2026-11-05T16-31-42.144Z-eee1b178/run.json` |

副本从空的 `build/` 重新配置 CMake、重新编译 native/server/wasm、重新生成 schema
输出并重建 `dist-next`，随后跑完与 §7 完全相同的 20 个 gate（含浏览器 88 项场景、
渲染/引擎/集成性能）。两次运行使用同一固定 Chromium 与同一 Boost 归档。

可复现性交叉核对：副本与主工作树的 `dist-next/build-manifest.json` 中
`inputs.sha256` 均为 `f06cf204…0d62`，`artifactsSha256` 逐项相同，交付物同为
107 个文件、853480 字节。两份 manifest 的 `runId` 不同，因此 `deliveryIdentity`
不同，但构建产物逐字节一致。
