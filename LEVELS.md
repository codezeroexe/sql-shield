# Levels

<!-- levels
backend: 3/4 gaps=5
ux: 1/3 gaps=9
restyle: 2/2 gaps=0
design: 4/5 gaps=4
security: 2/2 gaps=0
ship: 2/2 gaps=0
test: 3/2 gaps=2
docs: 3/3 gaps=3
flow: phase=stopped left=3
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

### Re-audit for level 5 (2026-10-14)

Mode: audit. Target asked: 5. Reached: **1** (strict). Expert review only (code read plus browser walkthrough at 1280×720); nobody observed. Profile reused from above.

Level 5 does not fit: it needs ongoing use to measure, and a class demo has none. Level 4 needs 3–5 people from the audience watched doing the tasks; reachable only if the user runs those sessions. Recommended target: 3, or 4 with sessions.

Evidence:

- L1 tasks completable, controls labelled, no dead end: met (Reset database closes U1).
- L2 where am I / what happened: met (story headers, verdict, staged waits, lamp). Errors in user's words: met. One name per thing: **not met** (X2). Forms keep what was typed: **partial** (X3). Explanation matches what happened: **not met** (X1).
- L3 first success without help: met (proof pre-runs). Empty states: met. Undo: met through Reset database. Survives refresh: partial (statement kept; username, password and search term lost, X4). Setting fit: met (first viewport, Enter and Ctrl/Cmd+Enter, presenter keys).

Findings (expert review), ranked:

1. X1 Proof explains the wrong mechanism. The unsafe "why" text says the payload "commented out the rest", but with username `' OR '1'='1 --` the `--` lands inside a string; the password payload `anything' OR '1'='1` does the bypass. The injection tape, armed by the proof, shows exactly this, so the page contradicts itself. The proof note shows only the username payload.
2. X2 Four names for the unsafe path: interpolated (verdict, chips), unsafe (record labels), vulnerable (button), pasted (tape, plate).
3. X3 Re-run proof and Print all presets replace typed username and password with no way back.
4. X4 Username, password and search term are lost on refresh.
5. X5 Break it reports `changes: 1` after `DROP TABLE users` (stale count from the server). Needs backend.
6. X6 Single keys P and M fire anywhere outside a field; P opens the print dialog by accident.
7. X7 Printer wording on actions ("Print all presets", "one form feed each") still slows a learner (was U11).

### UX build (2026-10-14)

User chose target 4 with sessions; built X1 A, X2 A, X3 A + X4 A, X6. Reached: **2** strict, 3 once X5 (server) is fixed. Expert review only.

Built (2 Haiku, 1 Sonnet, sequential):

1. Proof payload `' OR 1=1 --`, password `x` for every attack preset; unsafe "why" text now true; proof note shows both fields.
2. One name pair in labels: Bound / Pasted flow and query, "Test bound login" / "Test pasted login", verdict "pasted"; single-key P removed (print button stays).
3. Undo for 10 s when Re-run proof or Print all presets replaces typed input; username, password and search term restored after a refresh, with Undo back to the proof.

Walkthrough after (1280×720, live): verdict 0 / 4; tape marks column 49 and the comment; typed `foo`, Re-run proof, Undo returns `foo`; refresh restores `foo` with note. Tests 72/72.

| Task | Steps before → after | Hesitation points before → after |
|---|---|---|
| Login bypass (proof) | 0 → 0 | explanation contradicted tape → none |
| Login bypass (own payload) | 2 → 2 | typed input lost on re-run → undo offered |
| Search leak | 2 → 2 | term lost on refresh → kept |
| Break it | 2 → 2 | stale `changes` count (X5) → fixed |

Open (expert review): X7 printer wording on actions; preset menu still names the old preset after a refresh restore.

X5 closed by backend-level (2026-10-14): UX now level 3 by expert review.

Level 4: session script in `ux-sessions.md`. Waiting on the user to run 3–5 sessions and bring the notes back. No observations recorded yet.

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

### Audit for level 5 (2026-10-14)

Mode: audit. Target asked: 5. Reached: 3. Recommended target: 4, plus two level-5 items (opt-in sound, narrative order). Full level 5 needs a phone layout, which the user waived, and custom illustration; neither fits a one-week class demo.

