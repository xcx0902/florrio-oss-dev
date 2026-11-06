# 框架结构

本文用 CodeGraph 索引整理当前产品代码的框架结构：模块清单、文件/符号规模、依赖方向、
入口链与边界规则。数据来自 `.codegraph/codegraph.db` 的 `files` / `nodes` / `edges` 表，
并与源码、`CMakeLists.txt`、`package.json` 交叉核对。

> 索引口径（2026-11-06，CodeGraph 1.6.2）：全仓 1,217 文件、19,873 节点、83,916 边。
> 其中 `archive/` 占 807 文件（冻结的逆向材料，只读、不参与构建）。剔除 `archive/` 后
> 产品代码为 410 文件、5,069 符号、27,230 边。下文所有统计均为剔除 `archive/` 后的口径。

## 1. 系统形态

同一个 C++ 领域核心被编译成两种适配器，前端只认一种传输抽象：

| 运行时       | 进程/容器         | 入口                                    | 权威性                            | 产物                              |
| ------------ | ----------------- | --------------------------------------- | --------------------------------- | --------------------------------- |
| 原生联机     | `florr_server`    | `server/src/main.cpp`                   | 唯一在线权威，二进制 WebSocket    | `build/native/server/`            |
| 离线诊断     | Web Worker + WASM | `engine/src/wasm/entry.cpp`（C ABI）    | 仅 `?profile=offline`，回归与诊断 | `build/wasm/server.wasm`          |
| 浏览器客户端 | Chromium 桌面     | `client/src/main.ts` / `main-online.ts` | 纯表现层，不保存权威状态          | `dist-next/`、`dist-multiplayer/` |

两者共用 `engine_core`（core + catalog + model + sim + net + 只读实体诊断）与同一个 50 ms
tick 入口；差异只在外壳：`server_runtime` 负责 socket/房间/会话，`engine_worker_adapter`
负责 `WorkerApi`、C ABI 与离线诊断命令。

## 2. 顶层目录职责

| 目录                   | 角色                                                  | 是否构建输入 | 索引文件  |
| ---------------------- | ----------------------------------------------------- | ------------ | --------- |
| `engine/`              | C++20 领域核心、协议 codec、WASM ABI、CTest           | 是           | 157       |
| `server/`              | 原生 WebSocket 宿主、房间/会话/指标、宿主测试         | 是           | 29        |
| `client/`              | TypeScript + Canvas2D 客户端与其测试                  | 是           | 136       |
| `schema/`              | 协议、传输、目录的单一事实来源（YAML/JSON）           | 是           | 2（YAML） |
| `tools/`               | 生成、构建、打包、验收、性能、浏览器夹具              | 是           | 67        |
| `tests/`               | 跨端 fixture 与产品级 Node 测试                       | 是           | 14        |
| `docs/`                | 规格、ADR、语义、发布与验收文档                       | 否           | —         |
| `archive/`             | 冻结的逆向材料（WAT/还原 JS/证据），只读              | 否           | 807       |
| `build/`、`dist-next/` | 本地生成物，不入库                                    | 否           | —         |
| `dist-multiplayer/`    | 在线专用交付树，不入库                                | 否           | —         |
| `reports/`             | 验收与性能证据（`reports/current-verification.json`） | 否           | —         |

## 3. 依赖总图

```
schema/*.yaml|json
  └─ tools/generate.mjs ─> engine/include/engine/{net,catalog}/*.hpp
                        └─> client/src/schema/*.ts        （生成，勿手改）

编译期依赖（箭头 = depends on）：
florr_server ─> server_runtime ─> engine_core
engine_worker_adapter ─────────> engine_core      （离线 WASM 适配器）
client/src: main ─> app ─> {net, state, input, render, ui, audio} ─> schema

运行时链路：
florr_server <── WebSocket ──> NetworkTransport
server.wasm  <── Worker ─────> LocalWorkerTransport
```

模块级实测依赖（唯一文件对计数，箭头为「imports/includes」）：

| 消费者          | 依赖                                                        |
| --------------- | ----------------------------------------------------------- |
| `engine/sim`    | model(53) core(17) catalog(4)                               |
| `engine/net`    | sim(11) core(8) model(8) catalog(1)                         |
| `engine/model`  | catalog(8) core(8) sim(7) net(1)                            |
| `client/render` | schema(32) state(26) ui(18) app(3)                          |
| `client/state`  | schema(15) net(2)                                           |
| `client/net`    | schema(13) state(7)                                         |
| `client/app`    | net(8) state(8) input(3) render(3) schema(3) ui(1) audio(1) |

