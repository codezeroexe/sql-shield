# Architecture

SQLShield Demo is a one-page Express app that runs the same login and search inputs through two query builders against one in-memory SQLite database, and prints both results. It exists to show one rule: a bound value is data, a pasted string is SQL.

Constraints and intent are in [PRODUCT.md](PRODUCT.md). Running the app, configuration and the API reference are in [README.md](README.md). The visual system is in [DESIGN.md](DESIGN.md). This page is about how the code is put together and how to change it.

## Parts and request flow

Three parts: `server.js` (the whole backend), `public/index.html` (the whole frontend, CSS and one `<script>` inline), and `test/`. `public/` also holds `favicon.svg` and one font, `fonts/azeret-mono-var.woff2`.

```
browser page (public/index.html)
   |  fetch
   v
Express, middleware in this order (server.js):
   1. Host check        403 {error} unless Host is localhost, 127.0.0.1 or [::1]
                        (only when HOST is a loopback value)
   2. headers           nosniff, X-Frame-Options, Referrer-Policy, COOP, CORP, CSP
   3. express.json      100kb limit
   4. express.static    public/
   5. /api routes       health, reset, login-demo, search-demo, run-script
   6. JSON 404          any other /api path -> {error: "no such route."}
   7. SPA fallback      anything else -> public/index.html
   8. error handler     bad JSON -> 400, body too large -> 413, else 500
   v
one sqlite3 connection (`db`), in memory, seeded with 8 users
```

Notes on the order:

- The Host check is first, so a foreign Host gets 403 for the page and for unknown routes too, and the 403 carries none of the security headers.
- `express.json` runs before the routes, so a malformed body never reaches a route; it goes to the error handler.
- `app.disable("x-powered-by")` is set, and the headers middleware sets the rest.
- The error handler is last, after the SPA fallback. It never sends stacks or paths.

## Why it is built this way

- **One static HTML file, no build step.** PRODUCT.md makes this a hard constraint. Cost: a 2,400-line file with CSS and JS inline, and a CSP that must allow `'unsafe-inline'` for script and style.
- **One sqlite3 connection.** The app has one operator. `changes()` and `last_insert_rowid()` are connection-wide, so `run-script` serialises scripts through `runChain` (a promise chain) and wraps each in a transaction. A pool would break that counting.
- **In-memory database, reseeded on start and on reset.** State is always fresh and there is nothing to migrate. `DB_PATH` exists only so a presenter can use a file on purpose. `seed()` always reseeds `users`, even with a file. `POST /api/reset` drops every trigger, view, table and index (in that order), then calls `seed()`.
- **The vulnerable paths are real and stay visible.** `login-demo` with `mode: "vulnerable"`, the unsafe half of `search-demo` and all of `run-script` paste text into SQL. The page prints the bypass returning rows. Softening it would defeat the point (PRODUCT.md, "Show the working attack").
- **Narrow block-list in `run-script`, `ATTACH` limited by the engine.** Only statements that are not lessons are refused up front: `BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`, `VACUUM`. They break the wrapper transaction or write files. `ATTACH` is not blocked by keyword: `db.configure("limit", sqlite3.LIMIT_ATTACHED, 0)` makes SQLite refuse it, so the page prints the engine's own error. A keyword block would hide that lesson. `DROP` is allowed on purpose; Reset exists for it.
- **Loopback bind plus Host check.** `HOST` defaults to `127.0.0.1`. The Host check stops DNS rebinding: a hostile page that resolves its own name to 127.0.0.1 sends a foreign Host and gets 403. If `HOST` is not one of `127.0.0.1`, `localhost`, `::1`, the check is skipped (`loopbackBind` is false).
- **6 s interrupt, 500-row cap, through `queryRows`.** A runaway statement or a huge result must not freeze the single connection. `ROW_CAP` and `QUERY_TIMEOUT_MS` are fixed constants (marked `ponytail:` in the source as untuned).

