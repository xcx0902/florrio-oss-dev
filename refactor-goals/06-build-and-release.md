# 06：统一构建入口，精简工具并准备后续发布

> 状态：待实施。保留 `dist-next/` 作为当前交付名，先收敛流程和边界。

## B01. 修正默认命令与项目身份

根 package 当前名为 `legacy-florr-readable`，`build` 指向旧 `tools/build.mjs --readable --output dist`，`start` 指向 `dist`，`test` 指向函数级旧测试；而 README 和 `serve.mjs` 默认主线已是 C++/TS 的 `dist-next`。

目标脚本表：

| 命令 | 目标行为 |
| --- | --- |
| `build` | schema freshness 检查、当前引擎 wasm、TS、打包到 `dist-next` |
| `start` | `node serve.mjs --root dist-next`；产物缺失给出当前 build 命令 |
| `schema:generate` / `schema:check` | 03 的完整生成/无写入检查 |
| `build:engine` | 增量配置并编译 native；不默认 `cmake --fresh` |
| `build:engine:clean` | 显式干净配置，保留完整验收用途 |
| `build:engine:wasm` / `build:client` | 当前两端独立编译；生成物 freshness 可校验 |
| `test` / `test:unit` | 产品快速单元测试；不启动原版 |
| `test:tools` / `test:engine` / `test:client` | 工具、native、客户端产品测试 |
| `test:integration` / `test:delivery` | 当前跨端与真实交付浏览器测试 |
| `test:all` | 本文 B06 的完整产品验收 |
| `verify:delivery` | 校验 `dist-next` 文件清单、源码/编译身份、API 配置 |
| `perf:engine` / `perf:client` / `perf:integration` | 07/08 定义的独立工作负载 |
| `release:prepare` | 生成可分发包及本次发布报告，不执行外部发布 |

`build:dist-next` / `verify:dist-next` 可在迁移中短期保留为当前命令别名，最终只留一套文档入口。原版/recover/parity 入口直接退出，不保留能自动运行归档的别名。

package 名称改为描述当前产品的名字；包管理字段与实际发布方式一致。不在此次工作中自动把 private 项目发布到 npm。

## B02. CMake 与 wasm 编译源只有一个清单

`engine/CMakeLists.txt` 与 `tools/build-engine-wasm.mjs` 各自维护约二十多个 `.cpp` 的源清单；新增领域文件容易只进其中一种构建。

目标以 CMake 的 `engine_core` 为唯一 source/compile-options 定义：

1. 将 common 源、数值编译规则和 feature 配置集中到 `engine/CMakeLists.txt` 或其 `cmake/EngineCore.cmake`。
2. wasm 构建脚本使用 Emscripten CMake toolchain 配置 `build/wasm/` 并构建同一核心目标；Node 只负责版本检查、输出记录、锁与原子替换，不再手写第二份源文件数组。
3. native、wasm、test/diagnostics 配置清楚区分 target；`engine_native_replay` 和原版 adapter 源不在产品构建。
4. ABI 导出列表由一个 manifest 定义，与头声明/worker 需要的能力做一致性检查；归档原版比较专用导出。
5. 保留 `-ffp-contract=off`、`-fno-fast-math`、`-fno-exceptions`、`-fno-rtti` 和严格警告要求。性能阶段不能私自用 fast-math 获取不可比收益。
6. 保留 `.emscripten-version` 和 `.chromium-version`；锁定工具链与测试环境，不在本轮计划中无依据升级版本。

配置时不必重复 `--fresh`。当 toolchain、feature 或配置签名变化时重新配置，干净发布验收仍可显式 fresh。每个 native CTest 都必须被执行，不能只捕获 `engine_tests --tap` 后漏掉专项 suite。

## B03. 手写静态资产与编译输出分开

当前 `client/public/` 既有手写 `index.html/server-worker.js/fonts/`，又是 TS outDir 和 wasm 输出位置，导致旧 JS 可能残留并被递归复制。

建议布局：

```text
client/static/             index.html、手写 worker、fonts 与当前产品静态资产
build/client/              本次 tsc 输出
build/wasm/                本次 CMake wasm 与编译身份
dist-next/                 只由打包器生成的最终交付
```

具体修改：

- 调整 `client/tsconfig.json` 的 outDir；构建使用独立 staging 或输出清单清理废弃文件，防止删除源码后留下旧模块。
- 将手写入口/worker/fonts 从 public 迁出；更新浏览器测试的 root 与 `.gitignore`。
- 打包器按静态资产白名单、TS 生成清单、wasm 清单合成，不再 `cp(client/public)` 整棵树。
- 默认发布包不带 `.d.ts`、`.map`、构建记录、测试入口、parity hooks、恢复源码、原版二进制；调试包可显式带 source map，但不与默认发布混用。
- 必要资源检查覆盖入口、所有模块 import、worker、wasm、字体；不能只有四个顶层文件名存在就宣称完整。
- 继续保留 staging、锁、失败保留旧交付、原子替换这些现有正确性能力。

先迁移目录并更新工具回归，再优化压缩/缓存；本计划不引入与目标无关的新前端框架或打包器。

## B04. 身份计算只覆盖产品，避免反复全仓库哈希

当前 `sourceIdentity` 含 `test`、完整 `tools`、`engine/tests` 等，`evidence()` 又包含原版及大量 golden；同一流程多次调用会读取这些大树。需要保留可信身份，同时拆清用途：

