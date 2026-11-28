# Mob 移动速度采用规则

2026-11-15 起，[catalog.json](../data/catalogs/20221030/catalog.json) 的移动速度按原 World PvP
同族怪物与玩家的比例采用。没有同族的移动怪物使用原版通用 AI 默认值。
这是一项有原件数值支撑的跨版本采用策略，不是已确认的 2022-10-30 Wave 服务端速度。

## 原件与换算

原件为 [sp_server.wasm](../../archive/tree/legacy/upstream/sp_server.wasm)，SHA-256：
`75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d`。
[提取工具](../tools/reference/world-pvp-movement.mjs) 在内存副本增加导出，运行原件的 22 个
mob 初始化函数，从 `entity+104` 的 AI 组件读取游荡、追击、绕行和速度波形参数；不执行
重建的 `engine` 初始化器，也不修改原文件。完整 f32 读数保存在
[world-pvp-movement.json](../data/catalogs/20221030/world-pvp-movement.json)，由生成器校验哈希。

原件 `spServerThink` 中满输入、无修饰玩家的控制冲量系数为 **2.5**：
`2.5 × modifier × dt × 0.001`。mob 使用同一积分系统，冲量为
`mobCoefficient × modifier × dt × 0.001`，因此同条件下的系数比就是移动比例。
不能直接把 AI 系数当作每秒位移，也不能使用重建代码中未参与控制计算的
`PlayerConfig.movement_speed` 作为分母。

当前 catalog 的 `mobMovementPlayerSpeed` 为 **50 模拟单位/秒**，同时生成场景的玩家基础速度：

```text
Wave mob 状态速度 = 原 World PvP mob 状态系数 / 2.5 × 50
```

速度系数先还原为七位有效数字的十进制常量，以去掉 f32 存储误差，例如
`2.4000000953674316 → 2.4`。下表适用于全部六种稀有度；未列出的绕行系数均为零。

| 身份                                            | 原游荡系数 | 原追击系数 | 现游荡基准 | 现追击速度 |            现绕行速度 |
| ----------------------------------------------- | ---------: | ---------: | ---------: | ---------: | --------------------: |
| Ladybug、Dark Ladybug、Shiny Ladybug            |          1 |        2.4 |         20 |         48 |                     0 |
| Bee、Baby/Worker/Soldier/Queen Ant、Beetle      |          1 |        2.4 |         20 |         48 |                     0 |
| Spider                                          |          1 |       2.88 |         20 |       57.6 |                     0 |
| Hornet                                          |        0.7 |        2.4 |         14 |         48 | 8（原系数绝对值 0.4） |
| Centipede 及其分节                              |        0.2 |        2.4 |          4 |         48 |                     0 |
| Evil Centipede 及其分节                         |       0.16 |        2.4 |        3.2 |         48 |                     0 |
| Square                                          |        0.2 |        2.4 |          4 |         48 |                     0 |
| 无同族的移动怪物，采用通用默认值                |        0.2 |        2.4 |          4 |         48 |                     0 |
| Rock、Cactus、Ant Hole、Fire Ant Burrow、Sponge |     无移动 |     无移动 |          0 |          0 |                     0 |

无同族的移动身份为 Desert Centipede 及其分节、Scorpion、Fire Ant、Sandstorm、Bubble、
Acid Bubble、Shell、Starfish、Crab、Jellyfish、Digger、Leech 及其分节。通用默认值由
原件 Square 初始化器未覆盖速度的通用 AI 配置取得。原件 Rock、Cactus、Ant Hole 没有
移动 AI；Wave 中固定的 Fire Ant Burrow、Sponge 继续固定，速度为零。

## 状态与 catalog 字段

- `body.speed_per_second`：追击、返回、跟随和逃离的基础速度。
- `movement.idle_speed_per_second`：游荡基准速度。
- `movement.strafe_speed_per_second`：Hornet 进入绕行距离后的速度绝对值。
- `movement.idle_wave_frequency_min/max`、`idle_wave_power`：游荡速度包络，频率单位为弧度/秒。
- `provenance.movement`：原件文件、采用的物种配置，以及 `same-species`、`default-ai` 或
  `stationary` 的采用方式。它独立于只记录 tooltip 采用字段的 `adoptedFields`。

原件启用速度包络的同族使用
`idleSpeed × pow(0.5 - 0.5 × cos(ageSeconds × frequency), power)`，速度在零与游荡基准之间
变化。瓢虫、Beetle、Spider 的频率约为 2、指数 2；蚂蚁频率范围为 1.8–2.2、指数 2；
Bee/Hornet 的频率约为 2.87236832、指数 0.5。蚂蚁的具体频率在范围内按 Wave 实体 ID
确定，以保持可重放性，不复用原 World PvP 的随机流。Square、蜈蚣及通用默认配置不使用
速度包络。

链节有前驱时只通过链约束跟随，不独立施加移动速度。减速、蛛网、停速、碰撞反弹和后坐力
仍在移动积分阶段作用。这里采用的是状态速度及速度包络，没有移植原 World PvP 的完整
惯性、转向、寻路和随机行为。

Spider、Leech、Jellyfish 生成时不再按玩家速度乘以 1.1/1.1/0.9 覆盖；生成结果直接读取
catalog。若更改基础玩家速度，修改 `mobMovementPlayerSpeed` 后运行 `complete.py`、格式化
catalog，再运行 `generate.py`，即可重新计算全部状态速度。

## 验证

```sh
node wave/tools/reference/world-pvp-movement.mjs --check
python3 wave/tools/catalog/generate.py --check --self-test
python3 wave/tools/catalog/generate.py --check --verify-evidence \
  --evidence-root . --snapshot wave-reference/20221030
cmake --build build/wave/native -j 4
ctest --test-dir build/wave/native --output-on-failure
```

生成器校验全部 210 个 mob 条目的比例、包络和来源。原生回归测试检查自定义玩家速度下
不发生生成覆盖，以及 25/50ms 两种步长的实际游荡、追击、Hornet 绕行、
召唤物跟随与 Digger 逃离速度。Queen 取消距离脱战和强制归巢，回归检查远距离持续追击。
小蚁穴的逐只出洞另覆盖两种步长、Common/Unusual、两种蚁穴及致命一击后的完整释放。
