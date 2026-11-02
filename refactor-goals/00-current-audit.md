# 00 — 现状审阅与问题清单

## 审阅方法和证据边界

本次检查了当前源码目录、schema 输入与输出清单、生成器、编译配置、测试清单、验收入口及相关文档。使用文本搜索和只读统计追踪字段的声明、赋值、读取与生成关系；没有运行编译、测试或程序。

下面的文件位置对应 README 中的基线提交，实施时以符号名重新定位。清单是已确认的问题入口，不是已经穷尽的全项目死代码证明。执行阶段仍需检查所有字段、函数和模块，不能只处理用户举出的几个名称。

“删除候选”表示当前审阅未找到影响业务结果的读取，尚须核对完整构建目标、测试、导出、序列化和间接访问。“保留并改名”表示已看到实际用途，但目标名称仍应由完整读写语义确认。

## 1. 字段与历史行为标识

| 编号 | 位置与证据 | 当前判断 | 后续动作 |
| --- | --- | --- | --- |
| F01 | `schema/catalogs/entities.json`、`tools/schema/{catalogs,validate}.mjs`、`engine/include/engine/catalog/catalog_types.hpp` 的 `opaque100/104/108/110` | 搜索命中主要位于数据、验证和生成链；未找到当前业务读取 | 列出消费者后删除无用字段，覆盖 JSON、类型、校验、输出和说明 |
| F02 | `entity-spawn-defaults.json` 的 `flags92` → 生成类型 → `Entity::component_flags92`；`spawn.cpp` 写入，两个测试片段断言 | 当前看到的是写入和测试断言，未找到影响行为的读取 | 高优先级删除候选；用实际出生行为断言替代字段字节断言 |
| F03 | `flags93/95` → `Entity::entity_flags/world_flags` → `spatial.cpp`、`combat.cpp`、`world.cpp`、`snapshot_codec.cpp` | 参与空间查询、碰撞、所有权处理和输出，不能删除 | 明确各位含义与协议映射，采用具名标志与掩码 |
| F04 | `entity-spawn-defaults.json` 的 `physicsFlag48`；`Entity::physics_flag48` 在碰撞代码读取 | catalog 字段与运行时 bool 的用途不同；不能因名称相似就合并 | catalog 字段按消费者决定删除；运行时字段按质量加权碰撞含义命名 |
| F05 | `Entity::physics_flag50` 在 `petal_effects.cpp` 写入、`combat.cpp` 跳过接触处理 | 有实际用途 | 描述 Web 落地标记和碰撞排除关系后确定名称 |
| F06 | `petal-combat.json` 的 `orbitFunctionIndex` → `petal_lifecycle.cpp` → `PetalOrbitState::orbit_function` → `petals.cpp` | 不是纯元数据；决定 Rose 家族判断和治疗量 | 用当前行为类型与治疗参数替代整条编号链，不能直接删除或只给编号起别名 |
| F07 | `AiState::attack_callback`、`ai_profiles.cpp` 的 `74U`、`species_attacks.hpp` 的 `AttackCallback::kHornetStinger = 74` | 已有枚举，但模型仍存原始整数和历史回调编号 | 改为产品攻击行为类型；核对是否有外部数值约束，没有则移除历史编号 |
| F08 | `HitEvent::{count,refcount}`、`World::emit_hit`、`cases/combat_ai.inc` | 两个计数在当前路径同步增加；`refcount` 有重复状态嫌疑 | 检查所有读取后，删除重复计数或定义独立当前含义；不能误删 `EffectPayload` 中有实际维护逻辑的计数 |
| F09 | `EntityCatalogEntry::componentDrawCount` 在 `spawn.cpp` 控制循环和随机抽取 | 有实际用途 | 根据掉落抽取职责命名；保留抽取次数和顺序，不能因“component”含历史色彩直接删除 |

补充观察：23 条生物记录中 `opaque104` 均为 0，但其他 `opaque*` 并非全零。19 条出生默认值中的 `flags92` 也有不同值。**值是否恒定不能代替用途判断。**

## 2. 原版称呼与旧布局渗透

