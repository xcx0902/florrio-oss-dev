# 2026-10-24 审计整改记录

本页对应只读历史报告 `audit.gpt61sol.md` 的 F01–F13。历史审计、原版
golden、原始输入和验收容差保持不变。实现修复、隔离诊断、原版等价及完整
发布验收分别记录；单个绿色报告不代表整个发布完成。

## 当前验收状态（2026-10-25）

三轮完整验收、真实归档和恢复演练已完成。JavaScript 937/937、engine TAP 110/110、client 195/195、delivery 47/47、browser 47/47；CTest 5 个目标（core/sim/peer及schema合约检查）全通过。

稳定源两轮：`2026-10-25T11-02-46.594Z-3d1d3f7c`、`2026-10-25T11-32-28.445Z-0ad06452`；归档后：`2026-10-25T11-56-33.590Z-d7d59eb3`。完整结果见 [发布记录](release-acceptance.md) 与 [`release-acceptance.json`](../reports/release-acceptance.json)。F01–F13 的本地实现和门禁修复已覆盖；F05 要求的远端干净 Linux CI 实跑仍缺外部环境证据，不能称为全部外部验收完成。

`2026-10-25T07-47-17.825Z-9eae9aaa` 不计入通过次数：原版 equip
重放的过渡帧 digest 曾不一致，交付 smoke 在 47 项断言完成后没有退出，
因此该轮被中止。其失败/中止记录保留。随后独立录制八场景各八次，共 64
个录制，全部 Canvas digest 与原 golden 一致；另有 equip 40 次独立录制一致。
临时副本的交付 smoke 47 项及清理阶段也正常完成。这些复查不替代两轮完整验收。

`2026-10-25T08-09-00.899Z-4b7e2d56` 也不计入通过次数：生产装备
观察器误把 1000ms 残留花瓣及充能期间无实体当作背包状态；现已使用客户端
同一个 field60 权威解码 helper，且保留丢弃/交换断言。另修复账本引用旧
Hornet 用例名的问题，要求当前全部 14 项受控 fixture（含目标失效、保留目标
范围及冷却边界），没有缩小覆盖或放宽阈值。失败运行完整保留。

`2026-10-25T08-31-47.313Z-2d2b7806` 在 JavaScript 848/848、全部 native
测试集、客户端、短 strict、长 strict 及视觉/命令步骤后主动中止，不计入通过次数。
原客户端画面复查发现旧兼容 writer 没有 world/controller 元数据，导致画面停留
在菜单；旧协议门禁不足以证明 §13 的单局要求。新增门禁已实际拒绝这版输出
（`/tmp/florr-original-metadata-before/`），后续已修复原版适配、ABI队列发布与只读状态定位，并通过真实生命周期；仅最终三轮绑定结果计为发布验收。

### 旧源验收与补充代码质量检查

旧源 `56dcf143f83bbfec3cd4a69559e31fed2618bc614b88863a5db0dfa6d1121735` 的
`2026-10-25T09-12-50.270Z-a73a8ff0`、`2026-10-25T09-30-55.603Z-d753f824`
各自26步通过。两次归档演练随后遇到 Synology Drive 把兼容 symlink 变成实体目录的同步冲突；静态字节全部核对一致，失败日志、原路径副本和12条冲突链接保留。用户暂停同步后，`/tmp/florr-release-archive-final/` 的完整移动/恢复演练通过。

归档后 `2026-10-25T10-20-05.590Z-95cd6faf` 在前置回归与短 strict 通过、执行长 strict 时主动中止：补充代码质量复核发现协议表生成链缺失、布局断言未进入编译链，以及发布演练汇总没有完整检查身份/截图/reference日志。上述是独立于旧功能回归通过的维护性缺口，不能直接批量勾选 §13.1。后续修复改变 source identity，因此旧源两轮、旧归档演练均不计为新源最终验收。历史证据保留，不冒充本轮结果。

`2026-10-25T10-52-40.295Z-2e0d65a1` 在前置构建通过、JavaScript oracle 回归期间主动中止，不计入通过次数：补充复核要求 reference 演练日志绑定阶段、执行时间、退出状态及文件身份，并校验 restore 路径观察时间。补齐后再次冻结源码，重新运行本页最终三轮。

`2026-10-25T10-59-30.226Z-a39018b2` 暴露 dense -27 WorkerApi 回归仍按八字段结束的旧断言，以及前一轮中止遗留的独占 writer 锁；保留失败记录后中止。已将44/51作为非零多字节varint加入实际读回断言，通过全部110项native与5项CTest；确认无writer后保存并移走旧锁，清理该轮孤儿进程组。此轮不计入最终通过数。

