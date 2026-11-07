# 实施清单

**当前状态：P0 基线、P1 格式/工具、P2 标识/常量、P3 字段/行为、P4 协议模型、P5 函数接口、P6 精简与当前说明和 P7 最终验收已完成。**

日期和基线见 [README](README.md)。实际执行时逐项填写证据；复选框只在对应工作及检查真正完成后勾选。不能因本次提供了计划就把实施项标记完成。

## P0 — 当前基线

- [x] 核对当前 HEAD、工作区和适用约定，确认与审阅基线的差异。证据：[p0-baseline](evidence/p0-baseline.md) §1–2。
- [x] 核对工具版本、依赖、浏览器、Emscripten 和前置环境。证据：[p0-baseline](evidence/p0-baseline.md) §2。
- [x] 运行当前 schema 和全量验收，记录真实结果及已有失败。证据：`schema:check` 20 outputs；基线 `test:all` 17/17，runId `2026-11-02T23-11-30.963Z-d140d940`，见 [p0-baseline](evidence/p0-baseline.md) §3–5。
- [x] 完成全量字段读写/导出/序列化处置表。证据：[p0-field-disposition](evidence/p0-field-disposition.md) 与 891 行 [p0-field-inventory](evidence/p0-field-inventory.md)。
- [x] 完成参数、死代码、业务字面量和历史表示清单。证据：[p0-literals-parameters-deadcode](evidence/p0-literals-parameters-deadcode.md)（A01–A05、D01–D06、L01–L06、H01–H10）。
- [x] 确认保护字节、精度、RNG、生命周期和跨端行为的现有用例及缺口。证据：[p0-protected-scenarios](evidence/p0-protected-scenarios.md)，缺口 G01–G06。

## P1 — 格式和工具

- [x] 新增统一编辑、TS/JS、C++ 及配置格式约定，锁定工具版本。证据：[p1-format-batch](evidence/p1-format-batch.md) §1–2；`.editorconfig`、`.prettierrc.json`、`.clang-format`、`.cmake-format.yaml`、`tools/format-tools.lock.json`。
- [x] 建立 `format`、`format:check`、`lint`、`check:refactor`。证据：`package.json`、`tools/format.mjs`、`eslint.config.mjs`、`tools/check-refactor.mjs`；[p1-format-batch](evidence/p1-format-batch.md) §5。
- [x] 将规范检查接入统一 gate 和适用的轻量入口。证据：`tools/verification/gates.mjs` 的 format/lint/refactor rules 三个 gate；`test:light` 与 Linux CI 同步。
- [x] 先格式化生成文本，再计算内容身份和输出清单。证据：`tools/schema/outputs.mjs`、`tools/schema/format.mjs`、`tools/schema/write.mjs`；`schema:check` 20/20。
- [x] 展开网络、服务端、生成器和测试中的压缩逻辑。证据：[p1-format-batch](evidence/p1-format-batch.md) §4；重写 `FLORR_SERVER_NUMBERS` 宏为逐项一行。
- [x] 完成其余手写代码、静态入口和生成输出的格式整改。证据：[p1-format-batch](evidence/p1-format-batch.md) §4；`format` 覆盖 503 个文件、20 个生成输出。
- [x] 单独审查格式差异并完成对应验证。证据：[p1-format-batch](evidence/p1-format-batch.md) §5–6；最终 `test:all` 20/20 stable，runId `2026-11-03T00-42-22.702Z-88087b63`。

## P2 — 标识和常量

