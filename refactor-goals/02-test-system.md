# 02：归档 oracle/parity，重建产品自己的回归体系

> 状态：`08e6b5b` 已完成部分测试归档、迁出及 helper 提取，产品覆盖和完整入口仍待核验补齐。本次仅作静态核对和文档更新，未运行测试。

## T00. 提前归档后的实际执行方式

此次存在**「先做了 01-archive-and-disable」的顺序错误**，当前先按 [10/R03](10-continuation-after-early-archive.md#r03-先补-02-的最低产品回归再改数据和生成器) 补最低产品回归，再按 R06 补跨端与完整发现入口。旧文件不在活跃目录不构成阻塞：整文件归档查 `archive/tree/`，混合文件中删除的测试块查 `git show cc17564:原路径`。

当前已有 `tests/unit/protocol-contracts.test.mjs`、两个 `tests/tools/` 文件和 `recording-canvas.mjs`，应对照原断言核验，不重复搬迁。活跃客户端顶层测试现有 13 个；整文件归档的 `text-cache.test.mjs` 需要重建纯产品 harness，不能复制其会加载原版的共享初始化。新增用例必须同步接入 `tools/run-verification.mjs` 的现有硬编码清单，避免完整验收遗漏。

下文 T01/T02 中的原数量、旧路径与初筛结果来自归档前基点，作为迁移审计清单保留。后续按“已迁移待核验、待补齐、历史退役、已核验”逐项登记；不能把旧文件不存在或剩余用例通过视为本章全部完成。

## T01. 按依赖和断言内容拆分，避免误删产品回归

归档前根 `test/` 有 331 个 `*.test.mjs`；静态关键字初筛发现其中 324 个直接提到旧来源或 parity，剩余文件也包含间接依赖。例如 `server-petal-world.test.mjs`、`server-replay.test.mjs` 经 `helpers/server-world.mjs` 使用旧 JS 实现，`server-state-comparator.test.mjs` 直接导入 parity 比较器。不能把“未出现 loadOriginal”当作可保留依据。

建立迁移表：每个测试记录测试文件、断言主题、传递依赖、是否执行原件、是否读取旧 golden、目标文件与保留理由。混合文件细分到测试块，不用跳过标记掩盖未完成迁移。

| 现有测试 | 处理方式 | 产品落点建议 |
| --- | --- | --- |
| `test/client-*.test.mjs`、大部分 `server-*.test.mjs` 与四个旧 helpers | 原版函数/恢复函数比较整体归档 | 不加入产品测试清单 |
| `test/javascript-recovery.test.mjs`、`server-state-comparator.test.mjs` | 归档 | 对应的恢复器/比较器已退出产品 |
| `test/protocol-contracts.test.mjs` | 保留协议编译、格式验证、失效生成物等断言；去掉针对原版材料的要求 | `tests/unit/protocol-contracts.test.mjs` |
| `test/tools-delivery.test.mjs` | 保留缺文件、损坏、源码过期、编译失败、锁和原子替换回归；旧 archive/frozen 断言归档 | `tests/tools/delivery.test.mjs` |
| `test/tools-runner.test.mjs` | 保留执行失败/中断、锁释放、陈旧证据拒绝；oracle gate 固定集合等历史断言归档 | `tests/tools/verification.test.mjs` |
| `engine/tests/oracle/*` | 全部归档 | 删除构建目标和调用方 |
| `engine/tests/unit/test_original_client_adapter.hpp` 和注册调用 | 归档 | 当前 domain publisher 另建独立测试 |
| `engine/tests/unit/test_schema_contracts*` | 原始内存布局、saved oracle probe 断言归档 | 产品协议和实际 ABI 宽度断言按 03/04 保留 |
| `tests/parity/**` | 整体归档，含 `next` / `next-ui-v2` 自一致性与 production 录制 | 不复制目录或改名后继续运行旧 parity |

## T02. 客户端测试必须处理混合文件和间接 golden

归档前 `client/tests/` 有 35 个顶层 `*.test.mjs`。其中 23 个直接命中原版/逆向/parity 引用；还有未命中该初筛规则、实际读取旧快照的文件。以下措施逐项对照当前迁移结果，已迁出者核验，未保留的产品覆盖重新编写：

1. `angle-interpolation.test.mjs`、`petal-art.test.mjs`、`drop-art.test.mjs`、`rendering-parity.test.mjs`、`menu-input-parity.test.mjs`、`ui-detail-parity.test.mjs` 等原版比较部分完整归档。
2. `text-cache.test.mjs` 中旧 `func444`、WASM 导出和 `source/game/client/text.mjs` 比较归档；缓存 owner 隔离、文本变化重绘、尺寸变化、资源释放等产品行为迁为纯客户端测试。
3. `menu-controls.test.mjs` 中原版 changelog、滚轮函数与原版采样曲线归档；IME、昵称持久化、焦点、滚动条、面板切换、tooltip hover 等真实交互保留。
4. `worker-shim.test.mjs` 拆成 `worker-rpc`、`snapshot-codec`、`worker-browser` 三类；原版参考、skeleton 和仅用于注入全部历史字段的实验部分归档。当前协议的 dense、delta、事件、删除和真实 worker 通路保留。
5. `render-golden.test.mjs` 明确读取 `tests/parity/next-ui-v2`，不能作为“纯客户端测试”直接保留；`camera-golden.test.mjs` 等所有 golden 文件也逐个追踪输入来源。
6. `loadout.test.mjs`、`death-lifecycle.test.mjs`、`death-pickup-regression.test.mjs`、`menu-animation.test.mjs`、`movement-helper.test.mjs`、`petal-transfers.test.mjs`、`snapshot-domain.test.mjs` 等作为产品回归候选，仍需核对完整 import/数据读取链。

`RenderingCanvas` 这样的记录型画布可以提取为 `client/tests/helpers/recording-canvas.mjs`，只保留领域测试需要的矩阵、绘制和样式记录。新 helper 禁止导入 `loadOriginal`、WASM 追加导出器或归档路径；不能通过继续引用旧 `rendering-oracle.mjs` 来“复用一部分”。

## T03. 测试布局与发现范围

建议保留客户端和引擎测试靠近各自源码，同时把根工具测试迁入统一 `tests/`：

```text
engine/tests/unit/             核心数学、实体、模拟、当前发布
client/tests/unit/             状态、解码、输入、布局、缓存
client/tests/integration/      页面、Worker、交互和生命周期
tests/unit/                    跨端协议/schema 规则
tests/tools/                   生成、打包、报告、锁和失败路径
tests/integration/             C++/wasm → TS 的真实链路
tests/fixtures/product/        项目自己定义的输入、期望和必要图像
tests/performance/             基准场景定义；输出写 reports/performance/
```

实现一个显式测试清单或按以上活跃根发现的 runner。禁止全仓库 `node --test` 自动递归进入 `archive/`，禁止以排除个别旧文件的黑名单维持体系。每类要求至少发现一个测试，零测试、浏览器缺失、必需 fixture 缺失均失败。

## T04. 保留原有领域覆盖，改变预期来源

原版退役不等于只留下“能启动”测试。以下是必须补足/迁移的产品契约：

| 主题 | 输入与需要验证的产品结果 |
| --- | --- |
| 实体池 | 分配/销毁/复用；旧 generation handle 无效；池满行为确定；保留 FIFO 规则 |
| tick | 固定 50ms、阶段先后、出生/死亡时机、固定种子与输入可重复 |
| 碰撞与 AI | 目标选择、owner 排除、同 tick 多接触顺序、实体死亡中断、子实体边界 |
| 花瓣与负载 | 装备/储备/交换/丢弃、多个实例、充能、Peas/Egg/Web/Rose、被动与宠物 |
| 死亡/掉落 | player/mob/projectile/petal 生命周期、尸体、经验、保留物、拾取 event14、背包已满 |
| 快照 | 初始化为空视图、首次 join、离开/重入可见集、字段 delta、省略与零值区别、事件顺序 |
| 解码 | 截断包、非法 varint、缺组件 dense、未知字段策略；失败包不污染下一包状态 |
| UI | 开始、死亡、回菜单、重生、输入焦点、键盘/拖放、触控、DPR/resize、tooltip 命中 |
| 构建交付 | 过期 JS/wasm 被拒绝；编译失败保留旧产物；缺文件/额外文件/错哈希被拒绝 |

预期来自已书面定义的产品规则、小型手工字节样例或当前引擎真实运行；不得在测试运行时从归档查询答案。

## T05. 独立 fixture 与跨端验证

1. 把当前协议的少量手工字节向量提交到 `tests/fixtures/product/protocol/`，每个说明字段、字节序、数组长度和预期；测试预期不能只调用同一个生成函数计算。
2. 新增 native fixture 程序，经实际 `WorkerApi` 输入/think/发布路径生成确定的包；TS 解码后断言实体、库存、删除和事件。它是当前项目跨端集成程序，不使用旧 `engine_native_replay` 的原版输入。
3. 检查引擎构建与交付 wasm 的 ABI、事件和语义一致，不以“C++ 与 TS 都读同一错误 schema”作为充分证明；保留手工向量和领域断言。
4. 有限的产品视觉回归只比较本项目已审阅的布局、样式和截图，存入独立产品 fixture；不复用原版 canvas 操作次数、0 尺寸矩形或逐指令顺序要求。
5. fixture 更新必须记录变更原因和对应产品规则；普通测试不允许自动更新预期。旧原版截图保留在归档，不替换为新产品基线。

`tests/parity/` 的大量输出被 `.gitignore` 忽略，新克隆并不一定有。新测试所需的小型预期必须明确纳入 Git，禁止依赖本地历史录制偶然存在。

## T06. 引擎巨型测试文件拆分

把 `test_main.cpp` 的简单 runner/CHECK 支持抽成 `engine/tests/support/`；按 `core`、`entity_pool`、`spawn`、`ai`、`collision`、`combat_death`、`effects`、`loadout`、`snapshot`、`worker_api` 划分测试单元。已有 centipede、projectile、rose、passives/pets 等专项回归保留，重复 setup 合并为小型场景构造器。

原始 1152-byte scratch frame、原版内存布局、原版适配与旧 skeleton 的测试连同实现归档。测试拆分前后提供逐测试名映射，防止遗漏；不把所有测试机械拆成同名小文件，也不建立复杂注册框架。

## T07. 运行入口与验收

目标命令由 06 统一提供：`test:unit`、`test:tools`、`test:engine`、`test:client`、`test:integration`、`test:delivery`、`test:all`。`test:all` 只验证产品；不再有原版 oracle、严格 parity、原版+engine 或恢复覆盖率 gate。

- [ ] 所有旧 oracle/parity 用例、辅助器、golden 的去向有清单。
- [ ] 混合文件中保留的产品测试已迁移，未以 skip/todo 计作完成。
- [ ] native CTest 注册集合与新 runner 清单可列出并核对，归档目标为零。
- [ ] 缺测试、缺 fixture、错误报告、失败子进程会产生非零退出码。
- [ ] 清洁副本不带 `source/`、`legacy/`、`reference/`、旧产物和归档，也可运行完整产品测试。
- [ ] 新报告中的状态表示本次产品测试结果，不沿用原版等价结论或历史通过计数。
