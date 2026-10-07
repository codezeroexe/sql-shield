# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A reviewer — a developer, engineer, or hiring manager — opens the page cold and decides, without clicking anything, whether the author understands application security well enough to be trusted with it. They are not the person who built it and they have no prior context. A secondary audience is a learner who does click through and drive the demo themselves.

The page has to earn a judgment in the first viewport and then survive being poked at.

## Product Purpose

Teach the SQL injection mitigation skeleton by making the difference between two query-construction strategies visible, side by side, in the same breath. The same endpoint, the same inputs, the same database — only the construction differs.

Success means a reviewer walks away understanding one specific thing: binding a value is categorically different from pasting it into a string. Not "SQL injection is bad" in the abstract, but the mechanism.

## Positioning

The demo runs the **real vulnerable code path deliberately and shows it succeeding** — the classic bypass payload actually returns every user row, live, from the actual SQLite database. Most teaching material redacts, mocks, or softens the unsafe path. This one refuses to. It also shows the actual driver call (`db.get` vs `db.all`, query text, bound values) rather than a summary, so the reviewer sees the mechanism at the level they are being judged at.

## Operating Context

Local-only. `node server.js`, then `http://localhost:3000`. The database is deleted and reseeded from a hardcoded list of four users on every boot, so state is always fresh and there is no persistence to reason about. Nobody else ever reaches this instance — no accounts, no shared deploy, no concurrent operators.

Consequence for design: harden for the single-operator failure modes that actually happen locally (backend not yet listening, database locked, a malformed response) rather than for cold-start, multi-user, or hostile-traffic robustness.

## Capabilities and Constraints

- `GET /api/health` — backend liveness, drives the status pill.
- `POST /api/login-demo` with `{ mode: "safe" | "vulnerable", username, password }` — returns `{ label, status, result, note, query, boundValues }`. The safe branch uses `db.get` with bound values; the vulnerable branch uses `db.all` on a string-interpolated query. Rejects empty credentials with HTTP 400.
- `GET /api/search-demo?term=` — returns `{ safe, unsafe, queries, boundValues, note }`. Same safe/unsafe split, both with `db.all`, the vulnerable one with `LIKE '%term%'` interpolated.
- `POST /api/run-script` with `{ script }` — runs the reviewer's own SQL statement verbatim on the live demo database and returns `{ label, status, result, note, query, executed, ignored, boundValues, changes, lastID }`. No binding, no escaping, no allow-list. `db.all` compiles one statement per call, so the tail after the first `;` is reported as never compiled. `changes` is reported only for statements the server could attribute to the request; a statement that only reads reports zero rather than a stale count.
- Preset roll — one page action fires every payload preset through both paths in turn, each preset printing its own record pair. Composed entirely from `POST /api/login-demo`; no extra endpoint.
- Four seeded users: `alice/pw123`, `bob/hunter2`, `admin/rootpass`, `charlie/letmein`.
- Four payload presets: normal login, classic bypass (`' OR '1'='1 --`), admin bypass (`admin' --`), union select.

Constraints:

- **The frontend renders real API responses. Hard constraint.** Never a hardcoded mock, never a synthesized result. Every panel shows what the server actually returned.
- **The unsafe path stays visible and honest. Hard constraint.** A bypass that returns four rows must be displayed as four rows with the unsafe status attached. Never softened, never retitled, never hidden behind a reassuring success message, never made to look safe.
- No production authentication, no real credentials, no secrets. The vulnerable route is a teaching artifact and is only acceptable while it is labelled as one.
- **The reviewer's own statement runs verbatim, and only locally.** The endpoint has no allow-list by user decision: the throwaway database holds no secrets and is reseeded on every boot, and refusing writes would hide the `DROP`/`ATTACH` lesson. The surface therefore carries a printed warning that the statement runs as typed and can write. Read-only enforcement is the change to make if this ever leaves a laptop.
- A statement the engine refused must print as a refusal: the sheet shows the statement it refused, the engine's own complaint, and the reason in words — never "no request sent yet" above an error.
- Single static page, no framework, no build step, no bundler. Inline CSS and JS in one HTML file.
- No deployment target. Local only.

## Brand Commitments

Name is **SQLShield Demo** (chosen from a shortlist in `README.md`). Educational and explicit voice: state what happened, show the artifact, say why it matters. The existing disclaimer — no real authentication, no production credentials — is a commitment and must survive.

No visual direction, palette, typeface, or style was pinned by the user. The previously shipped look was not confirmed as intentional and carries no commitment.

## Evidence on Hand

- `server.js` — the authoritative API surface. The source of truth for response shapes, status codes, and the two query strategies.
- `database.sqlite` — real seeded data; not a fixture in the repo but generated on boot.
- `public/index.html` — the entire existing frontend.
- `README.md`, `plans.md` — project scope and intent.

No testimonials, users, benchmarks, certifications, or deployment claims exist, and none may be fabricated.

## Product Principles

1. **Show the working attack.** The proof that the mitigation matters is the bypass succeeding. A sanitized demo proves nothing.
2. **Real over polished.** Server output rendered verbatim beats a re-drawn illustration, every time. A reviewer is checking for honesty first.
3. **Judgment in the first viewport.** Someone who never clicks must still learn the core claim.
4. **Mechanism over slogan.** Show the query text, the bound values, and the driver call. The audience can read code.
5. **Deliberate over decorated.** This is a portfolio artifact about precision; craft in restraint reads as competence, craft in effects reads as noise.

## Accessibility & Inclusion

No product-specific accessibility requirement was established by the user. Baseline expectations still apply: the demo is a reading-and-comparison surface with technical content, and semantic structure plus contrast must hold for anyone reviewing it, including in bright rooms and on projectors.