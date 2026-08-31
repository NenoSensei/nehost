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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3001);
const dataDir = process.env.DATA_DIR || path.join(rootDir, "data");
const databasePath = path.join(dataDir, "tickets.sqlite");
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || "";
const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || "";
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "https://repair.nenosensei.com").replace(/\/$/, "");
const sessionTtlMs = 8 * 60 * 60 * 1000;
const resetTokenTtlMs = 30 * 60 * 1000;
const invitationTtlMs = 48 * 60 * 60 * 1000;
const verificationTtlMs = 24 * 60 * 60 * 1000;
const approvalTtlMs = 30 * 24 * 60 * 60 * 1000;
const policyVersion = "Draft v2";
const draftTerms = `Neno's IT Repair — Service Terms, Device Authorization, and Privacy Policy (Draft v2)

DRAFT — NOT CURRENTLY IN EFFECT. This policy is prepared for business-owner review and review by a qualified Pennsylvania attorney. It becomes effective only when published by Neno's IT Repair.

Business: Neno's IT Repair, Philadelphia, Pennsylvania
Notices and privacy requests: repair@nenosensei.com

1. Agreement

By submitting a work order, leaving a device with Neno's IT Repair, approving services, or signing electronically, the customer agrees to the terms that apply to that work order. If the customer is not the device owner, the customer confirms that they have the owner's permission to request service and authorize access to the device.

2. Authorization and scope of service

The customer authorizes Neno's IT Repair to inspect, test, clean, repair, configure, transfer, back up, or otherwise service the device only as described on the approved work order. Additional services, parts, or price changes require customer approval before the additional work begins. Limited additional diagnostic work may be performed when reasonably necessary to identify the reported problem.

The customer confirms that the requested work is lawful and that the customer has authority to provide the device and authorize the requested service. Neno's IT Repair may refuse work that is unsafe, unlawful, outside its capabilities, or likely to create unreasonable risk.

3. Device condition and accessories

The customer agrees that the device condition and accessories recorded on the work order are accurate to the best of the customer's knowledge. Neno's IT Repair is not responsible for pre-existing damage, normal wear, corrosion, liquid damage, missing parts, defective components, weakened hinges, cracked screens, damaged ports, or problems that become apparent during ordinary inspection or repair.

4. Data, backups, and credentials

The customer is responsible for maintaining current backups of important files before service. If backup service is selected, Neno's IT Repair will make a reasonable effort to perform the approved backup, but a backup is not guaranteed to succeed or contain every file. The customer must confirm that important files were successfully preserved.

Repair, cleaning, updates, operating-system work, storage failure, malware removal, file transfers, and hardware failure may result in data loss, corrupted files, lost settings, or loss of access. To the maximum extent permitted by law, Neno's IT Repair is not responsible for loss of data or files unless the law does not allow that limitation.

Customers should not provide passwords by email, text message, or through the website. When access credentials are necessary, the customer should use a temporary password whenever possible and change it after service. Neno's IT Repair will not intentionally inspect personal files unless access is reasonably necessary to perform or verify the approved service.

5. Prices, parts, payment, and warranty

The quoted service total covers only the services listed on the work order. Parts, taxes, shipping, rush work, third-party charges, and separately approved work may be billed separately. Payment is due when stated on the invoice or work order.

Neno's IT Repair does not guarantee that every problem can be repaired, that a device will remain operational after repair, or that a particular performance improvement will be achieved. Only a warranty specifically written on the applicable work order applies. No other warranty is made to the maximum extent permitted by law.

6. Storage and unclaimed devices

The customer must collect the device within 30 days after Neno's IT Repair gives notice that service is complete or the device is ready for pickup. After the 30-day grace period, Neno's IT Repair may charge a storage fee of $5 per day, where legally permitted.

After a reasonable notice period and any notices required by Pennsylvania law, Neno's IT Repair may take lawful steps to dispose of or sell an unclaimed device to recover unpaid charges. The customer remains responsible for approved charges, storage charges, and reasonable collection costs to the extent permitted by law.

7. Liability limits

To the maximum extent permitted by Pennsylvania law, Neno's IT Repair will not be responsible for indirect, incidental, special, consequential, or lost-profit damages, including loss of data, business interruption, lost revenue, lost files, or loss of use.

To the maximum extent permitted by law, Neno's IT Repair's total liability for a claim related to a service will not exceed the amount the customer paid for the specific service giving rise to the claim. These limits do not waive rights or liabilities that cannot legally be waived.

8. Privacy and information handling

Neno's IT Repair may collect the customer's name, email address, phone number, account information, work-order details, device information, accessories, service selections, prices, messages, approvals, typed signatures, policy versions accepted, and transaction information handled by the selected payment provider.

This information is used to provide and document services, communicate about work orders and payments, maintain customer accounts, prevent unauthorized access and abuse, respond to requests, maintain business and legal records, and protect customers, employees, and the business.

Neno's IT Repair does not sell or rent customer personal information. Information may be shared only when reasonably necessary with authorized employees, hosting providers, email providers, payment processors, technical service providers, professional advisers, law enforcement, or government authorities with lawful authority.

Employees and contractors may access customer information only when needed to provide service, maintain systems, process a transaction, or meet a legal obligation. Neno's IT Repair will collect only information reasonably needed for its business, use reasonable safeguards appropriate to the information, and securely dispose of information when it is no longer needed for a legitimate business, legal, tax, security, warranty, or dispute-related purpose.

Customers may contact repair@nenosensei.com to request correction of inaccurate account information, ask how their information is used, request applicable records, or request deletion when the information is no longer needed for a legitimate retention purpose. Some records may need to be retained for legal, accounting, security, fraud-prevention, warranty, or dispute-related reasons.

Neno's IT Repair will investigate suspected security incidents and provide notices required by applicable law. No website, email system, or storage system can be guaranteed completely secure.

9. Electronic records and signatures

The customer agrees that work orders, approvals, notices, invoices, and related terms may be provided electronically. The customer confirms that they can access and retain electronic records using an internet-connected device and a current web browser.

The customer may request a paper copy by contacting repair@nenosensei.com. The customer may withdraw consent to electronic records by contacting the same address. Withdrawal may delay service or require paper records.

The customer's typed full legal name, submitted with the required acknowledgements, is intended to be an electronic signature for the applicable work order. The accepted policy version and exact policy text will be retained with the signed work order.

10. Changes and governing law

Neno's IT Repair may update these terms by publishing a new version. The version accepted by the customer will be retained with the signed work order. These terms are governed by the laws of the Commonwealth of Pennsylvania, without waiving rights that cannot legally be waived.

11. Customer acknowledgement

By signing a work order, the customer confirms that they authorized the requested services, reviewed the notes, device condition, accessories, services, and prices, understand the backup and data-loss limitations, had an opportunity to review these terms, agree to the privacy practices above, consent to electronic records, and understand that repairs will not begin until the required approval is completed.`;
const sessions = new Map();
const customerSessions = new Map();

