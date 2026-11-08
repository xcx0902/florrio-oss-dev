# W3 原版库存、装备和制作协议

本页对应 W3-01、W3-03 和 W3-05。原件是 2022-10-30 build
`b632797f0ee487dd99df460b13bde6d7ce5c9773`；Wasm SHA-256 为
`68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0`。
协议恢复使用现有 Binaryen 132 WAT、原件运行时只读观测和真实浏览器输入，
没有修改原 JS/Wasm，也没有向 Wasm 内存写入测试状态。本机 REA 不可用，
这些材料不标记为 REA Evidence。

## 已确认的操作

`vu` 是无符号 LEB128，物品编码是 `kind vu`，非零 kind 后接 rarity byte。
空物品只编码一个零。种类范围 1–45，稀有度范围 0–5。

| 方向 / opcode | 原版字段                              | 应用含义 / 验证                                                                      |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| C→S 5         | all bool、keep vu、物品               | `$436`；五合一的输入 tier。Shift 和 Autocraft 都使用 all=true，无独立自动制作 opcode |
| C→S 12        | 16 个物品                             | `$997/$939`；完整菜单装备。当前 n 个主槽，随后 n 个副槽，其余须空                    |
| C→S 28        | slot byte、物品、slot byte、物品      | `$463`；携带两槽**交换前**的物品，验证旧值后原子交换                                 |
| S→C 35        | success bool、created vu、returned vu | `$988`；成功/普通失败的动画结果。命令 envelope 为 vu 1，结果在存档提交后发出         |

真实捕获的明文例子（包括可靠批次头）：

```text
0100050500000500       Common Rose 单次制作
0100060501000500       同一输入 tier 的 Shift 批量制作
01001a1c060501010100   副槽 6 Rose/Unusual 与主槽 1 Basic/Common 交换
```

最后一例的可靠序号随此前鼠标移动次数变化，不能作为业务请求 ID。
`data/wire/20221030/w3-economy.json` 保存固定例子及证据分类；每次执行的原始
加密帧和解码明文在 `reports/wave/W3/wire.json`。

Store 内部主槽固定在 `[0,8)`，副槽固定在 `[8,16)`；协议与缓存由适配层转换。
`$70` 清除索引 >=2*n，`$237` 按 index+n 取副槽；不能在 level 1 时直接把
Store 的副槽 8 当作客户端副槽 0。槽数是 5/6/7/8，解锁等级为 15/30/45。

keep 包含已装备的同种同稀有度副本。应用在有序 I/O 工作项中读取已提交装备，
减去实际已装备数量，转换成 Store 的“额外保留未装备数量”。制作不改变装备，
菜单换装不改变总库存。Common Basic 禁止制作，Mythic 不作为制作输入。

失败范围 1–4 来自原版提示；服务端使用独立均匀损耗，这是有范围标注的复刻设定。
显示概率、服务端采用概率、单位及缺证范围见 [目录文档](catalog-20221030.md)。
拒绝操作没有恢复出可信的原版专用错误码：队列满时保留请求、不推进 ACK；终止性
拒绝使用 W2 已验证的断开/重新加载路径恢复已提交状态，不伪造普通制作失败。
原版五份不足的菜单会禁用制作，不发送 opcode 5，浏览器验收对此单独断言。

## 私有 profile 和正常缓存

`0x8000` profile 按字段顺序写出，不能在非零 varint 后继续套用 W2 空 profile
的绝对字节偏移。已确认的字段有等级、经济权限、276 个旧制作计数、四个未命名
整数、字符串/镜头字段、27-byte mob gallery、控制引用、276 个库存数量。
头扩展 bit 3 后增加一个 0–65535 的 XP 进度 vu，**没有第三个库存数组**。

新档使用 2022-10-20 后的独立随机，旧制作计数保持零；不导入旧计数缓存。
经济权限 byte 为 10（库存/图鉴及等级/XP 缓存）。原版内存中的 level 在 profile+8，
gallery 在 +2288，库存 `(kind*6+rarity)*4` 在 +2400，进度 u16 在 +4608。
gallery 的 bit 为 `mob_kind*6+rarity`，与花瓣注册表完全分开。
库存投影上限为 UINT32_MAX，SQLite 权威数量仍为受检的非负 int64。

`GET /wave/cache/<访客凭证>` 通过同一有界 I/O 队列读取或创建档案，反馈原版正常
localStorage 缓存。`web/local.js` 在加载原 JS 前完成同源请求，写入
`cp6_player_id`、`cached_equipped`、`cached_inventory`、`cached_level` 和
`cached_num_petals`，使全新浏览器上下文仅凭访客凭证即可恢复菜单。
HTTP 返回 `Cache-Control: no-store`。这些校验串只服务呈现，所有经济命令仍由
SQLite 库存和当前生命权限重新验证。

缓存格式来自 `$384/$997/$219/$275/$141` 及通用 `$321`：序列化值，追加
MurmurHash3 x64_128 的两个 vu64，再 Base64。装备使用固定 seed -2107407757；
通用键使用 seed 19089779 的 MurmurHash3 x86_32(key) 作为 x64 seed。
库存是稀有度优先、kind 次序的稀疏列表；等级和槽数是 zigzag 正整数。
`W3-wire` 与原版生成的装备、库存、等级和槽数缓存逐字节比较。

公开花朵组件只发送等级、装备、按各槽总 reload 归一化的八个回充值。
库存、gallery 和 XP 只出现在收件人的私有 profile。不同访客的缓存/凭证不会相互
替代。最高波已由 Store 持久化并通过原生测试；没有擅自把四个未命名整数改称
最高波。W4 的交接与负证据见 [字段调查](profile-highest-wave-20221030.md)。

## 原版验收

```sh
npm --prefix wave run test:wire -- --snapshot "$WAVE_SNAPSHOT" --stage W3
```

入口是 `tools/w3/test-wire.mjs`，使用原版菜单、鼠标、Shift 和数字键。种子存档由
仅在 BUILD_TESTING 编译的离线 `wave_w3_seed` 创建；正式宿主没有发物或改档端点。
制作 RNG 仅在 fixture 宿主可固定，正式宿主拒绝该参数。专用步进端点只推进模拟。

| 用例                     | 对比内容                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------- |
| success / failure        | Common Rose 40→35 并产生 1 Unusual；失败 40→36 且不产生输出；原版动画和已提交存档一致   |
| insufficient             | 四份 Faster，原版禁用制作，无出站制作请求、无库存变化                                   |
| batch / auto             | 原版 all=true 请求；批量库存差分；自动制作保留已装备和 Mythic，输出全量存档             |
| gallery                  | 真实 Mob Gallery 画面，三种不同稀有度发现位与 SQLite 相同                               |
| equipment                | 菜单卸下/装备 Rare Stinger、Unusual Peas、Unusual Rose；实局数字键 2 交换；库存总量不变 |
| cooldown                 | Unusual Peas 四粒发射后的原版快捷栏回充值 65535→8191→65535，配套 Canvas 截图            |
| success/failure recovery | 停止宿主、同数据库重启；新上下文只预置 token，恢复实际库存、主副槽、等级、XP 和 gallery |
| privacy                  | 同时打开另一新访客，获得不同凭证及自己的最小库存，无 Rose 私有数量                      |

结果同时记录 Node/Chrome/SQLite 运行时版本、原件和目录哈希、当前源码摘要与原生
二进制摘要。完整原生故障/并发测试、历史限制和实际执行结果见 W3 目标执行记录。
