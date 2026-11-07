# 源码复用台账

| 源提交与位置                                                                                                              | 类别 | Wave 用法                                                                                                         | 验收                                         |
| ------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `2f90eed945f2222f0f3a836c83dbdbd9863e27bb` [tools/lib/identity.mjs](../tools/lib/identity.mjs) 的 `sha256`、`fileEntries` | A    | 沿用 Node SHA-256 和显式文件清单。Wave 记录每项大小与摘要，并用排序后的记录生成单一源码身份。仅依赖 Node 标准库。 | 快照单字节变化失败，原输入可跨目录独立复验。 |
| `2f90eed945f2222f0f3a836c83dbdbd9863e27bb` [tools/lib/browser-harness.mjs](../tools/lib/browser-harness.mjs)              | B    | 参考 Playwright 生命周期与版本记录。Wave 重新编写归档资源拦截和协议观测，依赖仅来自自己的锁文件。                 | `W0-WIRE-DISCOVERY`、`W0-WIRE-FIRST-FRAME`。 |
| `2f90eed945f2222f0f3a836c83dbdbd9863e27bb` [Vec2d](../engine/include/engine/core/vec2.hpp#L51) | A | 移植加减、乘标量和累加。Wave 使用 binary64，补充圆形约束，依赖仅为标准库。 [math.hpp](server/sim/math.hpp) | `W1-05` 零值、边界、超大实体与碰撞范围。 |
| `2f90eed945f2222f0f3a836c83dbdbd9863e27bb` [EntityPool](../engine/include/engine/model/entity_pool.hpp#L13) | B | 沿用空闲槽、代际句柄和活跃集合设计。Wave 使用按槽位排序的稀疏集合及对局命名空间，实体模型和依赖均在模拟库内。 [entity_pool.hpp](server/sim/entity_pool.hpp) | `W1-04`、`W1-05`、`W1-06` 覆盖旧句柄、槽位重用和跨房隔离。 |
