import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const project = path.resolve(root, '..');
export const defaultNative = path.join(project, 'build/wave/native');
const web = path.join(root, 'web');

export async function startHost({ snapshot, nativeDir, port, fixture = false }) {
  assert.ok(snapshot, 'Pass --snapshot or set WAVE_SNAPSHOT');
  const manifest = JSON.parse(await readFile(path.join(web, 'resources-20221030.json')));
  const resources = await Promise.all(
    manifest.snapshot.map(async ({ file, bytes, sha256 }) => {
      const body = await readFile(path.join(snapshot, file));
      assert.equal(body.length, bytes, `${file} byte count`);
      assert.equal(createHash('sha256').update(body).digest('hex'), sha256, `${file} SHA-256`);
      return { file, body };
    }),
  );

  const directory = await mkdtemp(path.join(tmpdir(), 'florrio-wave-'));
  let child;
  let cleanup;
  function stop() {
    cleanup ??= (async () => {
      try {
        if (child?.pid && child.exitCode === null && child.signalCode === null) {
          const closed = once(child, 'close');
          child.kill();
          await closed;
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    })();
    return cleanup;
  }
  try {
    const html = await readFile(path.join(web, 'index.html'), 'utf8');
    const client = '<script src="client.js"></script>';
    assert.ok(html.includes(client), 'Original script tag is missing');
    resources.push(
      {
        file: 'index.html',
        body: html.replace(client, `<script src="local.js"></script>\n    ${client}`),
      },
      { file: 'reference.css', body: await readFile(path.join(web, 'reference.css')) },
      { file: 'local.js', body: await readFile(path.join(web, 'local.js')) },
    );
    await Promise.all(
      resources.map(({ file, body }) => writeFile(path.join(directory, file), body)),
    );
    child = spawn(
      path.resolve(nativeDir, fixture ? 'wave_host_fixture' : 'wave_host'),
      [directory, String(port)],
      {
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
    const lines = createInterface({ input: child.stdout });
    const exit = once(child, 'close');
    const url = await Promise.race([
      once(lines, 'line').then(([line]) => line),
      exit.then(([code]) => {
        throw new Error(`Native Wave host stopped before listening (exit ${code})`);
      }),
    ]);
    lines.close();
    assert.match(url, /^http:\/\/localhost:\d+\/$/);
    return { url, exit, stop, snapshot: manifest.snapshot };
  } catch (error) {
    await stop();
    throw error;
  }
}