| 编号 | 位置与证据 | 问题 | 后续动作 |
| --- | --- | --- | --- |
| H01 | `engine/include/engine/model/entity.hpp` 的 AI、physics、transform 等偏移注释 | 读当前模型仍需理解旧记录结构 | 改为字段单位、生命周期、所有权和约束 |
| H02 | `engine/include/engine/sim/{petals,player_loadout,spawn,collision_filter}.hpp` | API 说明直接使用旧函数编号 | 按当前功能重写，不保留“对应原函数”的附注 |
| H03 | `client/src/render/{event-effects,tooltip,menu-panels}.ts`、`render/hud/{death,primitives}.ts`、`render/art/{drops,petals}.ts` | `func587`、`func1099` 等作为行为说明 | 解释当前绘制顺序、变换和动画行为 |
| H04 | `schema/protocol.yaml` 的 `fieldComponents`、`denseGroups` | `constructor: 478/491/...`、内存 offset 和旧地址说明仍为活动 schema 的一部分 | 从协议实际字段、组件序号建立内部表示，移除历史构造函数与偏移 |
| H05 | `tools/schema/protocol.mjs`、`engine/include/engine/net/dense_fields.hpp` | 把旧 metadata 生成为公共类型和 `kDenseFieldsMinus16` 等名称 | 联动替换生成模板、表结构、查询接口和测试 |
| H06 | `client/src/state/snapshot-projection.ts` 的 `components[constructor][offset]`、`world.ts` 的合并代码 | 当前状态模型实际保存历史布局，不只是注释问题 | 使用按协议字段标识组织的状态；删除历史嵌套映射 |
| H07 | `schema/multiplayer.yaml` 的 `publicDenseGroups`、`tools/schema/multiplayer.mjs` 对 `[116,120,140,152]` 的检查 | 公开字段策略仍按旧偏移选择组 | 采用当前组件标识，保持公开字段和 mask 不变 |
| H08 | `test_r04_sim.cpp`、`test_death_lifecycle.cpp`、`test_centipede.cpp` 及客户端 codec 测试 | 测试名、断言文字、预期结构包含旧实现细节 | 改为当前行为契约；保留有价值的边界和时序覆盖 |
| H09 | `docs/semantics/ai.md` 的 AI 偏移表及 callback 74 说明 | 当前说明文档仍依赖旧布局 | 按当前字段和状态机重写；历史迁移记录单独标识 |
| H10 | `schema/protocol.yaml` 的 `output.packet` 堆/内联 payload offset 和 worker function `args` metadata | 可能仍是旧内存结构或签名壳层，不能直接当成 wire 契约 | 核对当前消费者，删除无用途信息，实际 ABI 和包格式分别说明 |

针对函数编号的有限模式扫描，在排除生成输出后的所选代码和测试目录命中 74 个文件、181 行；针对旧记录偏移的模式命中 29 个文件、117 行。两组会重叠，且均不是语义分析结果；不能把这些数作为最终整改总量或验收阈值。

## 3. 业务字面量

| 编号 | 代表位置 | 例子与风险 | 后续动作 |
| --- | --- | --- | --- |
| L01 | `engine/src/sim/{petals,petal_effects,petal_lifecycle,passives,pets,death}.cpp` | 花瓣 ID 直接出现在分支、条件、孵化和被动能力判断中 | 统一 `PetalId`，避免不同模块各自定义同名数值 |
| L02 | `engine/src/sim/{spawn,movement}.cpp`、`engine/include/engine/sim/spatial.hpp` | 生物 ID 及数字区间表达物种族群 | 统一 `SpeciesId`，族群关系用谓词或表表达 |
| L03 | `client/src/render/{world,species-animation}.ts`、`render/art/{species,petals}.ts` | `species >= 7 && species <= 13 && species !== 11`、大量数字 case | 使用具名 ID 与明确族群，不能简单把端点换成枚举后继续依赖编号连续性 |
| L04 | `snapshot-projection.ts`、`snapshot-decoder.ts`、`world.ts`、`snapshot_codec.cpp` | 字段 2、26、53、55、60、61 等及 flags/mask 直接散落 | 从协议 schema 生成字段、组件、标志与上限常量 |
| L05 | `petals.cpp`、HUD 和 profile 相关代码 | 8 个活动槽、3 个实例、16 个背包槽、15/30/45 解锁等级等 | 按真实概念统一容量和规则，数值相同不代表共享同一常量 |

