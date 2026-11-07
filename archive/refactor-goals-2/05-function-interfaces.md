# 05 — 函数参数与接口精简

## 目标

函数只接收完成其当前职责所需的数据；声明、实现和调用保持一致。去掉为历史签名、测试便利或统一外观而保留的无用参数，同时保留真实 API 契约所需的参数。

## RF-A1：建立参数审阅清单

扫描 C++ 定义和头文件、TS/JS 方法与函数、回调、生成器 helper、测试 helper、Worker 桥接和 C ABI，重点检查：

- 匿名形参、下划线形参、`[[maybe_unused]]`、局部 `(void)param`。
- 只被继续传给另一个无用形参的参数链。
- 只为了维持旧签名而收取的 World、时间、半径、handle、mode 等。
- 多个布尔/位置参数造成调用处难以理解的函数。
- 没有真正分支作用、所有调用都传同一值的选项；后者只是候选，仍需确认公共用途。

用 TS 类型和引用分析、C++ 编译与调用搜索核对，包含函数指针、回调、导出和测试。无用的导出函数不能因 `noUnusedLocals` 未报错就忽略。

## RF-A2：首批确认入口

| 函数                                                        | 计划                                                                            | 同步范围                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `assign_petal_orbit_indices(World&, PlayerState&)`          | 删除未使用的 `World&`                                                           | `petals.hpp`、实现、生命周期、pets 和测试调用 |
| `advance_loadout_orbit_phase(World&, PlayerState&, double)` | 删除未使用的 `World&`                                                           | 头文件、实现、tick 和测试调用                 |
| `WorldState.renderable(_now)`                               | 删除时间参数；如本身已无调用，则移除整个死接口                                  | 当前客户端和测试，包含可能的迭代器消费        |
| `drawAnt(context,_handle,_radius,...)`                      | 删除未使用的 handle、radius                                                     | art 分发、直接调用、录制 canvas 测试          |
| `drawCactus(context,radius,_now,flash)`                     | 删除未使用的时间                                                                | 物种分发及直接测试                            |
| `drawDrop(context,type,_radius,ageMs,visual)`               | 删除 radius；保留实际参与动画的 ageMs/visual，另行决定是否有必要简化 fallback   | 世界渲染、图鉴/菜单和直接 fixture             |
| `drawPetalShape(context,type,_icon,_now,seed,phase)`        | 删除 icon；`_now` 根据默认 phase 的现行行为保留并改名，或在调用层显式计算 phase | 世界花瓣、图标、Peas/Twin/Triplet 分支及测试  |

这不是仅改函数定义的列表。每个入口都必须搜索整个活动代码、测试和静态入口中的调用，确认参数位置移动后没有把 flash、time、species 等传错。

## RF-A3：避免误判“没有用途”

以下现有参数不能按表象删除：

- `make_effect_payload(World&,...)` 使用 World 分配 effect id 和生成伤害归属，属于实际依赖。
- `spawn_hornet_stinger(...,target)` 读取目标并验证存活；旧注释说旧 callback 不使用第二参数，不代表当前 target 无用。
- `drawPetalShape` 的 `_now` 参与默认值，即使函数体内没有再次读取也影响结果。
- `drawDrop` 的 `ageMs` 在没有 visual 时决定 progress；不能与 `_radius` 一起删除。
- Canvas/浏览器回调、虚函数覆盖和真实 ABI 由外部规定签名；必要的接口形参属于约束。应在最薄适配层处理，内部函数只接收需要的数据。

如果框架回调允许省略末尾参数，直接省略；必须保留的前置位置参数采用清楚的接口约定，不能将此理由扩散到普通业务函数。`(void)` 用于明确忽略有副作用函数的返回值时，不应被当成无用参数删除。

## RF-A4：实施和验证顺序

1. 确认函数职责、所有调用者及默认参数的求值语义。
2. 对内部函数，直接修改声明、实现和调用；不保留转发旧签名的 overload 或可选占位参数。
3. 对同类绘图函数不强求相同参数数量；公共分发函数可接收当前绘制上下文，再向各实现传必要参数。
4. 只有多个确实共同变化的参数才合为有意义的 options/context 类型，避免用 `Record<string,unknown>` 或大 World 对象掩盖依赖。
5. 检查调用表达式本身是否有副作用。删除不再需要的形参时，不能顺手抹去必要副作用；先分离当前职责，再删纯粹冗余计算。
6. 构建对应语言目标，验证参数错位、函数指针签名、回调和序列化调用。
7. 对绘图参数变动使用现有 recording canvas、world/menu/icon 场景确认动画时间、flash、seed、形状和 multiplicity 保持一致。

参数重排和数据类型收紧单独审阅，不夹带动画公式或默认行为修改。

## 输出与验收

所有参数审阅项有最终结论；内部接口无未使用形参、无空传参和兼容占位；外部签名约束集中且可解释。TS 严格检查、C++ 警告检查及相关图形/生命周期回归通过；所有调用者同时迁移。
