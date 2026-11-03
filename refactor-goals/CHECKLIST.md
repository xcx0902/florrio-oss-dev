# 实施清单

**当前状态：P0 基线与 P1 格式/工具已完成；P2–P7 未开始。**

日期和基线见 [README](README.md)。实际执行时逐项填写证据；复选框只在对应工作及检查真正完成后勾选。不能因本次提供了计划就把实施项标记完成。

## P0 — 当前基线

- [x] 核对当前 HEAD、工作区和适用约定，确认与审阅基线的差异。证据：[p0-baseline](evidence/p0-baseline.md) §1–2。
- [x] 核对工具版本、依赖、浏览器、Emscripten 和前置环境。证据：[p0-baseline](evidence/p0-baseline.md) §2。
- [x] 运行当前 schema 和全量验收，记录真实结果及已有失败。证据：`schema:check` 20 outputs；基线 `test:all` 17/17，runId `2026-11-02T23-11-30.963Z-d140d940`，见 [p0-baseline](evidence/p0-baseline.md) §3–5。
- [x] 完成全量字段读写/导出/序列化处置表。证据：[p0-field-disposition](evidence/p0-field-disposition.md) 与 891 行 [p0-field-inventory](evidence/p0-field-inventory.md)。
- [x] 完成参数、死代码、业务字面量和历史表示清单。证据：[p0-literals-parameters-deadcode](evidence/p0-literals-parameters-deadcode.md)（A01–A05、D01–D06、L01–L06、H01–H10）。
- [x] 确认保护字节、精度、RNG、生命周期和跨端行为的现有用例及缺口。证据：[p0-protected-scenarios](evidence/p0-protected-scenarios.md)，缺口 G01–G06。

## P1 — 格式和工具

- [x] 新增统一编辑、TS/JS、C++ 及配置格式约定，锁定工具版本。证据：[p1-format-batch](evidence/p1-format-batch.md) §1–2；`.editorconfig`、`.prettierrc.json`、`.clang-format`、`.cmake-format.yaml`、`tools/format-tools.lock.json`。
- [x] 建立 `format`、`format:check`、`lint`、`check:refactor`。证据：`package.json`、`tools/format.mjs`、`eslint.config.mjs`、`tools/check-refactor.mjs`；[p1-format-batch](evidence/p1-format-batch.md) §5。
- [x] 将规范检查接入统一 gate 和适用的轻量入口。证据：`tools/verification/gates.mjs` 的 format/lint/refactor rules 三个 gate；`test:light` 与 Linux CI 同步。
- [x] 先格式化生成文本，再计算内容身份和输出清单。证据：`tools/schema/outputs.mjs`、`tools/schema/format.mjs`、`tools/schema/write.mjs`；`schema:check` 20/20。
- [x] 展开网络、服务端、生成器和测试中的压缩逻辑。证据：[p1-format-batch](evidence/p1-format-batch.md) §4；重写 `FLORR_SERVER_NUMBERS` 宏为逐项一行。
- [x] 完成其余手写代码、静态入口和生成输出的格式整改。证据：[p1-format-batch](evidence/p1-format-batch.md) §4；`format` 覆盖 503 个文件、20 个生成输出。
- [x] 单独审查格式差异并完成对应验证。证据：[p1-format-batch](evidence/p1-format-batch.md) §5–6；最终 `test:all` 20/20 stable，runId `2026-11-03T00-42-22.702Z-88087b63`。

## P2 — 标识和常量

- [ ] 为全部花瓣、生物定义稳定唯一 symbol，并校验语言转换冲突。
- [ ] 从单一 schema 生成 C++/TS 身份类型，登记新增输出。
- [ ] 统一并复用实际稀有度、opcode、事件、动作和消息类型。
- [ ] 命名实际 snapshot 字段、组件、标志和协议上限。
- [ ] 按职责整理 slot/instance/容量、解锁、计时和数值规则。
- [ ] 替换业务裸 ID，移除对 ID 连续性和算术差值的族群假设。
- [ ] 验证数值不变、稀疏 ID、未知 ID 和跨端生成一致性。

## P3 — 字段和行为

- [ ] 核查并删除无实际消费的 `opaque*` 全链字段。
- [ ] 核查并删除 `flags92`/`component_flags92` 及无效断言。
- [ ] 分别处理 catalog 的 `physicsFlag48` 与运行时物理字段。
- [ ] 为有效实体/世界/物理/action/activity 标志建立具名类型和位。
- [ ] 将轨道函数编号替换为行为类型及真正需要的参数。
- [ ] 将 AI 历史回调编号替换为当前攻击行为类型。
- [ ] 审查 `HitEvent` 重复计数和其他无用字段。
- [ ] 保持掉落抽取和其他必要状态的当前作用及随机顺序。
- [ ] schema、生成器、运行时、测试和当前文档同步完成。
- [ ] 相关引擎、客户端、跨端和多人验证通过。

