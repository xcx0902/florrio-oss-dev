#!/usr/bin/env node
/**
 * Structural and historical-representation rules for the current product.
 *
 * The checked-in baseline records debt that later phases (P2-P6) remove. It
 * fails closed on new occurrences: every extra hit is an error, and every
 * pattern must eventually return to zero (P7 requires an empty ledger).
 *
 *   node tools/check-refactor.mjs
 *   node tools/check-refactor.mjs --update-baseline
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRODUCT_ROOT } from './lib/format-tools.mjs';

const BASELINE = 'tools/refactor/legacy-baseline.json';
const BASELINE_NOTE =
  'Known legacy occurrences at the P1 formatting baseline. Later phases must reduce them; P7 requires an empty ledger. Never raise an entry to hide new code.';
const IGNORED_DIRECTORIES = new Set([
  'archive',
  'node_modules',
  'build',
  'dist-next',
  'dist-multiplayer',
  'reports',
  'release',
  '.emcache',
  '.vscode',
  '.git',
  'public',
]);
const SCANNED_EXTENSIONS = new Set([
  '.cpp',
  '.hpp',
  '.h',
  '.inc',
  '.ts',
  '.mjs',
  '.js',
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.cmake',
]);

/** Legacy representations and the phase that owns their removal. */
export const LEGACY_PATTERNS = Object.freeze({
  'function-number': {
    description: 'References to original implementation function numbers.',
    phase: 'P6',
    regex:
      /\bfunc(?:tion)?[\s_-]*\d{3,}\b|原(?:版)?\s*函数\s*\d+|\boriginal\s+(?:function|callback)\s+\d+/gi,
  },
  'callback-number': {
    description: 'Original AI callback numbers and callback-id fields.',
    phase: 'P3',
    regex: /\battack_callback\b|\bAttackCallback\b|\bcallback\s+74\b/g,
  },
  'memory-offset': {
    description: 'Historical struct/memory offsets used as field identity.',
    phase: 'P4',
    regex:
      /\b(?:AI|entity|transform|physics|render|effects|origin|avatar|loadout|loot|pickup|world)\s*\+\s*\d+|\b(?:offset|constructor):\s*-?\d+/gi,
  },
  'unknown-field': {
    description: 'Unknown numbered fields and offset-based component keys.',
    phase: 'P4',
    regex:
      /\bopaque\d+\b|\b(?:component_)?flags9[0-9]\b|\bphysicsFlag48\b|\borbitFunctionIndex\b|\bkDenseFieldsMinus16\b|\bOffset\d+\b|\bbyteArrayField\d+\b|\bcomponents\[[^\]]+\]\[[^\]]+\]/g,
  },
  'numbered-snapshot-field': {
    description: 'Protocol snapshot fields addressed by bare number.',
    phase: 'P4',
    regex: /\bfields?\s*\[\s*\d{1,2}\s*\]|\bfield\d{1,2}\b/g,
  },
  'bare-business-id': {
    description: 'Catalog identity or rarity compared as a raw number.',
    phase: 'P2',
    regex:
      /\b(?:type_id|typeId|species|petal_type_id|petalTypeId|rarity)\s*(?:==|===|!=|!==|>=|<=|>|<)\s*\d+/g,
  },
  'kept-alive': {
    description: 'Artificial keep-alive references and silent disable directives.',
    phase: 'P6',
    regex: /\[\[maybe_unused\]\]|eslint-disable|@ts-ignore|@ts-expect-error|clang-format off/g,
  },
});

function listFiles() {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: PRODUCT_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).split('\0');
  } catch {
    files = walk(PRODUCT_ROOT, '');
  }
  // Git still lists a deleted-but-unstaged file; only files on disk are scanned.
  return files.filter((file) => file && existsSync(path.join(PRODUCT_ROOT, file))).sort();
}