Profile reused from the design section above (presenter on a 1280×720 projector, cold reviewer, learner; keep the Continuous-Form Printout system; phone waived).

Level 4 evidence:

- Signature centrepiece that responds to the user: partial. The print feed (sheet feed, carriage sweep, stamp, column-72 overrun) belongs to this product, but it only replays a result. Nothing reacts while the user types.
- Motion system: partial. One mechanism (`[data-printing]` on `.record`) with variants feed / carriage / press / overrun / fresh. Five durations are hard-coded (340, 260, 200, 320, 900 ms) instead of tokens.
- Live data, staged warnings, resolved state: partial. The lamp polls `/api/health` (checking / online / down). A request goes straight from "printing…" to "timed out" at 8 s with no stage between. Recovery after "down" has no distinct "back online" moment.
- Loops pause when hidden: met (health poll checks `visibilityState`; filament loop only during "checking"; reduced-motion stops it).
- Navigation independent of animation: met (single page, content present before the feed finishes).
- Performance budget and weak-device reduction: not met. Only `prefers-reduced-motion` is honoured.

Level 5 evidence:

- Original interaction: partial (column-72 overrun is original, but not interactive).
- Custom illustration or imagery: not met (only the tractor-sheet mark).
- Opt-in sound or haptics: not met.
- Narrative structure: partial. Bands exist (proof, console, preset roll, search, statement, mitigation skeleton) but do not read as one story.
- Detail at every size and state: not met by choice (phone waived).

Gaps, ranked:

1. No signature centrepiece reacting to input (L4).
2. No staged warning before timeout; no resolved "back online" state (L4).
3. Hard-coded animation durations (L4).
4. No performance budget, no weak-device mode (L4).
5. Bands not ordered as a narrative (L5).
6. No opt-in sound (L5).
7. No original interaction beyond the feed (L5; closed by gap 1 if done well).
8. No custom illustration (L5).
9. Phone layout waived, so "every size" cannot be met (L5).

Recommended options:

1. Live injection tape: while the user types, the unsafe query re-prints on the tape and marks the exact character where data turns into syntax (closing quote, `--` comment). The safe side keeps the `?` unchanged. Client-side quote/comment scan only, labelled as a sketch; the server stays the truth.
2. Staged wait: 0–2 s "printing…", 2 s "still printing", 5 s amber "near the limit", 8 s "timed out"; lamp shows "back online" for 3 s after recovery.
3. Tokens `--t-ink`, `--t-carriage`, `--t-stamp`, `--t-overrun`, `--t-filament`.
4. Budget written in DESIGN.md (page weight, first verdict time, compositor-only properties, one loop maximum); lite mode on `hardwareConcurrency <= 4` or `deviceMemory <= 4`.
5. Running headers rewritten as one story: prove it, try it, leak it, break it, fix it.
6. Opt-in dot-matrix sound synthesised with Web Audio, off by default, toggle in the masthead, silent while the tab is hidden.

### Level 5 build (2026-10-14)

User chose target 5 with extras for the judge, then dropped the phone layout. Reached: **4**, with every level-5 requirement met except "detail at every size", which the user waived (phone not needed).

Built (sequential, one file; 6 Haiku, 4 Sonnet, plus 1 revert and 1 corrective on Haiku):

1. Motion tokens (`--t-advance`, `--t-ink`, `--t-carriage`, `--t-overrun`, `--t-overrun-lag`, `--t-stamp`, `--t-filament`), lite mode on weak hardware, performance budget in DESIGN.md.
2. Staged wait: "still printing" at 2 s, "near the limit" in `--warn` at 5 s; lamp "backend back online" for 3 s after an outage.
3. Injection tape (centrepiece) in Try it: live bound and pasted statements, the escape column marked, comment tail struck, verdict data / sql / broken.
4. Narrative headers: Prove it, Try it, Try them all, Leak it, Break it, Fix it.
5. Plate 1: technical-manual SVG of `admin' --` in a sealed value slot vs breaking the literal.
6. Phone bottom bar: built, then reverted at the user's request.
7. Opt-in dot-matrix sound (Web Audio, no files): carriage ticks, stamp thump, margin bell at column 72; off by default; suspended while hidden.
8. Print evidence (A4, timestamped) and presenter keys R / P / M / ?.
9. Page tests: 9 new cases; suite 69/69, about 15 s. Deliberate break of the tape's quote-closing logic fails 3 tape tests.

