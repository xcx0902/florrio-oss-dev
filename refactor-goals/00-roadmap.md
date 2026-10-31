# 重构目标与执行路线

> 原计划编写日期：2026-10-29。原检查基点：`90f60921d0ce8d050918a282b81f01a152231664`。接续核对基点：`08e6b5b`。
> 本目录保留原计划与历史纠偏。当前 M3（04、05、06）已完成，主树及无归档干净副本均 15/15 验收通过，详见 [M3 实施记录](../docs/m3-structure.md)。其余计划中的命令和指标不据此视为全部实现或通过。

## 0. 当前进度与提前归档纠偏

**已发生的顺序错误是：「先做了 01-archive-and-disable」。** `08e6b5b` 提前执行了归档，同时完成了 02、03 的部分迁移。文件编号按主题排列，不是执行顺序；原定顺序为 M0 → 02/03 对应的 M1 → 01 对应的 M2。

提前归档后的接续规则见 [10-continuation-after-early-archive.md](10-continuation-after-early-archive.md)，02、03 的实际核验记录见 [refactor-continuation](../docs/refactor-continuation.md)。M3 延续这些边界，完成了引擎、客户端和工具链的结构收敛，并重新执行完整及无归档验收。保留有效归档，不整体回滚、不恢复历史链接、不重跑归档脚本。02、03 的旧路径作为归档前查阅位置，由 10 映射到归档或 Git。

## 1. 重构结束时应达到的状态

1. 当前产品只有一条主链：`schema/` 的产品数据与协议 → C++ 引擎、TypeScript 客户端 → `dist-next/`。保留现有交付目录名称，避免将产物改名与内部重构混在一起。
2. 原版上游、WASM/WAT、逆向 JS、反编译视图、恢复工具、oracle/parity 测试及历史验收全部进入只读归档。正常安装、生成、构建、运行、测试、性能检查和发布均不读取归档。
3. 引擎和客户端的重复数据、并行编码路径、全局可变状态及大文件按明确职责收敛；扩展实体、花瓣或 UI 时，有唯一的数据入口和可定位的实现位置。
4. 使用当前项目自己的协议、领域和真实浏览器回归验证产品；后续发布不再以“与原版等价”或“恢复函数数量”为门槛。
5. 优化有工作负载、计数器和优化前后数据支撑。确定性、游戏生命周期和资源回收有独立回归约束。

## 2. 原计划检查起点（归档前历史记录）

以下为原检查基点的源码静态结果，行数仅用于定位复杂度，不作为机械拆文件指标。这张表不表示 `08e6b5b` 的当前状态；接续实施以 10/R01 的现状对照为起点。

| 位置 | 当前情况 | 对应目标 |
| --- | --- | --- |
| `legacy/`、根目录 `web` / `upstream` / `reports`、`source/` | 已移动部分原版目录，但兼容符号链接仍使其生效；`source/runtime`、`semantic`、`decompiled` 仍在主树 | 01、03 |
| 根 `package.json` | `build` / `start` 仍指向历史 `dist`，`test` 扫描逆向测试；与 README 的 `dist-next` 主线不一致 | 02、06 |
| `tools/verification-evidence.mjs`、`verification/gates.mjs` | 当前源码身份和必选验收仍绑定 oracle、原版、parity、历史报告 | 01、02、06 |
| `tools/gen-contracts.mjs` | 完整生成仍读取 `source/semantic/server-catalogs.json`；`--check` 只覆盖 protocol-only | 03 |
| `engine/src/net/worker_api.cpp`，约 1101 行 | 当前发布、旧快照、原版客户端适配、测试字段注入集中在同一类 | 04 |
| `engine/include/engine/model/world.hpp`，约 647 行 | 实体池、世界存储、效果、事件和逆向布局模型耦合 | 04、07 |
| `engine/tests/unit/test_main.cpp`，约 5846 行 | 产品领域回归与原版适配、布局、快照实验测试混合 | 02、04 |
| `client/src/main.ts`，约 904 行 | 启动、网络、输入、游戏状态、过渡动画、绘制和测试注入全局集中 | 05 |
| `client/src/render/hud.ts` / `entity-art.ts` | 分别约 1104 / 1095 行，几何、状态、绘制、缓存职责混合 | 05、08 |
| `engine/src/sim/{ai,effects,spawn}.cpp` | 多处调用 `SpatialQuery::from_world`，部分位于逐对象循环内 | 07 |
| `client/src/render/world.ts` | 每帧收集、插值、排序、过滤、构建临时集合；主循环也重复扫描世界 | 08 |
| `tools/perf-client.mjs` | 冻结 worker 后测 872 个合成实体；不能覆盖真实模拟、解码和消息开销 | 07、08 |

