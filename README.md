# SQLShield

A small web app that lets you attack a login and a search box with SQL injection, then shows why the same text fails against a prepared statement.

> The "unsafe" routes are vulnerable on purpose. Run it on your own machine only. The database is a throwaway in-memory SQLite database that is rebuilt on every start.

More detail: [ARCHITECTURE.md](ARCHITECTURE.md) (how it is built), [CHANGELOG.md](CHANGELOG.md) (what changed), [PRODUCT.md](PRODUCT.md) (who it is for), [DESIGN.md](DESIGN.md) (look and feel).

## Quick start

Requirements: Node.js 20 or newer (`engines` in `package.json`).

```
npm install
npm start
```

Open http://127.0.0.1:3000 (the defaults are `HOST=127.0.0.1`, `PORT=3000`).

```
npm test        # 78 tests, about 11 seconds
npm run load    # load test, about 10 seconds
```

To use another port: `PORT=3100 npm start`.

## Using it

### Landing page

`#/` shows the headline, two buttons (**Start the lessons**, **Open the Lab**) and a live preview. The preview sends `' OR 1=1 --` with password `x` to both logins and shows how many users each one returned. With a fresh database that is 8 for the unsafe login and 0 for the safe one.

### The six lessons

Each lesson is a short page with a live example. Back and Next links sit at the bottom; the last lesson links to the Lab.

1. **How a login works.** The site asks the database for the user with this name and password.
2. **The trick.** The unsafe login pastes your text into the question, so quotes and extra words become part of it.
3. **Why it worked.** Which parts of the typed text change the question.
4. **The fix.** The safe login writes the question with `?` blanks and sends your text separately.
5. **Not just logins.** The same problem in a search box.
6. **What to remember.** Five habits that prevent it.

### The Lab

Three tools. Each one sends real requests to the server.

- **Login tester** (`#/lab/login`). Name and password fields plus an example menu (Normal login, Log in as everyone, Log in as admin, Read other columns, Broken text). **Run both** sends the text to the safe and the unsafe login and shows both results.
- **Search tester** (`#/lab/search`). One search box. **Search both** runs the safe and the unsafe search with the same text.
- **SQL sandbox** (`#/lab/sandbox`). A text area that runs exactly what you type against the demo database. It can read and change data. Only the first statement runs; anything after the first `;` is ignored. **Restore example** puts the starting text back. The text you type is kept in the browser's local storage.

Under each tool, **What the database ran** lists the last 30 statements the server executed: which route, bound (prepared) or pasted, the SQL, the bound values, row count and timing. It polls `/api/trace` every 1.5 seconds while a Lab screen is open. **Clear** empties the list on the page only. If the server stops answering it shows "Log paused: server not reachable."

### Reset database

The left rail shows the current user count and a **Reset database** button. It calls `POST /api/reset`: every table, view, trigger and index is dropped and the 8 users are restored. Use it after the sandbox changes or deletes data.

### Banner

A banner appears at the top when the page checks `/api/health` (on load, every 10 seconds while the tab is visible, and when the tab becomes visible again) and finds a problem:

- Server unreachable: "The demo server is not running. Start it with npm start, then reload this page."
- `db` is `damaged`: "The users table was deleted. Reset the demo to bring it back." This one has a **Reset database** button.

When the database is intact the banner is hidden.

### Keyboard

- Left and Right arrow keys move between lessons 1 to 6. Ignored while typing in a field, and with Ctrl, Alt, Meta or Shift held.
- Enter in the Login tester name or password field, or in the Search tester field, runs the tool.
- Ctrl+Enter or Cmd+Enter in the SQL sandbox runs the statement (plain Enter adds a new line).

## How it works

The server builds each query two ways. The text below comes from `server.js`.

Unsafe (login), the input is pasted into the SQL string:

```
SELECT id, username FROM users WHERE username = '${username}' AND password = '${password}'
```

Safe (login), the SQL is fixed and the values travel separately:

```
SELECT id, username FROM users WHERE username = ? AND password = ?
```

with `[username, password]` as the bound values. Search works the same way:

```
unsafe: SELECT id, username FROM users WHERE username LIKE '%${term}%' ORDER BY username
safe:   SELECT id, username FROM users WHERE username LIKE ? ORDER BY username      (value: "%term%")
```

