# W5 · 历史校准、三场景、蚁穴和独立 PvP

**前置**　[历史规则表](00-baseline-and-evidence.md#003-建立历史规则表)、[目录与存档](03-catalog-economy-and-save.md)、[原版小队](04-squads-and-matchmaking.md)。每个场景同时交付规则证据、真实原版客户端场景用例和独立的玩法报告。

## 05.1 将历史资料变为可测规则

1. 在 `wave/data/rules/20221030/` 将证据 ID 映射为可加载的波次、怪物、物品和会话参数。每个字段记录作用域、单位、目标日期、采用值、候选区间、证据等级和测试。用同一个参数表生成可读的覆盖报告。对比构建用规则表与历史表，防止临时默认值隐式进入发布。
2. 按规则查目标日两侧的修订，逐项记录生效与终止。同期更新、原版状态和录像可证实的边界优先。后写的 Wiki 历史用来补条件，多个来源转录同一日志计为一条证据。存在冲突时在表中保留各自日期和来源，给出采用值及影响范围。
3. 对每段录像登记时间区间、视野范围、波数、场景、人数、批次开始与末次可见生成、计数上下界、推进和死亡原因。将固定种子回放的服务端摘要投影到同一观察口径，只比较两边都能观测的量。用不同录像复查候选参数。缺证据的精确参数保留区间或复刻设定。 [Waves Wiki](https://official-florrio.fandom.com/wiki/Waves) · [Garden 录像](https://www.bilibili.com/video/BV1ED4y167Sc/) · [Desert 录像](https://www.bilibili.com/video/BV1Pg41117Gb/)
4. 首先校准第 1–3 波、较高起始波、特殊波和一次后期长局。9 月的 15% 是独立概率项，特殊池、首波、怪种资格、后期稀有度截止和刷怪节奏分别验证。测概率阈值两侧、空池回退、移除不合资格怪种、跨波残余、超时和首波例外。11 月的场地与波次改动单列。 [9 月更新](https://github.com/AstRatJP/florr.io-files/blob/main/i18n/en_US/changelog.txt#L1487-L1506) · [11 月变化](https://github.com/AstRatJP/florr.io-files/blob/main/i18n/en_US/changelog.txt#L1429-L1458)

## 05.2 按场景接入原版 ID 和行为

| 顺序   | 服务器执行工作                                                                        | 原版客户端验收                                              |
| ------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Garden | 校准早波及特殊波，加入 Hornet、Spider、Centipede 等行为并核对治疗、毒与陷阱           | 从原版菜单进场，完成普通波、特殊波、拾取、观战和重生        |
| Desert | 确认轮换和可达性，录入 Cactus、Desert Centipede、Scorpion、Sandstorm 和火蚁等有效候选 | 客户端可进入 Desert、识别怪种、读取毒伤与图鉴状态并结束对局 |
| Ocean  | 恢复怪池、水母效果及水蛭共血分节，核对同体死亡、掉落和波次计数                        | 客户端可进入 Ocean，收到怪物变体及共享生命相关状态          |

每个怪种核对原版 ID、稀有度和命中尺寸、生命和伤害、移动、仇恨、攻击距离、投射、掉落和图鉴。每个行为从真实原版输入到权威结果，再到可见反馈走一个最小用例。场景色彩、图像、动画及 HUD 由原版客户端运行。服务端负责已确认的场景参数和状态字节。轮换天数、起算时间和场景开放范围有同期证据才锁定，`Swamp` 继续列为调查。 [8 月轮换日志](https://github.com/AstRatJP/florr.io-files/blob/main/i18n/en_US/changelog.txt#L1573-L1597) · [场景历史](https://florrio.wiki.gg/wiki/World_Map)

## 05.3 实现蚁穴

1. 查 10 月可进入的蚁穴类型、怪种、稀有度、进出条件、计时和出生位置。高稀有蚁穴的圆形内部、蚁后稀有度和其他蚂蚁的稀有度分开验证。用同期原客户端观察确定洞内 HUD 和子场景编码。 [蚁穴历史](https://official-florrio.fandom.com/wiki/Ant_Hole#Trivia) · [计时更新](https://github.com/AstRatJP/florr.io-files/blob/main/i18n/en_US/changelog.txt#L1527-L1554)
2. 服务端定义入口、返回点、实例容量、洞内时钟、清理及主场是否暂停的条件。玩家切场时保留档案和生命，切换实体可见集与控制状态。普通 Garden 蚁穴跑通后增加不同稀有度及 Desert 火蚁穴。
3. 用两人分处主场与洞内、倒计时到期、死亡、进出瞬间断线、重复切场和洞内最后一只怪组成夹具。分别断言服务端主波计数、奖励及原客户端进出状态。未知的暂停与重生边界保留证据状态。

## 05.4 实现 10 月独立 PvP

1. 由原版 PvP 入口进入独立规则。恢复 9 月日志涉及的人数与场地尺寸、较高稀有度怪物、排行榜、按被击败者分数掉 Basic 和 Magnet 限制。地图缩放函数、分数阈值、装备继承、收益归属与进入条件逐项查日期。现代 Hel 资料保留为另一版本。 [9 月 PvP 更新](https://github.com/AstRatJP/florr.io-files/blob/main/i18n/en_US/changelog.txt#L1476-L1485)
2. 对每个有证据的 Basic 分数边界测下一个、等于和上一个可表示值，核对服务端归属、稀有度和原版拾取反馈。人数变化后检查边界与已有实体位置。PvP 和 PvE 并跑，双方状态、随机和经济按配置隔离。
3. 两个原客户端完成进场、交战、击杀、排名、拾取与离场，保存旧协议字节和事件，确认客户端收到正确的排名、场地及模式状态。

## 05.5 执行与交接

注册 CTest 标签 `w5` 与 `test:history`。后者读取已冻结规则和证据表，验证实现值、覆盖用例和仍待确认的项，输出 `reports/wave/W5/history.json` 及逐波对照。已证实规则必须有通过的实测用例，估计值必须能追溯至报告。

```sh
set -eu
cmake --build build/wave/native --parallel
ctest --test-dir build/wave/native --output-on-failure --no-tests=error -L '^w5$'
npm --prefix wave run test:history -- --stage W5
npm --prefix wave run test:wire -- --snapshot "$WAVE_SNAPSHOT" --stage W5
```

交接 Garden、Desert、Ocean、蚁穴和 PvP 的规则版本、证据覆盖、实测通过项和原客户端联机结果。缺史料参数写明采用值、候选范围和升级证据。 [执行记录](README.md#执行记录)

## 蚁穴与独立 PvP 执行结果（2026-11-26）

本次完成 **05.3、05.4**，以及对应的 `w5` / `test:history` / 原客户端联机门禁。
05.1 的完整波次曲线校准和 05.2 的三场景逐项历史验收继续保留为后续工作，不将整个 W5 关闭。

- Rare+ 普通蚁穴和火蚁穴通过接触进入独立圆形内部。四席小队可分处主场和洞内，
  实体、碰撞、仇恨、治疗、闪电和掉落按区域隔离。血量、装备和档案保留，切场更新控制代际，
  旧快照输入不能越区执行。洞内死亡、进出时断线恢复、反复进入、最后守卫、清空及超时都有夹具。
  全部存活连线玩家入洞时暂停主波刷怪和波时钟；关闭后传出幸存实体及掉落。
- 普通洞内 Queen 与入口同级，其余三种蚂蚁固定 Rare；火蚁穴按日期规则配置 50 只及 E/L/M 的 3/2/1 只同级火蚁。
  Digger 仅在 Rare+ 首次入洞时抽取 2%，普通洞和火蚁穴均覆盖；移除 W3 的低稀有清场代理。
  C/U 外放野生守卫和入口关闭按目录各结算一次 XP、图鉴及掉落，玩家召唤物不重复获得野生收益。
- 原生 PvP 菜单使用独立发现/socket 与 mode 2，服务端验证等级 15；独立公开房间提供持续刷怪、
  玩家互伤、个人死亡/返回、装备继承、排行榜和 Basic 拾取。Magnet 拾取倍率固定 1。
  地图收缩将实体与掉落夹回可达范围；同时互杀先冻结败者分数，旧生命的毒不会归给重入的新生命。
  PvP 与 PvE 的模拟、随机和波次进度隔离，库存收益按独立事件键持久化。
- 按本次配色要求，Garden / Desert / Ocean / PvP 与原客户端菜单同色：
  `#1ea761` / `#decf7c` / `#5785ba` / `#4d5e56`。
  普通蚁穴与火蚁穴内部使用对应入口外圈色 `#b58500` / `#b52d00`，不取母场 biome 色。
  原件 Ocean 的额外全屏滤色在已有运行时兼容适配中关闭，使最终像素也与要求一致。
  [冻结配色](../wave/data/wire/20221030/w5-backgrounds.json) · [原件定位与字节适配](../wave/docs/protocol/10-w5-scenarios.md)

| 验收             | 实测结果                                                                                                    | 报告                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 原生回归         | 19/19 CTest 条目通过；W5 输出 17 个实际通过的验收 ID                                                        | [native.log](../reports/wave/W5/native.log)                                                                                                            |
| 历史规则门禁     | 29/29 采用值、编译参数、来源哈希和用例关联通过；其中 10 项已证实、18 项重建、1 项未确认                     | [history.json](../reports/wave/W5/history.json)                                                                                                        |
| 原版联机         | Chrome 158.0.8127.37，双人进洞/两区可见集/返回、PvP 进场/交战/击杀/排名/拾取/离场，以及六种最终背景像素通过 | [wire.json](../reports/wave/W5/wire.json)                                                                                                              |
| 既有联机回归     | W2、W3、W4 原客户端流程通过                                                                                 | [W2](../reports/wave/W5/regression-W2/wire.json) · [W3](../reports/wave/W5/regression-W3/wire.json) · [W4](../reports/wave/W5/regression-W4/wire.json) |
| 内存与未定义行为 | W5 通过 ASan/UBSan；macOS 不支持 LSan，使用 `detect_leaks=0`                                                | [sanitized.log](../reports/wave/W5/sanitized.log)                                                                                                      |
| 独立源码构建     | 临时目录仅复制 `wave/`，`WAVE_BUILD_HOST=OFF`，19/19 原生用例通过                                           | [standalone.log](../reports/wave/W5/standalone.log)                                                                                                    |

实际命令与退出码登记在 [验证汇总](../reports/wave/W5/verification.json)。复核入口：

```sh
cmake --build build/wave/native --parallel
ctest --test-dir build/wave/native --output-on-failure --no-tests=error
npm --prefix wave run test:history -- --stage W5
npm --prefix wave run test:wire -- --snapshot "$PWD/wave-reference/20221030" --stage W5
```

源码基于 `aabb24b` 加本次工作区变更，完整源文件 SHA-256、组合摘要及宿主二进制摘要记录在
`wire.json`；历史规则为 `20221030-w5.scenarios.1`。原件 Wasm SHA-256 为
`68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0`。
180 秒、洞半径 150、Garden 守卫总数、全员入洞暂停条件、PvP 地图函数和精确 Basic 分数阈值
仍按[证据边界](../wave/docs/w5-scenarios-20221030.md)标明采用值；测试通过不提高其历史置信度。
洞内沿用母场原生场景名及 Wave 数字，原生蓝条显示剩余计时；专用历史倒计时字段尚未确定。
异区队友保留小队名字/装备但不发送花朵位置，原版头像会呈无生命样式，服务端生命状态保持正确。
