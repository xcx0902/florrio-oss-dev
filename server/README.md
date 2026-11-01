# M01 原生宿主骨架

当前宿主只提供有限 tick smoke，不监听网络。M02 已在 engine_core 实现进程内
多玩家状态和显式领域命令，M03 补齐原生 PVP 与玩法归属；M04 已实现 v2 协议和每连接复制契约，见 [复制交接](../docs/multiplayer/replication.md)。WebSocket 和浏览器接入按 M05—M06 继续。
浏览器产品入口仍使用离线 Worker。

## 构建与验证

要求 CMake 3.20+、C++20 编译器；Node 只编排构建/证据，不运行游戏模拟。

```sh
npm run build:server
npm run test:server:native
./build/native/server/florr_server --help
./build/native/server/florr_server --version
./build/native/server/florr_server --smoke-ticks 20
./build/native/server/florr_server --smoke-ticks 20 --seed 37
```

也可完全不经 Node 构建/运行宿主：

```sh
cmake -S . -B build/native -DCMAKE_BUILD_TYPE=Release -DFLORR_BUILD_SERVER=ON
cmake --build build/native -j 6
ctest --test-dir build/native --output-on-failure --no-tests=error
./build/native/server/florr_server --smoke-ticks 20
```

`--smoke-ticks` 必须在 1—1000000 之间；`--seed` 必须在 1—2147483646 之间，
默认 game seed 为 285456437。未知、重复、缺值和越界配置退出码均为 2。
smoke 不等待墙钟时间，20 tick 的模拟时间固定为 1000ms，并输出 JSON 的 tick、
实体数、初始 game seed、game RNG state/draws、handle RNG state 和 death RNG state。
handle 的 u64 state 用字符串输出，避免 JSON number 精度损失。

## 依赖与边界

根 CMake 通过 `cmake/dependencies.lock.json` 固定的官方 Boost 1.86.0 归档及
SHA256 获取头文件，仅消费 Asio/Beast/System；不配置 Boost 自带 CMake project，
也不退回系统版本。归档许可证 `LICENSE_1_0.txt` 和实际头文件树均进入 native identity。
线程使用 CMake `Threads::Threads`。可预置同一归档完成离线构建：

```sh
FLORR_BOOST_ARCHIVE=/absolute/path/boost_1_86_0.tar.bz2 npm run build:server
# 或 cmake 配置时添加 -DFLORR_BOOST_ARCHIVE=/absolute/path/boost_1_86_0.tar.bz2
```

`florr_server -> server_runtime -> engine_core`，宿主没有 Worker/cheat ABI 链接。
engine 的严格浮点、禁异常/RTTI 参数为 PRIVATE，不传播到宿主和 Boost。
`cmake -S engine -B build/engine` 仍独立工作，不获取网络依赖。

## 验收证据

`build:server` 记录源码/生成 schema/依赖锁、实际 Boost 头文件树、编译器及哈希、
CMake 版本、编译选项、compile commands/CMake cache 哈希和二进制/静态库哈希；
通过 `nm` 拒绝 core 和宿主中的 Worker/C ABI 符号，并检查构建前后输入稳定。
`test:server:native` 对照 `tests/product-tests.json` 精确检查根构建 19 个 CTest，
包含独立 engine 构建的全部 18 项及 5 项宿主 CLI/配置/smoke 回归。
运行前拒绝过期源码或被修改的产物，不继承旧通过证据。

每次构建/测试记录于 `reports/multiplayer/m01/<runId>/{build,ctest}.json`；当前
摘要为 `reports/multiplayer/native-{build,ctest}.json`。完整 `test:all` 把两项新增
native gate 及报告哈希绑定到同一个验收 runId，继续保留所有 WASM delivery 校验。
报告和构建目录按仓库惯例不入 Git。尚未验证 Linux 发布、真实网络 PVP 或目标容量。
