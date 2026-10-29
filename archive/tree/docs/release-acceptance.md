# 2026-10-25 本地发布验收

> **当前变更说明（2026-10-25）**：本页三轮验收属于下列旧源码身份。用户随后发现实际首页、掉落图案、花瓣、Inventory 和死亡返回缺口；本轮修复、独立回归与重建交付见 [UI 修复记录](ui-repair.md) 和 [`summary.json`](../reports/ui-repair/summary.json)。本页保留历史结果，不能替代当前源码的完整验收。

当前 UI 修复已完成独立的最终完整验收：`2026-10-25T14-09-21.352Z-166531b5`，26/26 步通过、身份稳定。实际计数为 JavaScript 940、engine 110、client 222、delivery 54、browser 47 项全通过，CTest 5/5；原版 Canvas、像素及 24 个生产交互录制均通过。当前身份以本轮 `summary.json` 为准，下文三轮及其旧身份继续作为历史记录；远端 Linux CI 仍未执行。

本页由三份实际完整验收及真实归档/恢复记录汇总。机器可核验入口为 [`release-acceptance.json`](../reports/release-acceptance.json)，历史审计、原版 golden、输入和容差均未改写。

## 运行身份

| 阶段 | Run ID | 完整步骤 | 结果 |
| --- | --- | ---: | --- |
| pre-move | 2026-10-25T11-02-46.594Z-3d1d3f7c | 26 | 通过 |
| pre-move | 2026-10-25T11-32-28.445Z-0ad06452 | 26 | 通过 |
| post-move | 2026-10-25T11-56-33.590Z-d7d59eb3 | 26 | 通过 |

三轮 source/client/oracle 身份相同；每轮各自绑定其实际 delivery manifest。

| 身份 | SHA-256 |
| --- | --- |
| Source | `deba8911ac1cf47265a32710ddc109e1d183920e75d24546deb6c595e51cbfe4` |
| Client | `6755163635c327b4d5b8029f50f1c850797a4628100fb5f0a030da6711fba3eb` |
| Oracle | `3fc523f4fd030380bc397edb361c2c998f44e1e104fa8610b2e454051a49d8fc` |
| WASM | `ae9b05ee73eb684af07bc38bb91cb90ad186a3480e0b9670cb66ce83d89cedb9` |
| 最终 delivery | `aaacd9c48d271bd3ac1597a0b038b3243a1c27d600d4480fb4fe200a42b97ae5` |

WASM 260183 B；交付清单为 `dist-next/build-manifest.json`。JavaScript 937/937、engine TAP 110/110、client 195/195、delivery 47/47、browser 47/47；CTest 5 个目标（core/sim/peer及schema合约检查）全通过。以上 TAP 数不把 CTest 目标数量混为一个 TAP 数。

## 结构与协议

关键布局断言进入native与WASM真实编译；新增CTest将10个布局、114个字段和9个全局地址对照当前YAML，并复用哈希锁定的82条原目录记录及World数组几何。覆盖与未知边界见 [schema-coverage.md](schema-coverage.md)：低置信度空间布局仍只是明确标注的假设，不宣称所有原对象内存已还原。协议字段、19个dense组及组件位置从YAML生成，C++与TS消费生成表；生成一致性和拒绝非法schema的回归进入完整验收。域协议与原client独立适配的既有边界保留，field26永久扩展不变。

## 行为与渲染

- 原版 server 短 strict 8/8；长 strict 八场景各 1000 tick，逐 tick identity/type/kind/有限数值检查，mismatchedTicks 全为 0。
- Hornet 14 个受控原版对照 fixture 全通过，包括范围、保留/失效目标、冷却边界、寿命和命中。
- 完整 Canvas：八场景各三帧，opcode、顺序、setter、参数和资源/Path2D，容差 0.0001，issueCount 全为 0。
- 生产交互：24 个真实 Worker 录制，desktop/retina/touch 全部通过；伤害来自实际 event11，背包采用 field60 权威状态。
- 原客户端+C++：八场景进入正确菜单/游戏；原生 world/controller 与双向引用、同 RAF 主画布命令均有效。death 追加可信移动/攻防，解码花瓣展开/收缩，health0+fade→解绑→新 handle 重开，并跨 sequence128。若使用 opcode3 suicide，在报告 deviations 明示，不声称自然 mob 死亡，也不声称原客户端快照逐字节等价。