## 3. 文件导航

| 文档 | 具体交付 |
| --- | --- |
| [01-archive-and-disable.md](01-archive-and-disable.md) | 归档目录、逐类迁移表、符号链接与运行入口下线、依赖断开 |
| [02-test-system.md](02-test-system.md) | oracle/parity 归档，混合测试拆分，产品测试与独立 fixture 重建 |
| [03-schema-and-generation.md](03-schema-and-generation.md) | 产品数据唯一来源、协议与原始内存布局分离、离线确定性生成 |
| [04-engine-structure.md](04-engine-structure.md) | WorkerApi、快照、World、碰撞、AI、ABI 的具体拆分与删除 |
| [05-client-structure.md](05-client-structure.md) | 应用生命周期、状态、解码、UI 几何、绘制与缓存的收敛 |
| [06-build-and-release.md](06-build-and-release.md) | 统一命令、编译源清单、打包边界、验收报告与发布流程 |
| [07-engine-performance.md](07-engine-performance.md) | 模拟性能基准、空间查询、碰撞、活跃实体、快照和输出缓冲优化 |
| [08-client-performance.md](08-client-performance.md) | 帧内工作复用、缓存预算、文本与布局、Worker 通信、真实链路基准 |
| [09-milestones-and-acceptance.md](09-milestones-and-acceptance.md) | 提交顺序、依赖、检查矩阵、验收条件与回退边界 |
| [10-continuation-after-early-archive.md](10-continuation-after-early-archive.md) | 提前执行 01 的错误记录、当前状态、02/03 接续操作与隔离验收 |

## 4. 顺序与边界

| 阶段 | 必须完成的操作 | 通过条件 |
| --- | --- | --- |
| M0：保留产品能力 | 建立当前 C++/TS 的最小独立测试、工作负载和迁移清单 | 测试的输入及预期可解释，不调用原版 |
| M1：数据与测试脱钩 | 按 02、03 迁出产品测试和数据，替换生成器与报告依赖 | 活跃链路不再需要原版文件即可验证 |
| M2：一次性停用 | 按 01 移动归档，撤销兼容链接和旧命令，建立新的 `reports/` | 归档不可访问时仍可完整构建验收 |
| M3：结构收敛 | 按 04、05、06 拆分与删除，每次保持产品测试可运行 | 已完成；单一快照与事实来源，双环境 15/15，见 [实施记录](../docs/m3-structure.md) |
| M4：性能改进 | 按 07、08 分批优化，并保存同环境对比 | 关键计数器改善，产品语义回归通过 |
| M5：发布准备 | 按 09 在干净源码副本验收并打包 | 只有产品文件进入交付，证据绑定本次产物 |

上表保留原定依赖顺序。提前执行 M2 的问题按 10 接续核验，原记录保留，不再重复移动；M3 的完成由本轮独立验收证明。不能通过跳过失败的构建和测试追认阶段完成。M0/M1 只验证当前产品，不要求继续运行或修复原版 oracle；归档不再参与任何必选步骤。M4 和 M5 整体完成状态不因本轮结构与发布工具准备自动改变。

## 5. 统一执行约定

- 每项工作使用“现有位置 → 保留/迁移/删除/替换 → 新职责 → 验证”的形式提交。
- 文中新增文件名是建议的明确落点；若实现时合并，应保持相同职责边界并更新本文档映射。
- 保留当前固定步长、输入语义、掉落与死亡流程、可见性、UI 交互。数值精度、RNG 消费顺序、碰撞顺序的改变需另列行为变更，不能藏入性能提交。
- 原版函数编号、地址及来源可留在归档的来源映射中；活跃源码使用产品领域名称。曾来自逆向的产品实现，不因名字含 `Original` 就整文件删除。
- 删除仅有历史实验消费者的实现；有现行产品消费者的实现先提取、验证，再断开历史分支。
- 不把代码行数、测试条数或一个 FPS 数值作为完成证明。以依赖断开、职责唯一、业务结果和可重复测量为准。