Why the safe one holds: SQLite compiles the statement with the `?` blanks before it sees your text. The text is then attached as a value, so a quote or `OR 1=1` in it is just characters to compare against, never part of the query.

Notes from the code:

- The SQLite driver compiles one statement per call. Everything after the first `;` that is not inside a quote, comment or `[identifier]` is discarded. The responses return `executed` and `ignored` so the page can show what really ran.
- Typing `' OR 1=1 --` as the unsafe login name returns all 8 users, because the pasted text turns the WHERE clause into something always true.

## Configuration

Read by `server.js` at start. A bad value stops the process with a message.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port to listen on. Whole number 0 to 65535. Port 0 picks a free port (the console line then shows 0, not the real port). |
| `HOST` | `127.0.0.1` | Address to bind. Must be an IP address or `localhost`. |
| `DB_PATH` | `:memory:` | SQLite database. The default is in memory and reseeded every start. A file path keeps the file, but the users table is still emptied and reseeded on every start. The folder must exist. |

Fixed values in the code (not configurable): 500 rows per result, 6 second statement timeout, 200 characters for login fields and search term, 10000 characters for a script, 100 kB request body, 50 trace entries.

While `HOST` is a loopback address (`127.0.0.1`, `localhost`, `::1`), requests with any other `Host` header get `403 {"error":"unexpected Host header."}` (a defence against DNS rebinding).

## API reference

All routes return JSON. Errors have the shape `{"error": "message"}`. Bad JSON gives `400 {"error":"request body must be valid JSON."}`; a body over 100 kB gives `413`. Unknown `/api/...` paths give `404 {"error":"no such route."}`. Any other path serves the page.

### GET /api/health

- `200 {"ok":true,"db":"intact","users":8,"message":"SQLShield Demo backend is running."}`
- `200 {"ok":true,"db":"damaged","users":0,"message":"users table missing."}` when the users table is gone.
- `503 {"ok":false,"message":"database unavailable."}` when the connection fails.

### POST /api/reset

No body. Drops all objects, reseeds 8 users. `200 {"ok":true,"users":8,"message":"Database reset. 8 users restored."}`, or `500 {"error":"reset failed: ..."}`.

### POST /api/login-demo

Body: `{"mode":"safe"|"vulnerable","username":"...","password":"..."}`. `mode` defaults to `safe`.

- `200` response: `{label, status, result, note, query, boundValues, ...}`. `label` is `safe` or `vulnerable`; `status` is `safe` or `unsafe`; `result` is an array of `{id, username}` rows (safe: zero or one row). Vulnerable also returns `executed`, `ignored`, and `truncated: true` if cut at 500 rows. Safe returns `boundValues: [username, password]`; vulnerable returns `boundValues: null`.
- `400`: missing or empty username or password; not strings; over 200 characters; `mode` not `safe` or `vulnerable`.
- `500`: engine error (for example a broken statement); `status` is `unsafe` (vulnerable) or `safe`, `note` holds the engine message.
- `504`: vulnerable statement ran past 6 seconds; `timedOut: true`, `status: "rejected"`.

### GET /api/search-demo?term=...

- `200`: `{safe, unsafe, queries:{safe,unsafe}, executed:{safe,unsafe}, ignored:{safe,unsafe}, boundValues:{safe:["%term%"],unsafe:null}, note}`, plus `truncated:{safe,unsafe}` if either was cut at 500 rows. `safe` and `unsafe` are arrays of `{id, username}`.
- Empty or missing `term`: `200 {safe:[], unsafe:[], boundValues:{safe:null,unsafe:null}, note:"No term provided."}`.
- `400`: `term` repeated (not a single string) or over 200 characters.
- `500`: engine error from either query. `504`: either query ran past 6 seconds, `{error, timedOut:true}`.

### POST /api/run-script

Body: `{"script":"..."}`. Runs the text exactly as typed, one script at a time (a queue).

