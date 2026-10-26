# Parity 基础设施与基线

## 2026-10-25 本地验收与归档状态

稳定源码上两轮完整验收通过，真实 move/restore 演练后最终 move，再次完整验收通过。JavaScript 937/937、engine TAP 110/110、client 195/195、delivery 47/47、browser 47/47；CTest 5 个目标（core/sim/peer及schema合约检查）全通过。原版八场景×三帧 Canvas 在约定容差内无差异，像素全部在原阈值内；短/长 strict、14项 Hornet、24个生产交互及原客户端真实生命周期均通过。

最终 run：`2026-10-25T11-56-33.590Z-d7d59eb3`。完整身份、三轮结果和归档日志见 [`reports/release-acceptance.json`](../reports/release-acceptance.json) 与 [本地发布记录](release-acceptance.md)。默认入口为 dist-next，--reference 回退保留；六个 oracle/report 目录已真实移入 legacy，兼容原路径，恢复演练成功。

远端 Ubuntu CI 未执行（目录没有 .git/remote，无容器运行时）。CI 配置已修，不能声称线上全绿。历史 audit、golden、原始输入和容差不变；field26既有域扩展决定不变。后文历史计数/残差不作为当前验收结论。Synology Drive 项目同步已由用户暂停；恢复同步前须处理同步端旧目录与兼容 symlink 的类型冲突。

## 1. 冻结参考

`reference/manifest.json` 由 `node tools/reference-manifest.mjs` 生成，记录：

- `web/client.wasm`、`web/sp_server.wasm` 的 SHA-256；
- `source/wasm/*.wat` 的 SHA-256；
- `web/`、`dist/`、`dist-readable/`、`dist-reference/` 的目录树哈希；
- `reports/build.json` 的函数基线：3,850 已恢复 / 1,129 仍为机器码（client 3,334/911，sp_server 516/218）；
- 319 个函数级测试文件的 SHA-256；
- Node、Emscripten、Chrome 版本。

该 checkout 没有 `.git`，因此计划中的 `reference-<date>` tag 用内容哈希代替；任何参考文件变化都会改变 manifest。

`reference/README.md` 说明 `web/`、`dist*`、WAT 和原始 JS 是只读 oracle。不要为了让测试通过而修改它们。

## 2. 确定性重放

浏览器重放使用三个注入脚本（`tools/parity/*.js`）：

1. **`virtual-clock.js`**：替换 `Date`、`performance.now`、`setTimeout`、`setInterval`、`requestAnimationFrame`。时间只在驱动调用 `__virtualClock.advance(ms)` 时前进；帧间隔固定 16 ms；timer 按 `(due, id)` 顺序执行，并在回调之间刷新 microtask。
2. **`deterministic-worker.js`**：把客户端的 `new Worker("sp_server.js")` 替换为同线程 facade，直接实例化原 `sp_server.wasm`，实现原 glue 的 `sp_server_init/send/think/flush` 和 `{callbackId, finalResponse, data}` 响应格式。50 ms tick 由虚拟时钟驱动，因此服务端和客户端共享同一条时间线。
3. **`canvas-trace.js`**：包装 `CanvasRenderingContext2D`、`Path2D`、`OffscreenCanvas` 和样式属性，记录 `{context, op, args}`；以 rAF 回调划分帧，输出每帧 digest 和选定帧的完整命令。

另外，页面与 facade 使用固定种子的 xorshift 熵源（`Math.random`、`crypto.getRandomValues`、wasm `a.n`），避免 UUID/随机选择引入差异。

### 2.0 固定 UA（R30）

原客户端把 `navigator.userAgent` 原样写进第一个 `sp_server_send` 握手包，
所以 Chrome 升级会改变 golden server trace：Chrome 155 → 156 只翻转了
1 个字节（`HeadlessChrome/155` → `/156`）。`tools/parity/pinned-ua.js`
在 `run-scenario.mjs`、`run-original-engine.mjs` 的 init script 中固定：

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36
```

并同时固定 `userAgentData.brands`。UA 是冻结 oracle 的输入；不要为了消除差异修改 pin 或重录 golden。
本地使用 Chrome 156/macOS；CI 为 Ubuntu 24.04 与 `.chromium-version` 固定的同版 Chrome for Testing，支持范围为 Chromium 桌面/触控模拟。必需的 `browser version` 步骤会验证实际版本；Linux 像素结果仍以真实 CI 运行证据为准。
production 的 touch profile 使用 Android/Mobile UA 激活 `mobileUi`，不沿用上述 oracle UA；Firefox/WebKit/真机为**非目标**。

### 2.1 为什么不用真实 worker

真实 worker 的 `setInterval` 和 `performance.now` 不在 Playwright 的页面时钟内。实测两次 `garden-idle` 会产生 117k 与 125k 条命令，服务端 tick 数也不同。facade 让服务端在页面线程上运行，tick 完全由虚拟时钟驱动；`server-trace.mjs` 再独立在 Node 中重放同一输入，验证 facade 没有改变服务端行为。

## 3. 场景与 golden

场景定义在 `tools/parity/scenarios.mjs`。每个场景从干净 context 启动，固定：

- viewport 1280×720，DPR 1；
- `locale=en-US`，`timezone=UTC`；
- 固定 epoch `2024-01-01T00:00:00Z`；
- 90 帧启动到主菜单，然后执行场景步骤；
- 场景在 `reset` 后捕获 3 帧完整命令 + 全部帧 digest，并在最后一帧截图。

golden 目录：

```
tests/parity/golden/<scenario>/
  canvas.json      # 帧 digest + 捕获帧的完整 Canvas2D 命令
  server.json      # worker 消息、响应 hash、tick 时间
  screenshot.png   # 最后一帧截图
  meta.json        # 场景步骤、启动摘要、产物 hash、浏览器版本
