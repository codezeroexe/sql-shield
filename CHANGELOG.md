# Changelog

Changes to the demo, newest first.

## Unreleased

### Added
- In-memory database reseeded with eight demo users on every start, and `POST /api/reset` to drop and restore it.
- `POST /api/run-script` runs a custom statement, capped at 10000 characters, and reports what executed and what was discarded.
- Server binds to 127.0.0.1 by default, configurable with the `HOST`, `PORT` and `DB_PATH` environment variables, and these are validated at start-up.
- Host header check that accepts only loopback names while bound to loopback, plus security headers (CSP, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, same-origin policies) on every response.
- 6 second statement timeout (504) and 500-row cap on query results.
- Transaction-control statements and `VACUUM` are refused (400), and `ATTACH` is blocked by an engine limit of 0.
- JSON error responses for malformed bodies, oversize bodies and unknown `/api` paths, plus input validation on the endpoints.
- Graceful shutdown on SIGINT and SIGTERM.
- Page: verdict shown in the first screen, failure stamps (offline, timed out, refused, engine error), 8 second client timeout, health lamp, keyboard shortcuts, preset arming, saved statement with a Restore example button, Reset database button, logo mark and favicon.
- API tests and jsdom page tests run through `npm test`.
- GitHub Actions workflow that runs `npm ci`, `npm audit --omit=dev --audit-level=high` and `npm test`.
- `.env.example` documenting `PORT`, `HOST` and `DB_PATH`.
- `engines` field requiring Node.js >=20.
- README API contract and run guide.
- `.gitignore` entries that keep needed files visible under a global ignore.

### Changed
- `GET /api/health` now checks the database and returns 503 when it is unavailable.
- Query responses report the executed statement text and any discarded tail after the first `;`.

### Removed
- The Load payload button.
- The on-disk `database.sqlite` default; the database is now in-memory unless `DB_PATH` is set.

## 2026-10-06 — Add need-to-fix.md: backend and frontend fixes (692b7c8)

### Added
- `need-to-fix.md` listing backend and frontend fixes.

## 2026-10-01 — Rework frontend into single-page app, drop legacy assets (28323f4)

### Changed
- `public/index.html` reworked into a single-page app (694 lines changed).
- `server.js` responses accept an extra `detail` object carrying the query text and bound values.

### Removed
- `public/app.js` and `public/styles.css`.

## 2026-09-24 — Add backend demo and handoff docs (d9b2f29)

### Added
- Express and sqlite3 backend demo in `server.js` with `GET /api/health`, `POST /api/login-demo` and `GET /api/search-demo`.
- Frontend page in `public/index.html`, `public/app.js` and `public/styles.css`.
- `package.json` and `package-lock.json` with `express` and `sqlite3`, and `jsdom` as a dev dependency.
- `frontend-handoff.md` describing the frontend handoff.
- README section on the backend demo.

## 2026-09-24 — Initial project setup (8471e39)

### Added
- `README.md` and `plans.md`.
- `.gitignore` ignoring `node_modules/`, `.env`, `*.sqlite`, `.DS_Store` and `npm-debug.log*`.
- `.kilo/.gitignore` and the `.kilo/worktrees` placeholder.
