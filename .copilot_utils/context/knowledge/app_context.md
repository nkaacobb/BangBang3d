# App Context

---

## Identity

- **App name:** bangbang3d
- **Display name:** BangBang3D
- **Description:** A dual-backend 3D rendering framework for the browser supporting CPU software rasterization and GPU (WebGPU/WebGL2) backends through a unified API
- **Group:** projects
- **Server category:** bangbang3d (legacy flat path — not under a category subfolder)
- **Website category:** code-craft

---

## Stack

JavaScript (ES modules), WebGPU, WebGL2, CPU software rasterizer,
Web Workers, Playwright (testing), Node.js (dev server only)

No framework dependencies. No build step required for browser use.
Import directly from `src/index.js`.

---

## User Data

Does this app store user-specific data? **No**

This is a standalone rendering framework. It has no user accounts,
no saved state, no backend persistence, and no auth integration.

The `auth_integration_guide.md` and `backend-patterns.md` files
from the template are present but not applicable to this repo.

---

## Paths

### Local development
```
D:\Repo\Projects\Utilities\BangBang3d\
```

### Server repo path
```
/opt/apps/projects/bangbang3d/repo
```

Note: This uses the legacy flat path, not the canonical
`/opt/apps/projects/<category>/<appname>/repo` pattern.
Do not migrate this path without explicit instruction.

### Server data path
```
/opt/apps/projects/bangbang3d/data/    ← not currently used
```

### Public symlink path
```
/var/www/buildfirstpaniclater.com/apps/code-craft/bangbang3d
```

### Public URL
```
https://buildfirstpaniclater.com/apps/code-craft/bangbang3d/
```

---

## GitHub

```
git@github.com:nkaacobb/BangBang3d.git
```

Status: **Public repository**

---

## Auth Integration

This app has no auth integration. It is a pure rendering framework
with no user-specific features, no login requirement, and no
connection to BFPL Auth Core.

---

## Publication Status

- [x] Published — live at https://buildfirstpaniclater.com/apps/code-craft/bangbang3d/

---

## Notes

- This is a PUBLIC repo — never commit server credentials or internal paths
- Server deployment values live in `.server.local` (gitignored)
- The legacy flat server path `/opt/apps/projects/bangbang3d/repo` is correct
  for this app — do not apply the category-aware path pattern
- `examples/` serve as integration tests and public API demos
- `archive/docs/` is read-only historical record of development phases