fs.mkdirSync(dataDir, { recursive: true });

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
    status TEXT NOT NULL DEFAULT 'contact-needed',
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
    status TEXT NOT NULL DEFAULT 'contact-needed',
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
database.run("INSERT OR IGNORE INTO terms_documents (version, body, status, created_at) VALUES (?, ?, 'draft', ?)", [policyVersion, draftTerms, new Date().toISOString()]);
database.run("UPDATE tickets SET notes = assistance WHERE notes = '' AND assistance <> ''");
database.run("UPDATE tickets SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL");
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
persistDatabase();

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], fontSrc: ["'self'", "https://fonts.googleapis.com"],
    styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"], imgSrc: ["'self'", "data:"],
    scriptSrc: ["'self'"], connectSrc: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"],
  } }, referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "8kb" }));

const ticketLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many requests. Please try again later." } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many login attempts. Please try again later." } });
const accountLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many account requests. Please try again later." } });
const verificationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many verification requests. Please try again later." } });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many reset requests. Please try again later." } });
const validStatuses = new Set(["contact-needed", "ready-to-start", "in-progress", "completed"]);
const validRoles = new Set(["owner", "admin"]);
const validContactStatuses = new Set(["contact-needed", "completed"]);
const validContactOutcomes = new Set(["spoke", "left-voicemail", "no-connection"]);
const serviceChoices = [
  ["Diagnostic and written estimate", 4900], ["Standard computer repair", 12900], ["Gaming PC repair", 16900], ["PC tune-up", 8900], ["PC cleaning", 6900], ["Malware or virus removal", 12900], ["Severe malware removal", 17900], ["Windows repair", 13900], ["Windows reinstall with data preservation", 17900], ["New computer setup", 12900], ["Data transfer", 14900], ["SSD or hard-drive installation", 7900], ["SSD installation with data migration", 14900], ["Custom PC assembly", 19900], ["Remote support", 7900], ["Onsite support", 11900], ["PC training and lessons", 6500],
];

app.get("/health", (_req, res) => res.type("text").send("ok\n"));
app.get("/api/service-choices", (_req, res) => res.json({ services: serviceChoices.map(([name, defaultPriceCents]) => ({ name, defaultPriceCents })) }));
app.post("/api/contact", ticketLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase(); const phone = cleanText(req.body.phone, 40); const message = cleanText(req.body.message || req.body.assistance, 2000); const honeypot = cleanText(req.body.company, 100);
  if (honeypot) return res.status(201).json({ ok: true, contact: { id: "received", status: "contact-needed" } });
  if (!name || !isEmail(email) || !phone || message.length < 10) return res.status(400).json({ error: "Please complete each field with valid details." });
  const now = new Date().toISOString(); const contactId = createContactId(); database.run("INSERT INTO contact_messages (contact_id, name, email, phone, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'contact-needed', ?, ?)", [contactId, name, email, phone, message, now, now]); persistDatabase(); const contact = getContact(contactId); const emailSent = await sendContactAcknowledgementEmail(contact); const notificationSent = await sendNewContactNotification(contact); return res.status(201).json({ ok: true, emailSent, notificationSent, contact: publicContactMessage(contact) });
});

