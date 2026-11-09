# 08 · 溯源索引与复核方法

本文把所有结论锚定到具体函数、行号、内存地址和夹具。行号均指
`build/wave/reference/client.wat`（binaryen 132 编号，`$0..$4137`）。

## 1. 分析对象

| 项 | 值 |
| --- | --- |
| 构建 | `b632797f0ee487dd99df460b13bde6d7ce5c9773` |
| `client.wasm` SHA-256 | `68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0` |
| `client.js` SHA-256 | `23c51f12ec4f31b66e4796d799ac944c05b60114cb84ba58e354ed1c53ab4dc0` |
| WAT | `build/wave/reference/client.wat`（34.5 MB） |
| 函数导入 | 358 |
| 定义函数 | 4 138 |
| `code` 段 | 2 330 231 B @ 18 542 |

浏览器栈帧号 = `$N + 358`；例如 `$988` 在浏览器中显示为 1346。

## 2. 函数索引

| 函数 | 行范围 | 作用 | 关键证据 |
| ---: | ---: | --- | --- |
| `$4` | 6 039–6 059 | 分配器包装（4112 B 命令对象） | 所有命令构造 |
| `$41` | 25 264–25 464 | 合成最终绘制位置（f64） | W2-11 坐标 |
| `$51` | 27 160–27 904 | 受击闪光绘制 | 32 命令 |
| `$113` | 55 789–56 093 | 入队包装（对象 + 释放器） | 命令队列 |
| `$126` | 60 293–65 823 | 回充/快捷栏解析 | 0x20 组件 |
| `$382` | 211 232–211 619 | 构造 opcode 7（ready） | `+17` bool |
| `$435` | 234 247–256 001 | 大型客户端对象构造；含 4112 分配 | 待细分 |
| `$436` | 256 002–256 867 | 构造 opcode 5（craft） | all/keep/item |
| `$456` | 273 132–273 625 | 构造 opcode 34（ad） | 无参 |
| `$463` | 275 857–276 588 | 构造 opcode 28（swap） | 两槽字段 |
| `$587` | 372 189–376 976 | 构造 opcode 13/25/6/22 | 启动批次 |
| `$597` | 384 778–390 354 | 死亡淡出/通用渲染 | 0x80000 |
| `$601` | 394 231–468 963 | **世界更新读取器** | 实体/命令/envelope |
| `$841` | 573 736–575 069 | 入队 + opcode 4（房间码字符串） | 小队加入 |
| `$929` | 639 034–639 574 | 构造 opcode 17（4 字符串） | 账号 UI |
| `$939` | 647 207–887 782 | 主 UI/游戏逻辑；构造 8/12/15/16/21/30 | 最大函数 |
| `$973` | 914 325–915 130 | 输入 → 实体 transform | 控制句柄 |
| `$984` | 926 556–926 795 | 构造 opcode 4（房间码） | 小队加入 |
| `$985` | 926 796–927 412 | 构造 opcode 27（创建） | `vu` 自增 |
| `$986` | 927 413–928 029 | 构造 opcode 3 | `vu` 自增 |
| `$987` | 928 030–928 288 | 构造 opcode 11（退出） | 无参 |
| `$988` | 928 289–938 245 | **S→C 命令分派** | `br_table (op-11)` |
| `$991` | 948 126–971 914 | 每帧更新/相机；构造 0/1/9/19/24/38 | 移动/ACK |
| `$992` | 971 915–973 183 | **出站批次 flush** | 序号/掩码 |
| `$997` | 974 172–974 282 | 装备 16 槽写入 | 12 命令 |
| `$998` | 974 283–975 368 | 回充插值 | u16/65535 |
| `$269` | 159 488–159 835 | 0x8 world 统计分配 | 21 值 |
| `$3750` | 1 543 930–1 544 016 | 0x8000 图鉴 27 B 读取 | 函数表间接可达 |
| `$2348` | 1 389 991–1 390 055 | profile 经验访问器 | `+4608`/65535 |
| `$2350` | 1 390 073–1 390 132 | profile 等级访问器 | `+8` |
| `$1795` | 1 143 181–1 148 436 | Leech 链绘制 | 0x80 组件 |
| `$140` | 72 485–73 405 | 资料默认值/等级 | 0x8000 |
| `$2150` | 1 326 187–1 326 235 | JS 发送桥 | 事件 143871 |
| `$2153` | 1 326 266–1 326 359 | 9 帧背压发送队列 | 53039 |
| `$2240` | 1 356 588–1 377 777 | 连接状态机；构造 2/4/7 | 大厅 |
| `$3309` | 1 503 445–1 505 525 | **外层消息分派** | 类型 0/1/5 |
| `$3437` | 1 517 933–1 518 899 | 渲染循环；调用 `$992`/`$601` | 每帧顺序 |
| `$3252` | 1 497 694–1 497 748 | 关闭处理 | 事件 143871/53035 |
| `$3281` | 1 499 385–1 500 259 | 错误处理 | 事件 142848/7 |
| `$3827` | 1 549 760–1 549 986 | onclose 清理 | 事件 144008 |

