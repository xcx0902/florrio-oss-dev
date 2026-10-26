# 2026-10-25 原版交互与花瓣修复

本轮直接回应用户报告的五类可见问题。先用冻结 `web/` 的原客户端和真实键鼠操作核实，再修复 TypeScript 客户端；原 WASM/WAT、历史 audit、golden、输入和容差没有改动。

## 原版核实与修复

| 问题 | 原版核实 | 修复与回归 |
| --- | --- | --- |
| 首页任意点击开局，名字和四菜单无效 | 名字框可编辑，Settings/Petals/Mobs/Changelog 可单独展开、关闭；Enter 才开局 | 添加真实 DOM 输入和菜单按钮，隔离游戏输入；空白点击不再开局；显式 Play 目标兼容触屏。姓名通过 opcode6 发给服务端；支持 IME、Backspace、持久化和滚动。 |
| 掉落物是怪脸 | Reddit 路径属于首页社交按钮，不是掉落物图案；kind4 的花瓣类型来自 field22 | 移除社交路径误用，按 field22 绘制真实花瓣、原稀有度色卡、边框和名称。 |
| 全部花瓣只有圆点 | Basic 本来是圆点；其余包含方形、三角、叶、蛋、阴阳及多瓣组合 | 38 类花瓣按冻结 WASM 的真实绘制调用复原颜色、轮廓、透明度和组合数；Rock/Salt 使用真实 handle 派生的随机多边形。世界、HUD、背包、掉落物和转移动画共用图案。 |
| Inventory 无法操作，底部提示无效 | 下方为装备、8 个储备格和 discard；进入底部提示会扩大操作安全区，离开恢复鼠标移动；Q/E 选择非空储备，数字键交换 | 修复按下/释放边沿、拖放、丢弃、Q/E 与数字交换；操作区域停止鼠标移动和鼠标攻防。权威装备状态来自服务端 field60，真实非边界场景验证停止和恢复。 |
| 死亡后 Enter 无效 | 原版死亡后 Enter 回首页 | Enter 返回可编辑主页，下一次 Enter 开新局。新开局等待服务端删除仍存留约一秒的尸体，防止 spawn 被 has-player gate 吞掉。 |

原版交互截图与修复图保存在 [`reports/ui-repair/`](../reports/ui-repair/)。花瓣对照图 [`petal-comparison.png`](../reports/ui-repair/petal-comparison.png) 为每种花瓣左原版、右新版；Rock/Salt 图中展示种子不同，固定 handle 的几何另外由原 WASM 测试核验。

## 已完成回归

- 最终完整本地验收 `2026-10-25T14-09-21.352Z-166531b5`：26/26 步通过，`passed=true`、`stable=true`，2026-10-25 14:34:13 UTC 完成；源码、编译客户端和交付树身份在运行期间保持一致。
- JavaScript：940/940；engine TAP：110/110；CTest：5/5 个目标；Chromium 桌面、retina、触屏视口矩阵：47/47。
- `client/tests/*.test.mjs`：222/222，0 fail、0 skip，包含七个真实交互回归、五个花瓣 oracle 测试、八个方向辅助测试和 field22 世界绘制回归。
- `CLIENT_ROOT=dist-next` 的 `menu-interactions` + `worker-shim`：54/54，0 fail、0 skip。
- 原版八场景各三帧 Canvas 对照 issueCount 全为 0；八场景截图均在原阈值内（move/attack 各 4 个变化像素、最大通道差 5，其余为 0；原阈值仍为 ratio ≤0.001、max ≤8）。短/长 strict、14 个 Hornet fixture、原客户端+C++ 引擎兼容与性能门禁全部通过。
- 24 个生产交互录制（八场景 × desktop/retina/touch）全部通过，包含死亡后 Enter 回菜单、再次 Enter 生成新 handle，且绑定本轮 `dist-next` 交付身份。
- TypeScript 编译、原版冻结树校验、菜单内容生成一致性、花瓣目录生成一致性通过。
- 默认 `serve.mjs` 和 `--reference` 两个真实入口均通过真实键鼠开局和 Worker 检查。七项新交互用例也已加入每次 `test:delivery` 和完整验收的 delivery smoke，防止只验证内部启动 hook 而遗漏实际主页。
- 默认 `dist-next` 已重建；交付清单与当前源码、编译结果、118 个文件逐项一致，0 issues。

