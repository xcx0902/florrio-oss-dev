# 公共预览验收记录

验收日期：2026-11-15（Asia/Shanghai）。已完成本地部署和公网部署，公共入口为：

```text
https://preview.florriowave.xcx0902.dpdns.org:18443/
```

## 运行路径

```text
DNS A 112.80.175.185
  → WAN1 TCP 18443
  → 192.168.9.100:18443 Caddy
  → 127.0.0.1:8480 wave_host
```

路由器永久规则名为 `wave18443`。临时诊断规则已删除。80/443 的外部连接测试超时，
高位端口可用；用户选择高位 HTTPS 和 DNS 验证。此前已有的 80/443 映射保留。

| 服务                          | launchd 标识                          | 入口                               |
| ----------------------------- | ------------------------------------- | ---------------------------------- |
| 正式后端，用户 LaunchAgent    | `org.xcx0902.florriowave.preview`     | `127.0.0.1:8480`                   |
| 本地 Caddy，用户 LaunchAgent  | `org.xcx0902.florriowave.caddy-local` | `localhost:8080`、`localhost:8443` |
| 公共 Caddy，系统 LaunchDaemon | `org.xcx0902.florriowave.caddy`       | HTTPS `:18443`                     |

正式存档位于 `~/Library/Application Support/FlorrioWavePreview/saves/profiles.sqlite3`。
开发服及其数据库独立保留。Caddy 更新安装已实际完成一次正常停止、等待移除和重新启动，
重启后公共健康检查正常。

## TLS 与构建身份

Cloudflare DNS-01 已成功完成，签发机构为 Let's Encrypt YE2，证书域名为
`preview.florriowave.xcx0902.dpdns.org`。

- 当前证书有效期：2026-11-15 02:01:34 UTC 至 2027-02-13 02:01:33 UTC。
- 正常证书校验的 curl 与 Chrome 均已通过公共入口；公共测试没有跳过证书校验。
- Caddy 使用受限 Cloudflare API Token 自动续期；Token 仅保存于本机受限凭证文件。
- 用户凭证目录权限 700、文件 600；系统凭证为 root 所有、权限 600。
- Caddy 2.11.9，Cloudflare 模块 0.2.4，Go 1.26.4，macOS ARM64。
- 程序来源：Caddy 官方定制构建服务。本机记录的已安装程序 SHA-256：

```text
e4281bb67d1ce9104c9140d3878226a6a84c27c85798651ae44b2f47cdba5e17
```

完整构建信息见 `reports/wave/preview/caddy-build-info.txt`。以上摘要是本机记录值，
不是下载站另行发布的校验文件。

## 已通过的验证

| 检查                | 结果                                                      | 本机记录                                                 |
| ------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Release 原生 CTest  | 17/17 通过                                                | `build/wave/native/Testing/Temporary/LastTest.log`       |
| ASan + UBSan        | capacity、room_session、economy 共 3/3 通过               | `build/wave/preview/asan/Testing/Temporary/LastTest.log` |
| 隔离容量测试        | 4 个真实协议客户端、准入和存档检查通过                    | `reports/wave/preview/final-capacity-isolated.json`      |
| 本地 Caddy TLS 压测 | 32 个协议客户端持续 90 秒，第 33 个返回 503               | `reports/wave/preview/capacity-local-tls.json`           |
| 本地原版客户端      | 双人邀请、入局、鼠标输入、存档和对局重连通过              | `reports/wave/preview/final-local-browser/smoke.json`    |
| 公共域名原版客户端  | 上述完整流程通过，所有资源和 WSS 同源，无运行时或解码错误 | `reports/wave/preview/public-browser/smoke.json`         |
| 独立外网 HTTP 探测  | 日本、荷兰、伊朗节点均对公共 `/healthz` 返回 200          | `reports/wave/preview/public-http-result.json`           |
| 部署脚本与格式      | ESLint、Prettier、Shell 语法、diff 空白检查通过           | 安装脚本及源码                                           |

本地 32 客户端测试累计收到 94,274,663 字节，每客户端至少收到 1,701 帧。
观测到的最大模拟 step 为 15.394666 ms；该指标不含所有投影、发送和网络成本。
外部 HTTP 探测请求编号为 `57e84680k7a0`，响应及节点身份分别保存在
`public-http-result.json`、`public-http-request.json`。

公共浏览器验收从部署主机访问公共域名，经 NAT 回环连接；独立外网节点验证了 HTTPS
入口可达。尚未进行跨外网的 32 人同时游玩压测，因此本地结果不构成公网带宽保证。

## 公共域名启动适配

最初公共页面能读取全部资源与存档，但原版客户端停在 Loading，未建立 WebSocket。
隔离浏览器实验确认：将固定版本 JS 的 hostname 导入 `146708` 返回值设为 `localhost`
即可进入原版离线启动路径，随后正常建立公共域名的 WSS 并显示 Ready。

正式装配会先校验原始 JS/Wasm 哈希，再替换这个唯一的 JS 导入表达式。原始快照保留，
真实页面地址、资源、发现和 socket 均保持部署 Origin。未适配时的诊断及对照实验保存在
`reports/wave/preview/public-browser/diagnostic.json` 与 `hostname-probe.json`；
最终结果以同目录下 `smoke.json` 为准。该定位依据为实际浏览器实验及本地脚本检查。

## 持续运行条件

当前同时游戏连接上限为 32、总连接上限为 128、房间上限为 32；断线对局保留 300 秒。
满员拒绝、握手超时、消息速率限制、访客缓存回收和存档保护均已启用。

主机须保持开机、联网、唤醒并登录部署用户，正式后端使用该用户的 LaunchAgent。
公网地址必须带 `https://` 与 `:18443`；公网 IP 如变化，需要更新 DNS A 记录。
重启后端保留已提交的存档，但内存中的进行中对局不跨进程恢复。维护和备份方法见
[README.md](README.md)。
