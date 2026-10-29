# Legacy Florr.io — C++20 + TypeScript 重建

以 2020–2022 年的 Legacy Florr.io 为行为基线，用 **C++20 → WebAssembly** 重建服务端与共享规则，
用 **TypeScript + Canvas2D** 重建 Web 客户端。游戏完全在浏览器本地运行：Web Worker 启动引擎 wasm，
客户端通过固定 50 ms tick 收发快照。

原始客户端的逆向材料——WAT、还原 JS、逐函数语义表、parity 录制和冻结构建——已移入
[`archive/`](archive/README.md)，只供人工查阅。产品构建、测试、运行时和交付树不再读取它们。

## 当前状态

| 项目 | 状态 |
| --- | --- |
| 运行方式 | 纯静态 Web、单机；无匹配服务、无外部运行时依赖 |
| 服务端 | C++20 → WebAssembly，运行在 Web Worker |
| 客户端 | TypeScript + Canvas2D |
| 协议/布局/目录 | [`schema/`](schema/README.md) 为单一事实来源 |
| 交付 | `dist-next/`，由源码重新构建并校验 |
| 浏览器 | Chromium 桌面 + 模拟触控；Firefox / WebKit / 真机非目标 |
| CI | 本仓库未配置远端 CI；验收以本地 `npm run test:all` 为准 |

历史逆向与 parity 结论不构成当前通过证明。当前源码是否通过，重新执行完整验收后生成的
`reports/current-verification.json` 是唯一依据。

## 快速开始

### 环境

- Node.js 24+
- CMake 3.24+ 与支持 C++20 的编译器（原生引擎测试）
- Emscripten，版本由 [`.emscripten-version`](.emscripten-version) 固定
- Chromium，版本由 [`.chromium-version`](.chromium-version) 固定（浏览器验收）

详见 [`docs/environment.md`](docs/environment.md)。

### 构建并运行

```bash
npm ci
npm run build:dist-next     # emcc + tsc + 打包 dist-next
npm run verify:dist-next    # 校验交付清单、源码身份与产物
node serve.mjs              # 默认服务 dist-next，并打开浏览器
```

默认地址 <http://127.0.0.1:8477/>；端口被占用时自动顺延。

`dist-next/` 不提交。新克隆必须先构建；本地已有通过校验的交付树时可直接启动。

### 操作

1. 首页输入昵称（可选），按 **Enter** 进入花园。
2. 鼠标指向决定移动方向；**左键 / 空格**攻击，**右键 / Shift** 防御。
3. **WASD / 方向键**也可移动。
4. **I / Tab** 打开背包；**1–8** 选择快捷栏；**Q / E** 选择储备槽；
   **T** 丢弃；**Esc** 关闭背包或菜单。
5. 触屏设备使用屏幕虚拟摇杆；其余操作通过界面按钮完成。
6. 死亡后按 **Enter** 回首页，再按 **Enter** 开始新一局。

### 启动参数

```bash
node serve.mjs --port 9000      # 换端口
node serve.mjs --no-open        # 不自动打开浏览器
node serve.mjs --host 0.0.0.0   # 允许局域网访问（会开放该端口）
node serve.mjs --root dist-next # 指定其他构建输出目录
```

> 必须通过 HTTP 访问。`file://` 打开 `index.html` 时浏览器会拒绝加载 Worker 和 wasm。

## 架构

### `engine/` — C++20 服务端

按领域组织，不逐函数翻译原版。固定 50 ms tick，f32 位置/角度，确定性 RNG，
稀疏快照写入由 `schema/protocol.yaml` 驱动。

C ABI：

| 导出 | 作用 |
| --- | --- |
| `sp_server_init` | 重置世界，初始化实体池 |
| `sp_server_send(ptr, len)` | 解码一个输入包 |
| `sp_server_think` | 推进一个固定 tick |
| `sp_server_flush` | 取走输出包 |
| `sp_server_output_count/data/size` | Worker shim 读取输出队列 |
| `sp_server_entity_count` | 诊断用实体数 |

细节见 [`engine/README.md`](engine/README.md)。

### `client/` — TypeScript + Canvas2D

`client/public/index.html` 是入口；`client/public/server-worker.js` 加载
`server.wasm` 并转发 `init/send/think/flush`。客户端解码稀疏快照，合并到
`WorldState`，再驱动插值、相机、世界与 HUD 渲染。

```
src/net/        Worker 客户端与线格式
src/state/      快照解码、实体表、插值
src/input/      指针、键盘、触控摇杆
src/render/     Canvas2D 封装、精灵、世界、HUD、菜单
src/schema/     生成的协议/目录类型（勿手改）
```

细节见 [`client/README.md`](client/README.md)。

### `schema/` — 协议、布局与目录

`schema/protocol.yaml`、`schema/layout/*.yaml` 和 `schema/catalogs/*.json`
生成 C++/TS 访问器与文档。修改 schema 后运行 `npm run schema:generate`。
原始布局探针和证据表已归档，不再是生成输入。

## 仓库结构

```
engine/       C++20 引擎、C ABI、原生测试
client/       TypeScript 客户端、入口页、Worker shim、字体与图标
schema/       协议、布局、目录及生成器
tools/        产品构建、打包、校验与验收工具
tests/        产品级 Node 测试与工具测试
docs/         环境、协议、发布、schema、目录说明
reports/      本地验收输出（gitignored）
archive/      历史逆向材料（只读，非构建输入）
serve.mjs     静态服务器
```

## 构建、测试与验收

```bash
npm run build:engine        # 原生 Release 构建
npm run test:engine         # 构建 + ctest
npm run build:engine:wasm   # emcc -> client/public/server.wasm
npm run build:client        # tsc -> client/public
npm run test:unit           # 协议/线格式单元测试
npm run test:tools          # 构建/校验工具测试
npm run test:client         # 保留的产品客户端测试
npm run build:dist-next     # 完整交付树
npm run verify:dist-next    # 交付完整性
npm run test:all            # 全流程验收，写 reports/current-verification.json
```

`test:all` 依次执行引擎/客户端构建、单元与工具测试、CTest、客户端测试、打包、
交付身份与完整性校验、入口冒烟和浏览器矩阵。任何一步失败都不会写出通过报告。

开发约束：

- 领域规则只依赖 `engine/` 内的模型与 `schema/` 生成物。
- 不把原始函数的编号、地址或 WAT 片段写进产品源码；需要追溯时引用
  [`archive/`](archive/README.md) 中的证据表。
- 不新增 `skip`/`todo` 来绕过失败；验收步骤必须真实执行。

## 交付树

`dist-next/` 是独立目录：`index.html`、`server-worker.js`、`server.wasm`、客户端
JS/CSS、字体与图标。`tools/verify-dist-next.mjs` 校验清单、哈希和源码身份；
`tools/smoke-entrypoints.mjs` 用真实 Worker、键盘和鼠标启动它。

`dist/`、`dist-readable/`、`dist-reference/` 是历史产物，已移入归档，不再由本仓库构建。

## 来源与授权

- Legacy 原始资源来自官方静态快照 <https://static.florr.io/old/>。
- 归档中的原站代码、图像、文案版权归原权利人所有，仅作为兼容性研究与存档使用。
- `client/public/fonts/` 中的 Ubuntu 字体按 Ubuntu Font License 分发。
- 本仓库未附统一开源许可证；再分发或商用前请自行确认各部分授权。

历史材料索引见 [`archive/README.md`](archive/README.md)，文档索引见 [`docs/`](docs/)。
