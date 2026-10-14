# SQLShield: A Teaching Tool for SQL Injection Mitigation

Project report. Course: Cyber project. Repository: `codezeroexe/sql-shield` (branch `redesign-lessons-lab`).

## 1. Summary

SQLShield is a small web application that teaches how SQL injection works and why parameterised queries stop it. It runs a real login and a real search against a real SQLite database in two ways: once with the user's text pasted into the SQL string (unsafe), and once with the text sent as a bound value (safe). The two results are shown side by side for the same input, together with a live log of the exact SQL statement the database received. The page has a landing screen, six short lessons for beginners, and a Lab with three tools (login tester, search tester, SQL sandbox). It runs only on the user's own machine, on a throwaway in-memory database, and it is covered by 78 automated tests, a load test and a continuous-integration workflow.

## 2. Problem statement

### 2.1 What SQL injection is

SQL injection happens when an application builds a SQL statement by joining program text and user input into one string. If the input contains SQL syntax, the database cannot tell which part the programmer wrote and which part the user wrote, and it runs the user's syntax as code.

The classic example is a login check. The application builds:

```sql
SELECT id, username FROM users WHERE username = '<name>' AND password = '<password>'
```

If a user types `' OR 1=1 --` as the name and `x` as the password, the string becomes:

```sql
SELECT id, username FROM users WHERE username = '' OR 1=1 --' AND password = 'x'
```

The first quote closes the name early. `OR 1=1` is true for every row. `--` starts a comment, so the password check is ignored. The query returns every user and the login succeeds. This is the example used in lesson 3 of the tool.

### 2.2 Why it matters

A single injectable input can let an attacker log in without a password, read data that was never meant to be shown, or change and delete data. The cause is a coding mistake (building SQL from strings), and the fix is well known (separate the SQL from the values). Even so, the mistake keeps being made, so it needs to be taught well.

### 2.3 The specific problem this project addresses

Beginners usually learn SQL injection from text alone: a description of an attack string and a sentence saying "use prepared statements". They do not see what the database actually receives, and they do not see why the fix works. The attack stays abstract, and the fix is memorised as a rule rather than understood as a mechanism.

PRODUCT.md states the intended learning outcome: the viewer should understand one specific thing, that binding a value is categorically different from pasting it into a string. The project exists to make that difference visible, with real execution rather than a mock-up.

## 3. Objectives

The tool had to:

1. **Show the attack working.** The unsafe path must really run and really return rows. PRODUCT.md makes this a hard constraint: the bypass is never softened, hidden or mocked.
2. **Show the fix on the same input.** Both paths receive the same text, against the same database, through the same endpoint; only the way the SQL is constructed differs.
3. **Let people try their own input.** A login tester, a search tester and a free SQL sandbox accept any text the user types.
4. **Stay safe to run.** The deliberately vulnerable code must be contained: bound to the local machine, limited in time and output size, and resettable.
5. **Be clear to beginners.** Plain wording, one idea per screen, no unexplained jargon. A beginner re-audit recorded in LEVELS.md led to the lesson structure described in section 7.

## 4. Our solution

### 4.1 What the user sees

- **Landing screen (`#/`).** A headline, a one-paragraph introduction, two buttons ("Start the lessons" and "Open the Lab"), and a live preview that sends the text `' OR 1=1 --` to both logins and shows the unsafe count against the safe count. On a fresh database this is 8 users unsafe and 0 safe.
- **Six lessons (`#/learn/1` to `#/learn/6`).** Each lesson is one screen with a few sentences of explanation and a live demonstration fed by the real API. Titles: How a login works; The trick; Why it worked; The fix; Not just logins; What to remember. Lesson 3 marks the three parts of the attack text (the closing quote, `OR 1=1`, and the `--` comment). Lesson 4 runs the same text through the unsafe and safe logins side by side and shows the `?` placeholder and the separately bound values. Lesson 5 repeats the idea for a search box. Lesson 6 is a five-point checklist: use placeholders, check what comes in, give the app only the access it needs, return only what is needed, test with attacks. Arrow keys and Back/Next links move between lessons.
- **Lab (`#/lab/login`, `#/lab/search`, `#/lab/sandbox`).**
  - Login tester: name and password fields, an example menu (normal login, log in as everyone, log in as admin, read other columns, broken text), and one button that runs both logins.
  - Search tester: one search field, one button that runs both searches.
  - SQL sandbox: a text area that runs exactly what the user types against the demo database, with a printed warning, a "Restore example" button, and a note that only the first statement runs.
