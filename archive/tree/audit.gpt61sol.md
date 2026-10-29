# 项目审计报告（GPT-6.1 Sol）

审计日期：2026-10-24（Asia/Shanghai）。审计对象为当前工作目录中的源代码、构建产物、测试、报告及 `goal.md`，不是远程仓库或线上 CI。

本次只创建本文件，不修改 `goal.md`，不修代码，不刷新 golden，不重新构建，不改写 TAP/JSON 报告，也不启动会创建浏览器配置目录的浏览器测试。实际验证采用只读脚本、内存计算、现有 native 可执行文件和不写文件的 Node 测试。

`goal.md` 审计快照 SHA-256：`18c2bfeb2eff248170e72a462c7b94df33f959aac480e1992f80d5d5f0d5f56e`。当前目录没有 `.git`，不能据此确认提交历史、工作区差异或远程 CI 状态。

## 1. 总体结论

项目已完成 C++20 服务端、TypeScript/Canvas2D 客户端、schema、原版 oracle 与大部分差分基础设施，已有单人游戏闭环的历史测试证据。当前处于**行为残差、视觉等价、验证可信度和交付同步的收尾阶段**，尚未达到 `goal.md` 的最终成功标准。

`goal.md` 的“26 项阶段门禁 25 通过、§13 清单 15/18 完成”是 08:05 的历史统计，不能直接当作当前审计通过率，更不能解释为项目完成了 96%。门禁粒度不同，而且当前已经有可复现的客户端测试失败；旧统计未涵盖后来加入的视觉阻断和新增测试。

本次最重要的判断：

1. **服务端现有 8 个短场景 strict 报告通过，R04 仍未闭环。** native 测试现为 91 项；Hornet 回调已有实现及 native fixture，但原版 stinger 对照报告仍失败。strict 比较器还存在漏检，不能把报告通过扩大为全部状态、全部物种及长时间游戏等价。
2. **视觉进度显著超过 `goal.md` 记录。** 当前菜单通过；7 个游戏场景变化像素比例为 **0.301758%–1.134766%**，仍高于 0.1%，最大通道差 227–232，仍高于 8。旧的菜单 4.10% / 游戏 25.35%–29.87% 已过期。
3. **当前测试并非全绿。** 本次执行的客户端 8 个纯测试文件为 **36/37**；菜单文本断言失败。全量客户端 TAP 尾部也记录 83/84，但混入另一段 84/84 汇总，账本解析会误判通过。
4. **默认交付树落后于当前已编译客户端和 wasm。** `dist-next` 的内部哈希校验通过，却仍是旧版本；当前视觉改善尚未进入默认交付树。
5. **视觉门禁已经接入 `test:all` 和 CI。** “门禁尚未接入”“CI 仍安装 Firefox/WebKit”“基线没有 changelog”等说法已不符合当前代码。但 CI 的环境准备、浏览器路径和产物构建流程仍有实际缺口。

### 阶段判定

| 阶段 | `goal.md` 原记录 | 当前审计判定 |
| --- | --- | --- |
| 0：冻结参考与 parity 基础设施 | 6/6，完成 | 基础设施已建立；本次冻结参考校验通过。无 `.git`，tag/提交追溯不可验证 |
| 1：契约与 schema | 6/6，完成 | 基本完成，目录/生成代码/布局探针证据齐备；本次未重新生成或运行会写报告的 probe |
| 2：C++ 服务端 | 6/6，R04 残差 | 8 场景 strict 既有报告通过，现有 native 二进制 91/91；R04、比较器漏检及长时间覆盖仍待收口 |
| 3：TS 客户端 | 4/4，R19 未达 | 单人闭环有历史证据；菜单视觉通过，游戏 0/7 通过；当前客户端回归有失败，不能继续宣称门禁全绿 |
| 4：切换与归档 | 3/4，4.4 未通过 | 默认入口已切换、reference 可保留；交付树过期，归档仍 copy，最终签字条件不满足 |

## 2. `goal.md` 与当前文件的差异

以下“当前”指本次读到的文件和实际检查，历史测试报告不冒充本轮重跑。

