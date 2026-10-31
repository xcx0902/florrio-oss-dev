# 08：客户端帧耗时、内存与 Worker 通信优化

> 状态：F01—F08 已完成并验收通过（2026-10-31，Asia/Shanghai）。完整 600 帧 × 5 次矩阵、真实 Worker 链路及 30 分钟资源浸泡见 [M4 实施及验收记录](../docs/m4-performance.md)。本页正文保留原始目标与验收定义，未达到的非门槛指标亦在记录中如实列出。

## F01. 保留渲染基准，新增真实端到端测量

现有 `tools/perf-client.mjs` 在 1280×720、DPR1、60 帧预热后测 600 帧，冻结 worker/input，注入 872 个实体并持续移动相机。它适合 renderer 微基准，但实体总数不等于每帧可见数，也不能说明真实模拟与解码表现。

迁为两类互补工具：

| 基准 | 工作负载 | 必须采集 |
| --- | --- | --- |
| `perf:client` | 保留 872 实体 moving camera；新增大量可见实体、文本/掉落、图鉴、死亡转场；DPR1/2/触控 viewport | rAF interval、render CPU、可见/绘制数量、Canvas ops、缓存命中与内存 |
| `perf:integration` | 当前真实 Worker+wasm，默认人口，开始/移动/攻击/装备/死亡/重生 | input→worker、step、packet transport、decode/apply、render、pending、长任务与内存 |

报告绑定当前交付身份，记录总实体/可见实体/类型分布/视口/DPR/浏览器/机器；每场景至少重复 5 次，保留原始分布和中位结果。Synthetic renderer 与真实链路分别报告，不能混用通过结论。

对现有 1280×720 基准继续保留 FPS≥55、rAF p95≤20ms 的目标；rAF max≤50ms 记录为严格 profile 的指标，不作为跨机器唯一判断。另加单帧 rendering CPU p95≤8ms、snapshot decode+apply p95≤2ms 的目标；retina/触控另建基线，不把 DPR2 测量伪装成 DPR1 同负载。

## F02. 单帧上下文减少重复世界扫描与插值

已确认的重复工作：

- `WorldState.playerEntity()` 遍历 Map；主循环多次调用 `localPlayer()`，又用 `[...world.all()].some(...)` 判断 player 是否存在。
- `drawWorld()` 用 `Array.from(world.all()).find(...)` 找 level，再扫描 drops，再收集可见列表。
- `collectVisible()` 为实体产生插值对象并计算屏幕位置；player follow/transform 也可能在同帧再次计算。
- `main.ts::frame` 每帧重新从世界推导负载与图鉴发现；`visible.map/filter`、Set 产生临时对象。

目标在每帧创建或复用一个 `FrameContext`：

1. 含 now、dt、viewport、DPR、camera、当前 player、level、loadout view 与 membership revision。
2. player 通过 05 的缓存 handle 获取，区分尸体与 healthy player；当前帧只解一次。
3. 插值结果按 handle 缓存本帧值，camera follow 与 draw 若语义不同保留不同结果，不错误合并相机标量与显示标量的独立时钟。
4. 可见列表、layer bucket、临时 stamp 表复用容量，避免每帧 `Array.from/map/filter/new Set`。
5. 图鉴发现通过新增实体/物种事件驱动，只在首次发现时持久化；loadout/scoreboard 模型按对应 revision 更新，不每帧重建数据。
6. 将渲染帧内“采样输入→更新相机→建立 draw context”的先后固定下来，保留当前基于上一视图采样输入的规则。

验收：记录每帧 full-world scan 次数和临时分配，目标减少至少一半；插值/健康/相机/玩家控制行为不变。不要只减少某个函数调用、把相同扫描藏进新 helper。

## F03. 可见性与绘制顺序分开缓存

`collectVisible()` 当前每帧收集并排序实体；`drawWorld()` 又建立 renderedHandles 和 player 子列表。优化分三步：

