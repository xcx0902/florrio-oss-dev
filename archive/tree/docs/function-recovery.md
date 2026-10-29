# 函数语义恢复工作手册

本文件说明如何把一个仍以机器码形式保留的 WASM 函数，恢复成可读、行为等价的
JavaScript 语义实现，并用**只针对该函数**的 oracle 差分测试验证。不要运行全量
`npm test`（很慢且占满 CPU），只运行你负责的单个测试文件。

## 1. 找到函数

- 函数清单：`reports/remaining-functions.json`，`modules.client.functions[]` /
  `modules.server.functions[]` 中每个条目含 `id`、`watLine`、`instructions`、
  `directCalls`、`ifs`、`loads`、`stores` 等。
- 原始 WAT：`source/wasm/client.wat` / `source/wasm/sp_server.wat`。
  从 `watLine` 开始读，函数以 `(func $function_<id> ...)` 开头，到与之匹配的
  `)` 结束。参数是 `(param $p0 i32)` 等，局部变量是 `(local $l1 i32)`。
- 反编译视图（伪代码，仅供交叉参考，不是权威）：
  `source/decompiled/client/functions-XXXX-YYYY.dcmp`。

## 2. 写实现模块

在 `source/game/<client|server>/<name>.mjs` 新建模块：

```js
/** Recovered <client|server> <what> (<n> originals).
 * <语义说明：这些函数在 C++ 里做什么>
 * WAT SHA-256: d186265b...（client）/ <server wat sha>。
 */
export const functionIds = Object.freeze([...]);

export function createXxxHooks(runtime) {
  const hooks = {};
  hooks[123] = (a, b) => { /* 可读语义实现 */ };
  return Object.freeze(hooks);
}
```

规则：

1. **写语义，不要写“模拟内存读写”的流水账。** 用有名字的变量、结构体式访问器
   （`readUint32(address)`、`record.field`）、循环和分支表达原逻辑；固定地址的全局
   量要命名并注释其用途（如 `const SPAWN_TABLE = 7937840`）。像素/字符串/数学函数
   用 `for`、`Math.fround`、`TextDecoder` 等高层写法，而不是逐条复制 wasm 指令。
2. 需要调用尚未恢复的原函数时，用 `runtime.call(id, ...args)`；虚表/函数指针调用
   用 `runtime.indirect({parameters, results}, tableIndex, ...args)`。
3. 需要保持的机器级行为：整数回绕（`|0`、`>>>0`）、`Math.fround` 的 f32 精度、
   越界访问陷阱（DataView 抛 `RangeError` 时转成
   `throw new WebAssembly.RuntimeError('memory access out of bounds')`）、
   `unreachable` 陷阱、除零陷阱。语义等价包括这些陷阱路径。
4. 函数返回 `undefined` 时不要写 `return undefined`，直接结束即可；i64 用 BigInt。
5. 不要改动 `source/runtime/registry.mjs`、`README.md`、`reports/`；集成由主代理完成。

## 3. 写测试（必须）

测试文件 `test/<client|server>-<name>.test.mjs`，用
`test/helpers/oracle-harness.mjs` 的 `compareCases`，它在两个全新实例中分别运行
原函数与你的实现，比较返回值位模式、陷阱类型、栈指针和整块内存的 SHA-256
（栈帧窗口除外，因为高层实现不复制 spill 槽）。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCases } from './helpers/oracle-harness.mjs';
import { createXxxHooks, functionIds } from '../source/game/client/<name>.mjs';

test('...', async () => {
  const cases = [];
  for (const id of functionIds) {
    cases.push({ id, args: [0, 0], label: `${id} null` });
    cases.push({ id, args: [0, 4096], prepare: runtime => {
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(4096, 0x11223344, true); // 构造真实前置数据
    }, label: `${id} fixture` });
  }
  const { comparisons, failures } = await compareCases({
    module: 'client', functionIds, factory: createXxxHooks, cases,
  });
  assert.equal(comparisons, cases.length);
  assert.deepEqual(failures, []);
});
```

要求：

- 覆盖：正常输入、边界值（0、-1、最大/最小值）、每个分支、以及至少一个会让原函数
  陷阱的输入（若原函数可能陷阱）。参数含指针时，`prepare` 要在两个实例里写入同样的
  夹具数据，并让指针指向合法内存。
- 每个函数至少 2 个 case；家族成员逐一覆盖。
- 只运行：`node --test test/client-<name>.test.mjs`。
- 测试必须**真的失败过**（例如先故意写错再改对，或至少验证过 harness 能发现差异），
  以证明断言有效。

## 4. 交付

返回：模块路径、覆盖的函数 id、测试命令与结果（pass/fail 数）、每个函数的语义一句话
说明、以及你判断仍不确定/应保持原生的点。不要修改其它文件。