- [x] 为全部花瓣、生物定义稳定唯一 symbol，并校验语言转换冲突。证据：[p2-identifiers](evidence/p2-identifiers.md) §RF-L1；`petals.json` 39 个、`entities.json` 23 个、`rarities.json` 8 个 symbol。
- [x] 从单一 schema 生成 C++/TS 身份类型，登记新增输出。证据：[p2-identifiers](evidence/p2-identifiers.md) §RF-L1–L2；`ids.hpp`、`catalog-ids.ts`、`state_flag_bits.hpp`、`state-flags.ts`、`loadout_rules.hpp`、`loadout.ts` 均登记在 `tools/schema/outputs.mjs`。
- [x] 统一并复用实际稀有度、opcode、事件、动作和消息类型。证据：[p2-identifiers](evidence/p2-identifiers.md) §RF-L3；`InputOpcode`、`MessageType`、`SNAPSHOT_EVENT`、`EventKind`、`PlayerExpressionFlag`。
- [x] 命名实际 snapshot 字段、组件、标志和协议上限。证据：[p2-identifiers](evidence/p2-identifiers.md) §RF-L3–L4；`inventory`、`EntityKind`、`EntityFlag`/`WorldFlag`/`ActivityFlag`/`PetalVariantFlag`、`protocol.hpp` 上限别名。
- [x] 按职责整理 slot/instance/容量、解锁、计时和数值规则。证据：[p2-identifiers](evidence/p2-identifiers.md) §RF-L4；`schema/catalogs/loadout.json` + `loadout_rules.hpp`/`loadout.ts`；tick 由 `static_assert(kTickMilliseconds == net::kTickMs)` 约束。
- [x] 替换业务裸 ID，移除对 ID 连续性和算术差值的族群假设。证据：[p2-identifiers](evidence/p2-identifiers.md) §RF-L2；`catalog::is_*`、`petal_ordinal`、`PlayerLoadout`/slot 循环改用生成容量。
- [x] 验证数值不变、稀疏 ID、未知 ID 和跨端生成一致性。证据：[p2-identifiers](evidence/p2-identifiers.md) §RF-L5；schema 单元测试固定 C++/TS 值、稀疏/未知 ID；engine 19/19、integration 9/9。

## P3 — 字段和行为

- [x] 核查并删除无实际消费的 `opaque*` 全链字段。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §Removed；`entities.json` 的 `opaque100/104/108/110` 及生成结构字段已删除。
- [x] 核查并删除 `flags92`/`component_flags92` 及无效断言。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §Removed；spawn defaults 与 `Entity` 字段已移除，测试改为具名 flag。
- [x] 分别处理 catalog 的 `physicsFlag48` 与运行时物理字段。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §Physics；catalog 列删除，运行时使用 `uses_mass_weighted_response`/`skips_contact_response`。
- [x] 为有效实体/世界/物理/action/activity 标志建立具名类型和位。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §Named flags；`schema/catalogs/state-flags.json` 生成双端类型。
- [x] 将轨道函数编号替换为行为类型及真正需要的参数。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §Orbit；`PetalBehavior::{kOrbit,kRoseHeal}` + `healAmount`，Rose 10/22/3.5 保持。
- [x] 将 AI 历史回调编号替换为当前攻击行为类型。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §AI；`AttackBehavior::{kNone,kHornetStinger}`，旧回调枚举/未知计数已删除。
- [x] 审查 `HitEvent` 重复计数和其他无用字段。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §HitEvent；移除 `refcount`，合并时 `count` 只增一次；保留共享 `EffectPayload::refcount`。
- [x] 保持掉落抽取和其他必要状态的当前作用及随机顺序。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §Drop；`dropDrawCount`/`draw_drop_candidates`，每行一次 RNG，顺序由图生成表决定；golden 通过。
- [x] schema、生成器、运行时、测试和当前文档同步完成。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §Documentation；`schema:check` 26/26，unit/tools 断言更新。
- [x] 相关引擎、客户端、跨端和多人验证通过。证据：[p3-fields-behavior](evidence/p3-fields-behavior.md) §Verification；engine 19/19、unit 42/42、integration 9/9、client 143+88；最终 `test:all` 见 `reports/latest-run.json`。

## P4 — 当前协议模型

