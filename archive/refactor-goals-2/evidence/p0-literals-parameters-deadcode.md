# P0 参数、死代码、业务字面量与历史表示清单

本文件是处置清单，不是修改记录。所有条目在 P0 只完成定位和结论；实际修改属于 P2–P6。数值来自当前 HEAD 的文本检索，检索不能证明语义，结论结合调用关系核对。

## 1. 无用参数

| 编号 | 位置                                                                | 证据                                                                                                                                                            | 结论                                                                                       | 阶段 |
| ---- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---- |
| A01  | `engine/include/engine/sim/petals.hpp`、`engine/src/sim/petals.cpp` | `assign_petal_orbit_indices(World&, PlayerState&)` 与 `advance_loadout_orbit_phase(World&, PlayerState&, double)` 的实现不读取 `World&`；所有调用点都传 `world` | 删除声明、定义和调用中的 `World&`；同步引擎测试                                            | P5   |
| A02  | `client/src/state/world.ts:449`                                     | `renderable(_now: number)` 不读取参数                                                                                                                           | 删除参数及调用实参                                                                         | P5   |
| A02  | `client/src/render/art/species.ts:169`                              | `drawAnt(_handle, _radius = 14, ...)` 不使用 handle/radius                                                                                                      | 删除两个参数；调用点见 `species.ts:481`                                                    | P5   |
| A02  | `client/src/render/art/species.ts:304`                              | `drawCactus(_now = 0, ...)` 不使用 now                                                                                                                          | 删除参数；调用点见 `species.ts:466`                                                        | P5   |
| A02  | `client/src/render/art/drops.ts:50`                                 | `drawDrop(_radius = 14, ...)` 不使用 radius                                                                                                                     | 删除参数；调用点见 `world.ts:358`                                                          | P5   |
| A03  | `client/src/render/art/petals.ts:54`                                | `drawPetalShape(..., _icon, _now, seed, phase = _now * 0.001)`：`_icon` 未读，`_now` 仅参与默认 `phase`                                                         | 删除 `_icon`；保留时间输入并把默认 `phase` 计算移到调用边界或明确命名，不能按 `_` 批量删除 | P5   |
| A04  | 其余下划线形参                                                      | `client/src` 中仅上述 `_now`/`_radius`/`_icon`/`_handle`/`_fields`；C++ 活动源码没有下划线形参                                                                  | 逐项核对后处理，不以“有下划线”作为删除依据                                                 | P5   |
| A05  | 测试 helper                                                         | 测试中的回调、fixture 参数需在 P5 逐个核对；P0 未发现新的明确未用参数                                                                                           | P5 审阅                                                                                    | P5   |

## 2. 死代码与人为保活

| 编号 | 位置                                                                  | 证据                                                                                                                   | 结论                                                           | 阶段 |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---- |
| D01  | `engine/src/sim/petals.cpp:26`、`:37`                                 | `orbit_angle_for` 无实际调用；`[[maybe_unused]] constexpr auto* kLegacyOrbitAngleFor = &orbit_angle_for;` 只为保住符号 | 删除函数、指针和历史注释；搜索确认无导出/测试引用              | P6   |
| D02  | `engine/src/sim/spawn.cpp` 与 `engine/include/engine/sim/spatial.hpp` | 初始化/补充种群 factory 重复判断 Rock/Boulder/Cactus 和默认生成路径                                                    | 收敛为同一职责，保持每次出生后的空间索引同步和 RNG 次序        | P6   |
| D03  | `engine/src/sim/petal_lifecycle.cpp`                                  | detach/destroy 槽位清理重复；充值/死亡副作用不同                                                                       | 抽取最小共同步骤，差异留在语义明确的调用层                     | P6   |
| D04  | `client/tests/support/dense-codec.mjs`                                | dense 解码重复分支                                                                                                     | 只合并测试内部重复，保留独立参考实现，不能改为调用生产 decoder | P6   |
| D05  | `client/src/state/snapshot-projection.ts`、`world.ts`                 | `byteArrayField60` 与 `byteArrayFields[60]` 镜像；`components[constructor][offset]` 旧嵌套                             | 统一权威表示，删除镜像和 fallback                              | P4   |
| D06  | `engine/src/sim/petals.cpp` 等                                        | 编译器 `-Wall -Wextra -Werror` 不会报告未使用的非 static 函数；P0 只确认了 D01                                         | P6 逐模块复核，不声称已穷尽                                    | P6   |

## 3. 业务字面量

