/* Load test for the SQLShield demo. Run with `npm run load`.
   It measures the three read-heavy endpoints a presenter and instructor hit
   during a session: bound login, pasted login and search. Budget: p95 latency
   under 50 ms and no errors. The budget fits one presenter plus an instructor
   on localhost; 20 concurrent clients is far above real use, so a pass here
   leaves room. The script starts its own server on a free port and stops it
   on exit, pass or fail. */

const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const WORKERS = 20;
const DURATION_MS = 10_000;
const P95_MS = 50;
const MAX_ERRORS = 0;

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

const waitForHealth = async (base, child) => {
  const deadline = Date.now() + 5000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(`${base}/api/health`);
      await res.text();
      if (res.status === 200) return;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) throw new Error("server did not answer /api/health within 5 s");
    await new Promise((r) => setTimeout(r, 100));
  }
};

const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const mix = (base) => [
  () => fetch(`${base}/api/login-demo`, json({ mode: "safe", username: "alice", password: "pw123" })),
  () => fetch(`${base}/api/login-demo`, json({ mode: "vulnerable", username: "' OR 1=1 --", password: "x" })),
  () => fetch(`${base}/api/search-demo?term=al`),
];

const percentile = (sorted, p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

async function run(base) {
  const latencies = [];
  let errors = 0;
  const start = performance.now();
  const deadline = start + DURATION_MS;

  const worker = async () => {
    const requests = mix(base);
    while (performance.now() < deadline) {
      for (const send of requests) {
        if (performance.now() >= deadline) break;
        const t0 = performance.now();
        try {
          const res = await send();
          await res.arrayBuffer();
          if (res.status !== 200) errors++;
        } catch {
          errors++;
        }
        latencies.push(performance.now() - t0);
      }
    }
  };

  await Promise.all(Array.from({ length: WORKERS }, worker));
  const elapsedSec = (performance.now() - start) / 1000;
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    requests: latencies.length,
    errors,
    rps: latencies.length / elapsedSec,
    p50: percentile(sorted, 50) ?? 0,
    p95: percentile(sorted, 95) ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: "ignore",
  });
  try {
    await waitForHealth(base, child);
    const r = await run(base);
    const pass = r.requests > 0 && r.p95 < P95_MS && r.errors <= MAX_ERRORS;
    console.log(`requests: ${r.requests}  errors: ${r.errors}  rps: ${r.rps.toFixed(0)}`);
    console.log(
      `p50: ${r.p50.toFixed(1)} ms  p95: ${r.p95.toFixed(1)} ms  max: ${r.max.toFixed(1)} ms`
    );
    console.log(`budget: p95 < ${P95_MS} ms, ${MAX_ERRORS} errors -> ${pass ? "PASS" : "FAIL"}`);
    return pass ? 0 : 1;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    }
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`load test error: ${err.message}`);
    process.exit(1);
  }
);
