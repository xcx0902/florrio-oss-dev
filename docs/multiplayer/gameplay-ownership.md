# M03 玩法归属与原生 PVP

实现日期：2026-11-01；阶段验收和报告见 [执行清单](../../multiplayer-goals/CHECKLIST.md)。本阶段完成进程内共享 World 的 FFA 玩法；WebSocket、每连接复制和浏览器联机入口分别依赖 M04—M06。

## 三种归属

- `Entity::owner` 是带代际的物理 owner handle，用于附件、空间关系和原有销毁时重挂接。
- `controlling_root()` / `same_controlling_root()` 保留最多 16 链的既有控制根语义，供接触免伤和 AI 目标资格使用。攻击实体另外保存创建时的 `control_root` 与 `world_controlled`；物理父实体消失后，仍能识别原控制体和普通野怪的隐式世界控制体，自家宠物的在途投射物也不会伤害主人。无效/过代 handle 不解引用，环在既有 16 步上限处终止。
- `DamageSource` 是值快照：来源实体 handle、来源 body handle、PlayerId、LifeEpoch、来源种类/类型和昵称。`damage_source()` 查询，`owning_player_id()` 返回持久玩家身份；旧 `owning_player()` 只解析仍存在的 owner 链。快照不持有 Entity/PlayerState 裸指针。

出生在绑定 body、设置昵称和递增生命代次后保存来源；花瓣、孵化宠物、Peas 子弹、Web 地面实体、物种投射物由服务端创建流程调用 `inherit_entity_owner()` 继承。Peas 分裂和 Web 留下的物理 owner 仍是花朵，来源身份不会随物理重挂接改写。命中回调从真实花瓣取来源，不接受调用者传入的任意玩家作为归属。

`damage_entity_from_source()` 与 `kill_entity_from_source()` 消费已保存来源。普通直接伤害入口从实体查询来源；DOT 在效果创建时保存来源，命中事件、目标最后伤害和玩家 DeathState 留存同一份归属。接触对在执行双方伤害前先保存两个来源，不重排求解器。

来源消失后，既有 DOT 继续使用创建时的昵称/PlayerId；怪物 XP 通过 `award_player_experience(World&, PlayerId, f32)` 发给仍在注册表中的真实玩家。已离场身份的奖励不转发，PlayerId 在房间内不复用。击杀玩家仍不新增 XP/金币。

## 效果、生命周期与事务

效果保留原有 `(type, source handle)` 刷新键，花瓣效果仍按物理 owner 合并；独立的 DamageSource 保存真实攻击实体，避免改成每颗花瓣叠加而改变数值。最强毒伤、Honey 的减速、Web 多实例叠加和 Cactus incoming poison 都保留既有规则。效果 ID 改由 World 分配，两个房间不共享计数器。更新期间强持有本轮 payload，死亡回调即使销毁其他装备/区域，也不会留下悬空 payload 指针。

死亡先设置 `death_processed`，保存目标玩家资料，再执行原有掉落算法、装备清理和 1000ms 尸体窗口；对子实体继续传递同一个 DamageSource，不将已销毁来源退化为裸 handle 重新查询。重复 damage/kill、尸体清扫与离场不重结算。生命冷却从成功出生起算 50 tick，同时等待 body 尸体删除；新身体使用相同 PlayerId、递增 LifeEpoch 和新 handle。TTL、旧生命输入/装备拒绝沿用 M02。

拾取在原有 70u 半径和出生 grace 内筛选有空间的存活玩家，按距离、PlayerId 升序选唯一胜者；再次确认槽位后写库存/装备，绑定 recipient PlayerId 和当时 body handle，记录一次转移。已经提交的物品不会因转移动画期间死亡/离场退回或转给另一人；动画继续跟随原尸体，handle 失效后停止跟随，drop 到 2000ms 转移期限正常删除。

离场按保存的 PlayerId 清理全部所属实体，即使 body 已删除、投射物已脱槽或附件已重挂接也不会遗漏。销毁区域 owner 会立即解除共享效果并回收区域记录；移除延迟发射孩子会修剪空调度项。死亡掉落是世界物品，不跟随玩家离场清理。

