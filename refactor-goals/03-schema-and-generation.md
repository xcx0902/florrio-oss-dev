# 03：数据与代码生成脱离逆向来源，建立唯一产品事实来源

> 状态：`08e6b5b` 已迁出 transport key、调整 catalog 元数据并替换 changelog 生成；旧内存布局、重复目录和全量生成校验仍待完成。本次只更新方案，未执行生成、构建或测试。

## S00. 提前归档后的实际执行方式

此次存在**「先做了 01-archive-and-disable」的顺序错误**。当前无需恢复 `source/` 与 `reference/`；按 [10/R04—R05](10-continuation-after-early-archive.md#r04-完成-03-的布局退役和全量生成) 在现有产品树继续实施，归档与 `cc17564` 仅供人工追溯和一次性提取。

已完成的 key 迁出和 `CHANGELOG.md` 单一内容源核验后沿用；不得因旧步骤写了“从 source 提取”而再次接回旧路径。`schema/layout/*.yaml` 与 compiler probe 仍在活跃构建，删除 source 注释不代表原版内存布局已退役。`schema:generate` 已有入口，但 `schema:check` 尚不存在，完整 `--check` 仍不支持；下面保留的目标按实际剩余工作执行。

## S01. 分清产品协议与原版内存布局

当前 `schema/` 仍同时存放原版 WASM 内存视图、协议字段和目录数据；旧探针输出已归档。它们的维护责任不同：

- `schema/protocol.yaml` 的输入命令、Worker envelope、快照 framing、sparse/dense 与事件是当前产品在用的协议，应保留并版本化。
- `schema/layout/*.yaml` 的 World/EntitySlot/绝对地址等是原版内存视图，不能继续成为当前 C++ 对象布局的发布约束。
- `schema/generated/layout-probe.json` 已归档，目录来源元数据已做过清理；其余原版地址、结构与证据残留逐消费者继续审计，当前游戏规则数值需要保留为独立产品输入。

先以 include/import 与读文件调用确认消费者，再执行：

| 现有文件 | 具体处理 |
| --- | --- |
| `schema/layout/*.yaml` | 解除消费者后连同旧布局生成器和 probe 测试追加归档；已归档的 `layout-probe.json` 不重复移动 |
| `engine/include/engine/schema/generated.hpp`、`client/src/schema/generated.ts` | 当前静态检查未发现正常领域消费者，主要关联旧 contracts；归档前做全量消费者核对并移除旧编译依赖 |
| `engine/src/schema/contracts.cpp` | 原版布局断言归档；IEEE754、handle 宽度等产品不变量迁到 `engine/src/core/contracts.cpp` |
| `schema/generated/contracts.json` | 原文件归档；新建仅由产品 schema 生成的 `schema/generated/protocol-contracts.json`，不夹带旧布局 |
| `tools/check-schema-layouts.mjs`、CMake schema probe targets | 原版布局检查归档；产品数据校验进入新 schema check |

产品协议中用于解码的 component ordinal/offset 映射，当前仍影响 dense presence 与领域投影。必须先提取当前协议必需的部分，命名为 wire component/field 的映射；不能和原版 C++ 内存结构一起删除，也不能再将 wire offset 当成领域实体成员地址。

## S02. 解除生成器对 `source/semantic` 的硬依赖

归档前完整生成额外读取 `source/semantic/server-catalogs.json` 的 `packetXorKeyHex`。`08e6b5b` 已改读 `schema/transport.json`，本次人工核对 keyHex 与归档原值一致。当前继续完善输入校验、模块边界和全量生成检查，不再执行旧依赖迁移。

具体目标：

1. 沿用已迁出的 `schema/transport.json`，核验长度、编码、协议版本和用途；补恰好 512 个十六进制字符、256 字节及两端生成一致性的产品测试。日常生成只读取产品输入，不读取归档作比较。
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

归档前 `petals.json`、`entities.json`、`entity-spawn-defaults.json`、`client-gallery.json` 含原版 source/probe 元数据，`08e6b5b` 已做过清理。先以 Git 对照数值和字段保留情况，再补领域语义与来源记录：

- 完整原文件以 `cc17564` 为对照；实际已入归档者沿用，尚未保存的必要原件按 10/R04 的追加归档规则记录，不覆盖原 inventory。
- 活跃数据使用明确字段与 ID；必要来源只保留 `originSnapshotId` 和可阅读的归档记录，不在生成时打开原版 WASM 验证哈希。
- `field100/104/108/109/110/112` 等字段按实际消费者逐个清理：有明确用途则改为领域名；无运行用途则移入历史来源；语义尚不确定但当前运行依赖的字段先保留为明确标注的 opaque 值，不臆造含义或丢值。
- `entity-spawn-defaults` 中 dynamicRadius/dynamicHealth 对应的随机公式仍由领域实现提供；探针采样值不能替代运行时随机规则。
- `source`、`confidence` 等证据字段不再通过“能编译”自动升级；产品可维护性来自明文规则和产品回归。

## S05. 重写掉落生成和图鉴数据流程

旧脚本现位于 `archive/tree/tools/derive-drop-chances.mjs`，其纯计算读取产品 JSON，常量写在脚本中；旧 `--verify` 会执行原版。活跃 `gen-mob-gallery.mjs` 仍独立读取 `schema/catalogs/client-gallery.json`，与运行掉落表可能用途不同。按 10/R05 提取纯计算，不能恢复旧脚本调用。

目标操作：

1. 保留旧计算脚本和其 verify 分支的归档原样，把仍需维护的产品分配算法改写为 `tools/schema/drop-chances.mjs` 的纯函数。新增产品规则输入，管理面积权重、稀有度质量、子实体贡献与别名规则，派生值不双重人工维护。
2. 对掉落表进行范围、有限值、ID 引用、别名无环校验。若概率是各项独立概率，则不添加错误的“每行和必须等于 1”约束。
3. 明确区分实际掉落和展示信息。当前显示若确实需要与运行值不同，使用 `schema/catalogs/gallery-overrides.json` 的小型差异层，并注明原因；其余从同一产品掉落数据生成。
4. 不静默将旧客户端表替换成服务器表；先列差异与现有 UI 回归，再决定保留哪些显示覆盖。
5. 新 `schema:check` 比较计算结果与提交输出，并验证规则；不再通过调用原版确认结果。

## S06. 菜单内容和更新记录退出原版提取

原来直接实例化 `web/client.wasm` 的提取器已归档为 `archive/tree/tools/gen-menu-content-from-wasm.mjs`。当前 `tools/gen-menu-content.mjs` 已读取项目 `CHANGELOG.md` 并生成 `client/src/schema/menu-content.ts`，不再重复执行提取迁移。

沿用 `CHANGELOG.md` 作为唯一人工来源，核验旧内容留存、补解析与生成检查，并把菜单生成纳入统一入口。migration map 中提到的 `schema/content/changelog.json` 实际不存在，在追加记录中纠正替代位置，不为匹配旧计划新增第二份内容源。不得编造新版本已发布的事实。

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
