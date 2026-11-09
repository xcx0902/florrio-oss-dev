# florrio.io 原版客户端协议（20221030 构建）

本目录记录 **2022-10-30 版 florrio.io 客户端**（`client.wasm` + `client.js`）与
`m28n.net` 游戏服之间的二进制 WebSocket 协议。目标是把 `wave/` 中已经分析出的结论
与本次对剩余未分析部分的静态分析合并成一套可溯源、可复现的协议说明。

> 与 [`../../../docs/protocol.md`](../../../docs/protocol.md) 的区分：那份文档描述当前产品自己的
> `engine` 协议（30 组件、事件 9/11/14 等），编号空间与本目录**不同**。
> 本目录只描述原版客户端线上字节，供 `wave/` 的兼容层与抓包回归使用。

## 分析对象

| 文件 | 大小 | SHA-256 |
| --- | ---: | --- |
| `wave-reference/20221030/client.wasm` | 2 474 614 B | `68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0` |
| `wave-reference/20221030/client.js` | 112 347 B | `23c51f12ec4f31b66e4796d799ac944c05b60114cb84ba58e354ed1c53ab4dc0` |

构建号（握手首包中的 40 字节 ASCII）：

```
b632797f0ee487dd99df460b13bde6d7ce5c9773
```

Wasm 布局：358 个导入函数、4 138 个定义函数，`code` 段 2 330 231 B，从文件偏移
18 542 开始。静态证据统一引用反汇编文本 `build/wave/reference/client.wat`
（binaryen 132 编号，`$0..$4137`；浏览器栈帧号 = `$N + 358`）。

## 覆盖范围

- 外层类型 `0/1/2/5`（3/4/6 为忽略）。
- C→S 27 个编号：4 个不可达（0/1/19/24），其余 23 个都有确定的字段布局。
- S→C `$988` 的 12 个 case；其余编号的忽略/默认行为也已逐一定义。
- 24 个实体组件位（含未文档化的 `0x2/0x4/0x800000`）、`0x8000` 资料、
  `0x200` 小队、经济与大厅全流程。
- 每个字段都有确定的**长度与读取顺序**；不存在“未知长度”的线上字节。

## 2026-11 修订摘要

本轮把“字节可解析”推进到“字段有名字或证明无读者”，主要修正：

| 项 | 旧说法 | 现结论 | 文档 |
| --- | --- | --- | --- |
| 实体 flags | 线上 `0x60/0x68` | 线上 `0xcc` 普通 / `0xc4` 花朵；逻辑值 XOR `0xac` | 04 |
| `0x8` | 花数 | world 级 10+10 个 vu + 1 字节，无 UI 读者 | 04 |
| `0x200` | 21 B + 房间码 + 84 B + 4 字节 | 4 名 + 4 bit + 4 字符串 + 4+4 句柄 + 64 u16 + f32 + 4 u8；服务端 21/84 只是零填充，房间码对齐待动态确认 | 04/07 |
| `0x20000/0x40000` | 未找到读取分支 | 各消费 1 字节，写入 `component+8`，无读取者（write-only） | 04 |
| `0x800000` | 未记录 | 300 × f64 + 300 × 字符串 + … 的未文档化大组件 | 04 |
| profile | 只知 5 个偏移 | 607 B 完整顺序：level、flags、276 array0、4 unknown、string_a、camera Y、27 B gallery、zoom、string_b、scalar3、control、camera X、276 inventory、可选 xp | 05 |
| S→C 37 | 4 字符串 + f64 + 1 字符串，无副作用 | 3 字符串 + f64 + 2 字符串，写账号单例 `4029336`；C→S 22/UI/JS Image/localStorage 消费 | 03/08 |
| S→C 26/39 | 无副作用 | 条件分支存在（1/2、3/4 + 名字），但 1/3 从未被写入、`world+22172` 无读者 → 不可达 | 03/08 |
| C→S 13 | 身份（agent/token/guest） | 浏览器环境：userAgent、referrer、language；guest 来自 localStorage `cp6_player_id` | 02/07 |
| C→S 2 | 无参大厅请求 | 1 字节 `!entity+72` 的实体点击 | 02 |
| C→S 27 | `vu` vs `bool` 冲突 | 与 3 同一 Play 按钮；都是 `vu` 自增请求号，不是 bool | 02/08 |

## 明确无消费者的字段

以下字段的**长度/位置已确定**，但本构建中没有任何读取者，或有读取者却无可见效果。
服务端为了兼容仍应写全，不能省略（省略会错位）：

