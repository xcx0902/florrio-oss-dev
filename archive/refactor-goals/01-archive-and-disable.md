# 01：归档原版与逆向工程，并彻底退出活跃链路

> 状态：`08e6b5b` 已提前实施归档及部分关联迁移，尚不能据此认定本文全部验收完成。本次仅更新文档，没有重新执行归档或检查命令。

## A00. 已发生的执行顺序错误

**「先做了 01-archive-and-disable」是此次需要纠正的顺序错误。** 正确前置条件是先完成 M0 的最低产品回归及 02/03 对应的 M1 数据、测试脱钩。当前按 [10 的接续方案](10-continuation-after-early-archive.md) 补齐剩余工作，本文其余旧路径按归档前来源理解，不重新执行移动、恢复链接或重跑一次性脚本。

已迁移的 transport key、产品工具测试、Canvas helper 和项目 changelog 应核验后沿用；仍活跃的原版 layout/probe 需要继续退役。归档允许实施者人工查阅和一次性提取产品规则，迁移后的日常产品链路不得读取归档。

## A01. 定义真正失效的归档边界

建议将归档统一放在 `archive/`，其中 `tree/` 尽量保持原仓库相对路径，另放 `README.md`、`inventory.json`、`migration-map.json`。日期表示本计划的检查快照；实施时记录实际归档时间和对应提交。

归档允许人工查阅，不提供根脚本、npm workspace、CMake target、自动测试、代码生成、默认静态服务或发布入口。需要研究时，在独立目录恢复历史快照；恢复不能成为正常安装或发布的隐式行为。

“不再生效”必须同时满足：

- 活跃 import、动态 import、文件读取、子进程、浏览器路由、HTML script 和复制清单均不指向归档。
- 活跃测试发现范围不递归扫描 `archive/`，CMake 不注册归档测试或 replay 可执行文件。
- 归档不进入 `sourceIdentity`、编译输入、产物哈希、性能报告的必选输入。
- 根目录不存在把 `web`、`upstream`、`source/*`、`reports` 连回归档的兼容链接。
- 暂时移走归档目录后，产品生成、构建、运行、测试和发布校验照常通过。

## A02. 按实际目录归档，保留原文件身份

| 现有位置 | 目标操作 | 需要先解决的依赖 |
| --- | --- | --- |
| `legacy/web/`、`legacy/upstream/` | 移入归档 `tree/legacy/`，保存原 JS、WASM、HTML、图标和哈希 | 从入口、浏览器测试和原版探针断开 |
| `legacy/source/{game,javascript,wasm}/` | 整体归档，含函数映射、WAT、恢复模块、上游 JS 副本 | 停用 `tools/build.mjs`、函数级 oracle 与恢复工具 |
| `source/runtime/`、`source/semantic/`、`source/decompiled/` | 归档现存全部内容；`semantic/*.json` 的产品所需字段先提升为产品数据 | 见 03，尤其 packet XOR key |
| `source/assets/`、`source/README.md` | 历史参考入口、debug hooks、原版素材副本归档 | 当前游戏仍需要的资产先确认已独立存在于 `client/public/` |
| `source/game`、`source/javascript`、`source/wasm` | 移除活跃树链接；历史链接如保留，只存在于归档内部 | 不得把链接解引用为第二套全量历史源码 |
| `reference/` | 清单、变更说明、`frozen-trees.tar.gz` 与身份记录全部归档 | 移除 `test:reference` 与自动 refreeze/prepare |
| `test/` 的逆向测试及 `test/helpers/` | 依 02 迁出产品测试后，其余整体归档 | 不直接整目录丢弃产品工具回归 |
| `tests/parity/` | 全部场景、golden、JSON、截图、trace、比较器和说明归档 | 包含 `next`、`next-ui-v2`、`production` 等自一致性/产品录制，不能只移 original 命名目录 |
| `engine/tests/oracle/` | 全部归档，含 `native-state-replay.cpp` | 删除 CMake 的 `engine_native_replay` 目标 |
| `client/tests/helpers/{rendering,petal,drop}-oracle.mjs` | 整体归档 | 纯 Canvas 记录工具另行提取到产品测试 helpers |
| `legacy/reports/` | 历史 TAP、恢复报告、parity 报告、旧运行记录归档 | 当前 `reports` 链接需改为真正的产品报告目录 |
| `dist/`、`dist-readable/`、`dist-reference/` | 若本地存在，记录其是否属于需保存的历史样本；必要样本归档 | 这些目录被 gitignore，不等于新克隆已包含，不能在清单中虚报已保存 |
| `probe-life.mjs` | 归档 | 该文件直接调用 `loadOriginal` 和 `source/game/client/*` |

现有 `legacy/archive-manifest.json`、`archive-operation.json` 作为历史操作证据原样归档，不改写为新操作已完成。新清单另建 schema；原 manifest 中的旧路径通过迁移映射解释。

`web` 与 `upstream` 内容是否相同，以哈希为准。归档阶段以完整保存为先；后续若按内容去重，必须保留原路径、内容哈希和可还原关系，不能凭文件名删除。

## A03. 处理根目录符号链接和报告输出

当前 `web -> legacy/web`、`upstream -> legacy/upstream`、`reports -> legacy/reports`，以及 `source/` 下三个链接，都是已确认的依赖通道。

实施步骤：

