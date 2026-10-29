# 04：收敛引擎职责，移除历史实现与重复状态

> 状态：待实施。优先整理当前 C++ 产品路径；行为与性能优化分开提交。

## E01. 将 WorkerApi 收敛为应用边界

`engine/src/net/worker_api.cpp` 约 1101 行，目前同时负责输入命令、世界初始化、旧 skeleton、原版测试快照、原版客户端适配、当前 domain 发布、可见集、delta 缓存以及大量字段注入 API。

按以下职责拆分，避免把一个大类变成多个共享同一堆裸字段的文件：

| 现有内容 | 处理 | 建议落点/接口 |
| --- | --- | --- |
| `init/send/think/flush` | 保留为协调层；不直接逐字段编码 | `WorkerApi`，依赖 World、InputDispatcher、SnapshotPublisher |
| `domain_snapshot_bytes`、`enqueue_domain_snapshot` | 提取当前唯一发布器 | `net/snapshot_publisher.{hpp,cpp}`，`publish(world, changes, session)` |
| `domain_known_`、viewer、camera/angle/score/loadout 缓存 | 由当前发布器拥有 | `ReplicationSession`，生命周期 reset/forget/reenter 明确 |
| `snapshot_bytes`、`enqueue_snapshot` 的旧 skeleton | 迁移消费者后归档 | 不保留运行时 fallback |
| `original_snapshot_bytes/next` 的实验路径 | 所需产品编码测试改为直测 codec 后归档 | 不继续维护“另外一套当前快照” |
| `original_client_snapshot_bytes`、`flush_original_client`、所有 `original_client_*` | 原版兼容实现和测试一起归档 | 删除 `original_snapshot.cpp` 运行链接 |
| `set_snapshot_*`、`set_component_presence`、full-field fixture 注入 | 从生产对象移入测试构造器或测试专用适配层 | `engine/tests/support/snapshot_fixture.*` |
| `dump_state`、调试实体字段等 | 按真实产品诊断/测试需求区分 | 统一 diagnostics 模块；原版比较专用导出归档 |

`ReplicationSession` 使用一个结构保存每个 handle 的历史发布状态，代替多个并行 map 分别持有 camera、score、angle、loadout。需要区分“没发过”和“已发值为 0”，不能用默认零替代存在标记。

具体不变量：未 join 不发布空间实体；死亡后保留 viewer；重新进入可见集发送完整初始值；销毁/代际更换使缓存失效；一次 flush 排空队列，不重复消费事件。

## E02. 统一当前快照 codec，移除按实验成长的 API

当前 `snapshot_header.cpp` 约 702 行的 `OriginalSnapshotWriter` 实际参与当前产品输出，必须保留在用能力。目标将其重命名为 `SnapshotEncoder`，对应文件改为 `snapshot_codec.*`，并完成：

1. 提取字节/bit/varint/string/数组写入的基础操作，保证只有一处字节序与对齐实现。
2. 由生成协议描述字段 ID、wire 类型、数组宽度、dense group；采用编译期表或清晰的 typed helper，避免为同种编码维护大量仅 field ID 不同的方法。
3. `write_mask_float_field5/27/45`、`write_mask_double_field18/35` 等若只是参数差异，合并为带校验的 typed field 写入；有特殊 framing 的方法保留独立实现并命名其语义。
4. 将聊天/命中/拾取等 event 编码集中；领域层提交类型化事件，由发布器决定可见性和消费时机。
5. 移除仅覆盖旧实验字段的 `SnapshotValues` 巨型结构及 `array<array<...>,64>` 注入表。协议仍支持的字段类型通过小型 codec fixture 验证，不需给每个生产实体配置全类型缓存。
6. 现行 sparse 与 dense 都属于产品协议能力，不因归档而一次删掉。先列实际发布/解码消费者，再合并重复 helper；协议裁剪另做有版本的变更。

验收采用手工字节向量及 C++→TS 集成；不通过重新加载原版验证，也不把相同的 encoder 当作测试 decoder。

## E03. 拆分 World 与实体池，减少“头文件包含全世界”

`world.hpp` 约 647 行，顶部直接实现 EntityPool，还容纳事件、区域效果、延迟发射、输入、档案、死亡和调试记录。

目标操作：

- 将 `EntityPool` 移为 `model/entity_pool.hpp` 与必要 `.cpp`，保留 handle/generation 和 FIFO 分配规则；活跃索引优化在 07 单独实现。
- 将 `World::reset/initialize/destroy` 等非平凡函数移到 `engine/src/model/world.cpp`，公开头只保留必要接口和所有权声明。
- 将 `HitEvent/AreaEffect/DeferredLaunch/PlayerInput` 等独立记录放入对应领域头，避免使用任一记录都包含完整 World。
- 区分世界权威存储与临时 scratch；不为每个小结构引入堆分配、PIMPL 或基类层次。
- 统一 world reset：实体、loadout、效果、事件、索引、发布会话和缓存都需有明确 reset 所有者，禁止由调用者猜测顺序。
- `World::destroy` 成为统一销毁通知入口：删除事件、owner/children、AI 列表、空间缓存、active index 等由此失效，避免 `send/think/despawn` 各扫描一次找消失实体。

