# Legacy Florr 语义重建：目标与实施计划

## 2026-10-25 用户交互缺口整改

用户实测指出首页、掉落图案、花瓣图案、Inventory 与死亡返回五类缺口。本轮已先对照冻结原版核实，再在新客户端修复，并新增真实键鼠交互与 38 类花瓣 WASM oracle 回归。证据、实际通过数、交付身份和验证边界统一见 [UI 修复记录](docs/ui-repair.md) 与 [`reports/ui-repair/summary.json`](reports/ui-repair/summary.json)。

本轮最终完整运行 `2026-10-25T14-09-21.352Z-166531b5`：26/26 步通过，源码与交付身份稳定；JavaScript 940/940、engine 110/110、client 222/222、delivery 54/54、browser 47/47，CTest 5/5。原版八场景各三帧 Canvas 零差异、像素在原阈值内；24 个生产交互录制均通过。首轮失败记录保留，新客户端自洽基线单独版本化，未改原版 golden、旧基线静态文件、固定输入或容差。

下节三轮完整验收是修复前源码的历史证据，不能据此声称当前版本覆盖所有 UI 或物种。默认交付需以本轮重建的 `dist-next` 和对应报告为准。原版资产、历史 audit、golden、固定输入、容差与 field26 决定均保留。

## 历史：2026-10-25 本地验收与归档状态

稳定源码上两轮完整验收通过，真实 move/restore 演练后最终 move，再次完整验收通过。JavaScript 937/937、engine TAP 110/110、client 195/195、delivery 47/47、browser 47/47；CTest 5 个目标（core/sim/peer及schema合约检查）全通过。原版八场景×三帧 Canvas 在约定容差内无差异，像素全部在原阈值内；短/长 strict、14项 Hornet、24个生产交互及原客户端真实生命周期均通过。

最终 run：`2026-10-25T11-56-33.590Z-d7d59eb3`。完整身份、三轮结果和归档日志见 [`reports/release-acceptance.json`](reports/release-acceptance.json) 与 [本地发布记录](docs/release-acceptance.md)。默认入口为 dist-next，--reference 回退保留；六个 oracle/report 目录已真实移入 legacy，兼容原路径，恢复演练成功。

远端 Ubuntu CI 未执行（目录没有 .git/remote，无容器运行时）。CI 配置已修，不能声称线上全绿。历史 audit、golden、原始输入和容差不变；field26既有域扩展决定不变。后文历史计数/残差不作为当前验收结论。Synology Drive 项目同步已由用户暂停；恢复同步前须处理同步端旧目录与兼容 symlink 的类型冲突。

本地整改与归档演练的证据见 [发布记录](docs/release-acceptance.md) 的映射表；R33/F05 的远端 Linux CI 实跑仍待可用外部环境。阶段0/1/2/3的约定本地验收、阶段4本地可回滚切换已完成，不能宣称远端发布验收完成。

### 历史页首状态（2026-10-24，保留审计记录）

> **以下页首统计及 §18 的旧验证/路线是历史快照，不是当前通过数、当前 CI、当前 constants 实现或当前验收结论。**

> 状态：执行中（阶段 0/1 完成；阶段 2 门禁 **6/6**（R04 残差）、阶段 3 门禁 **4/4**（R19 视觉未达）、阶段 4 **3/4**；26 项阶段门禁 **25 通过 / 0 部分 / 1 未通过**；§13 清单 **15/18 完成 / 1 部分 / 2 未完成**）。最近验证（2026-10-24 08:05 本轮实跑）：`test:javascript:tap` 692/692、`test:engine` 90/90、`test:client` 68/68、`parity:server` 8/8、`test:parity` 8/8、`parity:engine-state` **strict 8/8**、`parity:client` 8/8（自洽，已刷新基线）、`parity:original-engine` 8/8（截图停在菜单，仅协议证据）、engine wasm 211,588 B / `0f0ab8dc…`、`test:all:twice` ✅ 两次通过。视觉仍为菜单 4.10% / 游戏 25.35–29.87%。
> 最近更新：2026-10-24（本轮审计：重录引擎态截图、刷新新客户端自洽基线、更正阶段 2/3 的“已收口”表述；R04 改为 Hornet stinger 触发条件与 `function_695` 重建；R13/R14/R19 仍为关键路径）。R23 签字为 Chromium-only（含 Chrome 移动视口触控）。
> 目标平台：纯 Web
> 验收口径：行为等价 + 渲染结果不变（允许字体抗锯齿等实现差异）
> 本文档只描述目标、决策、架构、阶段、门禁与验收，不包含时间线。

---

## 1. 总目标

把当前“WAT + JS 逐函数替换”的逆向工程，推进为一个**可长期维护的语义重建工程**：

1. 用 **C++20** 重建服务端与共享游戏规则；
2. 用 **TypeScript + Canvas2D** 重建 Web 客户端；
3. 用原 wasm / WAT / 原 JS 作为 **oracle 和参考实现**，证明新实现行为等价；
4. 最终交付一个纯 Web、可继续开发、可调试、可测试的游戏，而不是一堆按 wasm 函数编号组织的翻译代码。

核心判断：

> 内存布局是原实现的细节，不是新工程的架构。新代码按领域组织，不按 wasm 函数编号组织。

---

## 2. 已确定的关键决策

| 决策 | 结论 |
| --- | --- |
| 是否接受行为等价 | **接受**。不要求 C++ 编译出的 wasm 与原文件逐字节一致 |
| 目标平台 | **纯 Web**，浏览器直接运行 |
| 客户端渲染 | **Canvas2D**，不改成 WebGL 场景渲染 |
| 服务端 | C++20 编译为 wasm，运行在 Web Worker |
| 客户端 | TypeScript + Canvas2D，负责网络、状态、插值、输入、渲染、UI |
| 共享规则 | 服务端模拟、伤害、生成、碰撞等放在 C++ core |
| 未完成的 JS | **保留、冻结，不再继续用 JS 补函数** |
| 已完成的 JS | 作为可执行规格和差分 oracle，不直接机械翻译成 C++ |
| 原 wasm/WAT | 永久保留，作为最高事实来源 |
| 原始工程类名 | 不追求还原；按领域重新命名，保留证据和置信度 |
| 最终渲染 | 以 Canvas2D 命令 trace + 截图 diff 保证“看起来和玩起来不变” |
| 协议 field 26 | **永久域扩展（2026-10-24 签字）**：原字段语义不再恢复；`schema/protocol.yaml`、C++ 快照写端与 TS 解码统一按扩展字段处理，回退需新 ADR |

### 2.1 为什么是 Canvas2D

原客户端游戏主体绘制走的是 Canvas2D 桥，而不是 WebGL 场景渲染：

- `source/javascript/client.js` 中存在 `canvasContexts`、`Path2D`；
- `ASM_CONSTS` 136300–138582 提供 `canvasSave`、`canvasSetTransform`、`canvasFill`、`canvasStroke`、`canvasArc`、`canvasFillText`、`canvasDrawImage` 等桥接；
- `source/game/client/render-frame.mjs`、`drawing-primitives.mjs`、`text.mjs` 等恢复代码也是按 Canvas2D 命令组织的。

因此新客户端使用 TypeScript + Canvas2D，最容易做到视觉一致；改用 WebGL 会显著增加 parity 难度。

---

## 3. 成功标准

### 3.1 功能标准

- 新 C++ server + 原版 client 能完成一局单人游戏；
- 新 C++ server + 新 TS client 能完成一局单人游戏；
- 移动、攻击、防御、装备、怪物生成、伤害、死亡、掉落、重开均正常；
- 固定随机种子、固定输入序列下，服务端状态可复现；
- 协议与原始 worker 消息兼容。

### 3.2 可维护性标准

- `engine/src` 与 `client/src` 的领域代码中（排除 schema 生成访问器）不出现 `264876`、`8551040` 这类魔法地址；
- 偏移只存在于 `schema/` 和生成的访问器中；
- 所有关键结构有 schema、`static_assert` 或运行时校验；
- 游戏数据（花瓣、实体、生成规则、字符串）从数据文件加载；
- 代码按 `World / Entity / Petal / Damage / Spawn / Snapshot` 等领域组织；
- 不把 vtable thunk、析构、locale/string 等 ABI 噪声当作业务代码手写。

### 3.3 渲染标准

- 相同场景、相同状态、相同 viewport/DPR/字体下：
  - Canvas2D 命令 trace 的 op 顺序、颜色、alpha、线宽、变换一致；
  - 截图 diff 在约定阈值内；
  - 布局、颜色、形状、动画、UI 无可见差异；
  - 字体抗锯齿、浏览器光栅化差异允许被 mask。

### 3.4 回归标准

- `reference` 构建仍然逐字节可重建；
- 现有函数级 oracle 测试继续通过；
- 新 server trace、canvas trace、截图 diff 全部纳入 CI；
- 删除任何 reference 资产前，必须有对应的 parity 证据。

---

## 4. 非目标

以下事情明确不做：

1. **不追求还原原作者的 C++ 类名、变量名、目录结构**。符号已被剥离，只能从行为和字符串推断。
2. **不追求 C++ 编译产物与原 wasm 字节一致**。只做行为等价。
3. **不继续逐函数补 JS**。按冻结 `reports/build.json` 基线，911 个客户端 + 218 个服务端机器码函数不再逐个用 JS 实现；923/222 是更早的规划快照。
4. **不逐个翻译 vtable thunk、析构、locale、iostream、std::string 等 ABI 函数**。C++ 编译器/标准库负责这些。
5. **不从 `clientFrame` 开始逐指令翻译**。它是 106,810 条指令、2,097 个直接调用的高度内联函数，应作为调用图和阶段清单使用。
6. **不先做渲染器再做游戏逻辑**。先 server，后 client，最后视觉打磨。
7. **不把 Canvas2D 改成 WebGL 场景渲染**。保持原绘制模型，降低 parity 风险。
8. **不在没有 trace 的情况下重写大模块**。每个域必须有行为基准。
9. **不删除 `web/`、`upstream/`、WAT、原始 JS、reports、现有测试**。它们是 oracle。

---

## 5. 当前基线

### 5.1 函数规模

按 `reports/wasm/manifest.json`：

| 模块 | 函数数 | 导入数 |
| --- | ---: | ---: |
| client | 4,245 | 361 |
| sp_server | 734 | 14 |
| 合计 | 4,979 | 375 |

按当前 `reports/build.json`：

