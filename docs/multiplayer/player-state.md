# M02 玩家状态与领域接口

实现日期：2026-11-01。完整阶段验收状态/证据见 `multiplayer-goals/CHECKLIST.md`。本阶段提供进程内多人领域接口；网络会话、v2 协议和完整 PVP 归属分别在 M03—M06 验收。

## 身份和存储

- `PlayerId` 是非隐式转换的 64-bit 强类型，0 无效；`PlayerRegistry::create` 单调分配，离场后不复用。整个 World reset 才开始新的注册表生命周期。
- 注册表使用 `std::map<PlayerId, PlayerState>`，地址在其他玩家加入后保持稳定；所有玩家阶段通过 `for_each` 按 ID 升序执行。遍历期间创建/erase/clear/leave/身体出生均被拒绝，宿主在 tick 边界处理这些操作。
- `PlayerState` 拥有 profile/loadout/input/轨道/名字/速度/区域限制/DeathState/重生门槛；World 只有实体池、注册表和共享模拟域，无 `player()`/`profile()` 等隐式访问器。
- 反向索引使用完整的 `EntityHandle.raw`（含代际）。身体删除会解除索引，但保留玩家记录、最终档案、死亡统计和击杀者信息。
- `LifeEpoch` 从首次成功出生的 1 开始，之后每次成功出生递增；达到上限时拒绝出生。输入/装备命令显式接收 PlayerId + LifeEpoch，拒绝上一生命的命令。

## 宿主调用

1. 初始化 World，然后 `register_player(world, name)` 创建菜单/等待中的记录；此操作不产生 body 或游戏随机数。
2. `spawn_registered_player(world, id, life, name)` 校验自身 body 和 tick 门槛，创建身体、恢复资料并装备花瓣。重复调用不分配实体、不改资料、不消费 RNG。底层 `spawn_player` / `spawn_player_default` 同样接收显式 PlayerState，拒绝另一个 World 的状态引用。
3. 在模拟 tick 前调用 `apply_player_input(world, id, life, buttons, angle, strength)`。领域层只覆盖 latest-state，不运行物理，不维护连接序号；默认输入 TTL 为 5 tick。序号采用和 received/applied 两种确认由 M05 的 PeerSession 管理。
4. 装备命令使用 `discard_player_slot` / `swap_player_slots`；相同 ID 的旧 LifeEpoch 或死亡身体均拒绝。各 PlayerState 拥有独立的装备对象。
5. 每个房间只调用一次 `advance_world(world)`。tick 先对所有玩家完成一个玩家阶段，再进入下个阶段；AI、碰撞、时钟、共享 RNG 均只执行一次。单玩家控制函数本身也有 tick 去重。
6. 死亡身体保留既有 1000ms 尸体窗口；重生门槛为成功出生后 50 个实际模拟 tick（2500ms）。`World::destroy` 清理身体/所属槽位，`leave_player` 在 tick 边界退役所属实体后删除记录。

注册/输入/装备/离场命令都只作用于传入的 World。网络身份必须由连接绑定决定，不能从客户端任意采信 PlayerId。此处不是网络包校验器。

## 离线兼容

WorkerApi 在 init 时注册自己的 `local_player_id`，所有旧 ABI/diagnostics/snapshot 操作显式路由到该 ID。旧输入序号门禁仍只属于 WorkerApi；原先的毫秒重生门槛迁入 PlayerState 的模拟 tick 门槛。

旧离线 ABI 的移动意图按原契约持续有效，适配器明确传入 `kOfflineInputTtl`；原生多人命令默认使用 5 tick TTL。出生总会清除上一生命的输入。该兼容选择不授予未来联网入口无限输入有效期。

冻结 M00 场景还覆盖旧离线 loadout 重建后遗留的轨道实体：使用离线持久租期时，死亡/身体删除保留旧输入及轨道簿记，直到后续正常轨道处理或重生；有限租期的多人状态在死亡清空输入、身体删除清空轨道簿记。区域限制字段仅迁移归属，重生不额外重置原有计时语义。该兼容分支通过原冻结 JSON 的双进程精确比较验证，没有更新预期值。

v1 SnapshotPublisher 现在显式接收 viewer PlayerId，并按实际实体的注册表归属读取状态。它仍是旧离线发布器，仍会消费世界事件；不能用作多人广播。每连接基线、只读发布和统一 tick 清理在 M04 实现。

## 回归

`engine_multiplayer_state_tests` 只链接 engine_core，15 个场景覆盖双出生、稳定迭代、输入/资料/区域限制隔离、多输入单次控制、相同输入序号的独立宿主采用预期、TTL、死亡/重生、旧 LifeEpoch、实体槽位实际换代复用、销毁/离场和两个 World。

`same_input_sequence_is_independent` 使用测试宿主夹具分别保存 received/applied 序号，最终调用真实领域输入接口；不把夹具作为 M05 网络会话或公网校验实现。旧回归仅把隐式访问迁至明确的单玩家测试适配器；冻结的 M00 观测 JSON 保持原样。
