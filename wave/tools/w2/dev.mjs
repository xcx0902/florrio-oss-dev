import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { defaultNative, root, startHost } from './host.mjs';

const { values } = parseArgs({
  options: {
    snapshot: { type: 'string', default: process.env.WAVE_SNAPSHOT },
    'native-dir': { type: 'string', default: process.env.WAVE_NATIVE_DIR ?? defaultNative },
    port: { type: 'string', default: '8478' },
    database: {
      type: 'string',
      default: process.env.WAVE_DATABASE ?? path.join(defaultNative, '../saves/profiles.sqlite3'),
    },
  },
});
await mkdir(path.dirname(path.resolve(values.database)), { recursive: true });
execFileSync('cmake', ['-S', root, '-B', values['native-dir']], { stdio: 'inherit' });
execFileSync(
  'cmake',
  ['--build', values['native-dir'], '--target', 'wave_host_dev', '--parallel'],
  {
    stdio: 'inherit',
  },
);
const host = await startHost({
  snapshot: values.snapshot,
  nativeDir: values['native-dir'],
  port: values.port,
  database: values.database,
  development: true,
});
const stop = () => host.stop();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
console.log(host.url);
try {
  const [code] = await host.exit;
  process.exitCode = code ?? 0;
} finally {
  await stop();
}