| 场景 | 变化像素 | ratio | max channel delta |
| --- | ---: | ---: | ---: |
| boot-menu | 0 | 0 | 0 |
| garden-idle | 0 | 0 | 0 |
| move | 4 | 0.000004340277777777778 | 5 |
| attack | 4 | 0.000004340277777777778 | 5 |
| equip | 0 | 0 | 0 |
| damage | 0 | 0 | 0 |
| death | 0 | 0 | 0 |
| spawn | 0 | 0 | 0 |

像素阈值始终为 ratio ≤0.001、max ≤8；未通过 mask/放宽阈值隐藏残差。

## 性能

实际交付树重新测量 600 帧：平均 16.667 ms、p95 17.400 ms、最大 18.000 ms；heap delta 1456706 B，预算门禁通过。

完整验收的 delivery smoke 观察到约300秒的用例计时外收尾延迟，相关完整运行最终47/47并自然退出、退出码0；两次独立诊断复跑均正常退出。确切原因尚未证实，子进程管道/事件循环延迟只是候选解释。本地完整验收结果包含该轮实际总耗时，诊断复跑不替代发布门禁；远端CI耗时与可复现性仍须外部实跑确认。

## 归档与恢复

实际执行 copy→move→双入口 smoke/reference→restore→真实目录核对→双入口 smoke/reference→copy→final move，最后完整 test:all 复验。六个真实目录现位于 legacy/，原路径是兼容 symlink；source/runtime 和 source/semantic 依赖桥确保 Node ESM realpath 后仍能解析。所有静态 oracle 树及已存静态报告按 SHA 锁定，restore 保留新增报告。

事务清单：`legacy/archive-manifest.json`、`legacy/archive-operation.json`；实际操作、恢复路径检查、截图和日志保存在 `reports/release-rehearsal/`。当前无活动验收/归档锁。

首次两次演练因 Synology Drive 将兼容链接恢复成实体目录而失败，失败日志保留于 release-rehearsal/；所有冻结文件经哈希核对一致，原实体目录和冲突链接保存于 /tmp/florr-archive-recovery-paused-20261025/。用户确认暂停项目同步后重新执行整套演练并通过，冻结 oracle 与恢复保护保持不变。恢复同步前须先处理同步端旧目录与本地 symlink 的类型冲突。

回滚命令：

```sh
node tools/archive-legacy.mjs --restore
node tools/smoke-entrypoints.mjs
npm run test:reference
npm run serve:reference
```

## 证据边界

本机 macOS 上三轮完整验收与可回滚归档已完成；远端 Ubuntu 24.04 CI **未执行**。本工作目录无 .git/remote，也无可用容器运行时，因此 F05 的“至少一次干净 Linux CI 实跑”仍缺外部证据。CI 配置已实现 npm ci、Emscripten/Chromium pin、reference 准备、tooling、两轮全验及同版本复核，不能把配置修复写成远端全绿。Firefox/WebKit/真机、音频v1仍为既定非目标；field26永久域扩展不重新打开。

## 剩余项映射

| 项目 | 本地结果 | 证据 |
| --- | --- | --- |
| R04 | 完成 | 14项 Hornet + 短/长 strict |
| R13/R14/R19 | 完成约定八场景验收 | 24帧 Canvas + 像素 + 通用几何/动画单测 |
| R33 | 工具、账本、文档、基线追溯完成 | 两轮稳定源全验；远端 CI 实跑仍待外部环境 |
| R28/R29 | 本地可回滚迁移和切换完成 | move/restore/双入口/归档后全验 |

所有失败或中止轮次仍保留；不能以诊断重跑替换它们，也不能把有限场景验收扩大成所有物种/时长/设备的无界等价。
