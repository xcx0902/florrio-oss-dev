# W0 · 固定原版客户端与历史证据

**目标**　固定原版客户端，确认启动所需页面与资源，建立协议夹具和同期规则表。

## 00.1 快照身份

| 输入                                                  |  字节数 | SHA-256                                                            |
| ----------------------------------------------------- | ------: | ------------------------------------------------------------------ |
| [client.js](../wave-reference/20221030/client.js)     |  112347 | `23c51f12ec4f31b66e4796d799ac944c05b60114cb84ba58e354ed1c53ab4dc0` |
| [client.wasm](../wave-reference/20221030/client.wasm) | 2474614 | `68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0` |

从仓库根目录执行。

```sh
set -eu
mkdir -p reports/wave/W0 build/wave/reference
git rev-parse HEAD > reports/wave/W0/revision.txt
shasum -a 256 -c <<'SUMS'
23c51f12ec4f31b66e4796d799ac944c05b60114cb84ba58e354ed1c53ab4dc0  wave-reference/20221030/client.js
68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0  wave-reference/20221030/client.wasm
SUMS
wc -c wave-reference/20221030/client.js wave-reference/20221030/client.wasm
rg -n 'FILE ARCHIVED ON' wave-reference/20221030/client.js
```

预期为上表字节数和 `21:00:58 Oct 30, 2022` 页脚。既有探针用 Binaryen 132 提取三个胶水分发入口的 148 个不同常量，全部在 JS 表中存在。通过本地模拟 WebSocket 验证打开槽位和 Wasm 发送 `19 0a 1e`。测试字节的意义仅为发送通路，历史握手和完整收包待 W2 验证。将重现脚本放入 `wave/tools/reference/`，记录工具版本和输入哈希。

```sh
set -eu
wave_dis="$(printenv WASM_DIS || command -v wasm-dis)"
"$wave_dis" --version > reports/wave/W0/disassembler.txt
"$wave_dis" wave-reference/20221030/client.wasm -o build/wave/reference/client.wat
test -s build/wave/reference/client.wat
```

## 00.2 确认可启动的页面和资源

1. 按原 JS 的加载和 DOM 访问查找所需 HTML、CSS、字体和其他资源。能取得同版资源时记录来源和哈希。优先处理影响客户端启动或连接的缺失项。
2. 用本地最小启动页加载原件，记录资源请求、初始化错误和本地发现接口的调用。原页面缺失时按胶水需求补齐必要元素和加载顺序。
3. 在 `wave/` 初始化独立构建和浏览器测试包，记录用于复查的工具及浏览器版本。确认原件加载并尝试走到菜单或第一条连接请求。
4. 按 [协议专项](protocol-20221030.md) 建第一批原版请求与响应夹具，记录快照和实际使用的资源清单、胶水验证及初始化缺口。

## 00.3 建立历史规则表

在 `wave/data/evidence/20221030/` 建 `sources.json` 和 `rules.json`。每条规则包含稳定 ID、作用域、日期窗口、值或候选区间、单位、来源定位、置信等级、当前实现值和验收 ID。为模拟使用的每个数值标注其来源或复刻设定。记录来源是否转录同一个原日志，交叉核对以独立证据为准。

| 等级   | 所需证据                                                                 | 处理                                                                       |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 已证实 | 同期原日志、能确定日期和触发条件的直接观察，或可重复的客户端字段消费证据 | 固定能证实的字段和边界。客户端消费证据标明属于显示、输入还是服务端下发数据 |
| 重建   | 版本相近的多来源互证，或有清楚解释的规则推导                             | 保存推导、假设及样本范围，用有界测试覆盖                                   |
| 估计   | 历史整理、有限视野录像或不完整参数                                       | 发布实际复刻设定，记录候选范围和升级证据                                   |
| 未确认 | 无足够材料或证据冲突                                                     | 保留缺口、影响范围与下一次取证条件                                         |