```

命令：

```sh
node tools/parity/run-scenario.mjs --all --update   # 重录 golden
node tools/parity/run-scenario.mjs --all            # 对比 golden
node tools/parity/run-scenario.mjs --scenario garden-idle --repeat 2
node tools/parity/trace-diff.mjs expected.json actual.json
node tools/parity/screenshot-diff.mjs expected.png actual.png --out diff.png
npm run test:all   # 串行源码构建、native CTest、各类等价/交付门禁与隔离账本
```

`--repeat N` 会在 N 个独立 context 中重放同一场景，并要求 Canvas digest、截图 SHA-256、server trace 完全一致；不一致时场景失败。

## 3.1 目录/掉落概率验证

`node tools/derive-drop-chances.mjs --verify` 会：

1. 用纯 JS 重算 `sp_server_init` 的 8 个 spawn band 直方图、物种质量、39 个花瓣的掉落分配；
2. 载入原 `sp_server.wasm`，调用 `sp_server_init`；
3. 通过 `getEntityDefinition` 读取每个实体最终化的掉落表；
4. 逐条比较 23 个实体的 102 个掉落项（类型 + f32 概率 + 顺序）。

历史验证输出：`verified 102 drop entries, 0 mismatches`。这是当次目录/掉落域的字节级证据，
不依赖浏览器，也不运行 319 项 JS oracle。

`node tools/derive-petal-combat.mjs` 从 catalog 的 slot-2 虚函数解析出 39 个花瓣的
碰撞半径、伤害和最大生命；数据写入 `schema/catalogs/petal-combat.json`。

## 4. 历史基线

> **历史基线记录**：以下录制结果及 §4 的实验结论保留当时的证据范围，不代表 2026-10-25 的最终源验收。

8 个场景均已录制并通过 `--repeat 2` 的确定性检查，且 `server-trace.mjs` 在 Node 中重放同一输入时，输出包序列与浏览器 facade 完全一致。

| 场景 | Canvas digest | 命令数 | 帧数 | worker 消息 | 响应 | tick |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| boot-menu | `b1b613fb` | 97,657 | 180 | 183 | 240 | 58 |
| garden-idle | `52b48c31` | 67,778 | 60 | 227 | 284 | 58 |
| move | `2088bc92` | 59,009 | 60 | 266 | 333 | 68 |
| attack | `ce8c5399` | 60,198 | 60 | 266 | 333 | 68 |
| equip | `2aab0249` | 36,765 | 30 | 197 | 248 | 52 |
| damage | `8c342745` | 59,500 | 60 | 499 | 633 | 135 |
| death | `5528c4c7` | 52,281 | 60 | 902 | 1,151 | 250 |
| spawn | `40dc6e5e` | 50,405 | 60 | 399 | 494 | 97 |

Server replay：

```sh
node tools/parity/server-trace.mjs --all
# 8/8 match: true
```

`tests/parity/server/<scenario>.json` 保存每个 tick 的输出包 hash；`report.json` 记录浏览器包序列与 Node 重放序列的对比结果。最后一个 tick 若在浏览器里没有后续 flush，则标记为 `observable: false`，不参与包序列比较（它的输出尚未被客户端取走）。

### 4.1 C++ engine 语义 server trace

`tools/parity/server-state-trace.mjs` 把同一批 `sp_server_send` 输入同时喂给
原 `web/sp_server.wasm` 和 C++ engine wasm
（`client/public/server.wasm`），每个 50 ms tick 记录与顺序无关的状态聚合：
实体数、位置/血量总和与包围盒、玩家位置/血量。它不是包字节 diff（C++ 的
snapshot framing 是领域扩展），而是行为层的差分工具：

```sh
npm run build:engine:wasm
node tools/parity/server-state-trace.mjs --scenario garden-idle
node tools/parity/server-state-trace.mjs --all
```

2026-10-23 23:55 的差分结果（`tests/parity/engine/report.json`）：

8 个场景的 `countMatch`/`handleMatch`/`entityMatch`/`playerMatch` **全部为 ✅**，
`node tools/parity/server-state-trace.mjs --all --strict` **exit 0**。所有 tick 都
通过门禁（`firstEntityDiff` 为空）；末帧最大位置差 0.00049（boot-menu、
garden-idle、move、attack、equip）或 0.00098（damage、death、spawn），
玩家最大差 0.000168。

| 场景 | countMatch | handleMatch | entityMatch | playerMatch | 末帧最大位置差 |
| --- | --- | --- | --- | --- | ---: |
| boot-menu | ✅ | ✅ | ✅ | ✅ | 0.00049 |
| garden-idle | ✅ | ✅ | ✅ | ✅ | 0.00049 |
| move | ✅ | ✅ | ✅ | ✅ | 0.00049 |
| attack | ✅ | ✅ | ✅ | ✅ | 0.00049 |
| equip | ✅ | ✅ | ✅ | ✅ | 0.00049 |
| damage | ✅ | ✅ | ✅ | ✅ | 0.00098 |
| death | ✅ | ✅ | ✅ | ✅ | 0.00098 |
| spawn | ✅ | ✅ | ✅ | ✅ | 0.00098 |

门禁口径：`tolerance=1e-3`、`velocityTolerance=1e-3`，并在位置上额外允许每轴
`--ulp-tolerance 2` 个 binary32 ULP。原因：|x| ≥ 16384 时 1 f32 ULP =
0.001953，绝对 1e-3 对任何 f64 累加器低两位不同的实现都不可满足。报告里的
`maxPositionExcess` 单独记录“位置差 − 容差 − ULP 预算”，只有 ≤ 0 才判绿。
`death` 的唯一瞬态是 12100 ms 的 1 ULP（Spider x=24066，0.001953），末帧
回落到 0.00098；其余 7 个场景没有任何 tick 超限。

本轮修复的六处可观测语义差：

1. **AI+52 转向符号**：原 654 用 `select(turn_rate, -turn_rate, AI+48 draw)`，
   领域此前恒取负。Centipede 头每 tick 反向 0.0003 rad；改用 `behavior_choice`
   后 boot-menu 的 866 实体从 tick 1 起逐位一致。
2. **AI+52 步长舍入**：`f32(f32(steer*dt)*0.001)`，先 f32 再乘 0.001。
3. **速度 f64**：transform +40/+48 是 `double`；`Entity::velocity/acceleration`
   迁移为 `Vec2d`，移动积分、花瓣、掉落、worker ABI 同步。
4. **移动积分顺序**：`pos = (drag*v + dt*a) + pos`，drag 在 f64 域。
5. **接触响应**：默认路径为 390 的 `v += p*(-2*dot/|d|²)`；`+48=0` 的静态体不再
   被推动；两个位置路径为“低槽整段推出 + 第二调用消残差”。
6. **候选顺序**：`--contact-order 7`（纯槽序）会把首差提前到 tick 1 / 2.26
   单位，证明默认的松散四叉树顺序正确。

R01/R06 收口时另外修正的四处：

- AI+32/+40/+100 随机角定时器的重绘是**整圈角**
  `f32(f32(rng-1) * 2π/2^31)`，且循环到截止时间超过当前时钟为止；此前用
  `[0,1)` 分数，`attack` 2900 ms 首差。
- 花瓣尸体计时恒为 **1000 ms**；此前的 800 ms “攻击键”分支没有任何 golden
  证据，`attack` 3150 ms 因提前清除多 1 个实体。
- 种群补充在 **AI 之前**（原 `advanceTimedEntitiesAndAi` 先调 400 再转向 AI），
  否则同 tick 的生成抽取会排在 AI 定时器抽取之后；`death` 7050 ms 的 RNG 差
  2 次抽取。
- 花瓣附着的掉落列表按**掉落表顺序**（chance 升序）而不是定义 `petalTypeIds`
  顺序构建；40 seed 的 function 144 探针 40/40 对齐，`death` 8400 ms 的
  掉落差由 231/866 个列表不一致降为 0。
- `updateEquippedPetals` 的充能/重生在 `updatePetalOrbits` 之前，重生的花瓣
  同 tick 参与移动积分；`death` 8400 ms 的重生花瓣此前晚 1 个积分步。

初始种群仍完全对齐：797 个父实体加 69 个子实体、866 次 `spawnEntity`、
直方图与最终 RNG `787621659` 均与原 wasm 一致；玩家出生点逐位一致。

### 4.0 逐实体调试器（`tools/parity/state-debug.mjs`）

```sh
node tools/parity/state-debug.mjs --scenario boot-menu --handle 1174093855 --ticks 6
node tools/parity/state-debug.mjs --scenario death --handle 0 --ticks 249
node tools/parity/state-debug.mjs --scenario boot-menu --handle 1174093855 --all-contacts
```

它重放 golden 的 `sp_server_send` 输入，同时驱动原 `sp_server.wasm` 与 C++
engine wasm，逐 tick 打印：

- 指定 handle 的 x/y/vx/vy/ax/ay/angle 与原版缓存位置 `+88/+96`；
- 原版 AI 记录（`entity+104` → `AI+52/72/76/80/96`）；
- 原服务端 RNG（`8573024`）与 `sp_server_debug_rng()`；
- 可选 `--all-contacts`：引擎本 tick 处理的全部接触 pair（顺序、重叠、
  target/other 的前后位置）。pair 的 handle 以低/高 16 位两个 float 返回，
  避免 float32 截断。

### 4.1 RNG 对齐证据（2026-10-23）

`tools/parity/state-debug.mjs` 每 tick 读取原服务端的 Park–Miller 状态
（`sp_server.wasm` 全局 `8573024`）与 `sp_server_debug_rng()`，逐 tick 比较：

| 场景 | RNG 是否逐 tick 一致 | 首个不一致 |
| --- | --- | --- |
| 全部 8 场景（含 `death`） | ✅ 全 tick 一致 | — |

结论：**生成、AI 转向、花瓣与掉落的随机抽取次数在 8/8 场景一致**。早期
`death` 在 7050 ms 的 RNG 漂移由接触/位置差引起；R06 的松散四叉树与
f64 速度/积分顺序收口后，`parity:engine-state:strict` 8/8（末帧最大位置差
0.000488–0.000977，玩家 0.000168，mismatch 全 0），RNG 也随之对齐。

## 5. 截图阈值

- 默认阈值：变化像素比例 ≤ 0.1%，单通道最大差 ≤ 8。
- 同一构建的确定性重放要求截图 SHA-256 完全相同；与原版比较仍须独立满足上述比例及最大通道差门槛。
- 文本抗锯齿差异不单独 mask；先用命令级 trace 定位，再用截图 diff 判断是否属于光栅化噪声。

## 6. 与 goal.md 门禁的对应

阶段 0 门禁：“一条命令能重放 `garden-idle`，得到稳定的 Canvas2D trace、截图和 server trace。”

历史阶段 0 验证记录（不是最终源验收）：

```sh
node tools/parity/run-scenario.mjs --scenario garden-idle --repeat 2
# deterministic: true, canvas digest 52b48c31, screenshot sha256 相同, server trace 相同
node tools/parity/server-trace.mjs --scenario garden-idle
# match: true, 67 browser packets == 67 replay packets
```

## 6.1 新客户端 Canvas2D 基线

> **历史快照（2026-10-22）**：以下 digest、实现描述及自洽结果属于当时的新客户端基线，不能替代修复后源上的原版等价验收。

`tools/parity/run-client-scenario.mjs` 驱动 `client/public` 的新 TypeScript
客户端，使用同一套 `virtual-clock.js` + `canvas-trace.js`。场景通过
`window.__florr.setSnapshot()` 注入确定性的领域实体表，冻结 worker tick，然后
在虚拟时钟上捕获 3 帧命令与截图。8 个场景与原始基线同名：

```sh
npm run parity:client:update   # 录制 tests/parity/next/<scenario>/
npm run parity:client          # 对比 digest + 截图 SHA-256
```

当次结果：8/8 场景 `deterministic: true`，命令 digest 与截图 SHA-256 在重复运行
中一致。2026-10-22 重新录制后的 digest：

| 场景 | Canvas digest | Ops | 帧 |
| --- | --- | ---: | ---: |
| boot-menu | `7015364d` | 444 | 3 |
| garden-idle | `b12a1ea2` | 2526 | 3 |
| move | `81ba73ac` | 2526 | 3 |
| attack | `bcf97844` | 747 | 3 |
| equip | `a6c7b2b0` | 663 | 3 |
| damage | `60e7aa8c` | 1305 | 3 |
| death | `75d4a424` | 1500 | 3 |
| spawn | `7025e22c` | 7056 | 3 |

当时的渲染器包含玩家花朵与五瓣 Basic、按物种着色的怪物、花瓣、掉落、血条、
命中环、死亡遮罩、菜单、HUD/hotbar/背包、聊天。该基线证明新渲染器自身的
命令级稳定性，**不**声称与原 JS 客户端逐像素等价；原客户端 golden 仍由
`run-scenario.mjs` 维护。

### 6.2 菜单与 HUD 视觉对齐（2026-10-23）

> **历史快照**：本节“菜单通过”及残差比例仅描述该次录制；当前菜单与所有游戏场景仍须在最终源上通过严格命令及像素检查。

`client/src/render/ui.ts` 的菜单分支按原版 boot-menu 的 Canvas2D golden 重写：
背景 `#1EA761`、左侧白色花盘（`#CFCFCF` 3 px 边）、黑描边白字标题、
`#EEEEEE` 姓名输入框、`How to play` 三行、底部 `#5A9FDB/#4981B1` 四个标签
（含 Petals 开关）、右上社交按钮；同时把 `web/fonts/ubuntu-bold-latin.woff2`
复制到 `client/public/fonts/` 并在 `index.html` 注册 `@font-face`，让
`document.fonts.ready` 等到真正的 Ubuntu Bold。字体是惰性加载的，`boot()`
当次修复先 `document.fonts.load('bold 24px Ubuntu')` 再进入第一帧，否则首帧可能
用 fallback 字体、导致重复运行的 canvas digest 不稳定（本轮修复前 5/8 场景
`deterministic: false`）。

