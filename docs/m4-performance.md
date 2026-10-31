# M4：性能改进实施与测量

实施日期：2026-10-31（Asia/Shanghai）。起点为 `225d5c13cd6e97f8f09f6d419a6dcd327f059c03`；本次接续时工作区已有 M4 实现，保留并补齐这些改动。范围为 07/P01—P07 与 08/F01—F08；未恢复历史入口或读取 archive 作为验收输入。最终结果与状态见本文末尾；工作区的完整原始分布保存在 `reports/performance/`。

## 实现映射

| 目标 | 落点与行为约束 | 验证 |
| --- | --- | --- |
| P01 | `engine_perf_core` / `engine_benchmark` 为独立、默认不编译的 instrumented target；生产宏全部消除。native、Node WASM 使用同一驱动；输出原始样本、分位数、阶段累计时间及逐 tick 阶段样本、实体访问、索引操作、候选/接触、边界/字段、分配/保留字节。 | `perf:engine`：9 个场景 × 2 个 runtime × 5 次，固定 seed `285456437`。 |
| P02 | `SpawnQueryContext` 每批建树一次，每次工厂结束同步全部新增实体，包含蚁穴子体与蜈蚣段。保留选择、尝试次数、失败、位置与 RNG 顺序。缺额为零不建树。 | 旧式逐次建树的产品 reference 测试；boot/refill 摘要、RNG、包字节摘要。 |
| P03 | AI steering 阶段惰性建一份 query；攻击出生仍在 deferred 同步点执行。area 阶段无有效 owner/payload 不建树，有效时共享一份几何视图；目标按原顺序 detach/attach，复用 scratch 并用线性差分。 | 1/10/50 area 同负载对比；目标进入/离开、owner 删除、过期、战斗回归。 |
| P04 | `CollisionContext` 持有 bodies、present/touched、generation stamps、连续候选池和 offsets；同阶段收集一次，先冻结全部候选再解算。树遍历、`second > first`、即时 active/health 检查与窄相顺序保持。 | 聚集场景、边界/双 World 回归；stamp wrap/reset 与 scratch 容量测试。 |
| P05 | `active_entities()` 为升序实时迭代。热系统通过 `with_ordered_slots` 在阶段开始选择：≤2048 活跃时用位图，密集时直接用原数组循环与 active 检查。稀疏 allocate/release 同步维护位图，密集 mutation 标记 dirty；下一次位图读取（含实时迭代的 ++）先同步，const 迭代亦然。reset 清零，两种路径保留相同 FIFO/generation 语义。 | 低活跃、半满、近满池与 churn，native/WASM 各 5 次、每次 1000 对相邻遍历；两条密集路径调用同一个数组求和内核，避免编译器为相同遍历选择不同归约代码。高槽位出生/未来槽位删除、密集 mutation、池满、保留槽/reset/generation 回归。 |
| P06 | `PublicationBounds` 只在本次发布内复用，按既有 children 顺序做 f32 union；一次发布只有一个视口，以有序线性过滤取代临时发布树，保留 arena-root 拒绝、inclusive AABB 与 controlled-body 独立引入语义。contact 树不共享。复用 encoder 三个 writer 的容量，完成包预留后 move。沿用 M3 的一次 PublishedEntity 查找和 World destruction 通知。 | 441 个含 arena 外部边界的 box × 441 个 view 的线性过滤/旧树查询成员等价测试；首次/delta/重入、死亡、拾取、wire 向量与跨端测试；moving-combat 的完整包字节纳入摘要。 |
| P07 | 固定 workload 的 gameplay/RNG/事件和每个输出包字节纳入 FNV64 摘要，另比 seed、draws、包数、字节数、实体数与重生数；只在相同 runtime 内比较。 | 10000 tick 生命周期各跑 5 次；正常 flush 后 queue=0，析构后剩余测量驱动缓冲单独报告。 |
| F01 | 合成 renderer 与真实 Worker 链路分别报告，包含源码、交付树、机器、浏览器、视口/DPR、总数、可见/绘制数、Canvas ops、CPU/rAF、缓存、heap、消息与解码。 | 四个 renderer 场景 × desktop/retina/touch × 5 次；60 帧预热、600 帧采样。真实链路有 HUD 拖动/数字键装备、移动攻击、死亡与重生。 |
| F02 | `FrameContext` 复用 draw membership、可见缓冲及插值存储；字段时钟保留，未更新且完成插值的 EntityState 复用结果，时间倒退或快照替换重新计算。player/loadout/discovery 走索引和 revision。视口的 camera-only f32 边界每帧计算一次，剔除后才做屏幕投影。 | 位置/角度/半径独立时钟与相机回归；插值缓存更新、倒退、删除测试；多分辨率/zoom/正负大坐标及 inclusive edges 的新旧剔除表达式对比。完整 culling 与保留 membership 清理仍计入 scan，未隐藏到 helper。 |
| F03 | layer/handle 排序只在 kind/species/type/component/membership 变化时更新；逐帧插值和剔除保留，复用 visible records。 | draw order、遮挡、位置 delta 不触发排序与 browser Canvas 合约。 |
| F04 | 视觉状态按 authoritative handle 生命周期持有，离屏不反复创建 phase/trail；删除、session reset 与 dispose 释放 owner，拾取由 transfer 接管。 | 相机离开/重入、删除后同 slot 新 generation、dispose 集成测试。 |
| F05 | `ResourceCache` 提供 LRU 与共享文本像素预算；超大文本直接绘制；释放/淘汰将 canvas 归零。路径 geometry、菜单布局、panel surface 都有 owner 与失效边界。 | 10000 owner 单元压力与 30 个真实分钟的资源浸泡；预算及限制见下。 |
| F06 | 缓存换行、物种行前缀几何、changelog 和 scroll max；图鉴发现列表只随发现变化更新。排行榜逐显示字段比较，替代 JSON 序列化，过期 surface 释放。Canvas 桥保存已提交矩阵，去掉逐坐标 DOMMatrix 分配；HUD 共用 RGB 查表，避免逐 setter 数组/十六进制构造，矩阵比较不创建回调。owner 标签直接比较内容/样式字段，LRU 用链表维护访问顺序，掉落稀有度颜色仅生成一次。 | 预热后布局不再重新测量、发现/字体失效；真实图鉴滚动/命中、DPR、HUD 回归；未 flush 的嵌套 save/restore、原生画布重置、RGB byte 转换与共享像素预算测试。 |
| F07 | 唯一主线程 50ms 时钟；`step(inputs)` 串行 send 全部输入→think 一次→flush，全部包发送后 final。一个 pending 记录统一清理，10s deadline；队列≤254，单 step 背压，spawn/cooldown 只由成功 tick 推进。 | 顺序/sequence/冷却/装备真实输入；异常 callback、postMessage、timeout、crash、messageerror、terminate 后 promise 与 pending 收敛。 |
| F08 | 保留分辨率、DPR、人口、AI、50ms 步长、绘制与发布频率及动态 art；以 CPU 和计数判断收益，60Hz FPS 只作为绝对预算之一。 | 同配置 before/after；收益目标单列，未把计数改善或未达标目标写成耗时收益。 |

