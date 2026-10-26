# ADR 0001: C++20 core + TypeScript Canvas2D client

- Status: accepted
- Date: 2026-10-21

## Context

The current reconstruction replaces wasm function bodies with JavaScript one at a
time. It is useful as an executable oracle, but 73% of the recovered client
functions are vtable thunks and destructors. Continuing function-by-function
would optimize for ABI noise, not for a maintainable game.

The original client draws through a Canvas2D bridge (`canvasContexts`,
`Path2D`, `ASM_CONSTS` 136300–138582), not a WebGL scene. The server is a
separate wasm module driven by a worker message protocol.

## Decision

1. Rebuild shared rules and the server in C++20, compiled to wasm.
2. Rebuild the web client in TypeScript with Canvas2D.
3. Keep the original wasm/WAT/JS as the oracle; do not delete or rewrite them.
4. Organize code by domain (`World`, `Entity`, `Petal`, `Damage`, `Spawn`,
   `Snapshot`), not by wasm function index.
5. Put byte layouts in `schema/`; generate C++/TS accessors and assert offsets.
6. Prove behavior with deterministic traces:
   - Canvas2D command trace and screenshots for rendering;
   - server packet/memory trace for simulation;
   - function-level oracle tests for individual recovered bodies.
7. Accept behavioral equivalence, not byte-identical C++ output.

## Consequences

- The old JS recovery work remains evidence, not the production path.
- ABI thunks/destructors/locale code are delegated to the C++ compiler and
  standard library.
- Parity requires a deterministic clock and worker facade; both live in
  `tools/parity/`.
- Every domain needs a written spec (`docs/semantics/`), schema fields and a
  trace before it can replace the original.
- The first C++ server is a skeleton; it must not be presented as equivalent
  until `server-trace.mjs` matches the original packet stream for the baseline
  scenarios.

## Alternatives considered

- **Continue JS recovery**: rejected; it optimizes ABI noise and does not
  produce a maintainable game.
- **WebGL renderer**: rejected; it changes the drawing model and increases
  parity risk.
- **Byte-identical C++ wasm**: rejected; toolchain and standard-library
  differences make it impractical; behavior is the contract.