## 4. `engine/`：领域核心与两个适配器

### 4.1 模块

| 模块          | 文件 | 符号 | 职责                                                       | 关键类型                                                                       | 被依赖 |
| ------------- | ---- | ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| `core`        | 8    | 116  | 无领域语义的基础设施：f32、Vec2、RNG、固定步长、错误、perf | `f32`、`Vec2`、`MinstdRng`、`ServerRng`、`FixedStepClock`                      | 3      |
| `catalog`     | 8    | 111  | 生成目录数据与纯规则表（掉落、生成、花瓣战斗、ID 位宽）    | `PetalCatalogEntry`、`EntityCatalogEntry`、`DropChance`、`EntitySpawnDefaults` | 3      |
| `model`       | 19   | 247  | 世界与实体存储、玩家注册、关系查询、世界配置               | `World`、`Entity`、`EntityPool`、`Catalog`、`PlayerState`、`EntityRelations`   | 4      |
| `sim`         | 57   | 328  | 单个 tick 内的全部领域阶段（见 4.3）                       | `tick()`、`SpawnTable`、`CollisionContext`、AI/花瓣/战斗子系统                 | 4      |
| `net`         | 22   | 401  | 协议常量、快照编码/发布、复制基线、输入解码、Worker 适配   | `SnapshotPublisher`、`SnapshotEncoder`、`PeerSession`、`WorkerApi`             | 4      |
| `diagnostics` | 3    | 8    | 实体诊断视图（core）与 5 个 cheat 命令（仅适配器）         | `entities.hpp`、`commands.cpp` 的 5 个导出命令                                 | 0      |
| `wasm`        | 2    | 11   | C ABI 入口与导出表                                         | `abi.h`（8 core + 5 diagnostics + `malloc/free`）                              | 0      |

依赖方向（实测）：`core` 是被依赖的叶子，自身只包含模块内头文件；`catalog` 只包含自身头文件
与 `<cstdint>`；`sim` 主要向 `model` 借状态（53 条）；`model` 反向引用 `sim` 7 条，集中在
`world.hpp`/`player_state.hpp` 的共享值类型与 `world_config.cpp` 的初始化入口；`net` 依赖
`sim` 仅因 `WorkerApi`/`PeerSession` 直接持有 `PlayerCommands` 与 `Spatial` 类型；
`diagnostics`/`wasm` 位于最外层，不被任何模块引用。

### 4.2 共享入口与两种外壳

| 关注点      | 原生（`server/`）                                      | 离线（`engine_worker_adapter`）         |
| ----------- | ------------------------------------------------------ | --------------------------------------- |
| 世界初始化  | `engine::initialize_world(world, config)`              | `WorkerApi::init(populate)` 同函数      |
| 推进一拍    | `Room::tick()` → `engine::advance_world()`             | `WorkerApi::think()` → 同函数           |
| 输入        | `Connection` 解码 `wire::Message` → `Session::receive` | `sp_server_send` → `WorkerApi::send`    |
| 输出        | `wire::publish(...)` → `Session::send` → `Connection`  | `SnapshotPublisher::publish` → 输出队列 |
| 调试/可观测 | `--smoke-ticks` + `Metrics` JSON                       | 5 个 `sp_server_debug_*` 导出           |

`initialize_world` 里的两次兼容 RNG draw 与 `advance_world` 结尾的六次 draw 是刻意保留的
契约（见 ADR 0002），两条路径都必须经过，不能只改其中一条。

### 4.3 固定 tick 的阶段顺序

`engine/src/sim/tick.cpp` 是唯一阶段编排点，顺序即行为契约（`World::record_phase` 逐段留痕）：

```
prepare_players → regenerate_players → expire_projectiles → advance_pickups
→ update_petal_behaviors → constrain_linked_entities → replenish_population
→ update_ai → run_deferred_launches → update_effects → update_area_effects
→ zone restriction → petal phase → refresh_loadout_petals → update_petal_orbits
→ apply_all_player_controls → integrate_movement → release_ant_hole_ants
→ update_contact_tree → resolve_contacts → reap_dead → expire_drops
→ corpse sweep → hit flush → advance_tick(0.0) → prepare_players（重生资格边界）
```