| 模块 | 已替换为 JS | 仍为机器码 |
| --- | ---: | ---: |
| client | 3,334 | 911 |
| sp_server | 516 | 218 |
| 合计 | 3,850 | 1,129 |

> 口径：以上数字直接取自 `reports/build.json` 的 `recoveredFunctions.length` 与
> `remainingMachineFunctions`（2026-10-21 基线），并由
> `node tools/reference-manifest.mjs` 写入 `reference/manifest.json`。
> `reports/RECONSTRUCTION.md` 的“覆盖统计”表用的是另一个量（“已迁入高层执行的
> 函数”与“仍有机器级实现的函数”），与这里的“已替换/仍为机器码”不是同一口径；
> 引用剩余工作时统一以 `build.json` 为准。

### 5.2 客户端“已恢复”函数的构成

客户端 3,334 个已替换函数中，按实现模块名粗略分类：

- 2,452 个是 vtable 相关 thunk（约 73.5%）；
- 133 个是析构/清理；
- 176 个是 forwarder/adapter/wrapper；
- 83 个是 leaf/straight-line；
- 约 490 个是其他逻辑。

分类由 `reports/build.json` 的 `source` 字段启发式统计，只用于说明数量级；
精确分类需要按 WAT 证据逐项审计。

这说明：**JS 恢复数量被 ABI 噪声放大了**。C++ 重建中，这些 thunk/析构应当由编译器生成，不应手写。

### 5.3 重点难点

- `clientFrame`（client 1095）：106,810 条指令、2,097 个直接调用、933 个已恢复被调函数；
- `sp_server` 的 `malloc`、`free`、`memcpy`、`memset` 等库函数仍很大；
- 客户端 434 个剩余函数超过 300 条指令；
- 服务端剩余函数中也有多个 3,000+ 指令的大函数。

结论：不能按函数逐个硬啃，必须按领域纵切 + 场景 trace。

---

## 6. 资产保留策略

### 6.1 保留清单

| 资产 | 处理 | 原因 |
| --- | --- | --- |
| `source/wasm/client.wat` | 永久保留 | 最高事实来源，可逐字节重建 |
| `source/wasm/sp_server.wat` | 永久保留 | 同上 |
| `web/`、`upstream/` | 冻结 | reference build、浏览器对照 |
| `source/javascript/client.js` | 冻结 | Emscripten 胶水、Canvas2D 桥参考 |
| `source/javascript/sp_server.js` | 冻结 | worker 消息协议参考 |
| `source/game/**/*.mjs` | 冻结 | 可执行规格、差分参考 |
| `source/runtime/registry.mjs` | 仅 reference build | 新工程不再使用 registry |
| `source/semantic/*` | 保留 | 已提取的目录、字符串、行为记录 |
| `source/decompiled/*` | 保留 | 控制流/字段交叉参考 |
| `reports/*` | 保留 | 证据、函数清单、测试记录 |
| `test/helpers/oracle-harness.mjs` | 保留并扩展 | 函数级差分基础 |
| `web/debug-hooks.js` | 保留并扩展 | Canvas2D trace 注入点 |

### 6.2 未完成 JS 的定位

按冻结基线仍为机器码的 911 + 218 个函数（共 1,129 个）：

- **不删除**：它们是当前可玩版本的一部分，也是行为参考；
- **不继续用 JS 实现**：不再新增 `source/game` 语义模块；
- **不机械翻译**：不把 `damage.mjs` 里的偏移表达式直接抄成 C++ 指针运算；
- **只作为证据**：用于写 `docs/semantics/*.md`、设计 schema、构造测试用例；
- **最终归档**：新实现覆盖某域后，把对应 JS 移到 `legacy/js/`，保留测试引用。

一句话：**未完成的 JS 是证据，不是债务。**

---

## 7. 目标架构

```
原 wasm/WAT ──(oracle / trace)──> parity tests
      │
      └──(探针 / dcmp / strings)──> schema + semantics docs
                                      │
                                      ▼
                         C++20 core (server + rules)
                                      │
                              wasm + worker shim
                                      │
                                      ▼
                         TypeScript Canvas2D client
```

### 7.1 C++ core

职责：

- 世界与实体模型；
- 服务端 tick；
- 输入协议；
- 生成、移动、碰撞、AI；
- 花瓣、伤害、死亡、掉落；
- 快照序列化；
- 确定性 RNG、固定步长、浮点行为。

不负责：

- DOM、Canvas、浏览器事件；
- UI 布局；
- 字体加载；
- 音频输出；
- 网络 worker 的 JS 侧消息循环。

### 7.2 TypeScript client

职责：

- 启动、canvas、DPR/resize；
- worker 通信；
- 快照解码；
- 实体表、插值、相机；
- 输入（鼠标/键盘/触屏）；
- Canvas2D 绘制；
- UI/菜单/tooltip；
- 音频（如需要）；
- parity trace 输出。

不负责：

- 权威游戏规则；
- 服务端生成/伤害计算；
- 协议字节布局（由 schema 生成类型）。

### 7.3 共享契约

- `schema/protocol.yaml`：worker 消息、输入包、输出包、快照；
- `schema/layout/*.yaml`：World/Entity/Component 字段；
- `schema/catalogs/*.json`：花瓣、实体、生成规则、字符串；
- 代码生成：C++ 头文件、TS 类型、Markdown 文档。

---

## 8. 目标仓库结构

不立即移动现有目录，先新增：

```
engine/                         # 新 C++20 核心
  CMakeLists.txt
  include/engine/
    abi.h
    core/f32.hpp
    core/vec2.hpp
    core/rng.hpp
    model/world.hpp
    model/entity.hpp
    net/protocol.hpp
  src/
    core/
    model/
    sim/
      spawn.cpp
      movement.cpp
      collision.cpp
      petals.cpp
      damage.cpp
      effects.cpp
      tick.cpp
    net/
    wasm/
  tests/
    unit/
    trace/

client/                         # 新 TypeScript 客户端
  package.json
  src/
    main.ts
    net/worker.ts
    net/protocol.ts
    state/snapshot.ts
    state/world.ts
    state/interpolation.ts
    input/pointer.ts
    input/keyboard.ts
    input/touch.ts
    render/canvas2d/context.ts
    render/canvas2d/path.ts
    render/canvas2d/text.ts
    render/canvas2d/sprites.ts
    render/world.ts
    render/ui.ts
    audio/
  public/
    server-worker.js
  tests/

schema/
  protocol.yaml
  layout/
    world.yaml
    entity.yaml
    components.yaml
  catalogs/
    petals.json
    entities.json
    spawn-rules.json
    strings.json

tools/
  domain-map.mjs
  layout-probe.mjs
  gen-contracts.mjs
  parity/
    run-scenario.mjs
    canvas-trace.js
    server-trace.mjs
    screenshot-diff.mjs
    trace-diff.mjs

tests/
  parity/
    scenarios/
    golden/
  reference/                    # 现有测试的 reference 分组
  engine/                       # C++ 测试入口

reference/
  README.md
  manifest.json                 # 哈希、构建、测试基线

docs/
  semantics/
  adr/
  parity.md
```

最终切换后，再把旧目录移入 `legacy/`：

```
legacy/
  js/
  runtime/
  game/
  reports/        # 或保留在顶层
```

---

## 9. 实施阶段

### 阶段 0：冻结参考，建立 parity 基础设施

#### 任务

1. 给当前 commit 打 tag：`reference-<date>`。
2. 新增 `reference/manifest.json`：
   - `web/client.wasm`、`web/sp_server.wasm` 的 SHA-256；
   - `dist/`、`dist-readable/` 的构建哈希；
   - 当前通过的测试列表；
   - 当前 `build.json` 的函数统计。
3. 新增 `reference/README.md`，声明该目录/构建只用于对照，不再修改。
4. 实现 `tools/parity/canvas-trace.js`：
   - 包装 `HTMLCanvasElement.prototype.getContext`；
   - 包装 `CanvasRenderingContext2D` 的绘制方法；
   - 包装 `Path2D` 的路径方法；
   - 记录 `canvasContexts` 的创建/销毁；
   - 输出稳定 JSON：`{frame, ops:[{op, args}]}`。
5. 实现 `tools/parity/run-scenario.mjs`：
   - Playwright 启动 Chromium；
   - 固定 viewport 1280×720、DPR 1；
   - 等 `document.fonts.ready`；
   - 用 Playwright clock 或注入假时钟固定 `performance.now` / `Date.now` / `requestAnimationFrame`；
   - 注入固定输入序列；
   - 等待固定帧数；
   - 导出 Canvas2D trace、截图、server trace。
6. 定义基准场景：
   - `boot-menu`：加载到主菜单；
   - `garden-idle`：进入花园，不操作；
   - `move`：固定方向移动 N 帧；
   - `attack`：固定角度攻击；
   - `equip`：装备/卸下花瓣；
   - `damage`：被怪物攻击、血量变化；
   - `death`：死亡/重生；
   - `spawn`：特定怪物生成。
7. 实现 `tools/parity/server-trace.mjs`：
   - 加载原 `sp_server.wasm`；
   - 调 `init`；
   - 按固定 dt 调 `think`；
   - 注入固定 `send` 字节；
   - 每个 tick 导出实体数、类型、位置、血量、花瓣、RNG 状态、输出包。
8. 建立 `tests/parity/golden/`，保存 trace 与截图。

#### 交付物

- `reference/manifest.json`；
- `canvas-trace.js`；
- `run-scenario.mjs`；
- `server-trace.mjs`；
- 8 个基准场景的 golden trace + 截图；
- `docs/parity.md`。

#### 门禁

一条命令能重放 `garden-idle`，得到稳定的 Canvas2D trace、截图和 server trace。

---

### 阶段 1：契约与 schema

#### 任务

1. 写 `schema/protocol.yaml`：
   - worker 消息：`funcName`、`callbackId`、`finalResponse`；
   - 输入包：XOR key、varint、命令号、字段；
   - 输出包：长度、内联/堆载荷、队列格式；
   - 快照：实体字段、组件 ID、事件类型。
2. 写 `schema/layout/*.yaml`：
   - `World`；
   - `Entity`；
   - `Petal`；
   - `ComponentStore`；
   - 空间索引；
   - 配置/会话。
3. 实现 `tools/layout-probe.mjs`：
   - 加载原 server；
   - 跑初始化/生成；
   - dump 已知全局、实体记录、花瓣记录；
   - 与 `source/semantic/server-catalogs.json` 对照；
   - 输出候选字段偏移与置信度。