| 项目 | `goal.md` 当前文字 | 当前核查结果 |
| --- | --- | --- |
| JS oracle | 692/692 | 现有 `reports/javascript-tests.tap` 为 692/692；本次未重跑 |
| native 测试 | 90/90 | 本次运行现有 `build/engine/engine_tests --tap`：**91/91** |
| 客户端测试 | 68/68 | 当前全量 TAP 尾部 **83/84、1 fail**；本次纯测试 **36/37** |
| engine wasm | 211,588 B，`0f0ab8dc…` | `client/public/server.wasm` 已为 **212,545 B，`14b6e74f…`**；`dist-next` 仍为旧 wasm |
| 菜单视觉 | 4.10%，失败 | **8/921,600 px，0.000868%，max 2，通过** |
| 游戏视觉 | 25.35%–29.87% | **0.301758%–1.134766%，7/7 失败** |
| 渲染实现 | 941 行，通用圆/椭圆，无文本缓存 | `client/src/render` 当前 10 个 TS 文件、2,332 行；已有具体物种绘制、逐实体变换、文本缓存、菜单和 HUD 模块 |
| 对比装置 | 最初 trace 帧与截图/相机错位 | 已有滚动末帧 trace、`camera.json`、相机注入及两 tick 插值窗口；仍不等于生产路径全部对齐 |
| 视觉门禁 | `parity:visual` 待新增，未进 `test:all`/CI | 命令和脚本已存在，并已进入两处；当前视觉报告 `passed=false` |
| 浏览器矩阵 CI | 仍安装 Firefox/WebKit | workflow 现仅安装 Chromium；矩阵脚本默认仍尝试三引擎并允许 skip |
| 基线变更记录 | changelog 未建立 | `tests/parity/next/CHANGELOG.md` 已建立，记录了两次刷新及截图哈希 |
| 状态账本 | `knownGaps` 为手写视觉常量 | 生成器已从视觉/命令报告派生；但已保存的账本仍是旧值，且解析和缺口判断有漏洞 |
| field 26 签字 | §2/§15 已签字，§18 又列待办 | schema/语义文档已定义永久域扩展；R33.6 和后文“需签字”属于重复旧待办 |

`goal.md` 自身也有口径冲突：§4、§6.2 仍写剩余 JS 923+222，而 §5 和 §18 基线为 911+218。继续冻结旧 JS 是既定决定，**1,129 个机器码函数不是需要继续逐函数补写的任务量**。

## 3. 已完成工作

### 3.1 原版参考与证据

- `web/`、`upstream/`、WAT、原 JS 和恢复模块仍保留；`reference/manifest.json` 记录冻结哈希。
- 本次 `verify-reference` 确认 15 个关键文件和 `web/dist/dist-readable/dist-reference` 四棵树符合 manifest，0 issues。
- 8 个 golden 场景、虚拟时钟、固定 UA、原服务端 replay、Canvas trace、截图及相机记录均已建立。
- 现有原客户端 golden 报告为 8/8、`repeat=2`；这是 oracle 的稳定性证据，不是新客户端等价证据。
- 恢复函数基线仍为 client 3,334/911、server 516/218，合计 **3,850 已替换 / 1,129 机器码**。

### 3.2 契约、目录与数据驱动

- `schema/protocol.yaml`、8 个 layout、C++/TS 生成类型、布局探针及协议文档已存在。
- 目录报告记录 39 花瓣、23 实体、20 生成规则、99 字符串；既有目录/布局报告无 mismatch。
- 掉落目录有 102 个条目的历史核验；本次没有执行 `catalogs:drops:verify`，因为该命令即使带 `--verify` 也会先写 `schema/catalogs/drop-chances.json`（脚本第 171 行）。
- field 26 已按永久域扩展记录；不应再把它列为必须回退到原语义的缺陷。
- 搜索 `264876`/`8551040`，只在生成的 `client/src/schema/generated.ts` 命中前者两处；未发现领域代码使用这两个原内存地址或 `runtime.call`。

### 3.3 C++ 服务端

