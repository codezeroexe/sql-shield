/* Server contract checks for the SQLShield demo. Run with `npm test`.
   Covers the three things the page must never get wrong: an HTTP error is
   reported as a refusal, a stacked statement is not claimed to have run,
   and a benign input is not labelled as an injection. */

const test = require("node:test");
const assert = require("node:assert/strict");

const BASE = process.env.BASE || "http://localhost:3000";

const login = (mode, username, password) =>
  fetch(`${BASE}/api/login-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, username, password }),
  });

const search = (term) => fetch(`${BASE}/api/search-demo?term=${encodeURIComponent(term)}`);

const script = (sql) =>
  fetch(`${BASE}/api/run-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(typeof sql === "string" ? { script: sql } : sql),
  });

test("prepared statement binds input and refuses the bypass", async () => {
  const res = await login("safe", "' OR '1'='1 --", "anything");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "safe");
  assert.deepEqual(body.result, []);
  assert.equal(body.query.includes("?"), true, "statement must stay parameterized");
  assert.deepEqual(body.boundValues, ["' OR '1'='1 --", "anything"]);
});

test("correct credentials authenticate on the safe path", async () => {
  const body = await (await login("safe", "alice", "pw123")).json();
  assert.equal(body.result.length, 1);
  assert.equal(body.result[0].username, "alice");
});

test("interpolated query is exploitable and says so", async () => {
  /* the payload needs both halves: the username closes the string early and
     the password supplies the rest, which is why the app's own preset is two
     fields wide and not one */
  const body = await (
    await login("vulnerable", "' OR '1'='1 --", "anything' OR '1'='1")
  ).json();
  assert.equal(body.status, "unsafe");
  assert.ok(body.result.length > 1, "the bypass must return more than one row");
});

test("missing credentials are a 400 with a message", async () => {
  const res = await login("safe", "alice", "");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /required/i);
});

test("a malformed statement is a 500, not a successful injection", async () => {
  const res = await login("vulnerable", "x' AND (1=1", "y");
  assert.equal(res.status, 500, "the engine's rejection must not be a 200");
  const body = await res.json();
  assert.deepEqual(body.result, [], "a rejected statement returns nothing");
  assert.match(body.note, /SQLITE_ERROR|syntax/i, "the engine's complaint is kept");
});

test("only the first statement of a stacked payload is reported as executed", async () => {
  const body = await (
    await login("vulnerable", "' OR 1=1; DROP TABLE users; --", "y")
  ).json();
  assert.equal(body.executed.includes("DROP TABLE"), false,
    "the DROP was never compiled and must not appear as executed");
  assert.match(body.note, /only the first statement/i);
  assert.ok(body.ignored, "the discarded tail is reported, not hidden");
});

test("the users table survives that payload", async () => {
  const body = await (await search("al")).json();
  assert.equal(body.safe.length, 1, "the DROP in the payload must not have run");
});

test("search reports both paths and keeps the term out of the safe statement", async () => {
  const body = await (await search("al")).json();
  assert.equal(body.safe.length, 1);
  assert.equal(body.unsafe.length, 1);
  assert.equal(body.queries.safe.includes("al"), false);
  assert.deepEqual(body.boundValues.safe, ["%al%"]);
});

test("search injection leaks through the unsafe path only", async () => {
  const body = await (await search("' OR '1'='1")).json();
  assert.deepEqual(body.safe, []);
  assert.ok(body.unsafe.length > 1);
});

test("empty search term returns empties rather than an error", async () => {
  const res = await search("");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.safe, []);
  assert.deepEqual(body.unsafe, []);
});

test("health check reports ready", async () => {
  const body = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(body.ok, true);
});

/* ---- the reviewer's own statement ----
   The page's last claim is that nothing stands between the typed text and
   sqlite3. These hold that endpoint to it: it runs what it is given, it
   reports only what the driver compiled, and it never dresses a refusal up as
   a result. */

test("a custom script runs verbatim and returns real rows", async () => {
  const res = await script("SELECT id, username FROM users ORDER BY id");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ran");
  assert.equal(body.result.length, 4);
  assert.deepEqual(body.boundValues, null, "nothing was bound or escaped");
});

test("a custom script can hand over the whole table in one statement", async () => {
  const body = await (
    await script("SELECT id, username, password FROM users WHERE username = '' OR '1'='1'")
  ).json();
  assert.equal(body.result.length, 4, "the classic condition, written by hand");
  assert.match(body.note, /exactly as typed/i);
});

test("a malformed custom script is a 500 carrying the engine's complaint", async () => {
  const res = await script("SELEKT * FROM users");
  assert.equal(res.status, 500, "a refusal must not be a 200");
  const body = await res.json();
  assert.equal(body.status, "rejected");
  assert.deepEqual(body.result, []);
  assert.match(body.note, /SQLITE_ERROR|syntax/i);
});

test("only the first statement of a custom script is reported as compiled", async () => {
  const body = await (await script("SELECT 1 AS n; DROP TABLE users; --")).json();
  assert.equal(body.executed.includes("DROP TABLE"), false,
    "the second statement was never compiled");
  assert.match(body.ignored, /DROP TABLE/);
  assert.match(body.note, /discarded/i);
  assert.deepEqual(body.result, [{ n: 1 }]);
});

test("a semicolon inside a comment or a literal is not a statement boundary", async () => {
  const body = await (
    await script("-- a; b\nSELECT 'x;y' AS lit")
  ).json();
  assert.equal(body.executed.includes("SELECT 'x;y'"), true);
  assert.equal(body.ignored, "", "no imaginary tail may be reported as discarded");
});

test("a missing, blank, or non-string script is refused before anything runs", async () => {
  for (const body of [{}, { script: "   " }, { script: 42 }, { script: null }]) {
    const res = await script(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.match((await res.json()).error, /required|must be a string/i);
  }
});

test("a script that opens with a semicolon compiled nothing", async () => {
  const res = await script("; DROP TABLE users");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /nothing to run/i);
});

test("a custom script may write, and reports what it changed", async () => {
  try {
    const body = await (
      await script("INSERT INTO users (username, password) VALUES ('probe', 'probe')")
    ).json();
    assert.equal(body.result.length, 0);
    assert.equal(body.changes, 1, "the write is reported as a change, not as rows returned");
  } finally {
    await script("DELETE FROM users WHERE username = 'probe'");
  }
  const after = await (await search("probe")).json();
  assert.deepEqual(after.safe, [], "the probe row must not outlive its test");
});