4. 实现 `tools/gen-contracts.mjs`：
   - 从 YAML 生成 C++ struct + `static_assert`；
   - 生成 TS interface；
   - 生成 Markdown 字段文档。
5. 把 `server-catalogs.json` / `client-catalogs.json` 拆成 `schema/catalogs/*.json`：
   - 39 个花瓣；
   - 23 个实体；
   - 20 条生成规则；
   - 字符串/描述。
6. 定义 C ABI：`engine/include/engine/abi.h`。

#### 交付物

- `schema/protocol.yaml`；
- `schema/layout/*.yaml`；
- `schema/catalogs/*.json`；
- 生成的 C++/TS 类型；
- `docs/protocol.md`；
- `layout-probe` 报告。

#### 门禁

- schema 能生成 C++/TS；
- `layout-probe` 打印出的花瓣/实体数据与 `server-catalogs.json` 一致；
- 协议字段有明确的字节级定义。

---

### 阶段 2：C++ 服务端

服务端 734 个函数、516 个已恢复，范围小、协议可测，作为第一个完整目标。

#### 2.1 核心基础

`engine/src/core/`：

- `f32.hpp`：显式 float 转换，禁止隐式 double 收缩；
- `vec2.hpp`：位置、速度、角度；
- `rng.hpp`：复刻 Park–Miller 状态与调用顺序；
- `fixed_step.hpp`：20 Hz server tick；
- `pool.hpp`：实体池/句柄；
- `byte_reader.hpp` / `byte_writer.hpp`：varint、XOR、边界检查；
- `error.hpp`：错误码，不用异常跨 wasm 边界。

编译选项：

- `-ffp-contract=off`；
- 禁用 `-ffast-math`；
- `-fno-exceptions`（或统一错误码）；
- `-Wall -Wextra -Werror`；
- 固定 emsdk 版本并记录。

#### 2.2 模型层

`engine/src/model/`：

- `Catalog`：花瓣、实体、生成规则、字符串；
- `Entity`：类型、变换、血量、组件；
- `ComponentStore`：按组件 ID 的稠密存储；
- `World`：实体池、空间索引、RNG、时钟、输出队列；
- `Handle`：实体 ID + 版本，替代裸指针。

原则：领域代码中不出现原始内存偏移；偏移只在 schema 生成的访问器中。

#### 2.3 协议层

`engine/src/net/`：

- `InputReader`：XOR、varint、命令分发；
- `SnapshotWriter`：实体/组件/事件序列化；
- `OutputQueue`：内联/堆载荷、flush；
- `WorkerApi`：`init/send/think/flush`。

先做字节级测试，不接游戏逻辑。

#### 2.4 模拟层，按域推进

| 顺序 | 域 | 关键内容 | 验收 |
| --- | --- | --- | --- |
| 1 | 启动/目录 | `init`、39 花瓣、23 实体、20 生成规则 | 数据与原版逐字段一致 |
| 2 | 世界/实体 | 实体池、组件、变换、父子关系 | 空世界 tick 快照一致 |
| 3 | 输入/协议 | 移动、攻击、装备、丢弃 | 字节级一致 |
| 4 | 生成/移动 | 玩家、怪物、花瓣、掉落 | 固定种子生成序列一致 |
| 5 | 战斗 | 伤害、反伤、治疗、死亡、击杀归属 | 血量/死亡/掉落一致 |
| 6 | AI/碰撞 | 仇恨、四叉树、碰撞过滤 | 固定场景位置/目标一致 |
| 7 | tick/输出 | 效果、超时、快照、flush | 1000 tick trace 一致 |

#### 2.5 Worker shim

新增 `client/public/server-worker.js`，保持与原 `sp_server.js` 相同协议：

```js
onmessage = ({ data }) => {
  const fn = Module["_" + data.funcName];
  // 1. 把 data.data 复制到 wasm malloc 缓冲区
  // 2. 调用 fn
  // 3. 从输出队列读包
  // 4. postMessage({ callbackId, finalResponse, data })
};
```

必须支持：

- `sp_server_init`；
- `sp_server_send`；
- `sp_server_think`；
- `sp_server_flush`；
- 临时/最终响应；
- `callbackId` 匹配；
- 输入缓冲区复用与 transfer。

#### 2.6 服务端验收

- 新 C++ server + 原版 client 能完成一局单人游戏；
- 移动、攻击、怪物生成、死亡、掉落、重开正常；
- 固定场景 server trace 与原版一致；
- 协议字节级测试通过；
- 空世界 1000 tick trace 一致；
- 生成/战斗场景 trace 一致。

---

### 阶段 3：TypeScript 客户端

#### 3.1 壳与启动

`client/src/main.ts`：

- 创建 canvas；
- 处理 DPR/resize；
- 加载 Ubuntu 字体，等 `document.fonts.ready`；
- 加载 loading/menu；
- 启动 worker；
- 主循环：固定逻辑 tick + `requestAnimationFrame` 渲染。

#### 3.2 传输与状态

- `net/worker.ts`：与原 `sp_server.js` 相同的消息接口；
- `net/protocol.ts`：由 schema 生成；
- `state/snapshot.ts`：实体/组件/事件解码；
- `state/world.ts`：实体表、插值、相机、本地玩家；
- `state/interpolation.ts`：位置/角度插值、父子变换；
- `state/prediction.ts`：先不做；server-authoritative 稳定后再加。

#### 3.3 输入与相机

- 鼠标移动、左键攻击、右键防御；
- 键盘移动/快捷键；
- 触屏摇杆；
- 相机缩放/跟随；
- 昵称输入、聊天/菜单。

#### 3.4 Canvas2D 渲染器

实现与原桥接层同构的 `Canvas2DContext`：

```ts
interface Canvas2DContext {
  save(): void;
  restore(): void;
  setTransform(a, b, c, d, e, f): void;
  beginPath(): void;
  closePath(): void;
  rect(x, y, w, h): void;
  moveTo(x, y): void;
  lineTo(x, y): void;
  quadraticCurveTo(cx, cy, x, y): void;
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y): void;
  arc(x, y, r, start, end, ccw): void;
  ellipse(x, y, rx, ry, rotation, start, end, ccw): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x, y, w, h): void;
  strokeRect(x, y, w, h): void;
  clearRect(x, y, w, h): void;
  setFillRgb(r, g, b): void;
  setStrokeRgb(r, g, b): void;
  setGlobalAlpha(a): void;
  setLineWidth(w): void;
  fillText(text, x, y): void;
  strokeText(text, x, y): void;
  measureText(text): { width: number };
  drawImage(...): void;
}
```

绘制阶段顺序：

1. 背景/网格/arena 边界；
2. 地面掉落/阴影；
3. 实体（花、花瓣、怪物、子弹）；
4. 血条、名字、状态图标；
5. 粒子/伤害数字/屏幕效果；
6. UI（背包、槽位、按钮、tooltip）；
7. 菜单/加载/错误。

复用原版策略：

- 离屏 canvas 缓存文字/精灵；
- `Path2D` 或等价路径缓存；
- 同样的 RGB 取整、alpha、线宽、字体大小；
- 同样的相机变换和裁剪；
- 同样的颜色/材质常量。

#### 3.5 渲染 parity 工具

- **命令级**：新客户端输出 `DrawList`，与 reference 的 Canvas2D trace 做 diff：
  - 浮点容差 `1e-4`；
  - 允许 `measureText` 因字体栅格化略有差异；
  - 要求 op 顺序、颜色、alpha、线宽、变换一致。
- **像素级**：Playwright 截图，SSIM/像素 diff：
  - 固定 viewport/DPR/字体；
  - 文本抗锯齿差异用 mask；
  - 目标不是 100% 像素相同，而是布局/颜色/形状/动画一致。

#### 3.6 客户端验收

- 新 client + 新 server 能完成一局；
- 8 个基准场景的 Canvas2D trace 通过；
- 截图 diff 在阈值内；
- 60 FPS，无明显 GC 卡顿；
- 移动端触控可用（至少基本可玩）。

---

### 阶段 4：切换与归档

#### 4.1 双构建

```
dist/          # reference，保持原版
dist-next/     # 新 C++ server + TS client
```

切换方式：

- 独立页面 `next.html`；
- 或 `index.html?engine=next`；
- 内部默认 next，reference 保留。

#### 4.2 归档 JS

当某域被 C++/TS 完全覆盖：

1. 从 `dist-next` 构建中移除对应 JS 模块；
2. 把模块移到 `legacy/js/`；
3. 保留 `tests/parity` 里的引用；
4. 不删除 WAT、原始 `web/`、`reports/`。

#### 4.3 CI

必须同时跑：

```sh
npm run test:reference     # 原版 WAT 重建 + 现有差分
npm run test:engine        # C++ 单元测试（native）
npm run build:engine:wasm  # wasm 构建
npm run test:parity        # server trace + canvas trace + screenshots
npm run test:client        # TS 单元测试
```

#### 4.4 切换验收

- `dist-next` 是默认入口；
- reference 仍可构建、可玩；
- 生产构建不再包含 `source/game` 的语义 JS；
- 所有 parity 测试稳定通过。

---

## 10. 领域工作分解

### 10.1 服务端

| 顺序 | 域 | 主要函数/证据 | 关键交付 |
| --- | --- | --- | --- |
| 1 | 启动/目录 | `279`、`656`、`server-catalogs.json` | Catalog、World 初始化 |
| 2 | 协议 | `655`、`657`、`388` | InputReader/OutputQueue |
| 3 | 世界/实体 | `144`、`410`、`393` | Entity/ComponentStore |
| 4 | 生成/移动 | `144`、`654` 相关阶段 | Spawn/Movement |
| 5 | 花瓣/战斗 | `43`、`602`、`683` 等 | Petal/Damage/Death |
| 6 | AI/碰撞 | `162`、`163`、`167` | 空间索引/目标选择 |
| 7 | tick/输出 | `654`、`657` | 完整 20 Hz 模拟 |

### 10.2 客户端

| 顺序 | 域 | 主要函数/证据 | 关键交付 |
| --- | --- | --- | --- |
| 1 | 启动/菜单 | `main`、`clientFrame` 启动阶段 | 壳、字体、canvas |
| 2 | 传输/快照 | `1015`、`1013` | 协议、快照解码 |
| 3 | 世界状态 | `409`、`672`、`705` | 实体表、插值、相机 |
| 4 | 输入 | `762`、`421` | 鼠标/键盘/触屏 |
| 5 | 世界渲染 | `760`、`763`、`1040`、`1044` | Canvas2D 实体绘制 |
| 6 | UI/文本 | `392`、`556`、`587` | 背包、tooltip、文字 |
| 7 | 效果/音频/移动端 | `690`、`1100` 等 | 粒子、眼睛、触控 |

