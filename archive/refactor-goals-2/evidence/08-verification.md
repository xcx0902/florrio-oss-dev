# 08 当前源码验收（2026-11-07）

状态：验收已完成。六项要求复审通过；主工作树与全新无缓存副本均完成 20/20 gate，
`passed: true`、`stable: true`。本记录及[机器摘要](08-verification.json) 对应本轮实际运行。

## RF-V1：基线、环境与失败记录

- 开始时 HEAD：`6cca04d8565e0221e03b2dece22720503f6be505`，工作区干净。
- Node `v24.13.0`、npm `11.6.2`、CMake `4.2.1`、Apple clang `21.0.0`
  （`clang-2100.3.34.2`，arm64 Apple Darwin）。
- Emscripten `6.0.10-git`，符合 `.emscripten-version` 的 `6.0.10`；
  Chromium 为 Chrome for Testing `156.0.8078.47`，符合 `.chromium-version`。
- 手写文件工具：clang-format `21.1.8`、cmake-format `0.6.13`、Prettier `3.9.10`、
  ESLint `10.14.0`，由现有 lock 文件固定。
- 浏览器：`/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell`。
- Boost：`/private/tmp/florr-boost-1.86.0.tar.bz2`，构建仍按
  `cmake/dependencies.lock.json` 核对归档 SHA-256。

首次运行 `npm run schema:check` 返回 0，验证 26 个输出。随后运行基线 `npm run test:all`：

| 项目     | 记录                                                                   |
| -------- | ---------------------------------------------------------------------- |
| runId    | `2026-11-07T00-00-53.673Z-258a98d4`                                    |
| 结果     | 退出 1；执行至 server native CTest，27/30 通过                         |
| 原因     | 3 个网络目标因沙箱禁止本机端口绑定而报 `bind: Operation not permitted` |
| ledger   | `reports/runs/2026-11-07T00-00-53.673Z-258a98d4/run.json`              |
| 失败日志 | 同目录 `07.log`；总日志 `/private/tmp/florrio-rfv-source.log`          |

失败目标为 `server_network_tests`、`server_network_faults_tests`、`server_process_tests`。
保留失败证据，改在允许监听本机端口的执行环境重跑全部 gate，不改变测试和性能阈值。

干净副本首次 `npm ci --offline --no-audit` 退出 1：现有缓存缺少 `yocto-queue`，
日志 `/private/tmp/florrio-rfv-clean-install.log`。随后按同一 lockfile 执行
`npm ci --no-audit --cache /private/tmp/florrio-rfv-npm-cache`，退出 0，安装 100 个包；
日志 `/private/tmp/florrio-rfv-clean-install-online.log`。没有修改依赖版本。

## RF-V2、V4、V6：六项要求复审与本轮修复

复审结合既有 P0–P7 逐项处置表、当前扫描、关键流程源码和相对上次 P7 的差异。
上次 P7 后 HEAD 只增加框架说明；本轮没有重新逐行改写全仓。

| 要求           | 处置与本轮核对                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 无意义字段治理 | [字段处置表](p0-field-disposition.md)、[全量字段表](p0-field-inventory.md)、[P3 删除链](p3-fields-behavior.md)；检查 schema、生成结构和当前消费链，生成后再扫描旧字段，防止模板或默认值带回已删字段 |
| 无原版实现引用 | [P4 当前协议模型](p4-protocol-model.md)、[P6 历史表示处置](p6-simplification.md)；当前扫描 `patterns: {}`、`structural: []`，493 个文件；正常构造函数、reader offset 和表示前值的变量按上下文保留   |
| 字面量规范     | [P2 单一符号源](p2-identifiers.md)；复审发现并修复 `spawn.cpp` 的 Cactus 裸 ID、`player.cpp` 初始/重生/稀有初始花瓣 ID；数值均改为生成的 `SpeciesId`/`PetalId`，无新手写 ID 表                      |
| 格式与可读性   | 全范围手写 format/Lint；生成物按模板字节检查。重点审阅 `take_orbit`、`retire_handle`、`spawn_band_entity`、decoder 事务提交及 schema 写入前校验，保留销毁、RNG、默认值和回滚顺序                    |
| 无用参数治理   | [P5 签名与调用清单](p5-interfaces.md)；本轮不改接口，C++ native/WASM 构建和 TS typecheck 核对最终调用；保留默认 phase、flash、seed、时间以及忽略有副作用调用返回值的用途                            |
| 精简与去重     | [P6 职责收敛](p6-simplification.md)；复核轨道解绑只清一次 slot handle，销毁额外设置充值；`snapshot-fields.ts` 只读已解码值，独立手写 wire 向量继续独立于生产 decoder                                |