- 当前 `engine/src` 有 25 个 `.cpp`，已按核心、模型、模拟、协议和 ABI 组织。
- 实体句柄/池、组件、固定步长、RNG、生成、移动、空间查询/四叉树、碰撞、AI、花瓣、伤害、掉落、等级、装备和快照已有实现。
- native CMake 使用 C++20、`-Wall -Wextra -Werror`、禁止 fast-math 和 FP contraction 等选项。
- Hornet `attack_callback=74` 分派及 `spawn_hornet_stinger` 已实现；本次通过的 native 测试包含 `test_hornet_stinger_callback`。
- 已保存的 strict 状态报告覆盖 8 场景，数量/handle/实体/玩家判断全部通过，末帧 mismatch 均为 0。

### 3.4 客户端与渲染

- 启动、worker 通信、快照解码、世界状态、插值、相机、鼠标/键盘/触屏输入已有实现。
- 历史 e2e 记录覆盖菜单→花园→移动→攻击，以及自杀/死亡/重开、装备、防御、丢弃、交换、聊天、拾取和触控移动。
- 已新增 `menu.ts`、`hud.ts`、`entity-art.ts`、`text-cache.ts`；玩家脸部、岩石、瓢虫、Bee/Ant/Hornet 等绘制比旧记录完整。
- 背景 alpha band、网格相位、每实体屏幕变换、文字离屏缓存和部分 HUD 已对齐。菜单最后一帧已达到现有像素阈值。
- 本次 TypeScript 无输出类型检查通过；额外将编译结果只写入内存，与 `client/public` 对比：**84 个输出全部一致、0 diagnostics**。当前已编译 TS 资产与源代码相符。

### 3.5 工程与交付

- `serve.mjs` 默认指向 `dist-next`，`--reference` 指向 `web`。
- `dist-next` 当前 manifest 为 76 个交付文件、529,319 B，内部哈希验证通过，未发现 manifest 所列文件被改坏。
- `legacy/archive-manifest.json` 为 `mode=copy`，记录 1,309 文件、66,041,497 B；不是已完成 move。
- CI 有 6 个 job，strict 状态和视觉检查已被定义为阻断步骤；实际干净环境可运行性仍需修复和验证。

## 4. 当前验证事实

### 4.1 本次实际执行的只读检查

| 检查 | 结果 | 适用边界 |
| --- | --- | --- |
| `node tools/verify-reference.mjs` | exit 0，15 key files / 4 trees / 0 issues | 校验已有冻结资产；没有重新构建 WAT |
| `node tools/verify-dist-next.mjs` | exit 0，76 files / 529,319 B / 0 issues | 仅证明与该交付树自己的 manifest 一致 |
| `node node_modules/typescript/bin/tsc -p client/tsconfig.json --noEmit` | exit 0 | 类型检查，不生成文件 |
| TypeScript compiler API 内存 emit 对比 | 84 outputs，0 diagnostics，0 missing，0 different | 确认 TS 源码与现有 `client/public` 编译输出一致 |
| `./build/engine/engine_tests --tap` | exit 0，91/91 | 使用已有二进制；没有重新构建 native/wasm，不证明当前 C++ 源码可从零编译 |
| `node --test client/tests/render-golden.test.mjs` | exit 1，2/3 | 菜单文本断言失败 |
| 8 个无浏览器的客户端测试文件 | exit 1，36/37 | camera-golden、camera-input、entity-art、hud-golden、loadout、render-golden、snapshot-domain、ui-tooltip；未运行 worker-shim 浏览器 suite |
| 8 场景 PNG 独立解码重算 | 全部与视觉报告 changed/max 一致 | 用标准库在内存解码现有 PNG；没有重新截图 |
| strict 比较器最小反例 | 物种/kind 改变、位置变 NaN，均返回 matched=true / mismatchCount=0 | 直接提取当前 `compareEntities`，内存执行，不运行其报告写入入口 |
| 当前 TAP 解析复现 | 解析为 84/84、fail 0，但原文件有 `not ok` 和尾部 fail 1 | 复现现有 `readTap` 的误判 |

### 4.2 已保存的服务端状态报告

