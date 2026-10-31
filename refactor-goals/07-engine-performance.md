# 07：引擎性能优化目标与具体实现路径

> 状态：P01—P07 已完成并验收通过（2026-10-31，Asia/Shanghai）。实施映射、同环境 before/after、确定性与已知限制见 [M4 实施及验收记录](../docs/m4-performance.md)。本页正文保留原始目标与验收定义，实测结论以该记录及绑定本次源码的报告为准。

## P01. 先补齐模拟性能基线

当前 `perf-client.mjs` 冻结 worker 并注入合成世界，只测客户端渲染。新增 `tools/perf-engine.mjs` 与一个只依赖当前引擎的 native benchmark target，并提供 wasm runner，测同样的领域场景。

| 场景 | 具体负载 | 测量范围 |
| --- | --- | --- |
| boot-population | 当前默认世界、默认种子、完整自动 population | init 与出生填充总耗时、分配、空间索引构建 |
| idle-world | 默认 population，固定输入，预热 200 tick 后测 2000 tick | 单 tick、AI、movement、effects、contact、发布 |
| moving-combat | 玩家移动/攻击，多个怪物与花瓣接触 | 目标查询、碰撞候选、死亡/掉落、快照 |
| many-area-effects | 固定实体集，1/10/50 个有效区域效果 | 索引重建数、候选数、集合差分与 payload 处理 |
| spawn-refill | 同时产生多个 band 缺额并补充，含会创建 children 的物种 | 每批与每只出生耗时、索引更新、RNG draws |
| lifecycle-soak | 反复出生、战斗、死亡、拾取、重生，至少 10000 tick | 峰值/结束内存、未回收会话/缓存、失效 handle |

报告写 `reports/performance/engine/<runId>.json`，记录机器、编译器/优化参数、native/wasm、源码与交付身份、种子、输入脚本、活跃实体数及可见数。至少输出 mean/p50/p95/p99/max，不把 native 数值当浏览器 wasm 数值。

增加可关闭的阶段计时与工作量计数：实体访问、`SpatialQuery::from_world` 次数、树 insert/update/query、候选对、窄相交、查询临时容量、快照 bytes 与字段数、allocator 次数/高水位。计时器不默认留在发布热路径。

同环境每个场景至少重复 5 次，比较中位数和分布；记录噪声。默认 wasm 20Hz 目标为 tick p95 ≤10ms、p99 ≤20ms，50ms 是必须留余量的步长而非理想耗时。若基线未达标，明确列出差距；不要降低负载或删场景“通过”。

## P02. 出生流程消除每只实体重建全世界索引

源码位置：`spawn.cpp::populate_world/spawn_population_band` 在出生循环里调用 `SpatialQuery::from_world(world)`；每次从 16384 槽位扫描活跃实体并重新插树。默认 population 规模下存在显著的重复构建工作，实际耗时待测。

具体操作：

1. 一次出生批次建立 `SpawnQueryContext`，复用 `SpatialQuery`、候选缓冲和 arena bounds。
2. 每次成功出生后增量加入本次真正新增的所有碰撞体，包括 Ant Hole 子体、Centipede 段等；不能只加入函数返回的根实体。
3. 批次内实体移动、销毁、半径变化必须反映到 index；若出生过程中现有对象确实不会变，只需处理新增，但需要产品测试确认这个前提。
4. 保留 weighted choice、100 次 clear-position 尝试、失败处理和 RNG draw 顺序；索引加速不能增加或减少随机试验。
5. 把无意复制的 SpawnTable/临时 vector 变为只读引用与复用缓冲；缓存按 arena/规则版本失效。

验收：初始填充和单批补充的全树构建次数从“每只出生一次”降到“每批一次”；相同种子/输入的出生 handle、位置、kind/type 与 RNG 状态保持一致。性能目标为默认初始填充中位耗时至少降低 30%，以同环境基准确认；若未达到，保留计数改善与原因，不虚报收益。

## P03. AI 与区域效果按有效阶段复用查询

源码位置：`ai.cpp::alert_nearby/find_target` 的便捷路径创建查询；`effects.cpp::World::update_area_effects` 在逐 area 循环中创建全世界查询，并复制/排序多份目标数组。

目标修改：

- 为 `update_ai` 创建明确的 phase query context，将查询以引用传给目标/仇恨辅助函数；便捷的“构建并查询”接口只留非热路径，调用点命名要显式。
- `update_area_effects` 先判断有无有效 area；没有时不构建索引。有时对相同几何版本只建一次，由各 area 复用。
- 不能把一个 tick 的树无条件共享给所有阶段。定义 geometry revision/阶段边界，出生、销毁、坐标/半径、owner/attached child 变化触发更新或失效。
- AI 攻击回调/效果回调可能产生实体；为这些变化设明确同步点。跨同步点使用旧缓存须由现行语义证明，不能只因 tick 没变就复用。
- 各 area 目标已按 handle 排序时，使用线性 merge/difference 计算 added/removed，替代多次 binary_search 加逐个 erase/remove；payload attach/detach 的调用顺序保持原有规则。
- 复用 candidates/alive/added/removed scratch，避免每个 area 建一组 vector；不要把 scratch 存成跨 World 的静态全局。

验收：无几何变化的区域效果阶段最多一次全树构建；有效 area 从 1 增至 50 时，构建次数不随 area 线性增长；进入/离开、owner 销毁、payload 过期和重复目标都符合产品测试。50-area 场景阶段 p95 目标下降至少 30%。

