import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import nodemailer from "nodemailer";
import initSqlJs from "sql.js";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { publicRoutes, routeByPath, statusLabels } from "../shared/site-content.mjs";
import { privacyText, termsText, termsVersion } from "../shared/legal.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3001);
const dataDir = process.env.DATA_DIR || path.join(rootDir, "data");
const databasePath = path.join(dataDir, "tickets.sqlite");
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || "";
const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || "";
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://repair.nenosensei.com").replace(/\/$/, "");
const publicHost = process.env.PUBLIC_HOST || "repair.nenosensei.com";
const staffHost = process.env.STAFF_HOST || "staff.nenosensei.com";
const staffBaseUrl = (process.env.STAFF_BASE_URL || `https://${staffHost}`).replace(/\/$/, "");
const customerIdleMs = 8 * 60 * 60 * 1000;
const customerAbsoluteMs = 7 * 24 * 60 * 60 * 1000;
const adminIdleMs = 30 * 60 * 1000;
const adminAbsoluteMs = 8 * 60 * 60 * 1000;
const resetTokenTtlMs = 30 * 60 * 1000;
const invitationTtlMs = 48 * 60 * 60 * 1000;
const verificationTtlMs = 24 * 60 * 60 * 1000;
const approvalTtlMs = 30 * 24 * 60 * 60 * 1000;
const policyVersion = "Draft v2";
const draftTerms = `Neno’s IT Repair — Service Terms, Device Authorization, and Privacy Policy (Draft v2)

DRAFT — NOT CURRENTLY IN EFFECT. This policy is prepared for business-owner review and review by a qualified Pennsylvania attorney. It becomes effective only when published by Neno’s IT Repair.

Business: Neno’s IT Repair, Philadelphia, Pennsylvania
Notices and privacy requests: repair@nenosensei.com

1. Agreement

By submitting a work order, leaving a device with Neno’s IT Repair, approving services, or signing electronically, the customer agrees to the terms that apply to that work order. If the customer is not the device owner, the customer confirms that they have the owner's permission to request service and authorize access to the device.

2. Authorization and scope of service

The customer authorizes Neno’s IT Repair to inspect, test, clean, repair, configure, transfer, back up, or otherwise service the device only as described on the approved work order. Additional services, parts, or price changes require customer approval before the additional work begins. Limited additional diagnostic work may be performed when reasonably necessary to identify the reported problem.

The customer confirms that the requested work is lawful and that the customer has authority to provide the device and authorize the requested service. Neno’s IT Repair may refuse work that is unsafe, unlawful, outside its capabilities, or likely to create unreasonable risk.

3. Device condition and accessories

The customer agrees that the device condition and accessories recorded on the work order are accurate to the best of the customer's knowledge. Neno’s IT Repair is not responsible for pre-existing damage, normal wear, corrosion, liquid damage, missing parts, defective components, weakened hinges, cracked screens, damaged ports, or problems that become apparent during ordinary inspection or repair.

4. Data, backups, and credentials

The customer is responsible for maintaining current backups of important files before service. If backup service is selected, Neno’s IT Repair will make a reasonable effort to perform the approved backup, but a backup is not guaranteed to succeed or contain every file. The customer must confirm that important files were successfully preserved.

Repair, cleaning, updates, operating-system work, storage failure, malware removal, file transfers, and hardware failure may result in data loss, corrupted files, lost settings, or loss of access. To the maximum extent permitted by law, Neno’s IT Repair is not responsible for loss of data or files unless the law does not allow that limitation.

Customers should not provide passwords by email, text message, or through the website. When access credentials are necessary, the customer should use a temporary password whenever possible and change it after service. Neno’s IT Repair will not intentionally inspect personal files unless access is reasonably necessary to perform or verify the approved service.

5. Prices, parts, payment, and warranty

The quoted service total covers only the services listed on the work order. Parts, taxes, shipping, rush work, third-party charges, and separately approved work may be billed separately. Payment is due when stated on the invoice or work order.

Neno’s IT Repair does not guarantee that every problem can be repaired, that a device will remain operational after repair, or that a particular performance improvement will be achieved. Only a warranty specifically written on the applicable work order applies. No other warranty is made to the maximum extent permitted by law.

6. Storage and unclaimed devices

The customer must collect the device within 30 days after Neno’s IT Repair gives notice that service is complete or the device is ready for pickup. After the 30-day grace period, Neno’s IT Repair may charge a storage fee of $5 per day, where legally permitted.

After a reasonable notice period and any notices required by Pennsylvania law, Neno’s IT Repair may take lawful steps to dispose of or sell an unclaimed device to recover unpaid charges. The customer remains responsible for approved charges, storage charges, and reasonable collection costs to the extent permitted by law.

7. Liability limits

To the maximum extent permitted by Pennsylvania law, Neno’s IT Repair will not be responsible for indirect, incidental, special, consequential, or lost-profit damages, including loss of data, business interruption, lost revenue, lost files, or loss of use.

To the maximum extent permitted by law, Neno’s IT Repair's total liability for a claim related to a service will not exceed the amount the customer paid for the specific service giving rise to the claim. These limits do not waive rights or liabilities that cannot legally be waived.

8. Privacy and information handling

Neno’s IT Repair may collect the customer's name, email address, phone number, account information, work-order details, device information, accessories, service selections, prices, messages, approvals, typed signatures, policy versions accepted, and transaction information handled by the selected payment provider.

This information is used to provide and document services, communicate about work orders and payments, maintain customer accounts, prevent unauthorized access and abuse, respond to requests, maintain business and legal records, and protect customers, employees, and the business.

Neno’s IT Repair does not sell or rent customer personal information. Information may be shared only when reasonably necessary with authorized employees, hosting providers, email providers, payment processors, technical service providers, professional advisers, law enforcement, or government authorities with lawful authority.

Employees and contractors may access customer information only when needed to provide service, maintain systems, process a transaction, or meet a legal obligation. Neno’s IT Repair will collect only information reasonably needed for its business, use reasonable safeguards appropriate to the information, and securely dispose of information when it is no longer needed for a legitimate business, legal, tax, security, warranty, or dispute-related purpose.

Customers may contact repair@nenosensei.com to request correction of inaccurate account information, ask how their information is used, request applicable records, or request deletion when the information is no longer needed for a legitimate retention purpose. Some records may need to be retained for legal, accounting, security, fraud-prevention, warranty, or dispute-related reasons.

Neno’s IT Repair will investigate suspected security incidents and provide notices required by applicable law. No website, email system, or storage system can be guaranteed completely secure.

9. Electronic records and signatures

The customer agrees that work orders, approvals, notices, invoices, and related terms may be provided electronically. The customer confirms that they can access and retain electronic records using an internet-connected device and a current web browser.

The customer may request a paper copy by contacting repair@nenosensei.com. The customer may withdraw consent to electronic records by contacting the same address. Withdrawal may delay service or require paper records.

The customer's typed full legal name, submitted with the required acknowledgements, is intended to be an electronic signature for the applicable work order. The accepted policy version and exact policy text will be retained with the signed work order.

10. Changes and governing law

Neno’s IT Repair may update these terms by publishing a new version. The version accepted by the customer will be retained with the signed work order. These terms are governed by the laws of the Commonwealth of Pennsylvania, without waiving rights that cannot legally be waived.

11. Customer acknowledgement

By signing a work order, the customer confirms that they authorized the requested services, reviewed the notes, device condition, accessories, services, and prices, understand the backup and data-loss limitations, had an opportunity to review these terms, agree to the privacy practices above, consent to electronic records, and understand that repairs will not begin until the required approval is completed.`;

fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
fs.chmodSync(dataDir, 0o700);

const SQL = await initSqlJs({
  locateFile: (file) => path.join(rootDir, "node_modules", "sql.js", "dist", file),
});

const database = fs.existsSync(databasePath)
  ? new SQL.Database(fs.readFileSync(databasePath))
  : new SQL.Database();

database.run(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    customer_id INTEGER,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    assistance TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'request-received',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS staff_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_user_id INTEGER,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS work_order_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    service_name TEXT NOT NULL,
    price_cents INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS customer_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS terms_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    published_at TEXT
  );
  CREATE TABLE IF NOT EXISTS work_order_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    terms_version TEXT NOT NULL,
    terms_snapshot TEXT NOT NULL,
    services_snapshot_json TEXT NOT NULL,
    total_cents INTEGER NOT NULL DEFAULT 0,
    signature_name TEXT,
    terms_accepted INTEGER NOT NULL DEFAULT 0,
    electronic_records_accepted INTEGER NOT NULL DEFAULT 0,
    accessories_acknowledged INTEGER NOT NULL DEFAULT 0,
    accessories_left INTEGER,
    backup_requested INTEGER,
    signed_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'request-received',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS work_order_contact_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    staff_user_id INTEGER,
    outcome TEXT NOT NULL,
    notes TEXT NOT NULL,
    contacted_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS work_order_repair_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    staff_user_id INTEGER,
    note_text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);