- 先把 draw order 的排序键明确为 layer、既有组件/handle 次序等产品规则，保持稳定；不要只按距离或材质重排而改变遮挡。
- 使用复用数组和 layer bucket。membership/kind/component/layer key 变化时更新排序关系，位置插值与 viewport culling 仍逐帧计算。
- 对清理视觉状态使用 `seenFrame` 标记，代替每帧 `new Set(visible.map(...))`；清理规则应按 authoritative lifetime，而非“这帧没画到就销毁”。

保留当前视口剔除及插值半径/坐标语义。当前 workload 只有约千实体，先测线性剔除成本；只有视口剔除确为瓶颈再引入客户端网格索引，不默认复制一套服务端四叉树。

## F04. 避免离屏动画状态被重复丢弃/创建

`render/world.ts` 的 WeakMap 持有 player/species/drop/petal 视觉状态，并按 visible/rendered 集合清理。需要逐项确定：哪些状态仅在可见时推进，哪些状态离屏后仍应连续，哪些应在权威删除时结束。

具体修改：

1. 以 handle+generation 管理视觉状态；权威删除、拾取 transfer 接管、session reset 触发清理。
2. 屏幕外对象保留必要的动画 phase/出生时间，重新进入时从绝对时间或低成本推进恢复；不因反复离屏而重复分配随机 trail、path 或 reset 出生动画。
3. 帧内对 draw-only 临时值使用复用 buffer，不让动画对象反复 create/discard。
4. 若现有视觉效果明确采用可见时间推进，保持该规则并测试；不以性能优化为由改变所有离屏动画时钟。

验收用相机反复横移、实体离开/重入与销毁后复用 handle index 三种场景，确认不会闪现、重播错误动画或继承旧对象缓存。

## F05. 为文本、路径、panel 缓存设资源预算

当前 `text-cache.ts` 有 `labels`、`ownedLabels`、`measurements` 长寿命 Map；art 有 rock/cactus path cache；HUD 有 panel surface。WeakMap 只保护外层 context，不代表内层 Map 自动限制增长。

目标由 05 的 `RenderResources` 管理：

| 缓存 | 修改内容 | 初始预算/验证 |
| --- | --- | --- |
| 非 owner 文本与测量 | LRU/按成本淘汰；key 含 text/font/style/scale 所需维度 | measurements≤4096 项，普通标签≤1024 项；根据实测调整 |
| owner 文本 | 为实体/UI owner 提供 release；内容/样式变化重绘；session reset 清空 | owner 数与当前实体/UI 数有界，不随已销毁实体累计 |
| 文本 raster canvas | 统计 width×height×4 的估算成本，超过总预算淘汰可重建项 | 初始 32MiB 标签缓存预算，单张超大文本走明确降级策略 |
| rock/cactus 路径 | 按实际几何/handle/半径语义缓存，限制条目或按实体释放 | 稳态数量与活跃/近期可见几何有界 |
| leaderboard/menu surface | 由 view revision、layout、DPR 失效，resize/reset 释放 | 不保留多套过期 DPR surface |

预算是实现起点；交付时写入可配置产品参数并记录淘汰次数，不能无限扩容来降低 miss。Canvas/Path2D 的真实内存难直接读取，应同时记录可计算资源成本和进程/heap 测量的局限。

现有文本 owner 的 rasterScale 与重绘阈值规则影响字形和尺寸，先保留其产品回归，再调整淘汰与释放。不使用每帧 `clearLabelCache()` 解决增长问题。

压力验证：连续生成并删除 10000 个掉落/动态文字 owner，清理后 owner count 回到场景预期；30 分钟交互过程中缓存条目和估算像素成本到达平台，不持续单调增长。

## F06. 文本测量、菜单布局与 HUD 只在必要时重建

源码位置包括 `menu-layout.ts::wrapMenuText/mobRowRect/menuScrollMax/changelogEntries`、`hud.ts::drawFlowerPanel`。后者每帧 `JSON.stringify` 整个显示列表与比例构造 key。