> 函数 ID 只作为证据，不作为代码组织单位。

---

## 11. 测试与 parity 策略

### 11.1 测试层级

1. **单元测试**：C++ core / TS 纯函数；
2. **函数级 oracle**：现有 `compareCases`，比较返回值位模式、陷阱、栈指针、内存哈希；
3. **协议测试**：字节级输入/输出；
4. **服务端场景 trace**：固定种子 + 固定输入，逐 tick 对比；
5. **客户端 Canvas2D trace**：固定状态 + 固定帧，对比绘制命令；
6. **截图 diff**：固定 viewport/DPR/字体，对比像素；
7. **集成测试**：原 client + 新 server；新 client + 新 server。

### 11.2 确定性要求

- 固定 server tick：20 Hz；
- 固定 RNG：复刻 Park–Miller 状态与调用顺序；
- 固定时钟：测试中注入假时钟；
- 浮点：`-ffp-contract=off`、禁用 fast-math、显式 `f32`；
- 输入：固定序列；
- 渲染：固定 viewport/DPR/字体/动画帧。

### 11.3 视觉差异处理

- 文本抗锯齿：允许 mask；
- 字体加载：等 `document.fonts.ready`；
- Canvas2D 实现差异：命令级优先，像素级次要；
- 动画：固定帧号，不用真实时间。

---

## 12. 每个功能的执行模板

不要按“函数”推进，按“功能纵切”推进：

1. **写规格**：`docs/semantics/<feature>.md`
   - 输入、状态、公式、边界、随机性、时序；
   - 证据：函数 ID、WAT 行、dcmp、探针结果。
2. **定 schema**：字段/枚举/协议。
3. **先写测试**：单元测试 + 场景 trace。
4. **实现**：C++ 或 TS，禁止魔法偏移。
5. **对比**：server trace / canvas trace / 截图。
6. **重构**：命名、拆分、文档。
7. **门禁**：通过后才进入下一个功能。

每个功能至少要有：

- 正常路径；
- 边界值；
- 陷阱/错误路径（若适用）；
- 固定种子复现；
- 原实现对照证据。

---

## 13. 验收清单

### 13.1 代码质量

- [x] `engine/src` 和 `client/src` 的领域代码中搜索不到 `264876`、`8551040` 这类魔法地址；schema 生成访问器遵循 §3.2 的既有例外。 领域源只读检索未发现上述地址或 runtime.call；关键布局校验范围另见 docs/schema-coverage.md，领域投影通过生成协议位置表读取。
- [x] §3.2 所列关键结构有 `static_assert` 或 schema 校验（普通领域辅助结构不声明复刻原始 ABI）。 按 §3.2 关键结构口径：生成布局断言进入真实 CMake 编译；覆盖清单及原版未知/假设边界见 docs/schema-coverage.md，不能把内部断言扩大为原版布局已完全证实。
- [x] 39 个花瓣、23 个实体、20 条生成规则从数据文件加载。 JSON→生成 constexpr→领域 Catalog；是构建时数据驱动。
- [x] 协议字段有 YAML 定义和生成代码。 schema/protocol.yaml 生成63字段、19 dense组和组件位置表；C++写端与TS解码共享此契约，生成一致性/负例回归通过。
- [x] 领域代码不依赖 `runtime.call(id, ...)`。 领域源搜索及具名C++调用链；oracle/probe 工具保留原函数调用。
- [x] 不包含手写的 vtable thunk/析构/locale/string 函数。 业务源检查通过；正常C++默认虚析构和生命周期管理不属于原ABI噪声翻译。

### 13.2 功能

- [x] 原版 client + 新 server 完成一局。 八场景原生state与同RAF绘制，可信攻防、death→解绑→新handle重开。
- [x] 新 client + 新 server 完成一局。 实际dist-next生产Worker录制与桌面/触控回归。
- [x] 移动、攻击、防御、装备、生成、伤害、死亡、掉落、重开正常。 生产24录制及原client生命周期、native/TS场景回归。
- [x] 固定种子下服务端状态可复现。 八场景短strict和各1000tick长strict逐tick通过。

### 13.3 渲染

- [x] 8 个基准场景 Canvas2D trace 通过。 八场景各三帧完整命令，1e-4容差内无差异。
- [x] 截图 diff 在阈值内。 全部ratio≤0.001、max≤8；原golden/输入/容差不变。
- [x] 字体/DPR/resize 行为一致。 client/browser回归与desktop/retina/touch生产覆盖；范围仍为既定Chromium矩阵。
- [x] 粒子/伤害数字/UI 无明显差异。 事件11命中及绘制回归、完整Canvas和原阈值像素对照。

### 13.4 构建与回归

- [x] `dist-next` 不包含 `source/game` 语义 JS。 构建交付完整性检查与禁止oracle路径检查。
- [x] `dist` reference 仍逐字节可重建。 frozen manifest及实际构建/恢复校验。
- [x] 现有函数级 oracle 测试通过。 三轮各自完整JavaScript TAP。
- [ ] CI 同时跑 reference、engine、parity、client：配置及本机相同步骤已通过，远端 Ubuntu 实跑未取得证据，F05 外部项仍开放。

---

## 14. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 视觉 parity 难 | 用户感知“游戏变了” | Canvas2D 命令 trace 优先；截图 diff；同字体/同 DPR；固定帧 |
| 浮点差异 | 位置/伤害偏移 | 固定步长、`f32` 包装、禁用 fast-math、`-ffp-contract=off` |
| RNG 差异 | 生成序列不同 | 复刻 Park–Miller 状态与调用顺序；固定种子 trace |
| 协议不兼容 | 原 client 连不上 | 字节级测试；worker shim 保持原消息格式 |
| 范围蔓延 | 长期无法交付 | 按域纵切；每域有门禁；先 server 后 client |
| 浏览器自动化不稳定 | parity 测试 flaky | 固定时钟/视口/DPR；命令 trace 为主，截图为辅 |
| C++/wasm 调试困难 | 开发效率低 | 核心先 native 测试；再 wasm；保留 source map/日志 |
| 性能回退 | 帧率下降 | C++ core；Canvas2D 同原版；性能预算与 profiling |
| 误把未知字段当已知 | 隐性错误 | schema 标注 confidence；未知字段保留 `unknown_0x...` |

---

## 15. 已确认的验收边界

以下是本轮执行所沿用的既有决定，不重新打开为 v1 待办：

1. **截图 diff 阈值**：八场景均要求变化像素比例 ≤0.001，任一通道最大差 ≤8；保持原始 golden 和现有比较范围，不通过放宽阈值或追加 mask 收口。完整三帧 Canvas 浮点容差为 1e-4。
2. **客户端预测**：v1 使用 server-authoritative + 原版插值/相机语义；不另增预测系统。
3. **音频 parity**：v1 明确**非目标**。`SilentAudioBus` 只保留接口，不纳入视觉/行为验收；未来需要时再按事件映射补音效。
4. **浏览器矩阵**：Chromium 桌面、Retina 和移动 UA 触控模拟；Firefox/WebKit/真机为非目标。验收浏览器按 `.chromium-version` 精确锁定，UA pin 仍保持原始输入。
5. **reference 保留**：原 wasm/WAT、JS、报告和 reference 构建保留；归档只能经验证迁移，保留兼容路径及 `--reference` 回退入口，不删除 oracle。
6. **全 C++ 客户端选项**：当前交付为 TS + Canvas2D；SDL3/桌面客户端属于未来范围，不阻断 v1。
7. **协议 field 26（已确认）**：永久域扩展，不再还原原始字段；证据与解码见
   `schema/protocol.yaml`、`docs/semantics/snapshot.md`，签字日期 2026-10-24。

---

## 16. 参考文件

- `README.md`：项目总览、本地运行方式；
- `source/README.md`：WAT/JS 恢复源码入口；
- `reports/RECONSTRUCTION.md`：重建范围与统计；
- `reports/wasm/manifest.json`：模块函数/导入/导出；
- `reports/wasm/*-functions.json`：函数清单、调用数、指令数；
- `reports/remaining-functions.json`：剩余函数；
- `reports/server-behavior.md`：服务端协议/行为观察；
- `source/semantic/server-catalogs.json`：花瓣/实体/生成规则；
- `source/semantic/client-catalogs.json`：客户端目录；
- `source/decompiled/`：反编译伪代码；
- `source/javascript/client.js`：Canvas2D 桥、Emscripten 运行时；
- `source/javascript/sp_server.js`：worker 消息协议；
- `test/helpers/oracle-harness.mjs`：函数级差分；
- `web/debug.html`、`web/debug-hooks.js`：浏览器诊断入口。

---

## 17. 执行原则

1. **WAT 是最高事实来源。**
2. **行为等价优先于字节一致。**
3. **领域优先于函数编号。**
4. **schema 优先于魔法偏移。**
5. **数据驱动优先于硬编码。**
6. **确定性优先于“看起来差不多”。**
7. **reference 永不破坏。**
8. **纵向切片优先于大爆炸重写。**
9. **未知字段保持未知，不编造语义。**
10. **先写测试，再写实现。**
11. **不继续投资未完成的 JS。**
12. **不删除任何尚未被 parity 覆盖的 reference 资产。**

---

## 18. 历史成果快照、剩余任务与路线（2026-10-24）

> **历史边界（2026-10-25 补注）**：本节保留当时的命令、数字、审计结论和任务拆解。包括“25/26”“15/18”“唯一阻塞”“两次通过”“CI 六 job / Firefox-WebKit”及 `knownGaps` 手写常量等陈述，均不得当作当前状态。当前本地验收与归档状态见页首及 docs/release-acceptance.md；本节不滚动更新历史数字。

> 状态时间：2026-10-24 08:05（Asia/Shanghai）。
> 审计口径：18.1 是本轮**实际执行**的命令与输出；18.2 的门禁状态由 18.1 的报告直接推导。函数基线仍以 `reports/build.json` 为准：**3,850 已替换 / 1,129 仍为机器码**（client 3,334/911，sp_server 516/218），本轮未变。
> 结论：阶段 0/1 已完成；阶段 2 门禁 **6/6**、阶段 3 门禁 **4/4**、阶段 4 **3/4**；26 项阶段门禁 **25 项通过 / 0 部分 / 1 未通过（4.4）**；§13 清单 **15/18 完成 / 1 部分 / 2 未完成**。服务端逐实体 strict 8/8，协议、构建、性能均绿；**唯一阻塞是渲染等价**（菜单 4.10%，7 个游戏场景 25.35–29.87%，阈值 0.1% / 8）。阶段 2 另有 R04（Hornet stinger）域级残差；阶段 3/4 的视觉完成定义由 R19 卡住。

