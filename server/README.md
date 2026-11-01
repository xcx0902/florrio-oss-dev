# 原生 WebSocket 宿主（M05）

`florr_server` 通过异步 Boost.Asio/Beast 接受二进制 v2 WebSocket，以独立单调时钟
推进房间。一个 `io_context::run()` 线程独占 I/O 和全部房间；每个房间每 50ms
只推进一次共享 World，再发布各连接的独立快照。默认浏览器入口已通过 M06 接入，
公开配置和在线生命周期见 [网络客户端契约](../docs/multiplayer/network-client.md)。

## 构建与运行

要求 CMake 3.20+、C++20 编译器、macOS 10.12+ 或 Linux（`getentropy`）。
Node 只编排构建和验收，服务运行不需要 Node/Emscripten。

```sh
npm run build:server
npm run test:server:native
./build/native/server/florr_server --check-config
./build/native/server/florr_server --config server/config/default.json
```

默认监听 `127.0.0.1:8787`；`GET /healthz` 返回进程存活，`GET /readyz` 在过载或
排空时返回 503，`GET /metrics` 返回固定标签的有界计数。`/ws` 不接受 URL 参数或
文本消息。生产同源代理终止 TLS，静态资源走 `/`，WebSocket 转发到 `/ws`。

配置文件必须包含 [default.json](config/default.json) 的所有键，并使用严格 JSON 类型；
未知/重复/缺失键、无界值、数值字符串、非法 Origin 和协议固定值变更均拒绝。
唯一参数契约见 [configuration.md](../docs/multiplayer/configuration.md)。
默认不接受浏览器 Origin 或缺失 Origin 的客户端。开发时复制完整配置文件，显式将
`allowedOrigins` 设为 UI 的完整 Origin；无 Origin 的原生测试客户端只能在测试副本中
打开 `allowMissingOrigin`。默认配置始终保留 `false`，没有通配符或压缩。
`Forwarded`/`X-Forwarded-*` 当前全部忽略，不作为身份或授权来源。

也可完全不经 Node 构建/运行：

```sh
cmake -S . -B build/native -DCMAKE_BUILD_TYPE=Release -DFLORR_BUILD_SERVER=ON
cmake --build build/native -j 6
ctest --test-dir build/native --output-on-failure --no-tests=error
./build/native/server/florr_server --config server/config/default.json
```

SIGINT/SIGTERM 先停止准入，发送 `STOPPING`，在 `shutdownDrainMs` 内完成或取消
全部连接、timer 和房间。默认排空期限为 5 秒。配置/启动失败退出 2；正常排空退出 0。
启动日志包含版本、源码构建摘要、协议/目录 hash；停止日志输出计数，不含 token、昵称或路径。

## 身份、时序与资源

Hello 通过目录/协议校验前不创建玩家。Hello 在下一个模拟边界准入，Welcome 返回
PlayerId、RoomEpoch、SessionEpoch 和宿主密码学随机生成的 32-byte resume token。
初始状态是未出生，客户端使用 Spawn 命令；位置、装备、伤害与生命都由 core 裁决。

输入与离散命令分别排队、限流和去重。每连接每 tick 最多执行 4 条命令；只有采用新
输入序号才续期 5 tick。每个连接有一个 active read 和一个 FIFO active write，所有
缓冲持有至回调完成，active + pending 总量超过 1MiB 关闭为 `SLOW_CONSUMER`。
关闭等待已有 write，write/close/shutdown 各自有单调墙钟 deadline；取消和迟到回调
统一执行一次 teardown。

服务端每 5 秒发送协议 v2 二进制 Ping；客户端必须回送完全相同的 nonce、serverTick、
monotonicMs 的 Pong，其他流量和 WebSocket 控制帧不能续期，15 秒无匹配回应则关闭。
客户端 Ping 同样获得对应 Pong，并受独立控制消息桶限流。

断线和显式 Leave 都立即停止接收输入，在房间边界解绑，身体按原规则继续模拟，200 tick
grace 到期才清理。有效 token 可以接管仍在线的旧连接；接管和 grace 内恢复都原子轮换
token、分配新 SessionEpoch、发送新全量。旧 token 不再有效。Leave 保留 token 的同一
grace 权限；退出 UI 不授予无敌。空房 1200 tick 后销毁，同名房间重新生成 RoomEpoch。

调度器最多补 4 tick，记录并丢弃超量墙钟积压，保持 50ms dt 和真实模拟计数；过载时
readiness 为非就绪且不接受加入。默认两房间、每房间两人（含 grace 保留身份）。
8 人是 M08 的显式容量验收目标，本阶段不提高发布默认容量。

## 依赖与验证

根 CMake 从 `cmake/dependencies.lock.json` 固定的官方 Boost 1.86.0 归档和 SHA256
消费 Asio/Beast/System 头文件；不使用系统 Boost 或新增动态依赖。可预置同一归档：

```sh
FLORR_BOOST_ARCHIVE=/absolute/path/boost_1_86_0.tar.bz2 npm run build:server
./build/native/server/florr_server --smoke-ticks 20 --seed 37
```

`--smoke-ticks` 保留有限、不等待墙钟的旧诊断入口；不能与网络配置混用。
`florr_server -> server_runtime -> engine_core` 没有 Worker/cheat ABI 链接。
正式消息只有 schema v2 的输入/领域命令，不提供远程诊断；网络故障注入仅编译进测试 target。

`test:server:native` 对照 `tests/product-tests.json` 精确检查根构建 **29 项 CTest**，
包含 18 项 engine、10 项宿主回归和 1 项浏览器 fixture 检查。M05 新增 runtime 13、network 8、faults 6、process 2
共 29 个场景，覆盖 fake clock、真实双 WebSocket、token 竞争、慢连接、取消和两个进程信号。
构建记录源码/配置/依赖/实际 Boost 树、编译器、选项和产物 hash；包含新测试可执行文件，
运行前拒绝过期或篡改产物。现有 `test:all` 的两项 native gate 包含全部宿主回归。

报告仍由通用工具写入 `reports/multiplayer/m01/<runId>/{build,ctest}.json`，当前摘要在
`reports/multiplayer/native-{build,ctest}.json`；M05 完整归档和命令见
[执行清单](../multiplayer-goals/CHECKLIST.md)。M06 的专用原生 fixture 使用同一 runtime/core，
固定测试出生点和装备；真实双浏览器负责移动、战斗、死亡、重生、恢复和隔离验证，
不增加公开 debug RPC。延迟预测和 Linux 发布包、2×8 容量认证留给 M07/M08。
