# P0 保护场景与测试缺口

本文件核对现有用例是否足以保护格式批次和后续语义批次。结论来自测试清单、CTest 目标、测试文件和断言内容；没有为了“看起来覆盖”而新增测试。

## 1. 现有保护面

| 风险                 | 现有用例                                                                                                                                                                                                                                                     | 保护内容                                                                          | 结论                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| wire 字节/字段序     | `tests/unit/protocol-contracts.test.mjs`（5）、`tests/fixtures/product/protocol/manual_vectors.json`、`client/tests/integration/snapshot-codec.test.mjs`（34）                                                                                               | 63 个 sparse 字段、19 个 dense 组、字段类型、组件映射、手写向量、截断/未知字段    | 足够覆盖格式批次；P4 迁移时必须保留手写向量和字段覆盖 |
| 跨端 encoder/decoder | `tests/integration/native-snapshot.test.mjs`（3）、`tests/integration/multiplayer-snapshot.test.mjs`（4）                                                                                                                                                    | native 真实帧、全量/增量/resync/重连、公共字段、selfState、损坏帧回滚、uint8 边界 | 足够；格式化后重跑即可                                |
| 浮点精度/运动        | `tests/integration/player-motion.test.mjs`、`client/tests/unit/movement-helper.test.mjs`、`engine_tests` 的 `test_f32`/`test_vec2`                                                                                                                           | 640 步独立 C++ 与 TS 位置、f64 速度、f32 包装、量化/角度                          | 足够；禁止在格式批次重排表达式                        |
| RNG/出生             | `engine_tests` 的 `test_rng`、`test_spawn_table`、`test_auto_population`、`test_population_targets`、`tests/integration/single-player-baseline.test.mjs`                                                                                                     | 固定 seed 的移动/战斗/死亡/重生两次一致、掉落抽取、种群补充                       | 足够；格式批次不得改变调用顺序                        |
| 花瓣/治疗            | `engine_rose_tests`（23 个 require）、`engine_tests` 的 Rose/Peas/recharge 用例、`engine_passives_pets_tests`                                                                                                                                                | 三种 Rose 治疗、严格一秒、治疗阻断、消耗/充值、Peas、Wing/Web/Egg、共享轨道       | 足够；P3 替换 orbitFunctionIndex 时以这些用例为准     |
| 生命周期             | `engine_death_lifecycle_tests`（48 个 require）、`engine_multiplayer_lifecycle_tests`、`tests/tools` 外的 `client/tests/unit/death-lifecycle.test.mjs`、`client/tests/integration/death-pickup-regression.test.mjs`                                          | 主人/花瓣/宠物死亡、连续销毁、尸体期限、掉落拾取、背包满、重生、handle 复用       | 足够；P6 解绑去重时必须保持差异                       |
| 多人                 | `engine_multiplayer_*`（state/replication/protocol/combat/lifecycle）、`client/tests/unit/{multiplayer-codec,multiplayer-presentation,network-session,local-player-identity,network-timeline}.test.mjs`、`client/tests/integration/network-browser.test.mjs` | 身份绑定、公开/私有、PVP、重连/resync、事件去重、预测/插值                        | 足够；P4 公开组迁移后必须保持 mask                    |

## 2. 已确认的缺口

| 编号 | 缺口                                                                               | 影响                                             | 计划                                                                           |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| G01  | `component_flags92` 只有字节断言（`test_*` 中的 spawn 片段），没有实际出生行为读取 | P3 删除该字段时不能用测试存在作为保留理由        | 用半径/碰撞/掉落等可观察出生行为断言替代；删除字节断言                         |
| G02  | `HitEvent::refcount` 与 `count` 同步增加，没有独立消费者测试                       | 删除 `refcount` 的回归风险低但需确认             | P3 搜索全部读取后删除重复计数；保留 `EffectPayload` 有自己的维护逻辑           |
| G03  | `dynamicHealth` 在活动 C++ 中没有读取，只有 schema/生成/测试引用                   | 可能是无用出生默认值                             | P3 核对生成消费者后删除或明确用途                                              |
| G04  | protocol sparse 字段没有当前名称，运行时按编号访问；测试只验证编号和字节           | P4 迁移到组件标识时缺少“字段名→消费者”的独立断言 | P4 增加字段/组件覆盖测试，保留手写向量；不在 P1 伪造                           |
| G05  | 格式工具版本不匹配时没有测试；工具缺失只由命令失败暴露                             | 生成输出可能因环境不同而漂移                     | P1 在 `tools/lib/format-tools.mjs` 中硬失败，并新增工具规则测试                |
| G06  | `check:refactor` 自身的规则没有测试                                                | 规则可能静默失效                                 | P1 新增 `tests/tools/refactor-rules.test.mjs`，覆盖多语句、括号、基线放行/收紧 |

## 3. 不新增的测试

以下场景已有直接覆盖，不为格式化或改名增加镜像断言：

- 协议字段数量、dense 组数量、组件 mask；
- 固定 seed 的移动/战斗/死亡两次一致；
- 三种 Rose 治疗量和严格计时；
- 640 步跨端运动；
- 多人公共/私有字段和损坏帧回滚。

格式批次只要求这些测试在格式化后的源码上继续通过；如果出现差异，先定位作用域、表达式顺序或模板行为，不批量接受新期望。
