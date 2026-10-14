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
  const dom = await JSDOM.fromURL(BASE + "/", {
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
      if (!win.document.fonts)
        Object.defineProperty(win.document, "fonts", {
          value: { ready: Promise.resolve(), check: () => true, load: () => Promise.resolve([]) },
        });
    },
  });
  return dom.window;
}

// open page, run fn(win, helpers), always close
async function withPage(fn, opts = {}) {
  const win = await openPage(opts);
  try {
    const $ = (id) => win.document.getElementById(id);
    const stamps = () => [...win.document.querySelectorAll(".stamp")].map((s) => s.textContent.trim());
    const hasStamp = (w) => until(() => stamps().includes(w));
    const verdict = () => $("verdict").textContent.replace(/\s+/g, " ");
    const loaded = () => until(() => /0 rows/.test(verdict()) && /4 rows/.test(verdict()));
    const key = (el, init) => el.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, ...init }));
    const type = (el, v) => {
      el.value = v;
      el.dispatchEvent(new win.Event("input", { bubbles: true }));
    };
    await fn({ win, $, stamps, hasStamp, verdict, loaded, key, type });
  } finally {
    win.close();
  }
}

test("load: proof prints and lamp online", () =>
  withPage(async ({ $, verdict, loaded }) => {
    await loaded();
    assert.match(verdict(), /0 rows/);
    assert.match(verdict(), /4 rows/);
    assert.match($("lamp").textContent, /online/);
  }));

test("empty fields flag both inputs, focus username, stamp refused", () =>
  withPage(async ({ $, win, loaded, key, type, hasStamp }) => {
    await loaded();
    $("username").value = "";
    $("password").value = "";
    key($("username"), { key: "Enter" });
    await hasStamp("refused");
    assert.equal($("username").getAttribute("aria-invalid"), "true");
    assert.equal($("password").getAttribute("aria-invalid"), "true");
    assert.equal(win.document.activeElement.id, "username");
    type($("username"), "a");
    assert.equal($("username").hasAttribute("aria-invalid"), false);
  }));

test("preset arms the form; no load button", () =>
  withPage(async ({ $, win, loaded }) => {
    await loaded();
    const opt = [...$("preset").options].find((o) => /Classic/.test(o.textContent));
    $("preset").value = opt.value;
    $("preset").dispatchEvent(new win.Event("change", { bubbles: true }));
    assert.equal($("username").value, "' OR '1'='1 --");
    assert.equal($("username").value, opt.value);
    assert.equal($("loadBtn"), null);
  }));

for (const mod of ["ctrlKey", "metaKey"]) {
  test(`own statement runs on ${mod} + Enter`, () =>
    withPage(async ({ $, loaded, key, hasStamp }) => {
      await loaded();
      $("script").value = "SELECT username FROM users";
      key($("script"), { key: "Enter", [mod]: true });
      await hasStamp("ran");
    }));
}

test("saved statement persists, restore clears it", () =>
  withPage(async ({ $, win, loaded, type }) => {
    await loaded();
    type($("script"), "SELECT 2");
    assert.equal(win.localStorage.getItem("sqlshield.script"), "SELECT 2");
    $("restoreBtn").click();
    assert.equal($("script").value, $("script").defaultValue);
    assert.equal(win.localStorage.getItem("sqlshield.script"), null);
  }));

test("engine error stamp", () =>
  withPage(async ({ $, loaded, hasStamp }) => {
    await loaded();
    $("script").value = "SELEKT 1";
    $("scriptBtn").click();
    await hasStamp("engine error");
  }));

test("refused script stamp; server stays up", () =>
  withPage(async ({ $, loaded, hasStamp }) => {
    await loaded();
    $("script").value = "COMMIT";
    $("scriptBtn").click();
    await hasStamp("refused");
    assert.equal((await fetch(BASE + "/api/health")).status, 200);
  }));

test("reset restores users and reruns proof", () =>
  withPage(async ({ $, loaded, verdict, hasStamp }) => {
    await loaded();
    $("script").value = "DROP TABLE users";
    $("scriptBtn").click();
    await until(() => $("scriptTally").textContent.trim() || $("scriptNote").textContent.trim());
    $("resetBtn").click();
    await until(() => $("resetNote").textContent === "Database reset. 4 users restored.");
    await until(() => /4 rows/.test(verdict()));
  }));

test("offline stamp", () => {
  let down = false;
  return withPage(
    async ({ $, loaded, hasStamp }) => {
      await loaded();
      down = true;
      $("rerunBtn").click();
      await hasStamp("offline");
    },
    { fetch: (real) => (...a) => (down ? Promise.reject(new TypeError("Failed to fetch")) : real(...a)) },
  );
});

test("server timeout stamp", () => {
  let stub = false;
  return withPage(
    async ({ $, loaded, hasStamp }) => {
      await loaded();
      stub = true;
      $("unsafeBtn").click();
      await hasStamp("timed out");
    },
    {
      fetch: (real) => (url, init) =>
        /login-demo/.test(String(url)) && init?.method === "POST" && stub
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  label: "vulnerable",
                  status: "rejected",
                  result: [],
                  note: "Stopped after 6 seconds: the statement ran longer than the demo allows and was interrupted. No rows came back.",
                  timedOut: true,
                }),
                { status: 504, headers: { "content-type": "application/json" } },
              ),
            )
          : real(url, init),
    },
  );
});

test("client timeout stamp and tally", { timeout: 20000 }, () => {
  let hang = false;
  return withPage(
    async ({ $, win, loaded, type, hasStamp }) => {
      await loaded();
      hang = true;
      type($("username"), "alice");
      type($("password"), "pw123");
      $("safeBtn").click();
      await until(() => $("safeStamp").textContent.trim() === "timed out", 12000);
      assert.match($("safeTally").textContent, /8 seconds/);
    },
    {
      fetch: (real) => (url, init) =>
        hang
          ? new Promise((_, rej) =>
              init?.signal?.addEventListener("abort", () =>
                rej(new DOMException("aborted", "AbortError")),
              ),
            )
          : real(url, init),
    },
  );
});