- `buildInputs`：只包含影响产物的源码、产品 schema、生成器、手写静态资源、构建配置、编译 feature 与版本。
- `verificationInputs`：上述输入加产品测试、fixture、验收 runner、性能配置和浏览器版本。
- `deliveryIdentity`：本次实际交付文件的有序路径、长度与内容哈希；不包含当前报告输出自身。
- 归档、历史文档、已生成报告、缓存、node_modules、旧产物不进入这些身份。

使用统一 `tools/lib/identity.mjs` 供 build/verify/report 使用，合并目前多处 `sha256/listFiles/treeIdentity` 的重复语义；每类身份带版本，不让新算法结果与旧哈希混用。纯函数/不可变清单可在一次运行内复用，但在构建前后仍做稳定性验证，不能仅用 mtime 或无效的永久缓存替代内容检查。

`sourceIdentity` 现有对原版兼容链接的特别放行随归档退出；产品输入出现未声明链接时按明确策略拒绝或受控解析，不递归进入 archive。

## B05. 合并重复 HTTP、浏览器与子进程辅助逻辑

`perf-client.mjs`、`client/tests/menu-interactions.test.mjs`、`worker-shim.test.mjs`、多个 smoke/probe 都重复临时 HTTP server、MIME、Playwright 加载与 Chromium 解析。目标：

1. 产品测试使用 `tools/lib/test-server.mjs` 和 `browser-harness.mjs`，统一临时端口、MIME、root 边界、错误收集、关闭和资源清理。
2. `serve.mjs` 保留对人使用的端口顺延/自动开浏览器 CLI，底层 handler 可复用；移除 `--reference`、原版回滚和旧注释。显式 root 仍可用于其他产品交付，但不提供归档快捷入口。
3. Playwright 路径/版本/浏览器解析只维护一次；浏览器缺失时必选测试失败，禁止静默降级为“跳过也通过”。
4. 子进程 runner 统一退出码、signal、超时、取消、日志和锁释放；TAP parser 与 atomic IO 保留，避免为了精简删除对错误路径的保护。
5. 产品 E2E 在一个浏览器实例中按隔离 context 运行场景，桌面、retina、touch 不重复启动整套全部用例三四次；必须实际设置对应 viewport/DPR/touch profile。

原版 probe 全部归档后再删无消费者 helper，不把旧 parity harness 提升为产品公共基础库。

## B06. 重写产品验收 ledger，退出历史证明体系

具体修改文件为 `run-verification.mjs`、`verification-evidence.mjs`、`verification/gates.mjs`、`write-current-verification.mjs` 和 `write-verification-report.mjs`。后者约 1155 行，需先保存历史版再拆出当前产品报告。

目标唯一的 gate 定义表同时驱动执行与汇总，避免 requiredSteps、执行数组、报告分支各维护一遍：

```text
schema check → native build/CTest → wasm build → client build
→ package once → unit/tools → cross-end integration
→ delivery integrity → browser product scenarios → performance → ledger
```

独立检查在无共享输出冲突时可并行；同一 wasm/TS/交付只构建一次，后续全部检查同一身份的文件。step 记录退出码、运行 ID、开始/结束、测试清单、报告哈希、交付身份与工具版本。

删除必选 gate 中的 reference、javascript oracle、original parity、engine strict/soak parity、hornet 原版对比、visual/Canvas 原版等价、original+engine 和恢复覆盖率。保留对应领域功能为 02 的产品回归与 07/08 的 soak/性能，不继续用旧报告填补结果。

`collect-release.mjs` 当前要求“两次 pre-move + 一次 post-move”、归档演练、参考截图与原版校验。这属于一次历史归档的证明流程，整版归档；新发布收集器只核验本次产品报告和产物，不要求每次发布重新移动/恢复 archive。

## B07. 发布与依赖清理

- 对迁移后的静态/动态 import、CLI 调用和工具测试做依赖盘点；`eslint-scope`、`terser`、`wabt` 若只属于逆向路径，从根 devDependencies 与 lockfile 移除。
- `acorn` 当前还用于 `protocol-contracts.test.mjs`，应在测试迁移后决定保留还是使用 TypeScript API 替代，不能先删包再跳过失败测试。
- `yaml`、`typescript`、`playwright-core` 是当前产品工具依赖，按实际消费者保留；不把依赖清理和版本升级混成一个提交。
- `tools/vendor/` 若只是旧 wabt 工具，本地目录不再由新流程引用；不误删用户机器上的通用工具链。
- 新发布 manifest 记录产品版本、提交/源码身份、编译器、feature、协议/存储版本、文件哈希与字节数；生成 zip/tar 和校验文件。
- README 与 docs/release.md 写明本地准备包、校验、启动和回退到上一产品包的步骤；默认回退不再是原版 web 树。

## B08. 完成条件

- [ ] `build/start/test/test:all` 全部默认指向当前产品。
- [ ] CMake 与 wasm 共享一个核心源清单；编译/导出配置有一致性检查。
- [ ] 手写源与生成树分离，删除 TS 源不会使旧输出混入新包。
- [ ] 默认交付不含归档、原版、测试、声明文件、source map 或原版探针。
- [ ] 旧 oracle/golden 改动不影响产品身份，当前产品源码/配置变更会使产物校验失效。
- [ ] 每个产物只构建一次，报告绑定同一次源码与交付，没有旧 ledger 继承为通过。
- [ ] 新发布流程不执行 archive move/restore、refreeze 或访问原版网络。