最终机器可核验身份、日志与渲染结果见 [`summary.json`](../reports/ui-repair/summary.json)；不可变完整运行记录见 [`run.json`](../reports/runs/2026-10-25T14-09-21.352Z-166531b5/run.json)。中间失败的 `client-tests.tap` 保留，最终结果使用 `client-tests-final.tap`，不把诊断失败隐藏或计入通过数。

## 可复核截图

- [原版与新版 38 类花瓣并排](../reports/ui-repair/petal-comparison.png)。
- [交付版可编辑主页](../reports/ui-repair/fixed-menu-final.png)及[Settings 勾选](../reports/ui-repair/fixed-settings-final.png)。
- [真实游戏中的 Movement helper 方向箭头](../reports/ui-repair/fixed-movement-helper.png)及[Inventory 操作安全区](../reports/ui-repair/fixed-inventory-safe-area.png)。
- [受控掉落绘制样例](../reports/ui-repair/fixed-drops-fixture.png)：通过诊断 snapshot 放置 Stinger/Leaf/Yin Yang/Egg，仅用于展示生产渲染图案；不作为真实拾取/掉落生命周期的证据。

初轮额外渲染诊断暴露了空姓名覆盖默认名称、实时 DOM 光标干扰受控 Canvas 录制，以及回放适配器在按下/释放时漏传鼠标坐标的问题。对应根因已修正；后续使用相同场景、相同输入、相同 golden 和原阈值复验。初轮失败的视觉报告保存在 `reports/ui-repair/visual/report.json`，最终验收结果单列于 `summary.json`，不覆盖失败记录。

## 证据边界

新增交互回归通过真实鼠标、键盘操作首页、装备、储备、Movement helper 和死亡返回；没有用 `__florr.start/restart` 代替这些操作。死亡回归用真实协议 suicide 建立死亡 fixture，原版自然 Cactus 死亡另有截图。原版花瓣 oracle 的 ABI 地址仅存在于测试 helper，生产绘制按领域代码实现。

静态图案、绘制颜色、组合和部分曲线/多边形有原 WASM 对照；这不等于所有花瓣生命周期中的动画相位都已逐帧逐像素证明。Movement helper 已核实为半透明鼠标方向箭头，并补齐独立绘制、距离阈值、淡入/死亡淡出、键盘/触控抑制和真实 Settings 勾选回归；它不修改移动输入或相机 pan。原函数探针记录见 `reports/ui-repair/movement-helper-native.json`。Chromium 桌面、retina、触屏视口为本次平台范围，未扩大为真机、Firefox/WebKit 或远端 Linux CI。

上一轮三次 26 步验收属于旧源码身份；不能作为本轮更改后的完整发布验收。修复后的首轮完整运行 `2026-10-25T13-37-12.996Z-8630b3f2` 保留：原版对照、222 项客户端、54 项交付、47 项浏览器矩阵均通过，但旧自洽基线和旧生产启动/死亡契约失败，因此整体明确记为 FAIL。冻结审计与历史发布记录保留，当前 UI 修复使用本报告和 `summary.json` 单独追溯。field26 永久域扩展保持原决定。

修正这两处过时的回归契约后，最终运行 `2026-10-25T14-09-21.352Z-166531b5` 从重建到严格账本共 26 步全部通过；首轮失败及其诊断报告仍保留。此次通过只对应报告内的源码身份和测试范围，不扩张为所有生命周期动画或远端 Linux CI 已完成。

## 版本化自洽基线

`tests/parity/next/` 的旧八场景静态文件与原版 `tests/parity/golden/` 均保留不变；它们和冻结 oracle 的旧复合 SHA-256 仍为 `3fc523f4fd030380bc397edb361c2c998f44e1e104fa8610b2e454051a49d8fc`。修复版另存于 `tests/parity/next-ui-v2/`，每场景重复两次验证确定性。仅 attack/equip/death 的绘制命令变化，对应已由原 WASM 独立核实的非 Basic 花瓣及掉落图案；其余五场景 digest 和截图保持。详细前后 digest、原版独立视觉/命令报告、测试文件 hash 与理由见 `provenance.json`。

新基线只用于新客户端自洽回归，不替代原版视觉门禁，不放宽任何容差。证据身份计算同时纳入旧基线、新基线和 provenance，防止新目录成为未受校验的例外。生产交互验收改为严格要求 opcode6 真实开始，死亡 Enter 回菜单，再次 Enter 生成不同 handle；不再把旧 opcode4 直接重开视为正确行为。
