# 10：先执行归档后的纠偏与接续方案

> 编写日期：2026-10-29。当前检查基点：`08e6b5b`（`refactor step 01: archive`）；归档前对照基点：`cc17564`（`add refactor goals`）。
> 本文只记录静态核对结果和后续操作方案；本次没有执行重构、恢复、归档、生成、构建、测试或性能测量。下文的新文件、命令和验收结果均需后续实施。

## R00. 明确记录此次顺序错误

**此次错误举动是：「先做了 01-archive-and-disable」。** 在完成 M0 的最低产品回归、M1 的产品数据与混合测试迁出之前，提前执行了 M2 的归档停用。文档的 `01`、`02`、`03` 是主题编号，正确依赖顺序原本是 `00/09 中的 M0 → 02/03 对应的 M1 → 01 对应的 M2`。

提前归档使旧路径失效，又在同一提交中夹带了部分测试、生成器、协议和运行实现调整。因此，02、03 不能继续假定归档前的文件仍在活跃目录，也不能根据“旧文件不存在”把对应产品目标判为无法完成或已经完成。此前按主题编号、另在总路线说明执行顺序的组织方式容易误读，此处明确纠正。

纠偏从现有 `08e6b5b` 继续。默认保留已完成的归档和有效迁移，不整体回滚、不重跑 `archive/operations/01-archive.mjs`，不恢复根 `web/upstream/source` 兼容链接。需要取回的是独立产品规则、计算逻辑和测试覆盖；旧 oracle/parity 仍保持停用。

## R01. 当前已经发生什么，哪些仍不能算完成

以下为文件与代码核对结果，**不表示任何构建或测试已经通过**：

| 主题 | `08e6b5b` 中的现状 | 接续处理 |
| --- | --- | --- |
| 历史目录 | 原版、恢复代码、oracle/parity 与工具已进入 `archive/tree/`，存在 inventory 和 migration map | 核验清单与边界，不重复移动 |
| 根产品测试 | 已存在 `tests/unit/protocol-contracts.test.mjs`、`tests/tools/delivery.test.mjs`、`tests/tools/verification.test.mjs` | 对照旧测试块审计保留内容和失败路径 |
| 客户端混合测试 | `menu-controls`、`worker-shim` 已修改；当前活跃顶层测试为 13 个 | 核对逐断言去向，不能以文件数量减少代表迁移成功 |
| Canvas helper | 已有 `client/tests/helpers/recording-canvas.mjs` | 保留有效记录功能，清理无消费者的历史调用编号 replay 分支 |
| 文本缓存回归 | 整个 `text-cache.test.mjs` 已移入归档，核对为归档前的原字节副本 | 重写其中具有产品价值的用例，见 R03 |
| packet key | 已由 `schema/transport.json` 提供，生成器已解除 `source/semantic` 读取 | 本次人工比较确认 keyHex 与归档源一致；补独立产品格式及生成校验 |
| 更新记录 | 当前生成器读取 `CHANGELOG.md` 并生成 `client/src/schema/menu-content.ts` | 保留已选定的单一人工来源，不另建重复内容源 |
| 原版内存布局 | `schema/layout/*.yaml`、两端旧 layout 生成物、CMake layout probe 和 `src/schema/contracts.cpp` 仍活跃 | 继续完成 03/S01，不能只删除来源注释就视作产品化 |
| 全量生成检查 | `schema:generate` 已存在；完整 `--check` 仍被拒绝；没有 `schema:check` 脚本 | 实现覆盖全部产品生成物的只读检查 |
| 目录和掉落 | 手写 `petal_defaults.hpp`、`drop_table.hpp` 仍在；掉落推导脚本已归档 | 按 R05 建立产品计算入口与唯一字段所有者 |
| 独立跨端入口 | 已有真实 Worker 相关测试；尚无 `test:integration` 命令 | 补充明确的 native → TS fixture，整合现有真实 wasm 链路 |

`archive/migration-map.json` 中把菜单替代位置写成了 `schema/content/changelog.json`，但当前该文件不存在，实际实现是 `CHANGELOG.md → client/src/schema/menu-content.ts`。在接续记录中注明这项映射偏差；不为迎合旧清单再创建第二份人工内容源。

## R02. 查阅和提取旧材料的方法

归档失效约束的是日常安装、生成、构建、运行、测试、性能与发布链路。实施者可以人工阅读归档或用 Git 查阅旧版本，并在一次性迁移中提取需要的规则；迁移完成后的产品脚本不得自动执行这些读取。