`screenshot-diff` 的 boot-menu 变化像素从 **99.976%**（921,381/921,600）降到
**0.00087%**（8/921,600，max delta 2）：离屏文本缓存、Ubuntu Bold 注册和
原版 0.7 UI 空间在该次录制中收敛。菜单当次通过视觉门禁；该结果不能沿用为当前验收。

相机以 `updateCamera` 运行时探针为准：`pixelsPerWorld = scale *
min(h/1080, w/1920)`，`scale` 从 1.0 以 `1 - 0.8^(dt*0.06)` 收敛到 0.9，
1280×720 下是 **0.600000**；`0.600205` 只是启动窗格的瞬时值，不是最终 zoom。
`camera.json` 从 golden 的 arena band（世界 x=-25000）和网格相位反推每帧
相机，误差 < 0.0013 px。

游戏内 HUD 也改为原版布局：左上 `florr.io` 描边字、左下血条
（`Lvl N Flower` + “Extra petal slot at level 15”）、底部五格装备栏
（绿色格 + 白色花瓣圆 + Basic 标签）与五格空槽 + 丢弃槽、底部中央
“Move mouse here to disable movement”、右上 “1 Flower / All petals (10/10)”
面板、右下 Easy/Medium/Hard 地图条。合成快照驱动的 garden-idle 截图差只
作为同一快照下的回归指标；真实实体集合的视觉基线由 `parity:visual` 生成
（§6.3）；当次菜单通过，7 个游戏场景 0.302–1.135%，阈值 0.1% / 8。

