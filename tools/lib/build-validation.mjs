/** Check compiled output against current TypeScript/C++ inputs without writing. */
import ts from 'typescript';
import path from 'node:path';
import { readFile, lstat } from 'node:fs/promises';
import { engineInputs, sha256 } from './build-inputs.mjs';

export async function validateBuild(root = '.') {
  root = path.resolve(root);
  const issues = [];
  const configPath = path.join(root, 'client/tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return { issues: ['Cannot read client tsconfig'], engineBuild: null };
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const pending = [];
  const emit = program.emit(undefined, (file, text) => {
    pending.push((async () => {
      try {
        const actual = await readFile(file, 'utf8');
        if (actual !== text) issues.push(`stale TypeScript output ${path.relative(root, file)}`);
      } catch { issues.push(`missing TypeScript output ${path.relative(root, file)}`); }
    })());
  });
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program), ...emit.diagnostics];
  if (diagnostics.length || emit.emitSkipped) issues.push(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }) || 'TypeScript emit skipped');
  await Promise.all(pending);
  let engineBuild = null;
  try {
    const output = path.join(root, 'client/public/server.wasm');
    if (await lstat(output + '.lock').then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }))
      issues.push('engine wasm build is still in progress');
    engineBuild = JSON.parse(await readFile(output + '.build.json', 'utf8'));
    const bytes = await readFile(output);
    if (!WebAssembly.validate(bytes)) issues.push('invalid engine wasm module');
    if (sha256(bytes) !== engineBuild.sha256) issues.push('wasm differs from compiler build record');
    const expected = await engineInputs(root);
    if (expected.sha256 !== engineBuild.inputs?.sha256) issues.push('wasm was compiled from different C++ inputs');
  } catch { issues.push('missing or invalid engine compiler build record; rebuild engine wasm'); }
  return { issues: issues.sort(), engineBuild };
}
