# Wave 公共预览部署

公开入口：`https://preview.florriowave.xcx0902.dpdns.org:18443/`。网络路径为公网
TCP 18443 → `192.168.9.100:18443` Caddy → `127.0.0.1:8480` 正式 `wave_host`。
域名的 A 记录应直接指向 NAT 的公网
地址；若发布 AAAA 记录，也须保证该 IPv6 地址能访问相同服务。

本地 Caddy 提供 `http://localhost:8080` 和 `https://localhost:8443`。后者使用独立本地
CA，安装脚本不会将它加入系统信任；自动验证使用对应 `root.crt`。公网入口由 Caddy
通过 Cloudflare DNS-01 申请和续期受信任证书，不依赖公网 80/443。浏览器地址需要
保留 `https://` 和 `:18443`。实际部署与验收记录见 [STATUS.md](STATUS.md)。

## 构建和装配

```sh
cmake -S wave -B build/wave/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/wave/native --parallel
ctest --test-dir build/wave/native --output-on-failure --no-tests=error
npm --prefix wave start -- --assemble-only --snapshot "$PWD/wave-reference/20221030" \
  --origins 'http://localhost:8080,https://localhost:8443,https://preview.florriowave.xcx0902.dpdns.org:18443'
```

`start --assemble-only` 校验原版 JS/Wasm 哈希并装配 `build/wave/preview/web`。
装配时将固定版本 JS 的单个 hostname 导入设为 `localhost`，使原版的离线启动路径能在
公共域名运行；页面地址、资源、发现及 WebSocket 仍使用真实部署 Origin。原始快照保留。
不带该选项时会使用独立预览数据库启动正式宿主。`npm run dev` 的库存修改面板、
测试推进接口均不进入正式宿主。装配完成后安装下述后台服务。

## macOS 后台服务

原生程序、装配资源、存档和日志安装到
`~/Library/Application Support/FlorrioWavePreview/`。避免 launchd 从受 macOS 隐私保护的
Documents 目录直接运行。更新前会停止预览实例并等待正常排空；现有预览存档保留。
本地开发服及 `build/wave/saves/` 中的开发存档独立保留。

```sh
node wave/tools/deploy/install-backend-macos.mjs
node wave/tools/deploy/install-caddy-local-macos.mjs
```

对应当前用户的 LaunchAgent：

- `org.xcx0902.florriowave.preview`：正式原生宿主，登录时启动、退出后自动重启。
- `org.xcx0902.florriowave.caddy-local`：仅回环可访问的 8080/8443 本地代理。

本地验证通过后，安装公共 Caddy 系统服务。此步骤需要管理员授权。Caddy 程序、配置和
DNS 凭证复制到系统目录，由 root 持有；后端仍以当前用户身份运行。

先准备仅限 `xcx0902.dpdns.org`、具有 `Zone:Read` 与 `DNS:Edit` 权限的 Cloudflare
API Token，通过本机隐藏输入框保存。脚本先验证 Token 和区域读取权限；真正的 DNS
写入权限由首次 ACME 验证确认。Token 不出现在命令参数或仓库文件中。

```sh
node wave/tools/deploy/configure-cloudflare-macos.mjs
node wave/tools/deploy/install-public-macos.mjs
```

脚本将安装文件暂存至 `/private/tmp` 后通过系统窗口请求管理员授权，避免提权进程
读取 Documents 时受到隐私限制。系统服务为 `org.xcx0902.florriowave.caddy`，配置在
`/usr/local/etc/florriowave-preview/Caddyfile`，程序在
`/usr/local/libexec/florriowave-preview/caddy`，证书在
`/var/lib/florriowave-preview/caddy`，日志在 `/var/log/florriowave-preview/caddy.log`。
需事先将含 `dns.providers.cloudflare` 的 Caddy macOS ARM64 二进制放到
`build/wave/preview/bin/caddy`。本次使用 Caddy 官方构建服务的 Caddy 2.11.9 +
`github.com/caddy-dns/cloudflare` 0.2.4；实际模块、构建信息和 SHA-256 在验收记录中。
普通发行包不包含该 DNS 模块，安装脚本会拒绝使用。

用户凭证文件为 `~/Library/Application Support/FlorrioWavePreview/secrets/cloudflare-token`，
其目录权限 700、文件权限 600。系统副本为
`/usr/local/etc/florriowave-preview/cloudflare-token`，root 所有、权限 600。
启动脚本读取此文件并仅通过进程环境提供 Token；Caddyfile 保留环境变量占位符。
更换 Token 后重跑上述两条命令。Caddy 保持运行时自动续期，无须手动添加 TXT 记录。

后端服务依赖该用户登录。主机需要保持开机、联网且不进入睡眠；上述脚本不更改系统电源
设置。当前 NAT 规则为 WAN1 TCP `18443 → 192.168.9.100:18443`，TCP 已足够使用
HTTPS/WSS；该规则不代理或暴露后端 8480。Cloudflare A 记录使用 DNS only。

## 容量与连接

