/** Stable identities for compiler inputs and delivered file trees. */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unsupported file in build tree: ${path.join(directory, relative)}`);
  }
  return files.sort();
}
export async function fileEntries(root, files) {
  return Promise.all(files.map(async relative => {
    const bytes = await readFile(path.join(root, relative));
    return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
  }));
}
export async function engineInputs(root = '.') {
  const files = ['.emscripten-version', 'tools/build-engine-wasm.mjs', 'tools/lib/build-inputs.mjs'];
  for (const folder of ['engine/src', 'engine/include']) {
    files.push(...(await listFiles(path.join(root, folder))).map(relative => `${folder}/${relative}`));
  }
  const entries = await fileEntries(root, files.sort());
  return { sha256: sha256(JSON.stringify(entries)), files: entries.length };
}
