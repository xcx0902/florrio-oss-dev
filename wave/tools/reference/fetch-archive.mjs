import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const { values } = parseArgs({ options: { 'output-dir': { type: 'string' } } });
const output = path.resolve(
  values['output-dir'] ?? fileURLToPath(new URL('../../../reports/wave/W0/wiki/', import.meta.url)),
);
const manifest = JSON.parse(
  await readFile(new URL('../../web/resources-20221030.json', import.meta.url), 'utf8'),
);
const hash = (body) => createHash('sha256').update(body).digest('hex');
const curl = promisify(execFile);
await mkdir(output, { recursive: true });
await Promise.all(
  manifest.archive.map(async ({ file, source, bytes, sha256 }) => {
    const destination = path.join(output, file);
    const cached = await readFile(destination).catch((error) => {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
    if (cached?.length === bytes && hash(cached) === sha256) {
      return;
    }
    const { stdout } = await curl(
      'curl',
      [
        '--fail',
        '--silent',
        '--show-error',
        '--compressed',
        '--location',
        '--max-time',
        '60',
        source,
      ],
      { encoding: 'buffer' },
    );
    assert.equal(stdout.length, bytes, `${file} byte count`);
    assert.equal(hash(stdout), sha256, `${file} SHA-256`);
    await writeFile(destination, stdout);
  }),
);
console.log(`Verified ${manifest.archive.length} archived resources in ${output}`);
