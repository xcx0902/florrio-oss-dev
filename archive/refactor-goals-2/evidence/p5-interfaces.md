# P5 — 函数接口

状态：实现完成；验证见 §3 和清单执行行。

## 1. RF-A2 参数移除

所有条目都同时改了声明、实现、调用点和测试；没有保留旧签名包装、占位实参或
`(void)` 补丁。

| 接口                                                        | 变更                                                                         | 触及位置                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assign_petal_orbit_indices(World&, PlayerState&)`          | 删除未使用的 `World&`                                                        | `engine/include/engine/sim/petals.hpp`、`engine/src/sim/petals.cpp`（定义与 `update_petal_orbits` 调用）、`engine/src/sim/pets.cpp`、`engine/src/sim/petal_lifecycle.cpp`（2 处）、`engine/tests/unit/cases/catalog.inc`（2 处） |
| `advance_loadout_orbit_phase(World&, PlayerState&, double)` | 删除未使用的 `World&`                                                        | 头文件、`engine/src/sim/petals.cpp`、`engine/src/sim/tick.cpp`、`engine/tests/unit/test_multiplayer_combat.cpp`（2 处）、`engine/tests/unit/test_passives_pets.cpp`（2 处）                                                      |
| `WorldState.renderable(_now)`                               | 删除时间参数（生产渲染走 `isRenderable(handle)`，`renderable` 只被测试迭代） | `client/src/state/world.ts`、`client/tests/unit/snapshot-domain.test.mjs`、`client/tests/unit/petal-transfers.test.mjs`                                                                                                          |
| `drawAnt(context,_handle,_radius,…)`                        | 删除未使用的 handle、radius；保留 `caste/now/flash/activity` 顺序            | `client/src/render/art/species.ts`（定义与物种分发）                                                                                                                                                                             |
| `drawCactus(context,radius,_now,flash)`                     | 删除未使用的时间                                                             | `client/src/render/art/species.ts`（定义与分发）                                                                                                                                                                                 |
| `drawDrop(context,type,_radius,ageMs,visual)`               | 删除 radius；保留 `ageMs`（RF-A3：无 visual 时决定 progress）                | `client/src/render/art/drops.ts`、`client/src/render/world.ts`                                                                                                                                                                   |
| `drawPetalShape(context,type,_icon,_now,seed,phase)`        | 删除 icon；`_now` 改名 `now` 并保留默认 phase 语义                           | `client/src/render/art/petals.ts`（定义、世界花瓣、图标和 Peas/Twin/Triplet 分支）                                                                                                                                               |

### drawPetalShape 的 icon 语义

`_icon` 原来只影响 Peas 分支的组旋转：`_icon ? 0 : phase`。图标调用点传入的
`now` 一直是 `0`，因此删除 `_icon` 后它们得到 `phase = now * 0.001 = 0`，与旧行为
逐值相同；世界实例仍显式传入 `phase`（`petals.ts` 的世界 `draw` 闭包）。这也
满足 RF-A3 对 `_now` 的保留要求：默认参数仍然读取 `now`。

### drawDrop 的 ageMs

`ageMs` 未被删除：无 `visual` 时它以
`1 - 0.8^(ageMs * 0.06)` 决定 arrival progress，是真实动画输入。世界渲染现在传
`Infinity` 加保留的原生 `DropVisualState`，结果与旧代码中未使用的 `14` radius
无关。

### renderable

`renderable` 在生产代码中没有调用者；渲染器用 `isRenderable(handle)` 过滤。
保留迭代器本身（测试和潜在调试消费者仍可用），只删除恒被忽略的时间参数。

## 2. 其余参数审阅

- 删除 `engine/include/engine/net/protocol.hpp` 的 `kPacketHeaderBytes`、
  `kInlinePayloadBytes`（旧输出 packet 堆布局）和
  `client/src/net/protocol.ts` 的 `PACKET_HEADER_BYTES`、`INLINE_PAYLOAD_BYTES`。
  它们唯一的消费者是 `engine/tests/unit/cases/worker_api.inc` 的常量断言，已缩减
  为仍然真实的 `kMaxInputPacketBytes`、`kOutputQueueCapacity`、
  `kPacketXorKeyBytes`。
- `(void)` 审计：保留 `(void)normalize_text(...)`、`(void)world.entities().release(...)`、
  `(void)spawn_registered_player(...)`、`(void)damage_entity(...)`、
  `(void)state->loadout().swap(...)`、`(void)output_.enqueue(...)`、
  `(void)world.random().next()`、`(void)populate_world(...)` 等"明确忽略有副作用
  调用返回值"的写法（RF-A3 要求保留）。`engine/src/net/multiplayer_wire.cpp`
  的 `(void)version; (void)flags;` 是对 reader 已校验的局部结果，不是未使用形参。
- 生成器/测试 helper：`client/tests/support/dense-codec.mjs` 删除重复的
  `DensePlanDecoder`，其 `offset` key 与产品 `DenseGroupPlan` 的组件 key 不再并存。
- 其余 TS/C++ helper 未发现新的未使用形参；`npm run lint`（含
  `noUnusedLocals`/`noUnusedParameters`）和引擎 `-Wall -Wextra` 构建均通过。

## 3. 验证

| 命令                         | 结果                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| `npm run format:check`       | pass（519 files，26 generated）                                |
| `npm run lint`               | pass                                                           |
| `npm run check:refactor`     | 0 new violations，baseline 只降不升                            |
| `npm run schema:check`       | 26/26                                                          |
| `npm run test:engine`        | 19/19                                                          |
| `npm run test:unit`          | 45/45                                                          |
| `npm run test:tools`         | pass                                                           |
| `npm run test:client`        | client-unit 143/143；client-integration 88/88                  |
| `npm run test:integration`   | 9/9                                                            |
| `npm run test:server:native` | 30/30                                                          |
| `npm run test:all`           | PASS，20 步全部通过，runId `2026-11-04T12-07-20.257Z-0cb7807a` |

`drawAnt`/`drawCactus`/`drawDrop`/`drawPetalShape` 没有独立的录制 canvas 断言
（`client/tests/unit/canvas-context.test.mjs` 只覆盖 context wrapper）。它们由类型
检查、lint 和 client-integration 的渲染生命周期用例间接覆盖；本次不改变任何
绘制坐标、颜色或调用顺序，因此没有像素级基线变化。
