import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const port = 3398; const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "neno-a11y-test-"));
const child = spawn(process.execPath, ["server/index.mjs"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test", SMOKE_TEST: "true", PORT: String(port), DATA_DIR: dataDir, PUBLIC_BASE_URL: `http://127.0.0.1:${port}`, STAFF_BASE_URL: `http://127.0.0.1:${port}` }, stdio: "ignore" });
let browser;
try {
  let ready = false; for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { ready = true; break; } } catch { /* startup */ } await new Promise((resolve) => setTimeout(resolve, 100)); } if (!ready) throw new Error("Accessibility test server did not start.");
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  for (const route of ["/", "/contact", "/account", "/faq", "/privacy", "/admin"]) { await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "domcontentloaded" }); const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); const blocking = results.violations.filter((item) => ["critical", "serious"].includes(item.impact)); if (blocking.length) throw new Error(`${route} accessibility violations:\n${blocking.map((item) => `${item.id}: ${item.help}\n${item.nodes.map((node) => node.html).join("\n")}`).join("\n")}`); }
  console.log("Accessibility smoke passed for public, account, legal, contact, FAQ, and staff sign-in routes.");
} finally { if (browser) await browser.close(); child.kill("SIGTERM"); await new Promise((resolve) => child.once("exit", resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); }