### 6.3 引擎态客户端基线（2026-10-24 同帧重建）

> **历史实验记录**：本节同帧假设、比较方法、根因判断及数字保留供审计追溯，不能沿用为最新残差或根因；原版等价和最终源验收仍 pending。§6.3.1 首段单列当前命令门禁契约。

`tools/parity/run-client-engine-scenario.mjs` 把 golden `server.json` 重放进
`client/public/server.wasm`，在最后一 tick 用 `sp_server_state_dump` 导出真实
实体，再通过 `window.__florr.setSnapshotAt()` 喂给 TypeScript 客户端。2026-10-24
起对比是**同帧**的：

- golden `canvas.json` 的 `frames` 改为“最后 3 帧”（截图所在的 60 帧窗口的
  尾部），不再是场景开始时的前 3 帧；截图哈希未变，证明只是 trace 窗口移动。
- 新客户端喂“上一 tick + 当前 tick”两个快照，按 120 ms 插值，捕获帧落在与
  golden 相同的插值相位。
- `tests/parity/golden/<scene>/camera.json` 记录原版相机；runner 默认在每帧
  前 `setCamera()`，把相机固定到原版值，使差异只反映渲染/实体状态，而不是
  相机跟随。`--no-camera` 可关闭（用于自洽基线）。