| 所需材料 | 本次接续的查阅位置 | 注意事项 |
| --- | --- | --- |
| 已整文件归档的客户端测试 | `archive/tree/client/tests/` | 原有相对 import 大多已经失效；只读，不直接运行 |
| 历史根测试和 helpers | `archive/tree/test/` | 提取领域断言，不把旧 helper 导入新测试 |
| 掉落算法 | `archive/tree/tools/derive-drop-chances.mjs` | 本次核对为归档前原字节副本；提取纯计算部分，保留归档文件原样 |
| 旧完整菜单提取器 | `archive/tree/tools/gen-menu-content-from-wasm.mjs` | 当前 `tools/gen-menu-content.mjs` 已是新实现，不能混用 |
| 只从混合文件删除的测试块 | `git show cc17564:原路径` | 例如旧 `menu-controls` 并没有完整副本位于 `archive/tree/client/tests/` |
| 被清理来源字段的 schema 原件 | `git show cc17564:schema/...` | 不假定所有原件都已进入归档；以实际清单和 Git 对照 |
| 历史本地录制与截图 | inventory 中的 `tracked: false` 项 | 新克隆可能没有；不能成为新测试或重建产品规则的唯一依据 |

实施时可使用的只读命令：

```sh
git status --short
git show --no-patch --oneline 08e6b5b
git show cc17564:client/tests/menu-controls.test.mjs
git show cc17564:schema/catalogs/entities.json
git diff cc17564 08e6b5b -- tools/gen-contracts.mjs client/tests/menu-controls.test.mjs
```

先在工作记录中建立逐项映射：`旧路径/测试名 → 归档或 Git 位置 → 当前替代 → 剩余动作 → 验证方式`。建议落点为后续新增的 `docs/refactor-continuation.md`，状态限定为“已迁移待核验、待补齐、历史退役、已核验”。本次不预填通过状态。

若仍有活跃命令报缺少 `source/`、`web/` 或 `test/helpers/`，先追踪调用者：属于产品能力则迁出所需输入；属于原版验证则从活跃入口移除；属于混合文件则拆分。不要用改指向 `archive/`、恢复链接或 skip 来消除报错。

## R03. 先补 02 的最低产品回归，再改数据和生成器

### R03.1 核验已迁出的测试

对照 `cc17564` 中的三个旧根测试与当前 `tests/unit`、`tests/tools` 文件，逐测试块标注去向。协议编译、手工字节、过期生成物拒绝、构建失败保留旧包、锁释放、子进程失败与中断等产品断言必须保留；原版哈希、frozen/recovery/parity gate 等历史断言保持归档。

对 `client/tests/menu-controls.test.mjs` 逐块比较保留的 IME、昵称存储、焦点、滚动条、面板和 tooltip 行为。被删除的原版逐帧采样不恢复；若其中还包含图鉴完整性、滚动边界等产品规则，则用当前产品目录和显式输入另写测试。

对 `client/tests/worker-shim.test.mjs` 保留真实 Worker、当前协议 dense/delta、删除、事件和输入输出通路。测试名中的 `original` 需按实际断言更名；不能只通过改名字宣称旧断言已产品化。

### R03.2 重写文本缓存用例，不复制旧 before 钩子

新建 `client/tests/text-cache.test.mjs`，使用当前 `client/src/render/canvas2d/text-cache.ts` 或本次构建的 JS、真实浏览器 Canvas 与 `client/public/fonts/ubuntu-bold-latin.woff2`。旧文件的共享初始化会实例化原版 WASM、追加导出并载入恢复 JS，因此即使只挑看似独立的测试块，也必须重建整个 harness。

新 harness 只提供页面、当前模块、字体加载和本项目绘制计数。预期来自书面的产品缓存规则、小型独立示例和对象身份观察，不从原版像素/尺寸表即时取值。

| 产品断言 | 输入方式与验证内容 |
| --- | --- |
| owner 隔离 | 相同文字分别使用 `0`、`"0"` 和不同 owner；确认缓存不串用 |
| 内容失效 | 同一 owner 输入 A → A → B → A；确认内容变化触发重绘，未变内容按规则复用 |
| 样式失效 | 分别修改 font、outline、fill、stroke；验证对应缓存失效与后续复用 |
| 无 owner 缓存 | 相同配置复用，需区分的 rasterScale 不共享错误图像 |
| 清理 | 调用 `clearLabelCache()` 后重新创建；确认旧 owner 和无 owner 项不再命中 |
| 缩放规则 | 把当前产品采用的 projectedScale/迟滞规则写清楚，再用人工边界输入验证；不直接继承原版 func444 的逐像素要求 |