app.post("/api/account/register", accountLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase();
  const phone = cleanText(req.body.phone, 40); const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!name || !isEmail(email) || Array.from(password).length < 12) return res.status(400).json({ error: "Enter your name, a valid email, and a password with at least 12 characters." });
  if (getCustomerByEmail(email)) return res.status(409).json({ error: "An account already exists for that email address." });
  const now = new Date().toISOString(); const passwordHash = await bcrypt.hash(password, 12);
  database.run("INSERT INTO customers (name, email, phone, password_hash, must_set_password, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)", [name, email, phone, passwordHash, now, now]);
  const customer = getCustomerByEmail(email); const verification = await createEmailVerification(customer); persistDatabase();
  const response = { ok: true, verificationRequired: true, emailSent: Boolean(verification.emailSent), customer: publicCustomer(customer) };
  if (process.env.SMOKE_TEST === "true") response.verificationUrl = verification.url;
  return res.status(201).json(response);
});

app.post("/api/account/login", loginLimiter, async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase(); const password = typeof req.body.password === "string" ? req.body.password : "";
  const customer = getCustomerByEmail(email);
  if (customer?.must_set_password) return res.status(403).json({ error: "Please use the password setup link sent to your email before signing in." });
  if (customer && !customer.email_verified) return res.status(403).json({ error: "Please verify your email before signing in." });
  if (!customer || !(await bcrypt.compare(password, customer.password_hash))) return res.status(401).json({ error: "The email or password is not valid." });
  setCustomerSession(res, customer); return res.json({ ok: true, customer: publicCustomer(customer) });
});
app.get("/api/account/session", requireCustomer, (req, res) => res.json({ ok: true, customer: publicCustomer(req.customer) }));
app.post("/api/account/logout", requireCustomer, (req, res) => { customerSessions.delete(req.customerSession.tokenHash); res.clearCookie("neno_customer", { httpOnly: true, sameSite: "lax", path: "/" }); return res.json({ ok: true }); });
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
app.get("/api/account/verify", verificationLimiter, (req, res) => {
  const token = cleanText(req.query.token, 200); const verification = getEmailVerification(hashToken(token));
  if (!verification || verification.used_at || new Date(verification.expires_at) <= new Date()) return res.status(400).json({ error: "This verification link is invalid or has expired." });
  const now = new Date().toISOString(); database.run("UPDATE customers SET email_verified = 1, updated_at = ? WHERE id = ?", [now, verification.customer_id]); database.run("UPDATE email_verifications SET used_at = ? WHERE id = ?", [now, verification.id]); persistDatabase();
  return res.json({ ok: true });
});
app.post("/api/account/resend-verification", verificationLimiter, async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase(); const response = { ok: true, message: "If an unverified account exists, a new verification email will arrive shortly." }; const customer = getCustomerByEmail(email);
  if (!customer || customer.email_verified || customer.must_set_password) return res.json(response);
  const verification = await createEmailVerification(customer); return res.json({ ...response, emailSent: Boolean(verification.emailSent) });
});
app.post("/api/account/work-orders/:id/consent-link", requireCustomer, async (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket || !customerOwnsTicket(req.customer, ticket)) return res.status(404).json({ error: "Work order not found." });
  const request = await createConsentRequest(ticket, false); if (!request) return res.status(400).json({ error: consentBlockReason(ticket) });
  return res.json({ ok: true, consentUrl: request.url });
});
app.get("/api/account/consent", accountLimiter, (req, res) => getConsentForReview(req, res));
app.post("/api/account/consent", accountLimiter, async (req, res) => submitConsent(req, res));

app.post("/api/tickets", ticketLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase();
  const phone = cleanText(req.body.phone, 40); const assistance = cleanText(req.body.assistance, 2000); const honeypot = cleanText(req.body.company, 100);
  if (honeypot) return res.status(201).json({ ok: true, ticket: { id: "received" } });
  if (!name || !isEmail(email) || !phone || assistance.length < 10) return res.status(400).json({ error: "Please complete each field with valid details." });
  const customer = getCustomerByEmail(email); const customerId = req.customer?.id || customer?.id || null; const now = new Date().toISOString(); const publicId = createWorkOrderId();
  database.run(`INSERT INTO tickets (public_id, customer_id, name, email, phone, assistance, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'contact-needed', ?, ?)`, [publicId, customerId, name, email, phone, assistance, assistance, now, now]);
  persistDatabase(); const ticket = getTicket(publicId); const approval = await createConsentRequest(ticket, true); const notificationSent = await sendNewTicketNotification(ticket);
  return res.status(201).json({ ok: true, emailSent: Boolean(approval?.emailSent), approvalRequired: true, notificationSent, ticket: customerTicket(ticket) });
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const username = cleanText(req.body.username, 80); const password = typeof req.body.password === "string" ? req.body.password : ""; const user = getStaffByUsername(username);
  const valid = Boolean(user?.active && (await bcrypt.compare(password, user.password_hash)));
  if (!valid) return res.status(401).json({ error: "The login details are not valid." }); setAdminSession(res, user); return res.json({ ok: true });
});

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
  const now = new Date().toISOString(); const passwordHash = await bcrypt.hash(password, 12); database.run("UPDATE staff_users SET password_hash = ?, updated_at = ? WHERE id = ?", [passwordHash, now, reset.staff_user_id]); database.run("UPDATE password_resets SET used_at = ? WHERE id = ?", [now, reset.id]); persistDatabase(); sessions.clear(); return res.json({ ok: true });
});