### 18.1 本轮验证（实跑）

> 本轮没有修改 C++/TS 语义；重新构建 wasm、重录引擎态截图，并刷新了新客户端自洽基线（见口径 1）。

| 检查 | 命令 | 结果 | 证据 / 说明 |
| --- | --- | --- | --- |
| JS oracle | `npm run test:javascript:tap` | ✅ 692/692 | 380.4 s（本轮独立跑）；0 fail；TAP 写入 `reports/javascript-tests.tap` |
| C++ native | `npm run test:engine` | ✅ 90/90 | CMake Release；`engine_tests --tap` |
| engine wasm | `npm run build:engine:wasm` | ✅ 211,588 B | SHA-256 `0f0ab8dcca911761…` |
| TS 客户端 | `npm run test:client` | ✅ 68/68 | 52.0 s；含交互 e2e、移动视口/触控 e2e；TAP 写入 `reports/client-tests.tap` |
| 冻结参考 | `npm run test:reference` | ✅ | 15 个 key file + 4 棵树；3,850/1,129 未变 |
| 掉落目录 | `npm run catalogs:drops:verify` | ✅ 102/102 | 23 个实体、102 个掉落项、0 mismatch |
| 原服务端重放 | `npm run parity:server` | ✅ 8/8 | Node 中重放 `web/sp_server.wasm` |
| 原客户端 golden | `npm run test:parity` | ✅ 8/8 | `--repeat 2`；截图 exact；Chrome 156 + UA 155 |
| 原客户端 + C++ | `npm run parity:original-engine:all` | 🟡 8/8（协议） | 872 实体、玩家进入花园、零 console/worker 错误；**截图仍停在菜单**，不是视觉证据 |
| C++ 状态差分 | `npm run parity:engine-state:strict` | ✅ 8/8 | `--all --strict` exit 0；明细见 18.1.1 |
| 新客户端自洽 | `npm run parity:client` | ✅ 8/8 | **刷新过期基线后**；只证明可重复，不等于与原客户端等价 |
| 交付树 | `npm run build:dist-next && npm run verify:dist-next` | ✅ 76 文件 / 529,319 B | 0 issues；server.wasm 211,588 B / 同哈希 |
| 命令级 diff | `npm run parity:canvas` | 🟡 诊断 | 首帧前缀 6；golden 508–791 ops、next 445–625 drawing ops（18.1.2） |
| 菜单视觉 | `run-client-scenario --scenario boot-menu --update --out <tmp>` + `screenshot-diff` | 🟡 4.10% | 37,802/921,600，mean 5.61，max 255；阈值 0.1% / 8 |
| 引擎态视觉 | `run-client-engine-scenario --all --update` + `screenshot-diff` | 🟡 25.35–29.87% | 7 个游戏场景；mean 6.31–7.90，max 255（18.1.2） |
| 性能预算 | `npm run perf:client` | ✅ | p50 16.7 / p95 18.5 / p99 19.3 / max 19.8 ms；60.0 FPS；0 long task；堆 +1.54 MB |
| 默认入口 smoke | `node serve.mjs --no-open --port 8477` | ✅ | `GET /index.html` 200（870 B）、`GET /server.wasm` 200（211,588 B） |
| 全量门禁 | `npm run test:all:twice` | ✅ 两次通过 | 两轮 `test:all` 均 exit 0；TAP 692/90/68；所有 parity/dist 报告 pass |
| CI 定义 | `.github/workflows/ci.yml` | 🟡 | 6 个 job；engine-state 已阻断；browser-matrix 仍安装/执行 Firefox/WebKit，与 R23 的 Chromium-only 签字不一致（R33.3） |

六个必须说明的口径：

1. **`parity:client` 只是自洽。** 本轮开始时 `tests/parity/next` 的已存基线已经过期：boot-menu 通过、7 个游戏场景因近期网格/背景/lineWidth 改动全部失败（1/8）。执行 `npm run parity:client:update` 后重新变为 8/8。这是**基线刷新**，不是等价证明；刷新必须在 R33.5 的基线变更记录里留痕。
2. **`parity:engine-state` 默认不阻断。** 裸命令和 `--baseline` 只写报告并 exit 0；只有 `--strict` 才在失败时 exit 1。`test:all` 使用的是 strict。
3. **`parity:original-engine` 是协议/解码证据，不是视觉证据。** 8 个场景的截图仍在菜单（`menuPixel` 为菜单色），因此游戏场景只能与 `tests/parity/golden/*/screenshot.png`（归档客户端 + 归档服务端）比较。
4. **引擎态 runner 不覆盖菜单。** 它把 golden `server.json` 重放进 C++ engine，再导出 866/872 个实体；菜单基线仍用 `run-client-scenario` 的 boot-menu。
5. **视觉对比目前不是同状态对比。** golden 截图是原客户端在插值帧上的画面；新 runner 冻结 C++ 最后一 tick 的服务器状态并让相机立即贴住玩家。即使 strict 服务端状态 ≤1 ULP，网格相位仍有差异（garden-idle 首根线：原版 x=27/y=28，新客户端 x=24/y=3）。以 garden-idle 为例：总差异 28.78%，其中 **24.62 个百分点落在网格线附近（±1 px mask 内）**，mask 外只剩 **4.16%**。所以当前最大的“视觉差”首先是相机/网格相位，而不是实体美术；R19.1 必须先修对比装置与相机跟随，不能再用网格相位当状态探针。
6. **视觉门禁尚未进入 `test:all`。** `test:all` 不包含 `screenshot-diff`、`parity:canvas` 或 `perf:client`；R19.2 需要新增视觉命令并接入 `test:all`/CI。

#### 18.1.1 逐场景 C++ 状态差分

`tests/parity/engine/report.json`（本轮 strict，`tolerance=1e-3`、`velocityTolerance=1e-3`、`ulpTolerance=2`）：

| 场景 | tick | count | handle | entity | player | 末帧最大位置差 | 末帧 mismatch |
| --- | ---: | :---: | :---: | :---: | :---: | ---: | ---: |
| boot-menu | 57 | ✅ | ✅ | ✅ | ✅ | 0.000488 | 0 |
| garden-idle | 57 | ✅ | ✅ | ✅ | ✅ | 0.000488 | 0 |
| move | 67 | ✅ | ✅ | ✅ | ✅ | 0.000488 | 0 |
| attack | 67 | ✅ | ✅ | ✅ | ✅ | 0.000488 | 0 |
| equip | 51 | ✅ | ✅ | ✅ | ✅ | 0.000488 | 0 |
| damage | 134 | ✅ | ✅ | ✅ | ✅ | 0.000977 | 0 |
| death | 249 | ✅ | ✅ | ✅ | ✅ | 0.000977 | 0 |
| spawn | 96 | ✅ | ✅ | ✅ | ✅ | 0.000977 | 0 |

`node tools/parity/server-state-trace.mjs --all --strict` **exit 0**；`firstEntityDiff` 为空，mismatch 全为 0；玩家最大差 `0.000168`（death）。位置门禁是 `1e-3` 绝对容差 + 每轴 2 个 f32 ULP；位置之外，velocity/acceleration 也以 `1e-3` 纳入 `entityMatch`，不再是“只输出不判定”。

#### 18.1.2 渲染差距

像素差（本轮重录引擎态截图后重算）：

| 场景 | 变化像素 | 比例 | mean | max | 备注 |
| --- | ---: | ---: | ---: | ---: | --- |
| boot-menu（`run-client-scenario`） | 37,802 | **4.10%** | 5.61 | 255 | 字形/1–2 px 文本偏移、右上角图标 |
| garden-idle | 265,263 | **28.78%** | 6.46 | 255 | 872 实体；网格/相机相位为主 |
| move | 242,955 | 26.36% | 7.87 | 255 | 同上 |
| attack | 242,862 | 26.35% | 7.90 | 255 | 871 实体 |
| equip | 275,297 | 29.87% | 7.33 | 255 | HUD/快捷栏 + 网格 |
| damage | 233,648 | 25.35% | 7.86 | 255 | 血条/命中效果 |
| death | 236,110 | 25.62% | 6.56 | 255 | 死亡遮罩 |
| spawn | 262,888 | 28.53% | 6.31 | 255 | 生成团簇 |

命令级 diff（首帧 drawing ops，忽略 `save`/`restore`/属性 setter）：

| 场景 | golden ops | next ops | 相同前缀 | 首个不同 |
| --- | ---: | ---: | ---: | --- |
| garden-idle | 766 | 521 | 6 | `fillRect` → `beginPath` |
| move | 783 | 625 | 6 | 同上 |
| attack | 791 | 623 | 6 | 同上 |
| equip | 773 | 529 | 6 | 同上 |
| damage | 576 | 609 | 6 | 同上 |
| death | 508 | 616 | 6 | 同上 |
| spawn | 528 | 445 | 6 | 同上 |

前 6 个命令一致；第 7 个命令原版先画第二个全屏 `fillRect`（竞技场底色），新客户端先 `beginPath`（实体）。原版背景结构是外框 `#1EA761`、竞技场 `fillRect(0,0,1,1)` 覆盖全屏、再用 `globalAlpha 0.1` 的黑色四段 `fillRect` 把竞技场外区域压暗；新客户端用两层实色填充等价实现，像素接近但命令结构不同。

更大的结构性差距（garden-idle 首帧直方图）：

| op | golden | next | 含义 |
| --- | ---: | ---: | --- |
| `setTransform` | 139 | 5 | 原版每实体一次变换；新客户端一次相机变换后画世界坐标 |
| `drawImage` | 31 | 0 | 原版文本/图标走离屏缓存；新客户端直接 `fillText` |
| `fillText` / `strokeText` / `measureText` | 0 / 0 / 0 | 16 / 12 / 10 | 原版用文本缓存，没有逐帧文本命令 |
| `ellipse` / `clip` | 4 / 9 | 0 / 0 | 原版 UI/形状/裁剪；新客户端缺失 |
| `rect` / `strokeRect` | 21 / 1 | 0 / 15 | UI 边框/槽位结构不同 |
| `clearRect` | 5 | 1 | 原版多阶段清屏 |
| `quadraticCurveTo` | 33 | 12 | 曲线形状不足 |

