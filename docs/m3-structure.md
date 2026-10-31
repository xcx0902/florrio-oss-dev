# M3：结构收敛实施记录

本轮覆盖 `refactor-goals/04`、`05`、`06`。开始于 `7200f631eef7` 的干净工作树。保留固定 50ms tick、玩法数值、RNG 消费、f32 运算、
接触策略 6、2500ms 出生冷却、尸体门槛及已有输入/cheat 行为。M4 性能优化不在本轮范围。
下表描述实现与验证位置；本次实际通过状态见末尾验收记录。

## 引擎：04

| 目标 | 原职责 → 当前唯一所有者 | 验证 |
| --- | --- | --- |
| E01 | `WorkerApi` 只协调 init/send/think/输出队列；`SnapshotPublisher` 编码发布；`ReplicationSession` 持有 viewer、known 与单个 handle→published map；optional 值区分缺失与零 | peer visibility、snapshot domain、structure tests；flush 与事件仅消费一次 |
| E02 | `SnapshotEncoder` / `snapshot_codec.*` 统一 packet framing、bit/varint/string/数组及事件；typed field helper 根据生成协议表校验类型、索引和顺序；移除巨型注入表与重复 PacketBuilder | 手工向量、稀疏/全部 dense 类型、错误类型原子拒绝、C++→TS fixture |
| E03 | `EntityPool` 独立，FIFO/generation 不变；`world_records.hpp` 是领域记录；`world.cpp` 集中 initialize/reset/destroy；销毁通知统一使关系、AI、空间与发布缓存失效；退役 ComponentStore | entity pool、reset、销毁单次通知、owner 循环与 stale handle |
| E04 | `combat.cpp` 只更新接触树并求解策略 6；每个 World 自有 `CollisionContext`；`damage.cpp` 修改健康并调用 `death.cpp`，后者处理归属、经验、掉落、尸体与子实体 | 双 World 交替与独立推进一致；现有战斗、死亡、拾取 suites |
| E05 | AI 阶段入口 / `targeting.cpp` / `ai_profiles.cpp` / `species_attacks.cpp`；花瓣轨道 / `petal_lifecycle.cpp` / 特效各自定位；`entity_relations.*` 保留两种不同归属查询的 guard 语义 | AI families、petals、projectiles、passives/pets、owner 回归 |
| E06 | `abi.cpp` 只转换核心调用；`diagnostics/commands.cpp` 保留真实 cheat；导出由 `abi-exports.json` 驱动 CMake 并核对头文件、worker、实际 wasm | `verify-abi.mjs`，8 core + 5 product diagnostics；原版专用导出为零 |
| E07 | 统一 native/wasm 核心源清单，新增结构 suite，保留原产品 suites | 完整 ledger 的 native CTest、跨端与浏览器 gates |

### 当前协议消费者

| 能力 | 发布/编码 | 解码/消费 |
| --- | --- | --- |
| sparse masks、ordinal/presence、63 字段 typed wire | 产品 SnapshotPublisher 与 SnapshotEncoder | 唯一线上 SnapshotDecoder，生成 field/group 描述 |
| default dense groups | SnapshotPublisher 首次完整字段组合；SnapshotEncoder 全类型能力 | SnapshotDecoder 的显式 dense plans；无猜格式 fallback |
| 其他协议 dense 类型 | 小型直接 encoder fixtures，不配置到生产 Entity | 当前 decoder 的 schema 驱动 plans + 测试专用 dense convenience adapter |
| chat / hit / pickup | 类型化领域记录 → publisher 选择可见性与消费时机 → encoder | Snapshot.events → WorldState / PetalTransfers / event effects |
| 删除与重入 | World.destroy 通知、session known/forget；重入发送完整初始值 | 原子 decoder 删除/presence → WorldState 统一删除索引 |

测试方便类只在 `client/tests/support/dense-codec.mjs`，由 fixture 的显式 test-support
route 提供；默认交付不包含它们。没有第二套线上快照。