app.get("/api/admin/session", requireAdmin, (req, res) => { const csrfToken = crypto.randomBytes(24).toString("base64url"); req.session.csrfToken = csrfToken; sessions.set(req.session.tokenHash, req.session); return res.json({ ok: true, csrfToken, user: publicStaff(req.staff) }); });
app.post("/api/admin/logout", requireAdmin, requireCsrf, (req, res) => { sessions.delete(req.session.tokenHash); res.clearCookie("neno_admin", { httpOnly: true, sameSite: "strict", path: "/" }); return res.json({ ok: true }); });

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
  database.run(`INSERT INTO tickets (public_id, customer_id, name, email, phone, assistance, notes, repair_notes, client_repair_notes, device_condition, accessories, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'contact-needed', ?, ?)`, [publicId, customer.id, customer.name, customer.email, customer.phone, details.notes, details.notes, details.repairNotes, details.clientRepairNotes, details.deviceCondition, details.accessories, now, now]);
  const ticketId = database.exec("SELECT id FROM tickets WHERE public_id = ?", [publicId])[0].values[0][0];
  replaceWorkOrderServices(ticketId, details.services, now);
  if (details.repairNotes) database.run("INSERT INTO work_order_repair_notes (ticket_id, staff_user_id, note_text, created_at) VALUES (?, ?, ?, ?)", [ticketId, req.staff.id, details.repairNotes, now]);
  persistDatabase(); const ticket = getTicket(publicId); const approval = await createConsentRequest(ticket, true); const notificationSent = await sendNewTicketNotification(ticket);
  return res.status(201).json({ ok: true, emailSent: Boolean(approval?.emailSent), approvalEmailSent: Boolean(approval?.emailSent), notificationSent, approvalBlocked: !approval, workOrder: adminTicket(ticket) });
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
app.delete("/api/admin/work-orders/:id", requireAdmin, requireCsrf, (req, res) => { const ticket = getTicket(req.params.id); if (!ticket) return res.status(404).json({ error: "Work order not found." }); database.run("DELETE FROM work_order_services WHERE ticket_id = ?", [ticket.id]); database.run("DELETE FROM work_order_contact_logs WHERE ticket_id = ?", [ticket.id]); database.run("DELETE FROM work_order_repair_notes WHERE ticket_id = ?", [ticket.id]); database.run("DELETE FROM tickets WHERE id = ?", [ticket.id]); persistDatabase(); return res.json({ ok: true, id: req.params.id }); });