先保留当前扁平 `client/tests/*.test.mjs` 路径，减少无关目录迁移。当前 `test:client` 会发现新增文件，但 `tools/run-verification.mjs` 使用硬编码文件列表，必须在同一实施提交中接入新用例；后续按 02/T03 和 06 收敛到唯一清单。将来搬入 `unit/`、`integration/` 时同时修改所有发现入口，避免“局部可跑、test:all 漏跑”。

`recording-canvas.mjs` 的 `replay(calls)` 仍含历史数字调用表，本次在活跃客户端源码与测试中未发现调用。实施时再核对完整消费者；无消费者则删除该方法，有消费者则迁为产品命名的绘制命令。普通记录 Canvas 功能继续保留。

### R03.3 固定最低覆盖边界

完成上述迁移后，记录当前已有领域回归的实际覆盖：join、移动、花瓣交换、战斗、死亡、拾取、重生、快照 delta/删除与菜单交互。缺项分配到明确的新用例，不能以“剩余 13 个测试文件”或一次启动成功替代。巨型 `test_main.cpp` 的整体拆分留到最低回归建立之后；先核对归档适配测试移除时有没有一起移除产品断言。

## R04. 完成 03 的布局退役和全量生成

### R04.1 分离真实产品不变量

把 `engine/src/schema/contracts.cpp` 的 IEEE754、八位字节、`f32` 存储宽度和 `EntityHandle` 宽度检查迁入 `engine/src/core/contracts.cpp`。handle 与容量检查直接依赖当前产品类型、常量及编码规则，不再通过旧 `EntitySlot`、旧 `World` 数组证明正确。

逐个确认以下引用后，同批更新 native 和 wasm 构建：

1. 从 `engine/CMakeLists.txt` 与 `tools/build-engine-wasm.mjs` 的源列表移除旧 contracts，加入新的 core contracts。
2. 从生成器移除旧 layout 的 C++/TS/文档输出；产品 wire component/field 映射仍由协议生成。
3. 退役 `tools/check-schema-layouts.mjs`、`engine/tests/unit/test_schema_contracts.cpp`、`test_schema_contracts.test.mjs` 以及 CMake 的 emit-probe、executable、CTest 注册。其通用的输入校验价值迁入产品 schema 测试。
4. 全量追踪 `engine/include/engine/schema/generated.hpp`、`client/src/schema/generated.ts` 和 `schema/layout/*.yaml` 消费者，确认迁出后再撤出活跃树。不要顺便删除 04 尚未处理的领域存储模型。
5. 将 `schema/generated/contracts.json` 中的产品协议单独生成为 `schema/generated/protocol-contracts.json`；同步修改协议测试、生成器和其他真实消费者，停止读取旧混合 JSON。

对仍未归档的旧 layout、检查器及生成物，一次性追加到 `archive/addenda/02-03-completion/tree/`，附独立 inventory 和迁移说明，记录实际实施提交、原路径、哈希及去向。保持 `archive/tree/` 和原 `inventory.json` 原字节，避免重跑原脚本重算、覆盖历史记录；追加归档同样不得成为活跃输入。

### R04.2 一个入口管理全部产品输出

按 03/S02 建立 `tools/schema/` 的加载、验证、协议、transport、目录、掉落和写入模块，以及 `tools/generate.mjs` 统一入口。模块导入只声明函数；文件写入由 CLI 显式触发。

| 输入所有者 | 统一生成所需覆盖的输出 |
| --- | --- |
| `schema/protocol.yaml` | `engine/include/engine/net/generated_protocol.hpp`、`client/src/schema/protocol.ts`、新的 product protocol contracts |
| `schema/transport.json` | `engine/include/engine/net/packet_key.hpp`、`client/src/schema/packet-key.ts` |
| 产品目录与出生/战斗输入 | `catalog_types.hpp`、`generated_catalog_data.hpp`、`entity_spawn_defaults.hpp`、`petal_combat.hpp`、两端目录/花瓣视图 |
| 产品掉落规则与展示差异 | 派生 `drop-chances.json`、`drop_chances.hpp`、`mob-gallery.ts` |
| `CHANGELOG.md` | `client/src/schema/menu-content.ts` |

