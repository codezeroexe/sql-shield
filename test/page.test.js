"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { JSDOM } = require("jsdom");

let BASE = process.env.PAGE_BASE;
let child;

const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`until timed out${last instanceof Error ? ": " + last.message : ""}`);
};

before(async () => {
  if (BASE) return;
  const port = 3990 + Math.floor(Math.random() * 100);
  BASE = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  await until(async () => (await fetch(BASE + "/api/health")).ok, 5000);
});

after(() => child?.kill("SIGTERM"));

beforeEach(async () => {
  await fetch(BASE + "/api/reset", { method: "POST" });
});

async function openPage(opts = {}) {
  const dom = await JSDOM.fromURL(BASE + "/" + (opts.hash || ""), {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(win) {
      const real = (...a) => globalThis.fetch(new URL(a[0], BASE), ...a.slice(1));
      win.fetch = opts.fetch ? opts.fetch(real, win) : real;
      win.AbortController = AbortController;
      win.Element.prototype.scrollIntoView = () => {};
      if (!win.matchMedia)
        win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    },
  });
  return dom.window;
}

// fetch wrapper that records "METHOD path" for every page request
const spy = (calls, stub) => (real) => (url, init) => {
  calls.push(`${init?.method || "GET"} ${url}`);
  return (stub && stub(url, init)) || real(url, init);
};
const json = (status, body) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

async function withPage(fn, opts = {}) {
  const win = await openPage(opts);
  try {
    const d = win.document;
    const $ = (id) => d.getElementById(id);
    const q = (sel) => d.querySelector(sel);
    const text = (sel) => (q(sel)?.textContent || "").replace(/\s+/g, " ").trim();
    const visible = () => [...d.querySelectorAll("[data-screen]")].filter((s) => !s.hidden).map((s) => s.dataset.screen);
    const go = async (hash) => {
      win.location.hash = hash;
      await until(() => visible().join() === hash.replace(/^#\//, ""));
    };
    const key = (el, init) => el.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, ...init }));
    const settled = (sel) => until(() => text(sel) && !/Asking the database/.test(text(sel)));
    await fn({ win, d, $, q, text, visible, go, key, settled });
  } finally {
    win.close();
  }
}

test("empty hash shows home with one section and title", () =>
  withPage(async ({ d, visible }) => {
    await until(() => visible().join() === "home");
    assert.equal(d.title, "SQLShield · How SQL injection works, and how to stop it");
  }));

test("home shows live counts 8 and 0", () =>
  withPage(async ({ text }) => {
    await until(() => text("#hmU") === "8 users" && text("#hmS") === "0 users");
  }));

test("home Start the lessons goes to learn/1", () =>
  withPage(async ({ q, visible }) => {
    await until(() => visible().join() === "home");
    const a = q(".home__acts a.primary");
    assert.equal(a.getAttribute("href"), "#/learn/1");
    a.click();
    await until(() => visible().join() === "learn/1");
  }));

test("rail hidden on home, visible on learn/1; wordmark links to home", () =>
  withPage(async ({ win, q, go, visible }) => {
    await until(() => visible().join() === "home");
    assert.equal(win.getComputedStyle(q(".rail")).display, "none");
    await go("#/learn/1");
    assert.notEqual(win.getComputedStyle(q(".rail")).display, "none");
    assert.equal(q(".rail__brand").getAttribute("href"), "#/");
  }));

test("unknown hash goes home", () =>
  withPage(async ({ visible }) => {
    await until(() => visible().join() === "home");
  }, { hash: "#/nope" }));

test("each rail link shows its section and is the only aria-current", () =>
  withPage(async ({ d, win, visible }) => {
    const links = [...d.querySelectorAll(".rail__link")];
    assert.equal(links.length, 9);
    for (const a of links) {
      a.click();
      const want = a.getAttribute("href").slice(2);
      await until(() => visible().join() === want);
      const cur = [...d.querySelectorAll('.rail__link[aria-current="page"]')];
      assert.deepEqual(cur, [a], want);
    }
  }));

test("arrow keys move between lessons and are ignored in inputs", () =>
  withPage(async ({ win, d, key, go, visible }) => {
    await go("#/learn/1");
    key(d.body, { key: "ArrowRight" });
    await until(() => visible().join() === "learn/2");
    key(d.body, { key: "ArrowLeft" });
    await until(() => visible().join() === "learn/1");
    await go("#/learn/2");
    key(d.getElementById("l2u"), { key: "ArrowRight" });
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(visible(), ["learn/2"]);
  }));

test("lesson 6 Next points to the login tester", () =>
  withPage(async ({ q, go }) => {
    await go("#/learn/6");
    assert.equal(q('[data-screen="learn/6"] .explain__nav a.next').getAttribute("href"), "#/lab/login");
  }));

test("lesson 2 shows 8 users for the unsafe login", () =>
  withPage(async ({ q, text, go, settled }) => {
    await go("#/learn/2");
    q("#l2b").click();
    await settled('[data-screen="learn/2"] .out');
    assert.equal(text('[data-screen="learn/2"] .big'), "8 users");
  }));

test("lesson 4 shows 4 unsafe and 0 safe", () =>
  withPage(async ({ text, go, settled }) => {
    await go("#/learn/4");
    await settled('[data-screen="learn/4"] .out');
    assert.equal(text('[data-screen="learn/4"] .card.unsafe .cnt'), "8 users");
    assert.equal(text('[data-screen="learn/4"] .card.safe .cnt'), "0 users");
  }));

