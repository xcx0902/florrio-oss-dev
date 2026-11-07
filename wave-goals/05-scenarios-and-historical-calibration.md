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
