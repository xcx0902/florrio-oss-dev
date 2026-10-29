# 05：客户端去除全局耦合与重复 UI 逻辑

> 状态：待实施。保留当前 Canvas2D、单机 Worker 与交互体验；模块拆分和性能优化分开验证。

## C01. 将 main.ts 改为组合入口

当前约 904 行的 `main.ts` 同时创建所有对象、注册事件、推进网络、管理死亡/重生、计算 hover、操纵菜单、绘制过渡并暴露测试注入。拆分不应只是把全局变量散落进更多文件。

建议明确实例所有权：

| 新模块 | 从现有 main.ts 迁入 | 所有者与接口 |
| --- | --- | --- |
| `app/game-app.ts` | 创建依赖、boot、resize、start/dispose | 一个 `GameApp`，持有 session、input、renderer |
| `app/game-session.ts` | `startGame/restartGame/continueToMenu`、pending spawn、serverInitialized、死亡流程 | `GameSession`，提供动作与只读视图 |
| `app/simulation-loop.ts` | `tickServer`、50ms timer、ticking、tick 计数 | 保存 timer ID，支持 start/stop；每次只有一个 step 在途 |
| `input/game-input.ts` | 键盘/鼠标/触控合成、buttons、movementDisabled | 生成输入意图，不调用 Canvas |
| `input/loadout-controller.ts` | `handleUiKeys/handleHotbarPointer`、拖动/交换/丢弃 | 消费布局命中结果，提交类型化命令 |
| `render/frame-renderer.ts` | `frame` 的组织、camera、world、HUD 的调用 | 接收单帧时间与视图；不发网络命令 |
| `render/transitions.ts` | entry/exit canvas、iris 过渡 | 独立 reset/dispose，不在主入口持久保存多份画布 |
| `dev/test-api.ts` | `window.__florr` 的注入、freeze、camera pin | 仅测试/诊断配置安装，由窄接口访问 app |

`main.ts` 最终只找到 canvas、创建 app、启动并处理启动失败。目标约 100–150 行以内作为审查提示；不为满足行数把逻辑藏入匿名巨大回调。

## C02. 用明确的游戏阶段收敛布尔组合

现有 `started`、`enteredWorld`、`dead`、pendingSpawn/restart、entryAt/exitAt、serverInitialized 交叉参与流程。目标使用明确阶段与过渡函数，例如：

```text
menu → joining → playing → dying → dead → returning → menu
                  ↘ reconnect/error（按当前实际支持范围处理）
```

具体修改：

1. server ready、spawn 冷却、spawn 请求在途作为 session 内子状态，不从任意绘制函数写入。
2. 在 `enterJoining/enterPlaying/enterDead/enterMenu` 中集中执行输入、HUD、petal motion/transfers、helper、transition 的 reset。
3. 继续保持 2500ms 出生冷却和现有尸体门槛；异步 spawn 只能发送一次，健康实体到达后确认成功。
4. 迟到的请求结果通过 session generation 或已销毁标记拒绝，防止返回菜单/销毁后写入新一局状态。
5. 异步错误进入明确的可显示状态；保留诊断原因，避免所有异常都只剩 `Server error` 且无法定位。

先根据现有产品回归列出转换表，再替换布尔值；不引入状态机依赖库。

## C03. 只保留当前 decoder 入口，明确 full 与 delta

`state/snapshot.ts` 约 746 行，包含 Reader、header/counts、领域投影、OriginalBare、Skeleton、多种 Dense decoder 与 Composite fallback。

修改目标：

- 将公共类型放 `state/snapshot-types.ts`，字节读取放 `net/binary-reader.ts`，当前 wire 解码放 `net/snapshot-decoder.ts`，wire→领域投影放 `state/snapshot-projection.ts`。
- 当前 `OriginalBareSnapshotDecoder` 重命名为 `SnapshotDecoder`；保留现行 mask/dense、组件 presence、事件与删除能力。
- 迁移必要的 codec 单元测试后，归档 `SkeletonSnapshotDecoder` 和只服务旧实验的 decoder 类；主入口移除 `CompositeSnapshotDecoder` 的“猜格式”回退。
- `lastIndex === 1` 决定全量/部分状态的隐式约定退出；明确 `applyFullSnapshot` 与 `applyDeltaSnapshot`，实际网络只走一种已声明的当前格式。
- 产品性能/渲染 fixture 使用 `WorldFixtureBuilder` 或明确的 `replaceWorld` 接口，不通过保留旧线上解码器来支持测试注入。
- 解码先构造本包变更，全部验证通过后再提交 masks/component pointers；截断或非法包不能使 decoder 处于半更新状态。
- 63 个字段与 dense group 类型来自 03 的协议生成物；特殊领域映射有命名访问器，不让业务代码散落 `floatFields[53]` / `byteFields[34]` 等数字。

## C04. WorldState 统一字段投影与索引

当前 `WorldState.apply/applyPartial` 同时处理插值、字段合并、dense→component 表、死亡 metadata、事件、聊天和 player 查找。具体整理：