ensureColumn("tickets", "customer_id", "INTEGER");
ensureColumn("tickets", "notes", "TEXT NOT NULL DEFAULT ''");
ensureColumn("tickets", "repair_notes", "TEXT NOT NULL DEFAULT ''");
ensureColumn("tickets", "device_condition", "TEXT NOT NULL DEFAULT ''");
ensureColumn("tickets", "accessories", "TEXT NOT NULL DEFAULT ''");
ensureColumn("tickets", "completed_at", "TEXT");
ensureColumn("tickets", "client_repair_notes", "TEXT NOT NULL DEFAULT ''");
ensureColumn("password_resets", "staff_user_id", "INTEGER");
ensureColumn("customers", "must_set_password", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("customers", "email_verified", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("work_order_services", "price_cents", "INTEGER");
database.run(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    principal_type TEXT NOT NULL,
    principal_id INTEGER NOT NULL,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    idle_expires_at TEXT NOT NULL,
    absolute_expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_challenges (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, staff_user_id INTEGER NOT NULL, kind TEXT NOT NULL, challenge TEXT, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS staff_passkeys (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_user_id INTEGER NOT NULL, credential_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, transports_json TEXT NOT NULL DEFAULT '[]', device_type TEXT, backed_up INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL DEFAULT 'Passkey', created_at TEXT NOT NULL, last_used_at TEXT);
  CREATE TABLE IF NOT EXISTS staff_totp (staff_user_id INTEGER PRIMARY KEY, secret_ciphertext TEXT NOT NULL, secret_iv TEXT NOT NULL, secret_tag TEXT NOT NULL, last_counter INTEGER, verified_at TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS customer_password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS request_throttles (
    scope TEXT NOT NULL,
    principal_key TEXT NOT NULL,
    window_started_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, principal_key)
  );
  CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    principal_type TEXT,
    principal_id INTEGER,
    ip_hash TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS staff_tool_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Operations',
    minimum_role TEXT NOT NULL DEFAULT 'admin',
    sort_order INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    system_key TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS retention_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT NOT NULL,
    decided_by INTEGER NOT NULL,
    decided_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS backup_heartbeats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_timestamp TEXT NOT NULL,
    result TEXT NOT NULL,
    received_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS review_deliveries (
    ticket_id INTEGER PRIMARY KEY,
    sent_at TEXT,
    email TEXT,
    result TEXT NOT NULL
  );
`);
ensureColumn("customers", "disabled_at", "TEXT");
ensureColumn("tickets", "payment_method", "TEXT");
ensureColumn("tickets", "paid_at", "TEXT");
ensureColumn("tickets", "square_reference", "TEXT");
ensureColumn("tickets", "service_ended_at", "TEXT");
ensureColumn("tickets", "legacy_closed", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("tickets", "review_eligible", "INTEGER NOT NULL DEFAULT 1");
database.run("INSERT OR IGNORE INTO terms_documents (version, body, status, created_at) VALUES (?, ?, 'draft', ?)", [policyVersion, draftTerms, new Date().toISOString()]);
database.run("INSERT OR IGNORE INTO terms_documents (version, body, status, created_at, published_at) VALUES (?, ?, 'published', ?, ?)", [termsVersion, termsText, new Date().toISOString(), new Date().toISOString()]);
database.run("UPDATE tickets SET notes = assistance WHERE notes = '' AND assistance <> ''");
database.run("UPDATE tickets SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL");
database.run("UPDATE tickets SET status = 'request-received' WHERE status = 'contact-needed'");
database.run("UPDATE tickets SET status = 'approved-queued' WHERE status = 'ready-to-start'");
database.run("UPDATE tickets SET status = 'in-repair' WHERE status = 'in-progress'");
database.run("UPDATE tickets SET status = 'closed', legacy_closed = 1, review_eligible = 0 WHERE status = 'completed'");
database.run("UPDATE contact_messages SET status = 'request-received' WHERE status = 'contact-needed'");
database.run("INSERT INTO work_order_repair_notes (ticket_id, note_text, created_at) SELECT t.id, t.repair_notes, COALESCE(t.updated_at, t.created_at) FROM tickets t WHERE t.repair_notes <> '' AND NOT EXISTS (SELECT 1 FROM work_order_repair_notes n WHERE n.ticket_id = t.id AND n.note_text = t.repair_notes)");
database.run("CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id)");
database.run("CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at)");
database.run("CREATE INDEX IF NOT EXISTS idx_work_order_services_ticket_id ON work_order_services(ticket_id)");
database.run("CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email COLLATE NOCASE)");
database.run("CREATE INDEX IF NOT EXISTS idx_staff_username ON staff_users(username COLLATE NOCASE)");
database.run("CREATE INDEX IF NOT EXISTS idx_customer_invites_customer_id ON customer_invites(customer_id)");
database.run("CREATE INDEX IF NOT EXISTS idx_work_order_consents_ticket_id ON work_order_consents(ticket_id)");
database.run("CREATE INDEX IF NOT EXISTS idx_contact_messages_updated_at ON contact_messages(updated_at)");
database.run("CREATE INDEX IF NOT EXISTS idx_work_order_contact_logs_ticket_id ON work_order_contact_logs(ticket_id, contacted_at DESC)");
database.run("CREATE INDEX IF NOT EXISTS idx_work_order_repair_notes_ticket_id ON work_order_repair_notes(ticket_id, created_at DESC)");
database.run("CREATE INDEX IF NOT EXISTS idx_email_verifications_customer_id ON email_verifications(customer_id)");
migrateInitialAdmin();
seedToolCards();
persistDatabase();

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], fontSrc: ["'self'", "https://fonts.googleapis.com"],
    styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"], imgSrc: ["'self'", "data:"],
    scriptSrc: ["'self'"], connectSrc: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"],
  } }, referrerPolicy: false,
}));
app.use((req, res, next) => {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  const testHost = process.env.SMOKE_TEST === "true" ? String(req.headers["x-neno-test-host"] || "") : "";
  if (testHost === "public") req.site = "public";
  else if (testHost === "staff") req.site = "staff";
  else if (host === publicHost) req.site = "public";
  else if (host === staffHost) req.site = "staff";
  else if (process.env.NODE_ENV !== "production" || ((host === "127.0.0.1" || host === "localhost") && req.path === "/health")) req.site = "local";
  else return res.status(421).type("text").send("Misdirected request.\n");
  const privateRoute = req.site === "staff" || req.path.startsWith("/api/") || /^\/(account|orders|consent)(\/|$)/.test(req.path);
  if (privateRoute) res.setHeader("Cache-Control", "no-store");
  if (req.site === "staff" || /^\/(account|orders|consent)(\/|$)/.test(req.path)) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", /(verify|setup|reset|consent)/.test(req.path) ? "no-referrer" : "strict-origin-when-cross-origin");
  return next();
});
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
    const cloudflareVisitor = String(req.headers["cf-visitor"] || "");
    const cloudflareScheme = cloudflareVisitor.match(/"scheme"\s*:\s*"(https?)"/i)?.[1]?.toLowerCase();
    const requestWasHttp = cloudflareScheme ? cloudflareScheme === "http" : forwardedProto === "http";
    if (requestWasHttp) return res.redirect(308, `${req.site === "staff" ? staffBaseUrl : publicBaseUrl}${req.originalUrl}`);
  }
  return next();
});
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "8kb" }));
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return res.status(403).json({ error: "Cross-site requests are not allowed." });
  const origin = String(req.headers.origin || "");
  const expected = req.site === "staff" ? new URL(staffBaseUrl).origin : new URL(publicBaseUrl).origin;
  if (origin && origin !== expected && req.site !== "local") return res.status(403).json({ error: "The request origin is not allowed." });
  return next();
});

function publicOnly(req, res, next) { return req.site === "public" || req.site === "local" ? next() : res.status(404).json({ error: "Not found." }); }
function staffOnly(req, res, next) { return req.site === "staff" || req.site === "local" ? next() : res.status(404).json({ error: "Not found." }); }
app.use("/api/admin", staffOnly);
app.use("/api/account", publicOnly);
app.use("/api/contact", publicOnly);
app.use("/api/tickets", publicOnly);
app.use("/api/service-choices", publicOnly);

const ticketLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many requests. Please try again later." } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many login attempts. Please try again later." } });
const accountLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many account requests. Please try again later." } });
const verificationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many verification requests. Please try again later." } });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many reset requests. Please try again later." } });
const mfaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many MFA requests. Start sign-in again in 15 minutes." } });
const validStatuses = new Set(["request-received", "diagnosing-estimating", "awaiting-approval", "approved-queued", "in-repair", "ready-for-pickup-payment", "closed"]);
const validRoles = new Set(["owner", "admin"]);
const validContactStatuses = new Set(["request-received", "closed"]);
const validContactOutcomes = new Set(["spoke", "left-voicemail", "no-connection"]);
const serviceChoices = [
  ["Diagnostic and written estimate", 4900], ["Standard computer repair", 12900], ["Gaming PC repair", 16900], ["PC tune-up", 8900], ["PC cleaning", 6900], ["Malware or virus removal", 12900], ["Severe malware removal", 17900], ["Windows repair", 13900], ["Windows reinstall with data preservation", 17900], ["New computer setup", 12900], ["Data transfer", 14900], ["SSD or hard-drive installation", 7900], ["SSD installation with data migration", 14900], ["Custom PC assembly", 19900], ["Remote support", 7900], ["Onsite support", 11900], ["PC training and lessons", 6500],
];

app.get("/health", (_req, res) => res.type("text").send("ok\n"));
app.get("/api/service-choices", (_req, res) => res.json({ services: serviceChoices.map(([name, defaultPriceCents]) => ({ name, defaultPriceCents })) }));
app.get("/api/policies/:kind", publicOnly, (req, res) => { if (req.params.kind === "privacy") return res.json({ version: termsVersion, body: privacyText }); if (req.params.kind === "terms") { const terms = getPublishedTerms(); return terms ? res.json({ version: terms.version, body: terms.body }) : res.status(404).json({ error: "No terms are published." }); } return res.status(404).json({ error: "Not found." }); });
app.post("/api/contact", ticketLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase(); const phone = cleanText(req.body.phone, 40); const message = cleanText(req.body.message || req.body.assistance, 2000); const honeypot = cleanText(req.body.company, 100);
  if (honeypot) return res.status(201).json({ ok: true, contact: { id: "received", status: "request-received" } });
  if (!name || !isEmail(email) || !phone || message.length < 10) return res.status(400).json({ error: "Please complete each field with valid details." });
  const now = new Date().toISOString(); const contactId = createContactId(); database.run("INSERT INTO contact_messages (contact_id, name, email, phone, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'request-received', ?, ?)", [contactId, name, email, phone, message, now, now]); persistDatabase(); const contact = getContact(contactId); const emailSent = await sendContactAcknowledgementEmail(contact); const notificationSent = await sendNewContactNotification(contact); return res.status(201).json({ ok: true, emailSent, notificationSent, contact: publicContactMessage(contact), message: `We received your message. Your reference is ${contactId}. We normally reply the same day.` });
});

app.post("/api/account/register", accountLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase();
  const phone = cleanText(req.body.phone, 40); const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!name || !isEmail(email) || phone.length < 7 || Array.from(password).length < 12) return res.status(400).json({ error: "Enter your name, a valid email, required phone number, and a password with at least 12 characters." });
  const generic = { ok: true, verificationRequired: true, message: "If this address can be used, we sent the appropriate next step. Check your email." };
  const existing = getCustomerByEmail(email);
  if (existing) { if (!existing.email_verified) await createEmailVerification(existing); else await sendExistingCustomerHelp(existing); return res.status(202).json(generic); }
  const now = new Date().toISOString(); const passwordHash = await bcrypt.hash(password, 12);
  database.run("INSERT INTO customers (name, email, phone, password_hash, must_set_password, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)", [name, email, phone, passwordHash, now, now]);
  const customer = getCustomerByEmail(email); const verification = await createEmailVerification(customer); persistDatabase();
  const response = { ...generic, emailSent: Boolean(verification.emailSent) };
  if (process.env.SMOKE_TEST === "true") response.verificationUrl = verification.url;
  return res.status(202).json(response);
});

app.post("/api/account/login", loginLimiter, async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase(); const password = typeof req.body.password === "string" ? req.body.password : "";
  const customer = getCustomerByEmail(email);
  if (customer?.must_set_password) return res.status(403).json({ error: "Please use the password setup link sent to your email before signing in." });
  if (customer && !customer.email_verified) return res.status(403).json({ error: "Please verify your email before signing in." });
  if (!customer || !(await bcrypt.compare(password, customer.password_hash))) return res.status(401).json({ error: "The email or password is not valid." });
  setCustomerSession(res, customer); return res.json({ ok: true, customer: publicCustomer(customer) });
});
app.get("/api/account/session", requireCustomer, (req, res) => res.json({ ok: true, customer: publicCustomer(req.customer), csrfToken: req.session.csrf_token }));
app.post("/api/account/logout", requireCustomer, requireCsrf, (req, res) => { deleteSession(req.session.token_hash); res.clearCookie("neno_customer", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" }); return res.json({ ok: true }); });
app.get("/api/account/work-orders", requireCustomer, (req, res) => res.json({ workOrders: listWorkOrdersForCustomer(req.customer.id).map(customerTicket) }));
app.get("/api/account/setup", accountLimiter, (req, res) => {
  const invite = getInvite(hashToken(cleanText(req.query.token, 200)));
  if (!invite || invite.used_at || new Date(invite.expires_at) <= new Date()) return res.status(400).json({ error: "This password setup link is invalid or has expired." });
  return res.json({ ok: true, customer: { name: invite.name, email: invite.email } });
});
app.post("/api/account/setup-password", accountLimiter, async (req, res) => {
  const token = cleanText(req.body.token, 200); const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!token || Array.from(password).length < 12) return res.status(400).json({ error: "Use a password with at least 12 characters." });
  const invite = getInvite(hashToken(token));
  if (!invite || invite.used_at || new Date(invite.expires_at) <= new Date()) return res.status(400).json({ error: "This password setup link is invalid or has expired." });
  const now = new Date().toISOString(); const passwordHash = await bcrypt.hash(password, 12);
  database.run("UPDATE customers SET password_hash = ?, must_set_password = 0, email_verified = 1, updated_at = ? WHERE id = ?", [passwordHash, now, invite.customer_id]);
  database.run("UPDATE customer_invites SET used_at = ? WHERE id = ?", [now, invite.id]); persistDatabase();
  const customer = getCustomerById(invite.customer_id); setCustomerSession(res, customer);
  return res.json({ ok: true, customer: publicCustomer(customer) });
});
app.post("/api/account/verify", verificationLimiter, (req, res) => {
  const token = cleanText(req.body.token, 200); const verification = getEmailVerification(hashToken(token));
  if (!verification || verification.used_at || new Date(verification.expires_at) <= new Date()) return res.status(400).json({ error: "This verification link is invalid or has expired." });
  const now = new Date().toISOString(); database.run("UPDATE customers SET email_verified = 1, updated_at = ? WHERE id = ?", [now, verification.customer_id]); database.run("UPDATE email_verifications SET used_at = ? WHERE id = ?", [now, verification.id]); persistDatabase();
  return res.json({ ok: true });
});
app.post("/api/account/forgot-password", resetLimiter, async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase(); const response = { ok: true, message: "If an eligible account exists, a password-reset message has been sent." };
  const customer = getCustomerByEmail(email);
  if (customer && customer.email_verified && !customer.disabled_at && allowDurableThrottle("customer-reset", hashToken(email), 3, 60 * 60 * 1000)) await createCustomerPasswordReset(customer);
  return res.json(response);
});
app.post("/api/account/reset-password", resetLimiter, async (req, res) => {
  const token = cleanText(req.body.token, 200); const password = typeof req.body.password === "string" ? req.body.password : "";
  const reset = rowFromQuery("SELECT * FROM customer_password_resets WHERE token_hash = ?", [hashToken(token)]);
  if (!reset || reset.used_at || Date.parse(reset.expires_at) <= Date.now() || Array.from(password).length < 12) return res.status(400).json({ error: "This reset link is invalid, expired, or the password is shorter than 12 characters." });
  const now = new Date().toISOString(); database.run("UPDATE customers SET password_hash = ?, must_set_password = 0, updated_at = ? WHERE id = ?", [await bcrypt.hash(password, 12), now, reset.customer_id]); database.run("UPDATE customer_password_resets SET used_at = COALESCE(used_at, ?) WHERE customer_id = ? AND used_at IS NULL", [now, reset.customer_id]); invalidateSessions("customer", reset.customer_id); persistDatabase();
  return res.json({ ok: true, message: "Your password was changed. Sign in with the new password." });
});
app.post("/api/account/resend-verification", verificationLimiter, async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase(); const response = { ok: true, message: "If an unverified account exists, a new verification email will arrive shortly." }; const customer = getCustomerByEmail(email);
  if (!customer || customer.email_verified || customer.must_set_password) return res.json(response);
  const verification = await createEmailVerification(customer); return res.json({ ...response, emailSent: Boolean(verification.emailSent) });
});
app.post("/api/account/work-orders/:id/consent-link", requireCustomer, requireCsrf, async (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket || !customerOwnsTicket(req.customer, ticket)) return res.status(404).json({ error: "Work order not found." });
  const request = await createConsentRequest(ticket, false); if (!request) return res.status(400).json({ error: consentBlockReason(ticket) });
  return res.json({ ok: true, consentUrl: request.url });
});
app.get("/api/account/consent", accountLimiter, (req, res) => getConsentForReview(req, res));
app.post("/api/account/consent", accountLimiter, async (req, res) => submitConsent(req, res));

app.post("/api/tickets", ticketLimiter, optionalCustomer, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase();
  const phone = cleanText(req.body.phone, 40); const assistance = cleanText(req.body.assistance, 2000); const honeypot = cleanText(req.body.company, 100);
  if (honeypot) return res.status(201).json({ ok: true, ticket: { id: "received" } });
  if (!name || !isEmail(email) || !phone || assistance.length < 10) return res.status(400).json({ error: "Please complete each field with valid details." });
  const customerId = req.customer?.id || null; const now = new Date().toISOString(); const publicId = createWorkOrderId();
  database.run(`INSERT INTO tickets (public_id, customer_id, name, email, phone, assistance, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'request-received', ?, ?)`, [publicId, customerId, name, email, phone, assistance, assistance, now, now]);
  persistDatabase(); const ticket = getTicket(publicId); const approval = await createConsentRequest(ticket, true); const notificationSent = await sendNewTicketNotification(ticket);
  return res.status(201).json({ ok: true, emailSent: Boolean(approval?.emailSent), approvalRequired: true, notificationSent, ticket: customerTicket(ticket) });
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const username = cleanText(req.body.username, 80); const password = typeof req.body.password === "string" ? req.body.password : ""; const user = getStaffByUsername(username);
  const valid = Boolean(user?.active && (await bcrypt.compare(password, user.password_hash)));
  if (!valid) return res.status(401).json({ error: "The login details are not valid." });
  if (process.env.NODE_ENV !== "production" && process.env.SMOKE_TEST === "true" && process.env.SMOKE_TEST_MFA_BYPASS === "true") { setAdminSession(res, user); return res.json({ ok: true, smokeTestMfaBypass: true }); }
  const pending = createMfaChallenge(user.id, "login", "");
  res.cookie("neno_admin_pending", pending.rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 5 * 60 * 1000, path: "/api/admin/mfa" });
  return res.json({ ok: true, mfaRequired: true, enrollmentRequired: !mfaState(user.id).passkey || !mfaState(user.id).totp, methods: mfaState(user.id) });
});

app.post("/api/admin/mfa/totp/enroll", requireMfaPending, mfaLimiter, async (req, res) => {
  try { const secret = new OTPAuth.Secret({ size: 20 }); const totp = new OTPAuth.TOTP({ issuer: "Neno’s IT Repair", label: req.pendingStaff.email, algorithm: "SHA1", digits: 6, period: 30, secret }); const encrypted = encryptMfaSecret(secret.base32); database.run("INSERT INTO staff_totp (staff_user_id, secret_ciphertext, secret_iv, secret_tag, last_counter, verified_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?) ON CONFLICT(staff_user_id) DO UPDATE SET secret_ciphertext = excluded.secret_ciphertext, secret_iv = excluded.secret_iv, secret_tag = excluded.secret_tag, last_counter = NULL, verified_at = NULL, updated_at = excluded.updated_at", [req.pendingStaff.id, encrypted.ciphertext, encrypted.iv, encrypted.tag, new Date().toISOString()]); persistDatabase(); return res.json({ ok: true, secret: secret.base32, uri: totp.toString(), qrDataUrl: await QRCode.toDataURL(totp.toString(), { width: 240, margin: 1 }) }); } catch (error) { return res.status(503).json({ error: error.message }); }
});
app.post("/api/admin/mfa/totp/verify-enrollment", requireMfaPending, mfaLimiter, (req, res) => { const record = rowFromQuery("SELECT * FROM staff_totp WHERE staff_user_id = ?", [req.pendingStaff.id]); const counter = verifyTotp(record, cleanText(req.body.code, 12), false); if (counter === null) return failMfa(req, res); database.run("UPDATE staff_totp SET verified_at = ?, last_counter = ?, updated_at = ? WHERE staff_user_id = ?", [new Date().toISOString(), counter, new Date().toISOString(), req.pendingStaff.id]); persistDatabase(); return finishEnrollment(req, res); });
app.post("/api/admin/mfa/totp/verify", requireMfaPending, mfaLimiter, (req, res) => { const record = rowFromQuery("SELECT * FROM staff_totp WHERE staff_user_id = ? AND verified_at IS NOT NULL", [req.pendingStaff.id]); const counter = verifyTotp(record, cleanText(req.body.code, 12), true); if (counter === null) return failMfa(req, res); database.run("UPDATE staff_totp SET last_counter = ?, updated_at = ? WHERE staff_user_id = ?", [counter, new Date().toISOString(), req.pendingStaff.id]); persistDatabase(); return completeMfaLogin(req, res); });
app.post("/api/admin/mfa/passkey/register-options", requireMfaPending, mfaLimiter, async (req, res) => { const options = await generateRegistrationOptions({ rpName: "Neno’s IT Repair", rpID: staffHost, userID: new TextEncoder().encode(String(req.pendingStaff.id)), userName: req.pendingStaff.username, userDisplayName: req.pendingStaff.name, attestationType: "none", authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, excludeCredentials: listPasskeys(req.pendingStaff.id).map((key) => ({ id: key.credential_id, transports: JSON.parse(key.transports_json || "[]") })) }); const flow = createMfaChallenge(req.pendingStaff.id, "passkey-register", options.challenge); return res.json({ ok: true, options, flowToken: flow.rawToken }); });
app.post("/api/admin/mfa/passkey/register-verify", requireMfaPending, mfaLimiter, async (req, res) => { const flow = getMfaChallenge(req.body.flowToken, req.pendingStaff.id, "passkey-register"); if (!flow) return res.status(400).json({ error: "The passkey challenge expired." }); try { const verified = await verifyRegistrationResponse({ response: req.body.response, expectedChallenge: flow.challenge, expectedOrigin: new URL(staffBaseUrl).origin, expectedRPID: staffHost, requireUserVerification: true }); if (!verified.verified || !verified.registrationInfo) throw new Error("Passkey verification failed"); const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo; database.run("INSERT INTO staff_passkeys (staff_user_id, credential_id, public_key, counter, transports_json, device_type, backed_up, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [req.pendingStaff.id, credential.id, Buffer.from(credential.publicKey).toString("base64url"), credential.counter, JSON.stringify(req.body.response?.response?.transports || []), credentialDeviceType, credentialBackedUp ? 1 : 0, cleanText(req.body.name, 80) || "Passkey", new Date().toISOString()]); useMfaChallenge(flow.id); persistDatabase(); return finishEnrollment(req, res); } catch { return failMfa(req, res); } });
app.post("/api/admin/mfa/passkey/options", requireMfaPending, mfaLimiter, async (req, res) => { const keys = listPasskeys(req.pendingStaff.id); if (!keys.length) return res.status(409).json({ error: "No passkey is enrolled." }); const options = await generateAuthenticationOptions({ rpID: staffHost, userVerification: "required", allowCredentials: keys.map((key) => ({ id: key.credential_id, transports: JSON.parse(key.transports_json || "[]") })) }); const flow = createMfaChallenge(req.pendingStaff.id, "passkey-login", options.challenge); return res.json({ ok: true, options, flowToken: flow.rawToken }); });
app.post("/api/admin/mfa/passkey/verify", requireMfaPending, mfaLimiter, async (req, res) => { const flow = getMfaChallenge(req.body.flowToken, req.pendingStaff.id, "passkey-login"); const key = rowFromQuery("SELECT * FROM staff_passkeys WHERE staff_user_id = ? AND credential_id = ?", [req.pendingStaff.id, cleanText(req.body.response?.id, 500)]); if (!flow || !key) return res.status(400).json({ error: "The passkey challenge expired." }); try { const verified = await verifyAuthenticationResponse({ response: req.body.response, expectedChallenge: flow.challenge, expectedOrigin: new URL(staffBaseUrl).origin, expectedRPID: staffHost, credential: { id: key.credential_id, publicKey: Buffer.from(key.public_key, "base64url"), counter: Number(key.counter), transports: JSON.parse(key.transports_json || "[]") }, requireUserVerification: true }); if (!verified.verified) throw new Error("Passkey verification failed"); database.run("UPDATE staff_passkeys SET counter = ?, last_used_at = ? WHERE id = ?", [verified.authenticationInfo.newCounter, new Date().toISOString(), key.id]); useMfaChallenge(flow.id); persistDatabase(); return completeMfaLogin(req, res); } catch { return failMfa(req, res); } });

app.post("/api/admin/forgot-password", resetLimiter, async (req, res) => {
  const identifier = cleanText(req.body.username || req.body.email, 254).toLowerCase(); const response = { ok: true, message: "If the account is valid, a password reset email will arrive shortly." }; const user = getStaffByIdentifier(identifier);
  if (!user || !user.active || !user.email || !getStoredAdminPasswordHash()) return res.json(response);
  database.run("DELETE FROM password_resets WHERE used_at IS NOT NULL OR expires_at <= ?", [new Date().toISOString()]); const rawToken = crypto.randomBytes(32).toString("base64url"); const now = new Date();
  database.run("INSERT INTO password_resets (staff_user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)", [user.id, hashToken(rawToken), new Date(now.getTime() + resetTokenTtlMs).toISOString(), now.toISOString()]); persistDatabase(); await sendPasswordResetEmail(rawToken, user); return res.json(response);
});
app.post("/api/admin/reset-password", resetLimiter, async (req, res) => {
  const token = typeof req.body.token === "string" ? req.body.token.trim() : ""; const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!token) return res.status(400).json({ error: "This reset link is invalid or has expired." }); if (Array.from(password).length < 12) return res.status(400).json({ error: "Use a password with at least 12 characters." });
  const reset = getPasswordReset(hashToken(token)); if (!reset || reset.used_at || new Date(reset.expires_at) <= new Date()) return res.status(400).json({ error: "This reset link is invalid or has expired." });
  const now = new Date().toISOString(); const passwordHash = await bcrypt.hash(password, 12); database.run("UPDATE staff_users SET password_hash = ?, updated_at = ? WHERE id = ?", [passwordHash, now, reset.staff_user_id]); database.run("UPDATE password_resets SET used_at = ? WHERE id = ?", [now, reset.id]); invalidateSessions("admin", reset.staff_user_id); persistDatabase(); return res.json({ ok: true });
});

app.get("/api/admin/session", requireAdmin, (req, res) => res.json({ ok: true, csrfToken: req.session.csrf_token, user: publicStaff(req.staff) }));
app.post("/api/admin/logout", requireAdmin, requireCsrf, (req, res) => { deleteSession(req.session.token_hash); res.clearCookie("neno_admin", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" }); return res.json({ ok: true }); });

app.get("/api/admin/work-orders", requireAdmin, (req, res) => res.json({ workOrders: listWorkOrders(cleanText(req.query.search, 120)).map(adminTicket) }));
app.get("/api/admin/tickets", requireAdmin, (req, res) => res.json({ tickets: listWorkOrders(cleanText(req.query.search, 120)).map(adminTicket) }));
app.get("/api/admin/contacts", requireAdmin, (req, res) => res.json({ contacts: listContactMessages(cleanText(req.query.search, 120)).map(publicContactMessage) }));
app.patch("/api/admin/contacts/:id", requireAdmin, requireCsrf, (req, res) => { const contact = getContact(req.params.id); if (!contact) return res.status(404).json({ error: "Contact request not found." }); const status = cleanText(req.body.status, 30); if (!validContactStatuses.has(status)) return res.status(400).json({ error: "That contact status is not available." }); const now = new Date().toISOString(); database.run("UPDATE contact_messages SET status = ?, updated_at = ? WHERE contact_id = ?", [status, now, contact.contact_id]); persistDatabase(); return res.json({ ok: true, contact: publicContactMessage(getContact(contact.contact_id)) }); });
app.get("/api/admin/customers/:id", requireAdmin, (req, res) => {
  const customer = getCustomerById(req.params.id);
  if (!customer) return res.status(404).json({ error: "Customer account not found." });
  return res.json({ customer: publicCustomer(customer), workOrders: listWorkOrdersForCustomer(customer.id).map(adminTicket) });
});
app.post("/api/admin/customers/:id/work-orders", requireAdmin, requireCsrf, async (req, res) => {
  const customer = getCustomerById(req.params.id);
  if (!customer) return res.status(404).json({ error: "Customer account not found." });
  const details = workOrderDetails(req.body);
  if (!details.notes || !details.deviceCondition) return res.status(400).json({ error: "Notes and device condition are required." });
  const now = new Date().toISOString(); const publicId = createWorkOrderId();
  database.run(`INSERT INTO tickets (public_id, customer_id, name, email, phone, assistance, notes, repair_notes, client_repair_notes, device_condition, accessories, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'request-received', ?, ?)`, [publicId, customer.id, customer.name, customer.email, customer.phone, details.notes, details.notes, details.repairNotes, details.clientRepairNotes, details.deviceCondition, details.accessories, now, now]);
  const ticketId = database.exec("SELECT id FROM tickets WHERE public_id = ?", [publicId])[0].values[0][0];
  replaceWorkOrderServices(ticketId, details.services, now);
  if (details.repairNotes) database.run("INSERT INTO work_order_repair_notes (ticket_id, staff_user_id, note_text, created_at) VALUES (?, ?, ?, ?)", [ticketId, req.staff.id, details.repairNotes, now]);
  persistDatabase(); const ticket = getTicket(publicId); const approval = await createConsentRequest(ticket, true); const notificationSent = await sendNewTicketNotification(ticket);
  return res.status(201).json({ ok: true, emailSent: Boolean(approval?.emailSent), approvalEmailSent: Boolean(approval?.emailSent), notificationSent, approvalBlocked: !approval, workOrder: adminTicket(getTicket(publicId)) });
});
app.patch("/api/admin/work-orders/:id", requireAdmin, requireCsrf, updateWorkOrder);
app.patch("/api/admin/tickets/:id", requireAdmin, requireCsrf, updateWorkOrder);
app.post("/api/admin/work-orders/:id/consent", requireAdmin, requireCsrf, async (req, res) => {
  const ticket = getTicket(req.params.id); if (!ticket) return res.status(404).json({ error: "Work order not found." });
  const approval = await createConsentRequest(ticket, true); if (!approval) return res.status(400).json({ error: consentBlockReason(ticket) });
  return res.json({ ok: true, consentUrl: approval.url, emailSent: Boolean(approval.emailSent), workOrder: adminTicket(getTicket(ticket.public_id)) });
});
app.post("/api/admin/work-orders/:id/contact-log", requireAdmin, requireCsrf, (req, res) => {
  const ticket = getTicket(req.params.id); if (!ticket) return res.status(404).json({ error: "Work order not found." });
  const outcome = cleanText(req.body.outcome, 30); const notes = cleanText(req.body.notes, 2000);
  if (!validContactOutcomes.has(outcome) || !notes) return res.status(400).json({ error: "Choose a contact outcome and enter what the call was about." });
  const now = new Date().toISOString(); database.run("INSERT INTO work_order_contact_logs (ticket_id, staff_user_id, outcome, notes, contacted_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", [ticket.id, req.staff.id, outcome, notes, now, now]); persistDatabase();
  return res.status(201).json({ ok: true, workOrder: adminTicket(getTicket(ticket.public_id)) });
});
app.post("/api/admin/work-orders/:id/repair-notes", requireAdmin, requireCsrf, (req, res) => {
  const ticket = getTicket(req.params.id); if (!ticket) return res.status(404).json({ error: "Work order not found." });
  const note = cleanText(req.body.note ?? req.body.notes, 8000);
  if (!note) return res.status(400).json({ error: "Enter an internal repair note." });
  const now = new Date().toISOString(); database.run("INSERT INTO work_order_repair_notes (ticket_id, staff_user_id, note_text, created_at) VALUES (?, ?, ?, ?)", [ticket.id, req.staff.id, note, now]); database.run("UPDATE tickets SET repair_notes = ?, updated_at = ? WHERE id = ?", [note, now, ticket.id]); persistDatabase();
  return res.status(201).json({ ok: true, workOrder: adminTicket(getTicket(ticket.public_id)) });
});
app.delete("/api/admin/work-orders/:id", requireAdmin, requireCsrf, (_req, res) => res.status(409).json({ error: "Work orders are retained records. Use owner retention review instead of direct deletion." }));

app.get("/api/admin/customers", requireAdmin, (req, res) => res.json({ customers: listCustomers(cleanText(req.query.search, 120)).map(publicCustomer) }));
app.post("/api/admin/customers", requireAdmin, requireCsrf, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase(); const phone = cleanText(req.body.phone, 40);
  if (!name || !isEmail(email) || phone.length < 7) return res.status(400).json({ error: "Enter a name, valid email, and required phone number." });
  if (getCustomerByEmail(email)) return res.status(409).json({ error: "That email is already in use." });
  const now = new Date().toISOString(); database.run("INSERT INTO customers (name, email, phone, password_hash, must_set_password, email_verified, created_at, updated_at) VALUES (?, ?, ?, '', 1, 0, ?, ?)", [name, email, phone, now, now]); const customer = getCustomerByEmail(email); const invitation = await createCustomerInvitation(customer); persistDatabase(); return res.status(201).json({ ok: true, inviteSent: Boolean(invitation.emailSent), customer: publicCustomer(customer) });
});
app.post("/api/admin/customers/:id/invite", requireAdmin, requireCsrf, async (req, res) => {
  const customer = getCustomerById(req.params.id); if (!customer) return res.status(404).json({ error: "Customer account not found." });
  const invitation = await createCustomerInvitation(customer); return res.json({ ok: true, inviteSent: Boolean(invitation.emailSent), setupUrl: invitation.url, customer: publicCustomer(customer) });
});
app.patch("/api/admin/customers/:id", requireAdmin, requireCsrf, async (req, res) => {
  const customer = getCustomerById(req.params.id); if (!customer) return res.status(404).json({ error: "Customer account not found." }); const name = cleanText(req.body.name, 100) || customer.name; const email = cleanText(req.body.email, 254).toLowerCase() || customer.email; const phone = cleanText(req.body.phone, 40); const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!isEmail(email) || (password && Array.from(password).length < 12)) return res.status(400).json({ error: "Use a valid email and, if changing the password, at least 12 characters." }); const passwordHash = password ? await bcrypt.hash(password, 12) : customer.password_hash;
  try { database.run("UPDATE customers SET name = ?, email = ?, phone = ?, password_hash = ?, updated_at = ? WHERE id = ?", [name, email, phone, passwordHash, new Date().toISOString(), customer.id]); } catch { return res.status(409).json({ error: "That email is already in use." }); } persistDatabase(); return res.json({ ok: true, customer: publicCustomer(getCustomerById(customer.id)) });
});

app.get("/api/admin/terms", requireAdmin, (req, res) => res.json({ terms: listTerms(), published: getPublishedTerms() }));
app.post("/api/admin/terms", requireAdmin, requireCsrf, (req, res) => {
  if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required to publish policies." });
  if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required to publish terms." });
  const body = cleanText(req.body.body, 20000); if (body.length < 100) return res.status(400).json({ error: "Terms must contain at least 100 characters." });
  const now = new Date().toISOString(); const version = `v${(listTerms().length || 0) + 1}`;
  database.run("INSERT INTO terms_documents (version, body, status, created_at, published_at) VALUES (?, ?, 'published', ?, ?)", [version, body, now, now]); database.run("UPDATE terms_documents SET status = 'archived' WHERE status = 'published' AND version <> ?", [version]); persistDatabase(); return res.status(201).json({ ok: true, terms: getPublishedTerms() });
});

app.get("/api/admin/staff", requireAdmin, (req, res) => { if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required for staff accounts." }); return res.json({ staff: listStaff().map(publicStaff) }); });
app.post("/api/admin/staff", requireAdmin, requireCsrf, async (req, res) => {
  if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required for staff accounts." }); const name = cleanText(req.body.name, 100); const username = cleanText(req.body.username, 80).toLowerCase(); const email = cleanText(req.body.email, 254).toLowerCase(); const password = typeof req.body.password === "string" ? req.body.password : ""; const role = validRoles.has(req.body.role) ? req.body.role : "admin";
  if (!name || !/^[a-z0-9._-]{3,80}$/.test(username) || !isEmail(email) || Array.from(password).length < 12) return res.status(400).json({ error: "Enter a name, username, valid email, and password with at least 12 characters." }); if (getStaffByUsername(username) || getStaffByEmail(email)) return res.status(409).json({ error: "That username or email is already in use." });
  const now = new Date().toISOString(); const passwordHash = await bcrypt.hash(password, 12); database.run("INSERT INTO staff_users (username, name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)", [username, name, email, passwordHash, role, now, now]); persistDatabase(); return res.status(201).json({ ok: true, staff: publicStaff(getStaffByUsername(username)) });
});
app.patch("/api/admin/staff/:id", requireAdmin, requireCsrf, async (req, res) => {
  if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required for staff accounts." }); const user = getStaffById(req.params.id); if (!user) return res.status(404).json({ error: "Staff account not found." }); const name = cleanText(req.body.name, 100) || user.name; const email = cleanText(req.body.email, 254).toLowerCase() || user.email; const role = validRoles.has(req.body.role) ? req.body.role : user.role; const active = typeof req.body.active === "boolean" ? req.body.active : Boolean(user.active); const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!isEmail(email) || (password && Array.from(password).length < 12)) return res.status(400).json({ error: "Use a valid email and, if changing the password, at least 12 characters." }); if (user.id === req.staff.id && !active) return res.status(400).json({ error: "You cannot deactivate the account you are using." }); const passwordHash = password ? await bcrypt.hash(password, 12) : user.password_hash;
  try { database.run("UPDATE staff_users SET name = ?, email = ?, password_hash = ?, role = ?, active = ?, updated_at = ? WHERE id = ?", [name, email, passwordHash, role, active ? 1 : 0, new Date().toISOString(), user.id]); } catch { return res.status(409).json({ error: "That email is already in use." }); } persistDatabase(); return res.json({ ok: true, staff: publicStaff(getStaffById(user.id)) });
});

app.get("/api/admin/dashboard", requireAdmin, (req, res) => res.json({ tools: listToolCards(req.staff.role), health: staffHealth(), legalReviewOutstanding: true }));
app.get("/api/admin/retention", requireAdmin, (req, res) => { if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required." }); return res.json({ queue: retentionQueue(), automaticDeletion: false }); });
app.post("/api/admin/retention/:type/:id/decision", requireAdmin, requireCsrf, (req, res) => { if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required." }); const type = cleanText(req.params.type, 30); const recordId = cleanText(req.params.id, 100); const decision = cleanText(req.body.decision, 20); const reason = cleanText(req.body.reason, 500); const eligible = retentionQueue().some((item) => item.record_type === type && String(item.record_id) === recordId); if (!eligible) return res.status(409).json({ error: "That record is no longer eligible; refresh the review queue." }); if (!["retain", "disable", "anonymize"].includes(decision) || reason.length < 8) return res.status(400).json({ error: "Choose a decision and record a meaningful reason." }); const now = new Date().toISOString(); if (decision === "disable" && type === "account") { database.run("UPDATE customers SET disabled_at = ?, updated_at = ? WHERE id = ?", [now, now, recordId]); invalidateSessions("customer", recordId); } else if (decision === "anonymize" && type === "inquiry") database.run("UPDATE contact_messages SET name = 'Anonymized', email = ?, phone = '', message = '[anonymized after retention review]', status = 'closed', updated_at = ? WHERE contact_id = ?", [`anonymized-${hashToken(recordId).slice(0, 16)}@invalid.local`, now, recordId]); else if (decision === "anonymize" && type === "work-order") { const ticket = getTicket(recordId); if (ticket) { database.run("UPDATE tickets SET name = 'Anonymized', email = ?, phone = '', assistance = '[anonymized after retention review]', notes = '[anonymized after retention review]', repair_notes = '', client_repair_notes = '', device_condition = '', accessories = '', updated_at = ? WHERE id = ?", [`anonymized-${hashToken(recordId).slice(0, 16)}@invalid.local`, now, ticket.id]); database.run("UPDATE work_order_consents SET signature_name = '[anonymized]' WHERE ticket_id = ?", [ticket.id]); } } else if (decision !== "retain") return res.status(400).json({ error: "That decision does not apply to this record type." }); database.run("INSERT INTO retention_decisions (record_type, record_id, decision, reason, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?)", [type, recordId, decision, reason, req.staff.id, now]); persistDatabase(); return res.json({ ok: true }); });
app.get("/api/admin/tools", requireAdmin, (req, res) => { if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required." }); return res.json({ tools: listToolCards("owner", true) }); });
app.post("/api/admin/tools", requireAdmin, requireCsrf, saveToolCard);
app.patch("/api/admin/tools/:id", requireAdmin, requireCsrf, saveToolCard);
app.post("/api/admin/security/passkey/options", requireAdmin, requireCsrf, async (req, res) => { if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required." }); const keys = listPasskeys(req.staff.id); if (!keys.length) return res.status(409).json({ error: "The owner must have a passkey enrolled." }); const options = await generateAuthenticationOptions({ rpID: staffHost, userVerification: "required", allowCredentials: keys.map((key) => ({ id: key.credential_id, transports: JSON.parse(key.transports_json || "[]") })) }); const flow = createMfaChallenge(req.staff.id, "owner-step-up", options.challenge); return res.json({ options, flowToken: flow.rawToken }); });
app.post("/api/admin/staff/:id/mfa-reset", requireAdmin, requireCsrf, async (req, res) => { if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required." }); const target = getStaffById(req.params.id); const flow = getMfaChallenge(req.body.flowToken, req.staff.id, "owner-step-up"); const key = rowFromQuery("SELECT * FROM staff_passkeys WHERE staff_user_id = ? AND credential_id = ?", [req.staff.id, cleanText(req.body.response?.id, 500)]); if (!target || !flow || !key) return res.status(400).json({ error: "Passkey reauthentication is required." }); try { const verified = await verifyAuthenticationResponse({ response: req.body.response, expectedChallenge: flow.challenge, expectedOrigin: new URL(staffBaseUrl).origin, expectedRPID: staffHost, credential: { id: key.credential_id, publicKey: Buffer.from(key.public_key, "base64url"), counter: Number(key.counter), transports: JSON.parse(key.transports_json || "[]") }, requireUserVerification: true }); if (!verified.verified) throw new Error("Not verified"); const now = new Date().toISOString(); database.run("UPDATE staff_passkeys SET counter = ?, last_used_at = ? WHERE id = ?", [verified.authenticationInfo.newCounter, now, key.id]); database.run("DELETE FROM staff_passkeys WHERE staff_user_id = ?", [target.id]); database.run("DELETE FROM staff_totp WHERE staff_user_id = ?", [target.id]); invalidateSessions("admin", target.id); useMfaChallenge(flow.id); database.run("INSERT INTO security_events (event_type, principal_type, principal_id, details_json, created_at) VALUES ('owner-mfa-reset', 'staff', ?, ?, ?)", [req.staff.id, JSON.stringify({ targetStaffId: target.id, targetUsername: target.username }), now]); persistDatabase(); return res.json({ ok: true }); } catch { return res.status(400).json({ error: "Passkey reauthentication failed." }); } });
app.post("/api/internal/backup-heartbeat", (req, res) => { const key = process.env.BACKUP_HEARTBEAT_KEY || ""; const timestamp = cleanText(req.body.timestamp, 40); const result = cleanText(req.body.result, 20); const supplied = String(req.headers["x-backup-signature"] || ""); const expected = key ? crypto.createHmac("sha256", key).update(`${timestamp}.${result}`).digest("hex") : ""; if (!key || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(401).json({ error: "Invalid backup heartbeat signature." }); if (!["success", "failure"].includes(result) || !Number.isFinite(Date.parse(timestamp))) return res.status(400).json({ error: "Invalid heartbeat metadata." }); database.run("INSERT INTO backup_heartbeats (backup_timestamp, result, received_at) VALUES (?, ?, ?)", [timestamp, result, new Date().toISOString()]); persistDatabase(); return res.json({ ok: true }); });

app.get("/robots.txt", publicOnly, (_req, res) => res.type("text").send(`User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /orders\nDisallow: /consent\nDisallow: /api/\nSitemap: ${publicBaseUrl}/sitemap.xml\n`));
app.get("/sitemap.xml", publicOnly, (_req, res) => res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicRoutes.map((route) => `  <url><loc>${escapeXml(`${publicBaseUrl}${route.path}`)}</loc></url>`).join("\n")}\n</urlset>\n`));
app.get("/.well-known/security.txt", publicOnly, (_req, res) => res.type("text").send(`Contact: mailto:security@nenosensei.com\nCanonical: ${publicBaseUrl}/.well-known/security.txt\nPreferred-Languages: en\nExpires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}\n`));
app.use(express.static(path.join(rootDir, "dist"), { index: false, setHeaders: (res, file) => { if (/[-.][A-Za-z0-9_-]{8,}\.(?:js|css|woff2?)$/.test(path.basename(file))) res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); } }));
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
app.get("*", (req, res) => {
  if (req.site === "staff" || (req.site === "local" && req.path.startsWith("/admin"))) return renderIndex(req, res, req.path === "/" || req.path.startsWith("/admin") ? 200 : 404, { title: req.path === "/" ? "Staff Hub" : "Repair Admin", description: "Private staff operations.", noindex: true });
  if (req.path.startsWith("/admin")) return renderIndex(req, res, 404, { title: "Page not found", description: "The requested page does not exist.", noindex: true });
  const privatePage = /^\/(account|orders|consent)(\/|$)/.test(req.path);
  const route = routeByPath.get(req.path);
  if (route) return renderIndex(req, res, 200, route);
  if (privatePage) return renderIndex(req, res, 200, { title: "Customer Portal", description: "Private customer account.", noindex: true });
  return renderIndex(req, res, 404, { title: "Page not found", description: "The requested page does not exist." });
});
const server = app.listen(port, "0.0.0.0", () => { console.log(`Neno’s IT Repair server listening on ${port}`); if (!getStoredAdminPasswordHash()) console.warn("No staff password is configured; staff login is disabled."); });
const pruneTimer = setInterval(() => { const now = new Date().toISOString(); database.run("DELETE FROM auth_sessions WHERE idle_expires_at <= ? OR absolute_expires_at <= ?", [now, now]); database.run("DELETE FROM auth_challenges WHERE expires_at <= ? OR attempts >= 5", [now]); persistDatabase(); }, 15 * 60 * 1000); pruneTimer.unref();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { clearInterval(pruneTimer); persistDatabase(); server.close(() => process.exit(0)); });

