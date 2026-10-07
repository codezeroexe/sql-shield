const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "database.sqlite");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  }

  initializeDatabase();
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      )
    `);

    db.run("DELETE FROM users");

    const seedUsers = [
      ["alice", "pw123"],
      ["bob", "hunter2"],
      ["admin", "rootpass"],
      ["charlie", "letmein"],
    ];

    const stmt = db.prepare(
      "INSERT INTO users (username, password) VALUES (?, ?)",
    );
    seedUsers.forEach(([username, password]) => stmt.run(username, password));
    stmt.finalize();

    console.log("Database initialized with demo users.");
  });
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
  res.json({ ok: true, message: "SQLShield Demo backend is running." });
});

app.post("/api/login-demo", (req, res) => {
  const { mode = "safe", username = "", password = "" } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "username and password are required." });
  }

  if (mode === "vulnerable") {
    const unsafeQuery = `SELECT id, username FROM users WHERE username = '${username}' AND password = '${password}'`;
    const { executed, ignored } = splitStatements(unsafeQuery);

    db.all(unsafeQuery, (err, rows) => {
      if (err) {
        return res
          .status(500)
          .json(
            buildResponse("vulnerable", "unsafe", [], err.message, {
              query: unsafeQuery,
              executed,
              ignored,
              boundValues: null,
            }),
          );
      }

      const note = ignored
        ? "Unsafe SQL string interpolation lets user input become query logic. Only the first statement in this string was compiled — the rest was discarded by the driver."
        : "Unsafe SQL string interpolation allows user input to become executable query logic.";

      return res.json(
        buildResponse("vulnerable", "unsafe", rows, note, {
          query: unsafeQuery,
          executed,
          ignored,
          boundValues: null,
        }),
      );
    });

    return;
  }

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
  const term = String(req.query.term || "");

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

  db.all(safeQuery, [`%${term}%`], (safeErr, safeRows) => {
    if (safeErr) {
      return res.status(500).json({ error: safeErr.message });
    }

    db.all(unsafeQuery, (unsafeErr, unsafeRows) => {
      if (unsafeErr) {
        return res.status(500).json({ error: unsafeErr.message });
      }

      return res.json({
        safe: safeRows,
        unsafe: unsafeRows,
        queries: { safe: safeQuery, unsafe: unsafeQuery },
        executed: { safe: safeQuery, unsafe: unsafe.executed },
        ignored: { safe: "", unsafe: unsafe.ignored },
        boundValues: { safe: [`%${term}%`], unsafe: null },
        note: unsafe.ignored
          ? "The safe query binds the term as data; the unsafe query injects it into SQL text. Only the first statement was compiled — the rest was discarded."
          : "The safe query binds the term as data; the unsafe query injects it into SQL text.",
      });
    });
  });
});

app.post("/api/run-script", (req, res) => {
  const script = req.body?.script;

  /* trust boundary: a missing, non-string, or blank script is refused before
     anything is handed to the driver */
  if (typeof script !== "string" || !script.trim()) {
    return res.status(400).json({ error: "script is required and must be a string." });
  }

  const { executed, ignored } = splitStatements(script);

  /* everything before the first `;` was compiled; a script that opens with one
     compiled nothing at all, which is a refusal, not a zero-row result */
  if (!executed.trim()) {
    return res
      .status(400)
      .json({ error: "nothing to run before the first `;` — SQLite compiles one statement per call." });
  }

  /* `changes()` is connection-wide and reports the last write, so the
     statement and the read of its own change count are queued together inside
     one transaction: nothing another request queued can slip between them and
     be counted for this one. */
  db.serialize(() => {
    db.run("BEGIN");

    let outcome = null;
    db.all(executed, function (err, rows) {
      outcome = err ? { err } : { rows };
    });

    db.get(
      "SELECT changes() AS changes, last_insert_rowid() AS lastID",
      (probeErr, meta) => {
        db.run("COMMIT");

        const detail = {
          query: script,
          executed,
          ignored,
          boundValues: null,
          changes: 0,
          lastID: null,
        };

        if (outcome?.err) {
          return res
            .status(500)
            .json(buildResponse("custom", "rejected", [], outcome.err.message, detail));
        }

        /* `changes()` keeps reporting the last write, so on a statement that
           only reads it is a stale number from someone else's row. Claiming
           one would be worse than reporting none, so a leading read keyword
           means zero and the record reports only the rows it really got. */
        const readsOnly = /^\s*(select|pragma|explain|with)\b/i.test(executed);
        detail.changes = readsOnly || probeErr ? 0 : meta?.changes ?? 0;
        detail.lastID = readsOnly || probeErr ? null : meta?.lastID ?? null;

        const note = ignored
          ? "Sent as the statement body — no binding, no escaping. SQLite compiled the first statement exactly as typed and discarded the rest."
          : "Sent as the statement body — no binding, no escaping. SQLite compiled it exactly as typed.";

        return res.json(buildResponse("custom", "ran", outcome.rows, note, detail));
      },
    );
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`SQLShield Demo server running at http://localhost:${port}`);
});