新增领域阶段只能插进这一条链，并在 `docs/semantics/tick.md` 与结构测试中同步登记。

### 4.4 快照与复制链

```
World ──freeze_tick_changes──> TickChanges（事件 + 删除集）
      ──publish(world, changes, viewer, replication)──> SnapshotPublisher
      ──SnapshotEncoder──> bytes ──Session::send──> WebSocket
```

客户端反向：`SnapshotDecoder` → `NetworkSnapshotDecoder` → `WorldState.applyNetworkSnapshot`。
编码器与解码器都由 `schema/protocol.yaml` 生成的字段表驱动，没有第二套手写线上格式。

## 5. `server/`：原生权威宿主

### 5.1 组件

| 组件                      | 位置                                             | 职责                                                    |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `main` / `parse_options`  | `server/src/main.cpp`、`src/runtime/options.cpp` | 子命令：serve、check-config、smoke-ticks、help、version |
| `run_service`             | `src/runtime/service.cpp`                        | 建 `io_context`、装信号、启动/停止、打印指标            |
| `NetworkServer::Impl`     | `src/net/host.hpp`                               | 监听、连接表、tick 定时器、排空定时器、优雅停止         |
| `Connection`              | `src/net/connection.cpp`                         | HTTP 健康检查 → WebSocket 升级 → 帧循环、背压、心跳     |
| `RoomManager`             | `include/florr/server/room_manager.hpp`          | 房间生命周期、待入房队列、epoch 分配、过载拒绝          |
| `Room`                    | `src/room.cpp`                                   | 一个 `engine::World` + 成员表 + 每 tick 命令/输入/发布  |
| `Session`                 | `src/session.cpp`                                | `PeerSession` 绑定、限流桶、ping/pong、错误关闭         |
| `FixedTickScheduler`      | `include/florr/server/scheduler.hpp`             | 单调时钟换算到期 tick，丢弃不可追的积压                 |
| `TokenBucket` / `Metrics` | `scheduler.hpp`、`src/metrics.cpp`               | 入站限流与可观测计数（JSON 输出）                       |
| `Config`                  | `src/config.cpp`                                 | 严格校验的 JSON 配置、Origin 白名单、容量与超时         |

### 5.2 一次入房 + 一个 tick 的调用链

```
accept → http_read/upgrade → read
      ├─ Hello → RoomManager::hello → Room::admit → Session::bind(World, ViewerContext)
      └─ 其它消息 → Session::receive（只入队，不动 World）
schedule → RoomManager::tick
      ├─ 所有房间 Room::begin_tick（重连 grace / 空房边界）
      ├─ 处理 pending 入房（Room::admit）
      └─ 逐房 Room::tick
            → PeerSession::execute_commands / prepare_tick
            → engine::advance_world → freeze_tick_changes → publish → Session::send
```

执行模型：单个 `io_context` 线程串行跑网络与调度；50 ms `steady_timer` 到期后由
`FixedTickScheduler::poll` 算出应补的拍数（有上限），在一个回调里连跑 `RoomManager::tick`，
超出上限的墙上时间被丢弃并计入 `overloads`。每个 `RoomManager::tick` 内部先对全部房间
`begin_tick`、再处理入房、再逐房推进，因此同一轮内各房间的时间边界一致。

边界规则：网络回调只校验并写入有界队列；`World` 只在 `Room::tick` 内被修改（ADR 0002）。
`server/CMakeLists.txt` 只链接 `engine_core`，不链接 `engine_worker_adapter`，因此宿主进程
不携带 WASM/Worker/C ABI。

## 6. `client/`：浏览器渲染与网络

### 6.1 模块

| 模块     | 文件 | 符号 | 职责                                                                        | 被依赖 |
| -------- | ---- | ---- | --------------------------------------------------------------------------- | ------ |
| `app`    | 4    | 125  | 组合根：`GameApp`、`GameSession` 阶段机、`InputPump`、离线 `SimulationLoop` | 4      |
| `net`    | 12   | 277  | `Transport` 抽象、WebSocket 状态机、v2 codec、Worker RPC                    | 4      |
| `state`  | 19   | 382  | 快照投影、实体表/索引、插值、相机、预测、网络时钟                           | 4      |
| `render` | 42   | 834  | `FrameRenderer`、HUD/art/canvas2d 子模块、菜单与转场                        | 3      |
| `input`  | 6    | 136  | 键盘/指针/触控合成、装备拖拽、菜单命中                                      | 1      |
| `ui`     | 4    | 30   | 绘制与命中共用的布局几何（`rect`/`hud`/`inventory`/`death`）                | 3      |
| `schema` | 10   | 306  | 生成的协议/目录视图（**勿手改**）                                           | 7      |
| `audio`  | 1    | 8    | `SilentAudioBus` 预留音频边界                                               | 1      |
| `dev`    | 2    | 12   | `?test=1` 测试 API 与开发 cheat 面板                                        | 0      |

