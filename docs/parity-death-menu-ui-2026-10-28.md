# 死亡归因、重开文案、悬浮提示、图鉴占位与死亡转场

本轮按用户五项清单，先对照冻结原版再修改。原版 `client.wasm` 仍为
1,844,233 字节、SHA-256
`c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1`；
服务器 WASM SHA-256 为
`75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d`。
没有修改 `web/`、`legacy/`、冻结黄金数据或对照产物。

## 逐项核实与修改

### 1. `destroyed by` 显示了花朵自己的名字

原版 `source/game/server/damage.mjs` 的 `updateKillerName` 读取攻击实体
`entity+160` 的名字组件：怪物使用自己的物种名；花瓣/弹体沿 owner 链继承；如果攻击者
没有名字组件，死亡包里的名字为空，客户端才回退到 `A mysterious entity`。原版
**不会**把“攻击者自己上次被谁杀死”的 `killer_name` 当作攻击者名字。

当前 `engine/src/sim/combat.cpp` 的 `killer_name_for` 先取
`entity->killer_name`（该实体被谁杀死），再回退到本地玩家名/物种名。玩家刚打过的
瓢虫再反杀玩家时，瓢虫的 `killer_name` 正好是玩家名，于是显示成花朵自己的名字。
修复为：

- 花朵直接返回玩家名字；
- 花瓣/弹体沿 `owner` 链上行，直到花朵或怪物；
- 怪物和其余实体使用自己的定义名；
- 完全移除对 `entity->killer_name` 的复用。

回归 `test_killer_name_uses_attacker_identity` 覆盖两种原版行为：

- 瓢虫的 `killer_name` 被写成 `"hero"` 后再杀死玩家，仍报告 `"Ladybug"`；
- 空名字花朵自杀，死亡名字为空（客户端显示回退文案），不会变成 `"None"`。

浏览器复核：用 8 只 Hornet 击杀 Alice，`deathMetadata().killerName` 为
`"Hornet"`，不再显示 `"Alice"`；自杀时为 `""`，画面显示
`A mysterious entity`。

### 2. 没有幸存花瓣仍显示 `with:`

原版菜单反编译 `functions-0704-0767.dcmp` 的重开块：

```c
if (u) {
  a = l[140];                       // 幸存花瓣数
  c[1520] = l[8];                   // 重开等级
  function_480(7910480, select_if(23467, 18891, a), c + 6080);
}
...
h = l[140];
if (eqz(h)) goto ...;               // 没有幸存者就不画卡片行
```

字符串地址 23467 是 `"You will respawn at level %d with:"`，18891 是
`"You will respawn at level %d"`。只有幸存数非零才选前者。

修复 `client/src/render/menu.ts`：先过滤有效花瓣；`items.length > 0` 才追加
`" with:"`。浏览器在 0 幸存花瓣死亡后重开，显示
`You will respawn at level 1`，卡片行为空。

### 3. 花瓣 tooltip 文字不对齐、部分字体偏窄

原版 `func623` 生成固定文本行：

- 名称行字号 24；
- 稀有度行 14；
- 稀有度与描述之间插入一个未写字的初始化行（`initializeLine` 的默认字号 16）；
- 描述/属性行 14。

`func801` 把 `24`/`14` 写入 `line+148`（字号），`0.12` 写入
`line+144`（描边比例）。`func1099` 的布局为：

```c
lineWidth = measure(text) + 2*trunc(font*0.12);
width     = max(lineWidth) + b[7];
height    = sum(line.font * 1.1);
box       = roundedRect(..., width + 10, height + 10, 5);
textY    += line.font * 1.1;
```

旧实现把缓存的文字位图强行缩放到**裸测量宽度**（没有加两侧描边 margin），
因此字被横向压窄；同时使用 `font*1.4` 作为行距，漏掉了原始空白行，导致纵向错位。

修复 `client/src/render/tooltip.ts`：

- 每行宽度改为 `measure + 2*trunc(font*0.12)`，与位图自身逻辑宽度一致；
- 行距改为 `font*1.1`；
- 名称后接稀有度，再插入 `16*scale` 的空白行，再排描述行；
- 背景宽高、5 单位圆角、10 单位内边距和 15 单位视口边距按 `func1099` 恢复；
- 不再对描述做原版没有的自动换行（定义行本身是独立行）。
- 死亡界面的 tooltip 由 `func1095` 先入队、在所有卡片和 Stats 之后统一由
  `func1099` 绘制；旧实现内联绘制会被 Stats 盖住，现已改为延后绘制。

