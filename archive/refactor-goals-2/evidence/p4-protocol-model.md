# P4 — 当前协议模型

状态：实现完成；目标检查与全量 gate 见 §8 和清单执行行。

## 1. 不变量

本阶段只改协议在 schema、生成器、引擎和客户端中的**内部表示**。以下内容按字节保持不变：

- 输出 packet 的字节（快照、事件、leaderboard、多人 payload）；
- 稀疏字段的编号、顺序和 terminator；
- dense 组的字段顺序、长度和 63 字节 dense payload；
- 事务行为：解码失败整包回滚，掩码/组件存在性一并回滚；
- 多人公开字段 `[2,4,7,8,9,11,12,22,26,28,31,36,38,49,50,53,54,55,59,62]`、
  公开组件 `[20,21,26,30]` 与 mask `571998208`。

字节不变由三组独立证据固定：手写字节向量（`tests/unit/protocol-contracts.test.mjs`）、
冻结的 C++ 基线（`tests/integration/single-player-baseline.test.mjs`）和
WorkerApi 原生 fixture（`tests/integration/native-snapshot.test.mjs`）。

## 2. Schema

`schema/protocol.yaml` 删除了旧的 `constructor`/`offset` 表示：

- 删除 `fieldComponents`（每个字段一条 `constructor` + `offset`）。字段到组件的归属
  改由 dense 组成员推导，组件本身在 `snapshot.components` 中声明一次。
- 新增 `snapshot.components`：以组件序数为 key（1..30），值为
  `{ name: kebab-case, payload: dense|none }`。没有 dense payload 的组件
  （`web-projectile-tag`=12、`projectile-tag`=18）显式声明 `payload: none`。
- `snapshot.denseGroups` 删除 `offset`，保留 `component` + `fields` /
  `extendedFields`；组按组件升序排列。
- `denseComponent30ExtraFields` 改名 `denseExtendedFieldCount: 6`，并新增
  `kExtendedDenseComponent` / `kExtendedDenseBaseFields` 常量。
- 删除 `output.packet` 的堆布局 metadata（`headerBytes`、`lengthOffset`、
  `heapPayloadOffset`、`inlinePayloadOffset`、`inlinePayloadBytes`）。输出 packet
  现在是"不透明字节 + 长度 + final 标志"，不再描述旧的 4096 字节内联缓冲区。
- 删除 `worker.functions[*].args`：worker 导出签名由 `engine/include/engine/abi.h`
  和 `engine/abi-exports.json` 定义，schema 不再维护第二份参数表。

`schema/multiplayer.yaml` 的 `publicDenseGroups` 由旧组号 `[116,120,140,152]`
改为组件序数 `[20,21,26,30]`（health、transform、collision-radius、identity），
派生 mask 仍为 `571998208`。

## 3. 生成的表

`tools/schema/protocol.mjs` 编译 `components`，为每个字段写入 `component`，
并校验：

- 组件序数 1..30、kebab-case 名称、名称唯一、`payload` 只能是 `dense`/`none`；
- dense 组必须引用已声明且 `payload: dense` 的组件，组件升序且不重复；
- 每个字段恰好属于一个 dense 组；
- `payload: dense` 与"是否有 dense 组"必须一致；
- 只有最后一个组件可以带 extended 字段，数量等于 `denseExtendedFieldCount`。

产物：

- `engine/include/engine/net/generated_protocol.hpp`：`enum class Component`、
  `component_bit(Component)`、`FieldDefinition{field,type,dense_type,component}`、
  `DenseFieldGroup{component,fields,extended_fields}`、
  `DenseGroupSpec{component,specs}`、按组件命名的
  `kDenseFields<Pascal>` / `kDenseSpecs<Pascal>`。旧的 `kFieldComponents`、
  `kDenseFields<Offset>` 不再生成。
- `client/src/schema/protocol.ts`：`Component`、`componentBit`、
  `DENSE_GROUPS[{component,name,fields,extendedFields}]`、
  `DENSE_GROUP_SPECS[Component.X]`。旧的 `DENSE_GROUP_COMPONENTS`、
  `FIELD_COMPONENTS`、`FieldComponent` 不再生成。
- `schema/generated/protocol-contracts.json`：`components[]` 与
  `denseGroups[].component`。

## 4. 字段与 dense 组迁移对照表

组件表（`snapshot.components`，21 项，其中 19 项有 dense payload）：

