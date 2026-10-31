/** Shared subprocess lifecycle: real status, process-group cancellation and timeout. */
import { spawn } from 'node:child_process';
export function startProcess(command, args = [], { env = process.env, cwd = process.cwd(), stdio = 'inherit', timeoutMs = 600000, detached = true } = {}) {
  const grouped = detached && process.platform !== 'win32';
  const child = spawn(command, args, { env, cwd, stdio, detached: grouped });
  let cancelled, timer;
  const stop = (signal = 'SIGTERM') => {
    cancelled = signal;
    if (grouped && child.pid) {
      try { process.kill(-child.pid, signal); return; } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    child.kill(signal);
  };
  const done = new Promise(resolve => {
    let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ...result, exitCode: cancelled ? 1 : result.exitCode, cancelled: cancelled ?? null }); };
    child.once('error', error => finish({ exitCode: 1, error: error.message }));
    child.once('close', (code, signal) => finish({ exitCode: signal ? 1 : code ?? 1, signal }));
    if (timeoutMs > 0) timer = setTimeout(() => { stop('SIGKILL'); }, timeoutMs);
  });
  return { child, stop, done };
}
export async function runProcess(command, args, options) {
  const run = startProcess(command, args, options);
  const interrupt = () => run.stop('SIGINT'), terminate = () => run.stop('SIGTERM');
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try { return await run.done; } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); }
}