`render` 是最大模块（42 文件、834 符号），也是 `schema`/`state`/`ui` 的主要消费者；
`input` 只被 `app` 引用，`render` 不引用 `input`，绘制与输入保持单向。

### 6.2 帧循环

```
GameApp.frame(now)
  ├─ loadout.handleUiKeys / handleMenuPointer / menuControls.advance / handleHotbarPointer
  ├─ getHudLayout(w, h, level, mobile) → HudLayout（绘制与命中共用）
  ├─ input.updateMovementDisabled(layout)
  ├─ GameSession.prepareFrame(now, delta) → SessionFrameView（menuFrame / player / deathProgress）
  └─ FrameRenderer.frame(now, delta, layout, view) → RenderResources + drawFrame
```

阶段机（`GameSession`）：`menu → joining → playing → dying → dead → returning → menu`，
任意活动阶段可进入 `error`；阶段变更只发生在 session，渲染器只读 `SessionFrameView`。

### 6.3 传输与解码

```
main.ts ──fetch connection.json──> GameApp(transportFactory: local ? LocalWorkerTransport : undefined)
main-online.ts ──> GameApp（无 Worker 分支，离线链接直接报错）
Transport（接口）
  ├─ NetworkTransport：WebSocket 状态机 → SnapshotDecoder → NetworkSnapshotDecoder
  └─ LocalWorkerTransport：ServerWorkerClient → Worker → server.wasm（C ABI）
```

在线构建 `dist-multiplayer` 从 `main-online.ts` 编译，模块图里不存在 `worker`/`local-worker`/
`server-worker.js`/`server.wasm`；离线构建 `dist-next` 才会注入 Worker 适配器。

## 7. 契约层与代码生成

`schema/` 是唯一事实来源，`tools/generate.mjs` 先校验全部输入、再整体计算、最后写入：

