import { parseArgs } from 'node:util';
import { defaultNative, startHost } from './host.mjs';

const { values } = parseArgs({
  options: {
    snapshot: { type: 'string', default: process.env.WAVE_SNAPSHOT },
    'native-dir': { type: 'string', default: process.env.WAVE_NATIVE_DIR ?? defaultNative },
    port: { type: 'string', default: '8478' },
  },
});
const host = await startHost({
  snapshot: values.snapshot,
  nativeDir: values['native-dir'],
  port: values.port,
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