## 客户端：05

| 目标 | 所有者与边界 | 验证 |
| --- | --- | --- |
| C01 | `main.ts` 只 canvas/create/start/pagehide；GameApp 组合并拥有 rAF、帧时钟与输入分发，GameSession 管局并提供只读 SessionFrameView，SimulationLoop 管 50ms 单在途 step，GameInput/LoadoutController 管输入，FrameRenderer/Transitions 管绘制 | 浏览器真实输入、worker 与 app lifecycle |
| C02 | 显式 phase、初始化单飞、spawn 单飞、generation 拒绝迟到结果；错误保留原因并停止模拟；join reset 集中 | 连续死亡/菜单/重生、迟到 init、重复 start/dispose |
| C03 | binary-reader / snapshot-types / SnapshotDecoder / snapshot-projection；整包验证后才提交 masks 和 componentPointers；WorldState 明确 full/delta | 字段 1/63 合法边界、64/累计越界拒绝、整包回滚、截断后连续解码、dense presence 与手工向量 |
| C04 | WorldState 权威 Map + playerHandle + kind index + membershipRevision；健康玩家/尸体分开；投影集中 death/loadout；独立 scalar clocks | 缺失 vs 0、health-only、删除/reset、事件 TTL |
| C05 | `ui/layout` 的 rect/hud/inventory/death 与现有 menu-layout 是绘制及命中共同几何；CSS/逻辑/world/device 坐标在边界转换，DPR 只应用一次 | 宽/窄屏、DPR1/2、多等级、过渡帧的中心、间隙和边界参数化 |
| C06 | hud 子模块、art 子模块；transform-context 保留矩阵规则；RenderResources 归 FrameRenderer，绘制同步 scope 用 finally 恢复；退役无消费者 PathCache/SpriteCache | owner 隔离、嵌套 scope、dispose 与现有画法回归 |
| C07 | app/input/menu/worker 可 dispose；timer/rAF/listener/worker pending/cheat 刷新/画布/cache 清理；worker malloc/free 的 finally | 重复 boot/dispose、worker error/messageerror/terminate 拒绝 pending |
| C08 | test API 仅显式 `?test=1` 安装；默认包排除 test-api.js；保留最小 SilentAudioBus 未来音频边界 | 真实交付启动不依赖 test API；昵称、IME、触控、cheat 回归 |

GameApp 在绘制前更新输入约束并分发输入；GameSession 的 `prepareFrame` 集中推进阶段、
死亡流程与健康玩家确认。FrameRenderer 只消费时间、layout 和只读帧视图，不调度 rAF、
发送命令或推进 session；首个健康快照的菜单帧时序保持原规则。

### Session 过渡

| 当前 | 触发/门槛 | 下一阶段与集中动作 |
| --- | --- | --- |
| menu | Enter/点击；init 单飞 | joining；隐藏菜单、清理输入/HUD/转场/花瓣状态 |
| joining | 冷却满 50 个已完成 tick，尸体消失；只发送一次 spawn | 收到健康玩家后由 presentation 确认 playing，保留原首帧时序 |
| playing | 权威死亡事件/健康与保留 metadata | dying；记录死因、分数、保留物与死亡时间 |
| dying | death presentation 完成 | dead |
| dying/dead | Enter 返回 | returning；保留离场画布，清输入，展示重生资料 |
| returning | 关闭 iris 完成 | menu |
| menu | 再次开始 | joining；同样遵守冷却和尸体门槛 |
| 任意活动阶段 | Worker/协议/异步命令错误 | error；保留原因，停模拟 |
| 任意 | dispose/新 generation | 清 pending；迟到 callback 不写新局 |

## 工具与发布：06