## 整改映射

| 审计项 | 实现修复与验证入口 | 证据边界 |
| --- | --- | --- |
| F01 客户端文本缓存断言 | `client/tests/render-golden.test.mjs`、`hud-golden.test.mjs`、`menu-golden.test.mjs` 验证离屏文字、最终绘制与死亡/重生文案 | 保留菜单和游戏语义覆盖；不是删除旧断言后仅刷新基线 |
| F02 TAP 假绿 | `tools/verification/tap.mjs`、`run-tap.mjs`、`write-current-verification.mjs`：独占 writer、完整顶层 TAP、退出状态、不可混用的运行快照 | 重复/损坏汇总、`not ok`、不完整、陈旧及混合证据均须失败 |
| F03 交付树过期 | `build-dist-next.mjs` 默认先编译 C++/TS；校验 compiler input 与完整文件身份；每轮在实际 `dist-next` 上 smoke、生产录制及性能复验 | 内部 manifest 自洽不能替代源码/编译输入身份一致 |
| F04 游戏视觉残差 | 按原版 f32 状态、插值时钟、arena 历史、实体动画、缓存及 HUD 绘制顺序修复 | 八场景同时满足 ratio ≤0.001 和 max ≤8；不放宽阈值 |
| F05 干净 CI 配置 | `.github/workflows/ci.yml`：Ubuntu 24.04、`npm ci`、Emscripten pin、Chrome for Testing 精确 pin、reference 准备、tooling、两轮全验和交付复核 | 本目录没有 `.git` 或 remote；配置修复不代表远端 Linux CI 已运行 |
| F06 Hornet 原版对照 | `hornet-stinger-trace.mjs`：原 WASM 受控 callback、攻击范围/目标/冷却、命中、寿命与销毁 fixture；另跑八场景 strict 1000-tick soak | native fixture 或一次未触发 stinger 的长跑不能代签 |
| F07 strict 漏检 | `entity-state-diff.mjs` 精确比较 identity/type/kind；所有被比较数值先检查有限性；`verification-gates.test.mjs` 负例 | 每 tick 检查，NaN/Infinity 和类型替换必须失败 |
| F08 生产路径覆盖 | `run-production-scenario.mjs` 在实际交付树录制八场景 × desktop/retina/touch；真实 Worker、可信输入、解码事件和相机 | 24 个录制是生产集成；隔离渲染、协议与原版等价仍分别受门禁约束 |
| F09 固定场景样本 | 菜单时间/熵驱动；程序化物种几何及动画；HUD 从真实经验/等级/背包状态导出；`entity-art.test.mjs` 直接对照不改指令的原 WASM，覆盖新 handle/时间/半径/变换 | 不用扩大已录 handle 的样本表代替通用规则；23 项目录含 None |
| F10 命令诊断不足 | `canvas-command-diff.mjs` 严格比较八场景全部三帧的 opcode、顺序、状态 setter、参数及资源/Path2D；容差 1e-4 | 任意帧的不同必须阻断；opcode 前缀/直方图仍只能诊断 |
| F11 copy→move 不实 | `archive-legacy.mjs` 验证已有副本、实际移动、兼容链接、事务日志和回滚；为 Node ESM realpath 保留 runtime/semantic 依赖桥 | 必须先满足真实当前验收保护；实际移动/恢复和归档后全验仍须另外记录 |
| F12 跨轮报告拼接 | 每轮 source/client/oracle/delivery 哈希、时间区间、TAP meta、JSON 快照及 SHA；性能重新测量实际交付的 600 帧 | 账本从绑定证据导出，临时诊断/自洽/旧性能不能关闭当前任务 |
| F13 HTTP method | `serve.mjs` 校验原始 method；`tools-engineering.test.mjs` 验证 GET/HEAD 与 POST/PUT 405 | 本地静态服务行为回归 |

## 不变的验收范围

- 原版菜单与七个游戏场景；每场景三帧完整 Canvas 命令，浮点容差 1e-4。
- 原版截图变化像素比例 ≤0.001，任一通道最大差 ≤8。
- 八场景逐 tick strict 状态检查和每场景至少 1000 tick 长跑。
- 原客户端与新引擎集成必须实际找到 client WASM state probe。
- Chromium 桌面、Retina 和移动 UA 触控模拟；Firefox/WebKit/真机及音频 v1 为非目标。
- field 26 永久域扩展的既有决定不重新打开。
- 只有完整验收通过后才实际 `--move`；必须演练 `--restore`，再最终移动并全量复验。

最终可复核入口为 `reports/current-verification.json`、对应
`reports/runs/<runId>/` 的不可混用快照，以及归档完成后新增的发布收口记录。
