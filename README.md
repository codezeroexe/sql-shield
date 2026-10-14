# SQLShield Demo

A lightweight web demo project for learning and demonstrating SQL injection mitigation techniques.

## Project goal

This project shows a clear side-by-side comparison between:

- unsafe SQL built by string concatenation
- safe SQL executed with parameterized queries

The goal is to teach the mitigation skeleton in a simple, visual, and interactive format without building a large production application.

## Why this project matters

SQL injection happens when untrusted user input is concatenated into SQL statements. A safe pattern keeps user input as data values rather than executable SQL.

## Core idea

- unsafe pattern: `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`
- safe pattern: `SELECT * FROM users WHERE username = ? AND password = ?`

The demo highlights this difference and shows how parameterized queries block malicious payloads.

## Features

- login demo with safe vs vulnerable logic
- payload presets for common SQL injection attempts
- search comparison showing safe and unsafe query behavior
- mitigation checklist for defensive coding practices
- simple SQLite-backed demo data, held in memory and reseeded on every start

## Tech stack

- Node.js
- Express
- SQLite3
- HTML
- CSS
- JavaScript

## Project structure

```text
.
├── README.md
├── plans.md
├── package.json
├── server.js
├── test/
│   └── api.test.js
├── public/
│   └── index.html
└── .gitignore
```

## Run locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

The server reads three environment variables:

- `PORT` sets the port. Default `3000`.
- `HOST` sets the address to listen on. Default `127.0.0.1`, so only this machine can connect. `HOST=0.0.0.0` exposes the arbitrary-SQL endpoint to the whole network. Do not do that on a network you do not control.
- `DB_PATH` sets a SQLite file to use. Default is `:memory:`, so nothing survives a restart. With a file, tables other than `users` stay between runs. The `users` table is reseeded on every start either way.

## Running the demo

### Requirements

- Node.js 20 or newer
- npm

### Start

From the project folder:

```bash
npm ci
npm start
```

Then open http://127.0.0.1:3000. While the tab is visible, the page checks the server every 10 seconds. If the server stops, the status lamp reads "backend unreachable".

### Configuration

The server reads three environment variables. Set them on the command line, for example `PORT=8080 npm start`. `.env.example` lists them. The server does not read a `.env` file itself.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. Use a whole number from 0 to 65535. |
| `HOST` | `127.0.0.1` | Address to bind: an IP address or `localhost`. `HOST=0.0.0.0` exposes the arbitrary-SQL endpoint to the whole network. Do not use it on a network you do not control. |
| `DB_PATH` | `:memory:` | Database location. `:memory:` is reseeded on every start. A file path keeps tables other than `users` between runs. The folder must already exist. |

A bad value stops the server at start with a message that names the variable: `Invalid PORT`, `Invalid HOST` or `Invalid DB_PATH`. If the port is already in use, it stops with `Port N is already in use` and tells you to pick a free `PORT`.

### Stop

Press Ctrl-C in the terminal. The server closes its connections and the database, then exits. It handles both SIGINT and SIGTERM this way. If closing takes longer than 3 seconds, it exits anyway.

### Reset between runs

Press "Reset database" on the page, or run:

```bash
curl -X POST http://127.0.0.1:3000/api/reset
```

A reset drops every table, view, trigger and index, including anything created through the statement box, and restores the four users. Restarting the server also reseeds the users.

### If the server died

Restart it with `npm start`. With the default in-memory database, the earlier data is gone and the four users are reseeded, and nothing else is lost. With a `DB_PATH` file, the users are reseeded and the other tables in the file stay as they were.

### Pre-demo checklist

- [ ] Run `npm test` and confirm all tests pass.
- [ ] Start the server with `npm start` and open http://127.0.0.1:3000.
- [ ] Confirm the status lamp reads "backend online" and the verdict reads "bound → 0 rows, interpolated → 4 rows".
- [ ] Press "Reset database".
- [ ] Check the projector at 1280×720.
- [ ] Bring a charged laptop and keep it on power.
- [ ] Close other tabs that point at the demo.
- [ ] Keep a terminal visible so you can restart with `npm start`.
- [ ] Do not set `HOST=0.0.0.0` on a shared network.

## Backend contract