来源：`tests/parity/engine/report.json`，生成时间 **2026-10-24 22:23:20（上海）**，`strict=true`、`strictPassed=true`。本次未重放该命令。

| 场景 | tick | count/handle/entity/player | 末帧最大位置差 | mismatch |
| --- | ---: | --- | ---: | ---: |
| boot-menu | 57 | 全通过 | 0.00048828125 | 0 |
| garden-idle | 57 | 全通过 | 0.00048828125 | 0 |
| move | 67 | 全通过 | 0.00048828125 | 0 |
| attack | 67 | 全通过 | 0.00048828125 | 0 |
| equip | 51 | 全通过 | 0.00048828125 | 0 |
| damage | 134 | 全通过 | 0.0009765625 | 0 |
| death | 249 | 全通过 | 0.0009765625 | 0 |
| spawn | 96 | 全通过 | 0.0009765625 | 0 |

实现中的位置容差为 `1e-3 + 2 * ULP(最大坐标量级)`；health/maxHealth/angle/radius 使用 `1e-3`，velocity/acceleration 使用 `1e-3`。这些是容差等价，不是逐位一致。当前最长基准为 249 tick / 12.45 秒，不能替代计划中的 1000 tick 或长期游戏验证。

### 4.3 当前视觉报告

来源：`tests/parity/visual/report.json`，生成时间 **2026-10-24 22:29:29（上海）**，整体 `passed=false`。每对截图的现有 SHA-256 均与报告一致；本次独立重算 changed/max 也全部一致。

阈值：变化像素比例 **≤0.1%**，全图最大通道差 **≤8**；两项必须同时满足。

| 场景 | 变化像素 / 921,600 | 比例 | max | 判定 |
| --- | ---: | ---: | ---: | --- |
| boot-menu | 8 | 0.000868% | 2 | 通过 |
| garden-idle | 4,287 | 0.465169% | 232 | 失败 |
| move | 9,536 | 1.034722% | 227 | 失败 |
| attack | 10,458 | 1.134766% | 228 | 失败 |
| equip | 9,180 | 0.996094% | 228 | 失败 |
| damage | 7,505 | 0.814345% | 228 | 失败 |
| death | 2,781 | 0.301758% | 227 | 失败 |
| spawn | 5,121 | 0.555664% | 230 | 失败 |

当前命令诊断报告（22:27:57）为：garden 563/564 ops、move 587/647、attack 602/650、equip 565/566、damage 583/686、death 514/596、spawn 511/535。相同 opcode 前缀分别为 **6/6/6/6/4/4/6**。命令数量接近不能替代命令参数、颜色、alpha 和变换逐项等价。

### 4.4 报告时效

- `reports/current-verification.json` 生成于 **22:00:41**，早于上述 strict、视觉及自洽报告；仍显示客户端 68/68和旧视觉数字。
- `tests/parity/next/report.json` 为 **22:29:51** 的自洽 8/8，不能替代原版等价。
- `tests/parity/next-engine/report.json` 在 **22:31:01** 被单场景 garden-idle 运行覆盖，仅一行；其 `passed=true` 表示 runner 成功，不能当作 8 场景视觉通过。
- 原客户端+C++ 报告为 **08:03:26** 的协议检查 8/8；对应的是旧一轮构建，检查项不验证实际完成一局或游戏画面等价。
- `reports/perf.json` 为 **07:47:42** 的 600 帧记录：60.008 FPS、p95 18.5 ms、max 19.8 ms、堆增长 1,538,707 B。晚间渲染改动后尚无本次重测证据。
- `test:all:twice` 两次通过只能保留为历史记录。当前存在确定的客户端测试失败和视觉失败，不能宣称当前全量通过。

## 5. 发现的问题

优先级：P1 为影响当前验收/交付或验证真实性的问题；P2 为必须在最终收口前修复的覆盖和流程问题；P3 为局部低影响问题。本节只提出修复建议，没有修改相应文件。

### F01 [P1] 客户端回归可复现失败，旧断言与文本缓存不兼容

位置：`client/tests/render-golden.test.mjs:30–35`、`client/src/render/canvas2d/text-cache.ts`。