> `$435` 曾被误标为 opcode 0 构造点：其 234317 行的 `offset=16` 属于一个
> **152 字节**对象，不是 4112 字节命令。C→S 0 目前没有确认构造点。

## 3. `$988` 的 opcode 分派

```
br_table 索引 = opcode - 11：
 14→block11  18→block12  20→block13  23→block14  26→block15
 32→block16  33→block17  35→block18  36→block19  37→block20
 39→block21  40→block22
 11–40 内其余→block10（忽略）
 0–10、41+ → 默认 block22（= opcode 40，三 f32）
```

被分派的 12 个 case：14、18、20、23、26、32、33、35、36、37、39、40。其中
18/26/39/40 无可观察副作用；33 只创建 Path2D、不 stroke；32/35/36/37 有实际
UI/状态副作用。
注意 wasm 的 `br_table` 目标语义是“跳到目标 block 末尾”，因此 case 代码位于
**父 block 的尾部**，不是 `br_table` 之后的第一段；本次分析用 AST 父链逐段
提取，避免把整段 switch 误当单个 case。

## 4. 数据段地址

地址按 `tools/protocol/wat.py` 的数据段解码（已修正 `\00` 被误读为 `\0`+`0`
的旧 bug，长度与 wasm-objdump 的 segment size 一致）：

| 地址 | 内容 | 用途 |
| ---: | --- | --- |
| 53 744 | 256 字节 payload mask | 内层掩码，数据段 `$135`，WAT 第 610 行 |
| 34 440 | `cp6_player_id` | **localStorage key**；S→C 14 通过 `$65` 持久化值 |
| 41 492 | `florrio-waves-0` | 服务发现 endpoint |
| 33 728 | `game mode` | 仅 `$63`/`$1571` 引用，与 S→C 14 无关 |
| 28 963 | `kUnknown` | 关闭码 0 |
| 34 769 | `kOutdated` | 关闭码 1 |
| 30 008 | `kServerFull` | 关闭码 2 |
| 29 517 | `kInvalidToken` | 关闭码 3 |
| 26 992 | `kProtocolError` | 关闭码 4 |
| 29 015 | `kShuttingDown` | 关闭码 5 |
| 25 572 | `kTooManyConnections` | 关闭码 6 |
| 33 203 | `kIdle` | 关闭码 7 |
| 34 856 | `kBanned` | 关闭码 8 |
| 29 277 | `kChangeSimulation` | 关闭码 9 |
| 35 006 | `kKicked` | 关闭码 10 |
| 38 373 | `NOT_IN_ENUM` | 关闭码 ≥11 |
| 52 856 | `Server disconnect reason (%d): %s\n` | 类型 0 的格式化串 |

