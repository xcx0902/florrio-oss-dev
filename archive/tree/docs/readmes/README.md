# Legacy Florr.io —— C++20 + TypeScript 语义重建

> 以 2020–2022 年间的 **Legacy Florr.io** 为对象，用 C++20 重建服务端与共享规则，
> 用 TypeScript + Canvas2D 重建 Web 客户端；原始 WASM / WAT / JS 永久保留为只读 oracle。

Legacy Florr.io 是官方留在 [`static.florr.io/old/`](https://static.florr.io/old/) 的静态快照。
它的多人匹配服务（`api.n.m28.io` → `<region>.s.m28n.net`）早已下线，但客户端原本就带有
一条 localhost 单机路径：浏览器把服务端模拟核心作为 Web Worker 启动，整局游戏在本地完成。
本仓库以这条路径为行为基线，并把早期“WAT + JS 逐函数替换”的逆向工作推进为按领域组织的
可维护重建。

当前默认交付树是 `dist-next/`：**C++20 引擎 wasm + TypeScript 客户端**，
不依赖任何外部服务器。

## 当前状态

| 项目 | 状态 |
| --- | --- |
| 运行方式 | 纯 Web、单机；无匹配服务、无外部资源请求 |
| 服务端 | C++20 → WebAssembly，运行在 Web Worker 中 |
| 客户端 | TypeScript + Canvas2D |
| 协议/布局 | [`schema/`](schema/README.md) 为单一事实来源，生成 C++ / TS 访问器 |
| 默认交付 | `dist-next/`，由源码重新构建 |
| 浏览器范围 | Chromium 桌面 + 触控模拟；Firefox / WebKit / 真机为非目标 |
| 验收 | 本地完整验收；仓库当前未配置 CI |

这是一个仍在演进中的重建工程，不把历史验收计数当作当前结论。2026-10-25 的本地发布记录、
之后的 UI 修复与 parity 修复分别见 [`docs/release-acceptance.md`](docs/release-acceptance.md)、
[`docs/ui-repair.md`](docs/ui-repair.md) 和 [`docs/`](docs/) 下的专题记录。当前源码是否通过，
以本地重新执行完整验收后生成的 `reports/current-verification.json` 为准。

## 快速开始

### 环境要求

- **Node.js 24+**
- **Emscripten**，版本由 [`.emscripten-version`](.emscripten-version) 固定（当前为 6.0.10）
- 原生引擎构建/测试还需要 **CMake**（需支持 `--fresh`，即 3.24+）与 **C++20** 编译器
- 运行浏览器测试还需要 Chromium，版本由 [`.chromium-version`](.chromium-version) 固定；
  非验收用途也可使用 Playwright 自带的 Chromium

详细环境、版本矩阵与验收流程见 [`docs/environment.md`](docs/environment.md)。

### 构建并运行交付树

```bash
npm ci
npm run build:dist-next     # emcc 编译 C++ 引擎 + tsc 编译客户端 + 打包 dist-next
npm run verify:dist-next    # 校验交付清单、源码身份与编译产物是否最新
node serve.mjs              # 默认运行 dist-next，并自动打开浏览器
```

默认地址是 <http://127.0.0.1:8477/>。如果端口被占用，`serve.mjs` 会自动顺延。

`dist-next/` 是生成目录，不随仓库提交；新克隆必须先构建。若本地已有通过校验的
`dist-next/`，可以跳过前两步直接运行 `node serve.mjs`。

### 操作

1. 在首页输入昵称（可选），按 **Enter** 进入花园。
2. 鼠标指向决定移动方向；**左键 / 空格**攻击，**右键 / Shift**防御。
3. **WASD / 方向键**也可移动。
4. **I / Tab** 打开背包；**1–8** 选择快捷栏；**Q / E** 选择储备槽；
   **T** 丢弃；**Esc** 关闭背包或菜单。
5. 触屏设备使用屏幕虚拟摇杆移动；其余操作通过界面按钮完成。
6. 死亡后按 **Enter** 回到首页，再按 **Enter** 开始新一局。

### 常用启动参数

```bash
node serve.mjs --port 9000      # 换端口
node serve.mjs --no-open        # 不自动打开浏览器
node serve.mjs --host 0.0.0.0   # 允许局域网访问（会把该端口开放到网络）
node serve.mjs --reference      # 回滚到冻结的原版 oracle 树 web/
node serve.mjs --root dist      # 运行历史参考树 dist/
```

> **必须通过 HTTP 访问。** 直接双击 `index.html` 用 `file://` 打开时，
> 浏览器会拒绝加载 Web Worker 和 wasm。

## 运行原理

新交付树不经过任何 socket：

```
浏览器
  main.js (TypeScript/Canvas2D)
      │  postMessage { funcName, callbackId, data }
      ▼
  server-worker.js
      │  WebAssembly.instantiate(server.wasm)
      ▼
  C++20 engine (sp_server_init / send / think / flush)
      │  快照、事件、聊天包
      ▼
  客户端解码 → 插值 → Canvas2D 渲染
```

- `server-worker.js` 以 50 ms（20 Hz）固定步长驱动 `sp_server_think`，与原始
  `sp_server.js` 的消息封装保持一致；`?manual=1` 可关闭内部定时器，由 parity
  驱动在虚拟时钟上推进。
- 客户端发送的输入包沿用原始 opcode 语义（移动/按钮、restart、discard、swap、
  spawn 等），服务端输出沿用原始快照域与事件 framing，并带有已签字的 field 26
  领域扩展。
- 渲染走 Canvas2D 命令层，而不是 WebGL 场景渲染。这既贴近原客户端的绘制模型，
  也让 Canvas 命令 trace 可以直接参与 parity 对比。

原版 `web/` 的单机路径则相反：原 `client.js` 检测到 localhost 后启动
`sp_server.js` Worker。本仓库保留该树作为 oracle 与回滚入口。

## 架构

### [`engine/`](engine/README.md) —— C++20 服务端与共享规则

```
include/engine/core/      f32 / Vec2 / RNG / 固定步长时钟 / 字节读取
include/engine/model/     Entity / EntityHandle / EntityPool / World / Catalog
include/engine/net/       输入解码、快照写入、WorkerApi
include/engine/sim/       tick、移动、生成、空间查询、碰撞、战斗、伤害、掉落、花瓣、AI、效果
include/engine/schema/    生成的布局访问器（不要手改）
include/engine/catalog/   生成的目录类型与数据（不要手改）
src/                      实现
tests/unit/               native 单元测试
```

引擎通过 [`engine/include/engine/abi.h`](engine/include/engine/abi.h) 暴露 C ABI：
`sp_server_init`、`sp_server_send`、`sp_server_think`、`sp_server_flush`，以及
`sp_server_output_*` 等 Worker shim 所需的诊断/取包接口。编译选项包含
`-Wall -Wextra -Werror -ffp-contract=off -fno-fast-math -fno-exceptions -fno-rtti`，
以保证数值行为稳定。

### [`client/`](client/README.md) —— TypeScript + Canvas2D 客户端

```
src/net/        Worker 客户端、输入编码、线上类型
src/state/      快照解码、世界表、实体插值、相机、死亡生命周期
src/input/      指针、键盘、菜单、触控摇杆
src/render/     Canvas2D 封装、世界/实体/花瓣/掉落、HUD、菜单、tooltip
src/audio/      静音音频边界（尚未重建原版音频）
src/schema/     生成的协议类型与目录（不要手改）
```

`client/public/index.html`、`client/public/server-worker.js` 和
`client/public/fonts/` 是手写源码；其余 `client/public/**/*.js`、`*.d.ts`、
`*.map`、`server.wasm` 由构建生成。

### [`schema/`](schema/README.md) —— 协议、布局与目录

- [`schema/protocol.yaml`](schema/protocol.yaml)：Worker envelope、输入命令、
  输出包、快照/事件 framing、63 个 sparse 字段、19 个 dense 组。
- [`schema/layout/*.yaml`](schema/layout/)：World、EntitySlot、EntityDefinition、
  PetalDefinition、ComponentPool、QuadTreeNode、输出队列全局地址。
- [`schema/catalogs/*.json`](schema/catalogs/)：39 个花瓣、23 个实体定义、
  20 条生成规则、39 行花瓣战斗数据、最终掉落概率等。
- `schema/generated/`：机器可读的合约与原始 WASM 探针结果。

领域代码中不写魔法地址或字节偏移；C++ 与 TypeScript 都消费生成的访问器。
每个字段带有 `confidence`（`high` / `medium` / `low`），低置信度布局不会被
伪装成已还原事实。

## 仓库结构

```
.
├── engine/              C++20 服务端、共享规则、native 测试
├── client/              TypeScript 客户端、Worker shim、前端测试
├── schema/              协议、布局、目录与生成合约
├── tools/               构建、打包、校验、parity、探针
├── docs/                环境、协议、语义、parity、ADR 与历史记录
├── source/              还原 JS、完整 WAT、反编译视图与参考构建材料
├── legacy/              归档的原始 oracle 树（web/、upstream/、source/、reports/）
├── reference/           冻结清单、哈希与 frozen-trees 传输包
├── test/                JavaScript 函数级 oracle 测试
├── tests/parity/        parity 场景、golden 与录制产物
├── dist-next/           生成的纯 C++/TS 交付树（gitignored）
├── serve.mjs            零依赖静态服务器
└── package.json         构建与验收脚本
```

根目录的 `web`、`upstream`、`reports`、`source/javascript`、`source/wasm`、
`source/game` 是指向 `legacy/` 的兼容 symlink。新代码不应写入这些路径。

以下路径由本地构建或验收生成，不随仓库提交：

| 路径 | 生成方式 |
| --- | --- |
| `dist-next/` | `npm run build:dist-next` |
| `client/public/` 下除 `server-worker.js` 外的 `*.js`、`*.d.ts`、`*.js.map` 与 `server.wasm` | `npm run build:client` / `npm run build:engine:wasm` |
| `dist/`、`dist-reference/` | 由 `npm run build` / `npm run build:reference` 重建，或用 `node tools/prepare-reference.mjs` 还原冻结版本 |
| `dist-readable/` | `node tools/prepare-reference.mjs` 还原冻结树 |
| `build/`、`engine/build-*` | CMake 构建（`npm run build:engine` 等） |
| `tests/parity/` 下的录制、截图与 `report.json` | parity 运行写入；新客户端自洽基线用 `npm run parity:client:update` |
| `reports/`（`legacy/reports/`） | `npm run test:all` 或各 gate 写入 |

## 构建、测试与验收

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run build:engine` | CMake Release 构建 native 引擎 |
| `npm run test:engine` | 重建引擎 + engine TAP + 全部 CTest 目标 |
| `npm run build:engine:wasm` | `emcc` 将 C++ core 编译为 `client/public/server.wasm` |
| `npm run build:client` | `tsc` 编译 TypeScript 到 `client/public` |
| `npm run test:client` | TypeScript 编译 + 客户端测试（部分用例启动 Chromium） |
| `npm run test:reference` | 校验 `reference/manifest.json` 与冻结树/基线 |
| `npm run test:javascript:tap` | 运行 JavaScript 函数级 oracle 测试 |
| `npm run test:delivery` | 针对 `dist-next` 的 Worker/menu 交付测试 |
| `npm run test:light` | 引擎、wasm、客户端、参考、JS、掉落与客户端 parity 的快速组合 |
| `npm run build:dist-next` | 编译并打包 `dist-next`，写入 `build-manifest.json` |
| `npm run verify:dist-next` | 校验交付完整性、源码身份、编译器身份与清单哈希 |
| `npm run test:parity` | 原版 8 场景的确定性重放 + server trace |
| `npm run parity:engine-state:strict` | 原 server 与 C++ engine 的逐实体状态门禁 |
| `npm run parity:original-engine:all` | 原客户端 + C++ engine 的协议/交互门禁 |
| `npm run parity:client` | 新 TypeScript 客户端的 8 场景自洽基线 |
| `npm run parity:production` | 8 场景 × desktop/retina/touch 的 24 个生产交互录制 |
| `npm run test:all` | 一次串行完整验收（构建、native、oracle、视觉、交付、生产、性能、账本） |
| `npm run test:all:twice` | 连续两次完整验收，源码冻结后的最终入口 |
| `npm run status:write` | 校验 run 绑定证据并生成当前账本 |

### 开发约束

1. 领域实现只改 `engine/src`、`client/src`、`schema/` 和 `tools/`；`legacy/`、
   `source/wasm`、`source/javascript` 与 golden 输入保持只读。
2. 修改 `schema/*.yaml` 后重新执行 `npm run schema:generate` 与
   `npm run schema:probe`，并让 `npm run test:engine` 的 schema CTest 通过。
3. 新领域行为先写 `docs/semantics/` 规格，再补 native/客户端测试与 parity 场景；
   不要在没有 trace 的情况下重写大模块。
4. 源码冻结后以 `npm run test:all:twice` 的绑定账本作为验收结论，单条 gate
   只作诊断。

### 完整验收

`npm run test:all` 不是简单地把若干测试相加，而是一次带身份绑定的验收运行：

1. 从当前源码重新构建 native 引擎、wasm 和客户端；
2. 打包 `dist-next`，记录源码、编译器、oracle 与交付树哈希；
3. 串行执行 native / CTest、JavaScript、客户端、交付、浏览器矩阵、
   原版 parity、engine state、Hornet、视觉/Canvas、生产交互、性能等门禁；
4. 写入 `reports/runs/<run-id>/run.json`、TAP 快照和 gate 产物；
5. 由 `tools/write-current-verification.mjs --strict` 生成受绑定账本。

源码冻结后应执行：

```bash
npm run test:all:twice
npm run verify:dist-next
node tools/write-current-verification.mjs --strict
```

单条 gate 或旧报告不能替代完整验收。运行期间有 `reports/verification.lock`，
并发验收会被拒绝；源码或交付树在运行中变化会导致该轮失败。`reports/` 是指向
`legacy/reports/` 的兼容链接，其中的运行产物被 gitignore，干净 checkout 不会
附带任何历史证据。

同样，`tests/parity/golden`、`tests/parity/server` 等原版基线与录制也被 gitignore。
干净 checkout 需要从历史工作副本或备份恢复这些资产；`parity:client:update` 只刷新
新客户端自洽基线，原版 golden 的更新必须单独评审并记录理由，不能用重录掩盖回归。

## Parity 与证据边界

原版等价性由三层证据组成：

- **渲染**：8 个基准场景 `boot-menu`、`garden-idle`、`move`、`attack`、
  `equip`、`damage`、`death`、`spawn`，每个场景捕获 Canvas2D 命令 trace、
  帧 digest 与截图。
- **服务端**：同一份输入分别喂给原 `sp_server.wasm` 与 C++ engine，逐 tick
  比较包序列或逐实体状态。
- **交互**：真实 Worker、真实键鼠/触控输入下的桌面、retina、触控 24 个录制，
  以及原客户端 + C++ engine 的完整生命周期。

浏览器重放固定 `1280×720`、DPR 1、`en-US`、`UTC`、虚拟时钟与固定 UA。
像素门禁为变化像素比例 ≤ 0.1%、单通道最大差 ≤ 8；Canvas 命令对比容差为
`1e-4`。阈值和 golden 输入是冻结基准，不能为了让某一轮变绿而放宽或重录。

`parity` 的详细机制、场景定义、历史基线和已知限制见 [`docs/parity.md`](docs/parity.md)。

## 交付树与回滚

`dist-next/` 是唯一默认交付：

- 入口：`index.html`
- 客户端：`main.js` 及其模块
- Worker：`server-worker.js`
- 引擎：`server.wasm`
- 清单：`build-manifest.json`（源码身份、编译器身份、每个产物的 SHA-256）

打包脚本会拒绝把 `source/`、`test/`、`reports/`、`web/`、`upstream/`
等 oracle 资产混入交付树；`verify:dist-next` 会拒绝过期源码身份、缺失/多余文件
和与编译输出不一致的产物。

回滚到冻结的原版树：

```bash
node serve.mjs --reference
```

也可以运行历史参考树：

```bash
node tools/prepare-reference.mjs   # 从 reference/frozen-trees.tar.gz 还原 dist* 冻结树
node serve.mjs --root dist         # 运行还原出的冻结参考树
```

若要从 `source/` 重新构建可读参考版，则执行 `npm run build` 后运行
`node serve.mjs --root dist`。`--reference` 选择 `web/`（本地可玩的原版），
`--root dist` 选择参考版；两者都不是当前 `dist-next` 交付，也不替代新实现的验收。

## 原始资产、参考构建与还原源码

本仓库同时保留以下几类“历史资产”，它们的定位不同：

| 路径 | 内容 | 用途 |
| --- | --- | --- |
| `legacy/upstream/` | 原始站点 1:1 快照，未做修改 | 最高事实来源 |
| `legacy/web/` | 本地可玩版：修正 hostname 判断、移除外部字体/Cloudflare 依赖等少量改动 | 原版 oracle、回滚入口 |
| `source/` | 可读 JS、完整 WAT、反编译视图、人工还原的高层模块 | 参考构建与函数级差分 |
| `dist/`、`dist-reference/`、`dist-readable/` | 冻结的历史参考树；可由 `source/` 重建 | 历史参考，不是当前交付 |

`reference/manifest.json` 记录冻结的 WASM、WAT、目录树哈希与函数基线；
`source/` 的参考构建可将两个 WASM 重建为与原文件字节一致的版本，并把部分
函数接入高层 JS 实现。函数级基线（3,850 个已恢复为高层 JS / 1,129 个仍为
机器码）是历史参考的数据，不代表当前 C++/TS 重建的完成度。

`test:reference` 需要本地 `reports/build.json`；参考构建还需要
`reports/wasm/` 等历史基线。这些报告被 gitignore，干净 checkout 需要先从
历史工作副本或备份恢复。

**不要为了让测试通过而修改 `legacy/`、`source/wasm/`、`source/javascript/`
或 golden 输入。** 如果确实需要更新冻结参考，使用：

```bash
npm run reference:refreeze -- --reason "why the oracle changed"
npm run test:reference
```

并在 [`reference/CHANGELOG.md`](reference/CHANGELOG.md) 中保留变更理由。
`reference:refreeze` 只覆盖冻结参考文件与目录树，不包含 parity golden；
golden 的更新需要单独评审。

## 已知限制

- **没有多人联机。** 原始匹配服务已下线，本地版只有玩家和地图中的怪物。
- **Chromium-only。** 支持范围为 Chromium 桌面与 390×844/DPR3 触控模拟；
  Firefox / WebKit / 物理设备不在当前验收矩阵内。
- **音频尚未重建。** 当前 `src/audio/` 是静音边界，原版音效未接入。
- **不是所有原版语义都已还原。** 低置信度的空间布局、部分协议字段和
  边缘生命周期仍标注为假设；详见 [`docs/schema-coverage.md`](docs/schema-coverage.md)。
- **协议不是逐字节复刻。** field 26 是已签字的永久领域扩展，C++ 快照输出
  与原版在 framing/字段域上存在明确差异；对原版的比较依赖领域层与行为层门禁。
- **视觉等价有范围。** 像素/Canvas 门禁覆盖约定的 8 个场景和固定浏览器矩阵，
  不外推为所有物种、所有时长、所有 GPU/字体组合的等价证明。
- **构建与验收产物不提交。** `dist-next/`、`client/public` 下的编译产物、
  `build/` 需要本地重新构建；`reports/` 由验收运行写入。
- **仓库未配置 CI。** 验收在当前机器上执行；远端 Linux CI 的历史结果不能由
  仓库内容推定。

## 排错

- **卡在 Loading**：确认地址栏是 `http://` 而不是 `file://`；在 DevTools 的
  Network/Console 中检查 `server-worker.js` 与 `server.wasm` 是否 404、MIME 是否错误。
- **端口被占用**：`serve.mjs` 会打印“端口 8477 被占用，尝试 8478 ...”，以终端
  输出的实际地址为准。
- **键盘不响应**：先用鼠标点一下 canvas 或先按 Enter 进入游戏；名字输入框会
  优先接收文本输入。
- **画面黑屏或异常**：查看 Console 中的 worker/wasm 加载错误与 JS 异常；
  `dist-next` 使用 Canvas2D，不依赖 WebGL，通常是资源加载或运行时错误。
- **构建报 `emcc` 缺失或版本不符**：安装 [`.emscripten-version`](.emscripten-version)
  指定的 Emscripten，并确认 `emcc --version` 匹配；`build:engine:wasm` 会拒绝
  其他版本。
- **`test:reference` 报 `reports/build.json` 缺失**：该文件属于本地历史基线，
  需要从历史工作副本或备份恢复 `reports/`。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`goal.md`](goal.md) | 重建总目标、阶段门禁、非目标与历史路线 |
| [`docs/environment.md`](docs/environment.md) | 工具链、浏览器矩阵、验收流程、归档/恢复 |
| [`docs/parity.md`](docs/parity.md) | 确定性重放、8 场景、Canvas/server trace、阈值 |
| [`docs/protocol.md`](docs/protocol.md) | Worker envelope、输入/输出包、快照 framing |
| [`docs/schema.md`](docs/schema.md) | 生成的布局、偏移与置信度 |
| [`docs/catalogs.md`](docs/catalogs.md) | 花瓣、实体、生成规则、战斗与掉落数据 |
| [`docs/semantics/`](docs/semantics/README.md) | 按领域拆分的语义规格与证据 |
| [`docs/legacy.md`](docs/legacy.md) | oracle 归档策略与只读约束 |
| [`docs/release.md`](docs/release.md) | 双构建、冻结规则、回滚与切换 |
| [`docs/release-acceptance.md`](docs/release-acceptance.md) | 2026-10-25 历史本地验收记录 |
| [`audit.gpt61sol.md`](audit.gpt61sol.md) | 2026-10-24 审计快照与整改背景 |
| [`docs/ui-repair.md`](docs/ui-repair.md) | 首页/花瓣/背包/死亡交互修复记录 |
| [`docs/browser-matrix.md`](docs/browser-matrix.md) | Chromium 桌面/触控矩阵与门禁定义 |
| [`docs/adr/`](docs/adr/README.md) | 架构决策记录 |
| [`engine/README.md`](engine/README.md) | C++ 引擎布局、C ABI、实现说明 |
| [`client/README.md`](client/README.md) | 客户端布局、Worker shim、当前实现状态 |
| [`schema/README.md`](schema/README.md) | schema 组织、生成命令与置信度 |
| [`source/README.md`](source/README.md) | 还原源码、WAT、参考构建与阅读顺序 |
| [`reference/README.md`](reference/README.md) | 冻结清单、哈希与参考构建命令 |

部分文档页首保留了 2026-10-25 的验收快照；其中的计数、run ID 和残差只对当时
的源码身份有效，不应作为当前代码的通过证明。

## 来源与授权

- Legacy 原始资源来自官方静态快照 <https://static.florr.io/old/>；抓取工具见
  [`tools/fetch-upstream.sh`](tools/fetch-upstream.sh)。
- `legacy/upstream/`、`legacy/web/` 与 `source/` 中的原站代码、图像、文案版权
  归原权利人所有，仅作为兼容性研究、存档与行为对照使用。
- `web/fonts/` 与 `source/assets/fonts/` 中的 Ubuntu 字体按 Ubuntu Font License
  分发。
- 本仓库当前未附统一的开源许可证文件；再分发或商用前请自行确认各部分的授权。