## Server internals worth knowing

### `splitStatements(sql)`

sqlite3 compiles one statement per call and silently drops the rest. `splitStatements` finds the first `;` that is not inside a quote (`'`, `"`, backtick), a `--` comment, a `/* */` comment or a `[bracketed]` identifier, and returns `{ executed, ignored }`. The page uses these to mark which part ran and which part the driver discarded, so it never claims a stacked `DROP` ran when it did not. `login-demo` (vulnerable), `search-demo` (unsafe query) and `run-script` all call it. `run-script` also uses it to refuse a script with nothing before the first `;` (400).

### `run-script` and `runLocked`

1. Validate: `script` must be a non-blank string of at most 10000 characters (400 otherwise).
2. `splitStatements`; empty `executed` is a 400.
3. Block-list: `stripLeading(executed)` removes leading whitespace and comments, then a regex refuses the seven keywords (400).
4. Queue on `runChain`, so one script runs at a time.
5. `runLocked` calls `db.serialize` and queues `BEGIN`, the statement through `queryRows`, then `SELECT changes(), last_insert_rowid()`, then `COMMIT` (and `ROLLBACK` if the commit fails). Queued together, nothing else can land between the statement and its count.
6. `changes` and `lastID` are reported as `0` and `null` unless the statement does not start with `select`, `pragma`, `explain` or `with`. `changes()` keeps the last write's count, so for a read it would be a stale number from an earlier statement. Reporting none is more honest than reporting a wrong one. The cost: a `WITH ... INSERT` reports zero changes.

### `queryRows(sql, params, cb)`

Uses `db.each` so rows can be counted as they arrive. It stops at `ROW_CAP` rows (sets `meta.truncated`, calls `db.interrupt()`). A timer calls `db.interrupt()` after `QUERY_TIMEOUT_MS` and sets `meta.timedOut`. `db.each` reports engine errors to the row callback, so `queryRows` keeps the first one (`rowErr`) and hands it to the final callback. An `SQLITE_INTERRUPT` error that we caused ourselves (truncated or timed out) is swallowed and returns the rows so far. `db.each` never calls the row callback for writes, so `INSERT`, `UPDATE` and `DROP` work and return no rows.

The safe login path does not use it: a prepared single-row read cannot run long or return many rows, so it uses `db.get`.

### Response shapes and status codes

- **Record** (`buildResponse`): `{ label, status, result, note, ...detail }`. `login-demo` and `run-script` return records, including on failure, so the page can print what was attempted. Detail fields: `query`, `executed`, `ignored`, `boundValues`, and for scripts `changes` and `lastID`. `truncated: true` and `timedOut: true` appear only when true.
- **Plain `{ error }`**: validation failures, the Host check, the JSON 404, the framework errors, `search-demo` engine errors, and `search-demo` timeouts (`{ error, timedOut: true }`).
- **`search-demo`** returns its own shape: `{ safe, unsafe, queries, executed, ignored, boundValues, note }`.
- **Status codes:** 200 handled (a bypass is still 200, with `status: "unsafe"`); 400 refused before the database; 403 bad Host; 404 unknown `/api` path; 413 body over 100 KB; 500 engine error or unexpected error; 503 only from `/api/health`; 504 the 6 s limit. A 500 or 504 from `login-demo` or `run-script` is still a record with `status: "rejected"` or `"unsafe"`.

### Start-up and shutdown

Order: validate `PORT`, `HOST` and `DB_PATH` (exit 1 with a message naming the variable) -> open the database -> set the `ATTACH` limit -> `seed()` -> `app.listen`. A listen error (`EADDRINUSE` or other) also exits 1. Routes are registered at load time, but nothing listens until the seed finishes.

`SIGINT` and `SIGTERM` call `shutdown()`: close the HTTP server and its connections, close the database, exit 0. A 3 s timer forces exit 1 if that hangs. `unhandledRejection` is logged, not fatal.