| 字段 | 状态 | 证据 |
| --- | --- | --- |
| 实体 `0x1` | 写 transform `+8`，无读者 | B |
| 实体 `0x2` / `0x4` | 写 world/实体内部结构，无读者；参考服务端不发 | C |
| 实体 `0x8` | 10+10 个 vu + 1 字节，无 UI 读者；不是花数 | B/C |
| 实体 `0x40` | 空载荷，只挂 12 B presence 节点 | B |
| 实体 `0x20000` / `0x40000` | 各 1 字节，写 `component+8`，无读者 | B/C |
| 实体 `0x800000` | 300 × f64 + 300 × 字符串 + …，参考服务端不发 | C |
| profile `+12` / `+2400` 数组 | 各 276 × u32，无读取者（write-only） | B |
| profile `+2220..2235` | 4 个 u32，无读取者；不是 highest wave | B |
| S→C `18` | 字符串复制后释放 | B |
| S→C `26` / `39` | 条件分支存在，但状态 1/3 从未写入 → 不可达 | B |
| S→C `33` | 建 Path2D 但不 stroke，无渲染读者 | B |
| S→C `40` | 三点写入向量，无渲染读者 | B |

`32` 的受击闪光、`35` 的合成结果、`36` 的快捷栏、`37` 的账号资料是**活的**，
不要因为编号相邻就把它们归入上表。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [01-transport.md](01-transport.md) | 服务发现、WebSocket 握手、双向字节变换、外层消息类型、可靠批次/ACK、关闭码 |
| [02-client-to-server.md](02-client-to-server.md) | 全部 C→S 命令 opcode、字段编码、构造函数与调用点 |
| [03-server-to-client.md](03-server-to-client.md) | 世界更新包结构、命令 envelope、全部 S→C opcode 与消费函数 |
| [04-entities.md](04-entities.md) | 实体记录格式、句柄编码、组件掩码逐位字段表 |
| [05-profile.md](05-profile.md) | `0x8000` 本地资料 607 字节布局、镜头/缩放/控制句柄 |
| [06-economy.md](06-economy.md) | 合成、装备、交换、商店与 `35` 结果事件 |
| [07-lobby-and-squad.md](07-lobby-and-squad.md) | 登录/身份、准备、创建与加入小队、昵称、退出、广告 |
| [08-traceability.md](08-traceability.md) | 函数行号表、数据段地址、抓包与测试夹具索引、复核方法、闭合台账 |

## 证据等级

每条结论标注以下等级之一，正文中统一使用 `A/B/C`：

| 等级 | 含义 | 典型证据 |
| ---: | --- | --- |
| **A** | 双向捕获或双端运行验证 | `wave/data/wire/20221030/*.json`、`wave/tests/native/*`、W2 浏览器验收 |
| **B** | 静态确定 | WAT 中字段读取/写入顺序完整，或服务端实现与客户端读取互相对照 |
| **C** | 仅定位 | 找到 opcode 与构造/消费函数；字段布局已给出，玩法命名为操作名 |

“静态确定”只表示**字节布局**确定，不表示玩法含义一定正确。语义推断在表格中单独
注明“推断”，并在 [08-traceability.md](08-traceability.md) 用闭合台账记录每个争议项的最终结论。

## 复核方法

```bash
# 1. 校验原文件
shasum -a 256 wave-reference/20221030/client.wasm

# 2. 重新生成 WAT（需要 wabt 的 wasm2wat，binaryen 编号由 --generate-names 决定）
wasm2wat --generate-names wave-reference/20221030/client.wasm \
  -o build/wave/reference/client.wat

# 3. 查询函数、调用者、字符串
python3 tools/protocol/wat.py fn 988
python3 tools/protocol/wat.py callers 988
python3 tools/protocol/wat.py str 34440 32
```

`tools/protocol/wat.py` 的 `fn` 输出是压缩伪代码，`raw N` 输出原始 WAT 行范围，
`refs ADDR` 搜索立即数地址。所有行号均指 `build/wave/reference/client.wat`。

## 一句话结构

```
TCP/TLS → WebSocket 二进制帧
  └─ 外层变换（首字节置换 + 22 字节滚动 XOR）
      ├─ 0x00 错误/关闭原因：vu code + NUL message
      ├─ 0x01 世界/命令帧：vu epoch, vu tick, vu ack, 删除段, 实体*, 0, 分隔符, 命令*, 0
      │     └─ 内层 256 字节掩码（从实体段开始）
      ├─ 0x02 C→S ACK：vu epoch, vu tick
      ├─ 0x05 访客标识：vu epoch, 00 0e, NUL visitor id
      └─ 其他类型忽略
C→S 0x01 批次：vu epoch, (vu seq, vu opcode, fields)*   ← 同样有内层掩码
```
