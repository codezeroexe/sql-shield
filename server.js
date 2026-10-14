const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const net = require("net");

const app = express();
app.disable("x-powered-by");
const host = process.env.HOST || "127.0.0.1";
/* state lives in memory and is reseeded every boot; DB_PATH only exists so a
   presenter can point at a file on purpose */
const dbPath = process.env.DB_PATH || ":memory:";

/* Start-up config check: a bad value stops the process with a message instead
   of a vague listen error later. */
const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);
if (rawPort.trim() === "" || !Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid PORT "${rawPort}": use a whole number from 0 to 65535.`);
  process.exit(1);
}
if (!net.isIP(host) && host !== "localhost") {
  console.error(`Invalid HOST "${host}": use an IP address such as 127.0.0.1 or 0.0.0.0.`);
  process.exit(1);
}
if (dbPath !== ":memory:" && !fs.existsSync(path.dirname(path.resolve(dbPath)))) {
  console.error(`Invalid DB_PATH "${dbPath}": the folder does not exist.`);
  process.exit(1);
}

/* ponytail: fixed demo ceilings, not tuned; raise or make env-driven if a
   legitimate demo query needs more rows or time */
const ROW_CAP = 500;
const QUERY_TIMEOUT_MS = 6000;
const TIMEOUT_NOTE =
  "Stopped after 6 seconds: the statement ran longer than the demo allows and was interrupted.";
const TRUNC_NOTE = " Showing the first 500 rows; the rest was not fetched.";

/* DNS rebinding: a hostile page can resolve its own name to 127.0.0.1 and talk
   to this server. Only loopback names are accepted while bound to loopback. */
const loopbackBind = ["127.0.0.1", "localhost", "::1"].includes(host);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
app.use((req, res, next) => {
  if (!loopbackBind) return next();
  const name = String(req.headers.host || "").replace(/:\d+$/, "").toLowerCase();
  if (loopbackHosts.has(name)) return next();
  return res.status(403).json({ error: "unexpected Host header." });
});

/* Response headers. The page is one static file with inline script and style,
   so those two keep 'unsafe-inline'; everything else is same-origin only. */
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  next();
});

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

let server = null;

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  }

  /* ATTACH would let a script create or open files on disk; with the limit at
     0 it fails as an ordinary engine error, which is the demo outcome */
  db.configure("limit", sqlite3.LIMIT_ATTACHED, 0);

  seed((seedErr) => {
    if (seedErr) {
      console.error("DB seed failed:", seedErr.message);
      process.exit(1);
    }
    console.log("Database initialized with demo users.");
    server = app.listen(port, host, () => {
      console.log(`SQLShield Demo server running at http://${host}:${port}`);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Stop the other process or start with PORT=<free port>.`);
      } else {
        console.error(`Server failed to start: ${err.message}`);
      }
      process.exit(1);
    });
  });
});

