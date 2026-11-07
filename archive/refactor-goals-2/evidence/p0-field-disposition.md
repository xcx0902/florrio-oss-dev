# P0 全量字段处置表

本文件是 [P0 字段清单](p0-field-inventory.md) 的结论摘要。逐字段表在附录中，由
`refactor-goals/evidence/tools/field-inventory.mjs` 生成；本文件只记录统计、口径和需要人工判断的字段。

## 1. 覆盖范围

| 来源          | 内容                                                                                    | 字段/记录                       |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| catalog 输入  | `entities`、`entity-spawn-defaults`、`petal-combat`、`petals`、`spawn-rules`、`strings` | 6 个记录类型，全部输入字段      |
| 手写 C++ 模型 | `engine/include` 中非生成头文件的 struct/class 字段                                     | 全部非生成类型，逐类型列出      |
| 客户端 TS     | `client/src` 中非生成文件的 `export interface`                                          | 全部字段                        |
| 协议 sparse   | `schema/protocol.yaml` 的 63 个字段                                                     | 63 行，含类型、组件、消费者位置 |
| 协议 dense    | 19 个 dense 组、组件映射、dense-16/-27 字段                                             | 每组字段和 extended 字段        |
| 多人记录      | `schema/multiplayer.yaml` 的请求/响应/事件记录                                          | 每个记录的字段和 wire 规则      |

统计口径：附录共 891 行字段记录；同一名字在不同类型中分别计数。server 内部配置、临时缓冲区和生成协议头不在此表重复计数；生成协议字段由第 5 节单独覆盖。文本引用量只用于发现零引用和集中引用，不能替代读写语义；处置结论结合调用点、导出和测试人工核对。

## 2. 处置汇总

| 处置                                                    | 行数 | 含义                                           |
| ------------------------------------------------------- | ---: | ---------------------------------------------- |
| 保留（P4 复核协议来源）                                 |  462 | 协议字段/组当前保留，P4 迁移时核对来源和消费者 |
| 保留（P3 复核命名与单位）                               |  364 | 运行时字段保留，P3 改名为当前语义并核对单位    |
| 保留：catalog/派生数据输入（P3 复核）                   |   38 | schema 输入保留，P3 复核生成消费者             |
| 保留并改名（P3）                                        |    8 | 字段有实际用途，但名字是历史表示               |
| 删除（P3）                                              |    7 | 无实际消费的 schema 字段，P3 删除              |
| 删除候选：活动代码无文本引用（P3 复核导出与聚合初始化） |    7 | 只在声明中出现；P3 确认无导出/聚合消费后删除   |
| 删除（P3/P6）                                           |    2 | 重复计数/全链无用字段                          |
| 替换为当前行为类型（P3）                                |    2 | 轨道/攻击行为编号改为行为类型                  |
| 替换为行为类型（P3）                                    |    1 | `petal-combat.orbitFunctionIndex` 改为行为类型 |

没有“待核实/未知”行。删除候选是明确处置，不是未决项；它们必须在 P3 用构建、导出和聚合初始化检查确认后再删。

## 3. 重点字段结论

| 编号 | 字段                                                                | 结论                                  | 依据                                                                  | 阶段 |
| ---- | ------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- | ---- |
| F01  | `entities.opaque100/104/108/110`                                    | 删除                                  | 无活动 C++/client 消费；只在 schema/生成器/测试出现                   | P3   |
| F02  | `entities.flags92`、`Entity/component_flags92`                      | 删除                                  | `flags8` 已携带唯一有效位；现有测试只断言字节，不证明行为             | P3   |
| F03  | `petal-combat.orbitFunctionIndex`、`PetalOrbitState.orbit_function` | 替换为行为类型                        | 三值分支没有独立语义，行为已由 catalog profile 决定                   | P3   |
| F04  | `AiState.attack_callback`                                           | 替换为攻击行为类型                    | 只用于选择当前攻击回调；编号是历史表示                                | P3   |
| F05  | `entity-spawn-defaults.physicsFlag48`、`Entity.physics_flag48`      | schema 删除；运行时改名为当前物理字段 | catalog 值无消费；运行时字段有真实消费                                | P3   |
| F06  | `Entity.entity_flags/world_flags/flags`、`AiState.activity_flags`   | 保留并改名                            | 有真实消费，名字不能表达所属实体/世界/活动                            | P3   |
| F07  | `Entity.byteArrays/byteArrayField60`、`byteArrayFields[60]`         | 保留并迁移                            | 64 字节权限位图有真实语义；P4 统一到字段标识后删除镜像/fallback       | P4   |
| F08  | `HitEvent.refcount`                                                 | 删除                                  | 与 `count` 同步维护，无独立消费者；`EffectPayload` 自己的维护逻辑不同 | P3   |
| F09  | `entity-spawn-defaults.dynamicHealth`                               | 删除                                  | 生成到出生默认值但活动 C++ 不读取                                     | P3   |

## 4. 删除候选（P3 复核）

以下字段在活动 `engine/src`、`engine/include`（声明本身除外）和 `engine/tests` 中没有文本引用。P3 必须检查导出、聚合初始化、序列化和测试 fixture 后再删除；若发现用途，改为保留并补上具名类型。

| 字段             | 类型            | 位置            |
| ---------------- | --------------- | --------------- |
| `clock_valid`    | `bool`          | 时钟/同步状态   |
| `retarget_ms`    | `double`        | AI/移动状态     |
| `last_hit_epoch` | `std::uint32_t` | 命中记录        |
| `hit_count`      | `std::uint32_t` | 命中记录        |
| `effect_epoch`   | `std::uint32_t` | 效果状态        |
| `func_name`      | `std::string`   | 脚本/函数元数据 |
| `final_response` | `bool`          | 多人/请求状态   |

## 5. 协议字段说明

- 63 个 sparse 字段全部保留到 P4；当前运行时按编号读写，P4 改为组件/字段标识后再按实际消费者命名。
- 19 个 dense 组的公开字段和真实 mask 必须保持不变；P4 只替换旧 offset key，不改变字节布局。
- 手写向量 `tests/fixtures/product/protocol/manual_vectors.json` 是字节契约，任何字段迁移都必须继续通过。
- `docs/multiplayer-protocol.md` 的正文在 P1 只做格式化，不改变语义；P4 才迁移字段说明。

## 6. 验证与后续

P0 只完成清单和判断，没有修改字段。P1 的格式化不能改变字段名、值、顺序或协议字节；P2–P4 每完成一项必须同步附录和本表，P7 要求删除候选清零、无历史表示、全量验收通过。