app.get("/api/admin/customers", requireAdmin, (req, res) => res.json({ customers: listCustomers(cleanText(req.query.search, 120)).map(publicCustomer) }));
app.post("/api/admin/customers", requireAdmin, requireCsrf, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase(); const phone = cleanText(req.body.phone, 40);
  if (!name || !isEmail(email)) return res.status(400).json({ error: "Enter a name and valid email." });
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

app.use(express.static(path.join(rootDir, "dist"), { index: "index.html" }));
app.get("*", (_req, res) => res.sendFile(path.join(rootDir, "dist", "index.html")));
app.listen(port, "0.0.0.0", () => { console.log(`Neno's IT repair server listening on ${port}`); if (!getStoredAdminPasswordHash()) console.warn("No staff password is configured; admin login is disabled."); });

function cleanText(value, maxLength) { return typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, maxLength) : ""; }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
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
function customerTicket(ticket) { const notes = ticket.notes || ticket.assistance || ""; const consent = getCurrentConsent(ticket.id); return { id: ticket.public_id, name: ticket.name, email: ticket.email, phone: ticket.phone, assistance: notes, notes, clientRepairNotes: ticket.client_repair_notes || "", deviceCondition: ticket.device_condition || "", accessories: ticket.accessories || "", services: getServicesForTicket(ticket.id), totalCents: getTotalCents(ticket.id), status: ticket.status, consent: safeConsent(consent), consentRequired: !consent?.signed_at, createdAt: ticket.created_at, updatedAt: ticket.updated_at }; }
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
  if (status === "ready-to-start") return res.status(400).json({ error: "Ready to start is set automatically after the customer signs." });
  const details = workOrderDetails(req.body, ticket);
  if (req.body.notes !== undefined && !details.notes) return res.status(400).json({ error: "Notes cannot be empty." });
  if (req.body.deviceCondition !== undefined && !details.deviceCondition) return res.status(400).json({ error: "Device condition cannot be empty." });
  if (status === "completed" && !details.clientRepairNotes) return res.status(400).json({ error: "Client Repair notes are required before completing a work order." });
  if (status === "in-progress" && !getCurrentConsent(ticket.id)?.signed_at) return res.status(409).json({ error: "Customer approval is required before work can begin." });
  const oldServices = getServicesForTicket(ticket.id);
  const servicesChanged = Array.isArray(req.body.services) && JSON.stringify(oldServices) !== JSON.stringify(details.services);
  const customerFacingChanged = (req.body.notes !== undefined && details.notes !== (ticket.notes || ticket.assistance || "")) || (req.body.deviceCondition !== undefined && details.deviceCondition !== (ticket.device_condition || "")) || (req.body.accessories !== undefined && details.accessories !== (ticket.accessories || "")) || servicesChanged;
  const previousConsent = getCurrentConsent(ticket.id); const updatedAt = new Date().toISOString(); const completedAt = status === "completed" ? (ticket.completed_at || updatedAt) : null;
  database.run("UPDATE tickets SET assistance = ?, notes = ?, repair_notes = ?, client_repair_notes = ?, device_condition = ?, accessories = ?, status = ?, completed_at = ?, updated_at = ? WHERE public_id = ?", [details.notes, details.notes, details.repairNotes, details.clientRepairNotes, details.deviceCondition, details.accessories, status, completedAt, updatedAt, ticket.public_id]);
  if (Array.isArray(req.body.services)) replaceWorkOrderServices(ticket.id, details.services, updatedAt);
  if (req.body.repairNotes !== undefined && details.repairNotes && details.repairNotes !== (ticket.repair_notes || "")) database.run("INSERT INTO work_order_repair_notes (ticket_id, staff_user_id, note_text, created_at) VALUES (?, ?, ?, ?)", [ticket.id, req.staff.id, details.repairNotes, updatedAt]);
  if (customerFacingChanged && previousConsent?.signed_at) { revokeConsent(previousConsent.id); database.run("UPDATE tickets SET status = 'contact-needed', completed_at = NULL, updated_at = ? WHERE public_id = ?", [updatedAt, ticket.public_id]); }
  persistDatabase(); const updatedTicket = getTicket(ticket.public_id); let approval = null;
  if (customerFacingChanged && previousConsent?.signed_at) approval = await createConsentRequest(updatedTicket, true, true);
  const emailSent = approval ? Boolean(approval.emailSent) : ticket.status === status ? true : await sendStatusEmail(updatedTicket);
  return res.json({ ok: true, emailSent, approvalRevoked: Boolean(approval), workOrder: adminTicket(getTicket(ticket.public_id)), ticket: adminTicket(getTicket(ticket.public_id)) });
}
function getInvite(tokenHash) { return rowFromQuery("SELECT i.*, c.name, c.email FROM customer_invites i JOIN customers c ON c.id = i.customer_id WHERE i.token_hash = ?", [tokenHash]); }
async function createEmailVerification(customer) { database.run("UPDATE email_verifications SET used_at = COALESCE(used_at, ?) WHERE customer_id = ? AND used_at IS NULL", [new Date().toISOString(), customer.id]); const rawToken = crypto.randomBytes(32).toString("base64url"); const now = new Date(); const url = `${publicBaseUrl}/account/verify?token=${encodeURIComponent(rawToken)}`; database.run("INSERT INTO email_verifications (customer_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)", [customer.id, hashToken(rawToken), new Date(now.getTime() + verificationTtlMs).toISOString(), now.toISOString()]); const emailSent = await sendCustomerVerificationEmail(rawToken, customer); persistDatabase(); return { url, emailSent }; }
async function createCustomerInvitation(customer) { database.run("UPDATE customer_invites SET used_at = COALESCE(used_at, ?) WHERE customer_id = ? AND used_at IS NULL", [new Date().toISOString(), customer.id]); const rawToken = crypto.randomBytes(32).toString("base64url"); const now = new Date(); const url = `${publicBaseUrl}/account/setup?token=${encodeURIComponent(rawToken)}`; database.run("INSERT INTO customer_invites (customer_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)", [customer.id, hashToken(rawToken), new Date(now.getTime() + invitationTtlMs).toISOString(), now.toISOString()]); const emailSent = await sendCustomerInviteEmail(rawToken, customer); persistDatabase(); return { url, emailSent }; }
function listTerms() { return rowsFromQuery("SELECT id, version, body, status, created_at AS createdAt, published_at AS publishedAt FROM terms_documents ORDER BY id DESC"); }
function getPublishedTerms() { return rowFromQuery("SELECT id, version, body, status, created_at, published_at FROM terms_documents WHERE status = 'published' ORDER BY id DESC LIMIT 1"); }
function customerOwnsTicket(customer, ticket) { return ticket.customer_id === customer.id || (ticket.customer_id === null && ticket.email.toLowerCase() === customer.email.toLowerCase()); }
function getCurrentConsent(ticketId) { return rowFromQuery("SELECT * FROM work_order_consents WHERE ticket_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1", [ticketId]); }
function safeConsent(consent) { if (!consent) return { status: "pending" }; return { status: consent.signed_at ? "signed" : "pending", signatureName: consent.signature_name || null, signedAt: consent.signed_at || null, termsVersion: consent.signed_at ? consent.terms_version : null, accessoriesLeft: consent.signed_at ? Boolean(consent.accessories_left) : null, backupRequested: consent.signed_at ? Boolean(consent.backup_requested) : null }; }
function consentDetails(consent) { return { ...safeConsent(consent), id: consent.id, expiresAt: consent.expires_at, termsSnapshot: consent.terms_snapshot, servicesSnapshot: JSON.parse(consent.services_snapshot_json || "[]"), totalCents: Number(consent.total_cents), termsAccepted: Boolean(consent.terms_accepted), electronicRecordsAccepted: Boolean(consent.electronic_records_accepted), accessoriesAcknowledged: Boolean(consent.accessories_acknowledged), revokedAt: consent.revoked_at || null }; }
function approvalServices(ticket) { return getServicesForTicket(ticket.id); }
function consentBlockReason(ticket) { if (!getPublishedTerms()) return "The approval form is not available yet because the current terms have not been published by the shop."; if (approvalServices(ticket).some((service) => !Number.isInteger(service.priceCents) || service.priceCents < 0)) return "The approval form is not available yet because one or more services does not have a confirmed price."; return "The approval form could not be prepared. Please contact the shop."; }
async function createConsentRequest(ticket, sendEmail = true, updated = false) { const terms = getPublishedTerms(); const services = approvalServices(ticket); if (!terms || services.some((service) => !Number.isInteger(service.priceCents) || service.priceCents < 0)) return null; database.run("UPDATE work_order_consents SET revoked_at = COALESCE(revoked_at, ?) WHERE ticket_id = ? AND revoked_at IS NULL", [new Date().toISOString(), ticket.id]); const rawToken = crypto.randomBytes(32).toString("base64url"); const now = new Date(); database.run("INSERT INTO work_order_consents (ticket_id, token_hash, expires_at, terms_version, terms_snapshot, services_snapshot_json, total_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [ticket.id, hashToken(rawToken), new Date(now.getTime() + approvalTtlMs).toISOString(), terms.version, terms.body, JSON.stringify(services), services.reduce((sum, service) => sum + service.priceCents, 0), now.toISOString()]); const consent = getCurrentConsent(ticket.id); const url = `${publicBaseUrl}/orders/consent?token=${encodeURIComponent(rawToken)}`; const emailSent = sendEmail ? await sendWorkOrderApprovalEmail(ticket, consent, terms, updated, url) : false; persistDatabase(); return { url, emailSent, consent };
}
function getConsentByToken(tokenHash) { return rowFromQuery("SELECT c.*, t.public_id, t.name, t.email, t.phone, t.notes, t.assistance, t.device_condition, t.accessories, t.status FROM work_order_consents c JOIN tickets t ON t.id = c.ticket_id WHERE c.token_hash = ?", [tokenHash]); }
function consentReview(consent) { return { workOrder: { id: consent.public_id, name: consent.name, email: consent.email, notes: consent.notes || consent.assistance || "", deviceCondition: consent.device_condition || "", accessories: consent.accessories || "", services: JSON.parse(consent.services_snapshot_json || "[]"), totalCents: Number(consent.total_cents), status: consent.status }, terms: { version: consent.terms_version, body: consent.terms_snapshot }, expiresAt: consent.expires_at, signed: Boolean(consent.signed_at), signatureName: consent.signature_name || null, signedAt: consent.signed_at || null }; }
function getConsentForReview(req, res) { const token = cleanText(req.query.token, 200); const consent = getConsentByToken(hashToken(token)); if (!consent || consent.revoked_at || consent.signed_at || new Date(consent.expires_at) <= new Date()) return res.status(400).json({ error: "This approval link is invalid, expired, or already used." }); return res.json({ ok: true, consent: consentReview(consent) }); }
async function submitConsent(req, res) { const token = cleanText(req.body.token, 200); const consent = getConsentByToken(hashToken(token)); if (!consent || consent.revoked_at || consent.signed_at || new Date(consent.expires_at) <= new Date()) return res.status(400).json({ error: "This approval link is invalid, expired, or already used." }); const signatureName = cleanText(req.body.signatureName, 160); const termsAccepted = req.body.termsAccepted === true; const electronicRecordsAccepted = req.body.electronicRecordsAccepted === true; const accessoriesAcknowledged = req.body.accessoriesAcknowledged === true; const accessoriesLeft = typeof req.body.accessoriesLeft === "boolean" ? req.body.accessoriesLeft : null; const backupRequested = typeof req.body.backupRequested === "boolean" ? req.body.backupRequested : null; if (signatureName.length < 2 || !termsAccepted || !electronicRecordsAccepted || !accessoriesAcknowledged || accessoriesLeft === null || backupRequested === null) return res.status(400).json({ error: "Enter your full legal name and complete each required acknowledgement." }); const now = new Date().toISOString(); database.run("UPDATE work_order_consents SET signature_name = ?, terms_accepted = 1, electronic_records_accepted = 1, accessories_acknowledged = 1, accessories_left = ?, backup_requested = ?, signed_at = ? WHERE id = ?", [signatureName, accessoriesLeft ? 1 : 0, backupRequested ? 1 : 0, now, consent.id]); database.run("UPDATE tickets SET status = 'ready-to-start', updated_at = ? WHERE id = ?", [now, consent.ticket_id]); persistDatabase(); const signedConsent = getCurrentConsent(consent.ticket_id); const ticket = getTicket(consent.public_id); const customerEmailSent = await sendConsentConfirmationEmail(ticket, signedConsent); const ownerEmailSent = await sendConsentNotificationEmail(ticket, signedConsent); return res.json({ ok: true, customerEmailSent, ownerEmailSent, workOrder: customerTicket(ticket) }); }
function revokeConsent(consentId) { database.run("UPDATE work_order_consents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [new Date().toISOString(), consentId]); }
function persistDatabase() { const temporaryPath = `${databasePath}.tmp`; fs.writeFileSync(temporaryPath, Buffer.from(database.export())); fs.renameSync(temporaryPath, databasePath); }
function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function setAdminSession(res, user) { const rawToken = crypto.randomBytes(32).toString("base64url"); sessions.set(hashToken(rawToken), { userId: user.id, expiresAt: Date.now() + sessionTtlMs }); res.cookie("neno_admin", rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: sessionTtlMs, path: "/" }); }
function setCustomerSession(res, customer) { const rawToken = crypto.randomBytes(32).toString("base64url"); customerSessions.set(hashToken(rawToken), { customerId: customer.id, expiresAt: Date.now() + sessionTtlMs }); res.cookie("neno_customer", rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: sessionTtlMs, path: "/" }); }
function requireAdmin(req, res, next) { const rawToken = parseCookie(req.headers.cookie || "").neno_admin; const tokenHash = rawToken ? hashToken(rawToken) : ""; const session = sessions.get(tokenHash); const staff = session ? getStaffById(session.userId) : null; if (!session || !staff?.active || session.expiresAt < Date.now()) { sessions.delete(tokenHash); return res.status(401).json({ error: "Admin login required." }); } req.session = { ...session, tokenHash, expiresAt: Date.now() + sessionTtlMs }; req.staff = staff; sessions.set(tokenHash, req.session); return next(); }
function requireCustomer(req, res, next) { const rawToken = parseCookie(req.headers.cookie || "").neno_customer; const tokenHash = rawToken ? hashToken(rawToken) : ""; const session = customerSessions.get(tokenHash); const customer = session ? rowFromQuery("SELECT * FROM customers WHERE id = ?", [session.customerId]) : null; if (!session || !customer || session.expiresAt < Date.now()) { customerSessions.delete(tokenHash); return res.status(401).json({ error: "Customer login required." }); } req.customerSession = { ...session, tokenHash, expiresAt: Date.now() + sessionTtlMs }; req.customer = customer; customerSessions.set(tokenHash, req.customerSession); return next(); }
function requireCsrf(req, res, next) { const token = req.headers["x-csrf-token"]; if (!token || token !== req.session.csrfToken) return res.status(403).json({ error: "This request could not be verified." }); return next(); }
function parseCookie(header) { return header.split(";").reduce((cookies, part) => { const index = part.indexOf("="); if (index > -1) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1)); return cookies; }, {}); }
async function sendStatusEmail(ticket) { if (!ticket) return false; const transport = createTransport(); if (!transport) return false; const statusText = { "contact-needed": "Contact needed", "ready-to-start": "Ready to start", "in-progress": "In progress", completed: "Completed" }[ticket.status]; const completionNote = ticket.status === "completed" && ticket.client_repair_notes ? ["", "Client Repair notes:", ticket.client_repair_notes].join("\n") : ""; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ticket.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: `Neno's IT repair — ${ticket.public_id} is ${statusText}`, text: [`Hi ${ticket.name}`, "", `Your Neno's IT repair work order ${ticket.public_id} is now: ${statusText}.`, "", statusMessage(ticket.status), completionNote, "", "We will contact you if we need more information.", "", "Neno's IT repair"].join("\n") }); return true; } catch (error) { console.error(`Email failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendCustomerInviteEmail(rawToken, customer) { const transport = createTransport(); if (!transport || !customer?.email) return false; const setupUrl = `${publicBaseUrl}/account/setup?token=${encodeURIComponent(rawToken)}`; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: customer.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno's IT repair — finish setting up your account", text: [`Hi ${customer.name},`, "", "An account has been created for you at Neno's IT repair.", `Set your password here: ${setupUrl}`, "", "This one-time link expires in 48 hours. You must set a password before signing in.", "If you were not expecting this message, you can ignore it.", "", "Neno's IT repair"].join("\n") }); return true; } catch (error) { console.error(`Customer invitation failed for ${customer.email}:`, error.message); return false; } }
async function sendCustomerVerificationEmail(rawToken, customer) { const transport = createTransport(); if (!transport || !customer?.email) return false; const verificationUrl = `${publicBaseUrl}/account/verify?token=${encodeURIComponent(rawToken)}`; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: customer.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno's IT repair — verify your email", text: [`Hi ${customer.name},`, "", "Please verify your email address to finish creating your Neno's IT repair account.", `Verify your email here: ${verificationUrl}`, "", "This one-time link expires in 24 hours. You must verify your email before signing in.", "If you did not create this account, you can ignore this message.", "", "Neno's IT repair"].join("\n") }); return true; } catch (error) { console.error(`Customer verification failed for ${customer.email}:`, error.message); return false; } }
async function sendContactAcknowledgementEmail(contact) { const transport = createTransport(); if (!transport || !contact?.email) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: contact.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno's IT repair — we received your message", text: [`Hi ${contact.name},`, "", "We received your message and will get back to you.", `Reference: ${contact.contact_id}`, "", "This is a contact request, not a repair work order. A separate work order will be sent if service is needed.", "", "Neno's IT repair"].join("\n") }); return true; } catch (error) { console.error(`Contact acknowledgement failed for ${contact.email}:`, error.message); return false; } }
async function sendNewContactNotification(contact) { if (!contact || !adminEmail) return false; const transport = createTransport(); if (!transport) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: adminEmail, replyTo: contact.email, subject: `New contact request — ${contact.contact_id}`, text: ["A new contact request was submitted.", "", `Reference: ${contact.contact_id}`, `Name: ${contact.name}`, `Email: ${contact.email}`, `Phone: ${contact.phone}`, "", "Message:", contact.message, "", `Review contact requests: ${publicBaseUrl}/admin`].join("\n") }); return true; } catch (error) { console.error(`New contact notification failed for ${contact.contact_id}:`, error.message); return false; } }
async function sendWorkOrderApprovalEmail(ticket, consent, terms, updated, approvalUrl) { const transport = createTransport(); if (!transport || !ticket?.email) return false; const serviceLines = JSON.parse(consent.services_snapshot_json || "[]").map((service) => `- ${service.name}: ${formatMoney(service.priceCents)}`).join("\n") || "- No services listed"; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ticket.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: `Neno's IT repair — ${updated ? "updated approval needed" : "review work order"} ${ticket.public_id}`, text: [`Hi ${ticket.name},`, "", `${updated ? "The work order has changed and needs your approval again." : "Your work order is ready for your review."}`, `Work order: ${ticket.public_id}`, "", "Notes:", ticket.notes || ticket.assistance || "", "", "Services and prices:", serviceLines, `Quoted service total: ${formatMoney(consent.total_cents)}`, "", "Device condition:", ticket.device_condition || "Not recorded", "", "Accessories recorded by the shop:", ticket.accessories || "None recorded", "", "Repairs will not begin until you complete the approval.", `Review and sign: ${approvalUrl}`, "", `Terms and liability policy (${terms.version}):`, terms.body, "", "Neno's IT repair"].join("\n") }); return true; } catch (error) { console.error(`Approval email failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendConsentConfirmationEmail(ticket, consent) { const transport = createTransport(); if (!transport) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ticket.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: `Neno's IT repair — approval received for ${ticket.public_id}`, text: [`Hi ${ticket.name},`, "", `Your approval for work order ${ticket.public_id} was received.`, `Signed by: ${consent.signature_name}`, `Signed at: ${consent.signed_at}`, `Accessories left: ${consent.accessories_left ? "Yes" : "No"}`, `Data backup requested: ${consent.backup_requested ? "Yes" : "No"}`, "", "The order is now Ready to start. We will contact you with further updates.", "", "Neno's IT repair"].join("\n") }); return true; } catch (error) { console.error(`Consent confirmation failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendConsentNotificationEmail(ticket, consent) { const transport = createTransport(); if (!transport || !adminEmail) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: adminEmail, replyTo: ticket.email, subject: `Signed approval received — ${ticket.public_id}`, text: [`Customer approval received for ${ticket.public_id}.`, "", `Customer: ${ticket.name}`, `Email: ${ticket.email}`, `Signature: ${consent.signature_name}`, `Signed at: ${consent.signed_at}`, `Accessories left: ${consent.accessories_left ? "Yes" : "No"}`, `Data backup requested: ${consent.backup_requested ? "Yes" : "No"}`, "", `Review the order: ${publicBaseUrl}/admin`].join("\n") }); return true; } catch (error) { console.error(`Owner consent notification failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendNewTicketNotification(ticket) { if (!ticket || !adminEmail) return false; const transport = createTransport(); if (!transport) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: adminEmail, replyTo: ticket.email, subject: `New repair request — ${ticket.public_id}`, text: ["A new Neno's IT repair work order was submitted.", "", `Work order: ${ticket.public_id}`, `Name: ${ticket.name}`, `Email: ${ticket.email}`, `Phone: ${ticket.phone}`, "", "Request:", ticket.assistance, "", `Review work orders: ${publicBaseUrl}/admin`].join("\n") }); return true; } catch (error) { console.error(`New ticket notification failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendPasswordResetEmail(rawToken, user) { const transport = createTransport(); if (!transport || !user?.email) return false; const resetUrl = `${publicBaseUrl}/admin/reset?token=${encodeURIComponent(rawToken)}`; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: user.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno's IT repair — reset your admin password", text: ["A password reset was requested for your Neno's IT repair admin account.", "", `Reset your password here: ${resetUrl}`, "", "This link expires in 30 minutes and can only be used once.", "If you did not request this, you can ignore this email."].join("\n") }); return true; } catch (error) { console.error("Password reset email failed:", error.message); return false; } }
function statusMessage(status) { if (status === "contact-needed") return "We have your request and will contact you to confirm the next step."; if (status === "ready-to-start") return "We received your signed approval. The order is ready for the service team to begin."; if (status === "in-progress") return "Your device or service request is being worked on now."; return "Your repair or service request is complete. We will follow up with pickup or delivery details."; }
function formatMoney(cents) { return Number.isInteger(Number(cents)) ? `$${(Number(cents) / 100).toFixed(2)}` : "Price to be confirmed"; }
function createTransport() { if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null; return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }); }