- [x] 完成所有字段和 dense 组的迁移对照表。证据：[p4-protocol-model](evidence/p4-protocol-model.md) §4；21 个组件、63 字段、旧组号→组件映射。
- [x] 移除 schema 中的旧构造函数编号和内存 offset。证据：`schema/protocol.yaml` 删除 `fieldComponents`，dense 组删除 `offset`，新增 `components`；[p4-protocol-model](evidence/p4-protocol-model.md) §2。
- [x] 用当前组件标识替换 dense 组旧 offset key 与查询接口。证据：`dense_fields.hpp` 的 `dense_group(Component)`/`dense_group_for_field`，生成 `Component` 枚举与按组件命名的 writer；[p4-protocol-model](evidence/p4-protocol-model.md) §3、§5。
- [x] 移除客户端 `components[constructor][offset]` 及重复合并状态。证据：删除 `buildComponents`、`FIELD_COMPONENTS`、`EntitySnapshot.components` 与 `world.ts` 的镜像合并；[p4-protocol-model](evidence/p4-protocol-model.md) §6。
- [x] 更新多人公开组策略，保持公开字段和真实 mask 不变。证据：`publicDenseGroups` 改为组件 `[20,21,26,30]`，`kPublicComponentMask`/`PUBLIC_COMPONENT_MASK` 仍为 `571998208`，公开字段列表不变；[p4-protocol-model](evidence/p4-protocol-model.md) §2。
- [x] 核查并处理旧输出 packet 内存 metadata 和 worker args metadata。证据：删除 `output.packet` 的 `headerBytes`/`lengthOffset`/`heapPayloadOffset`/`inlinePayloadOffset`/`inlinePayloadBytes`、`worker.functions[*].args`，以及两端 `PACKET_HEADER_BYTES`/`INLINE_PAYLOAD_BYTES` 常量；[p4-protocol-model](evidence/p4-protocol-model.md) §2、§5。
- [x] 删除公共旧名、永久适配、历史布局断言及相关说明。证据：删除 `dense_group_by_offset`、`kDenseFields<Offset>` 兼容块、`DENSE_GROUP_COMPONENTS`/`FieldComponent`，writer 按组件改名；[p4-protocol-model](evidence/p4-protocol-model.md) §5、§6。
- [x] 字节向量、dense/稀疏、事务失败、跨端及多人测试通过。证据：手写向量未改且逐字节相等，engine 19/19、unit 45/45、integration 9/9、server 30/30、client-unit 143/143、client-integration 见 §8；[p4-protocol-model](evidence/p4-protocol-model.md) §8。

## P5 — 函数接口

- [x] 删除两处轨道 helper 中未使用的 World 参数。证据：[p5-interfaces](evidence/p5-interfaces.md) §1；`assign_petal_orbit_indices(PlayerState&)`、`advance_loadout_orbit_phase(PlayerState&, double)` 及全部调用点。
- [x] 处理 `renderable`、`drawAnt`、`drawCactus`、`drawDrop` 的无用参数。证据：[p5-interfaces](evidence/p5-interfaces.md) §1；`renderable()`、`drawAnt(context,caste,now,flash,activity)`、`drawCactus(context,radius,flash)`、`drawDrop(context,type,ageMs,visual)`。
- [x] 处理 `drawPetalShape` 的 icon 参数及实际时间默认值语义。证据：[p5-interfaces](evidence/p5-interfaces.md) §1；删除 `_icon`，`_now` 改名 `now` 并保留 `phase = now * 0.001`。
- [x] 审阅其余 C++/TS/JS、生成器及测试 helper 参数。证据：[p5-interfaces](evidence/p5-interfaces.md) §2；删除死常量，审阅 `(void)` 用法，删除测试 helper 的重复 plan 解码器。
- [x] 同步所有声明、实现、调用、回调、导出和测试。证据：[p5-interfaces](evidence/p5-interfaces.md) §1 的触及位置列；无 forwarding 重载。
- [x] 无旧签名包装、占位传参和隐藏副作用，相关验证通过。证据：[p5-interfaces](evidence/p5-interfaces.md) §3；format/lint/refactor/schema、engine 19/19、unit 45/45、tools 29/29、integration 9/9、server 30/30、client 见 §3。