Corrective: the phone plate showed on desktop and character advance was 9.75 px, not 9; the tall SVG was removed and statement text set to 13.85 px, max width 720 px.

Verified live at 1280×720: verdict 0 / 4 rows in the first viewport; tape marker aligned to the escaping quote (0.01 px); key card toggles; sound toggle and a print run raise no console errors; plate aligned.

Not verified: sound heard through speakers; printed A4 output; projector colour in a bright room.

Open: "detail at every size" (waived). Note: the classic bypass username `' OR '1'='1 --` puts `--` inside a literal; the tape shows that truthfully (the password payload does the bypass).

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

## Docs

Date: 2026-10-14. Mode: audit. Target 3. Reached 2.

### Reader profile (assumed from the shared profiles; correct it if wrong)

- Presenter running it on the day: needs start, stop, reset, recovery, checklist. Comfortable with a terminal.
- Cold reviewer judging the project: needs what it is and why it is built this way, in the first screen of the README.
- Learner using the page: needs what to try and what to look at.
- Person changing the code (the builder later, or a classmate): needs how the parts fit, how to test, what changed. Assumed, not confirmed.

### Evidence

- L1 met: README says what it is, who for, how to run.
- L2 met: a clean copy runs from the written steps (`npm install`, `npm start`, `curl -X POST .../api/reset`, `BASE=... node --test test/api.test.js` all worked); every config value is described; presenter tasks and known failures (bad config, busy port, dead server) are covered.
- L3 not met: no changelog; no overview of how the parts fit and why; several pages contradict the code (below); no learner guide.
- API reference matches `server.js` on every route and status checked.

### Gaps (ranked by harm)

1. D1 Wrong: README "Tests" names only `test/api.test.js` and ports 3900-3989; `npm test` also runs `test/page.test.js` (jsdom, ports 3990-4089, `PAGE_BASE`).
2. D2 Contradictory: `need-to-fix.md` lists fixed items as open (`database.sqlite`, headers, length caps, `mode`); PRODUCT.md "Evidence on Hand" still says `database.sqlite` is generated on boot; README "Project structure" misses tests, favicon, fonts, `.env.example`, `.github`, design docs; README "Run locally" duplicates "Running the demo" with different commands (`npm install` and localhost vs `npm ci` and 127.0.0.1).
3. D3 Missing: overview for the person changing code: request flow, why one HTML file, why in-memory, `splitStatements`, the run-script wrapper and guards, how the page maps responses to stamps, the test harness.
4. D4 Missing: changelog.
5. D5 Missing: learner guide ("what to try"): the presets, the search leak term, a few statements for the box, what each stamp means.
6. D6 Clarity: README leftovers ("Suggested naming options"); `plans.md` and the pending `frontend-handoff.md` deletion are historical and unlabelled.

### Recommended options