## P04. 碰撞候选采用连续 scratch，保留预先冻结的查询语义

源码位置：`combat.cpp::update_contact_tree/resolve_contacts` 每次收集 bodies，分配 `present`、16384 长 `body_by_slot`、`vector<vector<size_t>> tree_order` 与多个 candidates/order。

操作顺序：

1. 按 04 把树和缓冲移进 `CollisionContext`，让 present/body_by_slot/bodies/candidates 容量长期复用。
2. 同一 contact phase 只收集一次 bodies；更新树和求解使用相同的 body 视图，保留 active/health 的即时二次检查。
3. 用 generation stamps 或触及槽位清单清空映射，减少每 tick 初始化整块 slot 索引的成本；正确处理 stamp wrap 与 world reset。
4. 将 `tree_order` 改为连续候选池加每个 body 的 offset/count，避免每个 body 单独 vector 分配。
5. 候选必须在求解前按现有规则冻结。当前代码先给全部 body 查询候选，再解接触；直接改为“处理一个 body 时按被前面接触推开的新坐标 query”会改变候选集，不属于等价优化。
6. 保留树 query 的候选顺序、`second > first` 排重、实体活性检查和窄相处理顺序。不能为了并行或排序稳定随意重排 contact。
7. 原版调试策略随 04 归档后，删除相关 O(N²) 的实验枚举/距离排序分支；产品默认 quadtree 策略仍要通过聚集/边界场景测候选数量。

验收：稳态 contact phase 不再按 body 产生堆分配；固定场景的 contact 顺序、伤害、位置和随机状态不变。聚集场景 p95 目标下降至少 20%；必要时用候选数、容量与分配次数证明收益来自何处。

## P05. 以保持槽位顺序的活跃索引减少全池扫描

源码位置：EntityPool 容量 16384；tick、movement、effects、spatial、population、发布、状态 dump 多次遍历完整 `entities()` 后检查 active。

目标：

1. 在 EntityPool 内维护活跃 bitset 或有序索引，allocate/release 同步更新；迭代结果保持现有升序 slot 语义，不用 swap-remove 向量随意重排。
2. 提供 `for_each_active` / 有序迭代器；按收益逐个迁移扫描密集的系统，不一次改遍所有代码。
3. 明确实时迭代与 phase 快照语义。当前数组遍历中新增的更高槽位实体可能在同阶段被看到；优化后不能一律先截一份 active handle 列表而改变该行为。
4. `active_count`、full reset、reserved slots、generation wrap、池满与销毁中迭代都要测试。
5. 若按类别额外建立 mob/petal/projectile 索引，收益必须覆盖维护成本；先做 active bitset，不立刻整体改为 ECS/SoA。

目标为低活跃率场景显著减少被访问槽位；报告 actual active 与 visited slots。高活跃率和频繁 allocate/release 场景 p95 不得回退超过 5%，否则调整或不合入该方案。

## P06. 快照发布减少重复边界、全树构建与哈希查找

当前 `domain_snapshot_bytes` 新建发布用 QuadTree，逐实体计算 `peer_body_bounds`；查询候选后再次计算边界；session 还用多个 map 缓存不同字段。

具体目标：

- 一个发布阶段为每个需要的实体计算一次含 attached children 的边界，复用到树插入与交集过滤。
- 边界缓存以实体 generation、坐标/半径、children/attachment revision 为键；子体变化向父链传播失效。保留既有 f32 union 的计算顺序，不用改变结合律的合并方式。
- 优先阶段内缓存，再根据测量决定是否维持跨 tick 发布树；接触树与发布树的半径、边界、可见性职责不同，不能直接共享一棵树。
- 按 04 合并 ReplicationSession 的多份 map；对当前已知实体按 handle 一次查找取得完整上次发布状态。
- pending deletes/events 通过统一变化日志消费，减少 `send/think` 在前后扫描世界差集；离开可见集与物理销毁仍为不同事件。
- ByteWriter 复用容量；首次全量、稳态 delta、可见集重入分别记录 bytes/fields，不通过省略必要字段获得性能数据。
- output queue drain 保持 move；检查 `g_flushed` 的容量复用。不要在 WASM 内存上直接转移 ArrayBuffer，跨 Worker 的安全 copy 仍需要。

目标：阶段内重复边界计算降为每实体一次（依赖子体计算去重），稳态 session map 查找和分配减少。发布 p95 目标下降 20%；包大小不增加，初始/重入/死亡/拾取语义不变。

## P07. 通过产品确定性与 soak 接受优化

原版 parity 退出后，用当前项目的固定 seed + 输入脚本记录产品契约状态摘要：包含 gameplay state、RNG state、事件和关键发布结果；只针对声明应保持不变的部分做 before/after 比较。

- 每项优化独立提交并给出对应负载的优化前后报告；允许未被选中的方案被删除。
- 不提高模拟步长、不降低人口、不跳 AI、不减少绘制或发布频率以换取表面性能。
- 50ms 步长、浮点规则、RNG 消费与接触顺序不在本轮性能变更内。
- lifecycle-soak 结束时，活跃实体、缓存数量、队列和内存保留均与场景预期相符；WASM linear memory 高水位可能不回落，不以该数值单独判断泄漏。
- 每个收益门槛若因基线已很低或噪声无法可靠确认，提交计数证据和测量限制；不将未经测量的目标百分比写成结果。