function walk(directory, prefix) {
  const entries = [];
  for (const entry of readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      entries.push(...walk(directory, prefix ? `${prefix}/${entry.name}` : entry.name));
    } else if (entry.isFile()) {
      entries.push(prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }
  return entries;
}

function isScanned(relative) {
  if (relative.startsWith('refactor-goals/')) {
    return false;
  }
  // The checker and its fixture contain the patterns by design.
  if (
    relative === BASELINE ||
    relative === 'tools/check-refactor.mjs' ||
    relative === 'tests/tools/refactor-rules.test.mjs'
  ) {
    return false;
  }
  if (relative.split('/').some((part) => IGNORED_DIRECTORIES.has(part))) {
    return false;
  }
  const name = path.posix.basename(relative);
  if (name === 'CMakeLists.txt' || name === 'package-lock.json') {
    return false;
  }
  return SCANNED_EXTENSIONS.has(path.posix.extname(relative));
}

/** Count regex matches per pattern and per file. */
function countPatterns(text) {
  const counts = {};
  for (const [id, pattern] of Object.entries(LEGACY_PATTERNS)) {
    const matches = text.match(pattern.regex);
    if (matches) {
      counts[id] = matches.length;
    }
  }
  return counts;
}

/** Remove comments and literals so structural scanning only sees code. */
export function codeLines(text, language) {
  const lines = [];
  let block = false;
  for (const raw of text.split('\n')) {
    let line = '';
    let index = 0;
    while (index < raw.length) {
      if (block) {
        const end = raw.indexOf('*/', index);
        if (end === -1) {
          break;
        }
        block = false;
        index = end + 2;
        continue;
      }
      if (raw.startsWith('//', index)) {
        break;
      }
      if (raw.startsWith('/*', index)) {
        block = true;
        index += 2;
        continue;
      }
      const quote = raw[index];
      if (quote === '"' || quote === "'" || (language === 'cpp' && quote === '`')) {
        const escaped = raw[index - 1] === '\\';
        if (escaped) {
          line += quote;
          index += 1;
          continue;
        }
        line += quote;
        index += 1;
        while (index < raw.length) {
          if (raw[index] === '\\') {
            index += 2;
            continue;
          }
          if (raw[index] === quote) {
            line += quote;
            index += 1;
            break;
          }
          index += 1;
        }
        continue;
      }
      line += raw[index];
      index += 1;
    }
    lines.push(line);
  }
  return lines;
}

export function structuralViolations(relative, text) {
  const extension = path.posix.extname(relative);
  const language = ['.cpp', '.hpp', '.h', '.inc'].includes(extension) ? 'cpp' : 'js';
  const violations = [];
  const rawLines = text.split('\n');
  const lines = codeLines(text, language);
  lines.forEach((line, index) => {
    const number = index + 1;
    if (line.includes('\t')) {
      violations.push({ rule: 'tab', file: relative, line: number });
    }
    if (extension !== '.md' && /[ \t]+$/.test(rawLines[index] ?? '')) {
      violations.push({ rule: 'trailing-whitespace', file: relative, line: number });
    }
    // C++ statement layout and braces are enforced by clang-format; a regex
    // cannot distinguish a semicolon inside a lambda or a for header from a
    // second statement, so those rules live in the formatter gate only.
  });
  if (text.includes('\r')) {
    violations.push({ rule: 'crlf', file: relative, line: 1 });
  }
  if (!text.endsWith('\n')) {
    violations.push({ rule: 'final-newline', file: relative, line: lines.length });
  }
  return violations;
}

export function scan() {
  const patterns = {};
  const structural = [];
  let scanned = 0;
  for (const relative of listFiles()) {
    if (!isScanned(relative)) {
      continue;
    }
    ++scanned;
    const text = readFileSync(path.join(PRODUCT_ROOT, relative), 'utf8');
    const counts = countPatterns(text);
    for (const [id, count] of Object.entries(counts)) {
      patterns[id] ??= {};
      patterns[id][relative] = count;
    }
    structural.push(...structuralViolations(relative, text));
  }
  for (const files of Object.values(patterns)) {
    for (const [file, count] of Object.entries(files)) {
      if (count === 0) {
        delete files[file];
      }
    }
  }
  return { scanned, patterns, structural };
}

function loadBaseline() {
  if (!existsSync(path.join(PRODUCT_ROOT, BASELINE))) {
    throw new Error(`missing ${BASELINE}; run with --update-baseline once and review the result`);
  }
  return JSON.parse(readFileSync(path.join(PRODUCT_ROOT, BASELINE), 'utf8'));
}

export function compare(actual, baseline) {
  const errors = [];
  const reductions = [];
  const ids = new Set([...Object.keys(actual.patterns), ...Object.keys(baseline.patterns ?? {})]);
  for (const id of ids) {
    if (!LEGACY_PATTERNS[id]) {
      errors.push(`baseline contains unknown pattern ${id}`);
      continue;
    }
    const files = actual.patterns[id] ?? {};
    const allowed = baseline.patterns?.[id] ?? {};
    for (const file of new Set([...Object.keys(files), ...Object.keys(allowed)])) {
      const count = files[file] ?? 0;
      const limit = allowed[file] ?? 0;
      if (count > limit) {
        errors.push(`${id}: ${file} has ${count} occurrence(s), baseline allows ${limit}`);
      } else if (count < limit) {
        reductions.push(`${id}: ${file} ${limit} -> ${count}; lower the baseline entry`);
      }
    }
  }
  return { errors, reductions };
}

export function main(argv = process.argv.slice(2)) {
  const update = argv.includes('--update-baseline');
  for (const arg of argv) {
    if (arg !== '--update-baseline') {
      throw new Error(`unknown option ${arg}`);
    }
  }

  const actual = scan();
  if (update) {
    const sorted = {};
    for (const id of Object.keys(LEGACY_PATTERNS).sort()) {
      const files = actual.patterns[id] ?? {};
      sorted[id] = Object.fromEntries(
        Object.entries(files)
          .filter(([, count]) => count > 0)
          .sort(([left], [right]) => left.localeCompare(right)),
      );
    }
    const baseline = {
      schema: 1,
      note: BASELINE_NOTE,
      scannedAt: new Date().toISOString().slice(0, 10),
      patterns: sorted,
    };
    mkdirSync(path.dirname(path.join(PRODUCT_ROOT, BASELINE)), { recursive: true });
    writeFileSync(path.join(PRODUCT_ROOT, BASELINE), `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(
      JSON.stringify({
        mode: 'baseline',
        scanned: actual.scanned,
        patterns: Object.keys(sorted).length,
      }),
    );
    return;
  }

  const baseline = loadBaseline();
  const { errors, reductions } = compare(actual, baseline);
  if (reductions.length) {
    errors.push(...reductions.map((entry) => `stale baseline: ${entry}`));
  }
  if (errors.length) {
    throw new Error(`refactor rules failed:\n${errors.join('\n')}`);
  }
  if (actual.structural.length) {
    throw new Error(
      `structural rules failed:\n${actual.structural
        .map((item) => `${item.rule}: ${item.file}:${item.line}`)
        .join('\n')}`,
    );
  }
  console.log(
    JSON.stringify({
      mode: 'check',
      scanned: actual.scanned,
      patterns: Object.keys(LEGACY_PATTERNS).length,
      reductions: 0,
      structural: 0,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
