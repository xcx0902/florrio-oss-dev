# 08 — 验证与最终验收

## 状态说明

本文件列出未来实施时需要执行的检查，**不是测试报告**。本次未运行下面的生成、构建、测试或性能命令，也没有复用历史报告声明当前通过。

现有脚本以当前 `package.json`、测试清单及 gate 表为准。未来新增格式和规范入口后，统一验收步骤数量会相应更新，不应硬编码历史数量。

## RF-V1：执行前基线

开始实施时记录 HEAD、工作区状态、Node/CMake/编译器/Emscripten/Chromium 版本和既有版本配置，确认适用环境及依赖。

```sh
npm run schema:check
npm run test:all
```

记录实际 runId、输入身份、步骤结果和失败日志。已有失败先定位、记录或解决；不能通过修改无关测试阈值来建立“绿色基线”。当前测试清单中真实用例和 CTest 目标数量由运行时核对。

## RF-V2：规范检查

计划新增并接入统一验收的只读命令：

```sh
npm run format:check
npm run lint
npm run check:refactor
npm --prefix client run typecheck
npm run schema:check
```

前三个命令当前尚未创建。其检查范围至少包括：

- 引擎、服务端、客户端、工具、静态 Worker、测试、配置和生成的 C++/TS。
- 编号式未知字段、旧函数/回调身份和旧内存布局依赖。
- 多语句压缩、无括号控制体、无用形参、无用导入和人为保活。
- 身份、协议字段、标志和容量在业务上下文中的裸字面量。
- 生成清单覆盖、输出可读性、工具版本和校验接入情况。

搜索只能提供线索。对正常的类构造函数、字节读取 offset、备份变量以及故障注入数字应按上下文判断。无命中不等于语义问题已解决；每一模块仍需人工按六项要求审阅。

## RF-V3：生成链验证

schema/生成器/常量修改后执行：

```sh
npm run schema:generate
npm run schema:check
npm run test:unit
```

另外验证以下性质，可优先扩展现有 `tests/unit/schema-generation.test.mjs` 和 `protocol-contracts.test.mjs`，避免新增重复测试入口：

1. 对有效输入先完成全部校验和格式化，再写入最终内容与清单。
2. 连续生成两次的输出内容、bytes、SHA-256 和输出清单完全相同。
3. `--check` 不改任何文件，能检测缺失、陈旧、孤立和未登记输出。
4. 无效输入不会部分覆盖旧输出。
5. symbol 唯一且无语言转换冲突；稀疏 ID、合法边界、无效引用仍正确处理。
6. 删除字段不会因 join、默认值、对象展开或模板遗留而重新出现。
7. 协议字段/组件覆盖完整、无重复、类型正确，dense 顺序及公共字段 mask 保持一致。

清单当前为 26 个输出（P2 增加了身份、标志和容量视图）；以更新后的真实输出集合验收。不能只更新固定数量断言而跳过缺失或陈旧文件。

catalog schema 改名或删除 metadata 会改变 hash。两端使用同批生成结果，匹配身份的握手应成功，不匹配身份仍按当前约定拒绝。不可伪造旧 hash 来掩盖输入变化。

## RF-V4：阶段验证矩阵

| 修改范围                           | 所需验证                                                   | 重点观察                                               |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| 仅注释和当前说明                   | 规范扫描、引用和链接检查                                   | 不丢失当前精度、顺序和生命周期约束                     |
| 全项目格式和生成模板排版           | 格式/lint、schema、引擎/服务端/客户端构建及全量验收        | 控制作用域、析构时机、自动分号和模板行为               |
| catalog ID、flags、字段和行为      | schema 单元、引擎、WASM、native → TS、客户端及多人相关测试 | 数值、bit、握手身份、出生和花瓣行为                    |
| constructor/offset 和 dense 组迁移 | 协议手写向量、引擎编码、客户端稀疏/dense、跨端、多人 codec | 字节、顺序、组件存在性、公开/私有字段、错误回滚        |
| C++ 接口参数                       | native/wasm 编译及受影响 sim/server 测试                   | 头文件/定义/函数指针一致、无副作用丢失                 |
| 绘图/状态参数                      | TS typecheck、客户端单元及相应浏览器场景                   | 时间、默认 phase、flash、seed、卡片和动画行为          |
| 出生、解绑、生命周期去重           | 固定 seed 引擎测试、相关跨端与浏览器回归                   | RNG 次序、孩子实体、充值、死亡和删除时序               |
| 工具、脚本、CMake 收敛             | tools suite、真实构建、测试清单校验、交付校验              | 无目标遗漏、无零测试成功、core/adapter/server 边界保持 |
| 缓存/状态表示简化                  | 状态/结构回归及已有性能场景                                | 重连/reset、handle 复用、缓存失效与资源释放            |

