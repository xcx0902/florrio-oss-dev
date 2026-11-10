# tools/protocol

只读分析 `wave-reference/20221030/client.wasm` 的小工具。所有行号均指
`build/wave/reference/client.wat`（wabt 输出）。

## 准备

```bash
# 从原始 wasm 生成 WAT（仓库里的 build/ 是生成物，不入库）
wasm2wat --enable-all wave-reference/20221030/client.wasm -o build/wave/reference/client.wat
```

## `wat.py`

按函数号查看/检索。

```bash
python3 tools/protocol/wat.py fn 601            # 函数体（带缩进和 l$N 别名）
python3 tools/protocol/wat.py raw 601           # 原始 WAT
python3 tools/protocol/wat.py callers 589       # 直接调用者
python3 tools/protocol/wat.py strings 601       # 引用的数据段字符串
```

函数号是 Binaryen 的 `$N`；浏览器帧号 = `$N + 358`。

## `wtree.py`

带行号的 AST 查看器，用于定位“这一行属于哪个 if/loop”。

```bash
python3 tools/protocol/wtree.py at 1144867 --up 2   # 所在函数/块链 + 子树
python3 tools/protocol/wtree.py func 601 406940 407760  # 渲染某行范围
```

## `memops.py`

全模块内存访问普查，输出 `build/wave/analysis/memops.jsonl`（约 17.5 万条）。

```bash
python3 tools/protocol/memops.py build
python3 tools/protocol/memops.py q load 3088 8      # 立即数 offset=3088、宽 8 的 load
python3 tools/protocol/memops.py q store 6688 12
python3 tools/protocol/memops.py base 22172         # 基址表达式含 22172 的访问
```

记录格式：

```json
{"fn":601,"op":"i32.load8_u","width":"u8","offset":288,"base":"l$15","value":"","kind":"load"}
```

注意：`offset` 是**指令立即数**，不含基址表达式里的常量。例如
`*(u8*)(world + 3088 + i)` 会记成 `offset=0, base="world + 3088 + i"`。
否定性结论必须同时查 `q` 和 `base`。

## 审计工作流

1. 在 `client.wat` 里找组件门控（`$601` 的 `and 8/16/...`）。
2. 用 `wtree.py at <gate>` 确认所在块和 store 目标。
3. 用 `memops.py q load <offset> <width>` 找读者；用 `base` 找带基址常量的读者。
4. 对“无读者”结论，再查析构函数（`$452/$587/$989/$153`）和函数表间接调用。
5. 把结论写进 `wave/docs/protocol/09-field-audit.md`，标注 R/P/W/U。
6. 运行 `python3 tools/protocol/coverage.py --check`，确认 04/09/README 的
   24 个掩码位等级一致；不一致时退出码为 1。