- 背景按原版结构重画：全屏 `#1EA761`，再用 alpha 0.1 黑色四条 band 压暗
  竞技场外；网格线坐标额外 `+0.5 px`。两项合计把 garden-idle 从 28.78% 降到
  0.47%。

`npm run parity:visual` 的当次结果（当时的 `tests/parity/visual/report.json`，
阈值 ratio ≤ 0.1%、max channel delta ≤ 8）：

| 场景 | 截图差 | max delta | 门禁 |
| --- | ---: | ---: | :---: |
| boot-menu | 0.00087% | 2 | ✅ |
| garden-idle | 0.465% | 232 | ❌ |
| move | 1.035% | 227 | ❌ |
| attack | 1.135% | 228 | ❌ |
| equip | 0.996% | 228 | ❌ |
| damage | 0.816% | 228 | ❌ |
| death | 0.302% | 227 | ❌ |
| spawn | 0.556% | 230 | ❌ |

菜单已经逐像素收敛（0.00087%，最大通道差 2）。游戏场景的剩余差异按区域：
玩家/花瓣 1,623 px、蜜蜂 991 px、装备栏 247 px、地图条 325 px、其他瓢虫
726 px。花瓣与怪物位置差 5–11 px，主因是原版客户端在 120 ms 插值之外还有
客户端侧的轨道/动画相位（服务器 petal 位置与 golden 绘制位置不重合）；
这是 R19.1 的下一项，而不是贴图颜色问题。HUD 文字、面板与地图条已接近
原版；`max delta` 仍由实体边缘/描边造成。

> 旧口径“菜单 4.10%、游戏 25.35–29.87%”已被本节取代；旧数字来自前 3 帧
> trace 与截图不同帧的错误对比。当前视觉门禁读取本次 run 绑定的 visual 报告快照；
> `reports/current-verification.json` 汇总全部必需门禁，不从上述历史数字或手写常量生成。

#### 6.3.1 命令级 diff

**当前实现**：`npm run parity:canvas`（`tools/parity/canvas-command-diff.mjs`）严格比较
golden 与引擎态客户端八场景（含 boot-menu）的**全部三帧**命令、属性、参数及引用资源，
输出 `tests/parity/next-engine/command-diff.json`。验收要求三帧齐全、无差异、数值容差
≤ `1e-4`；缺帧、空帧和无法解析的资源均失败。默认是阻断门禁，只有显式
`--diagnostic` 才是 report-only，不能关闭验收门。

**历史单帧诊断记录**：下表计数与后续差异判断属于旧工具/旧产物，不描述当前三帧结果：

| 场景 | golden ops | next ops | 相同前缀 |
| --- | ---: | ---: | ---: |
| garden-idle | 563 | 564 | 6 |
| move | 587 | 647 | 6 |
| attack | 602 | 650 | 6 |
| equip | 565 | 566 | 6 |
| damage | 583 | 686 | 4 |
| death | 514 | 596 | 4 |
| spawn | 511 | 535 | 6 |

garden-idle 与 equip 的绘图命令数已差 1 条；前 6 条一致，之后原版先
`fillRect`（第二个全屏背景填充）、新客户端先 `beginPath`（网格）。伤害/
死亡场景第 4 条分歧来自当时的新客户端多画了已死亡实体。当时该工具仅作诊断，
尚未达到 R13.4 的逐命令一致；当前门禁契约见本节首段，最终源结果仍 pending。

### 6.4 接触顺序实验（R06）

> **历史实验**：排序、差值及根因解释只对应该轮产物，不代表当前实现或最新残差。

`sp_server_debug_set_contact_order` / `--contact-order` 提供 7 种候选排序。
下表是 390/AI 修复**之前**在 garden-idle 上的相对比较（绝对值已过期，
相对排序是当时的实验结论；该轮修复后的默认绝对值为 150 ms / 0.00122）：

| 排序 | 首差 | 首差最大位置差 | 末帧最大位置差 | 末帧 mismatch |
| --- | ---: | ---: | ---: | ---: |
| **松散四叉树（默认 6）** | 100 ms | **0.1844** | 154.899 | 80 |
| 距离升序（诊断 0） | 100 ms | 0.5265 | 154.899 | 80 |
| 槽位升序（1） | 50 ms | — | 154.945 | 80 |
| 槽位降序（2） | 100 ms | — | 154.899 | 80 |
| 重叠降序（3） | 100 ms | — | 154.945 | 80 |
| 重叠升序（4） | 50 ms | — | 154.899 | 80 |
| 距离降序（5） | 50 ms | — | 154.945 | 80 |
| 实体槽升序（7，新增） | 50 ms | 2.2598 | — | — |

