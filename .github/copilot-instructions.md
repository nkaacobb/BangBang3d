# Forge3d Workspace Instructions

## Documentation Priority

- Start architecture work with `DEVELOPER-REFERENCE.md`, `PROJECT-COMPLETION.md`, and `README.md`.
- Use `BangBang3d Specification.md` for the original CPU-first design goals and terminology.
- Treat files under `archive/docs/` as historical implementation notes. Do not update them unless the task is explicitly about documenting history.

## Renderer Lifecycle

- `BangBangRenderer` requires `await renderer.initialize()` before rendering.
- The engine supports `cpu`, `gpu`, and `auto` backends. `auto` prefers WebGPU, then WebGL2, then CPU.
- When changing renderer behavior, account for both CPU and GPU backends unless the task is explicitly backend-specific.

## Architecture Notes

- `src/renderer/` contains the backend split, post-processing, shadows, and renderer orchestration.
- `src/materials/`, `src/geometry/`, `src/loaders/`, and `src/math/` hold the shared engine primitives used by both backends.
- Examples in `examples/` are the fastest way to verify runtime behavior and intended public API usage.

## Development Commands

- `npm run dev` starts the local test server.
- `npm run test:smoke` runs the Playwright smoke suite.
- `npm run test:smoke:regen` regenerates golden images.
- `npm run test:pipeline`, `npm run test:components`, and `npm run test:webgpu` cover GPU-focused tests.

## Testing Caveats

- Smoke and GPU tests are designed for headed browser runs; avoid assuming headless WebGPU reliability.
- Backend-switching work can recreate or replace the active canvas/backend state, so verify example behavior after such changes.