- `200`: `{label:"custom", status:"ran", result, note, query, executed, ignored, boundValues:null, changes, lastID}`. `changes` is the number of rows written (0 for reads and DDL). `lastID` is null unless rows changed. `truncated: true` if cut at 500 rows.
- `400` refusals: script missing, not a string, or blank; over 10000 characters; nothing before the first `;`; first statement starts with `BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE` or `VACUUM` (leading whitespace and comments are skipped before the check).
- `500`: engine error, `status:"rejected"`, message in `note`. `ATTACH` fails this way (the attached-database limit is 0, so a script cannot create files).
- `504`: ran past 6 seconds, `timedOut: true`; the statement is interrupted and the server stays up.

### GET /api/trace?after=N

Returns `{"entries":[...],"last":N}`. `after` is optional, a whole number; entries with `id` greater than it are returned. `last` is the newest id. The server keeps the last 50. `400 {"error":"after must be a whole number."}` for anything else.

Each entry: `id`, `at` (ms since epoch), `route` (`login`, `search`, `script`, `reset`), `ms`, `http` (status), `outcome` (`ok`, `refused` for 400, `timeout`, `error`), `path` (`bound`, `pasted` or null), `sql`, `bound` (bound values or null), `rows` (count or null), `note`. Script entries also have `changes`. A search adds two entries, one `bound` and one `pasted`. Only login, search, run-script and reset are recorded; health and trace are not.

## Project layout

```
server.js              Express app, SQLite, all routes, config checks
public/index.html      the whole page: markup, styles, script (no build step)
public/favicon.svg     shield icon
public/fonts/          Azeret Mono, served locally
test/api.test.js       backend tests (spawns the server)
test/page.test.js      page tests (jsdom against a running server)
scripts/load.js        load test, run with npm run load
.github/workflows/ci.yml   CI
ARCHITECTURE.md        how it is built, decisions, change checklist
CHANGELOG.md           what changed
PRODUCT.md, DESIGN.md  audience and visual rules
LEVELS.md              audit notes and open findings
```

## Tests and checks

Run `npm test` (Node's built-in runner, `node --test "test/*.test.js"`). Last run: 78 pass, 0 fail, about 11 seconds.

- `test/api.test.js`: login (safe, bypass, stacked statements, validation), search, health (intact and damaged), run-script (reads, writes, change counts, refusals, 10000-character limit, 500-row cap, 6 second timeout), reset, concurrent scripts, JSON and 404 errors, security headers, Host header refusals, start-up failures for bad `PORT`, `HOST`, `DB_PATH` and a busy port, and the trace.
- `test/page.test.js`: routes and rail, landing counts, arrow keys, banner states, reset button, the three Lab tools, and log polling only on Lab screens.

`npm run load` starts its own server on a free port, sends login (safe and unsafe) and search requests from 20 workers for 10 seconds, then stops it. Budget: p95 latency under 50 ms and zero errors; it exits 1 if missed. A sample run: about 122,000 requests, 0 errors, p95 3.1 ms.

CI (`.github/workflows/ci.yml`) runs on every push and pull request with Node 20: `npm ci`, `npm audit --omit=dev --audit-level=high`, `npm test`. The load test is not part of CI.

## Seeded demo users

Created at every start and on reset. Passwords are plain text on purpose.

| id | username | password |
|---|---|---|
| 1 | alice | pw123 |
| 2 | bob | hunter2 |
| 3 | admin | rootpass |
| 4 | charlie | letmein |
| 5 | dave | sunshine |
| 6 | erin | qwerty12 |
| 7 | frank | dragon99 |
| 8 | grace | iloveyou |

## Limits and known issues

- The unsafe login, unsafe search and SQL sandbox are intentionally exploitable, and `/api/run-script` runs arbitrary SQL. Do not expose it beyond your own machine. Binding to a non-loopback `HOST` turns off the Host header check.
- The server uses one SQLite connection. Scripts run one at a time; a statement that runs past 6 seconds is interrupted.
- Results are capped at 500 rows.
- Only the first statement of any pasted query runs, so stacked-statement attacks like `; DROP TABLE users` are discarded by the driver in login and search. The sandbox can still run a single `DROP TABLE users` directly; reset fixes it.
- `BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`, `VACUUM` and `ATTACH` do not work in the sandbox.
- The change count counts rows changed by triggers too, if a script creates a trigger (LEVELS.md, B-T1).
- With `DB_PATH` set to a file, only the `users` table is reseeded; other objects in the file stay until a reset.
- The trace and its log are in memory, one process, last 50 entries; the page shows the last 30.