默认已改为 **松散四叉树**（`contact_order = 6`）：每个 body 只有在 AABB
**完全落入**某个子象限时才下沉，否则留在父节点；节点超过 **4** 个 body
才分裂，最大深度 9；查询按节点 body 列表 + NW/SW/NE/SE 子节点遍历。
删除用 **swap-remove**，只有 body 的包含节点变化时才重新插入（追加）。
tick 1 的 ladybug 叶 `SWNWNWSE` 的 body 列表精确复现为
`[1174093855, 1789739117, 3981721710, 3138764911]`；tick 2 离线对照
469/469 节点、0 set/order mismatch（1789739117 从 ladybug 叶 swap-remove，
再追加到 `SWNWNWSESW`，得到 `[2923315308, 1711390832, 1789739117]`）。
在该轮修复前，四叉树序把首差从距离升序的 **0.5265 降到 0.1844**，末帧差与
mismatch 不变（154.899 / 80）；390/AI 修复后默认序的首差为 150 ms / 0.00122。
纯实体槽升序（诊断 7）会退到 tick 1 / 2.2598，确认候选顺序不是槽序。距离/槽位/重叠排序保留为诊断策略 0–5。

进一步用 `probe-colliders.mjs --json` 还原了 tick 2 的树：ladybug 1174093855
位于 `SWNWNWSE`，它的两个候选 2923315308 和 1789739117 都在后代叶
`SWNWNWSESW` 的 body 列表里，顺序是 **2923315308, 1789739117**（collider
索引 105/106，即插入序）。tick 1 时 1789739117 还在 ladybug 自己的节点
`SWNWNWSE`，所以先于 2923315308 被访问；tick 2 它被重新插入到
`SWNWNWSESW`，顺序才翻转。这说明原树是**持久树**（init 133 节点 → tick 1/2
469 节点），不是每 tick 从零重建。

`--fresh-order` 从 collider 列表重建的对照：

| split 阈值 | tick 2 节点数 | tick 2 pair 顺序 |
| ---: | ---: | --- |
| 5 | 629 | 1789739117（漏 2923315308） |
| 6 | 497 | 1789739117 |
| 7 | 417 | 2923315308,1789739117 |
| 8 | 345 | 2923315308,1789739117 |

split 7 能复现 tick 2 的 pair 顺序，但把它接进领域后 tick 1 就出现 2.26 的
首差（原版 tick 1 是 1789739117 先），所以“每 tick 重建 + 单一 split 阈值”
仍不等价；必须复现 init 树的退化节点和逐 tick remove/reinsert。该实验已
回退，默认行为未变。

## 7. 已知限制

> **历史限制清单**：下列“尚未断言”描述属于早期确定性 facade，不是当前 production runner 的检查契约。真实 Worker 路径现已要求掉血/死亡、装备状态、event 11 hit clock/flash 及真实触摸；有断言不代表相应场景已通过。当前范围为 Chromium，不能推断其他浏览器支持。

- `deterministic-worker.js` 是 parity facade；生产 shim 位于
  `client/public/server-worker.js`，使用同一 `{callbackId, finalResponse, data}`
  envelope、输出队列读取与 transferable buffer，并支持 `?manual=1` 让
  虚拟时钟驱动。
- 早期 `damage`、`death` facade 场景只保证固定输入下的画面/服务端 trace 稳定，当时未断言“确实发生了掉血/死亡”；这不是当前 production runner 的契约。
- `equip` 场景使用 `I`/`1` 键，画面稳定，但“装备成功”的语义尚未由状态断言证明。
- `spawn` 场景验证生成循环的稳定画面与输出包序列，不声称覆盖所有 20 条生成规则。
- 当时截图 diff 只在本地 Chrome 录制；当前验收范围已明确为 Chromium 桌面/触控模拟。
- 早期记录器只覆盖主线程 2D context；当前 Canvas2D trace 也包装 `OffscreenCanvas`，不据此声称覆盖 WebGL。

## 8. 下一步

> **历史实施顺序**：保留早期骨架计划；当前剩余工作及完成边界以 `goal.md` 页首 2026-10-25 状态为准。

1. 阶段 1：`schema/protocol.yaml`、`schema/layout/*.yaml`、`schema/catalogs/*.json` 已建立，`tools/gen-contracts.mjs` 生成 C++/TS/Markdown，`tools/layout-probe.mjs` 已逐字段对齐 39 花瓣、23 实体、20 生成规则。
2. 阶段 2：建立 `engine/` C++20 core（`f32`、`vec2`、`rng`、byte reader/writer、world/entity model、协议层），先 native 单元测试，再 wasm worker shim。
3. 用 `server-trace.mjs` 的输入/输出包作为 C++ server 的第一组差分目标；
   `server-state-trace.mjs` 已提供语义层差分；原始 `server-trace.mjs` 的 8/8
   包序列已匹配，engine 自身的 snapshot framing 仍按领域扩展单独验证。

## 9. 阶段 2 骨架状态

> **历史能力快照**：本节旧测试结论及“唯一未收口”不代表当前残差集合。短 strict/controlled fixture 不能关闭长时模拟、协议、生产交互或原版等价的剩余问题。

