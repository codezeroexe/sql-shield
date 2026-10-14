# Levels

<!-- levels
backend: 3/3 gaps=3
ux: 3/3 gaps=2
restyle: 2/2 gaps=0
design: 3/4 gaps=3
security: 2/2 gaps=0
ship: 2/2 gaps=0
test: 3/2 gaps=2
flow: phase=close left=0
-->

## Shared

- Product: SQL injection mitigation demo (Express 5 + SQLite, single-page interface).
- Purpose: live class/demo presentation, and hosted learning tool for real users to try attacks safely.
- Users: audience/grader at the demo; public learners on the hosted version.
- Runs: locally for the demo; hosted publicly (host not yet chosen).
- Deadline: within one week of 2026-10-14.
- Model spend: medium (run top-ranked skills fully, defer the rest).

## Flow

- Started: 2026-10-14
- Route: raise. Mode: audit.
- Level plan (one at a time, ranked by `levels-next`):

| Skill | Current | Target | Reason |
|---|---|---|---|
| backend-level | unrated | 3 | Hosted deliberately-vulnerable endpoint needs a stable, resettable server |
| security-level | unrated | 3 | Public exposure of an injectable path; contain blast radius |
| ship-level | unrated | 2 | Repeatable deploy and DB reset before the deadline |

- Status:
  - backend-level: audit done, level 0 → target 3, 14 gaps (2026-10-14)
  - security-level: skipped by user (2026-10-14)
  - ship-level: skipped by user (2026-10-14)
- Route changed to **redesign** (2026-10-14). Plan confirmed:

| Skill | Current | Target | Mode |
|---|---|---|---|
| ux-level | unrated | 3 | audit |
| restyle-level | unrated | 2 | audit |
| design-level | unrated | 3 | build |
| test-level | unrated | 2 | audit |

  - ux-level: audit done, level 0 → target 3, 13 findings (2026-10-14)
  - restyle-level: done, direction A Front Page sketched at level 2, fresh review not run (2026-10-14)
  - design-level: done, level 3 reached (target 3–4), 4 sub-plans built, UX U2–U7, U9, U10, U12, U13 closed in the interface (2026-10-14)
  - test-level: pending
- Open risk carried: backend B1 (`COMMIT` script crashes server) unfixed.
- Queue:
  - security-level: file writes via `ATTACH` / `VACUUM INTO` from `/api/run-script` (B2); server bound to all interfaces (B6).
  - test-level: after any backend build, on changed paths.
  - backend-level (build): B1, B3, B4 block UX U2, U3, U1.
  - test-level: `public/index.html` changed (states, timeout, keyboard, storage); browser-level checks only so far.
  - design-level: "reset done" state waits on backend B4.

## Backend

Date: 2026-10-14. Mode: audit. Target 3. Reached 0.

### Hosting profile (confirmed)

- Runs on the presenter's Mac via `npm start`, one Node process, one SQLite connection.
- Intended reach: this machine only. Detected: `app.listen(port)` binds all interfaces (server.js:307), so the LAN can reach it.
- Load: a few users. Uptime: must stay up during the demo, presenter watching.
- Storage: `database.sqlite`, gitignored, wiped and reseeded on boot. Reset is the recovery; backups not needed.
- Public hosting deferred. Re-run Step 0 before any public deploy: `/api/run-script` must not go public as is.
- Removed by profile: authentication, rate limiting, TLS, multi-instance, off-machine backups.

### Level evidence