测试从新客户端 golden 的 `fillText` 读取菜单文字；浏览器路径现将文字缓存为离屏 bitmap，再调用 `drawImage`，因此稳定帧不含期望的标题 `fillText`。本次独立执行失败于第 33 行的 `florr.io` 断言，8 个纯测试文件整体为 36/37。

这首先是测试与渲染契约不一致，不能据此断言菜单标题肉眼缺失。应验证缓存内容、语义标签或最终视觉，并保留死亡/重生文案覆盖；不能通过删掉测试或反复刷新基线隐藏失败。修复后再运行完整客户端测试。

### F02 [P1] TAP 账本会把当前失败报告误判成通过

位置：`tools/write-current-verification.mjs:38–54`、`reports/client-tests.tap`。

当前 TAP 含 `not ok 28`，尾部为 `1..84 / pass 83 / fail 1`，但文件中途又混入 `pass 84 / fail 0` 汇总。`readTap` 对 plan/pass/fail 分别取**第一次**正则命中，实际会组装成 84/84、0 fail、`status=pass`。该误判已在内存复现。报告混杂的产生原因没有足够证据确认，不推定一定由并发写造成。

应让每次运行拥有独立报告/运行标识，严格解析顶层 TAP 与完成状态，拒绝重复或损坏汇总、`not ok` 和不完整输出；缺失新报告时也不应沿用旧的 `pass` 状态冒充新验证。

### F03 [P1] 默认交付树过期，内部 manifest 校验无法发现

位置：`dist-next/build-manifest.json`、`tools/build-dist-next.mjs`、`tools/verify-dist-next.mjs:14–24`、`serve.mjs`。

当前两份 wasm：

- `client/public/server.wasm`：212,545 B，SHA-256 `14b6e74f92ba0627deab1b897cc253c95564b6b6d033a2d21a2c7a2a8039e990`。
- `dist-next/server.wasm`：211,588 B，SHA-256 `0f0ab8dcca91176159979e5b3d5e9dc80671afca97de6578e442399956a1877e`。

逐文件比较 `client/public` 与交付树：88 对 76 个文件；共有路径中 **16 个内容不同**，交付树缺少 **12 个文件**，包括新 menu/hud/entity-art/text-cache 模块及声明/source map。`main.js`、world、camera、UI 等运行时代码也不同。

默认启动会运行旧版本。`verify:dist-next` 只对照其自身旧 manifest，所以仍通过；`build:dist-next` 只是复制 `client/public`，也不会先编译源码。应形成从源码构建→单元/集成/视觉验证→打包→对实际交付树 smoke 的流程，并记录同一版本哈希；不能把当前开发目录报告直接用于签字旧交付树。

### F04 [P1] 7 个游戏场景仍未达到视觉完成定义

位置：`tests/parity/visual/report.json`、`client/src/render/world.ts`、`tools/parity/run-client-engine-scenario.mjs`。

具体数值见 §4.3。门禁已经存在且接入全量命令，问题是结果仍失败。`docs/parity.md` 将残差定位到玩家/花瓣、怪物动画/插值及 HUD 区域；这是后续定位依据，本次没有重新运行浏览器确认每个区域的因果。

应在相同状态、帧号和相机下继续对齐花瓣轨道、客户端动画及实体边缘，再处理 UI 残差。不能以菜单通过、自洽 8/8或相似 ops 数量替代全部 8 个原版视觉场景通过。

### F05 [P1] CI 定义仍不足以支持干净环境复现和真正交付验证

位置：`.github/workflows/ci.yml`、`tools/build-engine-wasm.mjs`、各 parity runner 的 `chromePath`、`tools/browser-matrix.mjs`。

静态可见的问题：