## P6 — 精简与当前说明

- [x] 删除 `orbit_angle_for` 和无用途保活指针等死代码。证据：[p6-simplification](evidence/p6-simplification.md) §1。
- [x] 收敛出生 factory，保留随机调用和空间索引同步次序。证据：[p6-simplification](evidence/p6-simplification.md) §2。
- [x] 收敛花瓣解绑共同步骤，保持充值/死亡/孵化差异。证据：[p6-simplification](evidence/p6-simplification.md) §3。
- [x] 清除 snapshot 镜像、无用 alias 和 fallback，核对缓存失效。证据：[p6-simplification](evidence/p6-simplification.md) §4。
- [x] 合并测试 helper 内部重复，保留独立向量与参考验证。证据：[p6-simplification](evidence/p6-simplification.md) §5。
- [x] 核对重复脚本、CMake 设置、imports/includes/re-exports 和动态入口。证据：[p6-simplification](evidence/p6-simplification.md) §5。
- [x] 重写全部活动代码、注释和测试名中的原版实现引用。证据：[p6-simplification](evidence/p6-simplification.md) §7；`check:refactor` 台账为空。
- [x] 更新当前 semantics/protocol/catalog/README，历史记录属性清楚。证据：[p6-simplification](evidence/p6-simplification.md) §8。
- [x] 全量处置表无未决项，相关回归和性能验证通过。证据：[p6-simplification](evidence/p6-simplification.md) §9；[p7-acceptance](evidence/p7-acceptance.md) §7。

## P7 — 最终验收

- [x] 按六项用户要求逐模块复审，无压缩代码及历史表示残留。证据：[p7-acceptance](evidence/p7-acceptance.md) §1。
- [x] 最终规范检查、类型检查和 schema 只读检查通过。证据：[p7-acceptance](evidence/p7-acceptance.md) §2。
- [x] 生成可复现，失败不部分写入，清单与最终内容一致。证据：[p7-acceptance](evidence/p7-acceptance.md) §2；`schema:check` 26/26。
- [x] 最终 `test:all` 全步骤通过，未降低阈值或跳过必需场景。证据：[p7-acceptance](evidence/p7-acceptance.md) §7。
- [x] 干净副本无需归档或旧产物即可重建并通过相同验收。证据：[p7-acceptance](evidence/p7-acceptance.md) §8。
- [x] catalog 身份、wire 行为、玩法、存储和外部 ABI 变化已按约定核对。证据：[p7-acceptance](evidence/p7-acceptance.md) §5。
- [x] Git 差异没有混入构建、缓存、依赖和旧报告。证据：[p7-acceptance](evidence/p7-acceptance.md) §6。
- [x] 填写实际命令、版本、runId、证据位置和交付说明。证据：[p7-acceptance](evidence/p7-acceptance.md) §8。

## 08 — 2026-11-07 当前源码复验

证据：[08 验收记录](evidence/08-verification.md)。上述 P0–P7 勾选保留历史实施事实，
当前 HEAD 的验收以本节及新记录为准。本轮复验已完成，主目录和副本均 20/20、stable。

- [x] 记录当前 HEAD、初始工作区、工具版本、首次失败及重跑原因。
- [x] 复审六项要求，补齐出生路径的具名身份与标志，保留数值和独立测试期望。
- [x] 连续两次生成均 `written: 0`，26 个输出及清单一致，schema/typecheck 通过。
- [x] 主工作树 `test:all`：20/20，`passed: true`、`stable: true`，runId `2026-11-07T00-03-30.402Z-56ea262b`。
- [x] 全新无缓存副本 `npm ci`、重建和相同全量 gate 通过，输入、生成和交付身份一致。
- [x] 完成两份 ledger、日志、报告哈希核对和最终交付说明，无未解决事项。

## 执行记录模板