| 目标 | 实现 | 验证 |
| --- | --- | --- |
| B01 | `build/start/test/test:all` 默认当前产品；包名 florrio；旧构建名仅兼容别名，文档使用 build/verify:delivery | package 脚本、真实入口 smoke |
| B02 | `engine/sources.cmake` 是 engine_core 唯一源清单；Emscripten CMake 构建同一核心；strict FP/警告与版本锁保留 | native 全 CTest、wasm、ABI consistency |
| B03 | client/static 白名单 → build/client 和 build/wasm → dist-next；fresh staging/锁/原子替换；递归 imports/字体校验 | orphan/stale/missing/篡改/失败保旧交付工具测试 |
| B04 | identity.mjs 统一 product-build-v1 / product-verification-v1 / engine-build-v1 / file-tree-v1；archive、报告、缓存不参与；symlink 拒绝 | identity 范围、输入变化、符号链接回归；构建前后和整次验收稳定性 |
| B05 | 共用 HTTP realpath boundary、browser harness/profile/version、process lifecycle；单 Chrome server，场景 context 隔离，真实 retina/touch | 锁/取消/非零退出、全部浏览器 scenarios |
| B06 | verification/gates.mjs 唯一有序定义；15 gates，wasm/TS/package 各一次；schema5 ledger 绑定 run/source/verification/delivery/tools/log/report hashes | 失败/中断/遗漏 gate/旧 ledger 不通过；完整验收 |
| B07 | 依赖仅 playwright-core/typescript/yaml；releaseEvidence 校验当前不可变 ledger 后生成 tar.gz/manifest/SHA256SUMS；不外部发布 | release:prepare、校验与解包；见 release.md |
| B08 | 无归档干净副本相同流程；不运行历史 move/restore/refreeze/oracle | 本次验收记录 |

性能脚本在本轮提供可复用工作负载：600 tick 原生模拟、872 实体绘制、真实 native
packet→TS 解码/WorldState。只记录当前基线；没有把冻结绘制 FPS 当作模拟性能或宣称 M4 已完成。

## 审计缺口处理

`SnapshotDecoder` 对累计字段号超出 `1…63` 的情况直接返回 null，保留既有整包
事务边界。原来把越界字段改成字段 1 的浏览器预期已替换为拒绝预期。新增 3 项客户端
单测在修复前全部失败，修复后通过，覆盖合法边界 1/63、直接字段 64、累计越界、最大
u32 delta，以及审计原始向量 `010100000100785634123701000000400700`。

拒绝后的验证只通过公开解码行为检查：新实体不能安装 mask 或启用 dense group；
已有实体的删除、mask 替换、前序合法记录和 ordinal presence 一起回滚，后续 dense
解码保持原结果。对应 `client/tests/unit/snapshot-domain.test.mjs` 与
`client/tests/integration/snapshot-codec.test.mjs`。

系统 Chrome 的自动升级没有改变版本锁。本次通过 `CHROME_PATH` 显式选择
`/tmp/florr-m3-chromium/chrome-headless-shell-mac-arm64/chrome-headless-shell`，实际版本
为 `156.0.8078.47`；全部浏览器场景真实执行，没有以跳过代替通过。

## 验收记录（审计补齐后）

审计补齐于 **2026-10-31（Asia/Shanghai）完成**。初次 M3 验收仍保留为历史记录；
以下为字段边界修复后重新生成的证据，不继承旧交付的绑定。两次验收顺序执行，均从当前源码运行
`npm run test:all`，再执行 `npm run release:prepare`；下列 runId 使用 UTC 日期。

| 环境 | 本次 runId | 结果 |
| --- | --- | --- |
| 主树 | `2026-10-31T00-48-36.371Z-b9ac5b38` | 15/15 gates，PASS，stable=true；本地发布准备通过 |
| 无归档干净副本 | `2026-10-31T00-51-22.376Z-7cabf9df` | 15/15 gates，PASS，stable=true；本地发布准备通过 |

每次均通过：schema 15 个输出检查、11 个 native CTest targets（主 topic runner 112
cases）、39 个产品单测、16 个工具测试、93 个客户端单测、76 个浏览器集成测试、
3 个 C++→TS 集成测试、13 个产品 ABI 导出核对、81 个交付文件完整性检查及真实
默认入口 Worker/键鼠 smoke。测试无失败或跳过。Chromium 固定为 `156.0.8078.47`，
Emscripten 固定为 `6.0.10-git`，Node 为 `v24.13.0`。