The authoritative API surface is `server.js`. The full route list is under [API contract](#api-contract) below:

- `GET /api/health`
- `POST /api/login-demo` — `{ mode: "safe" | "vulnerable", username, password }`
- `GET /api/search-demo?term=`
- `POST /api/run-script` — `{ script }`, runs the reviewer's own SQL verbatim
- `POST /api/reset` — restores the demo state

`/api/run-script` executes exactly what it is given against the in-memory demo database: no binding, no escaping, no allow-list. A small block-list refuses transaction-control statements and `VACUUM` (see [Limits on the statement box](#limits-on-the-statement-box)). The driver compiles one statement per call, so anything after the first `;` that is outside quotes and comments is reported back as never compiled rather than quietly run. Only use it locally.

The frontend lives entirely in `public/index.html` as a single static page.

## API contract

All request and response bodies are JSON. Strings in the login and search inputs are limited to 200 characters. The script limit is 10000 characters. Request bodies are capped at 100 KB.

Status codes used across the API:

| Code | Meaning |
| --- | --- |
| 200 | The request was handled. For login and search, a bypass that returns rows is still 200, with `status: "unsafe"` in the body. |
| 400 | Refused before the statement reached the database: missing or invalid input, an invalid `mode`, a blocked statement, or malformed JSON. |
| 404 | No such route under `/api`. |
| 413 | The request body is larger than 100 KB. |
| 500 | The engine refused the statement, or the server hit an unexpected error. |
| 503 | The database cannot answer. Only `/api/health` returns this. |
| 504 | The statement was stopped by the 6-second limit. |

Most errors have the shape `{ "error": "<message>" }`. On `login-demo` and `run-script`, a statement that reached the database returns the record shape even when it fails with 500 or 504, so the page can show what was attempted. Those records carry `status: "rejected"` or `"unsafe"` and a `note` that holds the message.

### `GET /api/health`

No input.

- 200: `{ "ok": true, "message": "SQLShield Demo backend is running." }`
- 503: `{ "ok": false, "message": "database unavailable." }`, when `SELECT 1` fails.

### `POST /api/reset`

No input. Drops every table, view, trigger and index in the database, including any created through `run-script`, then reseeds the four users (`alice`, `bob`, `admin`, `charlie`).

- 200: `{ "ok": true, "users": 4, "message": "Database reset. 4 users restored." }`
- 500: `{ "error": "reset failed: <message>" }`

### `POST /api/login-demo`

Body: `mode` (`"safe"` by default, or `"vulnerable"`), `username`, `password`. Both credentials are required and must be strings of 200 characters or fewer.

- 200, `mode: "safe"`: `{ label, status: "safe", result, note, query, boundValues }`. `result` holds at most one row. The query is a prepared statement and `boundValues` shows the two values as sent.
- 200, `mode: "vulnerable"`: `{ label, status: "unsafe", result, note, query, executed, ignored, boundValues: null }`. `executed` is the part of the string the driver compiled, and `ignored` is anything after the first `;` that it discarded. `truncated: true` appears when the row cap was hit.
- 400: missing or empty credentials, non-string credentials, a credential over 200 characters, or a `mode` that is neither `"safe"` nor `"vulnerable"`. Body: `{ "error": "<message>" }`.
- 500: the engine refused the statement. The record is returned with `status` set to `"unsafe"` or `"safe"` and `note` holding the engine message.
- 504: the vulnerable statement hit the 6-second limit. The record has `status: "rejected"`, `result: []`, and `timedOut: true`.

### `GET /api/search-demo?term=`

Query: `term`, one string of 200 characters or fewer. An absent or empty term is not an error.

- 200, no term: `{ safe: [], unsafe: [], boundValues: { safe: null, unsafe: null }, note: "No term provided." }`.
- 200, with a term: `{ safe, unsafe, queries: { safe, unsafe }, executed: { safe, unsafe }, ignored: { safe, unsafe }, boundValues: { safe: ["%<term>%"], unsafe: null }, note }`. `ignored.safe` is always empty. `truncated: { safe, unsafe }` appears when either side hit the row cap.
- 400: `term` is not a single string, or is over 200 characters. Body: `{ "error": "<message>" }`.
- 500: an engine error on either query. Body: `{ "error": "<message>" }`.
- 504: either query hit the 6-second limit. Body: `{ "error": "<message>", "timedOut": true }`.

### `POST /api/run-script`

Body: `script`, a non-blank string of 10000 characters or fewer.

- 200: `{ label: "custom", status: "ran", result, note, query, executed, ignored, boundValues: null, changes, lastID }`. `query` is the script as sent. `changes` and `lastID` report on writes only. A statement that only reads reports `changes: 0` and `lastID: null`. `truncated: true` appears when the row cap was hit.
- 400: the script is missing, blank or not a string; it is over 10000 characters; nothing comes before the first `;`; or it opens with a blocked keyword. Body: `{ "error": "<message>" }`.
- 500: the engine refused the statement. The record has `status: "rejected"` and `note` holds the engine message. `ATTACH` lands here. See the limits below.
- 504: the statement hit the 6-second limit. The record has `status: "rejected"`, `result: []`, and `timedOut: true`.

### Errors from the framework

- 400 `{ "error": "request body must be valid JSON." }` for malformed JSON.
- 413 `{ "error": "request body is too large." }` for a body over 100 KB.
- 404 `{ "error": "no such route." }` for an unknown path under `/api`.
- 500 `{ "error": "internal error." }` for anything unexpected. Stack traces are logged on the server, never sent.

## Limits on the statement box

The statement box is `POST /api/run-script`. These limits apply to it. The unsafe login and search queries share the 6-second and 500-row limits.

- Each statement stops after 6 seconds. It is interrupted, the response is 504, and `timedOut: true` is set. No rows come back.
- At most 500 rows are returned. The rest are not fetched. The response sets `truncated: true` and the note says so.
- `BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `RELEASE` and `VACUUM` are blocked with 400 when they open the first statement. Leading whitespace and comments are skipped before the check. These statements would break the server's wrapper transaction or write files.
- `ATTACH` is refused by the engine. The server sets the attached-database limit to zero, so the statement fails with a 500 and SQLite's own message.
- One script runs at a time. Others wait their turn on the single shared connection.

## Tests

`npm test` starts its own server on a random port between 3900 and 3989, runs `test/api.test.js` against it and stops it afterwards. Nothing is left running and port 3000 is not used.

To run the tests against a server you already started:

```bash
BASE=http://127.0.0.1:3000 node --test test/api.test.js
```

The tests call `POST /api/reset` themselves where they need a clean database.

## Security focus

This project emphasizes:

- prepared statements
- input validation
- least privilege access
- safe database query construction
- demonstration of common injection payloads

## Suggested naming options

- SQLShield Demo
- SecureQuery Lab
- InjectionGuard Demo
- SafeSQL Showcase
- QueryGuard

The chosen project name for this repo is: SQLShield Demo