## The page

`public/index.html` has one `<script>`. Nothing in it is mocked: every panel renders a real server response, or a failure it classified from a real failure.

### `ask(key, path, init)`

All API calls except Reset and the health poll go through `ask`. It throws an `Error` with a `kind`:

| kind | cause | stamp (via `FAIL`) |
| --- | --- | --- |
| `offline` | fetch rejected, non-JSON reply, or unreadable body; also sets the lamp to down | `offline` |
| `timeout` | page-side abort after 8 s | `timed out` |
| `stopped` | server answered 504 | `timed out` (tally says "stopped by the server after 6 seconds") |
| `refused` | any other non-OK status below 500 | `refused` |
| `engine` | status 500 or higher, or a 200 whose body is not a recognisable demo shape | `engine error` |
| `superseded` | a newer request with the same key started | none; callers drop it |

`failOf(err)` maps `err.kind` to a `FAIL` entry (unknown kinds fall back to `offline`). Each entry has `outcome`, `stamp`, `tally` and `note()`. The `engine` note adds a hint to press Reset when the message says `no such table`. The thrown error also carries `status` and `body`, so a refusal can still print the statement the server echoed back.

The HTTP status decides success, not the body: the server's failure records reuse the success shape, so a body alone cannot say whether a statement ran.

### Superseded responses

`tokens` is a `Map` of request key to a counter. Each `ask` takes a ticket; if a newer ticket exists when the answer arrives, the error is `superseded`. Keys are per sheet (`login:<tag><mode>`, `search`, `script`), not per path, because both login modes hit the same endpoint. The preset roll passes a `tag` so a second roll cancels the first and not the proof.

### Other pieces

- **Lamp.** `setLamp("checking" | "up" | "down")` writes the status pill. `checkHealth()` polls `/api/health` every 10 s while the tab is visible. A failed `ask` also flips it.
- **Proof and verdict row.** On load, after fonts are ready and `checkHealth()` succeeds, `proof()` arms the classic bypass (`arm(BYPASS)`), sends the safe and vulnerable logins together, then `setVerdict` fills the `#verdict` row (for example "0 rows" and "8 rows"). Reset calls `proof()` again.
- **Printing.** `fillLogin`, `runSearch` and `fillScript` fill the sheets. `printStatement` marks typed input, characters past column 72 (`FIELD`) and the discarded tail (`ignored`), computed from the real strings. `printing(record)` replays the print animation.
- **Search stamp.** The unsafe search sheet is stamped `injected` only when `unsafe` has more rows than `safe`; otherwise `no injection`.
- **Shortcuts and wiring (bottom of the script).** Enter in the username or password field runs both logins. Enter in the search box runs search. Cmd or Ctrl plus Enter in the script box runs the script. Choosing a preset calls `arm()`; there is no separate load button.
- **Saved statement.** The script box is saved to `localStorage` under `sqlshield.script` on every input and restored on load. The restore button (`restoreBtn`) resets it to the textarea's default and removes the key. Every storage access is in `try/catch`.
- **Reset button.** `resetBtn` posts to `/api/reset` with a plain `fetch`, shows the message from the server, then calls `proof()`.
- **Preset roll.** `rollAll` runs every preset option through both logins, one pair at a time, using the same markup (`pairTpl`) and the same `fillLogin`. It has no endpoint of its own.
- **Tokens.** `:root` holds colours, a spacing scale (`--s-1` to `--s-5`: 4, 9, 14, 20, 26 px) and motion (`--t-fast`, `--t-lamp`, `--t-feed`, `--ease-feed`). `DESIGN.md` describes the system; its colour names (`ink-soft`, `carbon-mid`) differ from the CSS names (`--ink-2`, `--carbon-2`).

## Tests

`npm test` runs `node --test "test/*.test.js"`, which picks up both files. Each starts its own server and stops it after.