## 可复现命令

工具链由 `.emscripten-version`、`.chromium-version` 和 lockfile 固定。浏览器基准必须使用项目固定 Chromium，通过 `CHROME_PATH` 指向已安装版本。

```sh
CHROME_PATH=/path/to/pinned/chrome-headless-shell npm run test:m4
```

`test:m4` 先校验完整的冻结 before 报告，再依次运行 `test:all` 的 15 个产品 gate、活跃索引 12 组对比、30 个真实分钟的资源浸泡和 M4 收益比较。`test:all` 只打包一次，内部已含完整产品回归与三个性能 gate。独立分析可分别运行 `npm run perf:engine`、`npm run perf:client`、`npm run perf:integration`；renderer/真实链路默认均为 600 帧、5 次。自定义短采样不得冒充完整默认 profile。

最终 `m4-acceptance.json` 仅在产品及验收源码未变化、冻结 before 未变化、完整 15-gate 不可变账本/交付/日志/原始报告哈希仍有效时通过，并保存所有 M4 引用文件的 SHA-256。开始运行即写 running/passed=false，失败写 failed；不能继承旧的通过摘要。

先冻结优化前源码、同一测量驱动、交付和 instrumented native/WASM；随后冻结优化后交付，再记录报告。浏览器服务的 dev/test-api 必须来自对应版本的 build/client。用 `tools/performance/compare.mjs` 合并报告，它拒绝未完成、身份变动、功能错误、机器/采样配置不同或状态/包摘要不一致的输入。renderer 数据完整但绝对预算未达标时仍可比较，保留 budget passed=false，不能改成通过。原始报告不能修改为通过。

