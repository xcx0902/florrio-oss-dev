# P1 格式与工具批次

日期：2026-11-03。基线：`4fd0ae45ad70bcd35de95f6ea7cc5441cc4099d1`；实施前 HEAD：`0cf34ae306519b012638d718825271ba3620c118`。

## 1. 工具与锁定

| 工具                     | 版本    | 锁定位置                                                          |
| ------------------------ | ------- | ----------------------------------------------------------------- |
| clang-format             | 21.1.8  | `tools/format-tools.lock.json`、`.clang-format`                   |
| cmake-format (cmakelang) | 0.6.13  | `tools/format-tools.lock.json`、`.cmake-format.yaml`              |
| PyYAML                   | 6.0.3   | `tools/format-tools.lock.json`（cmake-format 运行依赖）           |
| Prettier                 | 3.9.10  | `package.json` 精确版本、`package-lock.json`、`.prettierrc.json`  |
| ESLint                   | 10.14.0 | `package.json` 精确版本、`package-lock.json`、`eslint.config.mjs` |
| @eslint/js               | 10.0.1  | 同上                                                              |
| typescript-eslint        | 8.72.1  | 同上                                                              |
| globals                  | 17.14.0 | 同上                                                              |

`tools/format-tools.lock.json` 是唯一版本来源：`tools/setup-format-tools.mjs` 读取 `packages` 在 `.emcache/tools/format` 建 venv；`tools/lib/format-tools.mjs` 解析 `CLANG_FORMAT`/`CMAKE_FORMAT`、`.emcache` 或 PATH，并在实际版本与锁不一致时硬失败。Prettier/ESLint 由 `package-lock.json` 锁定，`loadPrettier()` 校验 `prettier.version`。没有“找不到工具就跳过”的分支。

新增/修改的入口：

- `npm run setup:format`：安装 Python 格式工具并打印解析到的版本。
- `npm run format` / `npm run format:check`：`tools/format.mjs`，按 `git ls-files` + 未跟踪新文件发现文本；Prettier 处理 TS/JS/JSON/YAML/Markdown/HTML/CSS，clang-format 处理 C++，cmake-format 处理 CMake；生成输出只做只读检查，绝不手写覆盖。
- `npm run lint`：`eslint --max-warnings=0 .`。
- `npm run check:refactor`：7 类历史表示台账 + 结构性规则；`--update-baseline` 只允许收紧。
- `npm run test:light`：format check、lint、refactor check 后接单元/工具/引擎/wasm/client 轻量链路。

## 2. 格式约定

- `.editorconfig`：UTF-8、LF、2 空格（C++/CMake/Make 4 空格）、Markdown 保留行尾空格（表格换行需要）、最终换行、去行尾空白（Markdown 除外）。
- `.prettierrc.json`：`printWidth: 100`、单引号、`trailingComma: all`、`endOfLine: lf`、`embeddedLanguageFormatting: off`。关闭嵌入格式化以保留 HTML 内联脚本/样式的可读结构。
- `.prettierignore`：`package-lock.json`、`archive/`、构建/缓存/报告/发布目录、生成清单。
- `.clang-format`：LLVM 基线，`ColumnLimit: 100`、`InsertBraces: true`、`AllowShortIfStatementsOnASingleLine: Never`、`AllowShortLoopsOnASingleLine: false`、`AlignEscapedNewlines: Left`。最后一项是 `FLORR_SERVER_NUMBERS` 宏稳定不动点所必需。
- `.cmake-format.yaml`：`line_width: 100`、`enable_sort: false`、`dangle_parens: true`。
- ESLint：`curly: all`、`max-statements-per-line: 1`、禁止链式赋值/逗号序列/多余三元/`var`、未使用符号（`^_` 除外）；生成文件按其清单路径排除，生成文本由生成器统一格式化。

## 3. 生成文本的顺序

`tools/schema/outputs.mjs` 在返回每个输出前调用 `tools/schema/format.mjs`（内部用 `tools/lib/format-tools.mjs` 的 Prettier API，显式 `resolveConfig(filepath, { editorconfig: true })`）。因此：

1. 生成器构造语义内容；
2. 立即格式化为最终文本；
3. `tools/schema/write.mjs` 对最终文本计算字节数和 SHA-256，写入 `schema/generated-outputs.json`；
4. `schema:check` 逐字节比较磁盘文件与重新生成的格式化文本，并比较清单。

生成清单本身也用 `formatGeneratedOutput` 格式化后再写入/比较。结果：20 个生成输出的哈希可以合法变化，但 `schema:check` 的只读一致性成立；协议 wire 字节不因格式化改变。

## 4. 整改范围

