import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_PATTERNS,
  codeLines,
  compare,
  scan,
  structuralViolations,
} from '../../tools/check-refactor.mjs';

function counts(text) {
  const result = {};
  for (const [id, pattern] of Object.entries(LEGACY_PATTERNS)) {
    result[id] = text.match(pattern.regex)?.length ?? 0;
  }
  return result;
}

test('legacy patterns match the representations they own', () => {
  const text = [
    'callback 74 and attack_callback',
    'entity + 184 and constructor: -27',
    'opaque5 flags92 orbitFunctionIndex kDenseFieldsMinus16',
    'fields[26] and field60',
    'type_id == 26 and species === 9',
    'func587 and original function 1099',
    '[[maybe_unused]] eslint-disable clang-format off',
  ].join('\n');
  assert.deepEqual(counts(text), {
    'function-number': 2,
    'callback-number': 2,
    'memory-offset': 2,
    'unknown-field': 4,
    'numbered-snapshot-field': 2,
    'bare-business-id': 2,
    'kept-alive': 3,
  });
});

test('structural scanning ignores comments, strings and C++ lambdas', () => {
  const source = [
    'if (ready) { run(); } // trailing ; comment',
    'const text = "a;b";',
    'std::erase_if(items, [](const Item& item) { return item.empty(); });',
    'for (auto it = items.begin(); it != items.end();) { ++it; }',
    '',
  ].join('\n');
  const lines = codeLines(source, 'cpp');
  assert.equal(lines[0].includes('comment'), false);
  assert.equal(lines[1].includes('a;b'), false);
  assert.deepEqual(structuralViolations('sample.cpp', source), []);
});

test('structural scanning reports tabs, trailing whitespace, CRLF and missing newline', () => {
  assert.deepEqual(structuralViolations('sample.cpp', 'if (x) {\n\ty();\n}\n'), [
    { rule: 'tab', file: 'sample.cpp', line: 2 },
  ]);
  assert.deepEqual(structuralViolations('sample.cpp', 'x = 1; \n'), [
    { rule: 'trailing-whitespace', file: 'sample.cpp', line: 1 },
  ]);
  assert.deepEqual(structuralViolations('sample.cpp', 'x = 1;\r\n'), [
    { rule: 'crlf', file: 'sample.cpp', line: 1 },
  ]);
  assert.deepEqual(structuralViolations('sample.cpp', 'x = 1;'), [
    { rule: 'final-newline', file: 'sample.cpp', line: 1 },
  ]);
});

test('baseline comparison rejects new occurrences and stale entries', () => {
  const baseline = {
    patterns: {
      'bare-business-id': { 'engine/a.cpp': 2 },
      'kept-alive': { 'engine/b.cpp': 1 },
    },
  };
  const same = compare(
    {
      patterns: {
        'bare-business-id': { 'engine/a.cpp': 2 },
        'kept-alive': { 'engine/b.cpp': 1 },
      },
    },
    baseline,
  );
  assert.deepEqual(same, { errors: [], reductions: [] });

  const raised = compare({ patterns: { 'bare-business-id': { 'engine/a.cpp': 3 } } }, baseline);
  assert.match(raised.errors[0], /has 3 occurrence/);
  assert.deepEqual(raised.reductions, [
    'kept-alive: engine/b.cpp 1 -> 0; lower the baseline entry',
  ]);

  const unknown = compare({ patterns: {} }, { patterns: { forgotten: {} } });
  assert.match(unknown.errors[0], /unknown pattern forgotten/);
});

test('the checked-in ledger covers only known patterns and real files', () => {
  const actual = scan();
  assert.equal(actual.structural.length, 0);
  for (const [id, files] of Object.entries(actual.patterns)) {
    assert.ok(LEGACY_PATTERNS[id], `unknown pattern ${id}`);
    assert.ok(Object.keys(files).length > 0, `${id} has no files`);
  }
  assert.equal(actual.scanned > 400, true);
});