当前 `schema:generate` 仅调用 `gen-contracts.mjs`，花瓣、图鉴和菜单仍有独立 CLI。后续令这些命令委托统一模块，或作为明确子任务由统一入口调用；不要保留多份生成逻辑。

生成器先完成所有输入校验、纯计算和输出清单，再开始写入，防止坏输入导致半套输出更新。`schema:check` 仅比较内存中的预期与磁盘文件，不创建目录、不写内容；缺失、过期、清单中的废弃输出均失败。废弃文件只能按生成器自己的已登记路径处理，不能清空包含手写代码的整个目录。

transport 在已迁移数据上增加校验：`keyHex` 为恰好 512 个十六进制字符，解码为 256 个字节，算法/编码/版本有效。只按两个字符切分和 `parseInt` 不足以拒绝非法字符。产品测试使用人工短向量验证 XOR 语义，C++/TS 生成字节一致性另测；不把归档 key 读取加入日常校验。

## R05. 恢复产品数据的可维护生成能力

### R05.1 目录字段去重时保留语义

核对 `petal_defaults.hpp`、`petals.json`、`petal-combat.json` 的所有重叠字段，建立逐属性所有者表。将 collisionRadius、显示字号和绘制半径分开；用生成视图或 Catalog 替代手写 39 行表，并迁移 `petals.cpp` 的每个消费者。`drop_table.hpp` 在确认消费者后撤出，实际掉落统一经当前 Catalog 获取。

`gen-client-petals.mjs` 的 `collisionRadius || 10` 改为显式存在性与合法性校验：若当前规则允许 0，应原值保留；若不允许则明确拒绝，不静默补 10。`field100/104/108/109/110/112` 按实际使用分别命名、移出或暂保留为标注用途的 opaque 值。

01 已删除部分 catalog 来源字段，不能再把“删除 source 元数据”当作后续主要工作。先用 Git 一次性比对已改目录的数值、ID、数组顺序、别名和显示数据；发现业务值差异则独立列明原因。新日常测试用产品规则和小样例，不运行 Git 对照或读取历史快照。

### R05.2 从已归档脚本提取纯掉落算法

1. 人工阅读 `archive/tree/tools/derive-drop-chances.mjs`；将纯计算改写为 `tools/schema/drop-chances.mjs`，显式接收实体、出生规则、花瓣、权重和别名输入，无模块顶层读写和原版导入。
2. 新建 `schema/catalogs/drop-rules.json` 作为面积权重、稀有度分配质量、子实体贡献、reference species、过滤阈值和排序规则的人工来源。当前 `drop-chances.json.constants` 可用于核对；其中 referenceMass/speciesMass 等计算结果继续派生，不能再人工维护一份。
3. 初次迁移保留现有浮点截断位置、遍历顺序、别名行为、概率阈值与同概率排序。记录与现有产品表的逐项比较；重构时不顺便改变掉落数值。
4. 用少量人工实体、两个出生区域、子实体和别名建立独立算例。覆盖缺失 ID、别名环、零分母、NaN/Infinity、概率范围和排序；实际独立掉落概率不强加每行和为 1。
5. 由统一生成入口更新派生 JSON 和 C++ 视图；只读 check 比较全部结果。移除新生成注释中“本次已由原版验证”的过时陈述。

不要运行归档旧脚本的 `--verify`。它除了执行原版，还比较带旧 `source` 块的整个输出，与已清理后的活跃 JSON 契约不同；修改路径或仅删除原版导入都不足以建立产品生成流程。

### R05.3 保留图鉴差异并纠正内容来源记录

先列 `client-gallery.json` 与运行掉落表在实体、花瓣、概率和顺序上的差异。确实需要的显示差异存入有原因的 `gallery-overrides.json`；其余从产品掉落数据生成。建立 UI 展示回归后再替换来源，不静默将两张表强制相等。

菜单继续采用已实现的 `CHANGELOG.md` 单一人工来源。把实际路径、生成输出和旧 migration map 的偏差写入追加记录；给解析器补必要的版本、日期、多行说明与空内容失败回归。不要创建 map 中未实现的 `schema/content/changelog.json` 来形成双写。

## R06. 补齐 02 的跨端验证和完整测试入口

新增 `engine/tests/integration/snapshot_fixture.cpp`，仅链接当前 `engine_core`，经实际 `WorkerApi` 的输入、think 和当前 publisher 生成确定的包。native 可执行文件放构建目录，测试输出放临时目录；不读取旧 replay 输入，不依赖原版布局或 oracle ABI。

