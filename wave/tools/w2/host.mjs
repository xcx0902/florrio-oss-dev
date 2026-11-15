import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const project = path.resolve(root, '..');
export const defaultNative = path.join(project, 'build/wave/native');
const web = path.join(root, 'web');

export async function startHost({
  snapshot,
  nativeDir,
  port,
  fixture = false,
  database,
  craftRoll,
  development = false,
  rotation = 'desert',
  webRoot,
  environment = {},
  assembleOnly = false,
}) {
  assert.ok(['desert', 'ocean'].includes(rotation), 'Rotation must be desert or ocean');
  assert.ok(!(fixture && development), 'Development and fixture hosts are separate');
  assert.ok(snapshot, 'Pass --snapshot or set WAVE_SNAPSHOT');
  const manifest = JSON.parse(await readFile(path.join(web, 'resources-20221030.json')));
  const resources = await Promise.all(
    manifest.snapshot.map(async ({ file, bytes, sha256 }) => {
      const body = await readFile(path.join(snapshot, file));
      assert.equal(body.length, bytes, `${file} byte count`);
      assert.equal(createHash('sha256').update(body).digest('hex'), sha256, `${file} SHA-256`);
      if (file === 'client.js') {
        // The pinned client only starts its offline mode for localhost. Scope
        // this adaptation to that one Wasm hostname import; real page URLs,
        // discovery, assets and sockets keep their deployed origin.
        const source = body.toString('utf8');
        const hostname = '146708:()=>K(location.hostname)';
        assert.equal(source.split(hostname).length, 2, 'Pinned hostname import is unique');
        return { file, body: source.replace(hostname, '146708:()=>K("localhost")') };
      }
      return { file, body };
    }),
  );

  const directory = webRoot
    ? path.resolve(webRoot)
    : await mkdtemp(path.join(tmpdir(), 'florrio-wave-'));
  await mkdir(directory, { recursive: true });
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
        if (!webRoot) {
          await rm(directory, { recursive: true, force: true });
        }
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
        body: html.replace(
          client,
          `<script src="local.js"></script>${development ? '\n    <link rel="stylesheet" href="dev-inventory.css" /><script src="dev-inventory.js"></script>' : ''}`,
        ),
      },
      { file: 'reference.css', body: await readFile(path.join(web, 'reference.css')) },
      { file: 'local.js', body: await readFile(path.join(web, 'local.js')) },
      ...(development
        ? await Promise.all(
            ['dev-inventory.js', 'dev-inventory.css'].map(async (file) => ({
              file,
              body: await readFile(path.join(web, file)),
            })),
          )
        : []),
      { file: 'ubuntu-LICENCE.txt', body: await readFile(path.join(web, 'ubuntu-LICENCE.txt')) },
      ...(await Promise.all(
        manifest.archive
          .filter(({ role }) => role === 'archived-font' || role === 'archived-font-css')
          .map(async ({ file, role, bytes, sha256 }) => {
            const body = await readFile(path.join(web, file));
            if (role === 'archived-font') {
              assert.equal(body.length, bytes, `${file} byte count`);
              assert.equal(
                createHash('sha256').update(body).digest('hex'),
                sha256,
                `${file} SHA-256`,
              );
            }
            return { file, body };
          }),
      )),
    );
    await Promise.all(
      resources.map(({ file, body }) => writeFile(path.join(directory, file), body)),
    );
    if (assembleOnly) {
      assert.ok(webRoot, 'Assembly without a host requires an explicit persistent web root');
      return { directory, snapshot: manifest.snapshot };
    }
    child = spawn(
      path.resolve(
        nativeDir,
        development ? 'wave_host_dev' : fixture ? 'wave_host_fixture' : 'wave_host',
      ),
      [
        directory,
        String(port),
        ...(database ? [path.resolve(database)] : []),
        ...(craftRoll !== undefined ? [String(craftRoll)] : []),
      ],
      {
        stdio: ['ignore', 'pipe', 'inherit'],
        env: { ...process.env, ...environment, WAVE_ROTATION: rotation },
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
