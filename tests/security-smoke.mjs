import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";

const port = 3397;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "neno-repair-test-"));
const password = "TestingPassword123!";
const child = spawn(process.execPath, ["server/index.mjs"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test", SMOKE_TEST: "true", PORT: String(port), DATA_DIR: dataDir, PUBLIC_BASE_URL: `http://repair.nenosensei.com:${port}`, STAFF_BASE_URL: `http://staff.nenosensei.com:${port}`, ADMIN_USERNAME: "owner", ADMIN_EMAIL: "owner@example.com", ADMIN_PASSWORD_HASH: await bcrypt.hash(password, 4) }, stdio: ["ignore", "pipe", "pipe"] });
let output = ""; child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
const base = `http://127.0.0.1:${port}`;
const request = (url, host, options = {}) => fetch(`${base}${url}`, { ...options, headers: { Host: host, "X-Neno-Test-Host": host.startsWith("staff.") ? "staff" : "public", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
const json = async (url, host, options) => { const response = await request(url, host, options); return { response, data: await response.json() }; };

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) { try { const health = await request("/health", "repair.nenosensei.com"); if (health.ok) { ready = true; break; } } catch { /* startup */ } if (child.exitCode !== null) break; await new Promise((resolve) => setTimeout(resolve, 100)); }
  assert(ready, "server did not start");
  const home = await request("/", "repair.nenosensei.com"); assert(home.status === 200, "home route failed"); assert((await home.text()).includes("Computer repair in Philadelphia"), "route metadata was not injected");
  const missing = await request("/definitely-missing", "repair.nenosensei.com"); assert(missing.status === 404, "site 404 did not return HTTP 404");
  const sitemap = await request("/sitemap.xml", "repair.nenosensei.com"); assert(sitemap.status === 200 && (await sitemap.text()).includes("/services/computer-repair"), "sitemap failed");
  const publicAdmin = await request("/api/admin/session", "repair.nenosensei.com"); assert(publicAdmin.status === 404, "public admin API was disclosed");
  const publicAdminPage = await request("/admin", "repair.nenosensei.com"); assert(publicAdminPage.status === 404, "public admin page was disclosed");
  const staffPublicApi = await request("/api/account/session", "staff.nenosensei.com"); assert(staffPublicApi.status === 404, "customer API was exposed on staff host");
  const registration = await json("/api/account/register", "repair.nenosensei.com", { method: "POST", body: { name: "Test Customer", email: "test@example.com", phone: "215-555-0100", password } }); assert(registration.response.status === 202 && registration.data.verificationUrl, "registration failed");
  const token = new URL(registration.data.verificationUrl).searchParams.get("token");
  const verifyGet = await request(`/api/account/verify?token=${encodeURIComponent(token)}`, "repair.nenosensei.com"); assert(verifyGet.status === 404, "verification GET still mutates or resolves");
  const verify = await json("/api/account/verify", "repair.nenosensei.com", { method: "POST", body: { token } }); assert(verify.response.ok, "verification POST failed");
  const duplicate = await json("/api/account/register", "repair.nenosensei.com", { method: "POST", body: { name: "Different Name", email: "test@example.com", phone: "215-555-9999", password } }); assert(duplicate.response.status === registration.response.status && duplicate.data.message === registration.data.message, "registration enumerates accounts");
  const login = await json("/api/account/login", "repair.nenosensei.com", { method: "POST", body: { email: "test@example.com", password } }); const customerCookie = login.response.headers.get("set-cookie")?.split(";")[0]; assert(login.response.ok && customerCookie, "customer login failed");
  const session = await json("/api/account/session", "repair.nenosensei.com", { headers: { Cookie: customerCookie } }); assert(session.data.csrfToken, "customer CSRF token missing");
  const logoutWithoutCsrf = await request("/api/account/logout", "repair.nenosensei.com", { method: "POST", headers: { Cookie: customerCookie } }); assert(logoutWithoutCsrf.status === 403, "customer logout accepted missing CSRF");
  const logout = await request("/api/account/logout", "repair.nenosensei.com", { method: "POST", headers: { Cookie: customerCookie, "X-CSRF-Token": session.data.csrfToken } }); assert(logout.ok, "customer logout with CSRF failed");
  const staffLogin = await json("/api/admin/login", "staff.nenosensei.com", { method: "POST", body: { username: "owner", password } }); const pendingCookie = staffLogin.response.headers.get("set-cookie")?.split(";")[0]; assert(staffLogin.response.ok && staffLogin.data.mfaRequired && pendingCookie && !staffLogin.response.headers.get("set-cookie")?.startsWith("neno_admin="), "password created a full staff session without MFA");
  for (let attempt = 0; attempt < 6; attempt += 1) { const passkeyStart = await json("/api/admin/mfa/passkey/register-options", "staff.nenosensei.com", { method: "POST", headers: { Cookie: pendingCookie } }); assert(passkeyStart.response.ok && typeof passkeyStart.data.options?.challenge === "string" && passkeyStart.data.flowToken, `passkey options failed on request ${attempt + 1}`); }
  const contact = await json("/api/contact", "repair.nenosensei.com", { method: "POST", body: { name: "Test Customer", email: "test@example.com", phone: "215-555-0100", message: "My computer will not start and I need an appointment." } }); assert(contact.data.message.includes("We normally reply the same day"), "contact confirmation wording failed");
  console.log("Security integration smoke passed.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}

function assert(condition, message) { if (!condition) throw new Error(`${message}\nServer output:\n${output}`); }