1. 通用标量合并函数明确四项：当前值、显示起点、该字段收到时间、是否已知。健康为 0 与缺失必须区别，health-only 包不能重置坐标或角度时钟。
2. 把 `deathMetadata`、`playerLoadoutSlots/playerSlotProgress` 使用的 wire 查询统一放投影层；业务层读取有类型的 death/loadout view。
3. 保留权威实体 Map，同时维护 playerHandle、按 kind 的轻量索引以及 membership revision；删除、替换和 reset 都从同一路更新。
4. `playerEntity()` 从反复遍历改为验证缓存 handle；已死亡的 body 与“没有健康玩家”使用不同 API，替代各处自行拼接 `kind===1 && health>0`。
5. hit、visual、collected 等事件索引有 TTL/销毁/reset 清理路径；删除实体时回收与之关联的派生状态。
6. 从 WorldState 访问视觉插值采用窄的快照/插值类型，避免 world 与 render 在类型和运行依赖上形成循环。

这里先建立正确的索引接口，逐帧性能复用在 08 实施。

## C05. 绘制几何与命中测试共用一套布局

已确认的重复：`main.ts::deathHoveredSlot` 手工算死亡花瓣行，`hud.ts::drawDeathOverlay` 再画同一行；`ui.ts::inventorySlotAt` 手工算 16 格背包，HUD 另有绘制几何。`hotbarSlotAt` 已部分复用 `getHudLayout`，可沿此边界整理。

目标新增 `ui/layout/{hud,inventory,death,menu}.ts`：

- 布局返回卡片/槽位/按钮矩形及锚点，绘制与 hitTest 消费同一结构。
- 明确 CSS pixels、逻辑 UI units、device pixels、world units 的转换，DPR 只在绘制边界应用。
- `deathCardRects(items, level, viewport, progress)` 同时服务死亡行绘制与 hover；去掉 main.ts 的重复 left/size/rowY 算法。
- `inventoryLayout` 返回 panel 与 slot rect，删除 `ui.ts` 与 HUD 中的重复 panelX/panelY/62/56 常量。
- hotbar、storage、discard 的中心和尺寸来自统一 layout，命中 margin 是显式参数。
- 菜单保留 `menu-layout.ts` 已有公共几何，去除绘制和 input 对文字换行、图鉴行高、滚动高度的重复计算。

用“实际绘制矩形的中心一定命中该槽位；相邻间隙和边界遵从统一规则”的参数化测试覆盖 1280×720、窄屏、DPR1/2、不同等级槽数、死亡过渡中间帧。

## C06. 拆分 HUD 与实体画法，集中缓存所有权

`hud.ts` 的状态创建/动画、layout、矩阵包装、进度/槽位、排行榜、死亡、主入口拆为：

- `hud/state.ts`：纯视图与动画推进；`hud/layout.ts`：可复用几何。
- `hud/{hotbar,inventory,scoreboard,death}.ts`：各自绘制，不访问网络。
- `canvas2d/transform-context.ts`：HUD 的逻辑矩阵适配，保留 save/restore 与缓存失效规则。
- `hud/index.ts`：短的帧绘制入口；原 `render/ui.ts` 若只剩重复 re-export，删除或作为唯一明确的外部入口，避免双入口长期并存。

`entity-art.ts` 拆为 `art/{palette,player,petals,drops,species}.ts`；公共颜色、局部矩阵与 path helper 单独维护。种类分发使用清晰注册表/局部 switch；不为每个形状引入类继承。

路径、文本、排行榜 surface 不再藏在文件级全局而无人能清理，统一由 `RenderResources` 或对应 renderer 实例管理。`canvas2d/path.ts::PathCache`、`sprites.ts::SpriteCache` 当前静态搜索未见实例消费者：核对全部代码后删除闲置抽象；已有 rock/cactus 缓存先整理，不再平行新建另一套万能 cache。

`SilentAudioBus` 若仍是未来音频的接口边界，保留最小实现并写明状态；不要为了“减文件数”去掉真实使用的依赖边界，也不要扩展出未实现音频框架。

## C07. 输入与资源要能完整释放

给 app、pointer、keyboard、touch、menu、worker wrapper 提供 dispose：停止 interval/rAF、移除监听器、关闭 worker、reject pending、清理转场画布及渲染资源。事件注册由实例集中管理，不允许重新 boot 叠加监听器。

`ServerWorkerClient` 当前维护 pending/rejecters，但没有 worker.onerror/messageerror 的统一处理，terminate 也不拒绝在途 promise；按 08 的通信目标补全。Worker 分配输入内存的释放放 `finally`，避免某个 switch 分支异常后漏掉 `free`。

## C08. 完成条件

- [ ] main.ts 只组合依赖和启动；游戏阶段转换、server step、输入和绘制有明确所有者。
- [ ] 启动→游戏→死亡→菜单→重生可连续重复，异步迟到不会污染新 session。
- [ ] 线上入口只有当前 decoder，无 skeleton fallback；非法包不改变既有解码状态。
- [ ] 同一套 layout 驱动点击与绘制，死亡行/背包/热栏不再各算一次几何。
- [ ] HUD、art、资源缓存能独立定位和释放；无未使用的 PathCache/SpriteCache 空架构。
- [ ] 产品测试/性能工具的注入入口独立，原版 parity hooks 全部归档。
- [ ] 现有输入、昵称持久化、触控、cheat 功能和领域表现有产品回归保护。
