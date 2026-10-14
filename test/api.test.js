/* Server contract checks for the SQLShield demo. Run with `npm test`.
   Covers the three things the page must never get wrong: an HTTP error is
   reported as a refusal, a stacked statement is not claimed to have run,
   and a benign input is not labelled as an injection. */

const test = require("node:test");
const { before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");

const ROOT = path.join(__dirname, "..");
let BASE = process.env.BASE || "http://localhost:3000";
let child = null;

/* Unless BASE is given, boot our own server on a random port so nothing is
   left listening or orphaned after the run. */
before(async () => {
  if (process.env.BASE) return;
  const port = 3900 + Math.floor(Math.random() * 90);
  BASE = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const deadline = Date.now() + 5000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(`${BASE}/api/health`);
      await res.text();
      if (res.status === 200) return;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) throw new Error("server did not answer /api/health within 5 s");
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(async () => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });
});

const login = (mode, username, password) =>
  fetch(`${BASE}/api/login-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, username, password }),
  });

const search = (term) => fetch(`${BASE}/api/search-demo?term=${encodeURIComponent(term)}`);

const script = (sql, opts = {}) =>
  fetch(`${BASE}/api/run-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(typeof sql === "string" ? { script: sql } : sql),
    ...opts,
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
  assert.equal(body.result.length, 8);
  assert.deepEqual(body.boundValues, null, "nothing was bound or escaped");
});

test("a custom script can hand over the whole table in one statement", async () => {
  const body = await (
    await script("SELECT id, username, password FROM users WHERE username = '' OR '1'='1'")
  ).json();
  assert.equal(body.result.length, 8, "the classic condition, written by hand");
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

/* ---- runner, limits, validation, reset ---- */

const reset = () => fetch(`${BASE}/api/reset`, { method: "POST" });
const health = () => fetch(`${BASE}/api/health`);
const postJson = (url, body) =>
  fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

test("run-script refuses transaction control and file statements", async () => {
  const blocked = [
    "COMMIT",
    "ROLLBACK",
    "BEGIN",
    "  /* x */ end",
    "SAVEPOINT a",
    "RELEASE a",
    "VACUUM INTO '/tmp/x.db'",
  ];
  for (const sql of blocked) {
    const res = await script(sql);
    assert.equal(res.status, 400, `expected 400 for ${sql}`);
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    assert.match(body.error, /blocked on this demo server/);
  }
  assert.equal((await health()).status, 200);
});

test("run-script refuses ATTACH with the engine's attached-limit error", async () => {
  const res = await script("ATTACH DATABASE ':memory:' AS x");
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.status, "rejected");
  assert.match(body.note, /attached/);
});

test("run-script refuses a script over 10000 characters", async () => {
  const res = await script("SELECT " + "1,".repeat(5100) + "1");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /10000/);
});

test("run-script caps a large result at 500 rows and says so", async () => {
  const res = await script(
    "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c LIMIT 100000) SELECT x FROM c",
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.result.length, 500);
  assert.equal(body.truncated, true);
  assert.match(body.note, /first 500 rows/);
});

test("run-script stops a runaway statement with 504 and the server stays up", { timeout: 20000 }, async () => {
  const res = await script(
    "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT count(*) FROM c",
    { signal: AbortSignal.timeout(10000) },
  );
  assert.equal(res.status, 504);
  const body = await res.json();
  assert.equal(body.timedOut, true);
  assert.equal((await health()).status, 200);
});

test("server process is still the one that started", async () => {
  if (child) assert.equal(child.exitCode, null, "the server must not have exited");
  assert.equal((await health()).status, 200);
});

test("reset restores users after a script drops the table", async () => {
  await script("DROP TABLE users");
  const broken = await login("safe", "alice", "pw123");
  assert.equal(broken.status, 500);
  const res = await reset();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.users, 8);
  const back = await login("safe", "alice", "pw123");
  assert.equal(back.status, 200);
  assert.equal((await back.json()).result.length, 1);
});