重点检查 `components_`、`ComponentStore` 与 `SimulationFrame`：静态检查显示前者主要是访问器和历史单测，后者在 `advance_tick` 写 tick/time、其原始 scratch 仅见历史布局测试。确认传递消费者后，将原版池/1152-byte frame 归档；当前 tick/time 保留为明确字段，不维持一份只为还原原版内存而存在的镜像。

若提取后发现任一字段确有产品消费者，先迁移其产品职责再删除；不能以“看起来像逆向”直接移走 `World` 使用中的对象。

## E04. 碰撞逻辑拆出死亡与实验状态

`sim/combat.cpp` 约 675 行，包含死亡/掉落、碰撞树、接触求解和全局 contact debug。具体拆分：

1. 死亡归属、经验、保留物与子实体处理迁为 `sim/death.cpp`；与已有 `damage.cpp`、`loot.cpp` 明确边界：damage 修改健康并产生死亡，death 调用掉落/档案规则。
2. 碰撞树和 body 收集放在 `CollisionSystem`；几何基础仍在 `collision.cpp`，层过滤仍在 `collision_filter.cpp`。
3. `contact_tree()` 的静态 tree、`tree_world/tree_identity/tree_tick` 移到世界拥有的 `CollisionContext`，避免不同 World 共享一个缓存而反复失效。
4. 归档 contact order 0–5 和 7 的历史实验算法；产品只保留当前默认策略 6，并将必要的接触顺序回归写为产品规则。
5. `contact_debug` 目标、512 条记录和人工切策略导出移到测试/诊断构建；默认求解循环不处理已停用实验分支。

此阶段保持候选顺序、树 compact 时机和伤害顺序；移除 `tree_order` 临时分配属于 07 的优化，不和文件移动一起提交。

## E05. AI 与花瓣按行为拆分，共用领域查询

`ai.cpp` 约 846 行。建议保留 `update_ai` 为阶段入口，将目标资格/归属链/仇恨选择、物种 steering profile、攻击 timer/callback 拆为 `targeting.cpp`、`ai_profiles.cpp`、`ai.cpp`；已有 `species_attacks.cpp` 持有发射攻击，不再复制到 AI 内。

检查 `ai.cpp`、`combat.cpp` 和 `worker_api.cpp` 中重复的 owner/root/child 遍历。仅把语义相同的查询合并到 `model/entity_relations.*`：

- 不同 guard、允许尸体与否、跨代 handle 检查须保留为显式参数或不同名称。
- 不用一个布尔参数很多的万能函数混同 killer 归属、AI target root 和几何 child union。
- 把循环保护和失效 handle 行为写入测试，避免只按代码形状合并。

`petals.cpp` 的默认表查询先按 03 统一；行为实现按轨道、生成/充能、特殊效果划清与 `player_loadout.cpp`、`petal_effects.cpp`、`passives.cpp`、`pets.cpp` 的边界。新增花瓣应添加数据与一个局部行为，而非在多个位置同步改 switch。

## E06. ABI 只做转换，诊断有明确边界

`engine/src/wasm/abi.cpp` 约 560 行，除核心函数外还导出大量原版追踪所需状态。目标：

- `abi.cpp` 保留初始化、输入、推进、flush、取输出和内存边界；不写 species 规则或重复状态摘要逻辑。
- 原版 adapter 的 `sp_server_flush_original` 删除；原版严格比较使用的 RNG/phase/contact/大量字段读取器连同调用脚本归档。
- 当前 `?cheat` 的设置花瓣、生成怪物、移动位置等仍是产品已有能力：集中到命名清楚的 `diagnostics/commands.*`，只保留其实际需要的导出，不在本次重构中暗中取消该功能。
- 产品自动化所需测试注入独立配置，发布构建不携带原版比较专用探针；native 测试直接调用领域对象。
- 所有编译源与导出由 06 的统一配置生成，避免在头文件、em++ 参数和 worker switch 中分别维护三套事实。

## E07. 验证与完成条件

- [ ] WorkerApi 不再拥有原版客户端状态、旧 skeleton writer 或全字段实验注入 map。
- [ ] 当前快照只有一个发布器，session 的 reset/销毁/重入行为都有回归。
- [ ] `World` 拥有碰撞缓存；两个独立 World 交替 tick 的结果与各自单独推进一致。
- [ ] 核心公开头不再包含原版生成内存视图；删除历史布局模型后当前领域测试仍成立。
- [ ] 原版专用 ABI 导出为零；现行 Worker 与保留的 cheat 能力正常工作。
- [ ] 产品 CTest、C++→TS 协议集成、出生/战斗/死亡/拾取/重生回归通过。
- [ ] 结构提交不混入数值常量、RNG、50ms 步长或接触顺序的行为变更。
