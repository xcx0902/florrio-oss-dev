/** Enforce the original WASM call_indirect type at a JS/WASM boundary.
 * JS table.get(index)(...) alone would omit the original signature check.
 * The generated adapter is equivalent to this small, explicitly typed module:
 *
 * (module (type $target (func (param ...) (result ...)))
 *   (import "bridge" "table" (table 0 funcref))
 *   (func (export "invoke") (param $index i32) (param ...)
 *     local.get ... local.get $index call_indirect (type $target)))
 *
 * There is no recovered game payload here, only a standard typed-call adapter.
 */
const codes = { i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c };
const modules = new Map();
const instances = new WeakMap();
function unsignedLeb(value) {
  const bytes = [];
  do { const byte = value & 127; value >>>= 7; bytes.push(byte | (value ? 128 : 0)); } while (value);
  return bytes;
}
const string = value => {
  const bytes = new TextEncoder().encode(value);
  return [...unsignedLeb(bytes.length), ...bytes];
};
const section = (id, content) => [id, ...unsignedLeb(content.length), ...content];
const vector = values => [...unsignedLeb(values.length), ...values.flat()];
const functionType = (parameters, results) => [0x60, ...vector(parameters.map(type => [codes[type]])), ...vector(results.map(type => [codes[type]]))];

export function typedIndirectCall(table, { parameters, results = [] }, tableIndex, ...args) {
  if (![...parameters, ...results].every(type => Object.hasOwn(codes, type))) throw new Error('Unsupported indirect call type');
  const key = `${parameters.join(',')}->${results.join(',')}`;
  if (!modules.has(key)) {
    const instructions = [0]; // zero local declarations
    for (let parameter = 0; parameter < parameters.length; parameter++) instructions.push(0x20, ...unsignedLeb(parameter + 1));
    instructions.push(0x20, 0, 0x11, 0, 0, 0x0b);
    const bytes = [0, 97, 115, 109, 1, 0, 0, 0,
      ...section(1, vector([functionType(parameters, results), functionType(['i32', ...parameters], results)])),
      ...section(2, vector([[...string('bridge'), ...string('table'), 1, 0x70, 0, 0]])),
      ...section(3, vector([[1]])),
      ...section(7, vector([[...string('invoke'), 0, 0]])),
      ...section(10, vector([[...unsignedLeb(instructions.length), ...instructions]])),
    ];
    modules.set(key, new WebAssembly.Module(Uint8Array.from(bytes)));
  }
  let callers = instances.get(table);
  if (!callers) instances.set(table, callers = new Map());
  if (!callers.has(key)) callers.set(key, new WebAssembly.Instance(modules.get(key), { bridge: { table } }).exports.invoke);
  return callers.get(key)(tableIndex, ...args);
}
