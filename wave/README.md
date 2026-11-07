# Florr.io Wave 2022-10-30

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

测试入口使用单独编译的 `wave_host_fixture`，固定种子与短批次由测试宿主提供，专用端点只推进 W1 时钟。正式 `wave_host` 使用 Garden 规则，不包含测试端点。手动复查时，A 点击 Squad 创建私有房，复制地址栏中的邀请链接到另一隔离浏览器上下文，双方填写昵称并点击 Ready。

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