- **`test/api.test.js`** (HTTP only). `before` spawns `server.js` on a random port in 3900-3989 and waits for `/api/health`. Set `BASE` to use a server you already started. It covers: safe versus vulnerable login, stacked statements, search, `run-script` (verbatim run, boundaries in comments and literals, writes, block-list, `ATTACH`, size limit, row cap, the 6 s stop, concurrent writes), reset, validation, JSON errors, the Host check (raw `node:http` because `fetch` cannot set `Host`), headers, and start-up failures (each spawns its own server and expects exit code 1).
- **`test/page.test.js`** (the page in jsdom). `before` spawns a server on a random port in 3990-4089. Set `PAGE_BASE` to use an existing one. Each test reloads the page with `JSDOM.fromURL`, runs scripts, and resets the database first. `beforeParse` replaces `fetch` with one that resolves relative URLs, swaps in Node's `AbortController`, stubs `scrollIntoView`, and adds `matchMedia` and a `document.fonts` shim when jsdom lacks them. For failure cases a test passes its own `fetch` wrapper: it rejects with a `TypeError` to produce the `offline` stamp, returns a stubbed 504 record to produce `timed out`, or never answers so the 8 s abort fires. The tests check stamps, the verdict row, `aria-invalid`, focus, the preset, shortcuts, `localStorage` and Reset.

Run one test:

```
node --test --test-name-pattern="health check reports ready" test/api.test.js
```

A deliberate-break check: change one thing in `server.js` or the page (flip a status code, make `splitStatements` ignore `--`, remove a keyword from the block-list, change `ROW_CAP`), run `npm test`, confirm a named test fails, then revert. The suite is built to catch: a wrong status code or error shape, a claim that a discarded statement ran, a benign input stamped as an injection, a block-list or limit that no longer holds, a Host or header regression, a start-up check that stops working, and a stamp or verdict that no longer matches a failure kind. It does not catch layout, fonts or the 1280x720 view (see Known limits).

CI (`.github/workflows/ci.yml`) runs on every push and pull request: Node 20, `npm ci`, `npm audit --omit=dev --audit-level=high`, `npm test`.

## How to change things safely

**Add a route**
- Validate first and refuse with `400 { error }`. Match the existing length and type checks.
- Return a record (`buildResponse`) if the page will print the statement, plain `{ error }` otherwise.
- Put it before the JSON 404 middleware, or it will never be reached.
- Route reads through `queryRows` so it gets the cap and the timeout.
- Update the README API contract and add tests for the success path and each 4xx.

**Change a stamp word**
- Edit the `FAIL` entry or the stamp text in the page.
- Update the strings in `test/page.test.js` (`hasStamp` calls).
- Update the README where it names the word, if it does. (README has no stamp glossary today.)

**Change a limit** (`ROW_CAP`, `QUERY_TIMEOUT_MS`, the 200 and 10000 character limits, the 100kb body)
- Change the constant, and the matching literal in `TIMEOUT_NOTE` or `TRUNC_NOTE` (they hard-code "6 seconds" and "500 rows").
- Update the README limits and the page's `8 seconds` client timeout if it must stay above the server's.
- Update the tests: the 500-row test, the 504 test and `/8 seconds/` in the page test.

**Widen `HOST`**
- Any value outside `127.0.0.1`, `localhost`, `::1` turns the Host check off and exposes `/api/run-script` to the network. Read the security section of `LEVELS.md` first (threat model, accepted risks). Make `run-script` read-only or remove it before any real deployment.

## Known limits

- `/api/run-script` is arbitrary SQL by design. It is safe only on loopback.
- No sign-in, sessions, CSRF tokens or rate limits. The seed passwords are fake and printed on the page.
- The CSP allows inline script and style because the page is one file.
- jsdom does not check layout, fonts or the 1280x720 projector view. Check those by eye (the README pre-demo checklist does).
