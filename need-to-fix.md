# need-to-fix.md

## Backend (`server.js`, `package.json`, `database.sqlite`)

- [ ] Plaintext passwords in seed (`alice/pw123`, `bob/hunter2`, etc.) → hash (bcrypt/scrypt) even for demo, or mark clearly non-auth.
- [ ] `DELETE FROM users` + reseed on every boot wipes data → seed only if empty (`INSERT OR IGNORE` / count check).
- [ ] `database.sqlite` committed to git + overwritten at runtime → gitignore it, seed on first run.
- [ ] `/api/run-script` allows arbitrary writes (`DROP`, `DELETE`, `INSERT`, `UPDATE`) → restrict to `SELECT` allowlist or read-only connection; currently destructive by design.
- [ ] No input length / size caps on `username`, `password`, `term`, `script` → add max lengths + `express.json({limit})`.
- [ ] No rate limiting → add `express-rate-limit` on login + run-script (brute-force / DoS).
- [ ] No security headers (`helmet`) → add.
- [ ] No CORS policy set → set explicit `cors({origin})` or document why open.
- [ ] `mode` param unvalidated (any string falls through to safe path) → allowlist `safe|vulnerable`, 400 otherwise.
- [ ] `splitStatements` misses `--` inside line without `\n` edge, `/*` unclosed, `"`/`\``/`[]` escapes → fuzz-test; consider `sqlite` parser instead of hand-roll.
- [ ] `db.get` safe path returns `[]` envelope on error without `query/executed/boundValues` (inconsistent with vulnerable branch) → unify shape.
- [ ] `search-demo` runs two nested `db.all` serially, no input sanitization on `term` length, error loses which path failed → split errors, cap term at e.g. 200 chars.
- [ ] `run-script` `BEGIN`/`COMMIT` without `ROLLBACK` on error → failed write can leave txn open; add rollback path.
- [ ] `changes()`/`lastID` probe runs even for `SELECT` then discarded → skip probe when `readsOnly`.
- [ ] `readsOnly` regex misses `VALUES (...)`, `TABLE`, `PRAGMA` writes → use strict `^SELECT/WITH/EXPLAIN` allowlist + reject all else if locking down.
- [ ] No request logging (`morgan`/`pino`) → add minimal logging.
- [ ] No graceful shutdown (`SIGINT` close db/server) → add.
- [ ] `process.exit(1)` on DB open fail with no retry → surface error, don't hard-exit in library use.
- [ ] `package.json`: `main: index.js` doesn't exist; `pretest` spawns orphan detached `server.js` on port 3000 (conflicts, leaks) → use `node --test` with in-process app or `testcontainers`; export `app` from server.js.
- [ ] Port 3000 hardcoded default collides (user has another app on 3000) → respect `PORT`, document it.
- [ ] No `.env` / config → add `dotenv` + `PORT`, `DB_PATH` vars.
- [ ] Missing tests: rate-limit, oversize body, invalid mode, concurrent writes isolation, `run-script` DROP actually blocked/persisted.

## Frontend (`public/index.html` — 2138 lines, single file)

- [ ] Split monolith → `styles.css` + `app.js` (or `proof.js`, `search.js`, `script.js`); inline blocks further edits.
- [ ] `proof-note` uses `innerHTML` with row counts → XSS-adjacent pattern; use `textContent` + `<strong>` node.
- [ ] `proof()` fires twice on load (`fetch health` + `document.fonts.ready`) → double POST storm; single init with `Promise.all` once.
- [ ] Health-check logic inverted: `if (!d.ok) proof()` but proof also runs on fonts.ready → backend-down still fires proof; gate proof on health OK, show offline state otherwise.
- [ ] No `try/catch` around `fetch("/api/health")` JSON parse (non-JSON 404 page returns HTML) → handle like `ask()` does.
- [ ] `ask()` throws `"superseded"` as generic Error → typed abort (`AbortController`) so roll cancellation isn't logged as failure.
- [ ] Buttons during `proof()` share `safeBtn`/`unsafeBtn` busy flags → concurrent proof + manual click deadlocks disabled state; per-key busy map.
- [ ] `rollAll` 900ms hard wait blocks fast runs; reduced-motion gets 0 → make wait cancellable, tie to animation end.
- [ ] `printStatement` `text.indexOf(raw)` highlights first occurrence only; repeated payload occurrences unmarked → mark all.
- [ ] `FIELD=72` ruler assumes `0.65em` col width; proportional drift on zoom/font-swap → measure real `ch` via canvas or drop ruler on mismatch.
- [ ] No client-side input maxlength (`username`, `password`, `term`, `script`) matching server caps → add `maxlength`.
- [ ] Password field is `type="text"` → `type="password"` + show toggle.
- [ ] No empty-state guard: search with empty term still enables button → disable on blank.
- [ ] `pairTpl` clones duplicate `id="safeRecord{s}"` pattern; IDs with suffix break `label for` / anchor uniqueness on re-roll → use `data-*` + scoped `querySelector`.
- [ ] 10 live `aria-live` regions in roll (one per sheet) → screen-reader spam; keep single `#rollStatus` live, sheets `aria-live="off"`.
- [ ] No offline / 404-API banner beyond `lamp` text → persistent notice + disable run buttons when backend down.
- [ ] No `prefers-reduced-motion` for `feed` on `.slip` / scroll jump when appending sheets → `scrollIntoView({block:"nearest"})` only when motion OK.
- [ ] Print stylesheet hides `.actions` but leaves response `<pre>` at 260px scroll → expand `max-height:none` in `@media print`.
- [ ] Font preload `azeret-mono-var.woff2` no fallback if 404 → `font-display:swap` already set but no `local()` fallback stack test.
- [ ] No favicon / manifest → 404 noise in console.
- [ ] No client-side tests (playwright/vitest) for `printStatement` edges (multiline, `;` in literal, overflow) → add unit tests.