- L1 Documented command: met (README `npm start`).
- L1 Module boundaries: met for size (single 309-line file).
- L1 Config from env: partial. `PORT` from env; DB path hard-coded (server.js:7). No real secrets.
- L1 Input validation: partial. `mode` not allow-listed (server.js:126); `username`/`password` accept objects; no length caps.
- L1 No crash / no leak: **not met**. `{"script":"COMMIT"}` kills the process; bad JSON returns HTML stack trace with absolute paths.
- L2 Tests one command: partial. 19/19 pass, but `pretest` spawns a detached orphan server on port 3000.
- L2 Consistent error format: not met (`{error}`, `buildResponse`, HTML).
- L2 Versioned schema: not met; schema changes made via run-script survive restart.
- L2 Structured logs: not met.
- L2 Timeouts: not met; an unbounded query blocks the only connection.
- L3 Health check: partial (does not touch DB). Graceful shutdown: not met. Atomic writes: partial (BEGIN/COMMIT, no ROLLBACK, other requests can join the transaction). CI: not met. API contract: partial (README lists routes, not response shapes).

### Edge case counts

Handled 14, not handled 16, not applicable 20.

### Not handled

| Entry | Case | What goes wrong |
|---|---|---|
| run-script | `COMMIT` / `ROLLBACK` / `END` as script | wrapper `COMMIT` fails, unhandled `error` event, process exits |
| run-script | `ATTACH DATABASE 'public/x.db'`, `VACUUM INTO '...'` | creates files anywhere the process can write, incl. served web root |
| run-script, login (vulnerable), search | recursive CTE with no end | single connection blocked forever; every later request hangs |
| run-script, login (vulnerable), search | `SELECT` of millions of rows | memory blow-up, crash |
| run-script | `CREATE TRIGGER` / `ALTER TABLE` / extra tables | survive restart; trigger on users can break boot seed |
| run-script | `DROP TABLE users` mid-demo | login and search return 500 until restart |
| run-script | failing statement after BEGIN | no ROLLBACK; concurrent requests' statements can run inside this transaction |
| all POST | non-JSON or malformed body | 500 with HTML stack trace and absolute paths |
| login | `mode` any other string | silently runs safe path |
| login | `username` object/array | bound as `[object Object]` or JSON; no 400 |
| login, search, run-script | very long input | no cap beyond 100 kB body default |
| all | errors | three different shapes |
| boot | request before seed finishes | may see empty table |
| boot | DB open failure | `process.exit(1)` with no message to client |
| process | Ctrl-C / SIGTERM | no close of server and DB |
| network | LAN client | reaches arbitrary-SQL endpoint |

### Open gaps (ranked)

1. B1 Outage: transaction-control script crashes process.
2. B2 Security: file writes via ATTACH / VACUUM INTO.
3. B3 Outage: unbounded query hangs or exhausts memory.
4. B4 Wrong results: sabotage persists across restart; no mid-demo reset.
5. B5 Security: HTML stack traces on bad body.
6. B6 Security: binds all interfaces.
7. B7 Wrong results: weak input validation (`mode`, types, length).
8. B8 Maintainability: inconsistent error shape.
9. B9 Reliability: test runner orphans a server on port 3000; no tests for B1–B7.
10. B10 Wrong results: transaction isolation in run-script.
11. B11 Operations: no graceful shutdown.
12. B12 Operations: health does not check DB.
13. B13 Process: no CI.
14. B14 Docs: response shapes not written down.

### Accepted / not applicable (backend)

- Plaintext seed passwords: demo data by design, shown on the page.
- Arbitrary SQL writes in run-script: product feature; contain it, do not remove it.

## UX

Date: 2026-10-14. Mode: audit. Target 3. Reached 0. All findings are expert review (walkthrough in browser at 1280×720 plus code read); nothing observed with real users.

### User profile (confirmed)

- Presenter: drives the page live on a projector, knows the product, under time pressure; any failure must be readable and recoverable on stage.
- Cold reviewer (grader, hiring manager): reads without clicking; must get the core claim from the first viewport.
- Learner: clicks through alone; knows SQL basics, not this page.
- Key tasks: (1) login bypass, safe vs vulnerable; (2) search leak; (3) custom script. Finish line: viewer sees the bound path return 0 rows and the interpolated path return every row, and why.
- Setting: laptop plus projector, bright room, read from a distance. Help comes from the presenter in person.

### Steps and decisions per task (before)