| 组件 | 名称               | dense 字段                                  |
| ---: | ------------------ | ------------------------------------------- |
|    1 | drop-state         | 22, 54                                      |
|    2 | ai-activity        | 36                                          |
|    5 | petal-variant      | 9                                           |
|    6 | player-controller  | 1, 5, 6, 16, 20, 21, 24, 32, 34, 47, 56     |
|    7 | petal-species      | 50                                          |
|    8 | reserved-8         | 13, 37                                      |
|   10 | reserved-10        | 17                                          |
|   12 | web-projectile-tag | —（`payload: none`）                        |
|   14 | reserved-14        | 43                                          |
|   15 | reserved-15        | 23, 57                                      |
|   16 | loadout-record     | 3, 10, 11, 12, 19, 30, 39, 42, 45, 46, 52   |
|   18 | projectile-tag     | —（`payload: none`）                        |
|   19 | reserved-19        | 48                                          |
|   20 | health             | 53, 55                                      |
|   21 | transform          | 8, 28, 49                                   |
|   22 | reserved-22        | 29, 40                                      |
|   25 | lifecycle          | 38                                          |
|   26 | collision-radius   | 7                                           |
|   27 | inline-record      | 4, 15, 18, 25, 27, 33, 35, 41, 44, 51       |
|   28 | reserved-28        | 14                                          |
|   30 | identity           | 2, 26, 31 + extended 58, 59, 60, 61, 62, 63 |

全部 63 个字段的 `字段 → dense 类型 → 组件` 对照由
`schema/generated/protocol-contracts.json` 的 `fields[]` 提供，并由
`tests/unit/protocol-contracts.test.mjs`（“components are declared once…”，逐字段
断言组件已声明且 `payload: dense`）和
`client/tests/integration/snapshot-codec.test.mjs`（“field component map covers
every ordinal”，1..63 全覆盖）锁定。旧组号与新组件的对应关系：

| 旧 offset key | 旧语义                  | 新组件                             |
| ------------: | ----------------------- | ---------------------------------- |
|            52 | drop-state              | `Component::kDropState` (1)        |
|            56 | ai-activity             | `Component::kAiActivity` (2)       |
|           -16 | loadout-record          | `Component::kLoadoutRecord` (16)   |
|            72 | player-controller       | `Component::kPlayerController` (6) |
|           116 | health                  | `Component::kHealth` (20)          |
|           120 | transform               | `Component::kTransform` (21)       |
|           140 | collision-radius        | `Component::kCollisionRadius` (26) |
|           152 | identity（含 extended） | `Component::kIdentity` (30)        |
|           -27 | inline-record           | `Component::kInlineRecord` (27)    |

## 5. 引擎

- `engine/include/engine/net/dense_fields.hpp`：查询接口改为
  `dense_group(protocol::Component)` 与 `dense_group_for_field(std::uint32_t)`。
  删除 `dense_group_by_offset(int)` 和 `using protocol::kDenseFields<Offset>…`
  兼容名块。
- `engine/include/engine/net/snapshot_codec.hpp` /
  `engine/src/net/snapshot_codec.cpp`：按组件重命名 writer，删除组号名：

  | 旧名                              | 新名                                  |
  | --------------------------------- | ------------------------------------- |
  | `write_dense_byte_group52`        | `write_dense_drop_state`              |
  | `write_dense_health_angle_groups` | `write_dense_health_transform_groups` |
  | `write_dense_group72`             | `write_dense_player_controller`       |
  | `write_dense_group152_base`       | `write_dense_identity_base`           |
  | `write_dense_group152_extended`   | `write_dense_identity_extended`       |
  | `write_dense_group_minus16`       | `write_dense_loadout_record`          |
  | `write_dense_group_minus27`       | `write_dense_inline_record`           |

  `kDefaultDenseComponentMask` 由 `protocol::component_bit(...)` 组成，位值不变
  （`1<<0 | 1<<1 | 1<<5 | 1<<19 | 1<<20 | 1<<25 | 1<<29`）。writer 内部写出的
  字段顺序和字节数完全不变。

- `engine/src/net/replication_session.cpp`：公开集合用命名常量
  `petalVariantMask`、`petalSpeciesMask`、`webProjectileMask`、`projectileMask`
  表达，不再用 `1U << (ordinal - 1)`。
- `engine/src/net/multiplayer_wire.cpp`：`validate_public_entity` 用
  `core`（`kPublicComponentMask`）+ `renderComponents`（组件 5/7/12/18）判断
  声明集合，替代裸 `1U << n`。
