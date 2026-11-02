# 原生多人部署与升级

本页描述 M08 的原生包、反向代理、进程管理和升级/回滚。它不替代
[配置契约](configuration.md) 或 [网络客户端契约](network-client.md)。

## 发布物

`npm run pack:native` 在 `release/multiplayer/<version>-<source12>-<runId>/` 生成：

```text
client/                     在线专用静态树（无 wasm/worker/dev）
server/florr_server         原生 C++ 可执行文件
server/config/default.json  严格配置模板
server/deploy/nginx.conf    TLS + WebSocket 代理示例
server/deploy/caddy.conf    等价 Caddy 示例
server/deploy/florr-server.service systemd unit
licenses/                   Ubuntu 字体许可证
THIRD_PARTY_NOTICES.md
README.md
release-manifest.json       源码/协议/二进制/文件 hash 与目标平台
SHA256SUMS
```

`release-manifest.json` 的 `target` 是刻意显式的。macOS 本机构建的包不能当作
`linux-x86_64` 产物；Linux 发布由 `.github/workflows/multiplayer-release.yml` 在
`ubuntu-latest` 构建并用同一 `pack:native` 生成。两个平台的二进制不能互换。

## 启动顺序

1. 在目标机解包，校验 `sha256sum -c SHA256SUMS` 和 `server/florr_server --version`。
2. 复制 `server/config/default.json` 为 `/etc/florr/server.json`，设置
   `listenAddress`、`listenPort`、`allowedOrigins`、`maxRooms`、
   `initialMaxPlayersPerRoom`、代理信任和 TLS 终止方式。未知/缺失键会拒绝启动。
3. 静态服务器只提供 `client/`；`index.html` 的 `main.js` 是在线入口。
4. 用 systemd 启动原生进程。`/healthz` 是进程存活，`/readyz` 在排空/过载时 503，
   `/metrics` 只给本机监控。
5. nginx/Caddy 把 `/ws` 升级到原生进程，设置至少 65 秒读写超时并关闭代理缓冲。
   WebSocket 不能被 CDN 缓存或压缩。

`npm run start:multiplayer` 仅用于本机验收：它从 `server/config/default.json` 生成
临时配置，启动原生服务和 `serve.mjs`，自动选择空闲端口，输出 `{"event":"ready",...}`，
并在退出时清理临时配置。

## 升级与排空

会话只存在内存中。服务端没有会话迁移或跨进程恢复；升级必须接受在线会话中断。
推荐成对切换：

1. 启动新版本到新端口，等待 `/readyz` 200；先不要导入流量。
2. 从代理上游移除旧实例，或把新连接切到新端口；旧实例停止接收新加入。
3. 向旧进程发送 `SIGTERM`。它立即停止准入、返回 503 `/readyz`，在
   `shutdownDrainMs` 内完成/取消连接并退出 0。不要用 `SIGKILL` 跳过排空。
4. 确认旧进程退出、new `/readyz` 200、真实新会话可加入；再移除旧包。

代理切换只影响新 TCP 连接；已有 WebSocket 会留在旧进程直到排空。若代理不做连接
排空，必须显式等待 `shutdownDrainMs` 后再删除旧进程。`/metrics` 的 `closed`、
`teardowns` 和 `overloads` 用于确认没有未解释的断开或过载。

## 回滚

保留上一份完整部署包（客户端 + 服务端 + 配置）和 `release-manifest.json`。回滚步骤
与升级对称：启动旧包到备用端口、等待 ready、切回代理、排空新进程。不要只回滚
`florr_server`：服务端不向后兼容旧客户端；客户端/服务端协议版本和 catalog hash
必须匹配。只替换客户端且协议/目录不变时可以保留服务端，但仍应做真实会话 smoke。

`npm run test:multiplayer:deploy` 对当前包执行进程级 smoke：旧实例启动并接受真实
v2 会话、SIGTERM 后 `/readyz` 先 503 再干净退出、新实例接受新会话、TCP 代理切换到
新上游后新会话可达、回滚实例再接受新会话。它不是 nginx/Caddy 配置的替代验证；
生产仍需在目标发行版上跑同样的健康检查和一次真实浏览器加入。