浏览器复核截图（1280×720、1440×900、1920×1080）：名称、稀有度、描述的
文字行位置一致，`Basic` 不再被压扁，稀有度到描述之间保留空白行；1440 和
1920 的面板外框与原点逐像素一致。

### 4. Mob Gallery 未发现项的 `?` 过大

原版 Mob Gallery 的锁定行使用 16 号默认字体；旧实现使用 36，
在 0.7 缩放下约 25 CSS 像素，而原版约 10 CSS 像素。

修复 `client/src/render/menu-panels.ts` 的 `drawMobGallery`：`size` 从 36 改为 16。
浏览器对照（同 1280×720、同一行高）：

- 原版锁定行 `?` 高约 10 px；
- 修复后同尺寸、同一行中心；
- 修复前约 25 px。

### 5. 死亡转场时装备栏、等级条瞬间消失

原版 `client1095` 在死亡状态持续绘制这些 HUD，并对每个元素做 400 逻辑单位的
离场插值：

```c
lb = 0;
if (opacity <= 0)
  lb = (1 - pow(0.9, dt*0.06)) * (400 - lb) + lb;
```

- 等级条：`translate(-slide, 0)`，向左飞出；
- 装备栏及移动提示：`translate(0, +slide)`，向下飞出；
- 地图、右上花朵面板：`translate(+slide, 0)`，向右飞出；
- 顶部 `florr.io`、死亡遮罩、统计文字不参与该位移；
- 物品栏在死亡时关闭。

当前 `client/src/render/hud.ts` 的 `drawHudLayer` 在 `state.death` 时直接
`return`，只画了 logo；`drawHud` 又把花朵面板替换成 `flowers: 0` 的空数据，
所以装备栏、等级条、地图和花朵面板在第一帧全部消失。这是 `parity-death-2026-10-27.md`
“装备移出”结论未覆盖到的实际绘制分支缺口。

修复：

- `HudState.hudSlide` + `createHudState` 按 `1 - pow(0.9, dt*0.06)` 推进到 400；
- 死亡时移除 `drawHudLayer` 的提前返回，按上述方向应用 `hudSlide`；
- 花朵面板使用死亡前的状态（默认 `1 Flower` / `Unnamed Flower`），不再强制清空；
- 死亡时跳过物品栏，保留聊天和区域提示；
- 区域提示的透明度/倒计时在死亡时冻结，避免死亡帧把原版仍可见的提示淡掉。

浏览器逐帧复核（自杀后连续截图）：第 1 帧等级条、装备栏、地图和花朵面板仍在，
随后等级条向左、装备栏向下、地图与花朵面板向右移动；约 400 逻辑单位后全部离场，
最终只剩 logo、死亡遮罩、统计栏和保留花瓣行。

## 回归结果

- `./build/engine/engine_tests --tap`：全部通过；新增
  `ok 83 - test_killer_name_uses_attacker_identity`，原
  `ok 82 - test_attribution_death_and_pickups`（仍期望 `"Ladybug"`）通过。
- `npm run test:client`：264/264 通过（含 HUD、菜单、死亡生命周期）。
- 修改 tooltip 空白行字号后，单独重跑
  `node --test client/tests/ui-tooltip.test.mjs`：8/8 通过。
- `node --test client/tests/menu-golden.test.mjs client/tests/menu-animation.test.mjs
  client/tests/hud-golden.test.mjs client/tests/death-lifecycle.test.mjs`：23/23 通过。
- `npm run build:dist-next`：通过；142 个文件，1,317,800 字节。
- `npm run verify:dist-next`：通过，零问题。
- 浏览器复核：`killerName` 为 `"Hornet"`；0 幸存花瓣重开文案无 `with:`；
  Mob Gallery 锁定 `?` 与 tooltip 截图见本轮探测脚本输出。

## 证据边界

- tooltip 的字号、行距、空白行、边距和行宽来自 `func623`/`func801`/`func1099`
  的反编译与 WAT 常量；没有把未发现花瓣强行注入原版图鉴来取得“已发现”状态的
  原版截图。名称/稀有度/描述文本本身已从原版客户端定义表逐项核对。
- `?` 尺寸有原版锁定图鉴截图与修复后同尺寸截图直接对照；未发现项的文本内容
  仍只有 `?`。
- 死亡转场的 400 单位、指数曲线和方向来自 `client1095` 反编译及原版逐帧 Canvas
  追踪；当前截图验证了方向和最终离场，未对每个浏览器字体栅格化做逐像素承诺。
- 本轮未创建提交。