- 各 job 未执行 `npm ci`；`node_modules` 被忽略，原始 JS/oracle 依赖、TypeScript 与 `playwright-core` 的准备没有形成自包含流程。
- wasm job 直接调用 `em++`，没有安装和锁定 Emscripten。`.emcache` 是缓存目录，不能替代编译器版本锁定；`docs/environment.md` 的“from .emcache (project-pinned)”不构成 pin。
- workflow 使用 `ubuntu-latest`，而 run-scenario、run-client-scenario、run-client-engine-scenario、run-original-engine 和 visual-check 默认显式使用 macOS Chrome 路径；workflow 没有设置 `CHROME_PATH`。安装 Playwright Chromium并不会改变这些脚本传给 `executablePath` 的值。
- `dist` job 没有先 build client/engine，只复制现有产物；job 之间没有产物传递。browser-parity 在重建 wasm 之前已经运行客户端测试。
- 冻结参考检查需要四棵构建树，而 `dist/dist-readable/dist-reference` 均在 `.gitignore`；workflow 没有显式恢复或生成它们。由于没有 `.git`，本次无法确认它们是否曾被强制追踪，不能把当前磁盘存在当作干净 checkout 保证。
- browser-matrix 将浏览器启动异常转成 skip，即使所有浏览器都 skip 也可 exit 0；默认还会尝试 Firefox/WebKit。当前“只安装 Chromium”的修复并未让目标浏览器缺失成为硬失败。

应明确依赖/工具链安装、Linux 浏览器定位、reference 资产准备、同版本构建与产物传递，并至少取得一次干净 Linux CI 实跑证据。本次没有访问远程 Actions，以上不是对某次线上 job 结果的断言。

### F06 [P2] R04 原版对照仍失败，native fixture 不能关闭该任务

位置：`engine/src/sim/species_attacks.cpp`、`engine/src/sim/ai.cpp:805–828`、`tests/parity/hornet/report.json`。

22:06 的 Hornet 报告运行 3200 tick，`stingerTick=null`、两侧 stinger 均为 null、`passed=false`。玩家已失效，未触发预期攻击；末尾还存在原版 864 / 新版 862 的实体数差。该长跑不是合格的 stinger fixture，数量差原因也尚未隔离，不能直接归因为 Hornet。

回调已实现，不应继续写“function_695 完全未重建”；但也不能仅凭 native 测试通过就宣称等价。应建立玩家与 Hornet 在攻击范围内、cooldown=0 的可控双端 fixture，比较触发 tick、handle、位置、速度、半径、伤害、owner/寿命、命中与销毁，并对末尾长跑实体差单独归因。

### F07 [P2] strict 比较器遗漏 type/kind，并允许 NaN 漏过

位置：`tools/parity/server-state-trace.mjs:198–285`。

`compareEntities` 读取 type/kind，却没有把它们纳入匹配；数值差仅通过 `>` 和最大值累计判断，没有首先检查有限性。NaN 差不会更新相关最大值，最后仍可能 `matched=true`。

本次直接执行当前函数得到两个反例：同一 handle 仅将 `{type:1, kind:2}` 改为 `{type:99, kind:4}`，或者仅将 x 改为 NaN，均得到 `matched=true, mismatchCount=0`。

应将 type/kind 精确比较，并对所有被比较数值先检查 finite；增加负例验证比较器能拒绝这些错误。8 场景报告通过仍是现有检查范围内的有效记录，但不足以覆盖这些缺口，更不证明 RNG、AI cooldown、owner 等未比较内部状态全部等价。

### F08 [P2] 对比装置仍绕过生产数据路径，动画和状态覆盖不足

位置：`tools/parity/run-client-engine-scenario.mjs:102–125,210–235`、`client/src/main.ts:70–79`。

runner 从 engine state dump 手工拼 EntityState，将 level 固定为 1、flags 固定为 0，注入最后两个 tick，并按 golden 相机 pin。`setSnapshotAt` 的事件数组为空。这对隔离渲染很有用，却没有覆盖实际 worker→编码→TS 解码→事件→完整渲染的路径。

相机 pin 通过只能证明给定相机下的画面，不能证明实际跟随/输入 pan；无事件注入不能证明 event14、命中效果和死亡动画。应保留隔离测试，同时补同输入的真实端到端录制、多时刻动画、装备/等级变化、事件及不同 viewport/DPR；避免把测试夹具成功当作生产闭环等价。

