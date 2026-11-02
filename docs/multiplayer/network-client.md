# M06 浏览器联机客户端

默认入口使用 `NetworkTransport`，通过二进制 WebSocket v2 连接原生服务；客户端不调用 think/flush/step 推进在线世界。`?profile=offline` 明确选择 `LocalWorkerTransport`，继续运行冻结单玩家和既有 Worker 回归。在线错误不会切换 profile。

## 运行和配置

先执行 `npm run build:server` 与 `npm run build`。按 [根 README](../../README.md) 配置精确的 `allowedOrigins`，启动 `florr_server`，然后运行：

```sh
node serve.mjs --port 8477 --server ws://127.0.0.1:8787/ws
```

`client/static/connection.json` 随资产白名单打包，包含公开的 profile、URL、roomId。协议版本和 catalog hash 默认取生成 schema；也可以在公开配置中指定，客户端启动时拒绝不匹配值。默认 URL `/ws` 相对于网页 Origin，HTTPS 自动转换为 WSS；本地 HTTP 可以明确配置 WS 地址。URL 不允许凭据、query 或 fragment。`serve.mjs --server` 仅覆盖运行时返回的 URL，不改前端 bundle 或交付 manifest。

生产网络端点应由同源 TLS 代理提供。M08 提供 Linux x86_64 部署包、反向代理示例、排空和回滚 smoke；见 [部署契约](deployment.md)。当前 `dist-next` 保留显式离线诊断资产，但普通在线启动、游玩、死亡、重生和重连不请求 `server.wasm` / `server-worker.js`。在线 `?test`/`?cheat` 不安装离线诊断 API 和本地 RPC 面板。

## 状态、输入和命令

传输状态与玩法状态独立：`disconnected → connecting → handshaking → connected → reconnecting/closed/error`。Hello/Welcome 建立 roomEpoch、PlayerId、SessionEpoch；首个合法全量到达后 connect 完成。无首包、握手或 resync 完成超时会结束当前连接。版本、目录、满房、无效 token、被替换会话和维护停服给出明确 UI，不无限重试。昵称输入在返回菜单后保留。

InputPump 每 50ms 独立采样意图，DOM 意图变化另触发最小间隔为 25ms 的发送；不等待前一个快照。targetTick 由 M07 的单调网络时钟估计，键盘强度限制为协议的 200。暂停输入泵只停止本客户端上报，房间和快照仍继续推进。blur/hidden 尽力发送中立输入并停止非零上报；focus/visible 按需请求 resync，最终中立保障由服务端 TTL 提供。网络时钟、缓冲插值和移动预测见 [M07 契约](latency-and-prediction.md)。

Command 独立编号，每个 Promise 等待 CommandResult，最多保留生成契约中的 128 个请求；每个请求五秒超时，离线、生命变化、leave、dispose 清理适用的 Promise 与 timer。Spawn 自身会改变 LifeEpoch，因此保留至对应确认、超时或连接清理，不因新身体快照先到而取消。发送缓冲按 WebSocket.bufferedAmount 和新帧字节限制在 1MiB。装备动画可以先表现用户请求，但背包/槽位内容只取后续服务端 selfState。出生请求单飞，冷却/非法状态有显式结果，nextSpawnTick 由服务端决定，不创建本地重试出生链。

重连延迟为 0.5/1/2/4 秒并限制在可能有效的恢复窗口；客户端采用默认 grace 的十秒保守上限。服务端若配置更短 grace，会显式拒绝过期 token；更长 grace 不延长客户端自动尝试。token 只在当前标签页 sessionStorage 或内存保存，不进入 URL、日志或公开配置。恢复后轮换 token、连接序号、基线与会话 epoch；旧 socket 回调通过连接 generation 和 socket 身份检查失效。leave 和永久错误清除对应 token，页面关闭则保留短期恢复机会。

## 身份、原子应用与表现

NetworkSnapshotDecoder 在提交前完整检查 envelope、房间、会话、baseline、序列、公开实体块和事件。缺口或损坏包保持旧状态并请求一次有界 resync；新 full 清理旧实体/组件、视觉转移、变换与插值历史，事件水位避免奖励/动画重复。新连接 bind 清理旧事件世代。

WorldState.setControlledPlayer(PlayerId, handle) 是在线本地身份来源，handle=0 或本地身体暂缺时不选取对手。所有远端玩家仍保留在 kind 索引中。自己的生命状态、等级、经验比例、分数、装备、recharge、zone、死亡资料和冷却来自 selfState；相机在死亡/尸体删除后使用服务端保留视点。重生使用新 handle/LifeEpoch，旧生命命令失效。远端昵称、等级、动作和花瓣 owner/slot/instance 保留为公开状态；鼠标 pan 只作用于受控玩家。对手拾取不触发本地 HUD 转移动画，对手死亡不触发本地死亡界面。

`Leaderboard`（服务端消息 12）在每个快照后发布房间玩家的 PlayerId、昵称和分数，最多 8 人。排行榜不依赖 AOI 实体，远处玩家仍显示；客户端按权威分数排序，用 PlayerId 标记自己，保留既有分数平滑与面板绘制。消息受 roomEpoch、SessionEpoch 和 tick 约束；Leave 后替换名单，全量重绑/离开清理旧名单。该消息是 v2 的新增类型，前端和服务端需要配套更新。

表现状态保持原来的含义：field 31 是表情/动作字节，不能当作 field 14 的脸部特效标志。新生掉落物沿用 flags 的 128 位触发生长和旋转；旧掉落物进入 AOI 时直接使用稳定尺寸和角度。健康出生快照只更新世界，joining 由 prepareFrame 在最后一帧菜单之后确认，让 FrameRenderer 捕获菜单并启动原有进入转场；普通后续快照、resync 和恢复连接不重播进入动画。

## 验证

`tests/product-tests.json` 注册客户端三份新单元测试、真实 `network-browser.test.mjs` 和 `server_browser_fixture_check`。它们通过既有 client-unit/client-integration/delivery、native CTest 与 17 gate 执行，没有替代验收脚本或永久 skip。

专用 `server_browser_fixture` 链接同一 server_runtime / engine_core，使用不填充怪物的确定性 World。固定出生点及目录装备只存在于该测试可执行文件；公开服务没有测试 RPC。两个独立 BrowserContext 从真实 main/index 启动，使用键盘与正常 Command，在真实碰撞中完成击杀、死亡掉落、重生、恢复及两房间聊天隔离。测试同时阻止 Worker 构造并检查请求清单。`smoke-entrypoints.mjs` 另启动真实 serve.mjs，验证普通入口。

结果、源码/二进制身份和历史失败见 [M06 交接](../../multiplayer-goals/CHECKLIST.md)。M08 的 2×8 容量、30 分钟浸泡和生产部署证据见 [CHECKLIST](../../multiplayer-goals/CHECKLIST.md)。