| Task | Steps | Decisions | Hesitation points |
|---|---|---|---|
| Login bypass (pre-run proof) | 0 clicks + scroll 1.5 screens to reach unsafe record | 0 | Unsafe record below fold at 1280×720 |
| Login bypass (own payload) | pick preset, Load payload, Test safe, Test vulnerable = 4 | 2 | Preset choice does nothing until Load; Enter does nothing |
| Search leak | clear term, type payload from memory, Run comparison = 3 | 1 | No hint for the leaking term; records pre-stamped before run |
| Custom script | edit, Run statement = 2 | 1 | DROP/DELETE silently breaks other tasks; no way back in page |

### Level evidence

- L1 Tasks completable: met while the server is healthy.
- L1 Controls say what they do: mostly met; metaphor labels ("Print all presets", "Request slip") are weak.
- L1 No dead end: **not met**. After `DROP TABLE users` in Your own statement, login and search fail with "no such table" until a server restart; nothing in the page says so.
- L2 Where am I / what happened: partial; server down still shows "backend online".
- L2 Errors in user's words: not met ("invalid", "Failed to fetch").
- L2 One name per thing: not met ("invalid" means four different failures).
- L2 Forms keep typed input: not met (Re-run proof and roll overwrite fields).
- L3 First success without help: met for the cold reviewer (proof pre-runs on load).
- L3 Empty states: partial (preset roll good; search records pre-stamped "safe"/"injected").
- L3 Irreversible actions: partial (printed warning, no confirm, no undo/reset).
- L3 Survives refresh: not met (typed statement lost).
- L3 Setting fit: not met (no record in first projector viewport; no Enter-to-run).

### Open findings (ranked, expert review)

1. U1 Dead end: destructive statement breaks login and search, no reset in page. Needs backend B4 (reset).
2. U2 Server down or crashed: lamp still says "backend online"; sheets say "invalid · Failed to fetch". Needs backend B1.
3. U3 Hung request: button stays disabled forever, no waiting message, no cancel. Needs backend B3 and a client timeout.
4. U4 Projector first viewport (1280×720) shows only heading and thesis; unsafe "4 rows" result is 1.5 screens down.
5. U5 Double-click race: a late "superseded" error can overwrite a good result with "invalid".
6. U6 Enter does nothing in username, password, search; Ctrl/Cmd+Enter does nothing in the statement box.
7. U7 Choosing a preset does nothing until "Load payload" is clicked.
8. U8 Re-run proof and Print all presets overwrite typed username/password without warning.
9. U9 Search records show "safe"/"injected" stamps before anything ran; no hint for the leaking term.
10. U10 "invalid" stamp covers server down, 400 validation, engine syntax error and superseded.
11. U11 Printer metaphor in headings and buttons ("Request slip", "Preset roll", "form feeds") slows a learner.
12. U12 Typed statement lost on refresh; no "restore example" control.
13. U13 Empty username/password: 400 message does not point at the field.

## Restyle

Date: 2026-10-14. Mode: explore. Depth: replace. Target 2. Reached 2 (sketch built; fresh-context review not run).

### Profile (confirmed)

- Entry screen (masthead + proof pair), Read mode, presenter-operated on a 1280×720 projector in a bright room.
- Why: printer metaphor feels off for a security topic; user wants options.
- Keep: side-by-side safe/unsafe records with raw query, bound, call and response fields. Nothing else visual.
- Reject: hacker terminal, SaaS dashboard.

### Reading of the old design

Warm fanfold printout, one monospace face (Azeret Mono), violet carbon copy for unsafe, 72-column ruler. Variance 3, motion 3, density 8. Retired: printer vocabulary, mono for prose, 11px data on projector.

### Directions

- A. Front Page: sketched, then **parked by user** (2026-10-14): keep the existing printer design and raise it instead.
- B. Interlocking (route-map schematic): kept as alternate. Risk: abstracts the mechanism; highest build cost.
- C. Evidence Register (payload as central exhibit, orange tag): kept as alternate. Risk: crime-scene cliché.
- Standard documentation page: not chosen.