本阶段先建立可编译、可测试的 C++20/TypeScript 骨架，不声称服务端行为已等价：

```sh
npm run test:engine       # native 单元测试：f32/vec2/rng/varint/xor/tick/entity/input/snapshot
npm run build:engine:wasm # em++ -> client/public/server.wasm
npm run test:client       # tsc --noEmit + worker shim / client boot 浏览器 smoke
```

当次结果：

- `engine_tests` 全部通过；CMake 使用 `-ffp-contract=off -fno-fast-math -fno-exceptions -fno-rtti`；
- `client/public/server.wasm` 由 `em++` 生成，导出 `memory`、`malloc`、`free` 和四个 C ABI 函数；
- `client/public/server-worker.js` 已实现原 worker 消息 envelope、50 ms 生产 tick、
  输出队列读取与 transferable buffer，并在 Chrome 中完成 `init/think/flush` 往返；
- `engine::Catalog` 读取生成的 39/23/20 目录数据，单元测试覆盖 Basic/Rock、Rose 重名和生成规则；
- `World::initialize` 生成 16,384 个实体 handle，首个 handle `1048936448`、最终 LCG 状态 `11065635568950165505` 与 `layout-probe` 的原版记录一致；
- `SpawnTable` 复现原版 8 个 band 的总权重/条目顺序、加权选择，以及原版 `787621659` 初始状态下的一次 band 位置采样；
- `SpatialQuery` 复现原函数 161 的 1200×1200 查询、physics AABB/radius 和 600/100 flag 规则；
- TypeScript 客户端 `tsc` 通过，页面启动无 console/page error，canvas 为 1280×720。

限制：C++ server 已覆盖世界/实体池、输入 framing、玩家/花瓣/怪物生成、战斗、
伤害、掉落、死亡和 live snapshot；`sp_server_send` 已解析 opcode 0/2/3/4/5/6/7/8/10/12/13，
固定长度命令使用原版 byte layout，sequence 已做严格递增门控。字符串命令仍
只有 NUL 扫描，原版 pending-byte 对齐与部分命令副作用作为实现差异保留
（R11/§4 非目标）。阶段 2 的完成定义见 §11：8 场景 strict 逐实体 8/8，
协议可解码，R04 回调已重建并有 native fixture；原版 stinger 对照 fixture
仍是唯一未收口的证据项。

## 10. 历史 live snapshot 与 parity 状态

> **历史协议快照**：以下“本轮”指原记录时点，不是当前完整字段覆盖或最终验收签字。

本轮把 `sp_server_think` 的 live 输出从固定 skeleton 记录切换为
`WorkerApi::domain_snapshot_bytes`：original type-1 header、每实体一个 mask
entry（fields 2/5/8/24/26/31/53/55）以及 coalesced hit 的 opcode-11 event。
`client/tests/worker-shim.test.mjs` 的浏览器 smoke 已断言玩家 `health > 0`、
`maxHealth == 100`、`kind == 1`，说明原始 health/kind 字段在真实 worker 往返中
被客户端投影。

这不等价于原 JS 客户端的 Canvas2D parity：`tests/parity/golden/*` 仍是对原 JS
客户端录制的基线。新客户端已有独立的 8 场景命令/截图基线（见 6.1），但两组
golden 不是同一渲染器，不能直接互相替代；原客户端重放仍是视觉等价的最终门禁。

## 11. 历史验证快照（2026-10-23 23:55）