因此 R13 不是“补几个形状”，而是把 `source/game/client/render-frame.mjs`（4,102 行）及其配套渲染模块（合计 8,554 行）按命令结构移植；当前 `client/src/render` 只有 941 行。命令级和像素级都必须先过 R13/R14，R19 才有意义。

### 18.2 阶段进度（门禁项与完成定义分开计）

| 阶段 | 门禁通过 | 完成定义 | 判定 |
| --- | --- | --- | --- |
| 0 冻结参考 + parity 基础设施 | 6/6 | 满足 | ✅ 完成 |
| 1 契约与 schema | 6/6 | 满足 | ✅ 完成 |
| 2 C++ 服务端 | **6/6** | 8 场景 strict + 协议 + **R04 回调证据** | 🟡 门禁全绿；R04 残差未收口 |
| 3 TypeScript 客户端 | **4/4** | 单局 + 原 8 golden + **新客户端视觉 ≤0.1%/8** | 🟡 门禁全绿；R19 未满足 |
| 4 切换与归档 | **3/4** | §13 18/18 + `--move` + CI 真阻断 | ❌ 4.4 未通过 |

> 26 项门禁 = 阶段 0、1 各 6 项，阶段 2、3、4 分别 6/4/4 项。**25 项通过、0 项部分、1 项未通过（4.4）**。
> “门禁项通过”不等于“阶段完成定义满足”：阶段 2 仍被 R04 卡住，阶段 3 仍被 R19 卡住，不再使用“阶段 2/3 已收口”的表述。

阶段 2 的 6 项门禁：

| # | 门禁 | 状态 | 证据 |
| --- | --- | --- | --- |
| 2.1 | 原客户端 + 新服务端完成 8 场景 | ✅ 8/8 | `parity:original-engine:all`；872 实体、玩家 flag、零错误 |
| 2.2 | `parity:engine-state` 8/8 逐实体 | ✅ 8/8 | strict exit 0；count/handle/entity/player 全绿；末帧 0.000488/0.000977 |
| 2.3 | 协议不依赖未验证 framing | ✅ | archived mask `0x184003`；第一包 872 实体可解码；field 26 是永久域扩展 |
| 2.4 | `parity:server` 8/8 | ✅ | 原 `sp_server.wasm` 在 Node 重放；这是 oracle 自检，不是 C++ 等价 |
| 2.5 | 包序列可解码 | ✅ | 原客户端 872 实体、玩家记录不 trap |
| 2.6 | 固定场景 server trace 与原版一致 | ✅ | 8 场景逐 tick strict 通过；RNG、出生点、初始种群一致 |

阶段 3 的 4 项门禁：

| # | 门禁 | 状态 | 证据 |
| --- | --- | --- | --- |
| 3.1 | 新客户端 + 新服务端完成一局 | ✅ | Playwright e2e：菜单→花园→移动→攻击；suicide→死亡→restart→满血重生 |
| 3.2 | 原客户端 8 个 Canvas2D/截图 golden 通过 | ✅ | `test:parity` 8/8；这是原版 oracle，不是新客户端等价 |
| 3.3 | 菜单、装备、死亡、重开可用 | ✅ | 菜单/HUD/死亡/重开/背包/聊天；交互 e2e 覆盖装备→攻击→防御→丢弃→交换→聊天→掉落 |
| 3.4 | 60 FPS / 移动端触控 | ✅ | p95 18.5 ms、60.0 FPS；Chrome 390×844/DPR3/`hasTouch` 触控摇杆使玩家 +x 移动；Firefox/WebKit/真机签字为非目标（R23） |

阶段 4 的 4 项门禁：

| # | 门禁 | 状态 | 证据 |
| --- | --- | --- | --- |
| 4.1 | `dist-next` 是默认入口 | ✅ | `serve.mjs` 默认 `dist-next`；`--reference`/`--root web` 保留回滚；本轮 smoke 200/211,588 B |
| 4.2 | reference 仍可构建、可玩 | ✅ | `test:reference` + `test:parity` 8/8；`dist` 作为回滚树保留 |
| 4.3 | 生产构建不含 `source/game` 语义 JS | ✅ | `dist-next` 76 文件 / 529,319 B；`verify:dist-next` 0 issues；显式 excludes |
| 4.4 | 所有 parity 测试稳定通过 | ❌ | strict 状态门禁绿；视觉差 25.35–29.87% 仍远未达 0.1%（R13/R14/R19） |

§13 验收清单的当前状态（复选框保留为最终验收态，全部通过才勾选；本轮分组状态见下表）：

| 组 | 完成 | 部分 | 未完成 | 说明 |
| --- | ---: | ---: | ---: | --- |
| 13.1 代码质量 | 6 | 0 | 0 | 仅 `client/src/schema/generated.ts` 2 处生成偏移、135 处 `static_assert`、协议 YAML、数据驱动目录、无 `runtime.call`、无手写 vtable |
| 13.2 功能 | 4 | 0 | 0 | 原客户端+新服务端 8/8；新客户端单局 e2e + 交互 e2e；固定种子可复现 |
| 13.3 渲染 | 1 | 1 | 2 | 字体/DPR/resize ✅；Canvas trace 部分（前缀 6）；截图阈值、粒子/伤害数字未达 |
| 13.4 构建与回归 | 4 | 0 | 0 | dist-next、reference、oracle 测试、CI 六 job ✅（engine-state 已阻断；browser-matrix 见 R33.3） |
| **合计** | **15** | **1** | **2** | 未完成项只剩截图阈值（R19）与粒子/伤害数字/完整实体外观（R14） |

### 18.3 已完成能力（摘要）

| 区域 | 已落地 | 证据 | 等价状态 |
| --- | --- | --- | --- |
| 参考与回归 | 冻结 manifest、8 场景 golden、虚拟时钟、worker facade、server replay、截图 diff、固定 UA | `reference/manifest.json`、`tests/parity/golden/`、`tools/parity/pinned-ua.js` | ✅ 基础设施；浏览器仅 Chrome |
| Schema 与目录 | `protocol.yaml`、8 个 layout、39 花瓣 / 23 实体 / 20 生成规则 / 99 字符串 / 102 掉落、C++/TS 生成器、probe 0 mismatch | `schema/` | ✅ 数据层 |
| 服务端核心 | 24 个 C++ 源文件、18 个 `sim` 模块、90 个 native 测试、wasm 可重建 | `engine/` | ✅ 8 场景逐实体 strict；R04 域级残差 |
| 协议与快照 | 4 组件 mask、sparse fields 2/5/8/24/26/31/53/55、events 9/11/14、19 组 dense、30-slot presence | `engine/src/net/`、`client/src/state/snapshot.ts` | ✅ 原客户端 872 实体可解码；field 26 为永久扩展 |
| 客户端骨架 | 启动/DPR、worker envelope、63 字段解码、输入/相机/HUD/菜单/死亡/重开/装备/聊天/tooltip | `client/`、`client/tests/` | ✅ 单局与交互 e2e；视觉未对齐 |
| 渲染 | 玩家/怪物/花瓣/掉落/血条/命中环、双层竞技场、亚像素网格、快捷栏、Flower/Map 面板、视口裁剪 | `client/src/render/`、`tests/parity/next-engine/` | 🟡 命令量同量级；像素差 25.35–29.87% |
| AI/战斗 | 物种初始化、目标选择、guard/wave/sine、401 链约束、30 层碰撞过滤、接触伤害/掉落 | `engine/src/sim/ai.cpp`、`combat.cpp`、`movement.cpp` | 🟡 8 场景 strict；R04 AI+144 未分派 |
| 构建与归档 | `dist-next` 76 文件 / 529,319 B；`legacy/` 1,309 文件 / 66.0 MB（copy）；wasm 同哈希 | `dist-next/build-manifest.json`、`legacy/archive-manifest.json` | ✅ 可构建/可回滚；`--move` 未执行 |
| 工程化 | CI 六 job、TAP 派生、性能预算、环境矩阵、状态脚本 | `.github/workflows/ci.yml`、`reports/current-verification.json` | 🟡 engine-state 已阻断；docs/CI 口径仍漂移（R33） |

> “已落地”不等于“已等价”。R07/R08/R09/R05d 的 ABI/地址级残差（vtable/allocator 地址、4124-byte 原样上线路、scratch 残留字节）已按 §4 非目标接受，不再作为任务；但它们必须在协议/行为说明中保持“实现差异”标注。

### 18.4 剩余任务登记册

> 只列仍未完成的任务。已完成/不再跟踪：R01、R02、R02a、R03、R03a、R03b、R05、R05a–R05f、R06、R06a–R06d、R07、R08、R09、R10、R11、R12、R14a、R15、R16、R17、R18、R20、R21、R22、R23、R24、R24a、R25、R26、R27、R30、R31、R32。R23 以“Chromium-only + Chrome 移动视口触控”签字为非目标；R24 当时已完成回写，但本轮审计发现新的文档漂移，归入 R33.4 继续跟踪。
> 统计：**7 个顶层任务**（R04、R13、R14、R19、R33、R28、R29）；P1 = 4（R04/R13/R14/R19）；R33 为 P2（R33.1 已在本轮两次通过，后续门禁变更仍需重跑）；R28/R29 为 P2。复杂度只是排序，不是工期承诺。

#### A. 服务端、协议与状态等价（阶段 2 残差）

| ID | 剩余任务 | 当前差距（本轮证据） | 验收标准 | 优先级 | 复杂度 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| R04 | Hornet stinger（AI+144）与物种行为分派 | 已建 `engine/src/sim/species_attacks.cpp`：`attack_callback=74` 在冷却归零且目标在 `attack_range` 内时分派 `spawn_hornet_stinger`（20 单位偏移、1.4 冲量、0.6 速度、2000 ms、10 伤害、半径 12），`test_hornet_stinger_callback` 覆盖 in-range/out-of-range/冷却/未知 id；8 场景 strict 8/8。**原版 oracle 逐 tick trace fixture 未完成**：`tools/parity/hornet-stinger-trace.mjs` 的合成行走在 3200 tick 内未把 Hornet 带入 500 距离（玩家先死亡/路径过长） | 回调 74 按原版分派；Hornet stinger 的生成/速度/生命周期/伤害与目标条件一致；有原版 vs C++ 的 stinger count/handle/位置/速度/血量 trace；8 场景无回归 | P1 | 高 | 部分：领域实现+native fixture 完成，原版 trace 缺 |