只运行与当前差异相关的阶段检查；新修改扩大影响范围或暴露问题时再扩大验证。最终阶段必须运行全量验收，阶段通过不能替代最终结果。

## RF-V5：现有命令及依赖顺序

以下都是现有入口，按相关范围选择，构建步骤在消费者测试之前完成：

```sh
npm run test:unit
npm run test:tools
npm run test:engine
npm run test:server:native
npm run build:engine:wasm
npm run test:client
npm run test:integration
npm run build:dist-next
npm run verify:dist-next
npm run test:delivery
```

`test:engine`、`test:server:native`、`test:client` 和 `test:integration` 已包含各自脚本声明的部分构建，但不能假设它们会补齐全部 Worker/browser 前置产物。`test:delivery` 需要当前 `dist-next`。有依赖顺序时优先由 `test:all` 的 gate 表组织，不并发覆盖同一产物或验证报告。

不要将源码格式变化导致的 build/source hash 更新误判为行为变化；同时也不能因此放宽独立 wire 向量、时序和数值断言。

## RF-V6：高风险行为场景

至少保留并按改动补足以下当前产品场景：

- 花瓣：三种 Rose 治疗、启动时限、治疗阻断、Wing、Peas、Web、Egg、共享轨道、Antennae 和被动能力。
- 物理/出生：质量响应与固定物体路径、Web 标记、碰撞过滤、动态物种半径、固定 seed 掉落和种群补充。
- 生命周期：主人/花瓣/宠物死亡、连续销毁、尸体期限、掉落拾取、背包已满、充值、重生、handle generation 复用。
- 协议：稀疏/dense、合法最大 ID、未知或越界字段、截断、组件 mask、全量/增量、事务失败及删除回滚。
- 多人：身份绑定、公开/私有数据、PVP 开关、重连和 resync、事件去重、预测和插值。
- 客户端：world/icon/menu 各绘图入口、DPR/触摸、绘制与点击共用布局、闪烁与动画相位。
- 工程：Worker RPC/错误/超时/终止、ABI 核对、独立交付入口和资源清理。

不为已充分覆盖的简单改名增加镜像实现式测试。需要新增断言时保护真正可能改变的行为，不断言旧字段名、旧内存布局或 formatter 的字符串细节。

## RF-V7：最终全量与干净副本

在最终源码上运行规范检查和：

```sh
npm run test:all
```

其 gate 表当前还包含浏览器和三类现有性能工作负载，未来必须连同新增规范 gate 一起通过。不降低现有性能预算，不复用重构前成功报告，不跳过失败的必需场景。

随后在全新目录验证，下面是未来执行示例：

```sh
task_clean_root=$(mktemp -d /tmp/florrio-refactor-XXXXXX)
rsync -a \
  --exclude='.git' \
  --exclude='archive' \
  --exclude='node_modules' \
  --exclude='build' \
  --exclude='engine/build-*' \
  --exclude='dist*' \
  --exclude='reports' \
  --exclude='release' \
  --exclude='.emcache' \
  ./ "$task_clean_root/"
cd "$task_clean_root"
npm ci
npm run test:all
```

干净目录使用相同、已准备好的 C++/Emscripten/Chromium/格式工具环境。依赖安装可以使用现有缓存或按环境联网安装，产品生成和运行不能读取归档。先确认新规范 gate 已接入 `test:all`；未接入即视为实施未完成。

比较两次执行的最终源输入和生成结果身份、协议和行为结果；日志时间、runId、绝对路径不要求相同。

## 最终验收表

| 用户要求       | 必须提供的证据                                                 |
| -------------- | -------------------------------------------------------------- |
| 无意义字段治理 | 全量处置表、删除链完整性、有效 flags 语义和相关行为结果        |
| 无原版实现引用 | 活动 schema/源码/测试/注释扫描和语义审阅；历史运行时表示已删除 |
| 字面量规范     | 单一符号源、两端值一致、业务调用点检查、特殊原始数字的明确用途 |
| 格式与可读性   | 全范围 format/lint 结果，生成输出检查，重点复杂流程人工审阅    |
| 无用参数治理   | 最终签名与调用清单、类型/编译结果和默认值行为回归              |
| 精简与去重     | 死代码处置和共同职责收敛记录；独立测试未被生产实现替换         |

最终记录需注明实际命令、工具版本、完成时间、退出状态、runId/日志位置和未解决事项。只有六项全部满足且所需验证完成后，才能将计划改为已实施。任何环境缺失、失败或未运行都应按实际状态记录。