干净副本位于 `/tmp/florrio-m3-audit-clean-47ia00oq`，不含 `.git` 或 `archive`；排除
node_modules、build、dist*、reports、.emcache 和 release 后，以固定 lockfile 执行
`npm ci --offline --no-audit`，重新生成所有构建和验收输出。离线安装使用已有 npm
缓存及已安装工具链，不表示空缓存可离线安装。

两环境的产品、验收输入及交付文件身份逐字一致：

| 身份 | SHA-256 |
| --- | --- |
| product-build-v1（214 files） | `e1dcb9c9469cab60760bb3979dffbecb78947ee6436277f22dfaed57f2cf7021` |
| product-verification-v1（298 files） | `1e969b35cc084a6a3d09e73ff954f2da399bf4b9e70a6e1065f90b56d3c94fc0` |
| wasm | `1c5a96253c8c4670162cd4577742f21007ade419c5be89fd7b013de63b12876e` |
| 有序交付文件清单 | `190f18560a38085ef2d273302fd4c8b6a774398cbfb8a5c76b86d75f17a52baf` |

当前证据为 [`reports/current-verification.json`](../reports/current-verification.json)，
不可变主树 ledger 为
[`reports/runs/2026-10-31T00-48-36.371Z-b9ac5b38/run.json`](../reports/runs/2026-10-31T00-48-36.371Z-b9ac5b38/run.json)。
发布校验同时核对当前源码、该 ledger、全部 gate 日志/报告和实际交付，旧报告不能继承为通过。
当前 `dist-next/build-manifest.json` 的 runId 与主树新 ledger 一致；两环境均在打包后
独立调用 `releaseEvidence()`，通过全部输入、交付及日志/报告哈希校验。独立 build 生成
的 `runId: null` 不能继承验收状态，恢复方法见 [release.md](release.md)。

主树本地发布目录：
[`release/florrio-2.0.0-e1dcb9c9469c-2026-10-31T00-48-36.371Z-b9ac5b38/`](../release/florrio-2.0.0-e1dcb9c9469c-2026-10-31T00-48-36.371Z-b9ac5b38/)。
包内 81 个产品文件共 668885 bytes，另含 build/release 两份 manifest；两环境的
`SHA256SUMS` 均验证通过。主树 tar.gz SHA-256 为
`c754d79a06a18981c81f5555eb4e55fd7808b83b6b3b3ac6c35b579560f226ab`。
主树 manifest 的 revision 是本轮起点 HEAD，源码身份包含本轮未提交改动；无 Git
副本的 revision 为 null。发布包没有对外上传或发布。

已额外将该新包解压，逐文件核对路径、长度和哈希，再通过 HTTP 与固定 Chromium
启动真实 Worker，使用可信 Enter 输入进入游戏：3 次输入发送、31 个数据包、2 个大包，
页面与 Worker 错误均为零；`window.__florr` 未安装，`/dev/test-api.js` 返回 404。
额外 smoke 结果保存在 `/tmp/florr-m3-audit-release-smoke.json`，不覆写已验收 gate 报告。

本轮还通过三个独立基线：600 个固定步长原生 tick、872 实体/600 帧绘制、2000 个
真实 native packet→TS/WorldState。主树绘制约 60 FPS，p95 18.4ms、max 19.5ms，
现有预算通过。这些只记录当前结构的工作负载结果，不构成 M4 优化前后收益证明。

04、05、06 的完成条件均已勾选；00/09 的 M3 状态同步。M4 和后续整体发布阶段
仍按各自目标单独执行。本轮未创建 Git commit。

原退役实现以 append-only 形式保存到 `archive/addenda/m3-structure/`；
原 inventory、archive/tree 和 M2 归档操作未修改或重跑。
