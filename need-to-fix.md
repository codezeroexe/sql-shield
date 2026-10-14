# need-to-fix.md

Status as of 2026-10-14. Open items are tracked in LEVELS.md.

## Backend (`server.js`, `package.json`, `database.sqlite`)

- [ ] Plaintext passwords in seed (`alice/pw123`, `bob/hunter2`, etc.) → hash (bcrypt/scrypt) even for demo, or mark clearly non-auth. — by design: PRODUCT.md says "No production authentication, no real credentials, no secrets"; the eight seeded users are throwaway demo data.
- [ ] `DELETE FROM users` + reseed on every boot wipes data → seed only if empty (`INSERT OR IGNORE` / count check). — by design: PRODUCT.md says the database is reseeded from a hardcoded list of eight users on every boot, so there is no persisted state to protect.
- [x] `database.sqlite` committed to git + overwritten at runtime → gitignore it, seed on first run. — done: `git ls-files` lists no sqlite file, `*.sqlite` is in `.gitignore`, and the default database is `:memory:` (server.js `DB_PATH`).
- [ ] `/api/run-script` allows arbitrary writes (`DROP`, `DELETE`, `INSERT`, `UPDATE`) → restrict to `SELECT` allowlist or read-only connection; currently destructive by design. — by design: PRODUCT.md "Constraints" keeps the statement box with no allow-list by user decision; the page prints a warning that it can write.
- [x] No input length / size caps on `username`, `password`, `term`, `script` → add max lengths + `express.json({limit})`. — done: server.js caps login and search fields at 200 chars, the script at 10000, and `express.json({ limit: "100kb" })`; tests "login rejects bad mode, non-string, oversized and empty input" and "run-script refuses a script over 10000 characters".
- [ ] No rate limiting → add `express-rate-limit` on login + run-script (brute-force / DoS). — by design: PRODUCT.md Operating Context chooses single-operator failure modes "rather than ... hostile-traffic robustness"; no rate limiter in package.json.
- [x] No security headers (`helmet`) → add. — done: server.js sets nosniff, X-Frame-Options, Referrer-Policy, COOP, CORP and CSP by hand (no helmet package); test "root page carries the security headers and hides the framework".
- [ ] No CORS policy set → set explicit `cors({origin})` or document why open. — partly: no cors() middleware, so no Access-Control-Allow-Origin header is sent and browsers block cross-origin reads; CORP is same-origin. No explicit origin policy and no written reason for it.
- [x] `mode` param unvalidated (any string falls through to safe path) → allowlist `safe|vulnerable`, 400 otherwise. — done: server.js returns 400 unless mode is "safe" or "vulnerable"; test "login rejects bad mode, non-string, oversized and empty input".
- [ ] `splitStatements` misses `--` inside line without `\n` edge, `/*` unclosed, `"`/`\``/`[]` escapes → fuzz-test; consider `sqlite` parser instead of hand-roll. — partly: handles `--` with no trailing newline, unclosed `/*`, `'`/`"`/backtick quotes with doubling, and `[...]`; no fuzz test and no sqlite parser (test "a semicolon inside a comment or a literal is not a statement boundary").
- [ ] `db.get` safe path returns `[]` envelope on error without `query/executed/boundValues` (inconsistent with vulnerable branch) → unify shape.
- [ ] `search-demo` runs two nested `db.all` serially, no input sanitization on `term` length, error loses which path failed → split errors, cap term at e.g. 200 chars. — partly: term is capped at 200 chars (test "search rejects repeated and oversized terms") and errors still come back as one `{ error }` without naming the failing path; the two queries still run serially.
- [ ] `run-script` `BEGIN`/`COMMIT` without `ROLLBACK` on error → failed write can leave txn open; add rollback path. — partly: COMMIT always runs after the statement, so a transaction cannot stay open; ROLLBACK runs only if COMMIT fails, not when the statement errors.
- [ ] `changes()`/`lastID` probe runs even for `SELECT` then discarded → skip probe when `readsOnly`.
- [ ] `readsOnly` regex misses `VALUES (...)`, `TABLE`, `PRAGMA` writes → use strict `^SELECT/WITH/EXPLAIN` allowlist + reject all else if locking down. — partly: `readsOnly` no longer reports stale `changes()` for select/with/explain/pragma, but VALUES and TABLE still fall through as writes; no strict allow-list, by user decision in PRODUCT.md.
- [ ] No request logging (`morgan`/`pino`) → add minimal logging.
- [x] No graceful shutdown (`SIGINT` close db/server) → add. — done: server.js `shutdown()` on SIGINT/SIGTERM closes the server and database and forces exit after 3 s; README "Stop" section.
- [ ] `process.exit(1)` on DB open fail with no retry → surface error, don't hard-exit in library use.
- [ ] `package.json`: `main: index.js` doesn't exist; `pretest` spawns orphan detached `server.js` on port 3000 (conflicts, leaks) → use `node --test` with in-process app or `testcontainers`; export `app` from server.js. — partly: the `pretest` that spawned an orphan server is gone and api.test.js boots its own server on a random port; `"main": "index.js"` is still in package.json and server.js exports no `app`.
- [x] Port 3000 hardcoded default collides (user has another app on 3000) → respect `PORT`, document it. — done: server.js reads PORT and stops with `Invalid PORT` on a bad value; README Configuration table; test "PORT abc stops the server at start with Invalid PORT".
- [ ] No `.env` / config → add `dotenv` + `PORT`, `DB_PATH` vars. — by design: README says "The server does not read a `.env` file itself"; config is environment variables only, listed in `.env.example`.
- [ ] Missing tests: rate-limit, oversize body, invalid mode, concurrent writes isolation, `run-script` DROP actually blocked/persisted. — partly: tests now cover invalid mode, five concurrent script writes, and reset after a script drops the table; no rate-limit test and no oversized-body (413) test.

