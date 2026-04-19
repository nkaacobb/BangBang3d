# BangBang3D — Copilot Instructions

## What This Repo Is

BangBang3D is a public dual-backend 3D rendering framework for the browser.
It supports CPU (software rasterization) and GPU (WebGPU/WebGL2) backends
through a unified API. It is published as an open source project and also
hosted as a demo at buildfirstpaniclater.com.

This is a PUBLIC repository. Do not commit secrets, server credentials,
internal BFPL paths, or anything that belongs in `.server.local`.

---

## Reference Files

Before making any significant change, know which file to consult:

| Question | File |
|---|---|
| Complete class and method API reference | `DEVELOPER-REFERENCE.md` |
| Original design goals and CPU-first architecture | `BangBang3d Specification.md` |
| Current implementation status and feature completion | `PROJECT-COMPLETION.md` |
| How to run, install, and get started | `QUICKSTART.md` |
| Testing setup and procedures | `TESTING.md` |
| What this app is and where it lives on BFPL | `.copilot_utils/context/knowledge/app_context.md` |
| Server deployment variables | `.server.local` (gitignored, never committed) |

---

## Renderer Lifecycle

- `BangBangRenderer` requires `await renderer.initialize()` before rendering
- The engine supports `cpu`, `gpu`, and `auto` backends
- `auto` prefers WebGPU, then WebGL2, then CPU
- When changing renderer behavior, account for both CPU and GPU backends
  unless the task is explicitly backend-specific

---

## Architecture Notes

- `src/renderer/` contains the backend split, post-processing, shadows,
  and renderer orchestration
- `src/materials/`, `src/geometry/`, `src/loaders/`, and `src/math/`
  hold shared engine primitives used by both backends
- `examples/` are the fastest way to verify runtime behavior and
  intended public API usage — treat them as the integration test surface
- `archive/docs/` contains historical implementation notes — do not
  update them unless the task is explicitly about documenting history

---

## Development Commands

```bash
npm run dev              # start local test server
npm run test:smoke       # run Playwright smoke suite
npm run test:smoke:regen # regenerate golden images
npm run test:pipeline    # GPU pipeline tests
npm run test:components  # component tests
npm run test:webgpu      # WebGPU-specific tests
```

---

## Testing Caveats

- Smoke and GPU tests are designed for headed browser runs
- Avoid assuming headless WebGPU reliability
- Backend-switching work can recreate or replace the active canvas/backend
  state — verify example behavior after such changes

---

## Public Repo Safety Rules

This is a public GitHub repository. Before committing anything, verify:

- No server IP addresses or hostnames
- No SSH usernames or credentials
- No internal BFPL server paths
- No database credentials or secrets
- No private config values

Server deployment values belong in `.server.local` only.
`.server.local` is gitignored and must never be committed.
`.server.local.example` is the committed placeholder — safe to publish.

---

## BFPL Deployment Context

BangBang3D is hosted at buildfirstpaniclater.com as a demo.
Deployment uses the BFPL split-deployment model via the agents below.
All server-specific values are stored in `.server.local` (gitignored).

---

## Working Rules

- Read `DEVELOPER-REFERENCE.md` before adding or changing any public API
- Read `BangBang3d Specification.md` for original design intent
- Keep `DEVELOPER-REFERENCE.md` current — update it when APIs change
- `examples/` must remain working after any engine change
- Never hardcode server paths, IPs, or credentials in committed files
- `archive/docs/` is read-only historical record

---

## Agents Available

| Agent | When to use |
|---|---|
| `Deploy-BangBang3D` | Commit and push changes to GitHub |
| `Publish-BangBang3D` | First-time server setup (already done) |
| `Update-BangBang3D` | Pull latest to server after pushing |