本轮 before 使用优化前当前产品及独立测量插桩的冻结源码，产品身份为 `90a73ac9e96e54dfc00b6f95b3c2c517734a199306d78b6b75a1056fc314b54f`。重新采集完整的逐阶段原始样本、600 帧 renderer 与真实链路；较早的短采样或缺少阶段分布的报告保存在 `reports/performance/history/previous/`，不参与最终验收。before 的 WASM 默认人口 tick 预算未达标时保留 passed=false，但只有 completed=true、stable=true 的完整负载可以作为比较基线。

```sh
node tools/performance/compare.mjs \
  --before-engine reports/performance/engine/before.json \
  --after-engine reports/performance/engine/after.json \
  --before-client reports/performance/client/before.json \
  --after-client reports/performance/client/after.json \
  --before-integration reports/performance/integration/before.json \
  --after-integration reports/performance/integration/after.json
```

## 负载与计数口径

- 默认 boot/idle/moving/refill 保持默认人口。idle/moving 预热 200 tick 后测 2000 tick，包含发布与 flush；idle 未 join 时协议应当不发布 spatial entities。包摘要在计时区间外计算。
- area 使用固定 300 个实体、1/10/50 个有效区域，每次 500 次更新；聚集接触为 300 个移动实体，200 tick 预热后测 2000 tick。refill 同时清除多个 band 的约三分之一实体，包含复合工厂。
- lifecycle-soak 的固定局部战斗负载为 24 个怪物，反复出生、移动攻击与 suicide/重生，10000 tick；前后均使用相同配置。它与默认世界 steady-state 分开，不能替代默认人口结果。
- boot/refill 是每轮一个完整批次的样本，重复 5 轮；其余场景保存每轮全部 tick/update 样本。分位数取排序后 `floor(q*N)` 的有界 order statistic；报告原始值及 5 次中位结果，保留 max 和噪声。
- `visitedSlots` 为已插桩热循环实际访问的槽位；稀疏位图的字扫描开销没有记作 Entity 槽位访问。密集 fallback 与 dirty 位图同步各计入实际访问的 16384 槽位。空间树节点访问没有混为实体访问。
- 阶段时间同时保留累计值和逐 tick 累计差值样本，分布计算在被计时的产品步骤之外。contact 包含建树/查询/解算，`broadphase` trace 标记在实际调用前；发布 p95 来自逐 tick 的 publish 样本，不以阶段累计值冒充。单 tick 分布、独立 area 更新分布和聚集场景分布另有完整采样。
- C++ 分配计数统计 benchmark 的 operator new，包含容器；不等于系统 malloc/RSS。afterDispose 仍包含 samples 等驱动缓冲，不要求为 0。WASM 表示 Node 中相同引擎；浏览器真实 Worker 的 think 单独报告。
- Worker 往返与 messages/step 仅用测量区间内完整结束的步骤计算；开头和末尾的未完成片段另记 boundaryRequests，不将这些片段拼为完成步骤或用于稀释延迟。

## 资源预算与生命周期

默认预算可通过 `new RenderResources({...})` 配置：文本测量≤4096、普通标签≤1024、owner 标签≤4096、两类标签共享的估算像素成本≤32MiB、路径 geometry entries≤1024、布局≤1024，单个文字 raster 维度≤8192。cactus 的一条 geometry 包含 outer/inset 两个 Path2D，不能把 entry 数当成精确对象内存。snapshot 的 hits/misses/evictions 为文本/测量缓存计数，path/layout 另以存量约束。

标签 raster 成本使用 width×height×4；HUD/panel/过渡层为各自单一 surface，resize/reset/dispose 释放。该估算不等于 GPU 或浏览器 RSS。堆受 GC 调度影响、WASM linear memory 为高水位，均不能仅凭不回落判断泄漏。

30 分钟浸泡使用固定最终交付，在真实 rAF 中持续移动相机，每秒创建/替换 100 个动态 drop owner，10 秒记录一次资源与 heap。结束删除 drops 并等 5 帧，owner 回到玩家/UI 的场景预期；不通过每帧 clear 全缓存或扩大预算通过。

## 验收结果

