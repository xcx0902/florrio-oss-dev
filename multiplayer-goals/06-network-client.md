# M06：改造浏览器为联机客户端

状态：未开始。依赖：M04、M05。产出：两个浏览器通过真实原生服务完成 PVP；在线入口不加载模拟 WASM。

## 06.1 文件落点

- 新增 `client/src/net/transport.ts`：网络/离线适配器共同面向上层的生命周期接口。
- 新增 `client/src/net/websocket.ts`：连接、v2 codec、消息事件、关闭/重连和队列上限。
- 新增 `client/src/net/multiplayer-codec.ts`：消费生成 schema，严格编解码 envelope。
- 新增 `client/src/app/input-pump.ts`：采样/发送当前意图与离散命令，不推进世界。
- 修改 `app/game-app.ts`、`game-session.ts`、`simulation-loop.ts`、`state/world.ts`、`state/death.ts`、`snapshot-projection.ts`、`net/input.ts`。
- 扩展 `state/entity-state.ts` 与渲染/HUD 使用的公开 player/owner 信息，审查 `petal-motion`、`petal-transfers` 和 loadout fallback。
- 新增 `client/tests/unit/network-session.test.mjs`、`local-player-identity.test.mjs` 与真实双页面联机集成测试。

接口以 `connect/sendInput/sendCommand/onSnapshot/onControl/onClose/dispose` 为核心，不把远端传输伪装成 `think()/flush()/step()` RPC。离线 Worker 可通过专门适配器继续支持原有测试，但不能在在线失败时自动回落。

## 06.2 执行步骤

1. 在 GameApp composition root 注入 Transport。生产联机 profile 默认 NetworkTransport；离线入口显式选择 LocalWorkerTransport。渲染器不直接创建 Worker/WebSocket。
2. 用运行时公开配置提供 `/ws` 地址、协议版本和目录 hash；生产默认同源 `wss`，本地允许明确的 ws 开发地址。不要把 token、编译机地址或秘密配置写进前端 bundle。
3. 建立 `disconnected → connecting → handshaking → connected → reconnecting/closed/error` 的传输状态机。与 menu/joining/playing/dying/dead 的玩法状态并列，断网不假装角色死亡。
4. Hello/Welcome 成功后保存 roomEpoch/playerId/sessionEpoch；resume token 放本 tab 的 sessionStorage 或内存，不写 URL/日志。成功恢复后轮换，退出/房间过期后清除对应 token。
5. 输入泵每 50ms 采样当前意图并发送，不等待前一快照；离散命令单独编号/确认。输入泵停止只影响本客户端上报，不调用任何 server think。
6. 每帧收到 Snapshot 后验证 envelope/epoch/room/baseline/序列；完整解码成功后原子 apply。遇到增量缺口或失效基线请求 Resync，不应用部分实体后继续。
7. WorldState 新增显式 `setControlledPlayer(playerId, handle)`。本地 HUD/相机/死亡/背包统一使用这个绑定；删掉「第一个 kind=1 就是自己」的在线路径。
8. 列表索引继续保留所有远端玩家。自己的 handle 暂时不存在时表现为等待/死亡，不跟随另一名健康玩家；重生时更新控制 handle 与 LifeEpoch，并清空旧生命待发输入/命令。
9. 全量应用前清理旧 decoder component mask、事件去重、实体表、视觉转移和插值历史；resync 是否保留菜单/死亡动画由同一个 session reset 入口决定。
10. HUD 使用 selfState，而非扫描场上所有花瓣推断本地装备。远端花瓣绘制按 owner 关联，槽号相同不代表属于自己。
11. 将下一次出生/尸体窗口的客户端本地 tick 计数改为服务端返回的 tick/结果码。用户可以请求，成功与否由服务端确认；重复点击不创建重复 spawn 请求链。
12. 断线后清理 pending command promises 和旧消息回调，停止发送非零意图；重连指数退避 0.5/1/2/4 秒，上限 4 秒，只在 grace 可能有效时自动尝试。版本错误/房间满/无效 token 不无限重试。
13. 页面 `blur/visibilitychange` 尽力发送中立输入；不能假设后台 timer 可靠，服务端 TTL 是最终保障。页面恢复后重新校准时钟并按需 resync。
14. 网络错误、满房、版本不符、重连中、重连失败、维护停服在 UI 有明确状态；保留昵称输入和返回菜单能力，不显示永久「Waiting for the garden」。
15. 在线 composition root 不安装 `?cheat` 的本地 engine RPC；测试 API 与测试初始场景只在专用测试构建/服务存在，默认在线交付不携带权限入口。

## 06.3 首个真实联机闭环

使用一个 native 测试服务，两个独立 BrowserContext、相同 roomId：

1. A/B 加入得到不同 PlayerId、不同 controlledHandle，相同 roomEpoch。
2. A/B 分别移动、攻击、防御；双方都看到正确的两个玩家与花瓣。
3. 通过固定测试场景让 A 击杀 B，B 显示正确 killer/死亡资料；A 继续正常运行。
4. B 重生后双方都看到新 handle，B 的相机/HUD 跟随自己，A 不跳镜头。
5. B 断线后 A 的世界继续推进；B 在 grace 内恢复同 PlayerId，拿到新 epoch+全量，不多出第三名玩家。
6. A/B 分别进入另一个 roomId 时快照和聊天不串房。

固定出生点和测试装备由专用 native fixture 构建提供。不能用公开 debug RPC 帮浏览器测试「凑出」PVP。

## 06.4 客户端必须覆盖的边界

- 首个收到的玩家是对手，自己的实体后到；HUD/相机仍绑定自己。
- 自己死亡或被 AOI 移除，对手活着；不切到对手，不误判自己重生。
- 旧 WebSocket 的 onmessage/onclose 在重连后触发；不得污染新会话。
- decoder 失败、全量重置、重复事件、跨 epoch 包均不会留下半套状态。
- 对方拾取事件不驱动自己的背包动画；远端死亡不触发自己的死亡界面。
- 慢网络下离散命令明确成功/失败，队列有界，dispose 后 pending/timer/listener 为零。
- 两页面真实启动、重生和重连的网络请求中，没有 `server.wasm` / `server-worker.js`。

## 06.5 完成条件

- [ ] 真实原生服务 + 双浏览器完整 PVP 闭环通过，不使用 fake transport 代替最终证明。
- [ ] 在线代码无 `think/flush` 请求，客户端计时器不能改变服务端 tick。
- [ ] 所有本地 UI 状态来自明确身份与 selfState。
- [ ] 原有适用的 Canvas/UI/触控/资源回收测试继续通过。
- [ ] 普通入口禁用 WASM 加载后仍能完整游玩；服务不可用会明确报错。

建议提交顺序：Transport 注入 → v2 连接/codec → 输入泵 → 显式身份/HUD → 生命周期/重连 → 双页面回归。