- `npm run format` 统计：503 个文件（首次 502；新增本证据文档后 503）（312 Prettier、184 clang-format、7 cmake-format、20 个生成输出只读检查）。工作树 diff：450 个已跟踪文件，+42325/−16984；另有 15 个新工具/配置文件。
- C++：`InsertBraces` 给所有单行 `if`/`for`/`while` 加块；多语句行拆开；宏续行、构造初始化、长参数列表按 100 列展开。`server/include/florr/server/config.hpp` 的 `FLORR_SERVER_NUMBERS(X)` 从 20 行压缩续行改为每项一行 `X(name, default, min, max)`，顺序和值不变；这是为了消除 clang-format 在两个等价布局间振荡，保证第二遍格式化不再变化。
- TS/JS：链式赋值拆成独立语句（`game-session.ts`、`pointer.ts`、`websocket.ts`、`worker.ts`、`movement-helper.ts`、`petal-motion.ts`、`transitions.ts`），三元表达式改为 `if/else`（`canvas2d/context.ts`、`dev/test-api.ts`），`switch` case 加块（`render/world.ts`），删除未使用 import/变量（client 集成测试、`deploy-smoke`、`pack-native`、`prepare-multiplayer-release`、`run-multiplayer-verification`、`multiplayer-browser`、`identity.mjs`、`schema/catalogs.mjs`、`schema/drop-chances.mjs` 等）。
- 生成输出：20 个文件全部格式化，包括 `generated_protocol.hpp`、`generated_multiplayer.hpp`、`generated_motion.hpp`、`catalog_types.hpp`、`client/src/schema/*.ts`、生成 JSON/Markdown。生成器测试已改为断言格式化后的多行形状（不是放宽断言）。
- 文档：`docs/multiplayer-protocol.md` 表格分隔行被 Prettier 规范化；正文用 `git diff -w` 核对无文字变化。`README.md` 的 CTest 数量更新为 19/30，新增格式命令；`docs/environment.md` 增加工具/安装/20 gate 说明。
- 测试：`tests/unit/protocol-contracts.test.mjs` 对生成文本先调用同一个格式化函数再逐字节比较；`tests/unit/schema-generation.test.mjs` 改为匹配格式化后的多行对象。两者仍验证生成器内容，不是快照放水。
- **回归修复**：`tools/performance/browser.mjs` 在拆分链式赋值时丢失了 warmup 后的 `previous = performance.now()`，使首个测量区间包含 60 帧 warmup（约 1 秒），FPS 降到 54.6。首次 `test:all` 因此在 browser 性能 gate 失败；恢复测量起点（并改为 `let previous;` 以避免 `no-useless-assignment`）后桌面复测 60.00 FPS、`budgetMet: true`。这是格式批次唯一被完整验收抓出的语义回归，说明“格式差异 + 全量验证”不是形式检查。
- 新增 `tests/tools/refactor-rules.test.mjs`（5 个测试）：覆盖 7 类模式、注释/字符串/lambda 误报、tab/行尾空白/CRLF/最终换行、baseline 新增与收紧、真实台账无未知模式。

## 5. 验证

| 检查                                   | 结果                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run format`（第二遍）             | 幂等，无文件变化                                                             |
| `npm run format:check`                 | 通过                                                                         |
| `npm run lint`                         | 0 problems                                                                   |
| `npm run check:refactor`               | scanned 478，7 patterns，0 reductions，0 structural                          |
| `npm run schema:check`                 | 20 outputs verified，清单一致                                                |
| `npm run test:unit`                    | 41/41                                                                        |
| `npm run test:tools`                   | 29/29                                                                        |
| `node tools/run-tests.mjs client-unit` | 143/143                                                                      |
| `npm run test:integration`             | 9/9                                                                          |
| 浏览器集成（11 文件，固定 Chromium）   | 88/88                                                                        |
| engine CTest                           | 19/19                                                                        |
| server native CTest                    | 30/30                                                                        |
| `npm run build:engine:wasm`            | 通过                                                                         |
| `npm run build:client`                 | 通过                                                                         |
| `npm run verify:delivery`              | 通过                                                                         |
| `npm run test:all`（首次）             | 失败：browser 性能 FPS 54.6 < 55，runId `2026-11-03T00-04-19.935Z-d2241f94`  |
| `npm run test:all`（修复后）           | 20/20，stable，60.005 FPS，21m17s；runId `2026-11-03T00-42-22.702Z-88087b63` |

`test:all` 的 20 个 gate 顺序：format、lint、refactor rules、schema、native build、native CTest、server build、server native CTest、wasm、client、package、unit、tools、client unit、cross-end、ABI、delivery、browser、engine perf、integration perf。前三个 gate 在 `tools/verification/gates.mjs` 中定义，`tools/run-verification.mjs` 按同一顺序写 ledger；失败、中断或输入变化不会产生通过记录。

## 6. 差异审查与边界

- 生成文本先格式化再哈希，生成清单与 `schema:check` 同步；wire 字节由 `tests/fixtures/product/protocol/manual_vectors.json` 和跨端/浏览器测试继续保护；该 fixture 仅被 Prettier 重排（`entities` 数组收成一行），字段值和顺序未变，wire 断言全部通过。
- `archive/` 未读取、未修改；`build/`、`dist-*`、`reports/`、`release/`、`.emcache/` 均被忽略，不在 diff 中。
- 格式化 diff 单独审查：`git diff -w` 检查语义行；生成输出 diff 只含空白/引号/换行；文档正文用 `git diff -w` 确认无文字变化。
- 已知限制：全量浏览器 gate 仍为 20 分钟超时（基线 19.2 分钟）；本次通过，但机器负载高时接近上限。P1 没有提高阈值或跳过任何场景。
- 后续阶段：P2–P4 修改字段/协议时，生成器会先格式化再写清单；`check:refactor` 台账只允许收紧，新增历史表示会直接失败。