- `engine/include/engine/net/protocol.hpp`：删除旧输出 packet 的
  `kPacketHeaderBytes`、`kInlinePayloadBytes`；保留真实协议值
  `kMaxInputPacketBytes`、`kOutputQueueCapacity`、`kPacketXorKeyBytes`。
- 公开旧名未保留任何 forwarding 重载；调用点（`snapshot_publisher.cpp`、
  `replication_session.cpp`、引擎测试 `.inc`）全部改为新名。

## 6. 客户端

- `client/src/state/field-types.ts`：导出生成的 `Component`、`DENSE_GROUPS`、
  `DENSE_GROUP_SPECS`；新增 `componentBit`；`densePresentForMask` 以组件序数为
  key。删除 `DENSE_GROUP_COMPONENTS`、`FIELD_COMPONENTS`、`FieldComponent`。
- `client/src/net/snapshot-decoder.ts`：`DenseGroupPlan { component, specs }`；
  组件存在性来自 mask 与 ordinal 声明；extended gate 用
  `EXTENDED_DENSE_COMPONENT` / `EXTENDED_DENSE_BASE_FIELDS`，不再比较 `152`。
- `client/src/state/snapshot-projection.ts`：删除 `buildComponents` 和
  `components[constructor][offset]` 查找；`projectDomain(values)` 直接按字段
  identity 读取。字段 26 仍是永久的 domain kind 扩展。
- `client/src/state/snapshot-types.ts`：删除 `EntitySnapshot.components`；
  `componentOrdinals` 改名 `declaredComponents`；`DenseGroupPlan` 用 `component`。
- `client/src/state/world.ts`：删除 `components` 镜像的复制/合并块；稀疏、dense
  和索引值统一按字段 identity 合并，`WorldState` 不再维护第二份组件视图。
- `client/src/app/game-session.ts`、`client/src/net/multiplayer-snapshot.ts`：
  dense plan 由 `group.component` 构造。
- 测试：`client/tests/support/dense-codec.mjs` 删除重复的 `DensePlanDecoder`，
  改为使用产品 `SnapshotDecoder`；`client/tests/integration/snapshot-codec.test.mjs`
  的组分发、present 判定和组件断言全部改为 `Component.*`；
  `tests/integration/native-snapshot.test.mjs`、
  `client/tests/integration/worker-browser.test.mjs` 的 plan 改为组件。

## 7. 文档

`docs/semantics/snapshot.md` 的 dense 组章节重写为"组件 + 名称 + 字段"表格，
删除组号表；客户端解码章节删除 `FIELD_COMPONENTS` 和"component offsets"表述。
`docs/multiplayer-protocol.md` 由 `schema/multiplayer.yaml` 重新生成
（“Public dense group components”）。`docs/semantics/README.md` 的
“用生成访问器命名字段而不是字节偏移”保持不变，仍是当前约定。

## 8. 验证

| 命令                         | 结果                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run schema:generate`    | 26 outputs，5 个重新生成                                                                               |
| `npm run schema:check`       | 26/26 verified                                                                                         |
| `npm run format:check`       | pass（519 files，26 generated）                                                                        |
| `npm run lint`               | pass                                                                                                   |
| `npm run check:refactor`     | 0 new violations；baseline 降低 11 条（含 `memory-offset` 145+145+19+5+3+1、`unknown-field` 3 条清空） |
| `npm run test:engine`        | 19/19                                                                                                  |
| `npm run test:unit`          | 45/45                                                                                                  |
| `npm run test:integration`   | 9/9                                                                                                    |
| `npm run test:server:native` | 30/30                                                                                                  |
| `npm run test:client`        | client-unit 143/143；client-integration 88/88                                                          |
| `npm run test:all`           | PASS，20 步全部通过，runId `2026-11-04T12-07-20.257Z-0cb7807a`                                         |

字节不变的关键断言：

- `tests/unit/protocol-contracts.test.mjs` 的 inline-record 手写向量
  `01800104000100785634123e61…` 未修改，仍与 C++ writer 输出逐字节相等；
- `tests/integration/single-player-baseline.test.mjs` 的冻结 C++ 基线；
- `tests/integration/native-snapshot.test.mjs` 的 WorkerApi fixture 与
  `tests/fixtures/product/protocol/manual_vectors.json`；
- 多人：`manual_vectors.json` + `validate_public_entity` 的公开组件/mask 断言。
