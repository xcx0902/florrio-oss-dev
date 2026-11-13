# 原版 UI 实测样本

这 17 组 PNG/Canvas trace 由摘要固定的 2022-10-30 原 Wasm 在 Chromium 156.0.8078.47、en-US、归档 Ubuntu 700 下产生。名字、等级、发现位、装备和波次是本机测试夹具。截图与 trace 是相邻采样帧；没有冻结随机流、动画、光标和 RAF，**不能直接用于逐像素回归的金样**。采样条件、CSS/backing 尺寸、DPR 和逐文件 SHA-256 在 [manifest.json](manifest.json)。

| 样本                                   | 内容                             | 宿主与条件                                                         |
| -------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| [html-loading](html-loading.png)       | 原始 HTML 的 Loading             | 归档 HTML/JS/字体；人为阻止 JS 载入。                              |
| [menu](menu.png)                       | 新访客、鼠标教学、菜单按钮       | 归档 HTML/JS；本机 profile/wire，1024×768@1。                      |
| [squad](squad.png)                     | 私队、自己与队友、装备、房码输入 | 与 menu 同组、两客户端真实邀请；房码是本机生成值。                 |
| [mobile-portrait](mobile-portrait.png) | 手机的裁切和重叠                 | 归档宿主，iPhone UA、390×844@2、触屏。                             |
| [inventory](inventory.png)             | 两行库存和主副槽                 | 原字节 Wasm、本地 shell、level 2 种子档，1024×768@1。              |
| [crafting](crafting.png)               | 选择五份材料并按 Shift           | 同上；界面为 Craft all。                                           |
| [crafting-result](crafting-result.png) | 制作成功的升级卡                 | 同上；夹具固定 craft roll，不能推断历史概率。                      |
| [gallery-tooltip](gallery-tooltip.png) | Centipede/Rare 属性与掉落卡      | 同上、稀疏发现位；悬停后取帧。                                     |
| [gallery-dense](gallery-dense.png)     | 六稀有度和滚动区                 | 临时存档写入 1..35 × 0..5 发现位，正常协议投影。                   |
| [match-hud](match-hud.png)             | 波次清场条、目录、小队、装备     | 原字节 Wasm、本地 shell、Garden、五个 Rose、两类怪物，1024×768@1。 |
| [death](death.png)                     | 首次死亡提示                     | 同上；经实际伤害和事件触发。                                       |
| [game-over](game-over.png)             | GAME OVER / Continue             | 同上；结算稳定态，队伍行仍在。                                     |
| [mobile-controls](mobile-controls.png) | A/B 与动态摇杆起点               | 原字节 Wasm、本地 shell、iPhone UA、844×390@2，实际触控。          |
| [settings](settings.png)               | 桌面设置七行与辅助按钮           | 原字节 Wasm、本地 shell、空存储，1024×768@1。                      |
| [mobile-settings](mobile-settings.png) | 手机设置默认七行                 | Android UA、844×390@2、空存储；Minimal/zoom/shake 开、fixed 关。   |
| [changelog](changelog.png)             | 原更新记录面板                   | 同上；顶部。                                                       |
| [credits](credits.png)                 | 原 Credits 三段文案              | 同上；经设置里的 Credits 按钮进入。                                |

**本地宿主附加物。** 标为 local shell 的截图左上有 Garden 场景下拉，它由 `wave/web/local.js` 注入。它的尺寸/位置与 UI 倍率无关，手机截图中尤其明显。对应复采拦截了 `local.js` 的 `adaptWaveClient(...)` 调用，WebAssembly 实例使用原字节，仅保留同源、协议与 DOM 适配；归档 HTML 四组没有该选择框。不要将下拉框复刻进原版，也不要用它所在区域推导下层图案。

每个 PNG 同名的 JSON 保存采样帧操作。大厅 trace 为带 `trace` 的对象（含 Path2D 与画布来源）；背包/制作/图鉴 trace 为指令对象数组；HUD trace 为指令 tuple 数组；设置/日志/Credits trace 为含 `out` 的帧对象。不同插桩格式不能直接逐行互比。所有样本保留未裁剪截图，未合成或重画界面。图案路径、数值和可见性仍应结合各功能规格判定；详情见 [1:1 验收](../08-parity-validation.md)。

大厅组复采用 [capture-lobby.mjs](../tools/capture-lobby.mjs)。其余组按功能章中的 fixture、存档与输入序列复采；精确差分前须完成同帧采集和时钟/随机流控制。