新增 `tests/integration/snapshot-roundtrip.test.mjs`，解码上述包并断言 join、状态变更、delta、省略与零值、删除、库存与事件顺序。输入为项目自行定义的种子和命令；另保留少量手工字节向量，避免所有预期仅来自同一 schema/encoder。

现有真实 Worker 用例继续验证实际交付 wasm → TS 链路；native fixture 不替代 Worker 初始化、内存复制和 RPC 生命周期检查。为这组用例提供 `test:integration`，并加入 `test:all`。

测试分类或新增文件时同步修改 `package.json`、`tools/run-verification.mjs` 和必要的 CMake 注册。测试清单应有一个所有者，局部运行与完整运行读取同一份定义；空分类、必需浏览器缺失、fixture 缺失、失败子进程均非零退出。

## R07. 推荐提交批次与依赖

| 批次 | 内容 | 进入下一批前的条件 |
| --- | --- | --- |
| C0：现状对照 | 记录提前归档错误、逐项迁移表、实际入口和未完成项 | 旧位置都有可查来源；已迁移与未验证明确区分 |
| C1：最低回归 | 核验已迁测试、重写文本缓存产品测试、接入完整 runner | 相关产品回归实际运行通过，未激活归档 |
| C2：布局退出 | core contracts、wire/layout 分离、撤掉 probe 与旧生成物 | native/wasm 均使用产品不变量；协议向量与快照回归通过 |
| C3：生成入口 | 全量 generate/check、输出清单、transport 校验 | 二次生成相同、check 无写入、缺失/篡改输出会失败 |
| C4：目录与掉落 | 属性所有者、纯掉落规则、图鉴覆盖和菜单映射 | 数值与排序迁移差异可解释，独立规则测试通过 |
| C5：完整回归 | 独立 native → TS fixture、现有 wasm 链路、覆盖清单与测试分类 | 测试发现完整，02/T04 的必需主题有对应证据 |
| C6：隔离验收 | 无 archive、无旧产物的产品源码副本完整生成/构建/验收 | 02/03 剩余项有新证据，再进入 04—08 |

C2—C4 每批都需要相关测试，不能先改完全部生成流程再补回归。04 的少量构建衔接和 06 的发现入口修正可随批次进行；大范围结构拆分和性能优化在本次纠偏闭环后继续。

后续实际运行时先用现有 `test:unit`、`test:tools`、`test:engine`、`test:client` 验证相关变化。`schema:check`、`test:integration` 等目标命令在对应批次实现后再使用，不能把“命令不存在”改成跳过，或只运行现有 `npm test` 就声明完整验收。

## R08. 纠偏完成的验收证据

实施时建立不含 `.git`、`archive/`、`node_modules/`、`build/`、旧 `dist*` 与 `reports/` 的临时产品源码副本，保留产品静态资源，剔除 `client/public/` 中旧编译 JS/wasm。按环境文档安装固定依赖/工具链，再生成、构建、完整测试并验证新 `dist-next`。该副本不需要恢复旧源码，也不能回到原目录读取归档。

本阶段完整命令内部应包含生成一致性、native、client、工具、独立跨端、真实 wasm 和交付检查；已有 `test:all` 覆盖的项目不重复跑一遍。按 06 整理身份与证据，记录本次源码提交、工具链、执行结果及交付哈希，历史报告不计入本次结果。

- [ ] C0—C6 每个保留的产品能力有明确来源、实现位置和验证，不以文件消失代表完成。
- [ ] 原归档清单及其已登记文件未被修改；后补归档有独立记录，未重新激活历史入口。
- [ ] 新产品脚本、测试、生成器和构建均不读取归档、旧 Git 提交、旧 goldens 或原版 WASM。
- [ ] 文本缓存及其他混合测试的产品覆盖已核对；没有依赖旧全局 before 钩子或 skip 掩盖缺口。
- [ ] 原版 layout/probe 完全退出活跃链路，当前 wire 映射与真实 ABI 不变量仍有独立验证。
- [ ] 全量生成可重复，check 无写入，坏输入和过期/缺失输出明确失败。
- [ ] 掉落、图鉴、目录和菜单具有清晰的人工输入与派生输出边界。
- [ ] 无归档、无旧产物副本的产品验收通过，才将 02/03 对应目标标为完成。

只有新引入的具体回归需要回退时，优先回退对应产品调整；保留归档停用边界。若证据表明确有独立能力丢失，再从归档或旧提交人工提取最小产品实现并补测试，不以整体恢复历史树作为常规修复手段。