**M4 全部完成并验收通过（2026-10-31，Asia/Shanghai）。** P01—P07、F01—F08 的实现与门槛全部验收：产品 15/15、收益检查 48/48、活跃索引 12/12，以及 30 个真实分钟的资源浸泡；最终摘要 passed=true，status=passed。

- M4 run：`2026-10-31T04-30-15.900Z-fb51f47d`。
- 产品验收 run：`2026-10-31T04-30-16.494Z-5b51970b`，15/15、passed=true、stable=true。
- 产品源码：`fdbe129c70aa1c098b24f4505ba6f66b136d73c67e6699082f986d7cae8f54b3`。
- 验收源码：`b309ed0127af5b1c6b71568594ffb81ea6fa7239b7d0b97f3a53fd17b084328c`。
- 完整交付树：`4110f71108aa7a34ea4165ed1c83ec108bcb152bb8a5ce7a8bdd7fd051b5b1ed`；生产 `server.wasm` SHA-256 为 `39e22812dc79b79e1bf32ea91e65e64729b3e511c2b2979ff8070c93a3040cb4`。

### 产品回归与引擎

本轮 native CTest 11/11、根单测 40/40、工具测试 22/22、客户端单测 102/102、跨端 3/3、浏览器 78/78，以及默认入口真实键鼠/Worker smoke 均通过，无跳过。18 个引擎 runtime/scenario 组的 5 次运行逐一匹配优化前的 seed、gameplay/事件/每个包字节摘要、RNG 状态/draws、包数/字节数、实体数与重生数。两个 runtime 各自完成 5 × 10000 tick 的生命周期负载。

下表单位为 ms，箭头为 before → after；boot 使用 5 次中位耗时，其余使用 5 次 p95 的中位数，publish 使用逐 tick 发布阶段 p95。

| 指标 | Native | Node WASM | 门槛 |
| --- | --- | --- | --- |
| P02 默认初始填充 | 56.759833 → 2.929584（−94.84%） | 82.664667 → 5.963459（−92.79%） | 中位耗时至少 −30% |
| P03 50 area | 2.260041 → 0.249500（−88.96%） | 3.150459 → 0.392167（−87.55%） | p95 至少 −30% |
| P04 聚集接触 | 0.534916 → 0.248500（−53.54%） | 0.487292 → 0.342667（−29.68%） | p95 至少 −20% |
| P06 发布阶段 | 0.195958 → 0.025750（−86.86%） | 0.310791 → 0.042625（−86.29%） | p95 至少 −20% |
| 默认 idle tick | 35.842708 → 0.672333 | 44.955625 → 0.851625 | WASM p95 ≤10ms |
| 默认 moving tick | 32.801417 → 0.705417 | 46.896750 → 0.909125 | WASM p95 ≤10ms |

WASM idle/moving 的 5 轮最大 p99 分别为 1.830792 / 1.970375ms，均低于 20ms。boot/refill 的每批全树构建分别为 797 → 1、266 → 1；area 1/10/50 的 500 次更新由 500/5000/25000 次建树统一为 500 次。AI 查询阶段的复用包含在默认 tick 的实测中。

P05 的 native/WASM × 64/8192/16380 活跃 × churn 开/关，共 12 组均通过。64 活跃时 visited slots 从 16384 降到 64；密集 fallback 仍如实计 16384。密集组最大 p95 回退为 WASM 半满 +churn 的 4.4233%，低于 5% 上限；native 近满 +churn 为 2.4915%。这部分未用单个最快样本或总耗时替代 p95。

### 渲染与真实链路

每格为 `CPU p95 / rAF p95`（ms），均为 600 帧 × 5 次的中位结果，完整原始分布与 max 保存在报告。

| 场景 | Desktop | Retina DPR2 | Touch |
| --- | --- | --- | --- |
| moving-camera | 1.30 / 17.60 | 1.30 / 17.50 | 1.70 / 17.40 |
| visible-text-drops | 3.60 / 18.50 | 4.70 / 25.30 | 4.50 / 26.40 |
| gallery | 1.90 / 17.90 | 1.10 / 17.60 | 0.90 / 17.50 |
| death-transition | 1.00 / 17.50 | 0.90 / 17.50 | 1.10 / 18.30 |