### Contract: A. Front Page

- Thesis: the result is the news; live row counts are the headline, the mechanism is the story underneath.
- Colour: newsprint #f6f4ef, press black #111214, ink-2 #3b3e44, rule #c9c5bb, spot ultramarine #1f3fbf (owns only the pasted column and its count), wash #e8ecfb, engine error #a3271b.
- Type: headline Instrument Serif 92–112px / 0.95; standfirst Public Sans 20–22px; body 19px; labels Public Sans 600 13px 0.08em uppercase; SQL/JSON IBM Plex Mono 15px min.
- Spacing 8/16/24/40/64. Corners 0. No shadows. Masthead double rule 3px + 1px; column rules 1px.
- First screen 1280×720: masthead 48px (name · "Live from localhost:3000" · lamp), headline "Same input. 0 rows bound. 4 rows pasted.", standfirst + "Try another payload" button, two ruled columns (Bound · prepared statement / Pasted · string interpolation) with query, bound values, response. Typed input inside the pasted query marked with wash + 2px underline.
- Signature: headline set from live API counts; every state (offline, timed out, engine refused, validation, reset done) uses the same headline slot. No motion.
- Fonts: Google Fonts in the mockup; the product port must self-host them (no external requests at demo time).

### Mockup

- Design canvas: https://claude.ai/artifact/X2cZJKmwz9CTUmwuRAvTG5 (boards: First screen 1280×720; Headline states).
- Not verified: phone width, real font rendering, and fresh-context review.

### Outcome

User kept the existing Continuous-Form Printout design (DESIGN.md). Direction A stays on the canvas as a reference; its headline-states wording may be reused.

## Design

Date: 2026-10-14. Mode: build. Target: 3 (user said "3 or 4"). Reached: **3**.

### Profile (reused)

Presenter on a 1280×720 projector in a bright room, cold reviewer, learner. Keep the Continuous-Form Printout system (DESIGN.md) and raise it; do not replace it. Phone layout waived by the user ("phone is not required"); the page must only not break at phone width.

### Chosen and built (4 sub-plans: 3 Haiku, 1 Sonnet)

1. G5 Tokens: spacing `--s-1..--s-5`, timing `--t-fast/--t-lamp/--t-feed`, `--ease-feed`; inline styles removed.
2. G3 Mark: tractor-sheet mark in the masthead, same drawing as `public/favicon.svg`.
3. G1 States + G2 entry: verdict row with "Re-run proof" as the one primary action in the first projector viewport; one stamp word per failure (offline, timed out, refused, engine error); 8 s client timeout; superseded responses paint nothing; lamp polls `/api/health` every 10 s while the tab is visible; search stamps start "not run".
4. G6 Behaviour: Enter runs the request slip and the search, Ctrl/Cmd+Enter runs the statement; choosing a preset arms it ("Load payload" removed); the statement is kept in localStorage with "Restore example"; a 400 marks and focuses the empty field.

### Verified (live, 1280×720)

- Verdict and both records visible without scrolling (proof head y=476, safe record y=528).
- Server killed: lamp "backend unreachable", offline stamps and tally. Empty fields: "refused", both fields marked, focus on username, mark clears on input. `SELEKT 1`: "engine error". Recursive CTE: "timed out" after 8 s.
- Enter in search and Cmd+Enter in the statement run them. Preset change arms the slip. Statement survives in storage; Restore example clears it.
- Phone width 375: no horizontal scroll. API tests 19/19.

### UX findings closed by this build

U2 (client side), U3 (client side), U4, U5, U6, U7, U9, U10, U12, U13. U8 softened by the verdict hint. Still open: U1 (needs backend B4 reset), U11 (printer wording kept with the design), U3 server side (B3).

### Open (level 4, stretch)

1. Signature centrepiece that responds to the user.
2. Motion as a system: timing tokens exist, one shared transition mechanism does not.
3. Stated performance budget.

### Not verified

Projector colour and contrast in a real bright room; fresh-context review.

## Backend build (2026-10-14)