1. 从英语 Fandom 的 Waves、花瓣、怪物与旧 PvP 条目查目标日前最近一次有效修订。优先保存 `oldid`、修订时间和表格定位。再找目标日后的首个相关改动作为截止对照。可访问 MediaWiki 历史接口时按 UTC 查询目标日前后修订，保留原响应和时间精度。访问受限时记录具体页面及缺口。
2. 用中文 Wiki 的游戏内日志、历史修订和英语 Wiki.gg 的 History 交叉查证。现代属性表用于定位历史变化。按日期排除 11 月后的行为。例如 Honey 的引怪重做在 12 月，Leaf 的 10 月行为需结合 8 月更新和其后变更。 [中文日志](https://florrio.fandom.com/zh/wiki/%E4%BA%8C/%E6%97%A5%E8%AA%8C/Play_as_guest/Changelog) · [Honey 历史](https://florrio.wiki.gg/wiki/Honey#History) · [Leaf 历史](https://florrio.wiki.gg/wiki/Leaf#History)
3. 使用日期可定位的原版录像核对回合节奏和可见状态。逐个样本记场景、波数、人数、HUD、帧时间、观察范围和可计数对象。怪物在视野外时只记可见下界。8 月录像用作邻近时期参考，10 月同期证据优先。 [Garden 录像](https://www.bilibili.com/video/BV1ED4y167Sc/) · [Desert 录像](https://www.bilibili.com/video/BV1Pg41117Gb/)
4. 首先登记 `wave.advance.remaining`、`wave.special.chance`、`match.public.highestEligible`、`craft.rng.mode` 和 `respawn.nextWave`。9 月日志支持特殊波随机触发和 15% 设置，并比 Wiki 的尾号循环描述更接近目标日。Garden 第 1–3 波输出候选怪种、批次、怪量、时长和重生路径。首波例外、全灭优先级、蚁穴暂停和起始波公式分别留待验证。 [9 月更新](https://github.com/AstRatJP/florr.io-files/blob/main/i18n/en_US/changelog.txt#L1487-L1506) · [Waves Wiki](https://official-florrio.fandom.com/wiki/Waves)
5. 从原 Wasm 导出花瓣与怪物注册表、构造器原值、稀有度、实例数、描述与图鉴消费路径。记录 Basic 的已观察两列 `7/9/13/17/22/28` 和 `5/6/7/9/11/13`，查清字段含义、单位和显示取整后再迁移到服务端。图鉴值、权威值与实战推断分列。抽查 Basic、Fast、Rose、Leaf、Web、Peas/Grapes、Ladybug、Hornet、Spider。

对能访问历史接口的 Wiki，可用下例先取目标日末尾之前的修订。对每篇条目替换标题和对应 API。找到带可靠时区的目标抓取时刻后缩小边界，再核对之后的第一个相关变更。返回访问限制或没有修订时记录该结果，并查历史页面和同期归档。

```sh
set -eu
mkdir -p reports/wave/W0/wiki
curl --fail --silent --show-error --get 'https://official-florrio.fandom.com/api.php' \
  --data-urlencode 'action=query' --data-urlencode 'format=json' \
  --data-urlencode 'prop=revisions' --data-urlencode 'titles=Waves' \
  --data-urlencode 'rvstart=2022-10-30T23:59:59Z' --data-urlencode 'rvdir=older' \
  --data-urlencode 'rvlimit=1' --data-urlencode 'rvslots=main' \
  --data-urlencode 'rvprop=ids|timestamp|content' \
  --output reports/wave/W0/wiki/waves-at-cutoff.json
```

验收该步骤时查看返回的 `revid`、时间、正文及重定向。当天较晚的条目先标为候选，确认包含的改动早于目标构建再采用。保留拒绝访问的来源及缺失字段，供后续复查。

## W0 放行

建好 Wave 独立测试包后，注册 `verify:reference`，按 `--snapshot` 读取原件、重现胶水检查、校验资源清单，并输出 `reports/wave/W0/reference.json`。

```sh
set -eu
npm --prefix wave ci
npm --prefix wave run verify:reference -- --snapshot "$WAVE_SNAPSHOT"
```

通过条件为输入哈希一致、148 个常量检查和本地发送可重现，并记录原件启动结果及首个资源或协议阻塞。Garden 早期规则须有来源或明确的复刻设定。握手仍待恢复时可先做 W1 类型化模拟。报告链接填入 [执行记录](README.md#执行记录)。

## W0 执行结果

W0 放行。原件核对通过，归档原 HTML 的 Memento 时刻为 `2022-10-30T21:00:58Z`，构建前缀为 `b632797f0ee487dd99df460b13bde6d7ce5c9773`。归档原件、资源和本地启动壳分别记录身份。原字体 CSS 及其 6 个分片均取自 10 月 30 日。部分非启动资源的最近回放来自较晚日期，按实际日期登记。 [资源清单](../wave/web/resources-20221030.json)

### 兼容观察

- Binaryen 132 找到 148 个不同的胶水分发常量，全部存在于原 JS 表。Node VM 的 mock socket 观察到从 Wasm 发出的 `19 0a 1e`，用途为传输探针。
- Chromium 156.0.8078.47 在两条启动路径上均执行原件的 `main()` 和初始化。原 HTML 通过已校验的字体字节加载 Ubuntu。启动壳使用备用字体。
- 原客户端实际发起 `GET /endpoint/florrio-waves-0/findEach/`，接受合成的 `servers.us`，随后打开 mock WebSocket 并发出 43 字节的二进制首包。首包包含构建哈希。合成的 `ff` 回包随后触发 `kUnknown` 断开，页面保持加载态。首个成功回包、访客、准备和开局留在 W2。
- 原客户端图鉴读取出 45 种花瓣和 35 个怪物编号。花瓣表另含一个 `None` 条目。报告保留 7 个花瓣构造器的原值、6 个稀有度、描述和怪物图鉴记录。Basic 的两列原值及 f32 乘积取整已经复现。字段单位、图鉴实际渲染和服务端数值保留待证。

[浏览器与胶水报告](../reports/wave/W0/reference.json) · [目录报告](../reports/wave/W0/catalog.json) · [协议夹具](../wave/data/wire/20221030/bootstrap.json)

### 历史规则观察

- 英语 Fandom 的截止点前后修订已保存。包含 Waves、Garden、PvP 和抽查目录条目。Fast 以原客户端名称 Faster 定位，Wiki.gg 的 Leaf 和 Honey History 直接访问返回 403。英语和中文日志来自同一个游戏内日志。 [来源与 oldid](../wave/data/evidence/20221030/sources.json)
- 确认 15% 随机特殊波、最多 4 只剩怪的推进阈值、公开匹配优先最高合格波、以及 10 月 20 日合成 RNG 迁移。Garden 的 8 月录像在 226 秒显示波 26 阵亡等待，227 秒显示波 27 和重生。12 月引怪行为排除在 Honey 的 10 月命中减速说明之外。 [规则表](../wave/data/evidence/20221030/rules.json) · [录像样本](../wave/data/evidence/20221030/video-observations.json)
- Garden 1–3 波采用同期条目的累积怪种候选，6、8、10 只和 20、25、30 秒分别为复刻的总量和截止时间。生成批次、全灭优先级和新档起始波均已标为复刻设定。蚁穴暂停条件、精确初始波公式和怪物计数口径仍需校准。 [W1 输入夹具](../wave/tests/scenarios/garden-w0.json)

### 验收记录

基线提交为 `2f90eed945f2222f0f3a836c83dbdbd9863e27bb`。W0 新文件的独立源码摘要及每项文件哈希记录在报告的 `source` 中。

| 操作 | 退出码 | 结果 |
| --- | --- | --- |
| `npm --prefix wave ci --offline` | 0 | 依赖按锁文件安装 |
| `npm --prefix wave run fetch:archive -- --output-dir <空目录>` | 0 | 12 个归档输入重新下载并通过哈希校验 |
| `npm --prefix wave run verify:reference -- --snapshot "$WAVE_SNAPSHOT" --resources "$WAVE_RESOURCES"` | 0 | 两条 Chromium 启动路径及证据表检查通过 |
| 在只复制 `wave/` 的临时目录重新安装并运行同一验收 | 0 | 输入作为绝对路径传入，[独立报告](../reports/wave/W0/isolated/reference.json) |
| 在实验副本翻转 JS 的一个字节，另跑缺归档资源目录 | 各 1，符合预期 | SHA-256 不符和缺资源都令验收失败 |