> 关闭码映射不再是推断：`$3309` 的 `br_table` + 嵌套 `select` 明确给出
> 0→28963、1→34769、…、10→35006、默认→38373，见 01 第 4 节。数据段偏移
> 与 wasm-objdump 的 `segment[130]` 等大小逐段核对。

## 5. 抓包与夹具

| 路径 | 内容 | 等级 |
| --- | --- | --- |
| `wave/data/wire/20221030/bootstrap.json` | 服务发现、首帧 `30 <hash> 00 00`、`ff` 反例 | A |
| `wave/data/wire/20221030/w2-bootstrap.md` | 已验证协议子集、字段因果 | A |
| `wave/data/wire/20221030/w2-lobby-replay.json` | 合成房间记录（mask `00 02 00`） | 合成 |
| `wave/data/wire/20221030/w3-economy.json` | craft/equip/swap/35 示例 | A |
| `wave/docs/client-20221030.md` | 组件表、镜头、波次、受击 | A |
| `wave/docs/economy-wire-20221030.md` | 经济字段与缓存 | A |
| `wave/docs/catalog-20221030.md` | 物品/怪物目录 | A |
| `wave/docs/store-20221030.md` | Store 槽位/持久化 | A |
| `wave/tests/native/w2_wire.cpp` | 线上回归 | A |
| `wave/tests/native/w3_wire.cpp` | 经济回归 | A |
| `wave/server/wire/bootstrap.cpp` | 原版互通实现 | A |
| `wave/server/wire/garden_projection.cpp` | 组件/命令投影 | A |

## 6. 复核命令

```bash
# 函数伪代码
python3 tools/protocol/wat.py fn 988 | less

# 原始 WAT 行
python3 tools/protocol/wat.py raw 988 | sed -n 1,80p

# 谁调用了它
python3 tools/protocol/wat.py callers 601

# 引用某个立即数地址的函数
python3 tools/protocol/wat.py refs 53744

# 字符串
python3 tools/protocol/wat.py str 34440 32
python3 tools/protocol/wat.py strings 25000 36000

# 某个函数里引用的可打印字符串常量
python3 tools/protocol/consts.py 988 145 461
```

`tools/protocol/wat.py` 的解析器修正过一个关键 bug：函数头正则最初要求
`(func $N ` 带尾随空格，导致 `(func $938 (param...` 被截断、`$939` 被漏掉。
现正则 `^ \(func \$(\d+)` 可正确识别 4 138 个函数。第二个 bug 是
`decode_escapes` 把 `\00` 当成 `\0` + 字面 `0`，使每个 NUL 多出一个 `0x30`
字节、数据段地址整体后移；修复后 segment 130 的长度 45 341 与
`wasm-objdump` 的 `size=45341` 完全一致。

## 7. 闭合台账

