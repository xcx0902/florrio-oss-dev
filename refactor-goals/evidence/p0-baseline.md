# P0 基线记录

执行日期：2026-11-03（Asia/Shanghai）。本文件只记录实际执行过的命令和结果；未运行的项不会写成通过。

## 1. 代码基线

| 项目                 | 实际值                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| 分支                 | `main`                                                                                         |
| HEAD                 | `0cf34ae306519b012638d718825271ba3620c118`（`archive multiplayer-goals & add refactor-goals`） |
| 工作区（开始实施时） | 干净，`git status --porcelain` 为空                                                            |
| 计划审阅基线         | `4fd0ae45ad70bcd35de95f6ea7cc5441cc4099d1`                                                     |
| 与审阅基线的差异     | 72 个文件、3513 行新增、93 行删除；集中在多人 M05–M08（服务器、多人工具、验证 gate）           |
| 归档                 | `archive/` 保持原样，未读取、未修改、未参与任何构建或生成                                      |

计划编写后新增的多人交付内容会改变验证输入和部分测试数量，因此本基线以当前 HEAD 重新核对，不沿用 [00](00-current-audit.md) 中的计数。`00` 的字段/参数/字面量清单仍然成立；涉及数量的说明在本文件更新。

## 2. 工具与环境

| 工具              | 版本/路径                               | 说明                                                                                                                                                                                                     |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js           | v24.13.0                                | `npm` 11.6.2                                                                                                                                                                                             |
| npm               | 11.6.2                                  | 本机 `~/.npm` 含 root 所有的缓存文件，安装时使用 `npm_config_cache=/tmp/florrio-npm-cache`，未修改仓库                                                                                                   |
| CMake             | 4.2.1                                   | 用于 native engine/server 构建                                                                                                                                                                           |
| C++ 编译器        | Apple clang 21.0.0（clang-2100.3.34.2） | 引擎/服务端使用 `-Wall -Wextra -Werror`                                                                                                                                                                  |
| Emscripten        | 6.0.10-git                              | `.emscripten-version` 为 6.0.10，离线 WASM 构建                                                                                                                                                          |
| Chromium 固定版本 | 156.0.8078.47                           | 系统 Chrome 为 156.0.8078.74，与 `.chromium-version` 不匹配；为满足版本固定，下载 Chrome for Testing 156.0.8078.47 到 `.emcache/chrome/`（`CHROME_PATH` 指向它）。未修改 `.chromium-version`，未绕过校验 |
| TypeScript        | 5.7.2（devDependency）                  | `client/tsconfig.json` 开启 `strict`、`noUnusedLocals`、`noUnusedParameters`                                                                                                                             |
| Playwright        | playwright-core 1.49.1（devDependency） | 只使用固定 Chromium 可执行文件                                                                                                                                                                           |
| 格式工具          | 见 P1 记录                              | clang-format 21.1.8、cmakelang 0.6.13、Prettier 3.9.10、ESLint 10.14.0                                                                                                                                   |

浏览器版本不匹配是环境前置条件，不是产品失败。`tools/check-browser-version.mjs` 在系统 Chrome 上按预期报错：

```text
Error: Chrome 156.0.8078.47 is required; got 156.0.8078.74
```

使用下载的固定版本后：

```text
Chromium 156.0.8078.47: pinned version verified
```

## 3. 当前清单

| 项目            | 当前值                      | 来源                                                                              |
| --------------- | --------------------------- | --------------------------------------------------------------------------------- |
| schema 生成输出 | 20                          | `schema/generated-outputs.json`                                                   |
| schema 输入     | 12                          | `tools/schema/load.mjs`                                                           |
| 产品测试清单    | `tests/product-tests.json`  | unit 2、tools 4、client-unit 16、client-integration 11、integration 4、delivery 5 |
| CTest 目标      | engine 19、server-native 30 | `tests/product-tests.json` 的 `expected`                                          |
| 统一验收 gate   | 17                          | `tools/verification/gates.mjs`                                                    |

## 4. schema 检查

```text
$ npm run schema:check
{"mode":"check","generator":"tools/generate.mjs","protocolFields":63,"denseGroups":19,
 "petals":39,"entities":23,"spawnRules":20,"dropRows":102,"outputs":20,"inputs":12,
 "verified":20}
```