R04 的拆解：

1. **R04.1 触发条件与分派**：从原 `function_654`/AI 记录确认 AI+144 的触发条件（目标在 `attack_range` 内、冷却归零、是否要求 `target.valid()`），在 `update_ai` 中把 `attack_callback == 74` 分派到领域函数；其他物种的回调表按证据补齐，未知的保持 unknown。
2. **R04.2 function_695 领域重建**：把 `function_695` 的组件构造（39/41/42/46/47 等）、位置/速度、父实体/子实体关系、寿命与伤害映射到 `spawn_stinger`/effect 域；stinger 的落点/伤害语义需按 `function_44`/`function_47` 等调用图确认，不得照抄 wasm 偏移。
3. **R04.3 对照 fixture**：新增“Hornet 在攻击距离内、cooldown=0”的原版 vs C++ 逐 tick trace；断言 stinger 的 count/handle/位置/速度/血量与结算；扩展现有 `test_ai_behavior_modifiers`（目前只断言 cooldown 4000 ms）。**状态（2026-10-24）**：native fixture `test_hornet_stinger_callback` 已完成；原版 trace `tools/parity/hornet-stinger-trace.mjs` 未跑出 stinger（合成玩家 3200 tick 内未接近 Hornet，且会被 mob 击杀），仍是 R04 的唯一缺口。
4. **R04.4 behavior-modifier vtable**：`AiState::modifiers` 的 speed/turn/attack 乘数机制已实现并有测试；逐物种 vtable 值仍未 probe。若 fixture 不暴露差异，保留为“未知但无证据影响”，不阻塞阶段 2。

#### B. 客户端与渲染（阶段 3/4 关键路径）

| ID | 剩余任务 | 当前差距（本轮证据） | 验收标准 | 优先级 | 复杂度 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| R13 | 命令级渲染结构 | 首帧前缀 6；golden/next ops 对比如 766/521；`setTransform` 139 vs 5、`drawImage` 31 vs 0、`fillText/strokeText/measureText` 0/0/0 vs 16/12/10、`ellipse/clip` 4/9 vs 0/0；首个不同是原版第二个全屏 `fillRect` → 新客户端 `beginPath` | 7 个游戏场景首帧 ops 顺序、颜色、alpha、线宽、变换完全一致（浮点 1e-4）；前缀不再停在 6 | P1 | 高 | — |
| R14 | 完整实体/花瓣/特效/掉落/UI 渲染 | 当前渲染器 941 行 vs 恢复参考 8,554 行；怪物是通用圆/椭圆，无原版腿/触角/眼；无粒子、伤害数字、event14 效果、掉落动画；无文本/图标离屏缓存；HUD/地图/社交图标不完整；引擎态像素差 25.35–29.87% | 7 个游戏场景的实体/特效/掉落/UI 外观无明显差异；菜单/HUD 与 golden 同构 | P1 | 高 | R13 |
| R19 | 新客户端 vs 原客户端视觉门禁与对比装置 | 菜单 4.10%；游戏 25.35–29.87%；对比仍非同一状态（golden 为原客户端插值帧，新 runner 为 C++ 末帧冻结）；garden-idle 28.78% 中 24.62 点来自网格线区域；视觉检查未进入 `test:all`/CI | 菜单 + 7 个游戏场景 ≤0.1%、单通道最大差 ≤8；一条命令 exit 0 并写入报告；纳入 `test:all`/CI | P1 | 中 | R13/R14 |

R13 的拆解：

1. **R13.1 背景/竞技场**：复刻 `drawArenaBands` 的第二个全屏 `fillRect` + 四段 `globalAlpha 0.1` 黑色压暗；删除新客户端的“两层实色填充”等价写法。目标：首帧前缀从 6 提升到背景段之后。
2. **R13.2 逐实体变换与绘制顺序**：移植 `drawSortedEntities`/`drawSceneEntities` 的 screen-space 每实体 `setTransform`、排序、`save`/`restore`；当前“一次相机变换 + 世界坐标”必须改掉（139 vs 5 是最大结构差）。
3. **R13.3 文本/图标缓存**：移植 `text.mjs` 的离屏 canvas 文本缓存与 `drawImage`；去掉逐帧 `fillText`/`strokeText`/`measureText`（golden 为 0/0/0）。
4. **R13.4 其余 op**：补 `ellipse`/`clip`/`rect`/`strokeRect`/多阶段 `clearRect`，对齐 alpha/lineWidth/颜色；以 `parity:canvas` 直方图为门禁。
5. **验收**：7 场景首帧命令逐项比较（浮点 1e-4）；直方图差值收敛；`parity:canvas` 从诊断变为门禁。

R14 的拆解：

1. 物种外观：Rock/Boulder/Cactus/Bug（Ladybug/Bee/Ant/Beetle/Spider/Centipede/Hornet 等）按 `entity-renderer.mjs`、`component-*-renderer.mjs` 的形状/颜色/朝向/动画绘制；花盘与花瓣按原版几何。
2. 战斗可读性：血条、名字、命中环、受伤闪烁、死亡遮罩、掉落/稀有度/等级。
3. 特效：`drawEvent14Effects` 的粒子/伤害数字/眼形；`drawHealthBars`、`drawEntityNames` 的插值与缓存。
4. UI：菜单、HUD、快捷栏、背包、tooltip、地图、社交图标、聊天，按原版布局/字号/颜色/离屏缓存。
5. 验收：7 个游戏场景“看起来不变”；R19 的像素阈值是最终裁判，不能用“命令量同量级”代替。

R19 的拆解：

1. **R19.1 同状态对比装置**：让原客户端与新客户端消费同一份快照/相机/帧号；或者冻结原客户端在同一 tick 并导出其解码状态。当前 golden 是原客户端插值后的画面，新 runner 是 C++ 末帧 + 相机吸附；网格首根线相位不同（x 约 3 px、y 约 25 px），不能归因于渲染器。先修相机跟随/插值（`CameraState.follow` 的 90 ms 指数平滑需按原版 probe），再比较像素。
2. **R19.2 视觉门禁命令**：新增 `npm run parity:visual`（或等价脚本），对菜单 + 7 个游戏场景执行 `screenshot-diff`，阈值 0.1% / 8，输出 JSON 报告；接入 `test:all` 与 CI。
3. **R19.3 残差收敛**：菜单先处理字形/文本缓存/右上角图标；游戏场景在 R13/R14 后重测，按“网格 → 实体 → HUD/特效”的顺序修。
4. **R19.4 基线边界**：`parity:original-engine` 仍只作协议证据；`parity:client` 只作自洽回归；二者都不能替代 R19 的原客户端 golden 对比。

#### C. 收尾、工程化与归档

| ID | 剩余任务 | 当前差距（本轮证据） | 验收标准 | 优先级 | 复杂度 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| R33 | 全量门禁、账本、CI 与文档一致性 | `test:all:twice` 已两次通过；`status:write` 的 `knownGaps` 已改为当前口径，但仍是手写常量；CI `browser-matrix` 仍安装 Firefox/WebKit；`docs/parity.md` 4.1/6.3 与 `engine/README.md`/`docs/environment.md`/`README.md` 有旧口径；新客户端基线刷新无 changelog | `test:all:twice` 两次全绿；账本/文档只从最新 report 生成；CI 与 R23 签字一致；基线变更可追溯；field 26 签字 | P2 | 中 | — |
| R28 | `legacy/` 归档 `--move` | 当前是 `--copy`：1,309 文件 / 66.0 MB；原文件仍在，测试引用仍指向原路径；`--move` 需 §13 18/18 + R19 | `--move` 后 `legacy/archive-manifest.json` 更新、测试引用仍可解析、`test:reference` 绿；回滚说明完成 | P2 | 高 | R19、§13 |
| R29 | 最终切换签字与回滚 smoke | `serve.mjs` 默认已 `dist-next`；`--reference` 回滚可用；最终切换仍等待 R28 与视觉门禁，且需要一份“切换后 re-run”的证据 | 默认入口 + `--reference` 双路径 smoke；`--move` 后 `test:all` 绿；回滚演练记录 | P2 | 高 | R19、R28 |

R33 的历史拆解（2026-10-24；不代表修复后的当前实现）：

> **2026-10-25 执行补注**：R33.2 的证据派生账本、R33.3 的 Chromium-only 单 job CI 和 runner/build/dist/归档防护已落实工具修复；R33.1 不能沿用下面的历史“两次通过”，必须在最终源稳定后重新验收。R33.4 已补充审计后的文档状态和历史边界，最终报告绑定与数字回填仍 pending；R33.5 的历史基线变更追溯及 R33.6 的语义签字须分别核对，不能由工具测试或本次文档说明代替。R33 整体仍 pending。

1. **R33.1 全量门禁（本轮已完成）**：`npm run test:all:twice` 两次完整通过（含 692 JS、90 engine、68 client、server/golden/engine-state/client/original-engine 各 8 项、dist-next、status:write）；任何门禁变更后仍需重跑。
2. **R33.2 账本真实化**：本轮已把 `tools/write-current-verification.mjs` 的旧数字（26.40–29.77）与“no golden scenario contains a Hornet”改为当前 25.35–29.87 / R04 准确描述；下一步是从最新 `tests/parity/engine`/视觉报告派生，而不是继续手写常量。
3. **R33.3 CI 浏览器矩阵**：`.github/workflows/ci.yml` 的 `browser-matrix` job 安装并执行 Firefox/WebKit；R23 已签字 Chromium-only。应改为 Chromium 阻断、其他浏览器 informational/non-blocking（或删除），否则 CI 可能因非目标浏览器假红。
4. **R33.4 文档回写**：`docs/parity.md` §4.1（death RNG 7050 ms）、§6.2/6.3（29.06%/26.40% 等旧数）、尾部“阶段 2 不能标记完成”；`engine/README.md` 的 “Server-trace equivalence ... still open / Do not claim Phase 2 complete”；`docs/environment.md` 的 “R23 remains open”；`README.md` 的 “Firefox/Safari 仍需 R23 补测”。统一为“strict 8/8 + R04 残差”与“R23 Chromium-only”口径。
5. **R33.5 基线变更记录**：本 checkout 无 `.git`，`tests/parity/next` 的刷新只能靠内容哈希追溯。新增 `tests/parity/next/CHANGELOG.md`（或等价）记录每次 `parity:client:update` 的原因、旧/新 digest 与截图哈希；本轮刷新原因：网格/背景/`lineWidth` 改动后旧基线只剩 boot-menu 通过。
6. **R33.6 field 26 签字**：`schema/protocol.yaml` 与 `docs/semantics/snapshot.md` 已把 field 26 记为永久域扩展；在 §2/§15 补一行签字，避免后续误回退到原字段语义。

