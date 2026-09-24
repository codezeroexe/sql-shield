# Frontend handoff: SQL injection mitigation demo

## Project goal

Build a small, single-page web demo that teaches SQL injection mitigation by showing the difference between:

- unsafe SQL built by string concatenation
- safe SQL built with parameter binding

The frontend should focus on visual clarity, not a real production authentication system.

---

## Backend contract

### Runtime stack

- Node.js
- Express
- SQLite3

### Server setup

The backend runs from `server.js` and serves static frontend files from the `public/` folder.

### Database

SQLite database file: `database.sqlite`

Table: `users`

Columns:

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `username` TEXT UNIQUE
- `password` TEXT

Seed data:

- alice / pw123
- bob / hunter2
- admin / rootpass
- charlie / letmein

### Health endpoint

`GET /api/health`

Response:

```json
{
  "ok": true,
  "message": "SQLShield Demo backend is running."
}
```

### Login endpoint

`POST /api/login-demo`

Request body:

```json
{
  "mode": "safe",
  "username": "alice",
  "password": "pw123"
}
```

Accepted values:

- `mode`: `safe` or `vulnerable`
- `username`: string
- `password`: string

Safe branch behavior:

```js
const safeQuery = "SELECT id, username FROM users WHERE username = ? AND password = ?";
db.get(safeQuery, [username, password], ...)
```

This is the mitigation pattern. User input is passed as a bound value, not SQL text.

Unsafe branch behavior:

```js
const unsafeQuery = `SELECT id, username FROM users WHERE username = '${username}' AND password = '${password}'`;
db.all(unsafeQuery, ...)
```

This intentionally demonstrates the injection risk.

Response format (both safe and vulnerable):

```json
{
  "label": "safe",
  "status": "safe",
  "result": [
    {
      "id": 1,
      "username": "alice"
    }
  ],
  "note": "Prepared statements keep input as a value instead of SQL syntax."
}
```

or

```json
{
  "label": "vulnerable",
  "status": "unsafe",
  "result": [],
  "note": "Unsafe SQL string interpolation allows user input to become executable query logic."
}
```

### Search comparison endpoint

`GET /api/search-demo?term=a`

Response:

```json
{
  "safe": [{ "id": 1, "username": "alice" }],
  "unsafe": [{ "id": 1, "username": "alice" }],
  "note": "The safe query binds the term as data; the unsafe query injects it into SQL text."
}
```

The important part is that the frontend should display both arrays side by side.

---

## Frontend requirements

### Application type

- single-page app
- static HTML + CSS + JavaScript
- no framework required
- lightweight and easy to hand over

### Layout

The page should be arranged in this order:

1. Hero section
   - eyebrow label: `Security demo`
   - heading: `SQL Injection Mitigation`
   - subtitle: `Compare unsafe SQL construction with parameterized queries.`

2. Login demo panel
   - client-side form with inputs for username and password
   - payload preset dropdown
   - load payload button
   - two action buttons:
     - `Test safe login`
     - `Test vulnerable login`

3. Results comparison section
   - left card: safe flow
   - right card: unsafe flow
   - each card contains a `<pre>` area showing the JSON response

4. Search comparison section
   - input for a search term
   - `Run comparison` button
   - two result panels for safe and unsafe query outputs

5. Mitigation skeleton section
   - list of teaching points about the safe pattern

### Visual layout mockup

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Security demo                                                             │
│ SQL Injection Mitigation                                                  │
│ Compare unsafe SQL construction with parameterized queries.               │
├────────────────────────────────────────────────────────────────────────────┤
│ Login test                  Load payload                                   │
│ Username: [alice]           Password: [pw123]                              │
│ Payload preset: [Normal login ▼]                                          │
│ [Test safe login]   [Test vulnerable login]                               │
├────────────────────────────────────────────────────────────────────────────┤
│ Safe flow                          │ Unsafe flow                           │
│ { ...safe JSON response... }       │ { ...unsafe JSON response... }       │
│                                    │                                      │
├────────────────────────────────────────────────────────────────────────────┤
│ Search comparison                                                         │
│ Search term: [a]                                                          │
│ [Run comparison]                                                          │
│ Safe query result        │ Unsafe query result                            │
│ { ...safe array... }    │ { ...unsafe array... }                         │
├────────────────────────────────────────────────────────────────────────────┤
│ Mitigation skeleton                                                       │
│ • Trust boundary: user input enters app                                   │
│ • Validation: required fields + expected format checks                    │
│ • Parameter binding: values passed as data, not SQL                      │
│ • Least privilege: DB account permissions are limited                     │
│ • Testing: attack payloads must be run before release                    │
└────────────────────────────────────────────────────────────────────────────┘
```

### Visual style

Use a dark dashboard look:

- background: dark navy/black
- panels: dark gray cards with soft borders
- safe response: green accents
- unsafe response: red accents
- accent button color: blue

### Text labels and content

Use the current labels already implemented in the demo:

- `Login test`
- `Load payload`
- `Username`
- `Password`
- `Payload preset`
- `Normal login`
- `Classic bypass`
- `Admin bypass`
- `Union payload`
- `Test safe login`
- `Test vulnerable login`
- `Safe flow`
- `Unsafe flow`
- `Search comparison`
- `Safe query result`
- `Unsafe query result`
- `Mitigation skeleton`

### Required behavior

#### 1. Payload preset flow

When the user clicks `Load payload`:

- if selected value is `alice`, fill:
  - username = `alice`
  - password = `pw123`
- otherwise:
  - username = selected payload string
  - password = `anything' OR '1'='1`

#### 2. Safe login action

When `Test safe login` is clicked:

```js
fetch("/api/login-demo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    mode: "safe",
    username: usernameInput.value,
    password: passwordInput.value,
  }),
});
```

Then render the response JSON in the safe result panel using `JSON.stringify(data, null, 2)`.

#### 3. Unsafe login action

When `Test vulnerable login` is clicked:

```js
fetch("/api/login-demo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    mode: "vulnerable",
    username: usernameInput.value,
    password: passwordInput.value,
  }),
});
```

Then render the response JSON in the unsafe result panel using `JSON.stringify(data, null, 2)`.

#### 4. Search comparison action

On click, send:

```js
fetch(`/api/search-demo?term=${encodeURIComponent(searchTermInput.value)}`);
```

Display:

- `data.safe` in the safe result panel
- `data.unsafe` in the unsafe result panel

#### 5. Error handling

If the request fails:

- render JSON `{ error: error.message }` in the relevant panel
- do not crash the page

---

## Acceptance criteria

The frontend is considered complete when all of the following are true:

- page loads from the Express server without errors
- safe login works with valid credentials
- vulnerable login demonstrates a risky SQL query pattern
- search comparison shows safe and unsafe results side by side
- UI clearly communicates green = safe, red = unsafe
- page is readable and responsive on desktop and small screens
- there is no production auth flow or real login logic beyond the demo

---

## Important implementation notes

- Keep the demo educational and explicit
- Do not hide the unsafe path behind a fake success message
- Keep the backend behavior simple and deterministic
- The frontend should show the actual JSON responses from the API rather than a hardcoded mock result
- The focus is on the mitigation skeleton, not on scalable app architecture

---

## Handoff summary

Another developer should implement the frontend as a static demo page that:

- interacts with the exact API routes above
- displays safe and unsafe results side by side
- teaches the SQL injection mitigation pattern visually
- keeps the demo simple, dark, and high-contrast

The backend already provides the logic. The frontend job is presentation, clarity, and effective teaching.
