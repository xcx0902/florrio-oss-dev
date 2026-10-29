# 03：数据与代码生成脱离逆向来源，建立唯一产品事实来源

> 状态：待实施。此阶段先处理数据，随后才能完整归档 `source/` 与 `reference/`。

## S01. 分清产品协议与原版内存布局

当前 `schema/` 同时存放原版 WASM 内存视图、协议字段、目录数据和探针输出。它们的维护责任不同：

- `schema/protocol.yaml` 的输入命令、Worker envelope、快照 framing、sparse/dense 与事件是当前产品在用的协议，应保留并版本化。
- `schema/layout/*.yaml` 的 World/EntitySlot/绝对地址等是原版内存视图，不能继续成为当前 C++ 对象布局的发布约束。
- `schema/generated/layout-probe.json`、目录中的函数编号、虚表地址和原始 bytesHex 是历史证据，需要归档；当前游戏规则数值则需要成为独立产品输入。

先以 include/import 与读文件调用确认消费者，再执行：

| 现有文件 | 具体处理 |
| --- | --- |
| `schema/layout/*.yaml`、`schema/generated/layout-probe.json` | 连同旧布局生成器和 probe 测试归档 |
| `engine/include/engine/schema/generated.hpp`、`client/src/schema/generated.ts` | 当前静态检查未发现正常领域消费者，主要关联旧 contracts；归档前做全量消费者核对并移除旧编译依赖 |
| `engine/src/schema/contracts.cpp` | 原版布局断言归档；IEEE754、handle 宽度等产品不变量迁到 `engine/src/core/contracts.cpp` |
| `schema/generated/contracts.json` | 原文件归档；新建仅由产品 schema 生成的 `schema/generated/protocol-contracts.json`，不夹带旧布局 |
| `tools/check-schema-layouts.mjs`、CMake schema probe targets | 原版布局检查归档；产品数据校验进入新 schema check |

产品协议中用于解码的 component ordinal/offset 映射，当前仍影响 dense presence 与领域投影。必须先提取当前协议必需的部分，命名为 wire component/field 的映射；不能和原版 C++ 内存结构一起删除，也不能再将 wire offset 当成领域实体成员地址。

## S02. 解除生成器对 `source/semantic` 的硬依赖

`tools/gen-contracts.mjs` 约 607 行。完整模式在读取现有 `schema/catalogs/*.json` 后，仍额外读取 `source/semantic/server-catalogs.json`；其中 `packetXorKeyHex` 直接生成 C++/TS 两份 key。若先移动 `source/`，生成就会失败。

具体目标：

1. 将在用的 256-byte key 提升为 `schema/transport.json`，定义长度、编码、协议版本和作用；生成器只读取该产品输入。迁移时比较已有 C++/TS key，保证字节不变。
2. 从 `gen-contracts.mjs` 移走原版结构体布局生成，保留产品协议和目录的纯生成逻辑。
3. 拆成 `tools/schema/{load,validate,protocol,catalogs,transport,write}.mjs`，由一个 `tools/generate.mjs` 负责调用；不让多个 CLI 在 import 时自动写文件。
4. 输出内容只依赖输入数据和生成器版本，不带时间戳、机器路径或原版文件存在性检查。
5. 全量支持 `--check`：将预期内容生成到内存并逐文件比较；缺失、过期、已废弃输出均报错，check 模式不写文件。目前 `--check` 仅支持 protocol-only，需要扩展而不是保留为完整校验假象。

## S03. 合并重复花瓣与实体数据

已确认的重叠来源：

- `schema/catalogs/petals.json` 与 `engine/include/engine/catalog/petal_defaults.hpp` 都维护花瓣半径、充能和实例数；后者是手写的 39 行表，`petals.cpp` 多次线性遍历。
- `petal-combat.json` 定义碰撞半径/伤害/血量，客户端 `petals.ts` 又组合显示字段。
- `engine/include/engine/catalog/drop_table.hpp` 保有一套实体→花瓣 ID 表，当前运行代码通过 `Catalog::drop_table` 获取生成的数据，旧表主要见于测试。
- `client/src/schema/{catalogs,petals,mob-gallery}.ts` 是多个生成器的输出，不能作为第二套人工编辑数据。

修改方式：