Target 3, reached 3 for the confirmed hosting profile (localhost, one presenter). Built by one Sonnet sub-plan on `server.js`, one Haiku sub-plan on tests and `package.json`, one Haiku sub-plan on README, PRODUCT.md and CI.

Closed: B1 (transaction-control and `VACUUM` refused with 400; wrapper statements have callbacks), B2 (attached-database limit 0 so `ATTACH` is an engine refusal; `VACUUM` refused), B3 (6 s interrupt gives 504, 500-row cap gives `truncated`), B4 (in-memory database, `POST /api/reset`, page button), B5 and B8 (JSON error middleware, JSON 404 under `/api`), B6 (binds 127.0.0.1, `HOST` overrides), B7 (types, lengths, `mode` allow-list), B9 (tests start their own server on a random port), B10 (run-script calls serialised), B11 (SIGINT/SIGTERM shutdown), B12 (health runs `SELECT 1`, 503 on failure), B13 (`.github/workflows/ci.yml`), B14 (README API contract).

Open, accepted: structured logs and versioned schema (not needed: in-memory, reseeded); concurrency, boot-failure, 413, truncated search and `unhandledRejection` paths are not covered by tests; `RETURNING` rows are subject to the same cap.

Evidence: `npm test` 33/33, no orphan process. Live check at 1280x720: `DROP TABLE users` gives "engine error", Reset database restores the verdict, `COMMIT` shows "refused" and the server stays up.

## Security section (2026-10-14)

Target 2, reached 2. Mode build, run after the backend build. Threat profile reused from Backend hosting profile.

### Threat model (short)

- Assets: presenter's uptime during the demo; the demo database (throwaway, fake users, no secrets); the presenter's machine.
- Likely attackers: nobody realistic on a trusted network; a hostile web page open in the presenter's browser (cross-site and DNS rebinding); another device on the same network if `HOST` is widened.
- Entry points: `/api/login-demo`, `/api/search-demo`, `/api/run-script` (arbitrary SQL by design), `/api/reset`, `/api/health`, static files.
- Trust boundary: the loopback interface. Everything past it is out of scope until a real deploy.

### Audit (own local copy only)

Sound: 0 known dependency vulnerabilities (`npm audit --omit=dev`); no secrets in code or history; no HTML-injection sinks in the page (no `innerHTML`, `eval`); no CORS headers, so cross-origin pages cannot read responses, and a `text/plain` cross-site POST is refused; static files confined to `public/`, path probes return only `index.html`; no stack traces or paths in errors; no external requests (font is local).
Does not apply: sign-in, sessions, password hashing, per-user access, CSRF tokens, rate limits. The product has no accounts and its seed passwords are fake and shown on the page.

### Findings and fixes

