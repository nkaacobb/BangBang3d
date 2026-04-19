# BFPL Backend Patterns — Server-Side Persistence

## When You Need This

Use this file when an app needs to write data to the server — JSON files,
SQLite databases, logs, or any other server-side persistence that cannot
be done from JavaScript alone.

JavaScript running in the browser cannot write directly to the server.
Instead, the browser sends a fetch request to a PHP endpoint in the app
repo. The PHP endpoint handles validation, auth, and the actual write.
The data lands in the app's `data/` folder which lives outside the repo
and is never committed to Git.

---

## The Core Pattern

```
Browser JS
    ↓  fetch POST to /apps/[category]/[appname]/api/endpoint.php
PHP endpoint (in app repo, served by nginx)
    ↓  verify BFPL session if auth required
    ↓  verify CSRF token if state-changing
    ↓  validate and sanitize input
    ↓  read or write to /opt/apps/[group]/[category]/[appname]/data/
    ↓  return JSON response
Browser JS receives and handles response
```

No CORS issues because the request stays on the same origin.
No separate process to manage — PHP-FPM handles it.
No ports to open — nginx routes it automatically.

---

## File Structure for Apps With a Backend

```
[appname]/
├── index.html
├── js/
│   └── app.js
├── api/                          ← PHP endpoints live here
│   ├── scores.php                ← example: high score endpoint
│   └── save.php                  ← example: save user data endpoint
└── [rest of app files]
```

Data written by PHP lives OUTSIDE the repo:
```
/opt/apps/[group]/[category]/[appname]/data/    ← runtime state, never commit
```

---

## Pattern 1: JSON File Read/Write (simple, no auth)

Use for: leaderboards, public data, anonymous state

### PHP endpoint (api/scores.php)

```php
<?php
declare(strict_types=1);
header('Content-Type: application/json');

$dataFile = '/opt/apps/[group]/[category]/[appname]/data/scores.json';

// READ
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!file_exists($dataFile)) {
        echo json_encode([]);
        exit;
    }
    echo file_get_contents($dataFile);
    exit;
}

// WRITE
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    // Validate input
    if (empty($input['name']) || !isset($input['score'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid input']);
        exit;
    }

    // Sanitize
    $entry = [
        'name'  => substr(preg_replace('/[^A-Za-z0-9 ]/', '', $input['name']), 0, 20),
        'score' => (int)$input['score'],
        'date'  => date('Y-m-d')
    ];

    // Read existing, append, sort, trim, write back
    $scores = file_exists($dataFile)
        ? json_decode(file_get_contents($dataFile), true)
        : [];

    $scores[] = $entry;
    usort($scores, fn($a, $b) => $b['score'] - $a['score']);
    $scores = array_slice($scores, 0, 100); // keep top 100

    // Atomic write
    $tmp = $dataFile . '.tmp';
    file_put_contents($tmp, json_encode($scores, JSON_PRETTY_PRINT));
    rename($tmp, $dataFile);

    echo json_encode(['success' => true, 'entry' => $entry]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
```

### JavaScript (fetch side)

```javascript
// Read scores
const res = await fetch('/apps/[category]/[appname]/api/scores.php');
const scores = await res.json();

// Submit score
const res = await fetch('/apps/[category]/[appname]/api/scores.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: playerName, score: finalScore })
});
const result = await res.json();
```

---

## Pattern 2: Authenticated JSON Write (BFPL auth + CSRF)

Use for: user-owned saves, preferences, private data

### PHP endpoint (api/save.php)

```php
<?php
declare(strict_types=1);
header('Content-Type: application/json');

require_once '/opt/bfpl/auth-core/src/bootstrap.php';
require_login();
verify_csrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

$userId = current_user_id();
$dataDir = '/opt/apps/[group]/[category]/[appname]/data/users/';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

$userFile = $dataDir . $userId . '.json';

// READ
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!file_exists($userFile)) {
        echo json_encode(['saves' => []]);
        exit;
    }
    echo file_get_contents($userFile);
    exit;
}

// WRITE
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid input']);
        exit;
    }

    // Atomic write — keyed to user_id, never trusts client-supplied user_id
    $tmp = $userFile . '.tmp';
    file_put_contents($tmp, json_encode($input, JSON_PRETTY_PRINT));
    rename($tmp, $userFile);

    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
```

### JavaScript (fetch side)

```javascript
// Get CSRF token from auth check on startup
const authRes = await fetch('/auth/api/me.php', { credentials: 'include' });
const { user, csrf_token } = await authRes.json();

// Authenticated write
const res = await fetch('/apps/[category]/[appname]/api/save.php', {
    method: 'POST',
    credentials: 'include',
    headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf_token
    },
    body: JSON.stringify(dataToSave)
});
```

---

## Pattern 3: SQLite via PHP (relational data, user-owned records)

Use for: high scores with user_id, multiple record types,
anything that needs querying or filtering

### PHP endpoint (api/scores.php)

```php
<?php
declare(strict_types=1);
header('Content-Type: application/json');

require_once '/opt/bfpl/auth-core/src/bootstrap.php';

$dbPath = '/opt/apps/[group]/[category]/[appname]/data/app.db';
$db = new PDO('sqlite:' . $dbPath);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Create table if not exists
$db->exec('CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    display_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    level INTEGER NOT NULL,
    created_at TEXT NOT NULL
)');

// READ — top scores, public leaderboard
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->prepare(
        'SELECT display_name, score, level, created_at
         FROM scores
         ORDER BY score DESC
         LIMIT 20'
    );
    $stmt->execute();
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    exit;
}

// WRITE — authenticated score submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_login();
    verify_csrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    $userId = current_user_id();
    $input  = json_decode(file_get_contents('php://input'), true);

    $name  = substr(preg_replace('/[^A-Za-z0-9 ]/', '', $input['name'] ?? ''), 0, 20);
    $score = (int)($input['score'] ?? 0);
    $level = (int)($input['level'] ?? 1);

    if (empty($name) || $score <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid input']);
        exit;
    }

    $stmt = $db->prepare(
        'INSERT INTO scores (user_id, display_name, score, level, created_at)
         VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([$userId, $name, $score, $level, date('Y-m-d H:i:s')]);

    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
```

---

## Data Folder Setup

The `data/` folder must exist on the server before PHP can write to it.
The `Publish-App` agent handles this. For manual setup:

```bash
mkdir -p /opt/apps/[group]/[category]/[appname]/data
chown -R www-data:www-data /opt/apps/[group]/[category]/[appname]/data
chmod 755 /opt/apps/[group]/[category]/[appname]/data
```

The `www-data` user runs PHP-FPM and must own the data folder.

---

## Security Rules for All PHP Endpoints

- Never trust user_id from the request body — always derive from BFPL session
- Always validate and sanitize input before writing
- Always use prepared statements for SQLite queries — never interpolate
- Always use atomic writes (write to .tmp, rename into place)
- Always require CSRF verification on state-changing requests
- Never expose raw error messages or stack traces to the browser
- Never write outside the app's designated data/ folder

---

## Tetris High Score — Concrete Example

For Tetris specifically, use Pattern 3 (SQLite) because:
- Scores are user-owned (keyed to BFPL user_id)
- The leaderboard is public (anyone can read top scores)
- Writes require auth (only logged-in users can submit)
- SQLite handles sorting and limiting cleanly

Endpoint: `api/scores.php`
Table: `scores` (id, user_id, display_name, score, level, created_at)
Read: public GET, no auth required, returns top 20
Write: POST, requires BFPL login + CSRF, derives user_id from session