## P4 — 当前协议模型

- [ ] 完成所有字段和 dense 组的迁移对照表。
- [ ] 移除 schema 中的旧构造函数编号和内存 offset。
- [ ] 用当前组件标识替换 dense 组旧 offset key 与查询接口。
- [ ] 移除客户端 `components[constructor][offset]` 及重复合并状态。
- [ ] 更新多人公开组策略，保持公开字段和真实 mask 不变。
- [ ] 核查并处理旧输出 packet 内存 metadata 和 worker args metadata。
- [ ] 删除公共旧名、永久适配、历史布局断言及相关说明。
- [ ] 字节向量、dense/稀疏、事务失败、跨端及多人测试通过。

## P5 — 函数接口

- [ ] 删除两处轨道 helper 中未使用的 World 参数。
- [ ] 处理 `renderable`、`drawAnt`、`drawCactus`、`drawDrop` 的无用参数。
- [ ] 处理 `drawPetalShape` 的 icon 参数及实际时间默认值语义。
- [ ] 审阅其余 C++/TS/JS、生成器及测试 helper 参数。
- [ ] 同步所有声明、实现、调用、回调、导出和测试。
- [ ] 无旧签名包装、占位传参和隐藏副作用，相关验证通过。

## P6 — 精简与当前说明

- [ ] 删除 `orbit_angle_for` 和无用途保活指针等死代码。
- [ ] 收敛出生 factory，保留随机调用和空间索引同步次序。
- [ ] 收敛花瓣解绑共同步骤，保持充值/死亡/孵化差异。
- [ ] 清除 snapshot 镜像、无用 alias 和 fallback，核对缓存失效。
- [ ] 合并测试 helper 内部重复，保留独立向量与参考验证。
- [ ] 核对重复脚本、CMake 设置、imports/includes/re-exports 和动态入口。
- [ ] 重写全部活动代码、注释和测试名中的原版实现引用。
- [ ] 更新当前 semantics/protocol/catalog/README，历史记录属性清楚。
- [ ] 全量处置表无未决项，相关回归和性能验证通过。

## P7 — 最终验收

- [ ] 按六项用户要求逐模块复审，无压缩代码及历史表示残留。
- [ ] 最终规范检查、类型检查和 schema 只读检查通过。
- [ ] 生成可复现，失败不部分写入，清单与最终内容一致。
- [ ] 最终 `test:all` 全步骤通过，未降低阈值或跳过必需场景。
- [ ] 干净副本无需归档或旧产物即可重建并通过相同验收。
- [ ] catalog 身份、wire 行为、玩法、存储和外部 ABI 变化已按约定核对。
- [ ] Git 差异没有混入构建、缓存、依赖和旧报告。
- [ ] 填写实际命令、版本、runId、证据位置和交付说明。

## 执行记录模板

| 阶段/任务             | 实际状态 | 变更文件/符号                                                                                                                                                                      | 验证命令与结果                                                                                                                        | 证据/runId                                                                                                                                                                                                                                                   | 日期       |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| P0 当前基线           | 完成     | 无产品改动，仅证据                                                                                                                                                                 | `schema:check` 20 outputs；基线 `test:all` 17/17；unit 41、tools 24、client unit 143、integration 9、browser 88、engine 19、server 30 | runId `2026-11-02T23-11-30.963Z-d140d940`；[p0-baseline](evidence/p0-baseline.md)                                                                                                                                                                            | 2026-11-03 |
| P0 字段/参数/保护清单 | 完成     | 无产品改动，新增证据与生成脚本                                                                                                                                                     | 891 行字段表；A/D/L/H 清单；G01–G06 缺口                                                                                              | [p0-field-disposition](evidence/p0-field-disposition.md)、[p0-field-inventory](evidence/p0-field-inventory.md)、[p0-literals-parameters-deadcode](evidence/p0-literals-parameters-deadcode.md)、[p0-protected-scenarios](evidence/p0-protected-scenarios.md) | 2026-11-03 |
| P1 格式工具与接入     | 完成     | `.editorconfig`、`.prettierrc.json`、`.clang-format`、`.cmake-format.yaml`、`eslint.config.mjs`、`tools/format.mjs`、`tools/check-refactor.mjs`、`tools/verification/gates.mjs` 等 | `format:check`、`lint`、`check:refactor`、`schema:check` 全通过；`test:all` 20/20 stable                                              | runId `2026-11-03T00-42-22.702Z-88087b63`；[p1-format-batch](evidence/p1-format-batch.md)                                                                                                                                                                    | 2026-11-03 |
| P1 性能回归修复       | 完成     | `tools/performance/browser.mjs`                                                                                                                                                    | 首次 54.6 FPS 失败；修复 warmup 起点后 60.005 FPS，20/20 通过                                                                         | 同上 runId；[p1-format-batch](evidence/p1-format-batch.md) §4–5                                                                                                                                                                                              | 2026-11-03 |
