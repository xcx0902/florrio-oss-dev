/** Stable identities for compiler inputs and delivered file trees. */
import { createHash } from 'node:crypto';
import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue;
    }
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Unsupported file in build tree: ${path.join(directory, relative)}`);
    }
  }
  return files.sort();
}
export async function fileEntries(root, files) {
  return Promise.all(
    files.map(async (relative) => {
      const bytes = await readFile(path.join(root, relative));
      return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
    }),
  );
}
export async function treeIdentity(root, entries, { exclude = () => false } = {}) {
  root = await realpath(root);
  const files = {};
  async function visit(relative) {
    if (exclude(relative)) {
      return;
    }
    const absolute = path.join(root, relative);
    let info;
    try {
      info = await lstat(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') {
        files[relative] = null;
        return;
      }
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`Unsupported evidence symlink: ${relative}`);
    }
    if (info.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) {
        if (name === '.DS_Store') {
          continue;
        }
        await visit(path.posix.join(relative, name));
      }
    } else if (info.isFile()) {
      files[relative] = sha256(await readFile(absolute));
    } else {
      throw new Error(`Unsupported evidence file: ${relative}`);
    }
  }
  for (const entry of [...entries].sort()) {
    await visit(entry);
  }
  return {
    schema: 'file-tree-v1',
    sha256: sha256(JSON.stringify({ schema: 'file-tree-v1', files })),
    files,
  };
}

export const FORMAT_ENTRIES = [
  '.editorconfig',
  '.clang-format',
  '.cmake-format.yaml',
  '.prettierrc.json',
  '.prettierignore',
  'eslint.config.mjs',
  'tools/format-tools.lock.json',
  'tools/lib/format-tools.mjs',
];
export const BUILD_ENTRIES = [
  ...FORMAT_ENTRIES,
  'engine/src',
  'engine/include',
  'engine/CMakeLists.txt',
  'engine/sources.cmake',
  'engine/abi-exports.json',
  'client/src',
  'client/static',
  'client/tsconfig.json',
  'schema',
  'tools/schema',
  'tools/generate.mjs',
  'tools/build-client.mjs',
  'tools/build-engine-wasm.mjs',
  'tools/build-dist-next.mjs',
  'tools/lib/identity.mjs',
  'tools/lib/build-inputs.mjs',
  'tools/lib/build-validation.mjs',
  'tools/lib/delivery.mjs',
  'CHANGELOG.md',
  '.emscripten-version',
  'package.json',
  'package-lock.json',
];
export async function buildInputs(root = process.cwd()) {
  return {
    ...(await treeIdentity(root, BUILD_ENTRIES, {
      exclude: (p) => p === 'client/src/dev/test-api.ts',
    })),
    schema: 'product-build-v1',
  };
}
export async function verificationInputs(root = process.cwd()) {
  return {
    ...(await treeIdentity(root, [
      ...BUILD_ENTRIES,
      ...NATIVE_BUILD_ENTRIES,
      'server/tests',
      'engine/tests',
      'client/tests',
      'tests',
      'tools',
      '.chromium-version',
      'serve.mjs',
    ])),
    schema: 'product-verification-v1',
  };
}
export const NATIVE_BUILD_ENTRIES = [
  ...FORMAT_ENTRIES,
  'CMakeLists.txt',
  'cmake',
  'server/CMakeLists.txt',
  'server/sources.cmake',
  'server/config',
  'server/deploy',
  'server/include',
  'server/src',
  'engine/CMakeLists.txt',
  'engine/sources.cmake',
  'engine/src',
  'engine/include',
  'schema',
  'tools/schema',
  'tools/generate.mjs',
  'tools/build-server.mjs',
  'tools/lib/identity.mjs',
  'package.json',
  'package-lock.json',
];
export async function nativeInputs(root = process.cwd()) {
  return { ...(await treeIdentity(root, NATIVE_BUILD_ENTRIES)), schema: 'native-build-v1' };
}
export async function engineInputs(root = process.cwd()) {
  const identity = await treeIdentity(root, [
    'engine/src',
    'engine/include',
    'engine/CMakeLists.txt',
    'engine/sources.cmake',
    'engine/abi-exports.json',
    '.emscripten-version',
    'tools/build-engine-wasm.mjs',
  ]);
  return {
    schema: 'engine-build-v1',
    sha256: identity.sha256,
    files: Object.keys(identity.files).length,
  };
}
