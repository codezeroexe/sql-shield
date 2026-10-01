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

    db.all(unsafeQuery, (err, rows) => {
      if (err) {
        return res
          .status(500)
          .json(buildResponse("vulnerable", "unsafe", [], err.message));
      }

      return res.json(
        buildResponse(
          "vulnerable",
          "unsafe",
          rows,
          "Unsafe SQL string interpolation allows user input to become executable query logic.",
          { query: unsafeQuery, boundValues: null },
        ),
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
        boundValues: { safe: [`%${term}%`], unsafe: null },
        note: "The safe query binds the term as data; the unsafe query injects it into SQL text.",
      });
    });
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`SQLShield Demo server running at http://localhost:${port}`);
});