- D1: fix the README section in place (recommended); alternative: generate from `package.json` scripts (overkill).
- D2: mark `need-to-fix.md` items done or replace it with a pointer to LEVELS.md (recommended: tick items with one-line notes); fix PRODUCT.md line; regenerate the tree; merge "Run locally" into "Running the demo".
- D3: one `ARCHITECTURE.md` page (recommended, Sonnet) vs a README section (crowds the reviewer's first screen) vs comments only (already exist, not an overview).
- D4: `CHANGELOG.md` from git history (recommended, Haiku).
- D5: a short README "What to try" section (recommended) vs in-page help (design work, out of scope).
- Stretch (level 4): run README commands as a test; link check in CI; decision records for the in-memory database and the block-list.
### Docs build (2026-10-14)

Reached 3. Built by 3 Haiku sub-plans and 1 Sonnet sub-plan, then reviewed on Opus.

- D1 closed: README "Tests" now describes both test files, their ports and `PAGE_BASE`.
- D2 closed: `need-to-fix.md` carries a status for every item (14 done, 10 partly, 6 by design, 13 open); `PRODUCT.md` evidence, driver-call and response-shape lines corrected; README tree regenerated; the duplicate "Run locally" section removed.
- D3 closed: `ARCHITECTURE.md` (161 lines): middleware order, decisions with reasons, server and page internals, tests, change checklist, known limits.
- D4 closed: `CHANGELOG.md` from git history.
- D5 closed: README "What to try" and a stamp glossary.
- D6 closed: naming list removed; `plans.md` marked historical.
- Review: README examples run as written against a clean copy (UPDATE then login, UNION search, discarded `DROP TABLE` tail, reset); middleware order in ARCHITECTURE.md matches `server.js`; 60/60 tests.

Open (level 4, stretch): README commands as tests, link check in CI, decision records, a timed newcomer walk-through. Not verified: DESIGN.md token names differ from the CSS custom properties (`ink-soft` vs `--ink-2`, `carbon-mid` vs `--carbon-2`); the page prints `db.all` for calls that run through `queryRows`.

## Notes for the user

- The global git ignore (`**/*` in `~/.config/git/ignore`) used to hide `test/`, `.github/`, fonts and design docs; the repo `.gitignore` now un-ignores them. They still show as untracked until you `git add` them.
- During the test build one executor killed three processes that belonged to another executor's run. No data was affected; the affected suite was re-run and passes.

### Backend fix: X5 (2026-10-14)

Handoff from ux-level, scope `/api/run-script`. Hosting profile unchanged. Root cause: SQLite `changes()` keeps the last write's count across DDL. The route now reports the difference in `total_changes()` around the statement, read inside the same serialized transaction, so DDL and reads report 0 and DML reports its real count. `lastID` is null when nothing changed. Regression test "run-script reports 0 changes for DDL after a write" in `test/api.test.js` fails with the old line and passes with the fix. Tests 73/73. Level unchanged (3/3). Known ceiling: trigger writes would be counted too; the demo has no triggers.

### Audit for level 4 (2026-10-14, called by levels)

Expert review only, live at the pane's desktop size plus API probes. Instructor treated as the cold reviewer from the profile, sitting beside the presenter at one screen. Reached: **3**. Level 4 blocked until sessions run (`ux-sessions.md`).

Less common paths walked:

- Mistake part way / returning after a break: after `DROP TABLE users`, `/api/health` still says ok and the lamp says "backend online". The next person to click a login test gets an engine error first; the way back (Reset database) is in another section.
- Two people at one screen: 138 of 152 visible text runs are under 14px (smallest 11px). Readable to the presenter, hard for an instructor half a metre further back.
- Second device: does not apply (one screen, local).

Open findings (expert review, ranked):

1. Y1 Broken database is invisible until a task fails. Options: A health reports a missing `users` table and the lamp reads "users table missing · Reset database" with the button beside it (recommended; small backend change); B the login and search errors gain a Reset database button in place; C auto-reset on next load (wrong: hides the lesson of the DROP).
2. Y2 Reading distance: most text under 14px. Needs design-level (type scale), not a UX rewrite.
3. Y3 Restore example and Reset database targets are under 28px tall; Reset is the recovery action and should be easy to hit. Needs design-level.
4. X7 Printer wording on actions ("Print all presets", "one form feed each"). Options: A plain verbs ("Run all presets") keeping the printer look (recommended); B keep, add a one-line legend.
5. Y4 Preset menu still names the old preset after a refresh restore. Option: A set the menu to a "Your own input" entry when restored fields differ (recommended).
6. Sessions not run (level 4 requirement).

Stretch (level 5): none fit; no ongoing use to measure.

Built (2026-10-14, 2 Haiku): X7 A, the roll button and its notes read "Run all presets", "one run each", "five payloads, ten results"; Y4 A, the preset menu names the fields' contents and shows "Your own input" otherwise. Walkthrough: load shows Classic bypass; typing `foo` shows Your own input; refresh restore shows Your own input, Undo returns Classic bypass. Tests 75/75. Open: Y1 (backend), Y2, Y3 (design), sessions.

### Audit for level 4 (2026-10-14, called by levels)

Hosting profile unchanged (localhost, one process, in-memory SQLite, presenter plus instructor at one screen). Waived by the user for this host: zero-downtime deploys and rollback, alerts to a person. Not applicable: retries with backoff (no external dependencies; SQLite is in-process). Tests 73/73, `npm audit` 0 vulnerabilities. Reached: **3**.

Level 4 evidence:

- Metrics, tracing: not met. Only `console.log`/`console.error` (server.js:19-599). Nothing records what each statement did or how long it took.
- Load test against a budget: not met. No load script, no stated budget.
- Concurrency shown by tests: partial. One test (test/api.test.js:368, five concurrent writes). No test for reset racing a script, or login/search running while a 6 s statement holds the chain.
- Dependency scan: met (CI `npm audit --omit=dev --audit-level=high`).

Open gaps (ranked):

1. B-Y1 (from ux Y1) `/api/health` runs `SELECT 1` only (server.js:243). After `DROP TABLE users` it still says ok, so the lamp says "backend online" while every task fails. Options: A health also checks `users` exists and its row count, returns `{ok:true, db:"intact"|"damaged", users:n}` (recommended: one query, lets the lamp say "users table missing · Reset database"); B a separate `/api/state` route (wrong: two calls for one lamp); C auto-reset (wrong: hides the DROP lesson).
2. B-M1 No statement trace. Options: A ring buffer of the last 50 statements per route (mode, SQL text as the engine got it, bound values, rows, ms, outcome) at `GET /api/trace`, polled by the page as a live "engine log" panel (recommended: doubles as level-4 tracing and the strongest teaching visual; in memory, matches one process); B Server-Sent Events push of the same (more moving parts, no gain for one viewer); C structured JSON logs only (meets the letter, invisible to the instructor).
3. B-L1 No load test. Options: A `npm run load`: stdlib script, 20 concurrent clients for 10 s across login/search, budget p95 under 50 ms and 0 errors, results recorded here (recommended); B autocannon (new dependency for one script).
4. B-C1 Concurrency gaps: reset arriving during a script; login and search during a 6 s statement. Option: A two `node:test` cases using the existing self-starting server (recommended).
5. B-T1 Run-script change count includes trigger writes if a script creates a trigger. Option: A document as known (recommended, teaching demo); B subtract trigger changes (no SQLite API for it).

Stretch (level 5): not recommended; one process on localhost by design.

### Audit for level 5 (2026-10-14, called by levels)

Profile reused: desktop or laptop screen only, presenter plus instructor at one screen; phone waived, so "detail at every size" now means every desktop width (1280 to 1920) and every state. Checked live at 1280×720 and 1920×1080. Reached: **4**.

Kept: tape centrepiece, motion tokens, staged wait, plate, opt-in sound, print evidence, narrative headers.

Open gaps (ranked):

1. D1 (with ux Y2) Reading distance and large screens. Text sizes in use: 11, 12, 12.5, 13, 14, 16, 18, 19, 60 px; most body text is under 14 px. At 1920×1080 the page stays a narrow column at the same pixel sizes, so the first screen is mostly empty paper and small print. Options: A presenter scale: `html { zoom }` steps of 1.0 below 1440 px, 1.15 from 1440, 1.35 from 1800, plus `+` / `-` / `0` keys to adjust live and a small "scale 115%" readout in the key card (recommended: keeps every px-aligned detail of the tape and plate intact, one place to change); B raise the type scale to a 14 px floor with rem everywhere (wrong now: the tape alignment depends on 12.5 px and 13.85 px and would need re-tuning); C fluid `clamp()` type (same re-tuning cost as B).
2. D2 Engine log panel (backend B-M1): new signature surface beside the records, a continuous-form strip that prints each statement the engine received, with mode chip, bound values, row count and ms. States: empty ("waiting for the first statement"), live (new line feeds in using `--t-feed`), damaged ("users table missing" in `--warn`, with Reset database inline), offline (the existing lamp state). Needs the backend trace route first. Recommended: this is the strongest single "wow" for an instructor: it shows what the database actually received, live.
3. D3 (ux Y3) Restore example and Reset database are under 28 px tall. Option: A use the existing primary button size for Reset database and the secondary size for Restore example (recommended).
4. D4 Damaged database state: the lamp has no designed state for "users table missing". Depends on backend B-Y1. Option: A lamp state `damaged` in `--warn` with text "users table missing", and Reset database next to it (recommended).

Stretch: a closing "lesson card" after Fix it that sums up the three rules (bind, don't paste; least privilege; one statement per call) as a printable tear-off.

## Flow (2026-10-14, raise audit)

Selection: ux-level, backend-level, design-level. Mode audit. Goal: impress the course instructor evaluating a university SQL injection mitigation demo. Local, on this device's screen, no phone layout.

| Skill | Now | Target | Status |
|---|---|---|---|
| ux-level | 3 | 4 (observed sessions) | built X7, Y4: 3, gaps 4 |
| backend-level | 3 | 4, waivers: zero-downtime deploy, alerts | audited: 3, gaps 5 |
| design-level | 4 | 5 | audited: 4, gaps 4 |

### Beginner re-audit (2026-10-14, redesign flow)

Expert review only (live walkthrough plus page text); nothing observed with real users.

Profile (confirmed): presenter-led. The student builder drives the page live; beginner classmates and the evaluating instructor watch. Beginners know what a login form is and a little SQL, not "payload", "prepared", "interpolated" or "bound". Desktop or laptop screen, no time pressure, help is the presenter.

Key tasks (watcher's finish line):
1. What SQL injection is: they see a login tricked by typed text.
2. How it is fixed: the same text fails on the safe version, and they can say why.
3. Try it: the presenter types an audience suggestion and both results show.
4. Why it matters: a search hands over every user.
5. What to remember: a short checklist of defences.

Measured now: one page, 999 words, about 26,300 px tall (about 36 screens at 720 px); every result shown as raw JSON plus a driver call.

Reached: **1** for this profile. L1 met (tasks completable, nothing dead-ends). L2 not met: no sense of where you are in 36 screens; wording is developer vocabulary, not the watcher's.

Findings (expert review, ranked):

1. U-B1 One long page. Watchers lose their place while the presenter scrolls; no step count, no "next". Options: A one lesson per screen as hash subpages in the same file (`#/1` to `#/6`) with Back / Next, step dots and arrow keys (recommended: no server change, keeps the tests' single page); B separate HTML files per lesson (duplicated script and style); C collapsible sections on one page (still one long scroll).
2. U-B2 Jargon on every screen: bound / pasted, prepared / interpolated, payload, value channel, "column 49", `db.get(..., callback)`, `POST /api/run-script`, endpoints. Options: A two plain names everywhere, "unsafe login" and "safe login", "attack text" for payload; introduce the `?` placeholder once, in the fix lesson (recommended); B keep technical names with hover definitions (still read as jargon at a distance).
3. U-B3 Answer before question. The first screen shows "BOUND → 0 rows / PASTED → 4 rows" before the watcher knows what a login query is. Option: A story order: how a login checks a password, the trick, why it worked, the fix, a leak, try it, checklist (recommended); B keep the proof-first hero (fast for the instructor, loses beginners).
4. U-B4 Chrome with no job for a watcher: status strip (SQLSHIELD DEMO, "backend online", sound off, print evidence, "press ? for keys", "node · express · sqlite3") and the footer (endpoints, seeded users, disclaimer). Options: A remove both; show a plain banner only when the server is down or the users table is missing ("The demo server is not running. Start it with npm start." / "The users table was deleted. Reset the demo."); show the four users as a table inside lesson 1 (recommended); B move them to an About screen.
5. U-B5 Raw JSON and driver calls in every result. Option: A show returned rows as a small table plus one sentence ("4 users came back: the attacker is in." / "No user came back: the login refused."), with the query and JSON behind "Show technical details" for the instructor (recommended); B remove the technical layer (loses depth the instructor will look for).
6. U-B6 Too many controls per section: preset menu with 6 entries, two test buttons, live tape, run all, search, free SQL, restore, reset. Option: A one main action per lesson; the full form only on the Try it lesson (recommended).
7. U-B7 Free SQL box ("Break it") can drop the table live and is beyond beginners. Options: A move to an optional last screen "Sandbox (advanced)" with Reset (recommended); B remove.
8. U-B8 "Try them all" repeats Try it with five attacks. Option: A remove; the Try it presets cover it (recommended); B keep inside Sandbox.
9. U-B9 Presenter extras: sound, print evidence, keys card. Option: A remove sound and print, keep arrow keys and R (re-run) only (recommended); B keep all behind a hidden presenter menu.

Proposed lessons (one screen each):

1. How a login checks your password: the users table (4 rows) and the login question in plain words.
2. The trick: the presenter types `' OR 1=1 --` into the unsafe login; everyone comes back.
3. Why it worked: the typed text highlighted in three parts: closes the quote, "or 1 equals 1" is true for every row, `--` hides the password check (simplified tape).
4. The fix: the same text into the safe login, 0 rows. The query with `?` and the text shown in a separate box: "the database gets the question and the answer separately".
5. It is not just logins: one search box, the unsafe search lists everyone.
6. Try it: both logins side by side, presets in plain words.
7. Checklist: use placeholders; check input; give the database account only what it needs; return only what is needed; test with attacks.
Optional: Sandbox (advanced): free SQL with Reset, and the engine log if design keeps it.

Earlier findings now superseded by this structure: Y1 (becomes the banner in U-B4), X7, Y4 (presets reworded in U-B2). Sessions (`ux-sessions.md`) need rewriting for the new lessons before level 4.

Stretch (level 4): rerun `ux-sessions.md`, rewritten for the lessons, with 3 to 5 classmates watching a presenter.

## Flow (2026-10-14, redesign audit)

Replaces the raise flow above (its backend build is done, uncommitted; the overlap corrective for the reset-during-script test was cancelled).

New direction from the user: the page is too complex, cluttered and full of jargon for beginners. It is a learning tool showing how SQL injection mitigation is implemented, for novices and the evaluating instructor. Remove AI-slop chrome ("backend online" lamp, footer, decorative status). Split the single page into subpages (lessons or steps). Desktop only.

| Skill | Now | Target | Status |
|---|---|---|---|
| ux-level | 1 (new profile) | 3 | audited: 1, gaps 9 |
| restyle-level | 2 | 3 | stopped by user: direction B "The Form" chosen; mockups lesson-1 and lesson-3 built, lesson-6 stopped |
| design-level | 4 | 5 (beginner-first structure, then polish) | not run (flow stopped) |
| test-level | 3 | 3, page tests for new structure | not run (flow stopped) |

### Restyle note (2026-10-14)

Direction B "The Form" was rejected by the user after mockups (did not look good). The user keeps the current style language (paper, ink, violet carbon accent, Azeret Mono) and wants only the layout and arrangement changed: lessons as separate screens, no status strip or footer, plain wording. Three layout options (A slides, B lesson rail, C explain plus demo) drawn for lessons 2 and 4 on the design canvas https://claude.ai/artifact/Vzu6QJmyk3VzbF2KqpbTbK. Waiting on the user's pick.

### Layout rebuild (2026-10-14)

User picked the B + C layout (lesson rail plus explain-and-demo) and asked for a tool as well as lessons. Built in four Sonnet sub-plans on public/index.html (3101 to 1092 lines) and test/page.test.js: rail with Learn (6 lessons) and Lab (Login tester, Search tester, SQL sandbox), database count and Reset in the rail footer, health banner (server down, users table missing), hash routes with arrow keys on lessons, live results on every lesson, "What the database ran" log fed by /api/trace on Lab screens. Removed: status strip, sound, print evidence, keys card, footer, hero proof, Try them all, printer motion. Style tokens and Azeret Mono kept. Tests 74/74 twice (about 11 s). Checked live at 1440x900: lesson 2 shows 4 users; Login tester shows 4 vs 0 with verdicts and the log filling.

Fixed the same day: Example select shows full text, rail 288px with one-line names, unsafe count red only on a leak, sandbox notes that only the first statement runs and shows "Not run: ..." for the ignored part. Open: ux-sessions.md needs rewriting for the new screens. Not verified: 1920 wide, the "Log paused" state, the 50-row cap.

### Landing and motion (2026-10-14)

Landing screen at #/ (rail hidden): headline, plain lede, "Start the lessons" and "Open the Lab", live preview of the same text giving 4 users unsafe vs 0 safe. Motion system on existing tokens: screen enter with direction (next / prev / other), count-up on results, staggered rows, leak underline sweep, safe outline pulse, highlight sweep in query lines, busy label and bar on buttons, log entries drop in, banner slides down, user count flashes after reset; all off under reduced motion; nothing waits on an animation. Tests 78/78 (three runs). Checked live at 1440x900, no console errors. Not verified by eye: every animation's feel; busy state (server answers too fast to see it).
