import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";

const port = 3399;
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "neno-session-restart-"));
const password = "TestingPassword123!";
const environment = {
  ...process.env,
  NODE_ENV: "test",
  SMOKE_TEST: "true",
  SMOKE_TEST_MFA_BYPASS: "true",
  PORT: String(port),
  DATA_DIR: dataDir,
  PUBLIC_BASE_URL: `http://repair.nenosensei.com:${port}`,
  STAFF_BASE_URL: `http://staff.nenosensei.com:${port}`,
  ADMIN_USERNAME: "owner",
  ADMIN_EMAIL: "owner@example.com",
  ADMIN_PASSWORD_HASH: await bcrypt.hash(password, 4),
};

const request = (url, options = {}) => fetch(`${base}${url}`, {
  ...options,
  headers: {
    Host: "staff.nenosensei.com",
    "X-Neno-Test-Host": "staff",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  },
  body: options.body ? JSON.stringify(options.body) : undefined,
});

let child;
try {
  child = await startServer();
  const login = await request("/api/admin/login", { method: "POST", body: { username: "owner", password } });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert(login.ok && cookie?.startsWith("neno_admin="), "test login did not create a durable session");
  const before = await request("/api/admin/session", { headers: { Cookie: cookie } });
  assert(before.ok && (await before.json()).ok, "session was not valid before restart");

  await stopServer(child);
  child = await startServer();

  const after = await request("/api/admin/session", { headers: { Cookie: cookie } });
  assert(after.ok && (await after.json()).ok, "session did not survive a graceful server restart");

  await stopServer(child, "SIGKILL");
  child = await startServer();
  const afterForcedStop = await request("/api/admin/session", { headers: { Cookie: cookie } });
  assert(afterForcedStop.ok && (await afterForcedStop.json()).ok, "session did not survive a forced server stop");
  console.log("Durable session survived graceful and forced server restarts.");
} finally {
  if (child?.exitCode === null) await stopServer(child);
  fs.rmSync(dataDir, { recursive: true, force: true });
}

async function startServer() {
  const processHandle = spawn(process.execPath, ["server/index.mjs"], { cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  processHandle.stdout.on("data", (chunk) => { output += chunk; });
  processHandle.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await request("/health")).ok) return processHandle; } catch { /* startup */ }
    if (processHandle.exitCode !== null) throw new Error(`Server exited during startup:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start:\n${output}`);
}

async function stopServer(processHandle, signal = "SIGTERM") {
  if (processHandle.exitCode !== null) return;
  processHandle.kill(signal);
  await new Promise((resolve) => processHandle.once("exit", resolve));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