文本 CPU p95 分别由 6.1/6.5/6.1ms 降到 3.6/4.7/4.5ms（−40.98% / −27.69% / −26.23%），三种配置均达到至少 20% 的目标；其余 9 组均无超过 5% 的回退。所有 60 轮 CPU p95 ≤8ms。desktop/moving 的每轮 FPS≥55、rAF p95≤20ms。DPR2/触控文本的 rAF 尾延迟仍高于 20ms，单独保留，不能据 CPU 提速宣称这些配置已稳定 60 FPS。

每帧完整世界扫描从 moving/text 的 7.001667、gallery/death 的 3.001667 统一降为 1.001667（包含测量端最终类型统计的 1 次扫描）。文本场景可见/实际绘制分别为 desktop 872/872、retina 872/872、touch 556/556；总实体始终 872，未通过减人口、DPR、分辨率或动画质量换取结果。

真实默认人口 Worker 链路的每个完整 step 请求从 3 → 1，往返 p95 的 5 次中位数为 51.4 → 2.8ms；decode+apply p95 中位数 1.0ms，所有轮次≤1.2ms。pending 峰值为 1，装备、战斗、死亡、重生全部完成且结束 pending=0。边界片段请求独立记录，不参与完整 step 的延迟/次数计算。

### 30 分钟浸泡与最终证据

实测持续 1800.6975 秒，108,046 个真实 rAF 帧，累计创建/替换 179,600 个动态 owner，记录 180 个资源/heap 采样。所有采样及结束状态均在预算内，浏览器 errors=[]，交付树和诊断 API stable=true。

- 采样资源最大值：普通标签 11、owner 107、测量 4096、路径 0、布局 0；标签 raster 估算峰值 719,404 bytes（0.686MiB），预算 32MiB。
- 删除动态掉落并等待 5 帧后，owner 回到 7，visual drops=0，pending=0，当前只绘制 1 个玩家；没有逐帧 clear 全缓存。
- 采样 JS heap 范围 4.058—28.282MiB，GC 后多次回落；结束 heap 为 28.708MiB。这里是采样值，不称为真实进程峰值或 GPU 内存。
- `reports/performance/m4-acceptance.json` 及不可变副本 `reports/performance/runs/2026-10-31T04-30-15.900Z-fb51f47d/m4-acceptance.json` 保存最终通过状态、源码/验收身份和 12 个引用文件的 SHA-256；结束时再次验证 15-gate 账本、所有日志、报告与交付身份。
- 原始 before/after：`reports/performance/{engine,client,integration}/{before,after}.json`；完整比较：`reports/performance/m4-comparison.json`；活跃索引：`reports/performance/engine/active-index-comparison.json`；浸泡：`reports/performance/client/resource-soak.json`。

### 实测限制

WASM 单 area 的 p95 从 0.094125 增至 0.143000ms（+51.93%），而单 tick p50 的 5 次中位数从 0.044208 降至 0.036458ms；此轻负载尾延迟没有改善，不把它写成收益。P03 原定耗时门槛针对 50 area，1/10/50 的建树次数门槛分别验证；未补设或放宽原来的耗时门槛。原始 5 轮 p95 分别为 0.143000/0.146375/0.154667/0.128667/0.084041ms，保留波动。CPU profile 为诊断，不能证明该回退的具体成因。Canvas raster 成本是估算，JS heap 与 WASM 高水位均不能替代进程/GPU 总内存。

### 未通过的尝试与修正

- `2026-10-31T03-50-51.999Z-c09095ae` 的产品 15-gate 已通过，但 native 发布 p95 仅降低 19.07%，近满 WASM 活跃索引 +churn 回退 6.39%，因此 M4 未通过，也未启动长时浸泡。随后以单视口线性过滤替代临时发布树，并修正密集位图维护和微基准的数组内核编译混杂；没有放宽 20% / 5% 门槛。
- `2026-10-31T04-20-26.387Z-985edb09` 在 desktop/moving-camera 的 5 次中位 CPU p95 为 1.7ms，超过 1.5ms 基线的 5% 容差后主动停止。随后共用逐帧视口边界、延后不可见实体的屏幕投影，并复用 HUD RGB 转换及直接矩阵比较；新增 f32 边界与颜色回归。未重测或覆盖冻结 before。
- 失败摘要、完整或部分日志及已生成的原始报告保存在 `reports/performance/history/attempt-<runId>/`。CPU profile 和短/单场景诊断仅用于定位，不代替最终全矩阵验收，不选取其中更快的样本作为最终成绩。