### F09 [P2] 渲染包含针对已录场景的固定样本，泛化等价尚未证明

位置：`client/src/render/menu.ts:15–34,207–225,300–304`、`client/src/render/entity-art.ts:367–398,609–653`、`client/src/render/hud.ts:217–240`。

- 菜单漂浮花朵直接固定为 t=2880 ms 的 15 组变换；光标 alpha 固定为 0.129194，绘制接口没有时间输入。最后一帧极接近原图不证明漂浮动画/光标闪烁等价。
- Ladybug 斑点和 Rock 几何按少数已录 handle 查表，未知 handle 使用另一套 hash/xorshift 生成；没有原版生成算法对照证据。
- HUD 等级进度默认值固定为 0.74456014，而 `main.ts` 正常绘制没有传入真实 `levelProgress`；升级提示固定写 level 15。等级数字变化不代表进度条随真实经验更新。
- 部分不同物种在 `world.ts` 中仍共用 Beetle 绘制；不能因为 8 个既定场景改善就认定全部 23 实体外观完成。

这些是可理解的重建中间态，但应明确标记为样本恢复。后续需要从原版恢复通用随机几何、动画时间和 UI 状态公式，用新 handle、新时间点和新等级验证，不能无限扩充已见样本表替代规则。

### F10 [P2] `parity:canvas` 仍是诊断，不能满足命令级验收

位置：`tools/parity/canvas-command-diff.mjs`、`tools/write-current-verification.mjs:133–140`。

脚本只比较末帧 opcode 名称前缀/直方图，忽略 save/restore、属性 setter 和命令参数，不因 mismatch 设置失败退出码。它既不能验证颜色/alpha/线宽，也不能验证相同 opcode 的坐标、变换或 Path2D 内容。

账本只在 `matchedPrefix < 2` 时提示 R13，所以当前前缀 4/6 的明显未完成结构不会列入 `knownGaps`。R04 同样只查 native fixture 是否存在，不读取失败的 `tests/parity/hornet/report.json`；已有账本因此没有列出仍开放的 R04。

应区分诊断、self-consistency 和 equivalence，加入完整参数/属性/顺序差分及失败退出码；账本按任务真实验收条件派生，并显示覆盖场景、源码/wasm哈希、运行时间和缺失/过期状态。

### F11 [P2] 现有 copy 状态下，归档 `--move` 会跳过实际移动

位置：`tools/archive-legacy.mjs:48–66`。

脚本先把 manifest 写成 `mode=move`，随后对每个源目录执行 `if (existsSync(target)) continue`。当前对应目标已经由 copy 建立，直接运行 `--move` 会跳过移动，却仍写“moved”说明；再次 copy 也不会刷新已有目标。

因此 R28 不只是等待视觉验收，归档脚本本身尚不具备从当前 copy 状态可靠转成 move 的能力。应先验证副本一致性、显式处理已有目标、完成路径迁移，再根据实际结果写 manifest，提供可验证回滚。该问题仅为静态确认，本次没有运行归档命令。

### F12 [P2] 进度、账本和性能证据缺乏同一轮运行约束

位置：`goal.md` §18、`reports/current-verification.json`、各 parity report、`reports/perf.json`。

当前同时存在上午的总进度、22:00 的账本、22:23 的 strict、22:29 的视觉及自洽、22:31 的单场景 runner 报告。仅看任一 `passed=true` 会丢失完整覆盖和版本关系。旧性能结果也不能替晚间新增缓存、物种几何和 HUD 签字。

应以 run id 和代码/wasm/产物 hash 关联报告，检测完整 8 场景、报告过期及部分运行覆盖。先修已确认回归与门禁，再在同一版本执行两次全量及性能复测，最后回写总进度；不要保留互相矛盾的“唯一阻塞是视觉”“目前全绿”表述。

### F13 [P3] 静态服务器的 HTTP method 检查失效

位置：`serve.mjs:72–76`。

`method = req.method === 'HEAD' ? 'HEAD' : 'GET'` 把所有非 HEAD 请求都变为 GET，后续 405 条件不会命中 POST/PUT 等。应直接校验原始 `req.method`。默认 localhost 静态服务下影响有限，不是当前重建主线阻塞。