1. 维持按领域拆分的 JSON，但约定每个属性只在一个输入里拥有定义权：基础花瓣/实体、花瓣战斗、出生默认、生成规则、掉落规则/概率、显示文字、稀有度。
2. 把表中含糊的 `radius` 在产品输入中明确拆成 `collisionRadius`、`labelFontSize` 或 `drawRadius`；保留现有不同语义的数值，不能一律用 14 或 10 合并。
3. 将 `petal_defaults.hpp` 改为从 schema 生成的视图或由 `Catalog` 提供同样字段，删除手写表；逐个改造 `petals.cpp` 的消费者。
4. 删除旧 `drop_table.hpp` 的重复运行实现；如果旧测试只验证原版 ID 表则归档，产品掉落测试改验证当前 Catalog。
5. 生成按 typeId 查找的索引/稀疏数组和显式缺省值，避免每次 `find`；typeId 稀疏时保留缺项语义，不假设永远连续。
6. `gen-client-petals.mjs` 中 `collisionRadius || 10` 改为数据校验加明确缺省策略，避免合法的 0 被当成缺失。

验收：修改一次充能/实例数，C++ 与 TS 输出一致；修改显示字号不会改变碰撞半径；删除一项必要战斗数据时生成失败，而非静默补 10。

## S04. 将探针输出提升为产品数据，保存可追溯来源

`petals.json`、`entities.json`、`entity-spawn-defaults.json`、`client-gallery.json` 含原版 source/probe 元数据。实施时：

- 完整原文件先存归档。
- 活跃数据使用明确字段与 ID；必要来源只保留 `originSnapshotId` 和可阅读的归档记录，不在生成时打开原版 WASM 验证哈希。
- `field100/104/108/109/110/112` 等字段按实际消费者逐个清理：有明确用途则改为领域名；无运行用途则移入历史来源；语义尚不确定但当前运行依赖的字段先保留为明确标注的 opaque 值，不臆造含义或丢值。
- `entity-spawn-defaults` 中 dynamicRadius/dynamicHealth 对应的随机公式仍由领域实现提供；探针采样值不能替代运行时随机规则。
- `source`、`confidence` 等证据字段不再通过“能编译”自动升级；产品可维护性来自明文规则和产品回归。

## S05. 重写掉落生成和图鉴数据流程

当前 `derive-drop-chances.mjs` 的纯计算部分读取产品 JSON，但常量写在脚本中；`--verify` 会导入 `test/helpers/wasm-probe.mjs` 执行原版。`gen-mob-gallery.mjs` 则单独读取原版 client gallery，可能与运行掉落表具有不同用途。

目标操作：

1. 归档旧计算脚本和其原版 verify 分支。把仍需维护的产品分配算法迁为 `tools/schema/drop-chances.mjs` 的纯函数，输入为 schema 中的面积权重、稀有度质量、子实体贡献与别名规则。
2. 对掉落表进行范围、有限值、ID 引用、别名无环校验。若概率是各项独立概率，则不添加错误的“每行和必须等于 1”约束。
3. 明确区分实际掉落和展示信息。当前显示若确实需要与运行值不同，使用 `schema/catalogs/gallery-overrides.json` 的小型差异层，并注明原因；其余从同一产品掉落数据生成。
4. 不静默将旧客户端表替换成服务器表；先列差异与现有 UI 回归，再决定保留哪些显示覆盖。
5. 新 `schema:check` 比较计算结果与提交输出，并验证规则；不再通过调用原版确认结果。

## S06. 菜单内容和更新记录退出原版提取

`gen-menu-content.mjs` 当前直接实例化 `web/client.wasm`、调用 `Nf()` 并读取地址 165440 的 35 条旧更新记录。它必须归档，而不是只改一个路径。

将原始 changelog 与旧生成 TS 保存归档。活跃菜单改读 `schema/content/changelog.json`，记录本项目版本、日期和变更；以 `CHANGELOG.md` 或该 JSON 之一为唯一人工来源，另一份由工具生成，明确选择后不双写。此次迁移不编造新版本已发布的事实。

昵称、设置键和已有用户存储数据的读取维持兼容；菜单文字迁移不应清空存档。

## S07. 新生成与校验命令的具体契约

建议由 06 落地以下命令：

```sh
npm run schema:generate  # 只读产品 schema，更新所有 C++ / TS / 合约输出
npm run schema:check     # 不写文件；结构、引用、派生数据与生成物一致性
```

每项生成输出有明确所有者和清单，覆盖 `generated_protocol.hpp`、`protocol.ts`、packet key、Catalog、出生/战斗/掉落表、客户端显示表。删除输入项时清理失效的生成输出，不能被旧文件继续满足编译。

- [ ] `schema:generate` 在不带归档的源码副本运行成功。
- [ ] 连续生成两次得到相同字节；`schema:check` 不修改任何跟踪文件。
- [ ] 手改任一生成 C++/TS 或删掉必要输出时，check 失败。
- [ ] 重复 ID、未知实体/花瓣引用、别名环、非法浮点、损坏协议声明被明确拒绝。
- [ ] 引擎编译不再包含原版内存布局生成物，当前 wire 映射仍完整可解码。
- [ ] 增加一个现有行为类型的新花瓣，只需改一处产品数据，再生成即可同时被两端识别。
