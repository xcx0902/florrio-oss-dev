# M08：测试、容量、交付与发布

状态：未开始。依赖：M00—M07。测试设施在各阶段随代码引入；本阶段汇总并执行最终门禁，不能到最后才补测试。

## 08.1 测试分层与清单

| 层 | 计划新增测试 | 真实执行对象 |
| --- | --- | --- |
| 引擎 | multiplayer state/combat/lifecycle/replication | 直接链接 engine_core 的 CTest |
| 宿主 | scheduler/session/room/reconnect/queue | server_runtime + fake clock |
| 协议 | 手工字节、native v2 fixture、TS decoder | 同一生成 schema，不同校验实现 |
| 网络集成 | 两客户端、同序号、非法包、慢连接、重连 | 子进程启动的真实 florr_server + 真 WebSocket |
| 浏览器 | 双玩家 PVP/身份/HUD/死亡/重生/重连 | 固定 Chromium 的两个 BrowserContext |
| 交付 | 默认入口无 Worker/WASM、版本不符失败 | 本次打包的 dist-multiplayer + 本次 native binary |
| 性能 | 多玩家/多房间/集中接触/反复生命周期 | 原生真实服务 + 可重复输入 bots + 浏览器样本 |

修改 `tests/product-tests.json`、`tools/test-manifest.mjs`、`tools/run-tests.mjs` 与相关工具测试。新增 server CTest suite 时实现 runner/expected 解析；新增 mjs suite 时加入 KNOWN 并确保自动发现无遗漏。不能只在文档写命令却未注册测试。

计划新增 npm 入口：`build:server`、`build:multiplayer`、`start:multiplayer`、`test:server:native`、`test:multiplayer`、`test:multiplayer:browser`、`test:multiplayer:all`、`perf:multiplayer`、`release:multiplayer`。由一个明确脚本表定义它们，实施后补帮助和失败退出码测试。

## 08.2 真实 PVP 验收用例

1. 同房双人：两页面昵称不同，PlayerId/handle 不同，相同 roomEpoch；首个远端玩家先到也不串控制。
2. 双向移动/攻击/防御：A/B 控制独立，非控制玩家不会响应他人输入。
3. 装备与特殊花瓣：相同 slot 不串号，Rose/Leaf/Peas/Egg/毒/反伤覆盖实际支持行为。
4. 死亡/掉落：A 击杀 B，两端血量与 killer 一致；B 死亡界面只在 B 显示，掉落只产生一次。
5. 拾取争抢：同 drop 只能发给一个玩家；客户端/HUD 与服务端库存一致。
6. 重生：尸体/冷却门槛权威，PlayerId 保留、新 handle 被双方正确接收。
7. AOI：两人远离/重入，完整实体重建，无幽灵、错代际或残留花瓣。
8. 重连：旧连接失效、token 轮换、新 epoch+全量；断线期间死亡可恢复，过期 token 不创建重复玩家。
9. 跨房间：两个房间各自的怪物、玩家、聊天、随机数与删除事件独立。
10. 输入保护：刷包不改变 tick，非法数据无半提交，慢连接不能拖住健康连接。
11. 页面隐藏：世界继续推进，本玩家输入 TTL 生效，恢复时身份和基线正确。
12. 默认入口：监听所有请求并明确断言没有 server.wasm/server-worker.js；关闭 WASM 能力后仍可完成闭环。

测试 fixture 可用专用测试 binary 配置固定种子/装备/位置；正式 binary 的 CLI 和网络 schema 均不包含该调试入口。真实入口至少有一组不注入浏览器 test API 的键盘/鼠标用例。

## 08.3 新增多人验收账本

当前唯一 gate 表和 releaseEvidence 强绑定离线 WASM 交付，不能直接复用旧 passed 标记。计划将 gate 按明确 profile 组织，保留现有严格完整性检查：

- offline profile：既有离线/ABI/Worker 回归，迁移期间继续运行。
- multiplayer profile：schema → native configure/build → engine/server CTest → client build → 联机打包 → 工具/协议 → 真实网络 → 双浏览器 → 无 WASM 入口 → 性能/资源 → 发布完整性。

若先新增 `tools/verification/multiplayer-gates.mjs`，也必须接入同一个证据模型，禁止创建只有 `{passed:true}` 的旁路报告。新账本放 `reports/multiplayer/runs/<runId>/`，摘要为 `reports/multiplayer/current-verification.json`。

每一步记录实际命令、开始/结束、退出码、日志哈希、报告哈希、source identity、binary hash、client manifest hash、protocol/catalog hash、平台与构建配置。取消、超时、输入变动或少跑一步都不能通过；release 必须重新校验本次完整账本。

源码身份增加根 CMake、server/src/include/config/tests、依赖锁定和新的打包/启动脚本。发布身份与测试身份分开，测试专用注入不混入正式产物，修改生产源必然使旧验收失效。

## 08.4 容量与资源测试

以下是待验证预算，不是当前性能结论。固定机器/编译器/种子，预热后至少重复 3 次，报告原始样本、p50/p95/p99/max，不只报平均值。