| 设置                     |       默认值 | 含义                                                |
| ------------------------ | -----------: | --------------------------------------------------- |
| `WAVE_MAX_PLAYERS`       |           32 | 同时占用的 WebSocket 名额，含尚未完成身份握手的连接 |
| `WAVE_MAX_CONNECTIONS`   |          128 | 包括 HTTP 加载在内的总连接上限                      |
| `WAVE_MAX_ROOMS`         |           32 | 单进程房间上限，每队最多四人                        |
| `WAVE_MAX_GUESTS`        |          256 | 内存访客缓存上限，独立于 SQLite 的累计存档数        |
| `WAVE_RECONNECT_SECONDS` |          300 | 断线对局身份的保留时间                              |
| `WAVE_ALLOWED_ORIGINS`   | 本机宿主地址 | 额外允许的完整 Origin，逗号分隔                     |

这些值是资源边界，不代表跨主机、跨网络的性能保证。满员的 socket 升级请求返回 503，
不会挤占全部 HTTP 加载连接。握手需在 10 秒内完成；WebSocket 使用 30 秒失活检测和
ping；每连接每秒最多接收 120 条应用消息；profile 读取／创建入口每秒最多接收 64 次请求。

断线访客在宽限期后回收；缓存满时可提前回收没有对局或对局已结束的无连接访客。
仍被会话引用的对象和仍有待提交事务的对象不会被删除。回收内存不会删除持久存档，
活动小队不会因其他访客回收而被移除。单会话的准入／协议异常在连接层隔离。

客户端根据页面协议选择 WS/WSS，发现、资源、缓存和游戏连接全部走同源地址。
后端保持回环监听及严格 Host 校验，Caddy 固定向后端传递 `Host: localhost:8480`；
WebSocket Origin 必须在允许列表中，不信任浏览器提供的任意转发头。

存档仍使用浏览器 `localStorage` 中的访客凭证。公共域名与 localhost 使用不同的浏览器
存储，新域名初次访问会创建新存档；清除浏览器数据会丢失自动恢复所需凭证。
预览提供访客游戏，不接入旧站 Discord／Apple 登录。

## 验证

```sh
# 隔离数据库：访客反复入局、容量拒绝、真实协议 ACK 和游戏输入。
npm --prefix wave run test:capacity -- --snapshot "$PWD/wave-reference/20221030" \
  --players 4 --seconds 10 --output "$PWD/reports/wave/preview/capacity-isolated.json"

# 真实 Caddy TLS 链路：32 个同时连接的协议客户端。
npm --prefix wave run test:capacity -- --url https://localhost:8443/ \
  --ca "$HOME/Library/Application Support/FlorrioWavePreview/caddy/data/caddy/pki/authorities/local/root.crt" \
  --players 32 --seconds 90 --output "$PWD/reports/wave/preview/capacity-local-tls.json"

# 原版客户端：双人邀请、入局、鼠标输入、换浏览器上下文重连。
npm --prefix wave run test:deploy -- --url https://localhost:8443/ --insecure-local \
  --output "$PWD/reports/wave/preview/local-browser"
npm --prefix wave run test:deploy -- --url https://preview.florriowave.xcx0902.dpdns.org:18443/ \
  --output "$PWD/reports/wave/preview/public-browser"
```

测试脚本默认使用 macOS Google Chrome，可通过 `--browser` 或 `CHROME_PATH` 指定。
`--insecure-local` 仅用于 localhost 本地证书；公网验收保留正常证书校验。
健康检查为 `/healthz`，返回连接数、访客缓存、房间数、待提交工作和模拟耗时，不返回凭证。
容量测试会占满服务，应在发布前或维护窗口执行。

## 存档、更新与停止

正式数据库位于
`~/Library/Application Support/FlorrioWavePreview/saves/profiles.sqlite3`。
在线备份使用 SQLite backup 接口，避免只复制主文件而遗漏 WAL：

```sh
sqlite3 "$HOME/Library/Application Support/FlorrioWavePreview/saves/profiles.sqlite3" \
  ".backup '/absolute/backup/path/profiles.sqlite3'"
```

重新构建和装配后再次运行 `install-backend-macos.mjs` 可更新运行副本，保留预览数据库。
更新系统 Caddy 配置后，再次运行管理员安装脚本。

```sh
# 查看或重启后端。
launchctl print "gui/$(id -u)/org.xcx0902.florriowave.preview"
launchctl kickstart -k "gui/$(id -u)/org.xcx0902.florriowave.preview"

# 停止服务（存档保留）；重新启动可再次运行对应安装脚本。
launchctl bootout "gui/$(id -u)/org.xcx0902.florriowave.preview"
launchctl bootout "gui/$(id -u)/org.xcx0902.florriowave.caddy-local"
sudo launchctl bootout system/org.xcx0902.florriowave.caddy
```

`kickstart -k` 为进程级强制重启，仅用于恢复故障；正常更新和停机使用安装脚本或
`bootout`，允许已排队的存档事务先正常排空。进程重启可恢复已提交的存档，正在进行的
对局只保存在内存中，不承诺跨进程恢复。
