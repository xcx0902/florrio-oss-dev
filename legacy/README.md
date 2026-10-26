# Legacy oracle archive

Verified operation: move.

Oracle directories live here. Compatibility symlinks preserve existing reference paths.

Use `node tools/archive-legacy.mjs --restore` to verify and restore a move.
Use `node tools/archive-legacy.mjs --copy` to refresh an existing rehearsal copy.
The final --move requires a current passing mainline ledger and delivery identity.
Failed operations roll back assets and metadata. A recovery-required journal retains backups for inspection.