test("reset also removes objects a script added", async () => {
  await script("CREATE TABLE junk(a)");
  await reset();
  const res = await script("SELECT * FROM junk");
  assert.equal(res.status, 500);
});

test("malformed JSON body is a 400 JSON error with no stack or paths", async () => {
  const res = await fetch(`${BASE}/api/login-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad",
  });
  assert.equal(res.status, 400);
  assert.match(res.headers.get("content-type"), /json/);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text).error, "request body must be valid JSON.");
  assert.equal(text.includes("node_modules"), false);
  assert.equal(text.includes("at "), false);
});

test("unknown API route is a JSON 404; root serves the page", async () => {
  const api = await fetch(`${BASE}/api/nope`);
  assert.equal(api.status, 404);
  assert.match(api.headers.get("content-type"), /json/);
  assert.deepEqual(await api.json(), { error: "no such route." });

  const root = await fetch(`${BASE}/`);
  assert.equal(root.status, 200);
  assert.match(root.headers.get("content-type"), /text\/html/);
});

test("login rejects bad mode, non-string, oversized and empty input", async () => {
  assert.equal((await login("x", "a", "b")).status, 400);
  const objUser = await postJson(
    "/api/login-demo",
    JSON.stringify({ mode: "safe", username: { a: 1 }, password: "p" }),
  );
  assert.equal(objUser.status, 400);
  assert.equal((await login("safe", "a".repeat(201), "p")).status, 400);
  assert.equal((await fetch(`${BASE}/api/login-demo`, { method: "POST" })).status, 400);
});

test("search rejects repeated and oversized terms", async () => {
  assert.equal((await fetch(`${BASE}/api/search-demo?term=a&term=b`)).status, 400);
  assert.equal((await search("a".repeat(201))).status, 400);
});

test("health reports ok true", async () => {
  const res = await health();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test("health reports an intact database with 8 users", async () => {
  await reset();
  const res = await health();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.db, "intact");
  assert.equal(body.users, 8);
});

test("health reports a damaged database after DROP TABLE users", async () => {
  await reset();
  await script("DROP TABLE users");
  const res = await health();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.db, "damaged");
  assert.equal(body.users, 0);
  assert.equal(body.message, "users table missing.");
  await reset();
  assert.equal((await (await health()).json()).db, "intact");
});

test("five concurrent script writes each land exactly once", async () => {
  await reset();
  const results = await Promise.all(
    [0, 1, 2, 3, 4].map((i) =>
      script(`INSERT INTO users (username, password) VALUES ('c${i}', 'p')`),
    ),
  );
  for (const res of results) {
    assert.equal(res.status, 200);
    assert.equal((await res.json()).changes, 1);
  }
  const body = await (await script("SELECT count(*) AS n FROM users")).json();
  assert.equal(body.result[0].n, 13);
});

test("run-script reports 0 changes for DDL after a write", async () => {
  await reset();
  const write = await (
    await script("UPDATE users SET username = username WHERE id = 1")
  ).json();
  assert.equal(write.changes, 1);

  const create = await script("CREATE TABLE x5_probe (a)");
  assert.equal(create.status, 200);
  assert.equal((await create.json()).changes, 0);

  const drop = await (await script("DROP TABLE x5_probe")).json();
  assert.equal(drop.changes, 0);
  await reset();
});

/* ---- DNS rebinding: Host header must be a loopback name ----
   fetch cannot set Host, so these go through node:http. */

const http = require("node:http");
const target = new URL(BASE);
const rawGet = (urlPath, hostHeader) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: urlPath,
        method: "GET",
        headers: { Host: hostHeader },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });

test("foreign Host header is refused with 403 on the API", async () => {
  const res = await rawGet("/api/health", "evil.example");
  assert.equal(res.status, 403);
  assert.deepEqual(JSON.parse(res.body), { error: "unexpected Host header." });
});

test("foreign Host header with a port is refused with 403", async () => {
  const res = await rawGet("/api/health", "evil.example:3000");
  assert.equal(res.status, 403);
});

test("loopback Host headers are accepted", async () => {
  for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    const res = await rawGet("/api/health", h);
    assert.equal(res.status, 200, `expected 200 for Host ${h}`);
  }
});

test("foreign Host header is refused on the static page too", async () => {
  const res = await rawGet("/", "evil.example");
  assert.equal(res.status, 403);
});

test("foreign Host header is refused before routing on unknown routes", async () => {
  const res = await rawGet("/api/nope", "evil.example");
  assert.equal(res.status, 403);
});
/* ---- response headers ---- */

test("root page carries the security headers and hides the framework", async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  const csp = res.headers.get("content-security-policy");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /default-src 'none'/);
  assert.equal(res.headers.get("x-powered-by"), null);
  await res.text();
});

test("health endpoint carries nosniff and CSP and no x-powered-by", async () => {
  const res = await health();
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.notEqual(res.headers.get("content-security-policy"), null);
  assert.equal(res.headers.get("x-powered-by"), null);
  await res.text();
});

test("error responses (404 and 400) also carry nosniff", async () => {
  const notFound = await fetch(`${BASE}/api/nope`);
  assert.equal(notFound.status, 404);
  assert.equal(notFound.headers.get("x-content-type-options"), "nosniff");
  await notFound.text();

  const badRequest = await postJson("/api/login-demo", "{}");
  assert.equal(badRequest.status, 400);
  assert.equal(badRequest.headers.get("x-content-type-options"), "nosniff");
  await badRequest.text();
});

/* Start-up config checks. Each case spawns the server on its own, so these do
   not depend on BASE or on the suite's own server. */
function randomPort() {
  return 3900 + Math.floor(Math.random() * 90);
}

function startFail(overrides) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(randomPort()), ...overrides },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("server did not exit within 4 s"));
    }, 4000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

test("PORT abc stops the server at start with Invalid PORT", async () => {
  const r = await startFail({ PORT: "abc" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Invalid PORT/);
});

test("PORT empty stops the server at start with Invalid PORT", async () => {
  const r = await startFail({ PORT: "" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Invalid PORT/);
});

test("PORT 70000 stops the server at start with Invalid PORT", async () => {
  const r = await startFail({ PORT: "70000" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Invalid PORT/);
});

test("PORT 3.5 stops the server at start", async () => {
  const r = await startFail({ PORT: "3.5" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Invalid PORT/);
});

test("HOST not-an-ip stops the server at start with Invalid HOST", async () => {
  const r = await startFail({ HOST: "not-an-ip" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Invalid HOST/);
});

test("DB_PATH in a missing folder stops the server at start with Invalid DB_PATH", async () => {
  const r = await startFail({ DB_PATH: "/no/such/folder/x.db" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Invalid DB_PATH/);
});

test("port already in use exits 1 with a clear message", async () => {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = blocker.address();
    const r = await startFail({ PORT: String(port) });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /already in use/);
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});

/* ---- /api/trace ---- */
const getTrace = async (after) => {
  const res = await fetch(`${BASE}/api/trace${after === undefined ? "" : `?after=${after}`}`);
  return { res, body: await res.json() };
};

test("trace records a bound login with its values", async () => {
  const { body: { last } } = await getTrace();
  await (await login("safe", "alice", "pw123")).json();
  const { body } = await getTrace(last);
  assert.equal(body.entries.length, 1);
  const e = body.entries[0];
  assert.equal(e.route, "login");
  assert.equal(e.path, "bound");
  assert.deepEqual(e.bound, ["alice", "pw123"]);
  assert.equal(e.rows, 1);
  assert.equal(e.outcome, "ok");
  assert.equal(e.http, 200);
  assert.equal(typeof e.ms, "number");
  assert.ok(e.sql.includes("?"));
});

test("trace records the pasted bypass with no bound values", async () => {
  const { body: { last } } = await getTrace();
  await (await login("vulnerable", "' OR 1=1 --", "x")).json();
  const { body } = await getTrace(last);
  assert.equal(body.entries.length, 1);
  const e = body.entries[0];
  assert.equal(e.path, "pasted");
  assert.equal(e.bound, null);
  assert.equal(e.rows, 8);
  assert.ok(e.sql.includes("OR 1=1"));
});

test("trace records search as two statements", async () => {
  const { body: { last } } = await getTrace();
  await (await search("al")).json();
  const { body } = await getTrace(last);
  assert.deepEqual(body.entries.map((e) => [e.route, e.path]), [["search", "bound"], ["search", "pasted"]]);
});

test("trace records a refused request", async () => {
  const { body: { last } } = await getTrace();
  const res = await login("other", "a", "b");
  await res.json();
  const { body } = await getTrace(last);
  assert.equal(body.entries.length, 1);
  const e = body.entries[0];
  assert.equal(e.outcome, "refused");
  assert.equal(e.http, 400);
  assert.equal(typeof e.note, "string");
  assert.ok(e.note.length > 0);
});

test("trace keeps only the last 50", async () => {
  for (let i = 0; i < 30; i++) await (await search("al")).json();
  const { body } = await getTrace();
  assert.equal(body.entries.length, 50);
  assert.equal(body.entries.at(-1).id, body.last);
});

test("trace rejects a bad after", async () => {
  const { res, body } = await getTrace("abc");
  assert.equal(res.status, 400);
  assert.equal(body.error, "after must be a whole number.");
});

test("trace does not record health or trace", async () => {
  const { body: { last } } = await getTrace();
  await (await fetch(`${BASE}/api/health`)).json();
  await getTrace();
  const { body } = await getTrace(last);
  assert.equal(body.entries.length, 0);
});

/* ---- reset racing a long script ---- */

const LONG_SCRIPT =
  "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c LIMIT 30000000) SELECT count(*) AS n FROM c";

test("reset during a long script leaves an intact database", { timeout: 20000 }, async () => {
  await reset();
  const scriptStart = performance.now();
  let scriptDoneAt = 0;
  let resetDoneAt = 0;
  const scriptP = script(LONG_SCRIPT).then((res) => {
    scriptDoneAt = performance.now();
    return res;
  });
  const resetP = fetch(`${BASE}/api/reset`, { method: "POST" }).then((res) => {
    resetDoneAt = performance.now();
    return res;
  });
  const [s, r] = await Promise.all([scriptP, resetP]);
  const scriptMs = scriptDoneAt - scriptStart;
  assert.ok(scriptMs > 1000, `script finished in ${scriptMs} ms, too fast to overlap`);
  assert.ok([200, 504].includes(s.status), `script must finish or time out, got ${s.status}`);
  assert.ok(resetDoneAt <= scriptDoneAt || s.status === 504);
  assert.equal(r.status, 200);
  await s.text();
  await r.text();

  const body = await (await health()).json();
  assert.equal(body.db, "intact");
  assert.equal(body.users, 8);

  const back = await login("safe", "alice", "pw123");
  assert.equal(back.status, 200);
  assert.equal((await back.json()).result.length, 1);
});

test("login and search answer correctly while a long script runs", { timeout: 20000 }, async () => {
  await reset();
  const scriptStart = performance.now();
  let scriptDoneAt = 0;
  const pending = script(LONG_SCRIPT).then((res) => {
    scriptDoneAt = performance.now();
    return res;
  });
  const [safeRes, vulnRes, searchRes] = await Promise.all([
    login("safe", "alice", "pw123"),
    login("vulnerable", "' OR 1=1 --", "x"),
    search("al"),
  ]);

  assert.equal(safeRes.status, 200);
  assert.equal((await safeRes.json()).result.length, 1);

  assert.equal(vulnRes.status, 200);
  assert.equal((await vulnRes.json()).result.length, 8);

  assert.equal(searchRes.status, 200);
  const body = await searchRes.json();
  assert.equal(body.safe.length, 1);
  assert.equal(body.unsafe.length, 1);

  const pendingRes = await pending;
  const scriptMs = scriptDoneAt - scriptStart;
  assert.ok(scriptMs > 1000, `script finished in ${scriptMs} ms, too fast to overlap`);
  assert.ok([200, 504].includes(pendingRes.status), `script must finish or time out, got ${pendingRes.status}`);
  await pendingRes.text();
});