## 6. 仍需进行的工作与验收顺序

保留 `goal.md` 的 7 个顶层任务，但按当前事实更新其内容，并把本次发现的验证/交付缺口纳入对应任务。

| 任务 | 当前已完成部分 | 仍需完成 | 退出条件 |
| --- | --- | --- | --- |
| R04 服务端残差 | 回调 74、stinger 领域实现、native fixture | 合格原版对照；长跑实体差归因；比较器补强 | 实际触发 stinger 的逐 tick 双端 trace通过，伤害/寿命/销毁受测，8 场景不回归 |
| R13 命令结构 | 逐实体变换、背景 band、缓存文本等已落地 | 命令/属性/参数严格比较，剩余顺序与曲线对齐 | 规定帧的完整命令级差分在 1e-4 容差内，失败能阻断 |
| R14 实体/UI/效果 | 菜单、HUD、多类实体艺术已移植 | 全物种/新handle、花瓣轨道、真实经验、动画、事件/粒子/掉落；修复旧测试 | 多状态、多时刻和真实输入路径无明显差异，客户端回归全通过 |
| R19 视觉 | runner 对时、相机记录、视觉命令及 CI 接入；菜单通过 | 完整状态/事件对齐和 7 个游戏场景残差；生产相机与集成路径验证 | 菜单+7游戏场景全部 ratio≤0.1%、max≤8，报告覆盖完整并绑定版本 |
| R33 工程一致性 | changelog、报告派生逻辑、Chromium安装范围、field26声明已落实 | TAP/账本漏判、CI环境、报告时效、性能重测、goal数字/状态同步 | 干净CI通过；同版本 `test:all:twice` 两次全绿；账本拒绝失败/过期/部分结果 |
| R28 归档 | copy副本已建立 | 修复已存在目标时的 move 流程；迁移引用；验证副本与回滚 | 实际完成 move，manifest符合实际，reference/oracle路径可运行、可恢复 |
| R29 最终切换 | 默认 next/reference入口已存在 | 从源码重建最新交付树；在实际交付树跑验收；切换及回滚记录 | §13全部达成，交付树与验收哈希一致，双入口smoke和归档后全量通过 |

建议先后顺序：

1. **让验收可信**：修 F01/F02/F07/F10，隔离报告写入和版本，确认错误会使门禁失败。同步清理 `goal.md` 的过期结论；这是后续任务，不在本次修改范围。
2. **补齐工具链与CI**：依赖安装、Emscripten pin、Linux浏览器路径、reference资产与构建产物流转、目标浏览器缺失硬失败。
3. **完成行为与视觉主线**：R04 可与渲染线独立推进；渲染按状态/动画对齐→通用物种几何/UI/事件→严格命令和像素阈值收敛推进。
4. **同版本全量复验与性能复验**：不得用既有 692/91 或过期 68/68 报告拼出新的全绿结论；修复后完整重跑并记录两轮结果。
5. **更新交付、归档和回滚**：在实际 `dist-next` 验证新 wasm和客户端；处理 copy→move逻辑后再执行R28/R29。

当前不需要重新打开已确认非目标：音频 v1静音、Firefox/WebKit/真机、ABI/allocator地址一致、wasm逐字节一致的C++重编译、继续逐函数补JS。field26永久扩展也已被接受。

## 7. 审计边界与文件约束

本次发现既包括实测失败，也包括静态确认的逻辑缺陷和现有报告的证据缺口；各项已分别说明，没有把未运行的浏览器e2e、wasm重建、完整JS oracle或远程CI写成通过。

审计过程中未执行会写入文件的全量构建、TAP输出、parity录制、schema生成、状态账本或归档命令。只运行无文件输出的检查；PNG复算、TypeScript emit及比较器反例均在内存完成。

审计前对本目录其余33个顶层项目记录文件内容和大小/修改时间的聚合摘要，写入报告后再次比对，用于确认除了 `audit.gpt61sol.md` 之外的文件保持不变。`goal.md` 和所有代码、参考资产、测试及报告保留原样。
