# BFPL Auth Integration Guide

## The One Rule

BFPL owns identity. This app consumes identity.

This app must not implement its own login, signup, password handling,
or session creation. Use BFPL Auth Core for all of that.

---

## How to Know Who the User Is

### Frontend-heavy apps (JS, Three.js, canvas, etc.)

Call this on startup:
```
GET /auth/api/me.php
```

Response when logged out (401):
```json
{ "authenticated": false }
```

Response when logged in (200):
```json
{
  "authenticated": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "handle",
    "email_verified": true,
    "status": "active",
    "is_admin": false
  },
  "csrf_token": "abc123..."
}
```

A 401 on page load is normal when not logged in. Treat it as anonymous, not an error.

Standard frontend flow:
1. Call `/auth/api/me.php` on startup
2. If 401 — show logged-out UI, offer login link
3. If 200 — store user object in client state for display only
4. Use BFPL-backed endpoints for all save/load/update/delete actions
5. Include CSRF token on all state-changing requests

### Server-rendered or mixed apps (PHP)

```php
require_once '/opt/bfpl/auth-core/src/bootstrap.php';
require_login();           // redirect to login if no session
$user = current_user();    // full user object
$userId = current_user_id(); // integer user_id
```

For optional login (anonymous allowed):
```php
require_once '/opt/bfpl/auth-core/src/bootstrap.php';
optional_login();
$userId = is_logged_in() ? current_user_id() : null;
```

---

## Auth Routes

```
/auth/login.php
/auth/signup.php
/auth/logout.php
/auth/account.php
/auth/forgot-password.php
/auth/reset-password.php
/auth/api/me.php
```

## Login Redirect Pattern

When sending user to login, preserve their return location:
```
/auth/login.php?return_to=/apps/[websiteCategory]/[appname]/
```

---

## Available PHP Helpers (after bootstrap)

```php
require_login()           // redirect if not logged in
optional_login()          // resolve if logged in, continue if not
is_logged_in()            // bool
current_user()            // full user object
current_user_id()         // integer user_id
current_user_is_admin()   // bool
require_admin()           // redirect if not admin
csrf_token()              // get current session CSRF token
verify_csrf($token)       // validate submitted token
```

---

## Storing User Data

All user-owned app records must be keyed to the shared BFPL `user_id`.

```sql
-- Example app table
CREATE TABLE app_saves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,     -- BFPL user_id
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Never create a second BFPL user table. Never trust `user_id` from the client.

---

## CSRF Protection

Every state-changing authenticated request must include the CSRF token.

**Frontend — include in request headers or body:**
```javascript
const res = await fetch('/api/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    csrf_token: csrfToken,   // from /auth/api/me.php response
    data: payload
  })
});
```

**PHP endpoint — verify before processing:**
```php
verify_csrf($_POST['csrf_token'] ?? '');
```

---

## Protected Endpoint Pattern

Every save/update/delete endpoint must:
1. Resolve identity from BFPL session (not from request body)
2. Verify CSRF token
3. Verify record ownership before reading or mutating

```php
require_once '/opt/bfpl/auth-core/src/bootstrap.php';
require_login();
verify_csrf($_POST['csrf_token'] ?? '');

$userId = current_user_id();
$recordId = (int)$_POST['record_id'];

// Always scope by both record ID AND user_id
$stmt = $db->prepare(
  'SELECT * FROM app_saves WHERE id = ? AND user_id = ?'
);
$stmt->execute([$recordId, $userId]);
```

---

## Anonymous vs Authenticated Features

Anonymous users may:
- Browse, preview, or experiment with public features

Authenticated users may:
- Save, load, personalize, export, manage their own content

If a feature touches private user data, require login before allowing it.

---

## What Must Never Be in This Repo

- BFPL secrets or production config
- Password hashing logic
- Copied BFPL Auth Core implementation
- Code that trusts `user_id` from the client
- A second BFPL user table

---

## Common Mistakes

1. **Adding a second user table** — don't
2. **Trusting `user_id` from querystring or POST** — classic foot-gun, don't
3. **Protecting only the UI** — hiding a button is not authorization
4. **Forgetting return navigation after login** — always use `?return_to=`
5. **Skipping CSRF on fetch requests** — forms aren't the only attack surface