| 输入                      | 输出                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema/protocol.yaml`    | `engine/include/engine/net/generated_protocol.hpp`、`client/src/schema/protocol.ts`                                                                                                      |
| `schema/multiplayer.yaml` | `generated_multiplayer.hpp`、`client/src/schema/{multiplayer,motion}.ts`、`docs/multiplayer-protocol.md`                                                                                 |
| `schema/transport.json`   | `packet_key.hpp`、`client/src/schema/packet-key.ts`                                                                                                                                      |
| `schema/catalogs/*.json`  | `engine/include/engine/catalog/*.hpp`、`client/src/schema/{petals,mob-gallery,menu-content,loadout,catalog-ids,state-flags}.ts`、`schema/catalogs/drop-chances.json`、`docs/catalogs.md` |

`schema/generated-outputs.json` 记录每个输出的路径、字节数与 SHA-256，是 `schema:check` 的比对基准。

生成文本由模板直接产出，不经过格式化；手改生成文件会被 `npm run schema:check` 判为失败。

## 8. 构建与交付

| 命令                        | 输入                                       | 输出                                        |
| --------------------------- | ------------------------------------------ | ------------------------------------------- |
| `npm run schema:generate`   | `schema/**`                                | 上述生成文件 + manifest                     |
| `npm run build:engine`      | `engine/sources.cmake`、`abi-exports.json` | `build/engine/`（`engine_core` + CTest）    |
| `npm run build:engine:wasm` | 同一 `ENGINE_CORE_SOURCES` + `wasm/`       | `build/wasm/server.wasm` + `*.build.json`   |
| `npm run build:client`      | `client/src`、`client/tsconfig.json`       | `build/client/`（fresh staging + 原子替换） |
| `npm run build:dist-next`   | 上述产物 + `client/static`                 | `dist-next/`（含 Worker/WASM/dev）          |
| `npm run build:server`      | `server/` + `engine_core`                  | `build/native/server/florr_server`          |
| `npm run build:multiplayer` | `main-online.ts` 模块图 + 原生二进制       | `dist-multiplayer/`（无 WASM/Worker）       |

交付树差异：

| 内容                      | `dist-next`    | `dist-multiplayer`             |
| ------------------------- | -------------- | ------------------------------ |
| `main.js`                 | 有（离线入口） | 有（由 `main-online.ts` 编译） |
| `main-online.js`          | 有             | 无                             |
| `server-worker.js`        | 有             | 无                             |
| `server.wasm`             | 有             | 无                             |
| `dev/`、`local-worker.js` | 有             | 无                             |
| `build-manifest.json`     | 有             | 有                             |

两者都带 `connection.json` 与 `build-manifest.json`；`verify-dist-next.mjs` 校验清单、
源码身份与产物一致性。

## 9. 测试与验收框架

| 层             | 位置                                      | 运行方式                                 |
| -------------- | ----------------------------------------- | ---------------------------------------- |
| 引擎单元/结构  | `engine/tests/unit/*.cpp` + `cases/*.inc` | CTest（19 个 target）                    |
| 原生宿主       | `server/tests/*.cpp`                      | CTest（含 network/faults/process）       |
| 客户端单元     | `client/tests/unit/*.mjs`                 | `npm run test:client`                    |
| 跨端 fixture   | `tests/fixtures/product/**`               | `npm run test:integration`               |
| 浏览器场景     | `client/tests/integration/*.mjs`          | `tools/run-tests.mjs client-integration` |
| 交付与工具自身 | `tests/unit`、`tests/tools`               | `npm run test:unit` / `test:tools`       |

统一验收由 `tools/verification/gates.mjs` 定义（当前 26 个 gate，顺序固定），
结果写入 `reports/current-verification.json` 与 `reports/runs/`；`npm run test:all`
是唯一入口。`tools/check-refactor.mjs` 另有一条结构规则门禁：历史表述账本必须为空，
新增出现即失败。

## 10. 结构约束与实测例外

**成立的方向性规则**

1. `engine_core` 不依赖 socket、事件循环、浏览器或 Emscripten（实测：`engine/include`、
   `engine/src` 中无 `boost/asio`、`boost/beast`、`emscripten` 引用）。
2. `server_runtime → engine_core`；宿主不链接 `engine_worker_adapter`。
3. 客户端在线模块图不含 Worker/WASM；`render` 不依赖 `input`；`app` 是唯一组合根。
4. `schema` 被 `app`/`net`/`state`/`render`/`input`/`ui` 消费，生成文件不参与手写引用；
   唯一的反向引用是生成代码里的 codec 类型（见例外）。

**实测例外（CodeGraph 边，需要知晓而非修补）**

| 现象                                                     | 证据                                                                                | 性质                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| `model` 与 `sim` 头文件互相包含                          | `model/world.hpp` → `sim/collision_context.hpp`、`sim/player_loadout.hpp`           | 共享值类型，按所有权分目录而非严格 DAG |
| `net` → `sim`（11 条）                                   | `worker_api.hpp`、`peer_session.hpp` → `sim/player_commands.hpp`、`sim/spatial.hpp` | 适配器直接持有命令/空间类型            |
| `core` → `model` / `net`（各 1 条）                      | 仅 `src/core/contracts.cpp` 的 `static_assert` 编译期断言 TU                        | 不进入运行时的契约检查                 |
| `client/schema` → `client/net`（1 条）                   | `schema/multiplayer.ts` 引用 `WireWriter`/`WireReader`                              | 生成代码复用 codec 类型                |
| `client/input`、`client/render` → `client/app`（2/3 条） | 均为 `import type`（`GameApp`、`SessionFrameView`）                                 | 编译期类型，无运行时环                 |

## 11. 用 CodeGraph 复现

```sh
codegraph status                     # 索引规模、语言分布、待同步文件
codegraph sync                       # 增量同步；query/explore 前先做
codegraph files --filter engine --max-depth 6 --no-metadata
codegraph explore "room tick replication" --max-files 3
codegraph callers "advance_world"    # 谁在推进世界
codegraph callees "Room::tick"       # 一拍之内的调用面
codegraph impact "SnapshotPublisher" # 改动影响面
```

索引包含 `archive/`（807 文件），做产品结构分析时需在查询结果中排除该前缀；模块级依赖
可用 `edges.kind = 'imports'` 与 `nodes.file_path` 聚合得到，本文表格即此口径。