| 阶段/任务             | 实际状态 | 变更文件/符号                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 验证命令与结果                                                                                                                                                                                                                           | 证据/runId                                                                                                                                                                                                                                                   | 日期       |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| P0 当前基线           | 完成     | 无产品改动，仅证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `schema:check` 20 outputs；基线 `test:all` 17/17；unit 41、tools 24、client unit 143、integration 9、browser 88、engine 19、server 30                                                                                                    | runId `2026-11-02T23-11-30.963Z-d140d940`；[p0-baseline](evidence/p0-baseline.md)                                                                                                                                                                            | 2026-11-03 |
| P0 字段/参数/保护清单 | 完成     | 无产品改动，新增证据与生成脚本                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 891 行字段表；A/D/L/H 清单；G01–G06 缺口                                                                                                                                                                                                 | [p0-field-disposition](evidence/p0-field-disposition.md)、[p0-field-inventory](evidence/p0-field-inventory.md)、[p0-literals-parameters-deadcode](evidence/p0-literals-parameters-deadcode.md)、[p0-protected-scenarios](evidence/p0-protected-scenarios.md) | 2026-11-03 |
| P1 格式工具与接入     | 完成     | `.editorconfig`、`.prettierrc.json`、`.clang-format`、`.cmake-format.yaml`、`eslint.config.mjs`、`tools/format.mjs`、`tools/check-refactor.mjs`、`tools/verification/gates.mjs` 等                                                                                                                                                                                                                                                                                                                                                                                 | `format:check`、`lint`、`check:refactor`、`schema:check` 全通过；`test:all` 20/20 stable                                                                                                                                                 | runId `2026-11-03T00-42-22.702Z-88087b63`；[p1-format-batch](evidence/p1-format-batch.md)                                                                                                                                                                    | 2026-11-03 |
| P1 性能回归修复       | 完成     | `tools/performance/browser.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 首次 54.6 FPS 失败；修复 warmup 起点后 60.005 FPS，20/20 通过                                                                                                                                                                            | 同上 runId；[p1-format-batch](evidence/p1-format-batch.md) §4–5                                                                                                                                                                                              | 2026-11-03 |
| P2 标识与常量         | 完成     | `schema/catalogs/{petals,entities,rarities,state-flags,loadout}.json`；`ids.hpp`/`catalog-ids.ts`、`state_flag_bits.hpp`/`state-flags.ts`、`loadout_rules.hpp`/`loadout.ts`、`catalog.hpp`、`input.cpp`、`worker_api.cpp`、`player_loadout.cpp`、snapshot 解码/渲染调用点                                                                                                                                                                                                                                                                                          | `format:check`、`lint`、`check:refactor`、`schema:check` 26/26；`test:unit` 42/42；`test:engine` 19/19；`test:integration` 9/9；client unit 143/143                                                                                      | [p2-identifiers](evidence/p2-identifiers.md)；最终 `test:all` 见 `reports/latest-run.json`                                                                                                                                                                   | 2026-11-03 |
| P3 字段与行为         | 完成     | `entity-spawn-defaults.json`、`petal-combat.json`、`state-flags.json`；`entity.hpp`、`world_records.hpp`、`petal_state.hpp`、`spawn.cpp`、`petals.cpp`、`loot.cpp`、`ai.cpp`/`species_attacks.cpp`、`attack_behavior.hpp`、`state_flags.hpp`；semantics 文档与引擎/客户端测试                                                                                                                                                                                                                                                                                      | `schema:check` 26/26；`test:engine` 19/19；`test:unit` 42/42；`test:tools` 29/29；`test:integration` 9/9；`test:server:native` 30/30；client 143+88                                                                                      | [p3-fields-behavior](evidence/p3-fields-behavior.md)；最终 `test:all` 见 `reports/latest-run.json`                                                                                                                                                           | 2026-11-03 |
| P4 协议模型           | 完成     | `schema/protocol.yaml`、`schema/multiplayer.yaml`、`tools/schema/protocol.mjs`、`tools/schema/multiplayer.mjs`、`generated_protocol.hpp`、`protocol-contracts.json`、`client/src/schema/protocol.ts`、`dense_fields.hpp`、`snapshot_codec.{hpp,cpp}`、`replication_session.cpp`、`multiplayer_wire.cpp`、`protocol.hpp`、`client/src/{state,net}` 解码/投影/world、两端测试                                                                                                                                                                                        | `schema:check` 26/26；`format:check`、`lint`、`check:refactor` 0 新增；`test:engine` 19/19；`test:unit` 45/45；`test:integration` 9/9；`test:server:native` 30/30；client unit 143/143、client-integration 88/88；手写字节向量逐字节相等 | [p4-protocol-model](evidence/p4-protocol-model.md)；最终 `test:all` runId `2026-11-04T12-07-20.257Z-0cb7807a`                                                                                                                                                | 2026-11-04 |
| P5 函数接口           | 完成     | `petals.{hpp,cpp}`、`pets.cpp`、`petal_lifecycle.cpp`、`tick.cpp`、`engine/tests/unit/*`；`client/src/state/world.ts`、`render/art/{species,drops,petals}.ts`、`render/world.ts`、`net/protocol.ts`、客户端测试；`client/tests/support/dense-codec.mjs`                                                                                                                                                                                                                                                                                                            | `format:check`、`lint`、`check:refactor`、`schema:check` 通过；`test:engine` 19/19；`test:unit` 45/45；`test:tools` 29/29；`test:integration` 9/9；`test:server:native` 30/30；client unit 143/143、client-integration 88/88             | [p5-interfaces](evidence/p5-interfaces.md)；最终 `test:all` runId `2026-11-04T12-07-20.257Z-0cb7807a`                                                                                                                                                        | 2026-11-04 |
| P6 精简与当前说明     | 完成     | `petal_lifecycle.cpp`（`take_orbit`）、`player_loadout.{hpp,cpp}`（`handles`/`retire_handle`）、`spawn.cpp`/`spatial.hpp`/`world.cpp`/`pets.cpp`、`player_loadout.cpp`；`client/src/state/{snapshot-types,snapshot-fields,snapshot-projection,world}.ts`、`net/snapshot-decoder.ts`、`render/{world,hud/*,art/*}.ts`；`client/tests/support/dense-codec.mjs`、`engine/CMakeLists.txt`、`package.json`、`tools/check-refactor.mjs`、`tools/schema/{drop-chances,catalogs}.mjs`；`engine/tests/unit/*`；`docs/semantics/{ai,tick,snapshot,loadout,world}.md`、README | `format:check` 523 文件；`lint`；`check:refactor` 台账空（`patterns: 0`）；`schema:check` 26/26；`test:engine` 19/19；`test:unit` 45/45；`test:tools` 30/30；client unit 143/143                                                         | [p6-simplification](evidence/p6-simplification.md)；最终 `test:all` 见 [p7-acceptance](evidence/p7-acceptance.md)                                                                                                                                            | 2026-11-05 |
| P7 最终验收           | 完成     | 无产品改动；新增 `client/src/state/snapshot-fields.ts`；证据与清单更新                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `format:check`、`lint`、`check:refactor`、`schema:check`、`typecheck` 通过；`test:all` 20/20；干净副本 `npm ci` + `test:all` 20/20                                                                                                       | [p7-acceptance](evidence/p7-acceptance.md)                                                                                                                                                                                                                   | 2026-11-05 |
| 08 当前源码复验       | 完成     | `engine/src/sim/{player,spawn}.cpp`；验收文档与机器摘要                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 两轮 `test:all` 均 20/20、stable；生成 26/26；输入、WASM 和交付产物一致                                                                                                                                                                  | [08 验收记录](evidence/08-verification.md)、[机器摘要](evidence/08-verification.json)                                                                                                                                                                        | 2026-11-07 |
