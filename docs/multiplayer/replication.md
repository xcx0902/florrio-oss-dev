# M04 协议与每连接复制

M04 实现字节与状态契约。原生 WebSocket、房间调度、密码学 token/grace 管理属于 M05，浏览器真实入口接入属于 M06。当前宿主仍只运行有限 tick smoke。线格式见生成的 [v2 协议](../multiplayer-protocol.md)，参数来源见 [配置契约](configuration.md)。

## 生成与字节边界

`schema/multiplayer.yaml` 描述 envelope、11 种消息、嵌套记录、有限上限和字段可见性；统一生成器生成 C++ header、TS 模块和协议文档，全部进入 `generated-outputs.json`。目录哈希由 schema catalog 输入生成，`validate_hello()` 分别返回版本、目录、格式错误。新增协议没有 Worker funcName、XOR、诊断 RPC 或客户端 PlayerId 选择器。

一条 binary WebSocket message 对应一个 16-byte `FLR2` envelope。所有数值显式 little-endian，字符串与变长数组使用有界、规范的 u32 LEB128 长度；固定数组不带长度。解码拒绝未知类型/flags、错误方向/版本、长度不符、尾随字节、非法 UTF-8/控制字符、非有限浮点、超大数组和过长 varint。Hello epoch 为 0；Welcome 的 payload/envelope sessionEpoch 必须相同；后续绑定由会话验证。RoomEpoch 为非零 16 bytes。RoomEpoch 和 token 的安全随机生成及生命周期由 M05 宿主负责，不能取 World RNG。

`multiplayer_wire.*` 负责严格 primitive 和完整公开实体块校验；生成 codec 按字段调用它。v1 `snapshot_codec.*` 继续服务离线 Worker，并增加只包含公开组的 dense writer。v2 `EntityUpdate.fields` 复用既有实体字段 codec，每个块独立携带声明，固定内部 sequence=1、ack=0，没有内部删除或事件。它不是一个可猜测版本的顶层 Worker envelope。

## 单 tick 调用顺序

以下 API 全部在房间模拟线程调用；网络回调只提交拥有数据的命令。

```cpp
// 接受 Hello 并选择该房间的 PlayerId 后创建新会话；旧会话 invalidate。
engine::net::PeerSession peer(world, viewerContext);

// 一个房间推进一次，与连接数无关。
auto results = peer.execute_commands(world, chatRecords);
peer.prepare_tick(world); // 每个会话各一次，然后统一 advance_world
engine::advance_world(world);
auto changes = engine::net::freeze_tick_changes(world, chatRecords);
// freeze 失败：显式失败/关闭；不能截断事件后继续发 delta。
auto packet = engine::net::publish(world, *changes, viewerContext, peer.replication);
// 对其他会话使用同一份 changes，完成所有构建/入队后：
engine::net::finish_tick_changes(world);
```

示意只显示一个会话，M05 必须先执行所有连接的命令/输入，再推进一次 World。`world.tick()` 在边界上表示下一个尚未执行的控制阶段编号；`advance_world()` 完成后递增。`Snapshot.serverTick` 为完成后的计数，`inputAppliedTick` 为实际控制阶段编号，因此首个输入在阶段 0 被采用、可出现在 serverTick=1 的快照中。0 在 inputAppliedTick 是合法值；是否已采用由非零 lastAppliedInputSeq 区分。

`freeze_tick_changes()` 每个模拟 tick 只调用一次，并在之后禁止新的领域修改，直到统一 finish。它复制删除、命中、拾取和带发送者的聊天记录，给事件分配 `(serverTick, ordinal)`。发布顺序可交换。`publish(const World&, ...)` 只能修改传入的复制会话，构建失败不提交会话；返回的字节独立拥有内存。finish 不修改奖励或 RNG，也适用于没有观察者的 tick。

World 不再保留观察者 known/pending hit 缓存；未被任何观察者看见的目标同样记录领域命中。旧 `SnapshotPublisher` 也改为只读 World，离线 `WorkerApi` 在自己的唯一发布完成后统一 finish，保留 v1 单消费者行为。

## 连接身份与输入确认

`PeerSession` 绑定一个 World 实例、PlayerId、RoomEpoch 和 SessionEpoch。构造只在握手已被宿主接受后进行，清除旧输入 lease/采用序号并绑定新 session epoch。旧对象即使收到同一玩家的迟到回调，也不能向新绑定写入；`invalidate()` 进一步清空它的队列。输入和命令没有玩家选择参数。跨房间 World 实例也不能复用会话。

