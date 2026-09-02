import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";

const port = 3399; const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "neno-workflow-test-")); const password = "TestingPassword123!";
const child = spawn(process.execPath, ["server/index.mjs"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test", SMOKE_TEST: "true", SMOKE_TEST_MFA_BYPASS: "true", PORT: String(port), DATA_DIR: dataDir, PUBLIC_BASE_URL: `http://127.0.0.1:${port}`, STAFF_BASE_URL: `http://127.0.0.1:${port}`, ADMIN_USERNAME: "owner", ADMIN_EMAIL: "owner@example.com", ADMIN_PASSWORD_HASH: await bcrypt.hash(password, 4) }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`; let cookie = ""; let csrf = "";
const request = async (url, site, method = "GET", body) => { const response = await fetch(`${base}${url}`, { method, headers: { "X-Neno-Test-Host": site, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf && !["GET", "HEAD"].includes(method) ? { "X-CSRF-Token": csrf } : {}) }, body: body ? JSON.stringify(body) : undefined }); const data = await response.json(); return { response, data }; };
try {
  let ready = false; for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch { /* startup */ } await new Promise((resolve) => setTimeout(resolve, 100)); } assert(ready, "server did not start");
  const login = await request("/api/admin/login", "staff", "POST", { username: "owner", password }); cookie = login.response.headers.get("set-cookie")?.split(";")[0] || ""; assert(login.data.smokeTestMfaBypass && cookie, "test staff login failed"); const session = await request("/api/admin/session", "staff"); csrf = session.data.csrfToken;
  const customer = await request("/api/admin/customers", "staff", "POST", { name: "Workflow Customer", email: "workflow@example.com", phone: "215-555-0101" }); assert(customer.response.ok, "customer creation failed");
  const created = await request(`/api/admin/customers/${customer.data.customer.id}/work-orders`, "staff", "POST", { notes: "Intermittent shutdown during normal use.", deviceCondition: "Desktop received powered off.", accessories: "Power cable", services: [{ name: "Diagnostic and written estimate", priceCents: 4900 }, { name: "Standard computer repair", priceCents: 12900 }] }); assert(created.data.workOrder.status === "awaiting-approval", "estimate generation did not move to awaiting approval");
  const consent = await request(`/api/admin/work-orders/${encodeURIComponent(created.data.workOrder.id)}/consent`, "staff", "POST"); const token = new URL(consent.data.consentUrl).searchParams.get("token"); cookie = ""; csrf = "";
  const signed = await request("/api/account/consent", "public", "POST", { token, signatureName: "Workflow Customer", termsAccepted: true, electronicRecordsAccepted: true, accessoriesAcknowledged: true, accessoriesLeft: true, backupRequested: false }); assert(signed.data.workOrder.status === "approved-queued", "signature did not approve and queue the order");
  cookie = login.response.headers.get("set-cookie")?.split(";")[0] || ""; csrf = session.data.csrfToken;
  const inRepair = await request(`/api/admin/work-orders/${encodeURIComponent(created.data.workOrder.id)}`, "staff", "PATCH", { status: "in-repair" }); assert(inRepair.data.workOrder.status === "in-repair", "repair did not start");
  const readyOrder = await request(`/api/admin/work-orders/${encodeURIComponent(created.data.workOrder.id)}`, "staff", "PATCH", { status: "ready-for-pickup-payment", clientRepairNotes: "Work completed and final testing passed." }); assert(readyOrder.data.workOrder.status === "ready-for-pickup-payment", "ready transition failed");
  const closed = await request(`/api/admin/work-orders/${encodeURIComponent(created.data.workOrder.id)}`, "staff", "PATCH", { status: "closed", clientRepairNotes: "Work completed and final testing passed.", deviceReturnedOrRemoteEnded: true, paymentMethod: "square", squareReference: "TEST-123" }); assert(closed.data.workOrder.status === "closed" && closed.data.workOrder.completedAt, "paid closure failed");
  const deletion = await request(`/api/admin/work-orders/${encodeURIComponent(created.data.workOrder.id)}`, "staff", "DELETE"); assert(deletion.response.status === 409, "retained work order was directly deletable");
  console.log("Workflow smoke passed: estimate, approval, repair, ready, paid closure, and retention guard.");
} finally { child.kill("SIGTERM"); await new Promise((resolve) => child.once("exit", resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