| 场景 | 负载/时长 | 通过目标 |
| --- | --- | --- |
| 最小闭环 | 1 房间 × 2 玩家，10 分钟 | 无掉线/串号/状态错误，固定 tick |
| 目标容量 | 2 房间 × 8 玩家，15 分钟 | 单房间 tick+复制 p99 ≤20ms；两房间一轮总工作 p99 ≤25ms；预热后无 50ms deadline 违约 |
| 集中战斗 | 8 玩家同视野，花瓣/宠物/投射物/effects | 数据正确，复核 AOI 与接触候选成本，写队列不越限 |
| 生命周期 | 100 次连接/出生/死亡/重生/断线 | 身份/实体/命令/复制状态无残留 |
| 慢消费者 | 1 个阻塞读客户端 + 健康客户端 | 慢连接被有界关闭，健康连接继续正常推进 |
| 资源浸泡 | 2×8 玩家，30 分钟，预热 5 分钟 | 队列全部有界；稳定负载下末/首 5 分钟 RSS 中位数差不超过 max(16MiB, 首段10%)；无持续对象数增长 |
| 网络矩阵 | M07 的 RTT/抖动 + 断线恢复 | 输入、AOI、死亡、基线正确；记录视觉响应与校正 |

同一线程执行网络/房间时，要把消息处理、快照编码、排队与事件循环延迟一起计入预算，不能只测 sim::tick。保留 CPU 使用率、房间实体数、snapshot bytes/s、每连接 queued bytes、事件数、重连/resync 次数与逻辑残留对象数。

WebSocket bot 验证容量，真实浏览器验证解码/渲染/交互；两者都需要。沿用现有客户端渲染和资源预算，并计入预测耗时。8 人目标失败时，发布仍限制为已通过的人数，文档明确缩小范围，不提高配置掩盖失败。

## 08.5 在线交付 profile

1. 新增 `dist-multiplayer/` 输出与 profile 化白名单；客户端只包含在线所需 JS/字体/图标/公开配置，不包含 server.wasm、server-worker.js、dev/test-api 或离线 cheat 模块。
2. 审查静态 import graph，避免 GameApp 仍静态导入 WorkerClient 导致在线打包器拖入离线模块。需要时分离 online/offline composition entry。
3. 联机 manifest 记录 client files/hash、server binary/hash、protocol/catalog hash、native dependency lock/toolchain。不能继续要求 WASM engineBuild 字段才能发布。
4. 扩展 `tools/lib/delivery.mjs`、`build-validation.mjs`、`identity.mjs`、`verify-dist-next.mjs` 或新增明确 profile 工具，并更新 release/工具 fixture；不要把旧强制文件检查直接删除而失去完整性校验。
5. 新增 `tools/dev-multiplayer.mjs`，启动本次 native binary 和联机静态资源服务；统一收集子进程错误/退出码，停止时只清理自己启动的进程。
6. 迁移期间 `npm start` 保持现状，新增 `start:multiplayer`。全部多人门禁通过后，再单独提交默认入口切换，并明确保留 `start:offline` 的可选范围。
7. 既有离线版本可作为独立产品回归保留；在线启动失败不得自动切到离线，以免用户误以为已联机。

## 08.6 原生部署与回退

计划新增 `server/README.md`、`server/deploy/` 反向代理示例、进程管理示例和可复现 Linux 发行打包脚本。目标部署为 Linux x86_64，开发支持 macOS；其他平台只声明实际测试过的范围。

部署包包含 native binary、静态客户端、配置模板、依赖/许可证清单、SHA256 清单和版本配对 manifest。游戏服务运行环境不安装 Node 或 Emscripten；构建环境仍可使用它们编译/验证离线兼容 profile。

配置至少覆盖 listen、room/player/connection 上限、Origin、代理信任、tick/队列/超时、日志与指标位置。公开配置不含 token 或秘密。生产通过同源 TLS 代理接入；health/readiness 与内部 metrics 访问策略明确。

发布前在干净环境安装产物并运行真实双浏览器 smoke。维护升级流程：关闭 readiness/准入 → 通知并有界排空 → 停旧服务 → 原子切换配对的 server+client → 启新服务 → health/smoke。首版不迁移内存房间，升级会话中断必须明确告知。

回退使用上一份完整的 server+client+schema/catalog 组合，不混用新旧两端。服务重启使旧 token/RoomEpoch 失效，客户端提示重新加入；不能恢复一个只存在内存里的旧房间。

## 08.7 最终完成条件

- [ ] 当前源码的 multiplayer 完整账本通过，无 skip/todo 绕过，无未记录失败。
- [ ] 双浏览器真实 PVP、重生、重连、两房间隔离全部通过。
- [ ] 目标容量达到或按实测明确降级；发布配置与报告一致。
- [ ] 在线交付无运行时模拟 WASM/Worker，正式服务无测试注入入口。
- [ ] 发行包、校验、健康检查、日志指标、排空与回退可操作并已 smoke。
- [ ] 更新顶层 README、engine/client README、协议、环境、CHANGELOG 和 release notes。
- [ ] CHECKLIST 每项完成都有对应提交和本次证据，最终声明与实际能力一致。
