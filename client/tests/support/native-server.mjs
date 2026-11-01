import { spawn } from 'node:child_process';
import path from 'node:path';

export async function startNativeServer(origin) {
  const process = spawn(path.resolve('build/native/server/server_browser_fixture'), [origin], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { process.kill('SIGKILL'); reject(new Error(`Native fixture startup timeout: ${output}`)); }, 10000);
    process.once('error', error => { clearTimeout(timer); reject(error); });
    process.once('exit', code => { clearTimeout(timer); reject(new Error(`Native fixture exited ${code}: ${output}`)); });
    process.stderr.on('data', bytes => { output += bytes; });
    process.stdout.on('data', bytes => { output += bytes; const match = output.match(/\{"port":(\d+)\}/); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
  });
  return { port, process, async close() {
    if (process.exitCode !== null || process.signalCode !== null) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { process.kill('SIGKILL'); reject(new Error('Native fixture did not drain')); }, 5000);
      process.once('exit', () => { clearTimeout(timer); resolve(); }); process.kill('SIGTERM');
    });
  } };
}
