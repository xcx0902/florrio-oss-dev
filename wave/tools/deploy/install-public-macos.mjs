import { chmod, cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const stage = await mkdtemp('/private/tmp/florriowave-preview-install-');
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
try {
  for (const relative of [
    'build/wave/preview/bin/caddy',
    'wave/deploy/Caddyfile',
    'wave/tools/deploy/install-caddy-macos.sh',
    'wave/tools/deploy/run-caddy-macos.sh',
  ]) {
    const target = path.join(stage, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(repo, relative), target);
  }
  await chmod(stage, 0o755);
  const command =
    '/bin/bash ' +
    quote(path.join(stage, 'wave/tools/deploy/install-caddy-macos.sh')) +
    ' ' +
    quote(stage) +
    ' ' +
    quote(
      path.join(
        homedir(),
        'Library/Application Support/FlorrioWavePreview/secrets/cloudflare-token',
      ),
    );
  const script =
    'with timeout of 600 seconds\n do shell script ' +
    JSON.stringify(command) +
    ' with administrator privileges\nend timeout';
  const child = spawn('/usr/bin/osascript', ['-e', script], { stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  process.exitCode = code ?? 1;
} finally {
  await rm(stage, { recursive: true, force: true });
}