## Frontend (`public/index.html` — 2138 lines, single file)

- [ ] Split monolith → `styles.css` + `app.js` (or `proof.js`, `search.js`, `script.js`); inline blocks further edits. — by design: PRODUCT.md "Inline CSS and JS in one HTML file" is a stated constraint (single static page, no build step).
- [x] `proof-note` uses `innerHTML` with row counts → XSS-adjacent pattern; use `textContent` + `<strong>` node. — done: index.html `proof()` sets `#proof-note` with textContent and a `<strong>` node; the file contains no innerHTML.
- [x] `proof()` fires twice on load (`fetch health` + `document.fonts.ready`) → double POST storm; single init with `Promise.all` once. — done: the init IIFE at the end of the script calls `proof()` once, after `checkHealth()`; Re-run and Reset call it only on user action.
- [x] Health-check logic inverted: `if (!d.ok) proof()` but proof also runs on fonts.ready → backend-down still fires proof; gate proof on health OK, show offline state otherwise. — done: the init IIFE calls `proof()` only when `checkHealth()` returns true, otherwise it shows the offline verdict.
- [x] No `try/catch` around `fetch("/api/health")` JSON parse (non-JSON 404 page returns HTML) → handle like `ask()` does. — done: `checkHealth()` wraps both the fetch and the JSON parse in try/catch.
- [x] `ask()` throws `"superseded"` as generic Error → typed abort (`AbortController`) so roll cancellation isn't logged as failure. — done: `ask()` sets `err.kind = "superseded"` and uses an AbortController for the 8 s timeout.
- [ ] Buttons during `proof()` share `safeBtn`/`unsafeBtn` busy flags → concurrent proof + manual click deadlocks disabled state; per-key busy map. — partly: requests are keyed per record (`tokens` map), but `busy()` still toggles one flag per button, so a superseded request's `finally` can re-enable a button another request is still using.
- [ ] `rollAll` 900ms hard wait blocks fast runs; reduced-motion gets 0 → make wait cancellable, tie to animation end.
- [ ] `printStatement` `text.indexOf(raw)` highlights first occurrence only; repeated payload occurrences unmarked → mark all.
- [ ] `FIELD=72` ruler assumes `0.65em` col width; proportional drift on zoom/font-swap → measure real `ch` via canvas or drop ruler on mismatch.
- [ ] No client-side input maxlength (`username`, `password`, `term`, `script`) matching server caps → add `maxlength`.
- [ ] Password field is `type="text"` → `type="password"` + show toggle.
- [ ] No empty-state guard: search with empty term still enables button → disable on blank.
- [ ] `pairTpl` clones duplicate `id="safeRecord{s}"` pattern; IDs with suffix break `label for` / anchor uniqueness on re-roll → use `data-*` + scoped `querySelector`.
- [x] 10 live `aria-live` regions in roll (one per sheet) → screen-reader spam; keep single `#rollStatus` live, sheets `aria-live="off"`. — done: roll sheets in `#pairTpl` carry no aria-live; the only live region for the roll is `#rollStatus` (role="status").
- [ ] No offline / 404-API banner beyond `lamp` text → persistent notice + disable run buttons when backend down. — partly: the lamp shows "backend unreachable" text, but there is no banner and the run buttons stay enabled while the backend is down.
- [x] No `prefers-reduced-motion` for `feed` on `.slip` / scroll jump when appending sheets → `scrollIntoView({block:"nearest"})` only when motion OK. — done: the reduced-motion rule in index.html sets `.record[data-printing]` animation to none, and the script makes no scroll calls, so there is no scroll jump.
- [ ] Print stylesheet hides `.actions` but leaves response `<pre>` at 260px scroll → expand `max-height:none` in `@media print`.
- [ ] Font preload `azeret-mono-var.woff2` no fallback if 404 → `font-display:swap` already set but no `local()` fallback stack test. — partly: `font:` shorthand has a fallback stack (ui-monospace, Menlo, monospace), but `@font-face` has no `local()` source and nothing tests the fallback.
- [x] No favicon / manifest → 404 noise in console. — done: index.html links `favicon.svg`, and an unmatched `/favicon.ico` is no longer requested by browsers. No manifest was added.
- [ ] No client-side tests (playwright/vitest) for `printStatement` edges (multiline, `;` in literal, overflow) → add unit tests.