模块复审覆盖 `engine/core`、`engine/model`、`engine/sim`、`engine/net`、`server`、
`client`、`schema/tools`、`tests` 和当前文档，结合
[P7 六项逐模块表](p7-acceptance.md#1-六项要求逐模块复审) 核对当前差异。

`check:refactor` CLI 输出的 `patterns: 7` 是规则种类数，并非命中数。
本轮另外直接调用 `scan()`，确认实际命中为 `patterns: {}`、`structural: []`；
`tools/refactor/legacy-baseline.json` 的台账同样为空。

本轮产品差异仅在 `engine/src/sim/{player,spawn}.cpp`：

- 将 Cactus、None、BasicCommon、BasicUnique 的调用参数和比较改为现有生成枚举。
- 将四处 mob 出生掩码合并为 `kMobSpawnWorldFlags` / `kMobSpawnEntityFlags`；
  entity bits 由 `BlocksSpawn | Owned` 组成，player 的 entity flag 使用 `Owned`。
- `0x4b` / `0x6b` 是出生时序列化的完整 world 掩码，就近命名并说明用途，保留其中
  没有模拟消费者的 bit，未给未知 bit 编造业务含义。没有改 ID、bit、半径、RNG 调用、
  默认实参、事件顺序或任何独立测试期望。

RF-V6 场景沿用现有真实测试：三种 Rose/阻断、Wing/Peas/Web/Egg/共享轨道/Antennae；
固定 seed、动态半径、碰撞、种群和掉落；死亡/充值/重生/handle 复用；稀疏/dense、
边界 ID、截断、mask 和事务回滚；多人身份/隐私/PVP/重连/resync/去重/预测；
world/icon/menu、DPR/触摸/布局；Worker 错误/超时/终止、ABI 和独立交付。
实际运行结果由下节 ledger 和套件计数给出，不为改名新增镜像实现测试。

## RF-V3：生成链与类型

主工作树依次运行（全部退出 0）：

```sh
npm --prefix client run typecheck
npm run schema:generate
npm run schema:generate
npm run schema:check
```

两次生成均为 `written: 0`，输出集合为 26 个、输入为 15 个，未调整固定数量来绕过遗漏。
逐项重算输出 bytes/SHA-256，并核对干净副本全部输出与清单字节一致。
清单 SHA-256：`a6f5bcbc695e529c811a662d20a926be645d8438023f3a3e44f0fa85f6b08ce3`。
日志：`/private/tmp/florrio-rfv-generation.log`、`/private/tmp/florrio-rfv-typecheck.log`。

`tests/unit/schema-generation.test.mjs` 保护重复生成、只读检查、missing/stale/unregistered、
失效输入不覆盖旧输出、孤立清单输出删除、symbol 冲突、稀疏 ID、255/256 和无效引用；
`protocol-contracts.test.mjs` 保护 63 字段/21 组件/19 dense 组、类型、次序、公共 mask
和独立 native→TS 手写向量。由统一 unit gate 运行，不新增重复入口。

生成器当前先在内存中校验并完成全部模板，再调用 `writeOutputs`；模板文本直接作为
最终字节写入，外部 formatter 不接管生成物。这是当前生成约定，并非历史 P1 的格式器链。
“无效输入不会部分覆盖”指输入验证失败，不宣称磁盘 I/O 失败具有多文件事务保证。

## RF-V5、V7：最终全量与干净副本

主工作树命令（退出 0）：

```sh
CHROME_PATH=/private/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell \
FLORR_BOOST_ARCHIVE=/private/tmp/florr-boost-1.86.0.tar.bz2 \
npm run test:all
```

| 项目                  | 主工作树                                                           |
| --------------------- | ------------------------------------------------------------------ |
| runId                 | `2026-11-07T00-03-30.402Z-56ea262b`                                |
| 时间（Asia/Shanghai） | 2026-11-07 08:03:30–08:25:01                                       |
| 结果                  | 20/20 gate，退出 0，`passed: true`、`stable: true`                 |
| ledger                | `reports/runs/2026-11-07T00-03-30.402Z-56ea262b/run.json`          |
| 总日志                | `/private/tmp/florrio-rfv-source-final.log`                        |
| 产品输入 SHA-256      | `530f8d5da234d9a71177af06a1f7a39472e647a1c40d2e5b6ac8cf958a5b0c05` |
| 验证输入 SHA-256      | `420fb4508ae5b963e2d598d3098abacf94435c68e411270de557cc56f76a141d` |
| WASM SHA-256          | `2e1b223815305886ebfb3711cf096cf0e2be6aa779513c1f852d500962a0bdd8` |
| 交付产物 SHA-256      | `da607ade1f3c2d6504e981204167cf7b2750d398d674a080b2b06e7147ffe0c0` |

本轮实际 gate 顺序：format、lint、refactor rules、schema、native build、native CTest、
server build、server native CTest、wasm build、client build、package、unit、tools、
client unit、cross-end integration、ABI consistency、delivery integrity、
browser scenarios and performance、engine performance、integration performance。
所有步骤的命令、开始/完成时间、退出状态、日志和 SHA-256 均在 ledger 中。

| 检查                     | 主工作树实际结果                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| format / Lint / refactor | 524 个手写文件、26 个生成输出登记；Lint 0 warnings；扫描 493 文件，历史表示及结构违规均为零      |
| schema                   | 26/26 输出，15 输入，63 字段、21 组件、19 dense 组                                               |
| native CTest             | 19/19 目标；运行器逐项核对 CTest 清单，禁止零测试成功                                            |
| server native CTest      | 30/30 目标（包括引擎目标），3 个首轮受沙箱阻止的网络目标本轮全部通过                             |
| unit / tools             | 45/45、30/30                                                                                     |
| client unit / 跨端       | 143/143、9/9                                                                                     |
| browser                  | 88/88，无失败或跳过；真实默认入口 native WebSocket + trusted input smoke 通过                    |
| ABI / delivery           | 13 个产品导出、15 个 Worker 调用一致；107 个文件、853480 bytes，无完整性问题                     |
| renderer performance     | 12 场景 × 5 次 × 600 帧，`budgetMet: true`；桌面移动镜头 frame p95 17.5 ms、约 60.001 FPS        |
| engine performance       | native / WASM 共 18 个结果；5 次、200 warmup ticks、2000 ticks、10000 soak ticks，`passed: true` |
| integration performance  | 真实实战生命周期 5 × 600 帧，死亡/重生和排空通过，`budgetMet: true`                              |

性能报告 runId 均与本轮 ledger 一致，未使用仍留在目录中的旧报告。它们是本次验收结果，
不声称相对历史版本的性能提升。

### 干净副本准备与执行

目录：`/private/tmp/florrio-rfv-clean-jhjjdv4f`，由新的 `mkdtemp` 创建。
用 `rsync -a` 排除 `.git`、`archive`、`node_modules`、`build`、`engine/build-*`、
`dist*`、`reports`、`release`、`.emcache`、`.codegraph`、`.vscode`、`.DS_Store`。
复制后逐项确认 archive/build/dist-next/reports/node_modules/.emcache 均不存在。

副本在安装依赖后重新执行 `schema:generate`、`schema:check` 和客户端 `typecheck`，
均退出 0；其输出清单和全部生成文件与主目录逐字节一致。本轮两处 C++ 修复在构建前同步，
并通过 `buildInputs` / `verificationInputs` 核对最终源输入身份一致。

副本使用相同的外部编译器、Boost 和固定 Chromium，通过 `CLANG_FORMAT` / `CMAKE_FORMAT`
指向已准备的固定格式工具；没有复制原目录的 Emscripten 编译缓存或 CMake 产物。
主目录全部性能测量完成后才启动副本 `npm run test:all`，避免同时测量争用资源。

| 项目                  | 干净副本                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| runId                 | `2026-11-07T00-25-02.658Z-7aae9739`                                                                                     |
| 时间（Asia/Shanghai） | 2026-11-07 08:25:02–08:47:45                                                                                            |
| 结果                  | 20/20 gate，退出 0，`passed: true`、`stable: true`                                                                      |
| ledger                | `/private/tmp/florrio-rfv-clean-jhjjdv4f/reports/runs/2026-11-07T00-25-02.658Z-7aae9739/run.json`                       |
| 总日志                | `/private/tmp/florrio-rfv-clean-final.log`                                                                              |
| 测试数量              | unit 45/45、tools 30/30、client unit 143/143、跨端 9/9、browser 88/88；CTest 19/19 和 30/30（含引擎目标），与主目录一致 |
| renderer              | 12 × 5 × 600 帧，`budgetMet: true`；桌面移动镜头 frame p95 18 ms、约 60.004 FPS                                         |
| engine / integration  | 同本轮 runId 的性能 gate 均通过，集成 `budgetMet: true`                                                                 |

两轮均未跳过必需场景，未降低测试或性能预算。C++ 按 CTest 目标统计，Node/浏览器
按实际 TAP 用例统计；不将断言数或源文件数当作用例数。

### 最终身份、日志与交付核对

完成两轮后再次计算当前目录的 `buildInputs` 和 `verificationInputs`，均与各自 ledger
中的输入身份一致；两轮产品输入、验证输入、26 个生成输出、生成清单、WASM 和
107 个产品交付文件（853480 bytes）的身份完全一致，完整 SHA-256 见上表和
[机器摘要](08-verification.json)。两份 `build-manifest.json` 含有不同 runId 和时间，
因此 manifest 本身及包含它的交付树身份不同，这是预期的运行身份差异。

逐项核验了两份 ledger 的 gate 顺序、退出 0、全部日志 SHA-256、全部关联报告 SHA-256，
以及三类性能报告的 runId/通过状态。ledger SHA-256：

- 主目录：`c4cf97f4163ee13f04a2d9a0ce6e33a8e39bbd930da7304f0f98d3e47fcd8fa0`。
- 干净副本：`b7410670651b506e893a2df60fb49d6240d08626ebe0e37357de2f8e1ce2ed2d`。

副本完整报告及 run 日志另存到主目录 `reports/refactor-08/clean/`；安装、生成、类型检查、
首轮失败、两轮完整命令输出及 CTest 详细日志保存在 `reports/refactor-08/`，避免只留下
临时目录指针。原始运行报告仍保留在各自 run 目录，未改写其内容。

Git 差异仅包含两处 C++ 语义命名补齐和本目录的验收文档/机器摘要；没有改动 schema、
测试期望、性能预算或归档，也没有将 build/dist/reports/cache/node_modules 纳入版本差异。
最终补齐两份证据文件后，另外执行 `npm run format:check`（526 个手写文件、26 个
生成输出登记，退出 0）、六份变更文档/JSON 的 Prettier 检查、文件引用检查及
`git diff --check`，全部通过。526 与 gate 运行时的 524 之差是本轮新增的两份证据；
没有新增产品输入。最终产品输入身份仍与两轮 ledger 一致。

结论：RF-V1–V7 及六项最终要求均已满足；首次端口权限和离线缓存缺失已解决，
没有未解决事项。产品和协议行为以本轮两次完整验收结果为证，未使用历史成功报告放行。
