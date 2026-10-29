# Release

The only release artifact is the independent `dist-next/` delivery tree. The
historical `dist/`, `dist-readable/` and `dist-reference/` trees are archived
and are not built, served or referenced by the product.

## Build

```sh
npm ci
npm run build:dist-next
npm run verify:dist-next
```

`build:dist-next` runs the engine wasm build, the TypeScript build and the
packaging step. It writes `dist-next/build-manifest.json` with every artifact
hash, the source identity and an explicit exclusion list. Packaging fails if the
delivery tree contains an archive path, recovered source, test tree, report or
unexpected file.

## Acceptance

```sh
npm run test:all
```

A release is eligible only when the runner exits 0 and
`reports/current-verification.json` has `passed: true` with every step recorded.
The runner builds, tests, packages and then verifies the packaged tree; it does
not reuse an older delivery.

Minimum evidence attached to a release:

- `reports/current-verification.json`;
- `reports/entrypoint-smoke.json` and its screenshots;
- the `sourceIdentity` from the delivery manifest;
- the exact Node, Emscripten and Chromium versions.

## Versioning

`CHANGELOG.md` is the human-readable project history and the source for the
in-game Changelog panel. Update it before packaging:

```sh
npm run gen:menu-content
npm run build:client
```

Do not hand-edit `client/src/schema/menu-content.ts`.

## Rollback

Rollback means rebuilding a previous commit:

```sh
git checkout <previous-commit>
npm ci
npm run build:dist-next
npm run verify:dist-next
```

There is no second runtime tree and no compatibility symlink to roll back to.
The archive is a read-only record, not a deployable fallback. Keep the last
verified `dist-next/` directory if an instant rollback is needed; its manifest
identifies the exact source it was built from.

## Reports

`reports/` is gitignored. A released build's reports are attached to the release
record, not committed. The historical acceptance reports under
`archive/tree/legacy/reports/` are evidence of earlier work and do not describe
the current source.