移动与离散命令使用独立非零序号和有限前跳。每个目标 tick 只保存采用前最后一条输入，立即阶段之外最多缓存两个未来阶段；过旧或过远输入拒绝。入队和执行均检查 LifeEpoch。`last_received_input_seq()` 只证明接收；实际控制阶段才更新 PlayerState 的 `last_applied_input_sequence`。相同意图持续执行不延长 lease，只有采用新序号才续期；TTL 到期反馈中立输入及最后实际采用序号。

Command 有界排队、每 tick 有执行上限，执行结果保留有限幂等窗口；重复命令返回缓存结果，不重放出生、装备、拾取或伤害。生命变化后旧生命命令返回 StaleLife。新连接的 command 序列和缓存重新开始，宿主不能自动重放旧生命操作。M05 仍需接入限流、传输关闭和授权后的 token 轮换。

## 公开实体与私有状态

公开实体只包含 schema 的 publicFields/publicDenseGroups：真实外观、位置、生命、等级、分数、昵称、拾取外观和必要的花瓣渲染字段。dense 只用 116/120/140/152 base，完全排除携带装备与死亡资料的 control/group72 和 profile 扩展；不会发送伪造的远端空背包。

ownerPlayerId/ownerHandle 与 slot/instance 一起传输，局部槽位不会混淆为自己的 HUD。inventory、recharge、backpack、XP、zone、死亡保留物/击杀者/分数/等级和 nextSpawnTick 仅在接收者 selfState 中。拾取事件只公开目标、拾取者和动画槽位。聊天发送者取绑定 PlayerId。

每个 ReplicationSession 保存自己的 viewer、公开字段字节、AOI、baselineId、snapshotSeq、控制 handle 和事件游标。AOI 继续使用现有视野尺寸、眼睛装备缩放和附属子实体包围盒。离开视野发送 remove 并清空该 handle 缓存；重新进入或实体槽位换代发送完整实体。活着的 viewer 跟随自己的身体，死亡保留最后视点；新连接在尸体删除后仍能从 PlayerState 的死亡位置/缩放与统计建立视点。

## Full/delta、重连和失败策略

首个发布、resync 和新连接使用 full，生成新 baseline；普通 delta 发送变化实体和移除列表。当前增量粒度为完整公开实体块，与字段 codec 复用，不需要继承另一个块的 component 状态。selfState 每包完整发送。新连接使用新的 ReplicationSession，旧会话不能通过更换 ViewerContext 伪装成新 epoch。

TS `NetworkSnapshotDecoder.bind(Welcome)` 建立显式身份；`decode()` 先校验全部 envelope、公开实体、基线、序列、房间、控制归属和事件，再原子提交 Map。full 清除实体/组件缓存；delta 要求同 baseline 且序号连续，失败返回 null 由 M06 请求 resync。resync 保留事件水位以去重，重新 bind 则清空旧会话事件状态。控制 handle=0 是合法状态，不选择第一个玩家实体。

`SnapshotWriteQueue` 计算 pending 和 active write 的拥有字节总量，写完成后才释放计数。超限返回 SlowConsumer 并锁住队列；已经编码/入队的 delta 不会被替换或丢弃。M05 将这个结果映射到实际关闭和日志。全量超过总帧/实体/事件上限显式失败，未实现隐式分片。所有相关 u32 计数在生成的 counterDrainAt 前排空并换房间/会话 epoch，不允许回绕继续比较。

## 验证入口

- `npm run schema:check`：生成文件与清单一致、schema 边界/公开字段约束。
- `npm run test:engine`：18 项封闭 CTest；新增两项合计 12 个原生场景。
- `npm run test:integration`：真实 native→TS 全量/增量/resync/死亡/重生/重连，以及双方独立手工字节向量。
- `npm run build:client && node tools/run-tests.mjs client-unit`：TS 协议、事务性状态和损坏包测试。
- `npm run test:all`：既有 17 gate，加上已注册的 M04 native/跨端/client-unit 测试；它仍不是 M08 真实联机发布验收。

实现与测试均进入 engine source manifest、engine/server-native CTest 清单、产品测试清单和既有源码身份。实际 runId 与结果记录在 [执行清单](../../multiplayer-goals/CHECKLIST.md)。
