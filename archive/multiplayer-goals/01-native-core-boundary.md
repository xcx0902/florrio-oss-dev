# M01：拆分核心库与原生构建边界

状态：已完成（2026-11-01，工作区实现未提交；验收见 CHECKLIST）。依赖：M00。产出：无浏览器/Worker 单例依赖的 `engine_core`，以及能链接它的原生服务骨架。此阶段不接公网、不改变玩法。

## 01.1 目标目录和依赖

```text
CMakeLists.txt                   # M01 已实现：原生 superbuild
engine/CMakeLists.txt             # 继续支持单独 -S engine
engine/sources.cmake              # 领域/codec 与离线适配器分组清单
engine_core                      # model + sim + input codec + snapshot codec/publisher
engine_worker_adapter            # WorkerApi + wasm ABI + 本地诊断，依赖 engine_core
server/CMakeLists.txt             # M01 已实现
server/include/florr/server/      # Room/Session/配置等宿主边界
server/src/main.cpp              # 原生入口
server/src/runtime/               # 不进入 Emscripten 源表
server/tests/                     # 原生宿主测试
```

原生服务只链接 `engine_core` 和后续 `server_runtime`；现有需要 WorkerApi 的原生测试、WASM 产品和离线诊断显式链接 `engine_worker_adapter`。不要靠静态链接器「当前恰好没拉进来」来隔离 ABI 单例。

## 01.2 执行步骤

1. 将当前 `sources.cmake` 拆成具有唯一来源的 `ENGINE_CORE_SOURCES` 与 `ENGINE_WORKER_ADAPTER_SOURCES`。从核心源表移出 `src/net/worker_api.cpp`、`src/wasm/abi.cpp`、`src/diagnostics/commands.cpp`；先检查所有消费者，再修改链接关系。
2. 若 `SnapshotPublisher` 仍依赖单玩家 World，先保留其领域位置，不在此阶段重写；M04 再改接口。此阶段禁止引入服务器网络头到 engine。
3. 把诊断中可复用的实体修改实现与 C ABI thunk 分开。测试若需要域内诊断，接收显式 World；只有离线适配层可调用 `current_worker_api()`。
4. 为 CMake 新增适配器 target。将现有 12 个 CTest（含 M00 单玩家基线） 和 native snapshot fixture 逐一链接到其真实依赖；不能让所有测试为省事继续从 engine_core 获得隐藏全局入口。
5. 更新 Emscripten target，使其显式包含适配器并继续使用 `abi-exports.json`。静态库 dead-strip 下仍能导出所需 ABI；按实际构建验证，不靠头文件存在推断。
6. 新增根 CMake，在根目录先启用 CTest/`enable_testing()`，`add_subdirectory(engine)` 后再加入 `server`，同时保证原有 `cmake -S engine -B build/engine` 不依赖根构建。两种入口的 CTest 注册不得遗漏或重复。
7. 新增最小 `florr_server`：支持 `--help`、`--version`、配置解析失败退出码；使用显式 World 初始化并进行有限 tick 的 smoke 模式。尚未接网络时只提供 `--smoke-ticks N`，不要运行一个没有测试出口的无限主循环。
8. 新增 `engine_native_link_tests`，只链接 core，创建两个 World 交替推进，对比单独推进的结果；测试进程无需初始化 WorkerApi。
9. 将严格浮点、C++20、警告和禁异常/RTTI选项作用于 engine 自己的 target，不通过 PUBLIC 编译参数强制污染网络库。网络层使用该库支持的显式错误处理，禁止异常穿过 engine 边界。
10. 提取世界初始化/填充/RNG 兼容步骤为显式 `WorldConfig` / 初始化函数，离线适配器和服务端共用；服务端不能漏掉 `WorkerApi::init/think` 当前承担的初始化和每 tick RNG 推进约定。保持 1 玩家基线，人数变化导致的 RNG 消耗变化单独解释。
11. 为原生构建加入精确依赖锁定和输入身份：根 CMake、`server/`、依赖锁定文件、生成 schema、编译选项和工具链。可先新增独立 native identity，不降低现有 WASM delivery 校验。
12. 计划新增 `build:server`、`test:server:native` npm 入口；脚本只编排 CMake/CTest，不在 Node 中运行游戏 engine。

## 01.3 已实现命令

M01 已落地，完整说明见 [server/README.md](../server/README.md)：

```sh
cmake -S . -B build/native -DCMAKE_BUILD_TYPE=Release -DFLORR_BUILD_SERVER=ON
cmake --build build/native -j 6
ctest --test-dir build/native --output-on-failure --no-tests=error
./build/native/server/florr_server --smoke-ticks 20
```

宿主 smoke 成功应输出实际 tick=20、实体数和种子摘要后正常退出；不得加载 `.wasm`，也不得初始化全局 C ABI。测试应使用可注入的时钟/配置，不通过真实等待 1 秒验证 tick 数。

## 01.4 回归与完成条件

- [x] `npm run test:engine` 通过，现有 native fixture 正常。
- [x] WASM 构建、ABI 校验和现有离线真实入口仍通过。
- [x] 原生服务仅链接 core 即可运行；链接产物中没有 Worker/cheat ABI 必需依赖。
- [x] 两个 World 的交替推进测试通过，独立种子/事件/碰撞缓存不串用。
- [x] 原有单玩家规则、浮点运算顺序与阶段顺序不变。
- [x] `engine_core` 到网络/宿主/单例的反向依赖为零。

建议拆成三次提交：源表与适配器拆分 → 根构建与 smoke → identity 与回归接入。

## 01.5 实现落点

- `ENGINE_CORE_SOURCES` 与 `ENGINE_WORKER_ADAPTER_SOURCES` 为唯一、互不重复的源表；
  Worker/ABI/诊断 thunk 只在适配器。复用诊断放在 `diagnostics/entities.*`，显式接收 World。
- `initialize_world(World&, WorldConfig)`、`advance_world(World&)` 共用人口/句柄/game/death
  seeds 与 50ms tick；保持填充前两次和每 tick 六次 game RNG draw。离线同一 Worker 对象
  重复 init 保持既有 death-shuffle stream，原生新 World 使用显式配置种子。
- 独立 engine 构建注册 13 CTest；根构建注册相同 13 项加 5 项宿主回归，共 18 项，
  精确清单见 `tests/product-tests.json`，无重复或遗漏。需要 Worker 的原有测试显式链接适配器。
- 根宿主使用锁定 Boost 1.86.0 官方归档头文件和 `Threads::Threads`。归档 SHA256 和
  version 双校验；可预置完全相同归档，无系统版本回退。M01 不实现网络监听。
- `build:server` 记录 native source/verification、实际头文件树、编译器/选项/cache、
  artifact hash，并用 `nm` 检查 core 和宿主无 Worker/cheat ABI；`test:server:native`
  拒绝陈旧源码/测试或产物，记录封闭清单结果。完整验收新增两个真实 native gate，共 17 gate。
- M01 未增加玩家数或改变单玩家规则；M02 开始迁移玩家状态，M04 再处理发布事件所有权。