1. 对每个链接用 `lstat/readlink` 记录类型、目标，禁止使用会沿链接递归删除的实现。
2. 将 `legacy/` 的历史内容存入归档后，撤销活跃兼容链接。
3. 在产品根新建普通 `reports/` 目录，只承载新产品验收与性能记录；旧报告不复制为“最新结果”。
4. `.gitignore` 改为忽略新 `reports/` 生成内容；删除只针对 `legacy/reports` 的活跃输出假设。
5. 归档若保留历史内部符号链接，只允许解析到归档内部；检查循环链接、失效链接和越界目标。

完成标准：`reports/` 是普通目录；归档校验和不会因一次产品测试或报告生成而变化。

## A04. 归档工具，移除间接入口

需归档的明确工具集合：

- 恢复/参考构建：`recover-javascript.mjs`、`javascript-recovery-names.mjs`、`recover-wasm.mjs`、`extract-closure-plans.mjs`、`build.mjs`、`verify-javascript.mjs`、`lib/readable-wasm.mjs`。
- 原版身份与冻结：`fetch-upstream.sh`、`reference-manifest.mjs`、`refreeze-reference.mjs`、`prepare-reference.mjs`、`verify-reference.mjs`、旧 `archive-legacy.mjs`。
- 逆向统计：`inventory-remaining.mjs`、`write-reconstruction-report.mjs`、以恢复函数和历史证据为中心的 `summarize-evidence.mjs` 等。
- 原版探针：`probe-game.mjs`、`probe-entity-defaults.mjs`、`probe-menu*.mjs`、`probes/` 中调用 frozen/native/original 的脚本、`layout-probe.mjs`、旧 `split-catalogs.mjs`、旧 `derive-petal-combat.mjs`。
- `tools/parity/` 全部脚本、浏览器注入器、时钟、比较器与场景定义；产品集成检查需要的部分按 02 提取为新的产品工具后，再归档原文件。
- 原版生成部分：旧 `gen-menu-content.mjs`、`derive-drop-chances.mjs --verify`、`check-schema-layouts.mjs` 的原版证据核验，以及旧发布归档演练代码。

`tools/lib/wasm-binary.mjs`、`acorn` 等不能仅凭“看起来用于逆向”删除；先检查迁移后的产品测试是否仍需使用。未确认用途的文件加入清单，逐个标注消费者与最终去向。

根 `package.json` 删除 `recover:*`、`build:reference`、`reference:*`、`schema:probe`、`parity`、`parity:*`、`test:parity`、`test:reference`、`test:client:parity` 等入口；旧 `catalogs:*` 中调用原版的入口随数据生成重写。不要留下自动恢复 archive 的“兼容命令”。

## A05. 原版专用 C++/TS 兼容代码一起退出

归档范围不止 JS 文件。以下实现虽然用 C++/TS 编写，仍服务于历史实验：

- `engine/src/net/original_snapshot.cpp` / 对应头文件中的 `OriginalClientSnapshotWriter`，以及 WorkerApi 的 `original_client_*` 状态、方法、事件队列和 `flush_original_client()`。
- `sp_server_flush_original` 导出、Worker 的 `?original` 分支、`engine/tests/unit/test_original_client_adapter.hpp` 与注册调用。
- 只服务旧 skeleton 快照的 C++ `SnapshotWriter`、TS `SkeletonSnapshotDecoder` 及 fallback：确认当前产品只使用 domain stream 后归档。
- 旧布局静态断言、原版结构体视图和仅有历史布局测试的存储模型：按 03/04 分离处理。

**必须保留并整理的当前产品实现：**`snapshot_header.cpp` 的 `OriginalSnapshotWriter` 正在被 `domain_snapshot_bytes()` 使用，不能整文件归档。应保留活跃序列化能力并改为产品名称；现有字段语义、mask/dense 解码、输入包 key、实体 handle、浮点规则也不能因来源于原版而失效。

## A06. 将历史文档与产品文档分开

1. 将根 `goal.md`、`audit.gpt61sol.md`、`docs/function-recovery.md`、`docs/parity*.md`、旧 parity ADR、旧 `release-acceptance.md`、旧 `audit-resolution.md`、`docs/legacy.md` 等历史工作记录保存到归档。
2. `docs/semantics/` 逐篇检查：产品规则留在活跃文档并改写为领域约定；原版函数编号、内存地址和差分证据放归档来源表。不是整目录机械删除。
3. 重写根 README、各模块 README、环境/协议/发布文档，只展示新产品命令和当前能力；提供一个通往归档说明的阅读链接。
4. 当前游戏菜单的旧上游 changelog 归档；活跃菜单使用本项目更新记录。具体变更见 03，不继续将 2020 年上游更新当作项目更新。

## A07. 清单、检查与完成条件

清单逐文件记录 `originalPath`、`archivePath`、文件类型、字节数、SHA-256、符号链接目标；迁移映射额外记录 `archive / retain-product / replace / remove-generated`、替代产品位置和理由。产品数据提升同时保存来源哈希，但不在日常构建读取原件。

后续实施的只读排查示例：

```sh
rg -n 'loadOriginal|loadReadable|wasm-probe|source/(game|runtime|wasm|javascript)|web/|upstream/|tests/parity|flush_original' engine client schema tools package.json serve.mjs
rg -n 'original parity|engine soak|reference|oracle' tools/verification tools/run-verification.mjs
```

搜索结果需区分注释/来源说明与可执行依赖，不把零关键词命中当作唯一验收。最终必须在不带归档和历史产物的干净产品源码副本执行 09 的全流程。此项完成后，日常工作无需安装任何逆向专用工具。