修改方式：

- 菜单文字换行、物种行高、drop rect、changelog 高度缓存按内容 revision、字体/字号、宽度、发现状态失效。
- 滚动只改变位置，不重新测量整页内容；高条目图鉴仅绘制 viewport 及边缘缓冲区，命中索引沿用同一布局。
- 排行榜用结构化 view revision 或逐字段比较，只在显示 name、格式化 score、score fraction、layout/DPR 变化时重绘；消除每帧列表 JSON 序列化。
- 静态形状优先复用已有 path，避免重复构建点列。缓存键不能包含每帧 time 导致永远 miss，也不能省略 flash/尺寸等改变结果的参数。
- 渐变、旋转、alpha、眼睛、昆虫腿等动态效果继续逐帧绘制；不把所有实体预渲染成错误的静态 sprite。

目标：图鉴打开并静止时，预热后整页 text measurement/reflow 次数为零；滚动时不重新测量全部条目；大量文本场景 render p95 下降至少 20%。

## F07. 减少 Worker RPC 次数，保证在途请求收敛

当前客户端默认 `server-worker.js?manual=1`，主线程 `tickServer()` 在一个 50ms step 内顺序 await 输入、think、flush；worker 还保留自动 timer 和 original mode。先按 01 移除 original，再按以下路径收敛：

1. 本轮继续由主线程 simulation loop 持有唯一 50ms 调度权，worker 使用明确 manual 模式；不同时启用两套 timer。切到 worker 自持时钟属于后续单独方案。
2. 增加类型化 `step` 请求：携带本 step 已排好序的输入/菜单命令，worker 按 send→think→flush 执行，转发全部包后 finalResponse。保持既有输入 sequence、事件与包顺序。
3. 单 step 控制往返从多次降至一次；输入到达、完成 tick 数和 spawn 冷却以成功完成 step 为准，不能在异常时重复推进或偷偷补多 tick。
4. `pending` 与 `rejecters` 合成一个 PendingRequest 记录，包含 resolve/reject/onPacket/deadline；处理 final、error、onPacket 异常、worker.onerror/messageerror、timeout、terminate 时统一清理。
5. 对未完成 step 保留背压；隐藏页 timer 延迟不形成无界输入队列。保留当前暂停/恢复语义，不未经设计按墙钟补跑大量 tick。
6. 输入 malloc/free 放 try/finally；输出维持从 wasm view copy 成可 transfer buffer，禁止 transfer wasm memory buffer 或读取已增长后失效的 view。

先保持一个输出包一条消息，确认瓶颈后再考虑在同一 step 批量传输多个 buffer；不能为了减少消息而丢掉中间 flush 包。

验收：正常游戏 pending≤1 个 step，完成/失败/terminate 后为 0；每 step 只有一次 think；强制错误和断开都结束 promise；端到端延迟 p95 不回退，消息数/step 有报告。

## F08. 渲染与打包优化的接受标准

- 纯渲染基准目标：高实体/文本场景 CPU render p95 降低至少 20%，较轻场景不回退超过 5%；FPS 同时报告，但不把受 60Hz 上限限制的 FPS 当唯一证据。
- 真实链路至少覆盖默认人口与战斗，不能冻结 worker 来宣称 end-to-end 提速。
- 一次加入一个优化点；记录 frame scans、visible/drawn、sort、cache、packet、pending、CPU 与 heap 的前后数据。
- 不降低分辨率、DPR、人口或动画质量来满足原工作负载预算；若产品以后支持质量档位，另行定义并标明测试档位。
- 交付大小通过 06 的白名单、删除无消费者模块和裁掉测试内容改善；额外压缩只有测量下载/启动收益后才引入。
- 产品截图/交互允许实现层 Canvas 命令改变，但视觉、层次、命中、动画和生命周期的产品规则必须通过。