| 编号 | 事项 | 最终结论 |
| ---: | --- | --- |
| 1 | opcode 27 是 `bool` 还是 `vu` | **已闭合**：3 与 27 是同一个 Play 按钮的两条分支，均带 `vu` 自增请求号；服务端必须按 `vu` 读并忽略数值（B） |
| 2 | C→S 0/1/19/24 | 门控字节只读不写，**不可达**（B） |
| 3 | C→S 2/3/27 的关系 | 2 = 实体点击，1 字节 `!entity+72`；3/27 = 同一 Play 按钮的快速匹配/创建小队两条分支，均带 `vu` 请求号（B） |
| 4 | C→S 16/22 | 16 = 菜单行 `vu` 枚举（`$939` @875368）；22 = 一个 NUL 字符串，内容为 `s1‖s2‖s3‖f64le` 凭据（B） |
| 5 | C→S 17 四字符串 | `provider`（discord/appleid）、`nickname`（与 30 共用缓冲区）、空、空（B） |
| 6 | C→S 29 字符串 | 常量 `"admin"`，每 world 一次；不是聊天/用户输入（B） |
| 7 | S→C 18 | 字符串复制后释放，**无副作用**（B） |
| 8 | S→C 20/23 | 20 置 `898504=1` 并重建 URL hash；23 清 `world+17965`、重载/释放账号单例、删除 `oauth2_data_DO_NOT_SHARE`（B） |
| 9 | S→C 26/39 | 完整条件分支存在（1→2 / 3→4 + 名字 + 清 hash），但 1/3 从未被写入，`world+22184` 也只在初始化时清零，且 `world+22172` 无读者 → **不可达/无副作用**（B） |
| 10 | S→C 37 | 账号身份：3 字符串 + f64 + 2 字符串，写单例 `4029336`；C→S 22、UI 文本、JS `Image`、base64 localStorage 消费（B） |
| 11 | S→C 40 | 三点写入 `world+22136` 向量，该向量只在析构时清零，**无渲染读者**（B） |
| 12 | 关闭码枚举 | **已闭合**：0 `kUnknown`、1 `kOutdated`、2 `kServerFull`、3 `kInvalidToken`、4 `kProtocolError`、5 `kShuttingDown`、6 `kTooManyConnections`、7 `kIdle`、8 `kBanned`、9 `kChangeSimulation`、10 `kKicked`、≥11 `NOT_IN_ENUM`（B） |
| 13 | `0x80/0x20000/0x40000` | `0x80` = Leech 前驱句柄（B）；`0x20000/0x40000` 各消费 **1 字节**并存入 `component+8`，但无读取者，属 write-only 保留位（B/C） |
| 14 | profile 完整 schema | **已闭合**：607 B 游客基线；level、flags、276 array0 vu、4 unknown vu、string_a、camera Y、27 B gallery、zoom、string_b、scalar3、control、camera X、276 inventory vu、可选 xp vu（见 05） |
| 15 | 聊天是否存在 | **不存在**：18 是死字符串，29 是常量 `"admin"`，17 是登录，22 是凭据回传；没有文本输入→聊天命令对（B） |
| 16 | 数据段地址偏移 | **已修复** `decode_escapes` 的 `\00` bug；地址与 `wasm-objdump` 逐段核对（A） |
| 17 | 实体 flags 方向 | **已修正**：线上 `0xcc`=普通、`0xc4`=花朵；逻辑值 = XOR `0xac`，bit 3 装备、bit 1 新到达（A/B） |
| 18 | 实体 `0x8` | 世界级 10+10 个 vu + 1 字节，无 UI 读取者；不是“花数”（B/C） |
| 19 | 实体 `0x200` roster | 客户端实际读取 4 名 + 4 个 ready bit + 4 字符串 + 4+4 句柄 + 64 u16 + f32 + 4 u8；服务端的 21 B/84 B 是零填充近似，房间码对齐待动态确认（B/C） |
| 20 | 实体 `0x800000` | 300 × f64 + 300 × NUL 字符串 + `vu` + `f32`… 的未文档化大组件；参考服务端从不发送，客户端消费点未确认（C） |
| 21 | 实体 `0x1` | 1 字节，写 transform 对象 `+8`；无读取者，write-only（B） |
| 22 | C→S 13 | 三个 JS 桥字符串 = `navigator.userAgent`/`document.referrer`/`navigator.language`；不是 agent/token/guest（B） |

## 8. 结论边界

- 本文所有“已确认”均指**字节可解析 + 至少一个消费者可运行**，不等于恢复了
  历史服务端的全部字段或数值。
- 显示比例 ×5、回充归一化、镜头映射等属于本地复刻约定，文中已单独标注，不能
  写成“原版服务器公式”。
- 未修改 `wave-reference/20221030/*`；所有工具在 `tools/protocol/`，文档在
  `docs/protocol/`。
- 本机 REA 不可用（见 `economy-wire-20221030.md` 首段），因此没有 “REA
  Evidence” 标记；证据类型只有捕获、静态 WAT、运行时只读观测和原生测试。
