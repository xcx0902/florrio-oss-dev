# Florr.io Wave 2022-10-30

## W3 · 目录、经济与存档

W3 接入日期固定的目录、花瓣效果、击杀 XP/掉落拾取、装备、原版制作界面和独立
SQLite 存档。构建需要 C++20、CMake 3.20+、Python 3、SQLite3 开发库和 Threads。
原版 `client.js` / `client.wasm` 保持原件哈希。

```sh
cmake -S wave -B build/wave/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/wave/native --parallel
npm --prefix wave run dev -- --snapshot "$PWD/wave-reference/20221030" --port 8478
```

左上角的场景菜单可切换 Garden、Desert 和 Ocean，三个场景共享访客存档。
最高通关波按场景分别记录。开局波取队伍在当前场景的最低纪录的 2/3，向下取整，最低第 1 波。
各场景按旧版 [Waves Wiki](https://official-florrio.fandom.com/wiki/Waves) 解锁怪物种类，
刷怪完成且剩余主怪不超过 4 只时推进；清场超时也会推进，幸存怪物留场。
新刷出的主怪按当前波次独立抽取稀有度：

| 波次 | Common | Unusual | Rare | Epic | Legendary | Mythic |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1–6 | 75% | 25% | — | — | — | — |
| 7–14 | — | 65% | 35% | — | — | — |
| 15–22 | — | 25% | 65% | 10% | — | — |
| 23–30 | — | 10% | 25% | 55% | 10% | — |
| 31–40 | — | — | 15% | 45% | 30% | 10% |
| 41+ | — | — | — | 30% | 50% | 20% |

波次按需生成，可继续到旧客户端可表示的第 2,147,483,647 波。刷怪数量、清场时长和
第 61 波之后的强度增幅采用本地复刻参数。剩余怪物面板按一条水蛭计数，身体各节不单列。

同稀有度的怪物使用统一的碰撞半径，并补偿原版各物种绘制比例，让主体大小接近。
蜘蛛和水蛭的半径为同稀有度基准的 75%，追击速度为玩家基础移速的 110%；水母为 90%。
Hornet 从头部发射导弹并向后回弹；导弹随稀有度变大。Wave 连接不会因挂机而断开。
分节怪物沿用主引擎的跟随方式：身体朝向前一节，拉远时才收紧，每一节仍留在圆形场地内。
普通和邪恶蜈蚣断节后会各自移动。击败蚁穴和它的全部守卫后，有 2% 概率出现友方 Digger。

默认存档是 `build/wave/saves/profiles.sqlite3`；可用 `--database /absolute/path/save.sqlite3`
或 `WAVE_DATABASE` 指定。关闭临时网页或重启宿主不会删除数据库。访客凭证在原版
`cp6_player_id`，新浏览器上下文仅带该凭证即可恢复库存、主副槽、等级和图鉴。
新档只有五个 Common Basic。测试使用独立离线种子工具，正式宿主没有发物端点。

`npm run dev` 会额外构建并使用 `wave_host_dev`，右下角提供“库存调试 · DEV”。
面板支持全部 45 种花瓣、Common–Mythic 六个稀有度，可添加、修改总数或设为 0 删除。
数量包含已装备副本；调低数量时优先保留主槽，自动卸下超额装备。点击“保存并刷新”
后事务写入当前访客存档并重新加载原版界面，XP、图鉴和最高波保持原值。
全部 45 种花瓣现可正常装备，历史行为不确定项见人工核查清单。

调试宿主是默认构建之外的显式目标，只在开发启动时构建；正式 `wave_host` 及
`wave_host_fixture` 不包含调试页面和 HTTP 路由。数据库的调试写入也默认关闭。
可单独执行 `cmake --build build/wave/native --target wave_host_dev --parallel` 构建它。
开发功能验收运行 `npm --prefix wave run test:dev -- --snapshot "$WAVE_SNAPSHOT"`。

```sh
ctest --test-dir build/wave/native --output-on-failure --no-tests=error -L '^w3$'
npm --prefix wave run test:wire -- --snapshot "$PWD/wave-reference/20221030" --stage W3
```

`CHROME_PATH` 或 `--browser` 可指定 Chromium；W3 在 macOS 默认尝试已安装的 Chrome。
结果、库存差分、原版收发帧、源码/二进制摘要和截图写入 `reports/wave/W3/`。
当前目录为 `20221030-w3.3`：全部 45 种花瓣 × 六稀有度（270 变体）、35 个怪物 ID ×
六稀有度（210 变体）均接入权威行为，完整 962 条非零掉落已接入。复用已提取的原件数值，
行为按截止前 Wiki 修订、同仓库 World PvP 的顺序取证；不明确的特殊攻击和复刻参数有
[中文人工核查清单](docs/behavior-review-20221030.md)与
[机器规则](data/catalogs/20221030/behavior-review.json)。
Rare+ 巢穴目前采用同场遭遇代理，子区域传送归 W5。闪电、地面掉落、Peas/Grapes
飞行弹体和 Egg 友军使用原版绘制；护盾/毒状态图形仍待协议核查。
`W3-behaviors` 覆盖全变体和特殊效果。
[完整数值全表](docs/client-tooltips-20221030.md) ·
[机器可读记录](data/catalogs/20221030/client-tooltips.json) ·
[改前／改后差分](data/catalogs/20221030/client-tooltip-corrections.json)

[目录与效果](docs/catalog-20221030.md) · [存档事务](docs/store-20221030.md) ·
[战斗经济与 I/O 队列](docs/economy-application-20221030.md) ·
[原版协议与验收](docs/economy-wire-20221030.md) ·
[W3 执行记录](../wave-goals/03-catalog-economy-and-save.md#w3-执行结果)

## W2 · 本地原版客户端

从仓库根目录构建并启动。运行 `dev` 后打开输出的 `localhost` URL。

```sh
export WAVE_SNAPSHOT="$PWD/wave-reference/20221030"
cmake -S wave -B build/wave/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/wave/native --parallel
npm --prefix wave run dev -- --snapshot "$WAVE_SNAPSHOT" --port 8478
```

可用 `-DWAVE_BOOST_ARCHIVE=/absolute/path/to/boost_1_86_0.tar.bz2` 离线构建。原生库单独构建时可传 `-DWAVE_BUILD_HOST=OFF`。用 `--native-dir` 或 `WAVE_NATIVE_DIR` 指定其他构建目录。

```sh
ctest --test-dir build/wave/native --output-on-failure --no-tests=error -L '^w2$'
npm --prefix wave run test:wire -- --snapshot "$WAVE_SNAPSHOT" --stage W2
```

完整验收覆盖双人入局、原版鼠标移动、分批生成、清波、阵亡重生、跨波重连和异常恢复。报告、收发字节及截图默认写入 `reports/wave/W2/`；`--bootstrap-only` 仅运行引导子集。 [W2 执行结果](../wave-goals/02-garden-online.md#w2-执行结果)

测试入口使用单独编译的 `wave_host_fixture`，固定种子与短批次由测试宿主提供，专用端点只推进 W1 时钟。正式 `wave_host` 按所选场景加载规则，不包含测试端点。手动复查时，A 点击 Squad 创建私有房，复制地址栏中的邀请链接到另一隔离浏览器上下文，双方填写昵称并点击 Ready。

## W1 · Garden 原生模拟

使用 CMake 3.20+ 和 C++20 编译器，从仓库根目录执行。

```sh
cmake -S wave -B build/wave/w1 -DCMAKE_BUILD_TYPE=Release -DWAVE_BUILD_HOST=OFF
cmake --build build/wave/w1 --parallel
ctest --test-dir build/wave/w1 --output-on-failure --no-tests=error -L '^w1$'
```

`wave_sim` 的构建输入都在 `wave/` 中。CMake 从 W0 规则表生成 Garden 配置。CTest 默认把每个用例的事件和状态写到构建目录的 `reports/`，可用 `-DWAVE_REPORT_DIR=<绝对路径>` 指定报告目录。 [规则表](data/evidence/20221030/rules.json) · [执行记录](../wave-goals/01-engine-and-wave-loop.md#w1-执行结果)

### W2 接入

- 宿主为每局分配非零 `MatchId` 和种子，用 `garden_rules()` 创建 `Match`，开局前调用 `add_player()`。测试宿主可改用固定的 `short_garden_rules()`。 [模拟接口](server/sim/match.hpp) · [短波场景](tests/scenarios/garden-w1.hpp)
- 连接状态使用 `Connection`，移动使用 `Input` 携带当前 `LifeId` 与移动轴。宿主在所属房间顺序调用 `queue()` 和 `step()`。命令按入队顺序在下一次模拟步采纳，移动持续到下一条有效移动指令、断线或该生命结束。
- 每次 `step()` 成功后读取 `view()` 和 `events()`。`view()` 是独立快照，含地图、当前与上一波计划、玩家状态、实体与花瓣槽。事件带结算 tick，有效期到下次成功的 `step()`，跨 tick 保留时需复制。广播节奏由宿主按 `broadcast_interval` 单独调度。
- 位置与速度使用场地单位和场地单位/秒，朝向使用弧度，血量使用 HP，冷却与生成计划使用整数 tick。实体句柄含对局、槽位与代次，生命 ID 含对局、存档玩家与生命代次。旧客户端的 ID、字段精度和字节量化由 W2 投影。 [快照与事件类型](server/sim/model.hpp)

## W0 · 快照与证据

W0 固定原客户端和 Garden 早期证据。验收只需要这个目录、外部原件、Node.js 22+ 和 Chromium。验收所用版本为 Node.js 24.13.0、Binaryen 132、Playwright Core 1.49.1 和 Chromium 156.0.8078.47。使用其他 Chromium 时报告会记录实际版本。

从仓库根目录运行。可将 `CHROME_PATH` 指向现有的无头 Chromium。未指定时 Playwright 使用它管理的 Chromium，可先运行 `npm --prefix wave exec -- playwright-core install chromium`。

```sh
export WAVE_SNAPSHOT="$PWD/wave-reference/20221030"
export CHROME_PATH=/absolute/path/to/chromium

npm --prefix wave ci
npm --prefix wave run verify:reference -- --snapshot "$WAVE_SNAPSHOT"
```

原 HTML、字体和图标是额外的固定输入。下载由归档清单限定，缓存文件及新下载文件都须符合字节数和 SHA-256。传入 `--resources` 会同时验收本地启动壳与原 HTML。

```sh
export WAVE_RESOURCES="$PWD/reports/wave/W0/wiki"
npm --prefix wave run fetch:archive -- --output-dir "$WAVE_RESOURCES"
npm --prefix wave run verify:reference -- --snapshot "$WAVE_SNAPSHOT" --resources "$WAVE_RESOURCES"
```

浏览器测试在隔离上下文中用本地字节响应原地址，并拦截全部其他 HTTP 请求和 WebSocket。原 JS 和 Wasm 从校验后的字节直接加载。默认写入 `reports/wave/W0/reference.json`、`catalog.json`、启动截图以及 `build/wave/reference/client.wat`。复制 `wave/` 到独立目录时，可传 `--output-dir`、`--build-dir` 和 `--revision`。

- [原资源清单](web/resources-20221030.json) 记录原页面的构建前缀、精确归档时刻、可选资源的回放时刻和哈希。第三方广告脚本在原页面验收中拦截。启动壳使用系统备用字体，归档页使用存档 Ubuntu 字体。
- [首包夹具](data/wire/20221030/bootstrap.json) 分开标记客户端实测出站字节、合成服务端响应和胶水探针。合成发现响应足以推进到首个 socket 帧。合成 `ff` 回包触发 `kUnknown`，历史成功回包和访客状态留给 W2。
- [证据索引](data/evidence/20221030/sources.json)、[规则表](data/evidence/20221030/rules.json) 与 [录像帧观测](data/evidence/20221030/video-observations.json) 以 UTC 截止点绑定旧修订、原 Wasm 和邻近时期画面。Garden 1–3 波的怪量、时间及批次属于 W1 的复刻设定。
- [Garden 夹具](tests/scenarios/garden-w0.json) 给 W1 定义类型化输入和预期转移。原生 `W0-GARDEN` 用例验证编入的候选配置和实际生成。

[W0 执行记录](../wave-goals/00-baseline-and-evidence.md#w0-执行结果)