function cleanText(value, maxLength) { return typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, maxLength) : ""; }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function escapeXml(value) { return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]); }
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }
function renderIndex(req, res, status, meta) { const indexPath = path.join(rootDir, "dist", "index.html"); if (!fs.existsSync(indexPath)) return res.status(503).type("text").send("Application build unavailable.\n"); const title = `${meta.title} | Neno’s IT Repair`; const canonical = `${publicBaseUrl}${req.path}`; const structured = meta.noindex ? {} : { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", "@id": `${publicBaseUrl}/#organization`, name: "Neno’s IT Repair", url: publicBaseUrl, email: "repair@nenosensei.com" }, { "@type": "Service", provider: { "@id": `${publicBaseUrl}/#organization` }, areaServed: { "@type": "City", name: "Philadelphia" }, serviceType: "Computer repair and support" }] }; let html = fs.readFileSync(indexPath, "utf8"); html = html.replaceAll("__PAGE_TITLE__", escapeHtml(title)).replaceAll("__PAGE_DESCRIPTION__", escapeHtml(meta.description || "Philadelphia computer service by appointment.")).replaceAll("__CANONICAL_URL__", escapeHtml(canonical)).replaceAll("__ROBOTS__", meta.noindex ? "noindex, nofollow" : "index, follow").replace("__STRUCTURED_DATA__", JSON.stringify(structured).replace(/</g, "\\u003c")); return res.status(status).type("html").send(html); }
function ensureColumn(table, column, definition) { const columns = database.exec(`PRAGMA table_info(${table})`)[0]?.values || []; if (!columns.some((row) => row[1] === column)) database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
function migrateInitialAdmin() { if (getStaffByUsername(adminUsername)) return; const passwordHash = getStoredAdminPasswordHash() || adminPasswordHash; if (!passwordHash) return; const now = new Date().toISOString(); database.run("INSERT INTO staff_users (username, name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'owner', 1, ?, ?)", [adminUsername, "Account owner", adminEmail || `${adminUsername}@localhost`, passwordHash, now, now]); }
function getStoredAdminPasswordHash() { return database.exec("SELECT password_hash FROM staff_users WHERE role = 'owner' AND active = 1 LIMIT 1")[0]?.values[0]?.[0] || ""; }
function getPasswordReset(tokenHash) { return rowFromQuery("SELECT * FROM password_resets WHERE token_hash = ?", [tokenHash]); }
function getEmailVerification(tokenHash) { return rowFromQuery("SELECT v.*, c.name, c.email FROM email_verifications v JOIN customers c ON c.id = v.customer_id WHERE v.token_hash = ?", [tokenHash]); }
function createWorkOrderId() { const next = Number(database.exec("SELECT COALESCE(MAX(id), 0) + 1 FROM tickets")[0]?.values[0]?.[0] || 1); const date = new Date(); return `#${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}/${String(date.getDate()).padStart(2, "0")}-${String(next).padStart(4, "0")}`; }
function createContactId() { const next = Number(database.exec("SELECT COALESCE(MAX(id), 0) + 1 FROM contact_messages")[0]?.values[0]?.[0] || 1); const date = new Date(); return `C-${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}/${String(date.getDate()).padStart(2, "0")}-${String(next).padStart(4, "0")}`; }
function getTicket(publicId) { return rowFromQuery("SELECT * FROM tickets WHERE public_id = ?", [publicId]); }
function getContact(contactId) { return rowFromQuery("SELECT * FROM contact_messages WHERE contact_id = ?", [contactId]); }
function listWorkOrders(search = "") { if (!search) return rowsFromQuery("SELECT * FROM tickets ORDER BY updated_at DESC"); const term = `%${search}%`; return rowsFromQuery("SELECT * FROM tickets WHERE public_id LIKE ? COLLATE NOCASE OR name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE OR phone LIKE ? COLLATE NOCASE OR assistance LIKE ? COLLATE NOCASE OR notes LIKE ? COLLATE NOCASE OR device_condition LIKE ? COLLATE NOCASE OR accessories LIKE ? COLLATE NOCASE OR status LIKE ? COLLATE NOCASE ORDER BY updated_at DESC", [term, term, term, term, term, term, term, term, term]); }
function listWorkOrdersForCustomer(customerId) { return rowsFromQuery("SELECT * FROM tickets WHERE customer_id = ? OR (customer_id IS NULL AND email = (SELECT email FROM customers WHERE id = ?)) ORDER BY updated_at DESC", [customerId, customerId]); }
function listContactMessages(search = "") { if (!search) return rowsFromQuery("SELECT * FROM contact_messages ORDER BY updated_at DESC"); const term = `%${search}%`; return rowsFromQuery("SELECT * FROM contact_messages WHERE contact_id LIKE ? OR name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE OR phone LIKE ? COLLATE NOCASE OR message LIKE ? COLLATE NOCASE OR status LIKE ? COLLATE NOCASE ORDER BY updated_at DESC", [term, term, term, term, term, term]); }
function rowFromQuery(query, params = []) { const result = database.exec(query, params); return result.length ? rowToObject(result[0].columns, result[0].values[0]) : null; }
function rowsFromQuery(query, params = []) { const result = database.exec(query, params); return result.length ? result[0].values.map((row) => rowToObject(result[0].columns, row)) : []; }
function rowToObject(columns, row) { return columns.reduce((object, column, index) => ({ ...object, [column]: row[index] }), {}); }
function customerTicket(ticket) { const notes = ticket.notes || ticket.assistance || ""; const consent = getCurrentConsent(ticket.id); return { id: ticket.public_id, name: ticket.name, email: ticket.email, phone: ticket.phone, assistance: notes, notes, clientRepairNotes: ticket.client_repair_notes || "", repairSummary: ticket.client_repair_notes || "", deviceCondition: ticket.device_condition || "", accessories: ticket.accessories || "", services: getServicesForTicket(ticket.id), totalCents: getTotalCents(ticket.id), status: ticket.status, statusLabel: statusLabels[ticket.status] || ticket.status, payment: { method: ticket.payment_method || null, paidAt: ticket.paid_at || null, squareReference: ticket.square_reference || null }, consent: safeConsent(consent), consentRequired: !consent?.signed_at, createdAt: ticket.created_at, updatedAt: ticket.updated_at }; }
function adminTicket(ticket) { const consent = getCurrentConsent(ticket.id); const contactLogs = listContactLogs(ticket.id); const repairNoteEntries = listRepairNoteEntries(ticket.id); return { ...customerTicket(ticket), repairNotes: ticket.repair_notes || "", repairNoteEntries, adminConsent: consent ? consentDetails(consent) : null, completedAt: ticket.completed_at || null, daysSinceCompleted: ticket.completed_at ? daysSinceCompleted(ticket.completed_at) : null, lastContactedAt: contactLogs[0]?.contactedAt || null, lastContactOutcome: contactLogs[0]?.outcome || null, contactLogs }; }
function getCustomerByEmail(email) { return rowFromQuery("SELECT * FROM customers WHERE email = ? COLLATE NOCASE", [email]); }
function getCustomerById(id) { return rowFromQuery("SELECT * FROM customers WHERE id = ?", [id]); }
function listCustomers(search = "") { const where = search ? "WHERE c.name LIKE ? COLLATE NOCASE OR c.email LIKE ? COLLATE NOCASE OR c.phone LIKE ? COLLATE NOCASE" : ""; const term = `%${search}%`; return rowsFromQuery(`SELECT c.*, COUNT(t.id) AS work_order_count FROM customers c LEFT JOIN tickets t ON t.customer_id = c.id ${where} GROUP BY c.id ORDER BY c.name COLLATE NOCASE`, search ? [term, term, term] : []); }
function publicCustomer(customer) { return { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, pendingPassword: Boolean(customer.must_set_password), emailVerified: Boolean(customer.email_verified), workOrderCount: Number(customer.work_order_count || 0), createdAt: customer.created_at }; }
function getStaffById(id) { return rowFromQuery("SELECT * FROM staff_users WHERE id = ?", [id]); }
function getStaffByUsername(username) { return rowFromQuery("SELECT * FROM staff_users WHERE username = ? COLLATE NOCASE", [username]); }
function getStaffByEmail(email) { return rowFromQuery("SELECT * FROM staff_users WHERE email = ? COLLATE NOCASE", [email]); }
function getStaffByIdentifier(identifier) { return getStaffByUsername(identifier) || getStaffByEmail(identifier); }
function listStaff() { return rowsFromQuery("SELECT * FROM staff_users ORDER BY active DESC, name COLLATE NOCASE"); }
function publicStaff(user) { return { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, active: Boolean(user.active), createdAt: user.created_at, updatedAt: user.updated_at }; }
function publicContactMessage(contact) { return { id: contact.contact_id, name: contact.name, email: contact.email, phone: contact.phone, message: contact.message, status: contact.status, createdAt: contact.created_at, updatedAt: contact.updated_at }; }
function contactOutcomeLabel(outcome) { return { spoke: "Spoke with client", "left-voicemail": "Left voicemail", "no-connection": "No connection" }[outcome] || outcome; }
function listContactLogs(ticketId) { return rowsFromQuery("SELECT l.id, l.outcome, l.notes, l.contacted_at, l.created_at, s.name AS staff_name FROM work_order_contact_logs l LEFT JOIN staff_users s ON s.id = l.staff_user_id WHERE l.ticket_id = ? ORDER BY l.contacted_at DESC, l.id DESC", [ticketId]).map((log) => ({ id: log.id, outcome: log.outcome, outcomeLabel: contactOutcomeLabel(log.outcome), notes: log.notes, contactedAt: log.contacted_at, createdAt: log.created_at, staffName: log.staff_name || "Admin staff" })); }
function listRepairNoteEntries(ticketId) { return rowsFromQuery("SELECT n.id, n.note_text, n.created_at, s.name AS staff_name FROM work_order_repair_notes n LEFT JOIN staff_users s ON s.id = n.staff_user_id WHERE n.ticket_id = ? ORDER BY n.created_at DESC, n.id DESC", [ticketId]).map((note) => ({ id: note.id, note: note.note_text, createdAt: note.created_at, staffName: note.staff_name || "Admin staff" })); }
function daysSinceCompleted(completedAt) { const timestamp = new Date(completedAt).getTime(); return Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 86400000)) : null; }
function workOrderDetails(input = {}, existing = null) { const notes = input.notes === undefined ? (existing?.notes || existing?.assistance || "") : cleanText(input.notes, 4000); const repairNotes = input.repairNotes === undefined ? (existing?.repair_notes || "") : cleanText(input.repairNotes, 8000); const clientRepairNotes = input.clientRepairNotes === undefined ? (existing?.client_repair_notes || "") : cleanText(input.clientRepairNotes, 8000); const deviceCondition = input.deviceCondition === undefined ? (existing?.device_condition || "") : cleanText(input.deviceCondition, 3000); const accessories = input.accessories === undefined ? (existing?.accessories || "") : cleanText(input.accessories, 2000); const services = Array.isArray(input.services) ? normalizeServices(input.services) : existing ? getServicesForTicket(existing.id) : []; return { notes, repairNotes, clientRepairNotes, deviceCondition, accessories, services }; }
function normalizeServices(services) { return services.map((service) => { if (typeof service === "string") return { name: cleanText(service, 120), priceCents: null }; if (!service || typeof service !== "object") return null; const priceCents = service.priceCents !== undefined && service.priceCents !== null && service.priceCents !== "" ? Number(service.priceCents) : parsePriceCents(service.price); return { name: cleanText(service.name, 120), priceCents: Number.isInteger(priceCents) && priceCents >= 0 && priceCents <= 100000000 ? priceCents : null }; }).filter((service) => service?.name).slice(0, 20); }
function parsePriceCents(value) { if (value === null || value === undefined || value === "") return null; const number = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, "")); if (!Number.isFinite(number) || number < 0 || number > 1000000) return null; return Math.round(number * 100); }
function getServicesForTicket(ticketId) { return rowsFromQuery("SELECT service_name, price_cents AS priceCents FROM work_order_services WHERE ticket_id = ? ORDER BY sort_order, id", [ticketId]).map((row) => ({ name: row.service_name, priceCents: row.priceCents === null ? null : Number(row.priceCents) })); }
function getTotalCents(ticketId) { return getServicesForTicket(ticketId).reduce((total, service) => total + (Number.isInteger(service.priceCents) ? service.priceCents : 0), 0); }
function replaceWorkOrderServices(ticketId, services, createdAt) { database.run("DELETE FROM work_order_services WHERE ticket_id = ?", [ticketId]); services.forEach((service, index) => database.run("INSERT INTO work_order_services (ticket_id, service_name, price_cents, sort_order, created_at) VALUES (?, ?, ?, ?, ?)", [ticketId, service.name, service.priceCents, index, createdAt])); }
async function updateWorkOrder(req, res) {
  const ticket = getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Work order not found." });
  const status = req.body.status === undefined ? ticket.status : cleanText(req.body.status, 30);
  if (!validStatuses.has(status)) return res.status(400).json({ error: "That work order status is not available." });
  const order = ["request-received", "diagnosing-estimating", "awaiting-approval", "approved-queued", "in-repair", "ready-for-pickup-payment", "closed"];
  if (status !== ticket.status && order.indexOf(status) > order.indexOf(ticket.status) + 1) return res.status(409).json({ error: "Move the work order through each required stage." });
  if (status === "approved-queued") return res.status(400).json({ error: "Approved / queued is set automatically after the customer signs." });
  const details = workOrderDetails(req.body, ticket);
  if (req.body.notes !== undefined && !details.notes) return res.status(400).json({ error: "Notes cannot be empty." });
  if (req.body.deviceCondition !== undefined && !details.deviceCondition) return res.status(400).json({ error: "Device condition cannot be empty." });
  if (status === "closed" && !details.clientRepairNotes) return res.status(400).json({ error: "Repair summary is required before closing a work order." });
  if (status === "in-repair" && !getCurrentConsent(ticket.id)?.signed_at) return res.status(409).json({ error: "Customer approval is required before work can begin." });
  if (status === "closed" && ticket.status !== "ready-for-pickup-payment") return res.status(409).json({ error: "Mark the work order Ready for pickup / payment before closing." });
  if (status === "closed" && (req.body.deviceReturnedOrRemoteEnded !== true || !["cash", "square"].includes(req.body.paymentMethod))) return res.status(400).json({ error: "Confirm return or remote-session completion and record cash or Square payment." });
  const oldServices = getServicesForTicket(ticket.id);
  const servicesChanged = Array.isArray(req.body.services) && JSON.stringify(oldServices) !== JSON.stringify(details.services);
  const customerFacingChanged = (req.body.notes !== undefined && details.notes !== (ticket.notes || ticket.assistance || "")) || (req.body.deviceCondition !== undefined && details.deviceCondition !== (ticket.device_condition || "")) || (req.body.accessories !== undefined && details.accessories !== (ticket.accessories || "")) || servicesChanged;
  const previousConsent = getCurrentConsent(ticket.id); const updatedAt = new Date().toISOString(); const completedAt = status === "closed" ? (ticket.completed_at || updatedAt) : null;
  database.run("UPDATE tickets SET assistance = ?, notes = ?, repair_notes = ?, client_repair_notes = ?, device_condition = ?, accessories = ?, status = ?, completed_at = ?, payment_method = ?, paid_at = ?, square_reference = ?, service_ended_at = ?, updated_at = ? WHERE public_id = ?", [details.notes, details.notes, details.repairNotes, details.clientRepairNotes, details.deviceCondition, details.accessories, status, completedAt, status === "closed" ? req.body.paymentMethod : ticket.payment_method, status === "closed" ? updatedAt : ticket.paid_at, status === "closed" && req.body.paymentMethod === "square" ? cleanText(req.body.squareReference, 120) : ticket.square_reference, status === "closed" ? updatedAt : ticket.service_ended_at, updatedAt, ticket.public_id]);
  if (Array.isArray(req.body.services)) replaceWorkOrderServices(ticket.id, details.services, updatedAt);
  if (req.body.repairNotes !== undefined && details.repairNotes && details.repairNotes !== (ticket.repair_notes || "")) database.run("INSERT INTO work_order_repair_notes (ticket_id, staff_user_id, note_text, created_at) VALUES (?, ?, ?, ?)", [ticket.id, req.staff.id, details.repairNotes, updatedAt]);
  if (customerFacingChanged && previousConsent?.signed_at) { revokeConsent(previousConsent.id); database.run("UPDATE tickets SET status = 'awaiting-approval', completed_at = NULL, updated_at = ? WHERE public_id = ?", [updatedAt, ticket.public_id]); }
  persistDatabase(); const updatedTicket = getTicket(ticket.public_id); let approval = null;
  if (customerFacingChanged && previousConsent?.signed_at) approval = await createConsentRequest(updatedTicket, true, true);
  const emailSent = approval ? Boolean(approval.emailSent) : ticket.status === status ? true : await sendStatusEmail(updatedTicket);
  if (status === "closed" && ticket.status !== "closed") await sendReviewInvitation(updatedTicket);
  return res.json({ ok: true, emailSent, approvalRevoked: Boolean(approval), workOrder: adminTicket(getTicket(ticket.public_id)), ticket: adminTicket(getTicket(ticket.public_id)) });
}
function getInvite(tokenHash) { return rowFromQuery("SELECT i.*, c.name, c.email FROM customer_invites i JOIN customers c ON c.id = i.customer_id WHERE i.token_hash = ?", [tokenHash]); }
async function createEmailVerification(customer) { database.run("UPDATE email_verifications SET used_at = COALESCE(used_at, ?) WHERE customer_id = ? AND used_at IS NULL", [new Date().toISOString(), customer.id]); const rawToken = crypto.randomBytes(32).toString("base64url"); const now = new Date(); const url = `${publicBaseUrl}/account/verify?token=${encodeURIComponent(rawToken)}`; database.run("INSERT INTO email_verifications (customer_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)", [customer.id, hashToken(rawToken), new Date(now.getTime() + verificationTtlMs).toISOString(), now.toISOString()]); const emailSent = await sendCustomerVerificationEmail(rawToken, customer); persistDatabase(); return { url, emailSent }; }
async function createCustomerInvitation(customer) { database.run("UPDATE customer_invites SET used_at = COALESCE(used_at, ?) WHERE customer_id = ? AND used_at IS NULL", [new Date().toISOString(), customer.id]); const rawToken = crypto.randomBytes(32).toString("base64url"); const now = new Date(); const url = `${publicBaseUrl}/account/setup?token=${encodeURIComponent(rawToken)}`; database.run("INSERT INTO customer_invites (customer_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)", [customer.id, hashToken(rawToken), new Date(now.getTime() + invitationTtlMs).toISOString(), now.toISOString()]); const emailSent = await sendCustomerInviteEmail(rawToken, customer); persistDatabase(); return { url, emailSent }; }
async function createCustomerPasswordReset(customer) { database.run("UPDATE customer_password_resets SET used_at = COALESCE(used_at, ?) WHERE customer_id = ? AND used_at IS NULL", [new Date().toISOString(), customer.id]); const rawToken = crypto.randomBytes(32).toString("base64url"); const now = new Date(); database.run("INSERT INTO customer_password_resets (customer_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)", [customer.id, hashToken(rawToken), new Date(now.getTime() + resetTokenTtlMs).toISOString(), now.toISOString()]); persistDatabase(); return sendCustomerPasswordResetEmail(rawToken, customer); }
function allowDurableThrottle(scope, key, limit, windowMs) { const existing = rowFromQuery("SELECT * FROM request_throttles WHERE scope = ? AND principal_key = ?", [scope, key]); const now = Date.now(); if (!existing || Date.parse(existing.window_started_at) + windowMs <= now) { database.run("INSERT INTO request_throttles (scope, principal_key, window_started_at, attempts) VALUES (?, ?, ?, 1) ON CONFLICT(scope, principal_key) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1", [scope, key, new Date(now).toISOString()]); persistDatabase(); return true; } database.run("UPDATE request_throttles SET attempts = attempts + 1 WHERE scope = ? AND principal_key = ?", [scope, key]); persistDatabase(); return Number(existing.attempts) < limit; }
function listTerms() { return rowsFromQuery("SELECT id, version, body, status, created_at AS createdAt, published_at AS publishedAt FROM terms_documents ORDER BY id DESC"); }
function getPublishedTerms() { return rowFromQuery("SELECT id, version, body, status, created_at, published_at FROM terms_documents WHERE status = 'published' ORDER BY id DESC LIMIT 1"); }
function customerOwnsTicket(customer, ticket) { return ticket.customer_id === customer.id || (ticket.customer_id === null && ticket.email.toLowerCase() === customer.email.toLowerCase()); }
function getCurrentConsent(ticketId) { return rowFromQuery("SELECT * FROM work_order_consents WHERE ticket_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1", [ticketId]); }
function safeConsent(consent) { if (!consent) return { status: "pending" }; return { status: consent.signed_at ? "signed" : "pending", signatureName: consent.signature_name || null, signedAt: consent.signed_at || null, termsVersion: consent.signed_at ? consent.terms_version : null, accessoriesLeft: consent.signed_at ? Boolean(consent.accessories_left) : null, backupRequested: consent.signed_at ? Boolean(consent.backup_requested) : null }; }
function consentDetails(consent) { return { ...safeConsent(consent), id: consent.id, expiresAt: consent.expires_at, termsSnapshot: consent.terms_snapshot, servicesSnapshot: JSON.parse(consent.services_snapshot_json || "[]"), totalCents: Number(consent.total_cents), termsAccepted: Boolean(consent.terms_accepted), electronicRecordsAccepted: Boolean(consent.electronic_records_accepted), accessoriesAcknowledged: Boolean(consent.accessories_acknowledged), revokedAt: consent.revoked_at || null }; }
function approvalServices(ticket) { return getServicesForTicket(ticket.id); }
function consentBlockReason(ticket) { if (!getPublishedTerms()) return "The approval form is not available yet because the current terms have not been published by the shop."; if (approvalServices(ticket).some((service) => !Number.isInteger(service.priceCents) || service.priceCents < 0)) return "The approval form is not available yet because one or more services does not have a confirmed price."; return "The approval form could not be prepared. Please contact the shop."; }
async function createConsentRequest(ticket, sendEmail = true, updated = false) { const terms = getPublishedTerms(); const services = approvalServices(ticket); if (!terms || services.some((service) => !Number.isInteger(service.priceCents) || service.priceCents < 0)) return null; database.run("UPDATE work_order_consents SET revoked_at = COALESCE(revoked_at, ?) WHERE ticket_id = ? AND revoked_at IS NULL", [new Date().toISOString(), ticket.id]); const rawToken = crypto.randomBytes(32).toString("base64url"); const now = new Date(); database.run("INSERT INTO work_order_consents (ticket_id, token_hash, expires_at, terms_version, terms_snapshot, services_snapshot_json, total_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [ticket.id, hashToken(rawToken), new Date(now.getTime() + approvalTtlMs).toISOString(), terms.version, terms.body, JSON.stringify(services), services.reduce((sum, service) => sum + service.priceCents, 0), now.toISOString()]); database.run("UPDATE tickets SET status = 'awaiting-approval', updated_at = ? WHERE id = ?", [now.toISOString(), ticket.id]); const consent = getCurrentConsent(ticket.id); const url = `${publicBaseUrl}/consent?token=${encodeURIComponent(rawToken)}`; const emailSent = sendEmail ? await sendWorkOrderApprovalEmail(ticket, consent, terms, updated, url) : false; persistDatabase(); return { url, emailSent, consent };
}
function getConsentByToken(tokenHash) { return rowFromQuery("SELECT c.*, t.public_id, t.name, t.email, t.phone, t.notes, t.assistance, t.device_condition, t.accessories, t.status FROM work_order_consents c JOIN tickets t ON t.id = c.ticket_id WHERE c.token_hash = ?", [tokenHash]); }
function consentReview(consent) { return { workOrder: { id: consent.public_id, name: consent.name, email: consent.email, notes: consent.notes || consent.assistance || "", deviceCondition: consent.device_condition || "", accessories: consent.accessories || "", services: JSON.parse(consent.services_snapshot_json || "[]"), totalCents: Number(consent.total_cents), status: consent.status }, terms: { version: consent.terms_version, body: consent.terms_snapshot }, expiresAt: consent.expires_at, signed: Boolean(consent.signed_at), signatureName: consent.signature_name || null, signedAt: consent.signed_at || null }; }
function getConsentForReview(req, res) { const token = cleanText(req.query.token, 200); const consent = getConsentByToken(hashToken(token)); if (!consent || consent.revoked_at || consent.signed_at || new Date(consent.expires_at) <= new Date()) return res.status(400).json({ error: "This approval link is invalid, expired, or already used." }); return res.json({ ok: true, consent: consentReview(consent) }); }
async function submitConsent(req, res) { const token = cleanText(req.body.token, 200); const consent = getConsentByToken(hashToken(token)); if (!consent || consent.revoked_at || consent.signed_at || new Date(consent.expires_at) <= new Date()) return res.status(400).json({ error: "This approval link is invalid, expired, or already used." }); const signatureName = cleanText(req.body.signatureName, 160); const termsAccepted = req.body.termsAccepted === true; const electronicRecordsAccepted = req.body.electronicRecordsAccepted === true; const accessoriesAcknowledged = req.body.accessoriesAcknowledged === true; const accessoriesLeft = typeof req.body.accessoriesLeft === "boolean" ? req.body.accessoriesLeft : null; const backupRequested = typeof req.body.backupRequested === "boolean" ? req.body.backupRequested : null; if (signatureName.length < 2 || !termsAccepted || !electronicRecordsAccepted || !accessoriesAcknowledged || accessoriesLeft === null || backupRequested === null) return res.status(400).json({ error: "Enter your full legal name and complete each required acknowledgement." }); const now = new Date().toISOString(); database.run("UPDATE work_order_consents SET signature_name = ?, terms_accepted = 1, electronic_records_accepted = 1, accessories_acknowledged = 1, accessories_left = ?, backup_requested = ?, signed_at = ? WHERE id = ?", [signatureName, accessoriesLeft ? 1 : 0, backupRequested ? 1 : 0, now, consent.id]); database.run("UPDATE tickets SET status = 'approved-queued', updated_at = ? WHERE id = ?", [now, consent.ticket_id]); persistDatabase(); const signedConsent = getCurrentConsent(consent.ticket_id); const ticket = getTicket(consent.public_id); const customerEmailSent = await sendConsentConfirmationEmail(ticket, signedConsent); const ownerEmailSent = await sendConsentNotificationEmail(ticket, signedConsent); return res.json({ ok: true, customerEmailSent, ownerEmailSent, workOrder: customerTicket(ticket) }); }
function revokeConsent(consentId) { database.run("UPDATE work_order_consents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [new Date().toISOString(), consentId]); }
function persistDatabase() {
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, Buffer.from(database.export()), { mode: 0o600 });
  fs.chmodSync(temporaryPath, 0o600);
  fs.renameSync(temporaryPath, databasePath);
  fs.chmodSync(databasePath, 0o600);
}
function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function createDurableSession(res, type, principalId) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const idleMs = type === "admin" ? adminIdleMs : customerIdleMs;
  const absoluteMs = type === "admin" ? adminAbsoluteMs : customerAbsoluteMs;
  database.run("INSERT INTO auth_sessions (token_hash, principal_type, principal_id, csrf_token, created_at, last_seen_at, idle_expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [hashToken(rawToken), type, principalId, crypto.randomBytes(24).toString("base64url"), new Date(now).toISOString(), new Date(now).toISOString(), new Date(now + idleMs).toISOString(), new Date(now + absoluteMs).toISOString()]);
  persistDatabase();
  res.cookie(type === "admin" ? "neno_admin" : "neno_customer", rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: type === "admin" ? "strict" : "lax", maxAge: absoluteMs, path: "/" });
}
function setAdminSession(res, user) { createDurableSession(res, "admin", user.id); }
function setCustomerSession(res, customer) { createDurableSession(res, "customer", customer.id); }
function loadSession(req, type) {
  const rawToken = parseCookie(req.headers.cookie || "")[type === "admin" ? "neno_admin" : "neno_customer"];
  const tokenHash = rawToken ? hashToken(rawToken) : "";
  const session = tokenHash ? rowFromQuery("SELECT * FROM auth_sessions WHERE token_hash = ? AND principal_type = ?", [tokenHash, type]) : null;
  if (!session || Date.parse(session.idle_expires_at) <= Date.now() || Date.parse(session.absolute_expires_at) <= Date.now()) { if (session) deleteSession(tokenHash); return null; }
  const idleMs = type === "admin" ? adminIdleMs : customerIdleMs;
  const idleExpiresAt = new Date(Math.min(Date.now() + idleMs, Date.parse(session.absolute_expires_at))).toISOString();
  database.run("UPDATE auth_sessions SET last_seen_at = ?, idle_expires_at = ? WHERE token_hash = ?", [new Date().toISOString(), idleExpiresAt, tokenHash]);
  return { ...session, token_hash: tokenHash, idle_expires_at: idleExpiresAt };
}
function deleteSession(tokenHash) { database.run("DELETE FROM auth_sessions WHERE token_hash = ?", [tokenHash]); persistDatabase(); }
function invalidateSessions(type, principalId) { database.run("DELETE FROM auth_sessions WHERE principal_type = ? AND principal_id = ?", [type, principalId]); }
function requireAdmin(req, res, next) { const session = loadSession(req, "admin"); const staff = session ? getStaffById(session.principal_id) : null; if (!session || !staff?.active) return res.status(401).json({ error: "Staff login required." }); req.session = session; req.staff = staff; return next(); }
function requireCustomer(req, res, next) { const session = loadSession(req, "customer"); const customer = session ? rowFromQuery("SELECT * FROM customers WHERE id = ?", [session.principal_id]) : null; if (!session || !customer || customer.disabled_at) return res.status(401).json({ error: "Customer login required." }); req.session = session; req.customerSession = session; req.customer = customer; return next(); }
function optionalCustomer(req, _res, next) { const session = loadSession(req, "customer"); const customer = session ? rowFromQuery("SELECT * FROM customers WHERE id = ?", [session.principal_id]) : null; if (session && customer && !customer.disabled_at) { req.session = session; req.customer = customer; } return next(); }
function requireCsrf(req, res, next) { const token = String(req.headers["x-csrf-token"] || ""); if (!token || token !== req.session?.csrf_token) return res.status(403).json({ error: "This request could not be verified." }); return next(); }
function parseCookie(header) { return header.split(";").reduce((cookies, part) => { const index = part.indexOf("="); if (index > -1) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1)); return cookies; }, {}); }
function seedToolCards() { const now = new Date().toISOString(); const cards = [["Repair Admin","Manage customers and work orders","/admin","Operations","admin",0,"repair-admin"],["Published Terms","Read the current service terms",`${publicBaseUrl}/terms`,"Policies","admin",10,"terms"],["Published Privacy","Read the current privacy policy",`${publicBaseUrl}/privacy`,"Policies","admin",20,"privacy"],["Public repair site","Open the customer site",publicBaseUrl,"Operations","admin",30,"public"],["Policy editor and history","Review policy versions","/admin/policies","Owner","owner",40,"policies"],["Staff and security","Manage staff access and MFA","/admin/security","Owner","owner",50,"security"],["Business email","Open the business inbox","https://mail.google.com/","Business","owner",60,"email"],["Google Business Profile","Manage the Philadelphia service-area profile","https://business.google.com/","Business","owner",70,"google"],["Square","Open Square invoices and payments","https://squareup.com/dashboard/","Business","owner",80,"square"],["Cloudflare","Manage DNS and security","https://dash.cloudflare.com/","Infrastructure","owner",90,"cloudflare"],["Retention review","Review eligible records","/admin/retention","Owner","owner",100,"retention"]]; for (const [title, description, url, category, role, sort, key] of cards) database.run("INSERT OR IGNORE INTO staff_tool_cards (title, description, url, category, minimum_role, sort_order, visible, system_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)", [title, description, url, category, role, sort, key, now, now]); }
function listToolCards(role, all = false) { const records = all ? rowsFromQuery("SELECT * FROM staff_tool_cards ORDER BY sort_order, id") : rowsFromQuery("SELECT * FROM staff_tool_cards WHERE visible = 1 AND (minimum_role = 'admin' OR ? = 'owner') ORDER BY sort_order, id", [role]); return records.map((tool) => ({ id: tool.id, title: tool.title, description: tool.description, url: tool.url, category: tool.category, minimumRole: tool.minimum_role, sortOrder: Number(tool.sort_order), visible: Boolean(tool.visible), system: Boolean(tool.system_key) })); }
function validToolUrl(value) { if (/^\/admin(?:\/|$)/.test(value)) return value; try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; } }
function saveToolCard(req, res) { if (req.staff.role !== "owner") return res.status(403).json({ error: "Owner access is required." }); const existing = req.params.id ? rowFromQuery("SELECT * FROM staff_tool_cards WHERE id = ?", [req.params.id]) : null; if (req.params.id && !existing) return res.status(404).json({ error: "Tool not found." }); const title = cleanText(req.body.title, 100); const description = cleanText(req.body.description, 300); const url = validToolUrl(String(req.body.url || "")); const category = cleanText(req.body.category, 60) || "Operations"; const role = validRoles.has(req.body.minimumRole) ? req.body.minimumRole : "owner"; const sortOrder = Number(req.body.sortOrder || 0); if (!title || !url || !Number.isInteger(sortOrder)) return res.status(400).json({ error: "Enter a title, HTTPS or staff-relative URL, and integer order." }); const now = new Date().toISOString(); if (existing) database.run("UPDATE staff_tool_cards SET title = ?, description = ?, url = ?, category = ?, minimum_role = ?, sort_order = ?, visible = ?, updated_at = ? WHERE id = ?", [title, description, url, category, role, sortOrder, req.body.visible === false ? 0 : 1, now, existing.id]); else database.run("INSERT INTO staff_tool_cards (title, description, url, category, minimum_role, sort_order, visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [title, description, url, category, role, sortOrder, req.body.visible === false ? 0 : 1, now, now]); persistDatabase(); return res.status(existing ? 200 : 201).json({ ok: true }); }
function staffHealth() { const stat = fs.statSync(databasePath); const heartbeat = rowFromQuery("SELECT * FROM backup_heartbeats ORDER BY id DESC LIMIT 1"); return [{ key: "application", label: "Repair application", status: "healthy", detail: "Application and database query are responding." }, { key: "database", label: "Database permissions", status: (stat.mode & 0o777) === 0o600 ? "healthy" : "attention", detail: `Database mode ${(stat.mode & 0o777).toString(8).padStart(4, "0")}; expected 0600.` }, { key: "backup", label: "Encrypted off-site backup", status: heartbeat?.result === "success" && Date.now() - Date.parse(heartbeat.backup_timestamp) < 48 * 60 * 60 * 1000 ? "healthy" : "attention", detail: heartbeat ? `Last reported ${heartbeat.result} at ${heartbeat.backup_timestamp}.` : "No signed backup heartbeat has been received." }]; }
function retentionQueue() { const year = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(); const twoYears = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(); const sevenYears = new Date(Date.now() - 7 * 365 * 24 * 60 * 60 * 1000).toISOString(); return [...rowsFromQuery("SELECT 'inquiry' AS record_type, contact_id AS record_id, name, email, created_at, 'Unconverted inquiry older than 12 months' AS reason FROM contact_messages WHERE created_at <= ? AND status != 'closed'", [year]), ...rowsFromQuery("SELECT 'account' AS record_type, id AS record_id, name, email, created_at, 'Inactive account older than two years; verify holds before disabling' AS reason FROM customers WHERE updated_at <= ? AND disabled_at IS NULL", [twoYears]), ...rowsFromQuery("SELECT 'work-order' AS record_type, public_id AS record_id, name, email, created_at, 'Closed record older than seven years; verify holds before anonymizing' AS reason FROM tickets WHERE status = 'closed' AND completed_at <= ?", [sevenYears])]; }
function createMfaChallenge(staffUserId, kind, challenge) { const rawToken = crypto.randomBytes(32).toString("base64url"); const now = Date.now(); database.run("INSERT INTO auth_challenges (token_hash, staff_user_id, kind, challenge, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", [hashToken(rawToken), staffUserId, kind, challenge || null, new Date(now + 5 * 60 * 1000).toISOString(), new Date(now).toISOString()]); persistDatabase(); return { rawToken }; }
function getMfaChallenge(rawToken, staffUserId, kind) { const challenge = rowFromQuery("SELECT * FROM auth_challenges WHERE token_hash = ? AND staff_user_id = ? AND kind = ?", [hashToken(cleanText(rawToken, 200)), staffUserId, kind]); return challenge && !challenge.used_at && Date.parse(challenge.expires_at) > Date.now() ? challenge : null; }
function useMfaChallenge(id) { database.run("UPDATE auth_challenges SET used_at = ? WHERE id = ?", [new Date().toISOString(), id]); }
function requireMfaPending(req, res, next) { const raw = parseCookie(req.headers.cookie || "").neno_admin_pending; const challenge = raw ? getMfaChallenge(raw, Number(rowFromQuery("SELECT staff_user_id FROM auth_challenges WHERE token_hash = ?", [hashToken(raw)])?.staff_user_id), "login") : null; const staff = challenge ? getStaffById(challenge.staff_user_id) : null; if (!challenge || !staff?.active) return res.status(401).json({ error: "The MFA sign-in expired. Start again." }); req.pendingChallenge = challenge; req.pendingStaff = staff; return next(); }
function listPasskeys(staffUserId) { return rowsFromQuery("SELECT * FROM staff_passkeys WHERE staff_user_id = ? ORDER BY id", [staffUserId]); }
function mfaState(staffUserId) { return { passkey: Boolean(rowFromQuery("SELECT id FROM staff_passkeys WHERE staff_user_id = ? LIMIT 1", [staffUserId])), totp: Boolean(rowFromQuery("SELECT staff_user_id FROM staff_totp WHERE staff_user_id = ? AND verified_at IS NOT NULL", [staffUserId])) }; }
function mfaEncryptionKey() { const value = process.env.MFA_ENCRYPTION_KEY || ""; if (process.env.SMOKE_TEST === "true") return crypto.createHash("sha256").update(value || "smoke-test-only").digest(); if (!value) throw new Error("MFA_ENCRYPTION_KEY is not configured."); if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex"); const key = Buffer.from(value, "base64"); if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes in base64 or 64 hexadecimal characters."); return key; }
function encryptMfaSecret(secret) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", mfaEncryptionKey(), iv); const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]); return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") }; }
function decryptMfaSecret(record) { const decipher = crypto.createDecipheriv("aes-256-gcm", mfaEncryptionKey(), Buffer.from(record.secret_iv, "base64")); decipher.setAuthTag(Buffer.from(record.secret_tag, "base64")); return Buffer.concat([decipher.update(Buffer.from(record.secret_ciphertext, "base64")), decipher.final()]).toString("utf8"); }
function verifyTotp(record, code, preventReplay) { if (!record || !/^\d{6}$/.test(code)) return null; try { const totp = new OTPAuth.TOTP({ issuer: "Neno’s IT Repair", label: "staff", algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(decryptMfaSecret(record)) }); const delta = totp.validate({ token: code, window: 1 }); if (delta === null) return null; const counter = Math.floor(Date.now() / 30000) + delta; if (preventReplay && record.last_counter !== null && counter <= Number(record.last_counter)) return null; return counter; } catch { return null; } }
function failMfa(req, res) { database.run("UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?", [req.pendingChallenge.id]); if (Number(req.pendingChallenge.attempts) >= 4) useMfaChallenge(req.pendingChallenge.id); persistDatabase(); return res.status(400).json({ error: "MFA verification failed or the code was already used." }); }
function finishEnrollment(req, res) { const methods = mfaState(req.pendingStaff.id); if (methods.passkey && methods.totp) return completeMfaLogin(req, res); return res.json({ ok: true, enrollmentRequired: true, methods }); }
function completeMfaLogin(req, res) { useMfaChallenge(req.pendingChallenge.id); setAdminSession(res, req.pendingStaff); res.clearCookie("neno_admin_pending", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/admin/mfa" }); persistDatabase(); return res.json({ ok: true, authenticated: true, user: publicStaff(req.pendingStaff) }); }
async function sendStatusEmail(ticket) { if (!ticket) return false; const transport = createTransport(); if (!transport) return false; const statusText = statusLabels[ticket.status] || ticket.status; const completionNote = ticket.status === "closed" && ticket.client_repair_notes ? ["", "Repair summary:", ticket.client_repair_notes].join("\n") : ""; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ticket.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: `Neno’s IT Repair — ${ticket.public_id} is ${statusText}`, text: [`Hi ${ticket.name}`, "", `Your Neno’s IT Repair work order ${ticket.public_id} is now: ${statusText}.`, "", statusMessage(ticket.status), completionNote, "", "We will contact you if we need more information.", "", "Neno’s IT Repair"].join("\n") }); return true; } catch (error) { console.error(`Email failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendCustomerInviteEmail(rawToken, customer) { const transport = createTransport(); if (!transport || !customer?.email) return false; const setupUrl = `${publicBaseUrl}/account/setup?token=${encodeURIComponent(rawToken)}`; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: customer.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno’s IT Repair — finish setting up your account", text: [`Hi ${customer.name},`, "", "An account has been created for you at Neno’s IT Repair.", `Set your password here: ${setupUrl}`, "", "This one-time link expires in 48 hours. You must set a password before signing in.", "If you were not expecting this message, you can ignore it.", "", "Neno’s IT Repair"].join("\n") }); return true; } catch (error) { console.error(`Customer invitation failed for ${customer.email}:`, error.message); return false; } }
async function sendCustomerVerificationEmail(rawToken, customer) { const transport = createTransport(); if (!transport || !customer?.email) return false; const verificationUrl = `${publicBaseUrl}/account/verify?token=${encodeURIComponent(rawToken)}`; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: customer.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno’s IT Repair — verify your email", text: [`Hi ${customer.name},`, "", "Please verify your email address to finish creating your Neno’s IT Repair account.", `Verify your email here: ${verificationUrl}`, "", "This one-time link expires in 24 hours. You must verify your email before signing in.", "If you did not create this account, you can ignore this message.", "", "Neno’s IT Repair"].join("\n") }); return true; } catch (error) { console.error(`Customer verification failed for ${customer.email}:`, error.message); return false; } }
async function sendExistingCustomerHelp(customer) { const transport = createTransport(); if (!transport) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: customer.email, subject: "Neno’s IT Repair — account help", text: [`Hi ${customer.name},`, "", "An account already uses this email address. No account details were changed.", `Sign in: ${publicBaseUrl}/account`, `Reset your password: ${publicBaseUrl}/account/forgot`, "", "Neno’s IT Repair"].join("\n") }); return true; } catch { return false; } }
async function sendCustomerPasswordResetEmail(rawToken, customer) { const transport = createTransport(); if (!transport) return false; const url = `${publicBaseUrl}/account/reset?token=${encodeURIComponent(rawToken)}`; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: customer.email, subject: "Neno’s IT Repair — reset your password", text: [`Hi ${customer.name},`, "", `Reset your password: ${url}`, "", "This one-use link expires in 30 minutes. If you did not request it, no action is needed.", "", "Neno’s IT Repair"].join("\n") }); return true; } catch { return false; } }
async function sendContactAcknowledgementEmail(contact) { const transport = createTransport(); if (!transport || !contact?.email) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: contact.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno’s IT Repair — we received your message", text: [`Hi ${contact.name},`, "", "We received your message and will get back to you.", `Reference: ${contact.contact_id}`, "", "This is a contact request, not a repair work order. A separate work order will be sent if service is needed.", "", "Neno’s IT Repair"].join("\n") }); return true; } catch (error) { console.error(`Contact acknowledgement failed for ${contact.email}:`, error.message); return false; } }
async function sendNewContactNotification(contact) { if (!contact || !adminEmail) return false; const transport = createTransport(); if (!transport) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: adminEmail, replyTo: contact.email, subject: `New contact request — ${contact.contact_id}`, text: ["A new contact request was submitted.", "", `Reference: ${contact.contact_id}`, `Name: ${contact.name}`, `Email: ${contact.email}`, `Phone: ${contact.phone}`, "", "Message:", contact.message, "", `Review contact requests: ${staffBaseUrl}/admin`].join("\n") }); return true; } catch (error) { console.error(`New contact notification failed for ${contact.contact_id}:`, error.message); return false; } }
async function sendWorkOrderApprovalEmail(ticket, consent, terms, updated, approvalUrl) { const transport = createTransport(); if (!transport || !ticket?.email) return false; const serviceLines = JSON.parse(consent.services_snapshot_json || "[]").map((service) => `- ${service.name}: ${formatMoney(service.priceCents)}`).join("\n") || "- No services listed"; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ticket.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: `Neno’s IT Repair — ${updated ? "updated approval needed" : "review work order"} ${ticket.public_id}`, text: [`Hi ${ticket.name},`, "", `${updated ? "The work order has changed and needs your approval again." : "Your work order is ready for your review."}`, `Work order: ${ticket.public_id}`, "", "Notes:", ticket.notes || ticket.assistance || "", "", "Services and prices:", serviceLines, `Quoted service total: ${formatMoney(consent.total_cents)}`, "", "Device condition:", ticket.device_condition || "Not recorded", "", "Accessories recorded by the shop:", ticket.accessories || "None recorded", "", "Repairs will not begin until you complete the approval.", `Review and sign: ${approvalUrl}`, "", `Terms and liability policy (${terms.version}):`, terms.body, "", "Neno’s IT Repair"].join("\n") }); return true; } catch (error) { console.error(`Approval email failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendConsentConfirmationEmail(ticket, consent) { const transport = createTransport(); if (!transport) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ticket.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: `Neno’s IT Repair — approval received for ${ticket.public_id}`, text: [`Hi ${ticket.name},`, "", `Your approval for work order ${ticket.public_id} was received.`, `Signed by: ${consent.signature_name}`, `Signed at: ${consent.signed_at}`, `Accessories left: ${consent.accessories_left ? "Yes" : "No"}`, `Data backup requested: ${consent.backup_requested ? "Yes" : "No"}`, "", "The order is now Approved / queued. Staff will explicitly start the repair and send further updates.", "", "Neno’s IT Repair"].join("\n") }); return true; } catch (error) { console.error(`Consent confirmation failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendConsentNotificationEmail(ticket, consent) { const transport = createTransport(); if (!transport || !adminEmail) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: adminEmail, replyTo: ticket.email, subject: `Signed approval received — ${ticket.public_id}`, text: [`Customer approval received for ${ticket.public_id}.`, "", `Customer: ${ticket.name}`, `Email: ${ticket.email}`, `Signature: ${consent.signature_name}`, `Signed at: ${consent.signed_at}`, `Accessories left: ${consent.accessories_left ? "Yes" : "No"}`, `Data backup requested: ${consent.backup_requested ? "Yes" : "No"}`, "", `Review the order: ${staffBaseUrl}/admin`].join("\n") }); return true; } catch (error) { console.error(`Owner consent notification failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendNewTicketNotification(ticket) { if (!ticket || !adminEmail) return false; const transport = createTransport(); if (!transport) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: adminEmail, replyTo: ticket.email, subject: `New repair request — ${ticket.public_id}`, text: ["A new Neno’s IT Repair work order was submitted.", "", `Work order: ${ticket.public_id}`, `Name: ${ticket.name}`, `Email: ${ticket.email}`, `Phone: ${ticket.phone}`, "", "Request:", ticket.assistance, "", `Review work orders: ${staffBaseUrl}/admin`].join("\n") }); return true; } catch (error) { console.error(`New ticket notification failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendPasswordResetEmail(rawToken, user) { const transport = createTransport(); if (!transport || !user?.email) return false; const resetUrl = `${staffBaseUrl}/admin/reset?token=${encodeURIComponent(rawToken)}`; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: user.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno’s IT Repair — reset your admin password", text: ["A password reset was requested for your Neno’s IT Repair admin account.", "", `Reset your password here: ${resetUrl}`, "", "This link expires in 30 minutes and can only be used once.", "If you did not request this, you can ignore this email."].join("\n") }); return true; } catch (error) { console.error("Password reset email failed:", error.message); return false; } }
function statusMessage(status) { if (status === "request-received") return "We received your request and will contact you to arrange the next step."; if (status === "diagnosing-estimating") return "Diagnosis and estimate preparation are underway."; if (status === "awaiting-approval") return "Your written estimate is ready for review and approval."; if (status === "approved-queued") return "Your signed approval was received and the order is queued."; if (status === "in-repair") return "The approved work is in progress."; if (status === "ready-for-pickup-payment") return "The work is ready for pickup or final payment."; return "The device was returned or remote session ended, payment was recorded, and the work order is closed."; }
async function sendReviewInvitation(ticket) { const reviewUrl = validToolUrl(process.env.GOOGLE_REVIEW_URL || ""); if (!reviewUrl || ticket.legacy_closed || !ticket.review_eligible || rowFromQuery("SELECT ticket_id FROM review_deliveries WHERE ticket_id = ?", [ticket.id])) return false; const transport = createTransport(); let sent = false; if (transport) { try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ticket.email, subject: "Neno’s IT Repair — optional review", text: [`Hi ${ticket.name},`, "", "Thank you for choosing Neno’s IT Repair. Every eligible completed work order receives the same invitation.", `If you would like to leave an honest review: ${reviewUrl}`, "", "Neno’s IT Repair"].join("\n") }); sent = true; } catch { sent = false; } } database.run("INSERT INTO review_deliveries (ticket_id, sent_at, email, result) VALUES (?, ?, ?, ?)", [ticket.id, sent ? new Date().toISOString() : null, ticket.email, sent ? "sent" : "delivery-failed"]); persistDatabase(); return sent; }
function formatMoney(cents) { return Number.isInteger(Number(cents)) ? `$${(Number(cents) / 100).toFixed(2)}` : "Price to be confirmed"; }
function createTransport() { if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null; return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }); }