默认出生仍使用原地图、等级带、RNG 和占位规则，搜索最多 1000 次；每次搜索读取同一个空间索引。无安全位置时返回无效 handle，PlayerState/LifeEpoch/实体数不变，其他玩家继续 tick。失败搜索消耗实际尝试的 RNG，不执行稀有初始花瓣抽签。

## 实际花瓣能力核查

目录非空类型 **1—38 全部**进入 `catalog_equipment_ownership_and_recharge`：双玩家分别装备、输入、owner、实例损坏/目录充能、错误命令和丢弃隔离。以下为在现有系统中实际实现的行为；本阶段不根据物品名称补造能力。

| 类型 | 当前行为 | 补充回归 |
| --- | --- | --- |
| 1—5、7、16、17、26、27、35 | 目录接触数值、普通/多实例轨道、Heaviest 质量 | 双向花瓣命中、本体等级 1/5/6/10 全组合、目录充能 |
| 6、15、24 | Rose 单/多实例靠近、治疗、消耗 | 三种治疗只作用于真实 owner，B 实例不变 |
| 8 | Iris 毒 | 来源销毁、body 删除、实际槽位换代和离场后 DOT 身份 |
| 9 | Wing 波动轨道 | A 攻击、B 防御的不同半径 |
| 10、19、20 | Missile、Pollen、Dandelion 发射/寿命；Dandelion 禁疗 | 单方输入只发射/充能己方，禁疗来源 |
| 11、12、34 | Peas 分裂、延迟发射；后两者毒 | 母体销毁后四孩子继承身份，只发射一次 |
| 13、21、33 | Cactus 最大生命；21 毒与 incoming poison | 生命/充能按玩家读取，自家碰撞不施加反击毒 |
| 14、28 | Faster / Yin Yang 轨道相位 | 单方倍率/方向，B 相位不变 |
| 18 | Bubble 防御触发推力/消耗 | 推力只作用于 owner |
| 22、23 | Egg 孵化两种宠物、宠物槽位/AI | 不攻击自己，可攻击 B；嵌套物种投射物来源、zone 清理隔离 |
| 25 | Antennae 隐藏实体、公开外观标志 | 不生成轨道实体、仅刷新所属玩家外观；相机仍由旧离线发布器处理 |
| 29、30 | Web 发射、死亡生成地面区域、减速 | 地面实体/共享 payload 归属，三实例保留叠加，销毁即解除效果 |
| 31 | Honey 减速 | 同玩家多颗花瓣刷新一次，真实来源快照独立保存 |
| 32 | Leaf 被动治疗 | 所属玩家生命恢复，B 不继承加成 |
| 36、37、38 | Salt、Rice、Corn 当前只实现目录数值与普通轨道/接触 | 覆盖当前行为；未新增 Salt 反伤、Rice 特殊回充或 Corn 额外被动，不能宣称实现这些额外能力 |

玩家花瓣相互接触仍跳过；低等级本体接触系数仍可为零，公式只用于双方玩家本体。怪物、花瓣、宠物、投射物、毒都沿用各自规则。

## 验证入口

`engine_multiplayer_combat_tests` 的 17 个场景及 `engine_multiplayer_lifecycle_tests` 的 9 个场景均只链接 engine_core，已接入现有 engine/server-native 封闭 CTest 清单与完整验收门禁。生命周期场景包含真实花瓣命中→死亡→唯一拾取→重生、同时致死、100 次生命（含 Egg/Peas/Web/effect 清理）以及两个 World 交替推进的事件/分数/RNG/payload ID 对照。

现有源码身份包含 engine 源码/头文件和 CMake；verification identity 同时包含新测试、夹具及清单，无额外绕过校验的启动入口。M00 冻结单玩家 JSON 保持不变；M03 完成仍要求整个既有 17 gate 通过。具体命令、runId、产物哈希、ASan/UBSan 和失败记录见执行清单。
