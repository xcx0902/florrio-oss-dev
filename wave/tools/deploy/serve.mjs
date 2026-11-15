import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { defaultNative, root, startHost } from '../w2/host.mjs';

const preview = path.resolve(root, '../build/wave/preview');
const { values } = parseArgs({
  options: {
    snapshot: { type: 'string', default: process.env.WAVE_SNAPSHOT },
    'native-dir': { type: 'string', default: process.env.WAVE_NATIVE_DIR ?? defaultNative },
    port: { type: 'string', default: '8480' },
    database: {
      type: 'string',
      default: process.env.WAVE_DATABASE ?? path.join(preview, 'saves/profiles.sqlite3'),
    },
    'web-root': { type: 'string', default: path.join(preview, 'web') },
    origins: { type: 'string', default: process.env.WAVE_ALLOWED_ORIGINS ?? '' },
    'assemble-only': { type: 'boolean', default: false },
    rotation: { type: 'string', default: process.env.WAVE_ROTATION ?? 'desert' },
  },
});
await mkdir(path.dirname(path.resolve(values.database)), { recursive: true });
const host = await startHost({
  snapshot: values.snapshot,
  nativeDir: values['native-dir'],
  port: values.port,
  database: values.database,
  rotation: values.rotation,
  webRoot: values['web-root'],
  environment: { WAVE_ALLOWED_ORIGINS: values.origins },
  assembleOnly: values['assemble-only'],
});
if (values['assemble-only']) {
  console.log(host.directory);
  process.exit(0);
}
process.once('SIGINT', () => void host.stop());
process.once('SIGTERM', () => void host.stop());
console.log(host.url);
const [code] = await host.exit;
process.exitCode = code ?? 0;