function seed(cb) {
  const steps = [
    [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      )`,
    ],
    ["DELETE FROM users"],
    ...[
      ["alice", "pw123"],
      ["bob", "hunter2"],
      ["admin", "rootpass"],
      ["charlie", "letmein"],
    ].map((u) => ["INSERT INTO users (username, password) VALUES (?, ?)", ...u]),
  ];

  const next = (i) => {
    if (i === steps.length) return cb(null);
    db.run(steps[i][0], steps[i].slice(1), (err) => (err ? cb(err) : next(i + 1)));
  };
  next(0);
}

/* Bounded read: caps rows and wall time so a runaway or huge result cannot
   hang or flood the single shared connection. db.each never calls the row
   callback for writes, so INSERT/UPDATE/DROP still work and give no rows. */
function queryRows(sql, params, cb) {
  const rows = [];
  const meta = { truncated: false, timedOut: false };
  let rowErr = null;

  const timer = setTimeout(() => {
    meta.timedOut = true;
    db.interrupt();
  }, QUERY_TIMEOUT_MS);

  db.each(
    sql,
    params,
    (err, row) => {
      /* db.each reports engine errors here, not to the completion callback */
      if (err) {
        rowErr = rowErr || err;
        return;
      }
      if (meta.truncated) return;
      if (rows.length >= ROW_CAP) {
        meta.truncated = true;
        db.interrupt();
        return;
      }
      rows.push(row);
    },
    (doneErr) => {
      const err = doneErr || rowErr;
      clearTimeout(timer);
      if (err && (meta.truncated || meta.timedOut) && err.code === "SQLITE_INTERRUPT") {
        return cb(null, rows, meta);
      }
      cb(err || null, rows, meta);
    },
  );
}

const noop = () => {};

function asBody(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function buildResponse(label, status, result, note = "", detail = {}) {
  return {
    label,
    status,
    result,
    note,
    ...detail,
  };
}

/* sqlite3 compiles a single statement: everything after the first `;` that
   isn't inside a quoted literal is silently discarded. A demo that prints the
   whole interpolated string therefore credits the reader with an attack that
   never ran. Split the text the same way the driver does so the page can show
   what executed and name what was thrown away.

   A reviewer typing their own script makes this worth being exact about: a `;`
   inside a `--` comment, a `/* *\/` block, or a `[bracketed identifier]` is not
   a statement boundary, and claiming a tail was discarded when the boundary was
   imaginary is the exact lie this page exists not to tell. */
function splitStatements(sql) {
  let quote = null;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const pair = sql.slice(i, i + 2);

    if (quote) {
      /* a doubled quote is an escaped quote, not a closer */
      if (ch === quote && sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }

    if (pair === "--") {
      const nl = sql.indexOf("\n", i);
      if (nl < 0) return { executed: sql.slice(0, i), ignored: sql.slice(i) };
      i = nl + 1;
      continue;
    }

    if (pair === "/*") {
      const close = sql.indexOf("*/", i + 2);
      i = close < 0 ? sql.length : close + 2;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      i++;
      continue;
    }

    if (ch === "[") {
      const close = sql.indexOf("]", i);
      i = close < 0 ? sql.length : close + 1;
      continue;
    }

    if (ch === ";") return { executed: sql.slice(0, i), ignored: sql.slice(i) };
    i++;
  }

  return { executed: sql, ignored: "" };
}

app.get("/api/health", (req, res) => {
  db.get("SELECT 1 AS ok", (err) => {
    if (err) return res.status(503).json({ ok: false, message: "database unavailable." });
    res.json({ ok: true, message: "SQLShield Demo backend is running." });
  });
});

/* Drops everything, including objects a script created, then reseeds. Order
   matters: triggers and views reference tables. */
app.post("/api/reset", (req, res) => {
  const fail = (err) => res.status(500).json({ error: `reset failed: ${err.message}` });
  const quote = (n) => `"${String(n).replace(/"/g, '""')}"`;

  db.serialize(() => {
    db.all(
      "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
      (err, objs) => {
        if (err) return fail(err);

        const drops = [];
        for (const type of ["trigger", "view", "table", "index"]) {
          for (const o of objs.filter((x) => x.type === type)) {
            drops.push(`DROP ${type.toUpperCase()} IF EXISTS ${quote(o.name)}`);
          }
        }

        const next = (i) => {
          if (i === drops.length) {
            return seed((seedErr) => {
              if (seedErr) return fail(seedErr);
              res.json({ ok: true, users: 4, message: "Database reset. 4 users restored." });
            });
          }
          db.run(drops[i], (dropErr) => (dropErr ? fail(dropErr) : next(i + 1)));
        };
        next(0);
      },
    );
  });
});

app.post("/api/login-demo", (req, res) => {
  const { mode = "safe", username = "", password = "" } = asBody(req);

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "username and password are required." });
  }

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "username and password must be strings." });
  }

  if (username.length > 200 || password.length > 200) {
    return res
      .status(400)
      .json({ error: "username and password must be 200 characters or fewer." });
  }

  if (mode !== "safe" && mode !== "vulnerable") {
    return res.status(400).json({ error: 'mode must be "safe" or "vulnerable".' });
  }

  if (mode === "vulnerable") {
    const unsafeQuery = `SELECT id, username FROM users WHERE username = '${username}' AND password = '${password}'`;
    const { executed, ignored } = splitStatements(unsafeQuery);
    const detail = { query: unsafeQuery, executed, ignored, boundValues: null };

    queryRows(unsafeQuery, [], (err, rows, meta) => {
      if (meta.timedOut) {
        return res
          .status(504)
          .json(buildResponse("vulnerable", "rejected", [], `${TIMEOUT_NOTE} No rows came back.`, { ...detail, timedOut: true }));
      }

      if (err) {
        return res
          .status(500)
          .json(buildResponse("vulnerable", "unsafe", [], err.message, detail));
      }

      let note = ignored
        ? "Unsafe SQL string interpolation lets user input become query logic. Only the first statement in this string was compiled — the rest was discarded by the driver."
        : "Unsafe SQL string interpolation allows user input to become executable query logic.";
      if (meta.truncated) note += TRUNC_NOTE;

      const body = buildResponse("vulnerable", "unsafe", rows, note, detail);
      if (meta.truncated) body.truncated = true;
      return res.json(body);
    });

    return;
  }

  /* a prepared single-row read cannot be made to run long or return many rows,
     so the safe path keeps plain db.get */
  const safeQuery =
    "SELECT id, username FROM users WHERE username = ? AND password = ?";
  const boundValues = [username, password];

  db.get(safeQuery, boundValues, (err, row) => {
    if (err) {
      return res
        .status(500)
        .json(buildResponse("safe", "safe", [], err.message));
    }

    return res.json(
      buildResponse(
        "safe",
        "safe",
        row ? [row] : [],
        "Prepared statements keep input as a value instead of SQL syntax.",
        { query: safeQuery, boundValues },
      ),
    );
  });
});

