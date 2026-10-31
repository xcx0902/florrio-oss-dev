# M02：把单玩家 World 改为多人 World

状态：未开始。依赖：M01。产出：原生进程内，同一 World 的两个玩家能独立出生、移动、更新装备并保持状态隔离。联网前先完成本阶段。

## 02.1 新模型

计划新增：

- `engine/include/engine/model/player_id.hpp`：强类型 PlayerId，0 无效；房间生命周期内不复用 ID。
- `engine/include/engine/model/player_state.hpp`：玩家权威状态。
- `engine/include/engine/model/player_registry.hpp` 与对应 `.cpp`：注册、查找、稳定迭代、反向 body 索引。
- `engine/include/engine/sim/player_commands.hpp` 与对应 `.cpp`：接收显式 PlayerId 的领域命令入口。
- `engine/tests/unit/test_multiplayer_state.cpp`：本阶段原生回归。

PlayerRegistry 使用能提供稳定 PlayerState 地址的存储，按 PlayerId 升序执行玩家阶段。不得依赖 unordered_map 的遍历顺序，也不得在 registry 扩容后保留失效引用。生命周期结构修改统一在 tick 边界处理，迭代中不直接 erase 玩家记录。

## 02.2 字段迁移表

| 当前 World 内容 | 新归属 | 备注 |
| --- | --- | --- |
| `player_`、`player_name_`、`player_speed_` | PlayerState | body handle 可为空，身份仍存在；新增 LifeEpoch 区分重生前后 |
| `input_` | PlayerState | 含最后采用 tick 和输入有效期；网络序号在 PeerSession |
| `profile_`、`loadout_` | PlayerState | 不允许多个玩家引用同一装备对象 |
| `petals_` 轨道簿记 | PlayerState | 脱离轨道的实体仍由 World 实体池拥有 |
| `zone_timer_ms_`、`zone_progress_`、`zone_disabled_` | PlayerState | A 触发限制不能禁用 B 的花瓣 |
| `last_death_*`、`last_killer_*` | PlayerState.DeathState | 重连和尸体删除后仍可读取 |
| `next_spawn_time_ms_`（WorkerApi） | PlayerState | 改为服务端 tick 门槛，保留 2500ms 规则 |
| entities、collision、RNG、time/tick、地图尺寸 | World | 全房间共享且每 tick 只推进一次 |
| area effects、deferred launches、AI/掉落注册表 | World | 记录所需来源/所有者，不能绑定当前玩家 |
| 已知实体、可见性、delta 缓存 | PeerSession/ReplicationSession | M04 从 World 发布语义中移出 |

## 02.3 执行步骤

1. 先加入 PlayerId、PlayerState、PlayerRegistry，使用一个玩家测试证明可创建、查询、删除；建立 `body handle → PlayerId` 索引，并验证 handle 代际。
2. 把 World 单份 profile/loadout/input 等字段移到 PlayerState。过渡适配器可以持有自己的 `local_player_id`，通过 `world.players().get(id)` 访问；World 本身不提供猜测「当前玩家」的隐式访问器。
3. 将 `spawn_player/spawn_player_default/make_respawn_profile` 改为接收显式玩家身份/状态。已有身体只阻止同一个玩家重复出生，不阻止另一个玩家加入。
4. 拆分「创建玩家记录」和「创建身体」。一个玩家进入菜单/死亡/重连时记录仍可存在；`spawn` 只创建新的 body、递增 LifeEpoch，并清空旧生命的待用输入/命令，不能重置整个 World。
5. 把 `World::apply_input` 改为作用于指定 PlayerState；输入采用由宿主在 tick 前完成，领域层只保存按钮/方向/强度和有效期。不把解码一次输入等同于推进一次运动。
6. 把 `apply_player_controls` 改为单玩家函数加稳定的全玩家阶段入口。每个玩家每 tick 最多施加一次控制；一个玩家一帧发送多次移动意图只改变最新状态。
7. 迁移 `regenerate_players`，按每个 entity 的 PlayerId 读取真实等级、Leaf/最大生命加成和阻疗效果，不能继续给所有玩家套用同一 profile。
8. 按 sim/tick.cpp 原有阶段迁移 zone、loadout phase、recharge、orbit 和被动效果：每个阶段遍历全部玩家，怪物 AI/碰撞/世界时间仍执行一次。特殊花瓣的完整归属在 M03 验收。
9. 改造 `World::destroy`：销毁身体时仅使对应 PlayerState.body 失效；销毁花瓣只修改所属玩家的槽位。保留玩家档案和 DeathState；房间 reset 才清理全体玩家。
10. 改造离线 WorkerApi：拥有一个固定 local PlayerId，将现有 send 命令显式路由给它。保留旧输入序号和离线 ABI 契约，不将旧 decoder 当成公网输入校验器。
11. 新增 native test support：`make_world(seed)`、`join_player(name, position, profile)`、`apply_player_input(id, ...)`、`advance_ticks(N)`；辅助层只调用真实领域接口，不复制游戏规则。
12. 审计并清除引擎 sim/model 中残留的单玩家调用。执行 `rg 'world\.(player|profile|loadout|input|petals|last_death|zone_)' engine/src`，逐处判断归属；不得用新增的隐式 getter 让搜索表面消失。

## 02.4 生命周期与输入边界

领域生命周期：`registered → alive → dying/corpse → respawnable → alive`，最终由宿主显式调用离场清理。连接状态不混入生命状态；一个断线玩家可以仍 alive，也可能在断线期间死亡。

出生处理顺序：校验 PlayerId → 校验自身 body/尸体/冷却 → 选择合法出生位置 → 创建 body → 装备花瓣 → 更新自身门槛 → 产生控制对象变更。重复 spawn 是幂等拒绝，不再分配 body，不再次消耗掉落或重生资料。

输入采用顺序由 M05 的 PeerSession 决定；M02 的测试直接指定身份，至少覆盖 A/B 相同序号不互相阻塞的宿主接口预期。`lastReceivedInputSeq`、`lastAppliedInputSeq` 不允许用同一个字段代替。

## 02.5 必须通过的回归

| 测试 | 验收断言 |
| --- | --- |
| `two_players_spawn_in_one_world` | 两个不同 PlayerId 和 body；共用同一实体池 |
| `controls_are_isolated` | A 右移、B 左移；停止 A 不改变 B 的输入 |
| `many_inputs_one_tick_one_impulse` | 多条移动输入不能制造额外模拟步或加速度 |
| `profiles_are_isolated` | 不同等级/生命/槽位/库存互不复制 |
| `zone_state_is_per_player` | A 区域限制不影响 B |
| `destroy_body_keeps_player_record` | A body 删除后 A 档案保留，B 完全不变 |
| `spawn_is_idempotent` | 重发出生不会生成第二个身体/花瓣组 |
| `stale_body_handle_is_rejected` | 槽位复用后旧 handle 不指向新身体 |
| `single_player_regression` | 原有单玩家移动与阶段顺序仍符合基线 |
| `two_worlds_do_not_share_players` | 相同 PlayerId 在两个房间完全隔离 |

## 02.6 完成条件

- [ ] World 中不再存一份隐式全局玩家状态。
- [ ] 核心玩家系统参数带显式身份，出生/输入/销毁无串号。
- [ ] 同 World 双玩家原生测试通过；既有单玩家适用回归通过。
- [ ] 没有「逐玩家重复执行整个 world tick」或 current-player 切换实现。

建议提交顺序：ID/registry → 字段迁移 → 出生与控制 → 全阶段迭代 → 生命周期与离线适配 → 回归清理。