结果：通过。没有缺失、陈旧或未登记的生成输出。

## 5. 全量验收

### 5.1 第一次运行（作废）

`2026-11-02T23-04-03.381Z-beb78663`。前 14 个 gate 全部通过；浏览器 gate 的 88 个场景全部通过，但该 gate 在结束时判定 `stable=false` 并失败。

原因是执行期间工作区加入了 P1 文件（`tools/format.mjs` 等），`verificationInputs` 在运行中发生变化。这是实施操作干扰，不是产品基线失败。该 run 不作为基线证据。

### 5.2 干净工作区重跑

在 `git stash -u` 后的干净 HEAD 上重跑：

```sh
CHROME_PATH="$PWD/.emcache/chrome/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  npm run test:all
```

| 项目      | 结果                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------- |
| runId     | `2026-11-02T23-11-30.963Z-d140d940`                                                                      |
| 结果      | **PASS**，17/17 gate 通过                                                                                |
| 失败 gate | 无                                                                                                       |
| 日志      | `reports/runs/2026-11-02T23-11-30.963Z-d140d940/`（00–16.log），汇总 `reports/current-verification.json` |
| 总耗时    | 20.4 分钟                                                                                                |
| 交付身份  | `d62ee77cd4a9e9bc4089af3343a1a39858892b40c06f47e8d63f9610c6602223`                                       |

gate 明细：

| #   | gate                              | 结果 | 证据                                                  |
| --- | --------------------------------- | ---- | ----------------------------------------------------- |
| 0   | schema                            | 通过 | 20 outputs、63 fields、19 dense groups、102 drop rows |
| 1   | native build                      | 通过 | `build/engine`                                        |
| 2   | native CTest                      | 通过 | 19/19                                                 |
| 3   | server build                      | 通过 | `reports/multiplayer/native-build.json`               |
| 4   | server native CTest               | 通过 | 30/30                                                 |
| 5   | wasm build                        | 通过 | `build/wasm/server.wasm`                              |
| 6   | client build                      | 通过 | `dist-next`                                           |
| 7   | package                           | 通过 | 多人与发布包                                          |
| 8   | unit                              | 通过 | 41/41                                                 |
| 9   | tools                             | 通过 | 24/24                                                 |
| 10  | client unit                       | 通过 | 143/143                                               |
| 11  | cross-end integration             | 通过 | 9/9                                                   |
| 12  | ABI consistency                   | 通过 | 13 个产品导出、15 个 worker 调用                      |
| 13  | delivery integrity                | 通过 | 100 个文件、819144 字节                               |
| 14  | browser scenarios and performance | 通过 | 88/88 场景；桌面/触屏/性能矩阵                        |
| 15  | engine performance                | 通过 | `reports/perf-engine.json`                            |
| 16  | integration performance           | 通过 | `reports/perf-integration.json`                       |

浏览器 gate 的 88 个场景与性能矩阵全部通过；该 gate 耗时约 19 分钟，接近 20 分钟上限，属于本机性能波动，不是产品失败。后续 P1 全量验收需要预留同等时间。

## 6. 已有失败与偏差

| 项目                                              | 状态     | 处理                                        |
| ------------------------------------------------- | -------- | ------------------------------------------- |
| 系统 Chrome 156.0.8078.74 与固定版本 .47 不符     | 环境偏差 | 使用 Chrome for Testing .47；未修改版本固定 |
| npm 缓存 root 所有导致 EPERM                      | 环境偏差 | 使用临时 `npm_config_cache`；未修改仓库     |
| 第一次全量验收因实施期间新增文件而 `stable=false` | 作废运行 | 干净工作区重跑                              |
| 产品测试失败                                      | 无       | 干净基线 17/17 gate 通过                    |

## 7. 对 P1 的约束

1. 格式化不得改变 C++ 语义、浮点表达式顺序、RNG 调用顺序、协议字节和生成输出语义。
2. 生成输出必须在写入和计算 SHA-256 之前完成格式化；`schema:check` 仍保持只读。
3. 修改生成器或格式配置后，必须重新生成全部输出和清单，并重新运行 schema 检查、构建和全量验收。
4. `archive/`、`build/`、`dist-*`、`reports/`、`release/`、依赖和缓存不进入格式范围。