app.get("/api/search-demo", (req, res) => {
  const raw = req.query.term;

  if (raw !== undefined && typeof raw !== "string") {
    return res.status(400).json({ error: "term must be a single string." });
  }
  if (raw && raw.length > 200) {
    return res.status(400).json({ error: "term must be 200 characters or fewer." });
  }

  const term = String(raw || "");

  if (!term) {
    return res.json({
      safe: [],
      unsafe: [],
      boundValues: { safe: null, unsafe: null },
      note: "No term provided.",
    });
  }

  const safeQuery =
    "SELECT id, username FROM users WHERE username LIKE ? ORDER BY username";
  const unsafeQuery = `SELECT id, username FROM users WHERE username LIKE '%${term}%' ORDER BY username`;
  const unsafe = splitStatements(unsafeQuery);
  const timedOut = () =>
    res.status(504).json({ error: TIMEOUT_NOTE, timedOut: true });

  queryRows(safeQuery, [`%${term}%`], (safeErr, safeRows, safeMeta) => {
    if (safeMeta.timedOut) return timedOut();
    if (safeErr) {
      return res.status(500).json({ error: safeErr.message });
    }

    queryRows(unsafeQuery, [], (unsafeErr, unsafeRows, unsafeMeta) => {
      if (unsafeMeta.timedOut) return timedOut();
      if (unsafeErr) {
        return res.status(500).json({ error: unsafeErr.message });
      }

      let note = unsafe.ignored
        ? "The safe query binds the term as data; the unsafe query injects it into SQL text. Only the first statement was compiled — the rest was discarded."
        : "The safe query binds the term as data; the unsafe query injects it into SQL text.";
      const anyTrunc = safeMeta.truncated || unsafeMeta.truncated;
      if (anyTrunc) note += TRUNC_NOTE;

      const body = {
        safe: safeRows,
        unsafe: unsafeRows,
        queries: { safe: safeQuery, unsafe: unsafeQuery },
        executed: { safe: safeQuery, unsafe: unsafe.executed },
        ignored: { safe: "", unsafe: unsafe.ignored },
        boundValues: { safe: [`%${term}%`], unsafe: null },
        note,
      };
      if (anyTrunc) body.truncated = { safe: safeMeta.truncated, unsafe: unsafeMeta.truncated };
      return res.json(body);
    });
  });
});

/* One script at a time: the BEGIN … changes() … COMMIT wrapper below must not
   interleave with another script's wrapper on the shared connection. */
let runChain = Promise.resolve();

/* leading whitespace and comments hide a transaction keyword from a naive
   prefix test, so strip them the way SQLite would skip them */
function stripLeading(sql) {
  let t = sql;
  for (;;) {
    const before = t;
    t = t.replace(/^\s+/, "");
    if (t.startsWith("--")) {
      const nl = t.indexOf("\n");
      t = nl < 0 ? "" : t.slice(nl + 1);
    } else if (t.startsWith("/*")) {
      const close = t.indexOf("*/", 2);
      t = close < 0 ? "" : t.slice(close + 2);
    }
    if (t === before) return t;
  }
}