- S1 medium, closed: Host header unchecked allowed DNS rebinding to `/api/run-script` and `/api/reset`. Now only `localhost`, `127.0.0.1` and `[::1]` are accepted while bound to loopback (403 otherwise). Skipped when `HOST` is widened, on purpose.
- S2 low, closed: no response headers and `X-Powered-By` exposed. Added `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, COOP/CORP same-origin and a CSP (`default-src 'none'`, same-origin script, style, font, connect; inline allowed because the page is one file). `npm audit --omit=dev --audit-level=high` added to CI.
- Evidence: 41 of 41 API tests (8 new). Live check: page, font and API calls work under the CSP.

### Accepted risks

- `/api/run-script` runs arbitrary SQL by design (product feature). Safe only on loopback. A real deploy needs `security-level` first, with run-script made read-only or removed.
- The CSP allows inline script and style. Moving them into files would remove that; not needed for a local demo.
- The Host-check 403 carries no security headers (it runs first). Harmless.
- Not done, level 3: automated rate limiting, security-event logging, written breach plan. Not needed for loopback.

## Ship section (2026-10-14)

Target 2, reached 2. Mode build. Release profile: localhost demo on the presenter's Mac, one process, in-memory database, must stay up during the class demo; no public deploy.

### Rehearsal (clean copy of the non-ignored files)

Before: a clean clone lacked `public/fonts/`, `public/favicon.svg`, `test/`, `.github/`, `DESIGN.md`, `PRODUCT.md` and `LEVELS.md`, because the user's global git ignore (`**/*` in `~/.config/git/ignore`) hides them. No `.env.example`, no `engines`, no start-up config check, no written run/stop steps.
After: `npm ci`, `npm test` (48/48) and `npm start` work from the copy. `PORT=abc` stops with `Invalid PORT "abc": use a whole number from 0 to 65535.` No orphan process left.

### Built (3 Haiku sub-plans)

1. `.gitignore` now un-ignores `.github/`, `test/`, `public/`, `DESIGN.md`, `PRODUCT.md`, `LEVELS.md`, `.env.example` (still ignored: `node_modules`, `.env`, `*.sqlite`, `.claude/`, `.impeccable/`, the zip). New `.env.example` documents `PORT`, `HOST`, `DB_PATH`.
2. `server.js` validates `PORT`, `HOST` and `DB_PATH` at start and reports a busy port (`already in use`). `package.json` `engines: node >=20`. 8 new tests.
3. README "Running the demo": requirements, start, config table, stop, reset, restart, pre-demo checklist.

### Concerns

In place and tried locally: build, start, stop (SIGINT/SIGTERM tested), health, reset, config failure, clean checkout.
Never tried: restart after a crash by a supervisor (none exists; the presenter restarts with `npm start`), backup and restore (not needed, in-memory), rollback (no deploy).
Out of level 2 and out of profile: deploy script, process manager, monitoring, alerts, staging.

### Pending live steps for the user

1. Commit the new files (they show as untracked): `git add .gitignore .env.example .github test public DESIGN.md PRODUCT.md LEVELS.md README.md package.json server.js`, then commit. Undo: `git reset`.
2. Before the demo: walk the checklist in README "Running the demo".

## Test section (2026-10-14)

Target 2, reached 3 (ahead of target). Mode build. Profile reused: localhost class demo, one presenter, critical flows = login bypass proof, search leak, own statement, reset, failure states.

### Audit

- Two full runs before the build: 48/48 both times, 6.8 s, identical.
- Deliberate breaks in a throwaway copy (originals untouched): 6 of 7 caught (safe login result, row cap, Host check, frame header, `ATTACH` limit, escaping the injection). The 7th, a 60 s server timeout, was not caught cleanly: the runaway-query test hung instead of failing.
- Page (`public/index.html`): no automated tests.

### Built (1 Sonnet, 1 Haiku)

- `test/page.test.js`, 12 tests, jsdom 30 against the real server on a random port: load verdict and lamp, empty fields (refused, `aria-invalid`, focus), preset arming, Ctrl+Enter and Cmd+Enter, saved statement and Restore example, engine error, refused `COMMIT`, DROP then Reset database, offline, server 504 as "timed out", client 8 s timeout. `package.json` test script runs `test/*.test.js`; `jsdom` is a devDependency.
- API runaway test now aborts after 10 s so a missing server timeout fails instead of hanging.
- Break checks on the page copy: `engine oops`, wrong localStorage key and wrong 504 status each fail the suite.

### Result

60 of 60, twice, 9.5 s, no orphan process, also from a clean copy (`npm ci`, `npm test`). Bugs found by the new tests: none.

### Open gaps

1. Real-browser check: jsdom does not render layout, fonts or the 1280×720 projector view; that stays a manual step (README pre-demo checklist).
2. If the server timeout is broken, the suite takes about 60 s to finish (the test itself fails at 10 s).

## Notes for the user

- The global git ignore (`**/*` in `~/.config/git/ignore`) used to hide `test/`, `.github/`, fonts and design docs; the repo `.gitignore` now un-ignores them. They still show as untracked until you `git add` them.
- During the test build one executor killed three processes that belonged to another executor's run. No data was affected; the affected suite was re-run and passes.
