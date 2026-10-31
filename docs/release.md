# 本地产品发布

发布目录是 `dist-next/`，对外是纯静态页面。项目保持 private，不向 npm 或远端自动发布。
依赖与固定版本工具链见 [environment.md](environment.md)。

## 验收并准备包

```sh
npm ci
npm run schema:check
npm run test:all
npm run release:prepare
```

`test:all` 以 `tools/verification/gates.mjs` 为唯一顺序：schema、native build/全部
CTest、wasm、client、package once、unit/tools/client unit、跨端、ABI、交付完整性、
共享固定 Chrome 的浏览器/真实入口/绘制性能、引擎性能、跨端性能，共 15 gates。
这条命令已经覆盖 build 与三个 perf，不必为同次发布再次编译。

每次运行创建 `reports/runs/<runId>/run.json` 与各 gate 日志，结束发布
`reports/current-verification.json`。schema5 ledger 记录源码、验证输入、工具版本、
测试清单、日志与报告哈希及同一次交付身份。失败、中断、测试遗漏或输入变化不通过。
若源码/测试/构建工具/交付在验收后变化，prepare 会拒绝；先重新执行完整验收。

独立运行 `npm run build` 或 `build:dist-next` 会生成 `runId: null` 的交付。
即使产品文件哈希相同，它也不再绑定先前的验收运行。完整验收通过后直接执行
`release:prepare`；若中间重新构建交付，必须重跑 `test:all`，不要手工修改 manifest
或复制旧报告来恢复绑定。浏览器场景需要固定版本时，先设置 `CHROME_PATH`，再运行
`node tools/check-browser-version.mjs` 确认所选版本，随后在同一环境执行完整验收。

成功输出：

```text
release/florrio-<version>-<source12>-<runId>/
  florrio-<version>-<source12>.tar.gz
  release-manifest.json
  SHA256SUMS
```

manifest 含版本、Git revision（无 Git 的干净副本为 null）、源码/验证身份、ledger
哈希、编译器、features、协议/存储版本、交付文件路径/大小/哈希。源码哈希而不是 Git
revision 区分未提交改动。存储格式 `florr-menu-v1` 表示既有 `florr-menu` JSON 格式，
并非新 localStorage key；旧昵称与设置键继续兼容。

默认包不含 archive、测试 API/fixture、d.ts、map 或构建记录副本；只含产品资产及
交付/发布 manifest。保留的 diagnostics 是现有 `?cheat` 产品能力。

## 校验、解包、启动

将下例目录和包名替换为 prepare 打印的实际路径：

```sh
cd release/<prepared-directory>
shasum -a 256 -c SHA256SUMS
mkdir -p /tmp/florrio-release
# tar 只包含一个以产品名和源码身份命名的顶层目录。
tar -xzf <product>.tar.gz -C /tmp/florrio-release
cd /path/to/florrio-oss
node serve.mjs --root /tmp/florrio-release/<product> --no-open
```

也可用任一静态 HTTP server 提供解包后的目录。不要用 file://。
源码目录中 `npm run verify:delivery` 校验当前 dist-next 与编译输入；分发后用外部
SHA256SUMS 和包内 release-manifest.json 的逐文件哈希检查完整性。

## 上一产品包回退

保留上一份已校验的 tar.gz、SHA256SUMS 与 release manifest。需要回退时先校验并解包
至新的目录，停止当前静态 server，再把 `serve.mjs --root` 或部署目录切到上一包。
既有存储 key/格式未变，本次无数据迁移。回退不恢复原版 worker、旧 decoder、archive
或历史源码。服务端模拟在浏览器本地，替换静态版本后重新载入页面开始新局。

## 无归档干净副本

```sh
rsync -a --exclude .git --exclude archive --exclude node_modules \
  --exclude build --exclude 'dist*' --exclude reports --exclude release \
  --exclude .emcache --exclude public ./ /tmp/florrio-product/
cd /tmp/florrio-product
npm ci
npm run schema:generate
npm run test:all
npm run release:prepare
```

使用同一 `.emscripten-version` / `.chromium-version`，可用 CHROME_PATH 指定固定浏览器。
依赖安装可联网；产品生成/构建/验收不访问原版站点或归档。产物时间、runId、绝对路径
可不同，产品输入哈希应相同。不要通过复制已有 build/dist/reports 代替这次干净构建。