> **历史结果，停止作为滚动当前状态使用**：测试数、strict 通过、浏览器 skip 及阶段完成结论仅属于当次记录。当前浏览器 runner 对缺失/失败 Chromium 退出失败，且不接受 Firefox/WebKit；最终源上的两轮验收仍 pending。

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm test` | ✅ 692/692 | 修复 span-blend 的 7 个变体通道映射与 wide-string 的 16 字节栈帧/allocator 依赖 |
| `npm run test:engine` | ✅ 90/90 | 接触 162/390 模型、AI 转向符号、f64 速度、401 链约束 |
| `npm run test:client` | ✅ 68/68 | 相机 0.600205、输入编码器、DPR/resize、键盘 UI、单局死亡/重开 e2e、交互 e2e、输入 hex trace |
| `npm run test:reference` | ✅ passed | 冻结树与 key files 未变 |
| `npm run parity:server` | ✅ 8/8 | 原始 `sp_server.wasm` 包序列 |
| `npm run parity:client` | ✅ 8/8 | 新客户端自洽命令/截图基线 |
| `npm run parity:engine-state` | ✅ 8/8（count/handle/entity/player） | `--all --strict` exit 0；末帧最大位置差 0.00049/0.00098，玩家 0.000168；位置门禁含 2 ULP 预算 |
| `npm run parity:original-engine` | ✅ 8/8（协议） | 原客户端解码 872 实体、玩家进入花园、零 trap；**截图仍停在菜单**，只能作协议证据 |
| `npm run catalogs:drops:verify` | ✅ 102/102 | 0 mismatch |
| `node tools/browser-matrix.mjs` | ✅ chromium pass / firefox+webkit skip | R23 签字为 Chromium-only；Chrome 156 桌面 + 移动视口触控通过；详见 `docs/browser-matrix.md` |

`parity:engine-state` 默认是报告模式（现在显式传 `--baseline`）；
`parity:engine-state:strict` 才在
`countMatch`/`handleMatch`/`entityMatch`/`playerMatch` 任一失败时退出 1。
严格门禁已于 2026-10-23 23:55 变绿（8/8，exit 0），阶段 2 的逐实体状态项完成。
R04 的 Hornet 回调（AI+144 → 74）已按 `function_695` 重建为 `spawn_hornet_stinger`，
并由 `test_hornet_stinger_callback` 覆盖；阶段 2 的剩余口径是“原版 stinger
对照 fixture”，不是状态/协议等价。

## 12. 2026-10-23 验证快照

> **历史结果**：本节及其子节保留原始测试数、体积、哈希与性能数字，不能沿用为最新报告或当前验收结论。

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm run test:engine` | ✅ 90/90 | 新增 phase trace、deferred 顺序、effect payload 释放、pending cache、archived mask、4124-byte HitMessage、EffectPayload 虚析构、AI 速度/转向/攻击乘数、quadtree 更新计数、1152-byte SimulationFrame + World frame 同步测试；TAP 写入 `reports/engine-tests.tap` |
| `npm run test:client` | ✅ 68/68 | 单局 e2e（菜单→花园→移动→攻击；suicide→死亡→重开）+ 交互 e2e（装备/攻击/防御/丢弃/交换/聊天/掉落）+ 输入 hex trace + 0.600205 zoom + 背包 tooltip + 拖拽；TAP 写入 `reports/client-tests.tap` |
| `npm run test:parity` | ✅ 8/8 | 固定 UA 后原客户端 golden（canvas + server）全绿 |
| `npm run parity:server` | ✅ 8/8 | 原 `sp_server.wasm` 包序列 |
| `npm run parity:client` | ✅ 8/8 | 新客户端自洽基线；zoom/grid/竞技场配色/快捷栏改动后已重录 |
| `npm run parity:engine-state` | ✅ 8/8（count/handle/entity/player） | 8 场景全部逐 tick 通过；RNG 全程逐 tick 一致；`--strict` exit 0 |
| `npm run parity:original-engine:all` | ✅ 8/8 | 872 实体解码、玩家 flag、进入花园、零 trap |
| `npm run perf:client` | ✅ p95 18.2 ms / 60.0 FPS / 0 long task | 872 实体、600 帧、每帧移动相机 |
| `npm run test:javascript:tap` | ✅ 692/692 | 2026-10-23 22:30 重跑，416.6 s，0 fail；TAP 写入 `reports/javascript-tests.tap` |
| `npm run parity:canvas` | 🟡 diagnostic | 7 场景首帧绘图命令前缀 6；garden 766 vs 521 |
| `npm run build:engine:wasm` | ✅ 211,588 B / `0f0ab8dc…` | 重建同哈希 |
| `npm run build:dist-next && npm run verify:dist-next` | ✅ 76 文件 / 529,319 B | 0 issues；server.wasm 211,588 B / `0f0ab8dc…` |

### 12.1 archived-client 全实体 framing（R03a）

旧的 `OriginalClientSnapshotWriter` 在每个实体记录前写 `u16 0`，而原协议只在
block 里写两处 2-byte pad：`removalCount` 之后一处、removal 数组之后一处。
于是客户端从第 2 个实体起把 pad 当成 handle 的高 16 位，`rotateHandle` 得到
越界 slot，client 1015 报 `memory access out of bounds`。

修复：

1. `begin()` 写 `removalCount varint + 2×u16 pad`（本实现不产生 removal，
   第二处 pad 因此紧邻第一处）；
2. 删除每实体 `u16 0`；
3. terminator 改为单个 `u32 0`，`blockLength` 包含它；
4. mask 改为 `0x184003`（组件 1/2/15/20/21），玩家记录置 `flags & 128`，
   玩家放在实体列表首位。

### 12.2 原客户端 + C++ 引擎的完整链路（R03）

修复 framing 后客户端仍只处理到 `seq 4`。原因是真 worker 与页面虚拟时钟
不同步：引擎每个 flush 都生成 866 实体的 34 KB 全量快照，而原版只在世界
变化时发 delta。客户端 rAF 每帧 flush，worker 队列积压；`damage`/`death`
场景最终在客户端 1015 越界或 2338 OOM。

两处修复：

1. `run-original-engine.mjs` 在每次 `advance()` 后 `drain()`：轮询 worker
   消息计数直到 300 ms 无增长（上限 20 s），让 worker 追上虚拟时钟。
2. `sp_server_flush_original` 对世界做 FNV-1a 64 哈希（handle/type/x/y/health/
   angle/kind），与上次相同则**不产生包**，与原版“只在变化时发送”一致。

结果：8/8 场景 `activeCount=872`、`playerFlagged=1`、零 console/worker 错误；
`death` 场景客户端处理 7016 个包仍无 OOM。判据从“菜单像素”改为
`worldEntities`/`playerPresent` 等协议断言。

### 12.3 性能预算（R31）

`npm run perf:client` 在 Chrome 中加载新客户端，冻结 worker/输入，注入
872 实体花园快照，跑 600 帧并每帧移动相机：

| 指标 | 结果 |
| --- | ---: |
| p50 / p95 / p99 / max | 16.7 / 18.2 / 18.5 / 18.9 ms |
| FPS | 60.0 |
| long task | 0 |
| 堆增长（600 帧） | +0.75 MB |

通过线：p95 ≤ 20 ms、max ≤ 50 ms、FPS ≥ 55；结果写入 `reports/perf.json`。