> 任务与门禁的对应：R04 → 阶段 2 完成定义；R13/R14/R19 → 3.3/3.4/4.4；R33 → 13.4/4.4 的 CI 与账本；R28/R29 → 4.1/4.4 与 §13 18/18。

### 18.5 里程碑路线

> 只定义顺序与退出条件，不定义日期。每个里程碑结束时必须重新生成对应 report，并在本节更新状态。

| 里程碑 | 目标 | 覆盖任务 | 退出条件 | 当前状态 |
| --- | --- | --- | --- | --- |
| **M0 基线可信** | 让“通过”可信 | R01、R02、R24、R30、R02a、R24a | `death` 数量差 0；strict 逐实体门禁生效并阻断；`test:parity` 8/8；文档数字一致 | 🟡 `death` 8/8；strict exit 0；`test:parity` 8/8；文档仍有 R33.4 的旧口径 |
| **M1 阶段 2 门禁** | 原客户端 + 新服务端；状态/协议等价 | R03、R03a、R03b、R04–R08、R09、R11、R18、R01/R02/R06 | 原 `web/client.js` 跑通 8 场景；`parity:engine-state:strict` 8/8；包序列可解码；R04 回调有对照证据 | 🟡 6/6 门禁达成；R04 仍开放 |
| **M2 命令级渲染纵切** | 证明新渲染器能对齐原命令 | R13、R19.1 | 玩家/怪/花瓣/血条的 3 帧命令与截图通过；随后扩到 8 场景 | 🟡 872 实体已渲染；前缀 6；结构差 139 vs 5 个 `setTransform` |
| **M3 阶段 3 视觉门禁** | 新客户端 + 新服务端完成一局且看起来不变 | R14、R15–R17、R20、R31、R19、R32 | 单人闭环：菜单→花园→移动/攻击/防御→死亡→重开；原 8 golden 通过；新客户端 ≤0.1%/8 | ❌ 菜单 4.10%；游戏 25.35–29.87%；R14/R19 未达 |
| **M4 工程化** | 全量回归与 CI | R21–R26、R31、R33 | `npm test` 692/692；`test:all:twice` 两次全绿；CI 稳定；文档一致 | 🟡 test:all:twice 两次通过；R33.2–R33.6 仍开放 |
| **M5 阶段 4 切换** | 可回滚的最终替换 | R27–R29 | `dist-next` 默认入口；`legacy/` 归档 `--move`；§13 清单 18/18；回滚 smoke | 🟡 默认入口/副本已就绪；§13 15/18；`--move` 未执行 |

**关键路径**：R19.1（同状态对比）→ R13.1/R13.2（背景 + 逐实体变换）→ R13.3（文本缓存）→ R14（实体/特效/UI）→ R19.2/R19.3（阈值）→ R28/R29（归档与切换）。

**可并行支线**：R04（Hornet stinger）可与渲染线并行；R33.2–R33.6（账本/CI/文档/基线记录/field 26 签字）可独立推进；R19.1 的相机/插值 probe 可与 R13.1 并行，但必须在 R14 像素验收前完成。

### 18.6 门禁、容差与完成定义

统一门禁（按顺序执行，失败即阻断）：

```sh
npm run test:reference
npm run test:javascript:tap
npm run test:engine
npm run build:engine:wasm
npm run test:client
npm run catalogs:drops:verify
npm run test:parity
npm run parity:server          # test:parity 内含同一 server-trace；单列便于归因
npm run parity:engine-state:strict
npm run parity:client
npm run build:dist-next && npm run verify:dist-next
npm run parity:original-engine:all
npm run status:write
```

提交/切换前再跑：

```sh
npm run test:all:twice
```

视觉门禁（R19.2 落地后必须加入 `test:all`）：

```sh
npm run parity:visual        # 待新增：菜单 + 7 个游戏场景的 screenshot-diff 报告
```

性能门禁（发版前单独跑；当前 p95 18.5 ms / max 19.8 ms / 60.0 FPS）：

```sh
npm run perf:client
```

门禁口径：

- **实体集合**：handle 集合与数量必须完全一致，不允许“差 1–3 个”。
- **逐实体状态**：位置/血量/角度/半径/速度/加速度逐 tick 在 `1e-3` 内；位置额外允许每轴 2 个 f32 ULP；`entityMatch.matched` 必须同时满足这些字段。
- **玩家状态**：确定性场景中位置/血量逐 tick 在 `1e-3` 内；当前玩家最大差 0.000168（death），不再使用 0.05 过渡容差。
- **Canvas2D**：op 顺序、颜色、alpha、线宽、变换完全一致；浮点比较 `1e-4`；截图沿用 0.1% / 单通道 8 的阈值。
- **菜单**：用 `run-client-scenario` 的 boot-menu 与原 golden 比较，不用引擎态 runner。
- **自洽不是等价**：`parity:client` 只证明新渲染器可重复；等价门禁是原客户端 golden + 新客户端 screenshot-diff（R19.2）。
- **spike 不是门禁**：`parity:original-engine` 是协议/解码证据，不参与视觉判定；`parity:engine-state` 裸命令/`--baseline` 只写报告，只有 `--strict` 阻断。
- **全量测试**：`npm test` 必须 692/692；`test:all` 必须使用 strict；`test:all:twice` 必须两次全绿。
- **状态账本**：`status:write` 只从 TAP 与最新 parity/视觉报告生成，不允许硬编码旧数字；当前 `knownGaps` 仍是手写常量（R33.2），生成后必须人工核对。
- **视觉对比**：必须同状态、同 viewport/DPR/字体/帧号；网格相位或相机插值未对齐时，不得把像素差归因于渲染器。

完成定义：

- **阶段 2 完成**：原客户端 + 新服务端完成 8 个基准场景；`parity:engine-state:strict` 8/8 逐实体通过；协议不再依赖未验证 framing；R04 的 Hornet 回调有对照证据（targeted fixture + stinger effect）。
- **阶段 3 完成**：新客户端 + 新服务端完成一局单人游戏；原客户端 8 个 Canvas2D/截图 golden 全部通过；新客户端菜单 + 7 个游戏场景截图 ≤0.1% / 8；装备、防御、死亡、重开、拾取有 e2e。
- **阶段 4 完成**：§13 的 18 项验收全部勾选；`dist-next` 独立可构建且为默认入口；`legacy --move` 且可回滚；CI 覆盖 reference/engine/client/parity/JS oracle/视觉门禁并真正阻断。

### 18.7 待确认决策与风险

| 决策/风险 | 默认建议 | 影响 |
| --- | --- | --- |
| 协议兼容方式：字节级复刻 vs 适配器 | 已选“行为等价 + 原客户端可解码”；field 26 作为永久域扩展，需在 §2/§15 签字（R33.6） | 决定 R09 的残余风险和阶段 2 的收口口径 |
| 视觉范围：完整美术 vs 功能等价 | 先做 R13 命令结构，再做 R14 实体/特效/UI，最后用 R19 像素阈值收口；不先追像素 | 决定阶段 3 的规模 |
| 音频是否纳入 parity | v1 明确静音/非目标，写入 §15 | 避免 R20 长期悬空 |
| 浏览器矩阵 | 固定 Chrome 156 + UA 155；Firefox/WebKit/真机已签字为非目标（R23），CI 必须与签字一致（R33.3） | 影响截图基线；不再阻塞阶段 4 |
| 客户端预测/相机 | 第一版 server-authoritative + 插值，不做本地预测；相机跟随/插值必须按原版 probe（R19.1） | 影响 R17 与手感/视觉验收 |
| reference 保留周期 | 切换完成前保留 `dist/` 作为 fallback；`legacy/` 先 copy 后 move | 影响 R28–R29 的回滚方案 |

主要风险：

1. **视觉对比假信号（最高）**：当前 golden 是原客户端插值帧，新 runner 是 C++ 末帧冻结；garden-idle 28.78% 中 24.62 点来自网格线区域，mask 外仅 4.16%。缓解：R19.1 先做同状态/同相机对比，再讨论渲染器；R13.2 同时对齐每实体变换。
2. **R13/R14 范围大**：恢复参考 8,554 行渲染代码 vs 当前 941 行；`setTransform` 139 vs 5、`drawImage` 31 vs 0 是结构性差距，不是样式微调。缓解：按 R13.1→R13.4 纵切，每步用 `parity:canvas` 直方图验收，再做 R14。
3. **R04 未进入可观测门禁**：初始花园有 39 个 Hornet，但 8 场景 strict 通过并不证明 AI+144 已分派；`function_695` 的 trigger/effect 仍未重建。缓解：R04.1–R04.3 的 targeted fixture 先行，避免“strict 绿 = 阶段 2 完成”的误判。
4. **基线/账本漂移**：本轮开始时 `parity:client` 因旧基线只有 1/8；`status:write` 的 `knownGaps` 仍是手写常量（本轮已更正为 25.35–29.87）；`docs/parity.md`/`engine/README.md`/`docs/environment.md`/`README.md` 仍有旧口径。缓解：R33.2–R33.5 纳入每轮收尾，数字只从最新 report 生成。
5. **CI 假红/假绿**：`browser-matrix` 仍跑非目标浏览器；`parity:original-engine` 截图是菜单，不能当视觉门禁；视觉命令尚未进入 `test:all`。缓解：R33.3 + R19.2；CI 至少 nightly 跑 `test:all:twice`。
6. **无 `.git`**：本 checkout 没有版本库，冻结靠内容哈希；基线刷新无法用 commit 追溯。缓解：R33.5 为新客户端基线建立 changelog；继续用 `reference/manifest.json` + `reference/CHANGELOG.md`。
7. **性能余量**：本轮 p95 18.5 ms / max 19.8 ms，60.0 FPS，0 long task；堆增长 +1.54 MB/600 帧（此前 +0.75 MB）。R14 增加粒子/文本缓存后必须重跑 `perf:client`，p95 ≤20 ms、max ≤50 ms、FPS ≥55。

> 并行支线：R04（Hornet stinger）由服务端独立推进；R33.2–R33.6（账本/CI/文档/基线记录/field 26 签字）可独立推进；R19.1 的相机/插值 probe 可与 R13.1 并行，但必须在 R14 像素验收前完成。