- **"What the database ran" log.** On the Lab screens a panel polls `GET /api/trace` and lists, per request, the SQL text the engine received, whether it was the safe or the unsafe path, row count, time in milliseconds and outcome.
- **Reset and recovery.** The left rail shows the number of users in the demo database and a "Reset database" button. A banner appears only when something is wrong: the server cannot be reached, or the `users` table is missing (for example after `DROP TABLE users` in the sandbox). The banner offers Reset directly.

### 4.2 The core mechanism

Both queries are in `server.js`, route `POST /api/login-demo`.

Unsafe (string-built), used when `mode` is `"vulnerable"`:

```js
const unsafeQuery = `SELECT id, username FROM users WHERE username = '${username}' AND password = '${password}'`;
```

Safe (parameterised), used when `mode` is `"safe"`:

```js
const safeQuery = "SELECT id, username FROM users WHERE username = ? AND password = ?";
const boundValues = [username, password];
db.get(safeQuery, boundValues, ...);
```

The search route has the same pair:

```js
const safeQuery   = "SELECT id, username FROM users WHERE username LIKE ? ORDER BY username";
const unsafeQuery = `SELECT id, username FROM users WHERE username LIKE '%${term}%' ORDER BY username`;
```

with the safe query called as `queryRows(safeQuery, ["%" + term + "%"], ...)`.

**Why binding holds.** In the safe version, the SQL text is fixed before any user input exists. The database compiles `... WHERE username = ? AND password = ?` into a statement with two empty value slots, and the user's text is supplied afterwards through the driver as data for those slots. Whatever the text contains, including quotes and `--`, it is compared as a plain string against the stored values and never parsed as SQL. In the unsafe version the user's text is part of the string that is compiled, so any SQL syntax in it takes effect. The tool demonstrates this rather than asserting it: the same text `' OR 1=1 --` returns every user on the unsafe path and nobody on the safe path, because no user is named `' OR 1=1 --`.

**What the unsafe path does not do.** The SQLite driver compiles one statement per call, so a stacked statement after the first `;` is not run. The server splits the string with `splitStatements` and returns the compiled part (`executed`) and the discarded tail (`ignored`), so the page never claims that a stacked statement ran when it did not.

## 5. Technology used

| Layer | Choice | Where recorded |
| --- | --- | --- |
| Frontend | One HTML file (`public/index.html`), inline CSS and vanilla JavaScript, no framework, no build step | PRODUCT.md, ARCHITECTURE.md |
| Routing | Hash routes (`#/`, `#/learn/N`, `#/lab/...`) via a `hashchange` listener | `public/index.html` |
| Font and styling | Azeret Mono (self-hosted `public/fonts/azeret-mono-var.woff2`), CSS custom properties as design tokens, motion tokens | DESIGN.md |
| Runtime | Node.js, `engines: >=20` | `package.json` |
| Web framework | Express 5 (`^5.2.1`) | `package.json` |
| Database | `sqlite3` (`^6.0.1`), in-memory by default | `package.json`, `server.js` |
| Tests | `node:test`, `jsdom` (`^30.1.2`, dev only) | `package.json`, `test/` |
| Load test | `scripts/load.js`, standard library only | `scripts/load.js` |
| CI | GitHub Actions on Node 20: `npm ci`, `npm audit --omit=dev --audit-level=high`, `npm test` | `.github/workflows/ci.yml` |

### 5.1 Frontend

One HTML file with inline CSS and one inline `<script>`. Reasons recorded in the project:

- PRODUCT.md makes "single static page, no framework, no build step, no bundler" a constraint. A student, classmate or the instructor can open one file and read all the client code.
- ARCHITECTURE.md records the cost: the Content-Security-Policy must allow `'unsafe-inline'` for script and style, because the code is not in separate files.
- Hash routing keeps all screens in one file with no server change and keeps page tests on a single page. The beginner re-audit in LEVELS.md compared it with separate HTML files per lesson (duplicated script and style) and collapsible sections (still a long scroll), and chose hash subpages.
- The font is self-hosted so the page makes no external requests.
- Design tokens (colours, spacing scale, motion durations) are CSS custom properties on `:root`: a paper-and-ink look with one monospace face, square corners and a single violet accent. Motion (screen enter, count-up of results, staggered rows, highlight sweeps, busy buttons) uses the same tokens and is turned off under `prefers-reduced-motion`.
- The page renders only real server responses. Error states are classified from real failures: offline, timeout, refusal, engine error.

