# P6 精简与当前说明

本阶段对应 `06-simplification.md` 的 RF-D1–D7 与 `02-product-semantics.md` 的
RF-H1–H5。目标是在不改变 petal/entity 身份、wire 字节、物理公式、RNG 次序、
事件顺序和存档语义的前提下，删除死代码、收敛重复职责、把同值多存改成单一权威，
并把所有活动代码、注释和当前文档改写成“现在做什么”。

保护边界（`refactor-goals/README.md`）：`archive/` 只读且不是构建输入；
`build/`、`dist-next/`、`reports/`、`release/`、依赖目录不参与重构；不推送、
不合并、不部署。

## 1. 死代码与保活（RF-D1/D2、D06）

| 项目                  | 位置                        | 处置                                                                                                                                                                                                                                                   | 证据                                                                |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| D01 `orbit_angle_for` | `engine/src/sim/petals.cpp` | 删除函数与 `kLegacyOrbitAngleFor` 保活指针，轨道角改由 `assign_petal_orbit_indices` / `advance_loadout_orbit_phase` 计算                                                                                                                               | [p5-interfaces](p5-interfaces.md) §1；`grep orbit_angle_for` 无命中 |
| 保活与静默禁用        | 全仓                        | 已无 `[[maybe_unused]]`、`eslint-disable`、`@ts-ignore`、`@ts-expect-error`、`clang-format off`；`check-refactor` 的 `kept-alive` 台账为 0                                                                                                             | `node tools/check-refactor.mjs`；[§7](#7-历史表示台账)              |
| D06 逐模块复核        | `engine/`、`server/`        | 以“定义出现次数 == 1”扫描全部 C++ 定义（`engine/src`、`engine/include`、`server/src`）：仅 `main`、比较器 `peer_handle_less` 与 `dense_group`/`dense_group_for_field` 被标记，后两者由 `catalog.inc`、`protocol-contracts.test.mjs` 直接调用，非死代码 | 见本节末命令                                                        |

扫描命令（定义与调用点比较）：

```sh
node -e '…'  # 逐文件收集函数定义，按名称统计 engine/src、engine/include、server/、tests/ 的调用
```

结果：无“只有定义、没有调用”的产品函数。`-Wall -Wextra -Werror` 继续覆盖
static 函数与未使用变量；非 static 函数由上面的调用点扫描覆盖。

## 2. 出生 factory 收敛（RF-D3、D02）

- 新增 `engine::spawn_band_entity(world, entry, position)`：按 `SpawnBandEntry`
  分派 Rock/Boulder（先抽 drop 候选）、Cactus、默认生成三条真实初始化路径。
- `populate_world(world, table, counts)` 与 `SpawnTable::spawn_from_band` 的
  lambda 都只调用 `spawn_band_entity`；种群补充路径不再复制一份 switch。
- `spatial.hpp` 删除 `spawn_from_band_with_drop_draws`，模板版本
  `spawn_from_band(world, table, band, Occupied&&)` 复用同一分派。
- `spawn_entity_from_defaults` 内的 Queen Ant / Centipede segment / 默认装配
  共用本地 `spawn_body_with_loot`，消除三处重复的“创建 body + 抽掉落”序列。

保持不变的次序（RF-D7）：

1. 每次出生先抽 drop 候选（Rock 3 次、Cactus 1 次、默认 0 次），再写 body；
2. 每次出生后立即 `context.synchronize_births()`，不批量延后；
3. `spawn_band` 在出生完成后赋值；
4. 蚁巢释放/蜈蚣分段每次一条 angle 抽签；
5. Centipede 的步进保持 double 累加（f32 会在长链条上产生可见偏差）。

验证：`engine/tests/unit/test_structure.cpp` 的种群测试改用独立参考 factory
（显式调用 `spawn_rock_with_drop_draws`/`spawn_cactus_with_drop_draws`/
`spawn_entity_from_defaults`），不再调用被测的 `spawn_band_entity`；
`npm run test:engine` 19/19。

## 3. 花瓣解绑收敛（RF-D4、D03）

`engine/src/sim/petal_lifecycle.cpp` 现在只有一个解绑原语：

```cpp
std::optional<PetalOrbitState> take_orbit(PlayerState&, EntityHandle);
```

它删除 orbit 记录并清空对应的 loadout handle；三个语义入口只在“清空之后做什么”
上不同：

| 入口                     | 差别                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `detach_petal_from_slot` | 不充值、不延迟，下一次 loadout pass 立刻补一个实例（Web 发射）                                 |
| `on_petal_destroyed`     | 先派发死亡效果（即使 handle 已 detach），再按 catalog 充值                                     |
| `remove_slot_petals`     | 先销毁该槽全部 orbit petal，再清空该槽全部实例 handle（覆盖孵化的 Egg pet，它没有 orbit 记录） |

`PlayerLoadout` 增加 `handles(slot)` 只读视图与 `retire_handle(slot, instance)`；
`world.cpp`、`pets.cpp`、`petal_lifecycle.cpp` 不再手工同步 `PetalSlot::instances`
镜像。充值计时仍是“每槽一个共享 timer”，死亡充值仍取
`petal_combat(type_id)->rechargeMilliseconds`。

## 4. Snapshot 单一权威（RF-D5、D05）

C++ 侧：

- 删除 `PetalSlot::instances`（三实例 handle 的第二份拷贝）；`PetalLoadout::handles_`
  是占用状态的唯一权威。
- `PlayerLoadout::handles(slot)` 提供只读投影，测试与渲染路径改读它。

客户端侧：

- `EntitySnapshot` 删除 `byteField1`、`floatField5`、`doubleField35`、`doubleField18`、
  `floatField27`、`stringField4`、`floatField45`、`angleField8`、`inventory`、
  `denseByteFields` 十个同值 alias；double 值进入新的 `doubleFields`，角度进入
  `floatFields[8]`（弧度），其余继续使用按类型分的字段表。
- `snapshot-fields.ts` 提供 `byteField`/`floatField`/`stringField`/`numberField`
  只读访问器：同一个 wire 字段只存一份（稀疏类型表或 `denseFields`），消费端不再
  写 `byteFields?.[id] ?? denseByteFields?.[id] ?? denseFields?.[id]` 三段链。
- `snapshot-projection.ts` 的 `playerLoadoutSlots`、`loadoutSlots`、
  `projectDeathMetadata`、`playerZoneProgress` 全部走访问器；删除
  `player.inventory` fallback。
- 缓存失效仍由 `PlayerLoadout::invalidate_packet_cache` 在 equip/discard/swap/
  clear/change_slot_type/create_equipped_petal 上触发，RF-D5 未改动该语义；
  `world.ts` 的 `loadoutCache` 仍以 `(player handle, field 60 key, membership
revision)` 为键，删除的是重复存储而不是缓存。

## 5. 测试 helper、脚本与 CMake 去重（RF-D6）

- `client/tests/support/dense-codec.mjs`：把 30 行 `if/else` 类型分派收敛为
  `DENSE_READERS` 表；删除 `DenseGroup52Decoder`、`DenseByteGroupDecoder`、
  `DenseFloatGroupDecoder`、`DenseStringGroupDecoder` 四个只改类型的包装类，
  测试直接传 `{ field, type }` 规格。期望字节仍是手写向量，helper 不调用生产
  decoder（保留独立参考验证）。
- `package.json` 删除四个只指向 `tools/generate.mjs` 的别名
  （`gen:client-petals`/`gen:mob-gallery`/`gen:menu-content`）与未引用的
  `serve:dist-next`、`dev:multiplayer`；文档统一使用 `schema:generate`、
  `start`、`start:multiplayer`。
- `engine/CMakeLists.txt`：19 个测试目标原先各自重复
  `-Wall -Wextra -Werror -ffp-contract=off -fno-fast-math`，末尾再 foreach 一次；
  现在由 `florr_engine_test(target source library [NO_TEST])` 统一创建目标、
  链接、选项和 `add_test`，`ENGINE_TEST_FLAGS` 只出现一次，`engine_tests` 的
  `-fno-inline` 作为显式例外保留。
- `client/src/render/hud.ts` 与 `client/src/state/field-types.ts` 保留为模块门面
  （前者隐藏 `hud/*` 实现文件，后者在生成的 protocol 表上补 `componentBit`/
  `densePresentForMask`）；`state/snapshot.ts` 只做 `export type *` 与 decoder
  转发，没有第二份类型定义。

## 6. 隐藏副作用核对（RF-D7）

| 副作用       | 结论                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNG 抽取次序 | spawn 收敛后仍“先 drop 后 body”；Rock 种群路径 3 次、Cactus 1 次、默认 0 次；死亡掉落与 6 次 tick 末抽取未改。`test_structure`/`test_r04_sim`/golden 均通过 |
| 实体槽保留   | `initialize_world` 仍保留生成种子后的前三个实体槽作为存储记录，不交给玩法实体                                                                               |
| handle 代际  | 句柄仍是 14-bit index + 18-bit generation，`World::destroy` 递增 generation；删除 `instances` 镜像不影响该路径                                              |
| 时钟与序列   | tick 仍 50 ms；`replication_epoch`/`slot_epoch` 计算未改                                                                                                    |
| 缓存失效     | `invalidate_packet_cache` 调用点未变；`retire_handle` 只清 handle 与充值，不额外失效                                                                        |
| 资源释放     | 删除的只有内存镜像；`remove_slot_petals` 仍先 `world.destroy` 再清空 handle                                                                                 |

## 7. 历史表示台账

`tools/check-refactor.mjs` 的七个 pattern 全部归零，`tools/refactor/legacy-baseline.json`
的 `patterns` 为空对象。规则本身保留：任何新增命中都会以 “baseline allows 0” 失败。

改写范围（RF-H1–H5）：`engine/include`、`engine/src`、`engine/tests`、`client/src`、
`client/tests`、`tests/`、`tools/` 和当前 `docs/`。历史材料（`archive/`、
`docs/refactor-continuation.md`、发布说明）保留并明确标注为历史。

## 8. 文档

| 文档                                   | 更新                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| `docs/semantics/ai.md`                 | 删除 `AI+offset` 表，改为域字段/单位/含义表；去掉原版函数号       |
| `docs/semantics/tick.md`               | 阶段说明改为当前顺序，不再引用偏移                                |
| `docs/semantics/snapshot.md`           | 增加“字段只存一份 + 只读访问器”说明；`snapshot.ts` 定位为公开转发 |
| `docs/semantics/loadout.md`            | 仍描述 `handles_`/pending/timer/epoch；删除镜像后表述不变         |
| `engine/README.md`、`client/README.md` | 删除 “legacy/original” 措辞，保留当前约束                         |
| `README.md`、`docs/environment.md`     | `check:refactor` 说明改为“台账必须为空”                           |
| `docs/refactor-continuation.md`        | 保留为历史记录，只更新当前状态段落                                |

## 9. 验证

最终 `test:all` 见 [p7-acceptance](p7-acceptance.md) §7（runId
`2026-11-05T16-09-11.442Z-77483174`，20/20）。本阶段回归结果：

- `npm run format:check`：523 个手写文件通过（clang-format 21.1.8 / cmake-format
  0.6.13 / prettier 3.9.10）。
- `npm run lint`：通过（`--max-warnings=0`）。
- `node tools/check-refactor.mjs`：通过，7 条规则扫描 492 个文件、0 命中、
  `structural: 0`；`tools/refactor/legacy-baseline.json` 的 `patterns` 为 `{}`。
- `npm run schema:check`：26/26 输出一致。
- `npm run test:engine`：19/19。
- `npm run test:unit`：45/45；`npm run test:tools`：30/30。
- `npm run test:integration`：9/9。
- `npm run test:server:native`：30/30。
- client unit 143/143、client integration 88/88、browser scenarios 88/88。
