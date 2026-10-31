# M00：冻结基线与架构契约

状态：未开始。依赖：无。产出：可追溯基线、新架构 ADR、参数与规则决策、后续阶段可直接使用的测试约定。

## 00.1 当前代码事实

| 事实 | 当前落点 | 后续处理 |
| --- | --- | --- |
| 原生和 WASM 共享 `engine_core` | `engine/CMakeLists.txt`、`engine/sources.cmake` | M01 保留共享领域逻辑，拆适配器 |
| core 源表仍含 WorkerApi、WASM ABI 和诊断 | `engine/sources.cmake` | 避免正式服务拉入单例/调试导出 |
| 单份玩家资料、装备、输入、死亡与区域状态 | `engine/include/engine/model/world.hpp` | M02 按玩家迁移 |
| 第二次正常出生会被已有玩家阻止 | `engine/src/sim/player.cpp` | M02 正式支持多个 PlayerId |
| 输入序号、出生门槛、输出队列仅一份 | `engine/include/engine/net/worker_api.hpp`、`engine/src/net/worker_api.cpp` | M02/M05 按连接与玩家拆分 |
| 发布器会消费共享删除/命中/拾取记录 | `engine/src/net/snapshot_publisher.cpp` | M04 两阶段冻结与清理 |
| 每个玩家实体的 profile/loadout 发布自同一份 World | 同上 | 区分实体所属玩家与观察者 |
| 本地玩家取第一个 kind=1 | `client/src/state/world.ts` | M06 用显式控制身份 |
| 客户端决定 think/flush 的节奏 | `client/src/app/simulation-loop.ts` | M05 服务端时钟、M06 输入泵 |
| 现有交付和验证强制依赖 WASM | `tools/build-dist-next.mjs`、`tools/verification/gates.mjs` | M08 增加 profile，保留严格证据约束 |
| 测试 suite 名称、CTest 清单是封闭集合 | `tools/test-manifest.mjs`、`tests/product-tests.json` | 新增 suite 时同步 runner/清单/工具测试 |
| 源码身份未包含 `server/` 和根 CMake | `tools/lib/identity.mjs` | M01/M08 补齐原生身份 |

先前分析中执行过原生 11 个 CTest 和临时探针，证明改造可行；这些不能替代新阶段的正式回归，也不能当作多人通过报告。

## 00.2 执行步骤

1. 记录当前提交、工作区差异、Node/CMake/C++ 编译器/固定 Chromium 和 Emscripten 版本，输出 `reports/multiplayer/baseline/environment.json`。已有用户改动只记录，不重置。
2. 执行当前 `npm run test:all`，保存本次实际 runId；失败则先区分已有失败与改造引入的失败，修复前不能声明基线通过。不复用旧的 passed JSON。
3. 记录 native 单玩家移动/战斗/死亡/重生的有种子场景和关键摘要：tick、RNG、实体、血量、装备、掉落。摘要比较领域行为，不比较 C++ 对象地址或未定义 padding。
4. 把三个临时结论转成正式回归需求：双出生、输入序号独立、两个观察者收到同一删除/命中事件。测试在对应阶段引入，不能先提交一个永远跳过的测试。
5. 新增 `docs/adr/0002-native-authoritative-multiplayer.md`，说明它如何扩展 ADR 0001；明确原生服务是联机产品权威运行时，离线 Worker 只是兼容适配器。
6. 在 ADR 固定 PlayerId/EntityHandle/LifeEpoch/ConnectionId/RoomEpoch/SessionEpoch 语义、单房间单写者、模拟阶段顺序、重连身份和全量重置规则。
7. 锁定网络库和依赖获取方式。首选评估 Boost.Asio/Beast；记录所选精确版本、校验、许可证、Linux/macOS 构建方式、异步读写/超时接口。依赖进入锁定清单，不使用浮动分支或发布时自动下载 latest。
8. 固定 FFA 规则：保留现有数值；玩家本体碰撞按双方实际等级计算现行系数；花瓣/宠物/投射物按已有伤害与归属规则处理；首版玩家击杀不额外新增 XP 奖励，怪物 XP 归实际击杀者；双方同时死亡按既有稳定接触顺序结算。
9. 固定拾取争抢：符合条件的存活玩家中距离最近者优先，距离相同按 PlayerId 升序；一次掉落只能发给一个玩家，完成转移前保留接收者归属。
10. 固定断线策略：10 秒保留期，身体仍参与 PVP；超时输入中立。保留期结束统一离场清理；清理不伪造一次击杀、经验或第二次掉落。显式离开也不能立刻移除身体规避伤害。
11. 将 README 的初始参数整理为配置契约。数值改变必须标明是规则变更、容量实测调整还是连接保护；不能混在接口重构中。
12. 为每个阶段确定测试名字和执行入口；新增 suite 时先实现清单校验，再接 gate。本文后续命令均为计划，不先修改产品启动行为。

## 00.3 约束与验证

- 不把历史 `archive/` 内容重新接入构建、测试或运行时。
- 不为多人分支复制第二套 damage、petal 或 snapshot codec；先提取共用领域函数。
- 字节协议不能直接发送原生 C++ struct，必须明确字节序、宽度、长度和错误路径。
- 断线、死亡、重生、离开和房间销毁分别定义，不能都调用 `World::reset()`。
- 每份新报告携带本次 runId、源码身份、构建配置、平台、种子与完整性标记。

## 00.4 完成条件

- [ ] 当前基线重新运行，结果和失败项都有记录。
- [ ] ADR 0002 固定身份、时序、复制、PVP 规则和网络依赖。
- [ ] 计划中的新命令与现有命令明确区分。
- [ ] 所有新路径有明确归属；后续实现不用再次猜测玩家生命周期或拾取规则。

建议提交：`docs: define native multiplayer architecture and baseline`。