test("no learn screen shows raw JSON", () =>
  withPage(async ({ q, text, go, settled }) => {
    for (let i = 1; i <= 6; i++) {
      await go("#/learn/" + i);
      if (i === 2) q("#l2b").click();
      if (i === 5) q("#l5b").click();
      if (i !== 6) await settled(`[data-screen="learn/${i}"] .out`);
      const t = q(`[data-screen="learn/${i}"]`).textContent;
      assert.doesNotMatch(t, /"result"\s*:/, `learn/${i}`);
      assert.doesNotMatch(t, /"label"\s*:/, `learn/${i}`);
      assert.ok(t.length > 50, `learn/${i} empty`);
    }
  }));

test("banner: damaged, server down, intact", async () => {
  const health = (stub) => ({ fetch: spy([], (u) => /api\/health/.test(u) && stub()) });
  await withPage(async ({ text, $ }) => {
    await until(() => !$("banner").hidden);
    assert.match(text("#bannerText"), /The users table was deleted/);
  }, health(() => json(200, { ok: true, db: "damaged", users: 0 })));
  await withPage(async ({ text, $ }) => {
    await until(() => !$("banner").hidden);
    assert.match(text("#bannerText"), /The demo server is not running/);
  }, health(() => json(503, { ok: false })));
  await withPage(async ({ text, $ }) => {
    await until(() => !$("banner").hidden);
    assert.match(text("#bannerText"), /The demo server is not running/);
  }, health(() => Promise.reject(new TypeError("Failed to fetch"))));
  await withPage(async ({ $ }) => {
    await until(() => $("dbUsers").textContent === "8 users");
    assert.equal($("banner").hidden, true);
  });
});

test("rail footer shows 8 users; Reset posts /api/reset", () => {
  const calls = [];
  return withPage(
    async ({ $, text }) => {
      await until(() => $("dbUsers").textContent === "8 users");
      $("resetBtn").click();
      await until(() => text("#resetNote") === "Database reset. 8 users restored.");
      assert.ok(calls.includes("POST /api/reset"), calls.join());
    },
    { fetch: spy(calls) },
  );
});

test("login tester: example fills fields; Run both shows leak vs held", () =>
  withPage(async ({ win, $, q, text, go, settled }) => {
    await go("#/lab/login");
    const pick = (v) => {
      $("lgX").value = v;
      $("lgX").dispatchEvent(new win.Event("change", { bubbles: true }));
    };
    pick("alice");
    assert.equal($("lgU").value, "alice");
    assert.equal($("lgP").value, "pw123");
    pick("' OR 1=1 --");
    assert.equal($("lgU").value, "' OR 1=1 --");
    assert.equal($("lgP").value, "x");
    $("lgB").click();
    await settled("#lgOut");
    assert.equal(text(".card.unsafe .cnt"), "8 rows");
    assert.equal(text(".card.unsafe .verdict"), "Leaked: your text changed the question.");
    assert.equal(text(".card.safe .verdict"), "Held: your text stayed a value.");
  }));

test("search tester shows 8 vs 0", () =>
  withPage(async ({ $, text, go, settled }) => {
    await go("#/lab/search");
    $("seT").value = "x' OR 1=1 --";
    $("seB").click();
    await settled("#seOut");
    assert.equal(text(".card.unsafe .cnt"), "8 rows");
    assert.equal(text(".card.safe .cnt"), "0 rows");
  }));

test("sandbox runs a count and restores the example", () =>
  withPage(async ({ $, d, text, go, settled }) => {
    await go("#/lab/sandbox");
    const example = $("sqS").defaultValue;
    $("sqS").value = "SELECT count(*) FROM users";
    $("sqB").click();
    await settled("#sqOut");
    assert.equal(text("#sqOut .cnt"), "1 row");
    assert.equal(d.querySelectorAll("#sqOut tbody tr").length, 1);
    assert.match(text("#sqOut tbody td"), /^8$/);
    $("sqR").click();
    assert.equal($("sqS").value, example);
    assert.match(example, /username/);
  }));

test("log polls /api/trace on Lab screens only", () => {
  const calls = [];
  const traces = () => calls.filter((c) => /api\/trace/.test(c)).length;
  return withPage(
    async ({ go }) => {
      await new Promise((r) => setTimeout(r, 1800));
      assert.equal(traces(), 0, "learn screen polled");
      await go("#/lab/login");
      await until(() => traces() > 0);
      await go("#/learn/1");
      const n = traces();
      await new Promise((r) => setTimeout(r, 1800));
      assert.equal(traces(), n, "polled after leaving the lab");
    },
    { fetch: spy(calls), hash: "#/learn/1" },
  );
});

test("removed chrome stays removed", () =>
  withPage(async ({ d, $ }) => {
    await until(() => $("dbUsers").textContent === "8 users");
    const t = d.body.textContent.toLowerCase();
    assert.ok(!t.includes("backend online"));
    assert.ok(!t.includes("print evidence"));
    const script = [...d.querySelectorAll("script")].map((s) => s.textContent).join("\n");
    assert.ok(script.length > 1000);
    assert.doesNotMatch(script, /AudioContext/);
  }));
