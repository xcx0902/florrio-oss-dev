# ADR 0001: C++20 core + TypeScript Canvas2D client

- Status: accepted
- Date: 2026-10-21

## Context

The early reconstruction replaced wasm function bodies with JavaScript one at a
time. That work is useful as executable evidence, but most recovered client
functions are ABI thunks, destructors and locale code, not game behaviour. The
original client draws through a Canvas2D bridge, not a WebGL scene, and the
server is a separate wasm module driven by a worker message protocol.

## Decision

1. Rebuild shared rules and the server in C++20, compiled to WebAssembly.
2. Rebuild the web client in TypeScript with Canvas2D.
3. Organize code by domain (`World`, `Entity`, `Petal`, `Damage`, `Spawn`,
   `Snapshot`), not by wasm function index.
4. Put byte layouts, protocol framing and catalogs in `schema/`; generate C++/TS
   accessors and assert offsets.
5. Prove behaviour with deterministic product tests and delivery checks:
   protocol round-trips, native engine suites, client tests and a packaged
   browser smoke.
6. Accept behavioural equivalence, not byte-identical C++ output.
7. Retire the oracle from the active path once the product no longer reads it;
   keep the material under `archive/` for manual provenance.

## Consequences

- The recovered JS and WAT are historical evidence, not the production path.
- ABI thunks, destructors and locale code are delegated to the C++ compiler and
  standard library.
- Product tests do not require the original wasm, frozen snapshots or parity
  goldens.
- Every domain keeps a written spec in `docs/semantics/`, schema fields and a
  native or client test.
- The archive is read-only and is not part of any build, test or delivery input.

## Alternatives considered

- **Continue JS recovery**: rejected; it optimizes ABI noise and does not produce
  a maintainable game.
- **WebGL renderer**: rejected; it changes the drawing model and increases
  parity risk without a product requirement.
- **Byte-identical C++ wasm**: rejected; toolchain and standard-library
  differences make it impractical; behaviour is the contract.