当前目录有 39 条花瓣记录、23 条生物记录。同名花瓣有多个稀有度，同名蜈蚣有头/节区别，因此不能直接把显示名称转成唯一枚举成员。

## 4. 格式、参数和重复实现

| 编号 | 位置与证据 | 当前判断 | 后续动作 |
| --- | --- | --- | --- |
| S01 | `client/src/net/{multiplayer-wire,multiplayer-snapshot,worker}.ts`、`state/local-prediction.ts`、`server/src/{room,session,room_manager}.cpp` | 单行包含多个赋值、调用和分支；仅靠行宽检查查不全 | 结构化展开控制流，一行一个独立语句 |
| S02 | `tools/schema/multiplayer.mjs` 的 `rw` 和生成模板 | 模板和输出都可能压缩逻辑 | 格式规范同时覆盖模板与最终输出 |
| S03 | 仓库格式配置 | 本次未发现 `.editorconfig`、Prettier/ESLint 或 clang-format 配置 | 建立配置、版本约束、检查入口，并接入既有验收体系 |
| A01 | `assign_petal_orbit_indices(World&, PlayerState&)`、`advance_loadout_orbit_phase(World&, PlayerState&, double)` | 实现中的 `World&` 未使用 | 删除声明和调用中的相应参数 |
| A02 | `WorldState.renderable(_now)`、`drawAnt(_handle,_radius)`、`drawCactus(_now)`、`drawDrop(_radius)` | 明确的未使用参数入口 | 搜索全部调用点后精简；核实测试和间接引用 |
| A03 | `drawPetalShape(...,_icon,_now,seed,phase)` | `_icon` 未使用，但 `_now` 参与默认 `phase` 计算 | 删除前者；后者保留并改名或明确迁移默认值计算，不能按下划线批量删除 |
| D01 | `petals.cpp` 的 `orbit_angle_for` 与 `kLegacyOrbitAngleFor` | 通过 `[[maybe_unused]]` 指针维持旧公式存在，未见实际调用 | 复核后删除函数、指针和历史注释 |
| D02 | `spawn.cpp` 中初始化/补充种群的 factory，与 `spatial.hpp` 的组件抽取生成入口 | 重复判断 Rock/Boulder/Cactus 及默认生成路径 | 收敛为同一生成职责，保留每次出生后同步索引和随机调用顺序 |
| D03 | `petal_lifecycle.cpp` 的 detach/destroy 槽位清理 | 清理结构重复，但充值和死亡副作用不同 | 抽取最小共同步骤，差异留在语义明确的调用层 |
| D04 | `client/tests/support/dense-codec.mjs` | 有多段重复 dense 解码分支 | 判断测试需要的独立参考逻辑；只合并测试内部重复，不能改为调用待测生产 decoder |
| D05 | `EntitySnapshot::byteArrayField60` 与 `byteArrayFields[60]` | 同一数据有专用别名和通用表示，涉及 decoder、projection、world 和测试 | 统一权威表示后删除镜像状态及 fallback |

## 5. 已存在的保护条件

- `client/tsconfig.json` 已开启 `strict`、`noUnusedLocals`、`noUnusedParameters`；这仍不能说明所有下划线参数、导出函数或接口都必要。
- 引擎和服务端编译配置已使用 `-Wall -Wextra -Werror`。匿名参数和人为引用仍可能绕过无用代码提醒。
- `schema/generated-outputs.json` 当前记录 **20 个生成输出**。旧文档中的 15 个不是本次执行的预期值。
- `tests/product-tests.json` 是当前测试清单；`tools/verification/gates.mjs` 当前包含 **17 道验收步骤**。本次只读取配置，不代表这些步骤已通过。
- 多人 catalog 身份由 schema catalog 输入计算。删除无用 metadata 也可能改变 catalog hash，必须同步生成、重建并验证两端握手，不能要求 hash 人为保持不变。

执行前应把上述项目扩展为完整处置表，至少含：符号、定义位置、所有写入、所有实际读取、是否序列化/导出、目标处置、当前行为依据、验证方式、执行状态。
