import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { checkDispatch } from '../../../tools/reference/glue.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const watPath = process.argv[2];
assert(watPath, 'Usage: node index-asm.mjs /path/to/Binaryen-132-client.wat [output.json]');
const output = process.argv[3] ?? path.resolve(root, 'wave/docs/client-ui/evidence/asm-index.json');
const [source, binary, wat] = await Promise.all([
  readFile(path.resolve(root, 'wave-reference/20221030/client.js'), 'utf8'),
  readFile(path.resolve(root, 'wave-reference/20221030/client.wasm')),
  readFile(watPath, 'utf8'),
]);
assert.equal(digest(binary), '68094577a0ac1254fcffedbb46c0181d90893bd063e3eafa76489bba2776e7b0');
assert.equal(digest(source), '23c51f12ec4f31b66e4796d799ac944c05b60114cb84ba58e354ed1c53ab4dc0');
assert.equal(
  digest(wat),
  '235c18e162e92ed0d8407814da325ca3aecc00cb40fccd0ab221db008743e3dd',
  'Generate a fresh WAT from the pinned Wasm using Binaryen 132.0.0 wasm-dis',
);
const file = ts.createSourceFile(
  'client.js',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
let table;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'Kb') {
    assert.equal(table, undefined);
    table = node.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert(table && ts.isObjectLiteralExpression(table));
const entries = table.properties.map((property) => {
  assert(ts.isPropertyAssignment(property) && ts.isNumericLiteral(property.name));
  const start = property.initializer.getStart(file);
  const body = source.slice(start, property.initializer.end);
  return {
    asm: Number(property.name.text),
    jsByteOffset: Buffer.byteLength(source.slice(0, start)),
    jsBytes: Buffer.byteLength(body),
    source: body,
    watConstReferences: [],
  };
});
assert.equal(entries.length, 153);
const byKey = new Map(entries.map((entry) => [entry.asm, entry]));
assert.equal(byKey.size, 153);
let fn;
let line = 0;
for (const text of wat.split('\n')) {
  line++;
  const definition = text.match(/^ \(func \$(\d+)\b/);
  if (definition) {
    fn = Number(definition[1]);
  }
  for (const match of text.matchAll(/\(i32.const (\d+)\)/g)) {
    const entry = byKey.get(Number(match[1]));
    if (entry) {
      assert(fn !== undefined);
      entry.watConstReferences.push({ function: '$' + fn, line });
    }
  }
}
const dispatch = checkDispatch(wat, source);
const constReferences = entries.reduce((sum, entry) => sum + entry.watConstReferences.length, 0);
assert.equal(constReferences, 3381);
assert(entries.every((entry) => entry.watConstReferences.length > 0));
const report = {
  schema: 1,
  wasmSha256: digest(binary),
  jsSha256: digest(source),
  watSha256: digest(wat),
  disassembler: 'Binaryen 132.0.0 wasm-dis',
  note: 'watConstReferences are syntactic i32.const references, not proof of executed calls or screen visibility. All line numbers refer to fresh Binaryen 132 disassembly.',
  keys: entries.length,
  directLiteralDispatchKeys: dispatch.count,
  directLiteralDispatchCalls: dispatch.calls,
  constReferences,
  entries,
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(
  `${entries.length} bridge keys; ${dispatch.count} direct keys / ${dispatch.calls} direct calls; ${constReferences} constant references: ${output}\n`,
);