| 编号 | 位置                                                                                                        | 检索结果                                                                                                                                                                            | 目标                                              | 阶段  |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----- |
| L01  | `engine/src/sim/{petals,petal_effects,petal_lifecycle,passives,pets,death}.cpp`                             | 53 处 `type_id ==/!= N`；例如 28（Yinyang）、14（Faster）、8（Iris）、12（Poison Peas）、20（Web）、21（Antennae）、31（Heavy）、34（Poison Stinger）、22/23（Egg）、25（Antennae） | `PetalId` 具名枚举；稀有度变体用明确成员          | P2    |
| L02  | `engine/src/sim/{spawn,movement}.cpp`、`engine/include/engine/sim/spatial.hpp`                              | 生物 ID 与区间直接表达族群（如 Ant/Centipede/Ladybug）                                                                                                                              | `SpeciesId` + 族群谓词/集合，不依赖 ID 连续性     | P2    |
| L03  | `client/src/render/{world,species-animation}.ts`、`render/art/{species,petals}.ts`                          | 25 处 `species` 与数字比较；`species >= 7 && species <= 13 && species !== 11` 等区间                                                                                                | 具名 ID 与明确族群；不能用端点常量继续假设连续    | P2    |
| L04  | `client/src/net/{snapshot-projection,snapshot-decoder}.ts`、`world.ts`、`engine/src/net/snapshot_codec.cpp` | 字段 2、26、53、55、60、61 等和 flags/mask 散落                                                                                                                                     | 从协议 schema 生成字段、组件、标志和上限常量      | P2/P4 |
| L05  | `engine/include/engine/model/player_profile.hpp`、`engine/src/sim/petals.cpp`、HUD/profile 代码             | 8 个活动槽、3 个实例、16 个背包槽、15/30/45 解锁等级；13/14/15/16 背包容量、5/6/7/8 活动槽由等级三元表达式直接给出                                                                  | 按真实概念命名容量和规则；同值不合并              | P2    |
| L06  | catalog `petal-combat.json` 的 `orbitProfile`                                                               | 字符串 profile 已存在，但轨道函数编号另有一条链                                                                                                                                     | 复用/扩展现有 profile，新增行为类型时保持职责分离 | P3    |

## 4. 历史表示

检索使用 `tools/check-refactor.mjs` 的 pattern 定义（P1 接入）。P0 期间的命中数记录在 `p1-format-batch.md` 的基线账本中；P2–P6 每阶段只能减少，不能新增。

| 编号 | 位置                                                                                                      | 问题                                             | 目标                                              | 阶段  |
| ---- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- | ----- |
| H01  | `engine/include/engine/model/entity.hpp`                                                                  | `AI+8`、`Physics +48`、`entity+184` 等偏移注释   | 改为单位、生命周期、所有权和约束                  | P3    |
| H02  | `engine/include/engine/sim/*` 的 API 注释                                                                 | 说明直接引用原函数编号                           | 按当前功能重写                                    | P6    |
| H03  | `client/src/render/**`                                                                                    | `func587`、`func1099` 等作为行为说明             | 解释当前绘制顺序、变换和动画                      | P6    |
| H04  | `schema/protocol.yaml` 的 `fieldComponents`/`denseGroups`                                                 | `constructor: 478/491/...`、内存 offset          | 从协议字段和组件序号建立内部表示                  | P4    |
| H05  | `tools/schema/protocol.mjs`、`engine/include/engine/net/dense_fields.hpp`                                 | 生成旧 metadata 和 `kDenseFieldsMinus16`         | 联动替换模板、表结构、查询接口和测试              | P4    |
| H06  | `client/src/state/snapshot-projection.ts`、`world.ts`                                                     | `components[constructor][offset]` 实际保存旧布局 | 按协议字段标识组织状态                            | P4    |
| H07  | `schema/multiplayer.yaml`、`tools/schema/multiplayer.mjs`                                                 | `publicDenseGroups` 按旧 offset 选择             | 采用当前组件标识，公开字段和 mask 不变            | P4    |
| H08  | `engine/tests/unit/test_r04_sim.cpp`、`test_death_lifecycle.cpp`、`test_centipede.cpp`、客户端 codec 测试 | 测试名/断言含旧实现细节                          | 改为当前行为契约，保留边界/时序                   | P4/P6 |
| H09  | `docs/semantics/ai.md`                                                                                    | AI 偏移表和 callback 74                          | 按当前字段和状态机重写                            | P6    |
| H10  | `schema/protocol.yaml` 的 output packet/worker args metadata                                              | 旧内存结构或签名壳层                             | 核对消费者后删除无用途信息，分别说明 ABI 与包格式 | P4    |

## 5. P0 结论

1. 参数问题集中在 A01–A03，均有明确调用点和删除路径。
2. 死代码 D01 已确认；D02–D05 是职责/表示重复，需要按各自阶段处理。
3. 业务字面量以 L01–L05 为主，数量已记录；P2 建立单一 ID/常量来源后再替换调用点。
4. 历史表示仍广泛存在，P1 只能建立检查和格式基线，不能在 P1 声称清除；P2–P6 逐项减少账本。