### 5.2 Backend

`server.js` is the whole backend. Node.js and Express 5 serve the static page and a small JSON API over one `sqlite3` connection.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Runs `SELECT 1`, then counts `users`. Returns `db: "intact"` with the user count, or `db: "damaged"` if the table is missing; 503 if the database is unavailable |
| `POST /api/login-demo` | `{ mode: "safe" or "vulnerable", username, password }`; runs the bound or string-built query |
| `GET /api/search-demo?term=` | Runs the bound and the string-built search and returns both |
| `POST /api/run-script` | Runs the user's own statement as typed (SQL sandbox) |
| `POST /api/reset` | Drops every trigger, view, table and index, then reseeds eight users |
| `GET /api/trace` | Returns statement log entries, optionally only those after a given id |

Safety controls (all in `server.js`, covered by tests):

- **Localhost binding.** `HOST` defaults to `127.0.0.1`. `PORT`, `HOST` and `DB_PATH` are validated at start-up; a bad value stops the server with a message naming the variable.
- **Host header check.** While bound to loopback, only `localhost`, `127.0.0.1` and `[::1]` are accepted as Host; anything else gets 403. This stops DNS rebinding from a hostile web page. Skipped if `HOST` is deliberately widened.
- **Response headers.** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, COOP and CORP same-origin, and a CSP with `default-src 'none'` and same-origin script, style, font and connect sources. `X-Powered-By` disabled.
- **Body and input limits.** JSON bodies 100 KB. Login and search input 200 characters; scripts 10,000 characters. `mode` must be one of two allowed words. Credentials must be strings.
- **6-second statement timeout.** `QUERY_TIMEOUT_MS = 6000`; a timer interrupts the statement and the API answers 504.
- **500-row cap.** `ROW_CAP = 500`; further rows are not fetched and the response is marked `truncated`.
- **One statement per call.** The driver compiles only the first statement; `splitStatements` reports the discarded tail.
- **Blocked transaction keywords.** `BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`, `VACUUM` are refused with 400 when they open a script. `ATTACH` is refused by the engine (attached-database limit set to zero).
- **Serialised scripts.** Sandbox statements run one at a time, each in a transaction, so the reported change count belongs to that statement (measured as the difference in SQLite's total change counter, so DDL reports 0).
- **Reset.** `POST /api/reset` restores the demo state, including after `DROP TABLE users`.
- **Consistent errors.** Malformed JSON 400, oversized body 413, unknown `/api` path 404, all JSON; stack traces are logged server-side and never sent.
- **Graceful shutdown.** SIGINT and SIGTERM close the HTTP server and database; a 3-second timer forces exit if closing hangs.
- **Trace.** A ring buffer of the last 50 statements (`TRACE_MAX = 50`) in memory.

### 5.3 Testing and tooling

- **API tests** (`test/api.test.js`, 60 tests, `node:test`). They start their own server on a random port and cover both paths of login and search, the sandbox and its limits, reset, health, input refusals, headers, the Host check, trace, start-up failures, and concurrency (five simultaneous script writes; reset during a long script; login and search answering while a long script runs).
- **Page tests** (`test/page.test.js`, 18 tests, jsdom). They load the real `public/index.html` against a real server and check routing, the landing page, the lessons, the Lab tools, the health banner, the reset button, the log, and that removed interface elements stay removed.
- **Load test** (`npm run load`, `scripts/load.js`). Starts its own server; 20 concurrent clients for 10 seconds over bound login, pasted login and search. Budget: p95 under 50 ms and no errors. Result in section 8.
- **CI.** `.github/workflows/ci.yml` runs on every push and pull request with Node 20: `npm ci`, `npm audit --omit=dev --audit-level=high`, `npm test`.
- **Dependency audit.** `npm audit --omit=dev` reported 0 vulnerabilities when we ran it.

## 6. Architecture

```
Browser: public/index.html  (hash routes, vanilla JS, fetch)
        |
        |  JSON over HTTP, 127.0.0.1 only
        v
Express 5 (server.js), middleware in order:
   1. Host check          403 unless Host is localhost, 127.0.0.1 or [::1]
   2. Response headers    nosniff, frame deny, referrer, COOP/CORP, CSP
   3. JSON body parser    100 KB limit
   4. Trace recorder      wraps res.json for login, search, script, reset
   5. Static files        public/
   6. /api routes         health, reset, login-demo, search-demo,
                          run-script, trace
   7. JSON 404            any other /api path
   8. SPA fallback        anything else returns index.html
   9. Error handler       400 bad JSON, 413 too large, 500 otherwise
        |
        v
queryRows(): row cap (500) and timer (6 s)      safe login uses db.get
        |
        v
One sqlite3 connection, in-memory database, users table seeded with 8 rows
        |
        v
JSON response -> page renders counts, rows, queries; the trace entry is
                 read later by GET /api/trace for the log panel
```

Design decisions recorded in ARCHITECTURE.md:

- **One connection.** One operator. SQLite's change counters are connection-wide, so sandbox scripts are serialised through a promise chain; a pool would break that counting.
- **In-memory database.** Fresh state on every start and on reset; nothing to migrate or back up.
- **The vulnerable paths are real.** The unsafe login, unsafe search and sandbox paste text into SQL on purpose. Containment is in the environment (loopback, limits, reset), not in disguising the lesson.
- **Narrow block-list.** Only statements that are not lessons are refused. `DROP` is allowed deliberately; Reset exists for it.

## 7. How we built it

Follows LEVELS.md and `git log` (2026-09-24 to 2026-10-14). Each round was an audit against a maturity scale, then a build of the chosen items.

1. **First backend and page** (`8471e39`, `d9b2f29`, `28323f4`, `692b7c8`). Initial setup; an Express and sqlite3 backend with `/api/health`, `/api/login-demo`, `/api/search-demo`; a first frontend, later reworked into one page; a `need-to-fix.md` list.
2. **Backend hardening** (`870f403`). The audit found 14 gaps; the first was that a `COMMIT` script crashed the process. The build closed them: transaction keywords refused, `ATTACH` limited by the engine, 6-second timeout and 500-row cap, in-memory database with `POST /api/reset`, JSON error handling, loopback binding, input validation, serialised scripts, graceful shutdown, a health check that touches the database.
3. **Security.** A threat model for a localhost demo found two issues, both closed: an unchecked Host header (DNS rebinding) and missing response headers. The Host check and headers were added and the dependency audit went into CI. The audit found no dependency vulnerabilities and no HTML-injection sinks in the page.
4. **Tests and release basics.** jsdom page tests were added to the API tests; `.env.example`, start-up validation and an `engines` field were added; a rehearsal from a clean copy was run. The test audit broke the code on purpose in a throwaway copy: 6 of 7 deliberate breaks were caught, and the 7th (a 60-second timeout) was then made to fail cleanly.
5. **Documentation** (`ee08e32`). `ARCHITECTURE.md`, `CHANGELOG.md`, a learner guide in the README, and corrections where documents contradicted the code.
6. **Design raised.** Design tokens, motion tokens, staged waiting states and keyboard shortcuts on the original paper-and-ink style, still one long page.
7. **UX re-audit for beginners.** LEVELS.md records the page at 999 words and about 26,300 px tall, with developer vocabulary ("payload", "prepared", "interpolated", "bound") and raw JSON in every result. The re-audit rated it level 1 for beginners and proposed one lesson per screen, plain names ("unsafe login", "safe login"), the answer after the question, and removal of status decoration.
8. **Layout rebuild into lessons plus a Lab** (`5f3145f`). Rebuilt (3,101 lines down to 1,092 at the time) as a rail with six lessons and three Lab tools, hash routes, a health banner and a reset control. Status strip, sound, print evidence, key card and footer removed; the paper, ink, violet accent and Azeret Mono style kept. Layout options were drawn as mockups first and the chosen one (lesson rail plus explain-and-demo) was built.
9. **Tracing, health state and load test** (same commit). `GET /api/trace` and the "What the database ran" log; `/api/health` reports `intact` or `damaged`; `npm run load` with a stated budget; concurrency tests (reset during a script; login and search during a long script); eight seeded users instead of four.
10. **Landing and motion** (same commit). Landing screen at `#/` with a live preview; a motion system on the existing tokens, off under reduced motion.
11. **Logo** (same commit). A square shield mark with a `?` placeholder inside, used next to the name; the favicon is the same shield filled solid, without the `?`.

## 8. Results

All figures are from commands we ran on 2026-10-14 in the project folder, on Node.js v26.7.0 (the project requires Node 20 or newer; CI uses Node 20).

### 8.1 Tests

`npm test` (runs `node --test "test/*.test.js"`) printed:

```
ℹ tests 78
ℹ suites 0
ℹ pass 78
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 10859.008375
```

78 of 78 passing in about 10.9 seconds. Run separately, `test/api.test.js` reported 60 passing in 11,262 ms and `test/page.test.js` 18 passing in 6,264 ms (the files run concurrently in the full run, so the separate durations do not add up to the full one).

### 8.2 Load test

`npm run load` printed:

```
requests: 120531  errors: 0  rps: 12052
p50: 1.3 ms  p95: 3.3 ms  max: 13.8 ms
budget: p95 < 50 ms, 0 errors -> PASS
```

20 concurrent clients for 10 seconds, far more than one presenter and an instructor produce on localhost. This is a measurement on our own machine, not a claim about other hardware.

### 8.3 Dependency audit

`npm audit --omit=dev` printed `found 0 vulnerabilities`.

### 8.4 What was checked by hand

LEVELS.md records live browser checks by the builders, not by outside users:

- Landing and lessons at 1440 by 900: the landing preview shows the unsafe and safe counts; lesson 2 shows the unsafe login returning users; the Login tester shows unsafe against safe counts with verdicts and the log filling.
- Earlier builds, at 1280 by 720: a killed server shows an offline state; empty fields are refused with the field marked; a misspelled `SELEKT 1` shows an engine error; a recursive query with no end shows "timed out" after the 8-second client limit; `DROP TABLE users` then Reset database restores the demo; `COMMIT` is refused and the server stays up.
- A clean copy of the non-ignored files was installed and run with `npm ci`, `npm test`, `npm start`.
- Deliberate-break checks on throwaway copies to confirm the tests detect changes (section 7, item 4).

Not verified by eye: a 1920-wide screen in full, the "Log paused" state, the 50-row cap, the feel of every animation, and the busy state of buttons (the server answers too fast to see it).

## 9. Limitations and future work

- **No user sessions yet.** `ux-sessions.md` holds a script for watching 3 to 5 classmates use the page. No sessions have been run and no observations exist, and the script needs rewriting for the lesson and Lab screens. All usability findings so far are expert review by the builders.
- **Local only, by design.** The sandbox runs arbitrary SQL as typed, so the server binds to `127.0.0.1` and checks the Host header. Setting `HOST` to anything else (for example `0.0.0.0`) exposes that endpoint and turns the Host check off. Before any public hosting the sandbox would have to be made read-only or removed and the security audit repeated. Public hosting was not done.
- **No accounts, sessions or rate limits.** Seed users and passwords are fake and shown on the page; there is no real authentication.
- **Inline script and style.** The CSP allows `'unsafe-inline'` because the page is one file; separate files would remove that.
- **Trigger writes are counted.** The sandbox change count includes writes made by a trigger that a script created.
- **Test gaps.** jsdom does not check layout, fonts or the projector view, so those stay manual checks.
- **Text size.** An earlier audit found most text under 14 px and proposed a presenter scale for large screens. We have not confirmed whether this still applies to the rebuilt page, and it was not built.
- **Documentation lag.** README.md was rewritten for the new layout. DESIGN.md, PRODUCT.md and ARCHITECTURE.md still describe parts of the older single-page design.
- **Not verified.** Projector colour in a bright room, and how the page reads from a distance.

## 10. How to run

Requirements: Node.js 20 or newer and npm. From the project folder:

```bash
npm ci
npm start
```

Then open http://127.0.0.1:3000. To run the tests and the load test:

```bash
npm test
npm run load
```

To restore the demo data, press "Reset database" in the page, or run `curl -X POST http://127.0.0.1:3000/api/reset`. Configuration (`PORT`, `HOST`, `DB_PATH`), the API contract and recovery steps are in README.md.