app.post("/api/run-script", (req, res) => {
  const script = asBody(req).script;

  /* trust boundary: a missing, non-string, or blank script is refused before
     anything is handed to the driver */
  if (typeof script !== "string" || !script.trim()) {
    return res.status(400).json({ error: "script is required and must be a string." });
  }

  if (script.length > 10000) {
    return res.status(400).json({ error: "script must be 10000 characters or fewer." });
  }

  const { executed, ignored } = splitStatements(script);

  /* everything before the first `;` was compiled; a script that opens with one
     compiled nothing at all, which is a refusal, not a zero-row result */
  if (!executed.trim()) {
    return res
      .status(400)
      .json({ error: "nothing to run before the first `;` — SQLite compiles one statement per call." });
  }

  /* these either break the wrapper transaction (and crash the shared
     connection) or write files */
  if (/^(begin|commit|end|rollback|savepoint|release|vacuum)\b/i.test(stripLeading(executed))) {
    return res.status(400).json({
      error:
        "BEGIN, COMMIT, END, ROLLBACK, SAVEPOINT, RELEASE and VACUUM are blocked on this demo server: they crash the shared connection or write files.",
    });
  }

  runChain = runChain.then(
    () =>
      new Promise((release) => {
        try {
          runLocked(script, executed, ignored, res, release);
        } catch (err) {
          console.error(err);
          if (!res.headersSent) res.status(500).json({ error: "internal error." });
          release();
        }
      }),
  );
});

function runLocked(script, executed, ignored, res, release) {
  /* `changes()` is connection-wide and reports the last write, so the
     statement and the read of its own change count are queued together inside
     one transaction: nothing another request queued can slip between them and
     be counted for this one. */
  db.serialize(() => {
    db.run("BEGIN", noop);

    let outcome = null;
    queryRows(executed, [], (err, rows, meta) => {
      outcome = { err, rows, meta };
    });

    db.get(
      "SELECT changes() AS changes, last_insert_rowid() AS lastID",
      (probeErr, meta) => {
        db.run("COMMIT", (commitErr) => {
          if (commitErr) db.run("ROLLBACK", noop);

          const detail = {
            query: script,
            executed,
            ignored,
            boundValues: null,
            changes: 0,
            lastID: null,
          };

          if (outcome.meta.timedOut) {
            res.status(504).json(
              buildResponse(
                "custom",
                "rejected",
                [],
                `${TIMEOUT_NOTE} No rows came back.`,
                { ...detail, timedOut: true },
              ),
            );
          } else if (outcome.err) {
            res
              .status(500)
              .json(buildResponse("custom", "rejected", [], outcome.err.message, detail));
          } else {
            /* `changes()` keeps reporting the last write, so on a statement that
               only reads it is a stale number from someone else's row. Claiming
               one would be worse than reporting none, so a leading read keyword
               means zero and the record reports only the rows it really got. */
            const readsOnly = /^\s*(select|pragma|explain|with)\b/i.test(executed);
            detail.changes = readsOnly || probeErr ? 0 : meta?.changes ?? 0;
            detail.lastID = readsOnly || probeErr ? null : meta?.lastID ?? null;

            let note = ignored
              ? "Sent as the statement body — no binding, no escaping. SQLite compiled the first statement exactly as typed and discarded the rest."
              : "Sent as the statement body — no binding, no escaping. SQLite compiled it exactly as typed.";
            if (outcome.meta.truncated) note += TRUNC_NOTE;

            const body = buildResponse("custom", "ran", outcome.rows, note, detail);
            if (outcome.meta.truncated) body.truncated = true;
            res.json(body);
          }

          release();
        });
      },
    );
  });
}

/* unknown API paths get JSON, not the SPA shell */
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "no such route." });
  next();
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* never leak stacks or absolute paths to the client */
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "request body must be valid JSON." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "request body is too large." });
  }
  console.error(err);
  res.status(500).json({ error: "internal error." });
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  setTimeout(() => process.exit(1), 3000).unref();
  const closeDb = () => db.close(() => process.exit(0));
  if (server) {
    server.close(closeDb);
    server.closeAllConnections();
  }
  else closeDb();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
