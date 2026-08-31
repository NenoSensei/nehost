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
    password_hash TEXT NOT NULL,
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
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);
ensureColumn("tickets", "customer_id", "INTEGER");
ensureColumn("tickets", "notes", "TEXT NOT NULL DEFAULT ''");
ensureColumn("tickets", "repair_notes", "TEXT NOT NULL DEFAULT ''");
ensureColumn("tickets", "device_condition", "TEXT NOT NULL DEFAULT ''");
ensureColumn("tickets", "accessories", "TEXT NOT NULL DEFAULT ''");
ensureColumn("password_resets", "staff_user_id", "INTEGER");
database.run("UPDATE tickets SET notes = assistance WHERE notes = '' AND assistance <> ''");
database.run("CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id)");
database.run("CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at)");
database.run("CREATE INDEX IF NOT EXISTS idx_work_order_services_ticket_id ON work_order_services(ticket_id)");
database.run("CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email COLLATE NOCASE)");
database.run("CREATE INDEX IF NOT EXISTS idx_staff_username ON staff_users(username COLLATE NOCASE)");
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
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many reset requests. Please try again later." } });
const validStatuses = new Set(["contact-needed", "in-progress", "completed"]);
const validRoles = new Set(["owner", "admin"]);

app.get("/health", (_req, res) => res.type("text").send("ok\n"));

app.post("/api/account/register", accountLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase();
  const phone = cleanText(req.body.phone, 40); const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!name || !isEmail(email) || Array.from(password).length < 12) return res.status(400).json({ error: "Enter your name, a valid email, and a password with at least 12 characters." });
  if (getCustomerByEmail(email)) return res.status(409).json({ error: "An account already exists for that email address." });
  const now = new Date().toISOString(); const passwordHash = await bcrypt.hash(password, 12);
  database.run("INSERT INTO customers (name, email, phone, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [name, email, phone, passwordHash, now, now]);
  persistDatabase(); const customer = getCustomerByEmail(email); setCustomerSession(res, customer);
  return res.status(201).json({ ok: true, customer: publicCustomer(customer) });
});

app.post("/api/account/login", loginLimiter, async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase(); const password = typeof req.body.password === "string" ? req.body.password : "";
  const customer = getCustomerByEmail(email);
  if (!customer || !(await bcrypt.compare(password, customer.password_hash))) return res.status(401).json({ error: "The email or password is not valid." });
  setCustomerSession(res, customer); return res.json({ ok: true, customer: publicCustomer(customer) });
});
app.get("/api/account/session", requireCustomer, (req, res) => res.json({ ok: true, customer: publicCustomer(req.customer) }));
app.post("/api/account/logout", requireCustomer, (req, res) => { customerSessions.delete(req.customerSession.tokenHash); res.clearCookie("neno_customer", { httpOnly: true, sameSite: "lax", path: "/" }); return res.json({ ok: true }); });
app.get("/api/account/work-orders", requireCustomer, (req, res) => res.json({ workOrders: listWorkOrdersForCustomer(req.customer.id).map(customerTicket) }));

app.post("/api/tickets", ticketLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase();
  const phone = cleanText(req.body.phone, 40); const assistance = cleanText(req.body.assistance, 2000); const honeypot = cleanText(req.body.company, 100);
  if (honeypot) return res.status(201).json({ ok: true, ticket: { id: "received" } });
  if (!name || !isEmail(email) || !phone || assistance.length < 10) return res.status(400).json({ error: "Please complete each field with valid details." });
  const customer = getCustomerByEmail(email); const customerId = req.customer?.id || customer?.id || null; const now = new Date().toISOString(); const publicId = createWorkOrderId();
  database.run(`INSERT INTO tickets (public_id, customer_id, name, email, phone, assistance, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'contact-needed', ?, ?)`, [publicId, customerId, name, email, phone, assistance, assistance, now, now]);
  persistDatabase(); const ticket = getTicket(publicId); const emailSent = await sendStatusEmail(ticket); const notificationSent = await sendNewTicketNotification(ticket);
  return res.status(201).json({ ok: true, emailSent, notificationSent, ticket: customerTicket(ticket) });
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
  database.run(`INSERT INTO tickets (public_id, customer_id, name, email, phone, assistance, notes, repair_notes, device_condition, accessories, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'contact-needed', ?, ?)`, [publicId, customer.id, customer.name, customer.email, customer.phone, details.notes, details.notes, details.repairNotes, details.deviceCondition, details.accessories, now, now]);
  const ticketId = database.exec("SELECT id FROM tickets WHERE public_id = ?", [publicId])[0].values[0][0];
  replaceWorkOrderServices(ticketId, details.services, now);
  persistDatabase(); const ticket = getTicket(publicId); const emailSent = await sendStatusEmail(ticket); const notificationSent = await sendNewTicketNotification(ticket);
  return res.status(201).json({ ok: true, emailSent, notificationSent, workOrder: adminTicket(ticket) });
});
app.patch("/api/admin/work-orders/:id", requireAdmin, requireCsrf, updateWorkOrder);
app.patch("/api/admin/tickets/:id", requireAdmin, requireCsrf, updateWorkOrder);
app.delete("/api/admin/work-orders/:id", requireAdmin, requireCsrf, (req, res) => { const ticket = getTicket(req.params.id); if (!ticket) return res.status(404).json({ error: "Work order not found." }); database.run("DELETE FROM work_order_services WHERE ticket_id = ?", [ticket.id]); database.run("DELETE FROM tickets WHERE id = ?", [ticket.id]); persistDatabase(); return res.json({ ok: true, id: req.params.id }); });

app.get("/api/admin/customers", requireAdmin, (req, res) => res.json({ customers: listCustomers(cleanText(req.query.search, 120)).map(publicCustomer) }));
app.post("/api/admin/customers", requireAdmin, requireCsrf, async (req, res) => {
  const name = cleanText(req.body.name, 100); const email = cleanText(req.body.email, 254).toLowerCase(); const phone = cleanText(req.body.phone, 40); const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!name || !isEmail(email) || Array.from(password).length < 12) return res.status(400).json({ error: "Enter a name, valid email, and password with at least 12 characters." });
  if (getCustomerByEmail(email)) return res.status(409).json({ error: "That email is already in use." });
  const now = new Date().toISOString(); const passwordHash = await bcrypt.hash(password, 12); database.run("INSERT INTO customers (name, email, phone, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [name, email, phone, passwordHash, now, now]); persistDatabase(); return res.status(201).json({ ok: true, customer: publicCustomer(getCustomerByEmail(email)) });
});
app.patch("/api/admin/customers/:id", requireAdmin, requireCsrf, async (req, res) => {
  const customer = getCustomerById(req.params.id); if (!customer) return res.status(404).json({ error: "Customer account not found." }); const name = cleanText(req.body.name, 100) || customer.name; const email = cleanText(req.body.email, 254).toLowerCase() || customer.email; const phone = cleanText(req.body.phone, 40); const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!isEmail(email) || (password && Array.from(password).length < 12)) return res.status(400).json({ error: "Use a valid email and, if changing the password, at least 12 characters." }); const passwordHash = password ? await bcrypt.hash(password, 12) : customer.password_hash;
  try { database.run("UPDATE customers SET name = ?, email = ?, phone = ?, password_hash = ?, updated_at = ? WHERE id = ?", [name, email, phone, passwordHash, new Date().toISOString(), customer.id]); } catch { return res.status(409).json({ error: "That email is already in use." }); } persistDatabase(); return res.json({ ok: true, customer: publicCustomer(getCustomerById(customer.id)) });
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
function createWorkOrderId() { const next = Number(database.exec("SELECT COALESCE(MAX(id), 0) + 1 FROM tickets")[0]?.values[0]?.[0] || 1); const date = new Date(); return `#${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}/${String(date.getDate()).padStart(2, "0")}-${String(next).padStart(4, "0")}`; }
function getTicket(publicId) { return rowFromQuery("SELECT * FROM tickets WHERE public_id = ?", [publicId]); }
function listWorkOrders(search = "") { if (!search) return rowsFromQuery("SELECT * FROM tickets ORDER BY updated_at DESC"); const term = `%${search}%`; return rowsFromQuery("SELECT * FROM tickets WHERE public_id LIKE ? COLLATE NOCASE OR name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE OR phone LIKE ? COLLATE NOCASE OR assistance LIKE ? COLLATE NOCASE OR notes LIKE ? COLLATE NOCASE OR device_condition LIKE ? COLLATE NOCASE OR accessories LIKE ? COLLATE NOCASE OR status LIKE ? COLLATE NOCASE ORDER BY updated_at DESC", [term, term, term, term, term, term, term, term, term]); }
function listWorkOrdersForCustomer(customerId) { return rowsFromQuery("SELECT * FROM tickets WHERE customer_id = ? OR (customer_id IS NULL AND email = (SELECT email FROM customers WHERE id = ?)) ORDER BY updated_at DESC", [customerId, customerId]); }
function rowFromQuery(query, params = []) { const result = database.exec(query, params); return result.length ? rowToObject(result[0].columns, result[0].values[0]) : null; }
function rowsFromQuery(query, params = []) { const result = database.exec(query, params); return result.length ? result[0].values.map((row) => rowToObject(result[0].columns, row)) : []; }
function rowToObject(columns, row) { return columns.reduce((object, column, index) => ({ ...object, [column]: row[index] }), {}); }
function customerTicket(ticket) { const notes = ticket.notes || ticket.assistance || ""; return { id: ticket.public_id, name: ticket.name, email: ticket.email, phone: ticket.phone, assistance: notes, notes, deviceCondition: ticket.device_condition || "", accessories: ticket.accessories || "", services: getServicesForTicket(ticket.id), status: ticket.status, createdAt: ticket.created_at, updatedAt: ticket.updated_at }; }
function adminTicket(ticket) { return { ...customerTicket(ticket), repairNotes: ticket.repair_notes || "" }; }
function getCustomerByEmail(email) { return rowFromQuery("SELECT * FROM customers WHERE email = ? COLLATE NOCASE", [email]); }
function getCustomerById(id) { return rowFromQuery("SELECT * FROM customers WHERE id = ?", [id]); }
function listCustomers(search = "") { const where = search ? "WHERE c.name LIKE ? COLLATE NOCASE OR c.email LIKE ? COLLATE NOCASE OR c.phone LIKE ? COLLATE NOCASE" : ""; const term = `%${search}%`; return rowsFromQuery(`SELECT c.*, COUNT(t.id) AS work_order_count FROM customers c LEFT JOIN tickets t ON t.customer_id = c.id ${where} GROUP BY c.id ORDER BY c.name COLLATE NOCASE`, search ? [term, term, term] : []); }
function publicCustomer(customer) { return { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, workOrderCount: Number(customer.work_order_count || 0), createdAt: customer.created_at }; }
function getStaffById(id) { return rowFromQuery("SELECT * FROM staff_users WHERE id = ?", [id]); }
function getStaffByUsername(username) { return rowFromQuery("SELECT * FROM staff_users WHERE username = ? COLLATE NOCASE", [username]); }
function getStaffByEmail(email) { return rowFromQuery("SELECT * FROM staff_users WHERE email = ? COLLATE NOCASE", [email]); }
function getStaffByIdentifier(identifier) { return getStaffByUsername(identifier) || getStaffByEmail(identifier); }
function listStaff() { return rowsFromQuery("SELECT * FROM staff_users ORDER BY active DESC, name COLLATE NOCASE"); }
function publicStaff(user) { return { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, active: Boolean(user.active), createdAt: user.created_at, updatedAt: user.updated_at }; }
function workOrderDetails(input = {}, existing = null) { const notes = input.notes === undefined ? (existing?.notes || existing?.assistance || "") : cleanText(input.notes, 4000); const repairNotes = input.repairNotes === undefined ? (existing?.repair_notes || "") : cleanText(input.repairNotes, 8000); const deviceCondition = input.deviceCondition === undefined ? (existing?.device_condition || "") : cleanText(input.deviceCondition, 3000); const accessories = input.accessories === undefined ? (existing?.accessories || "") : cleanText(input.accessories, 2000); const services = Array.isArray(input.services) ? normalizeServices(input.services) : existing ? getServicesForTicket(existing.id) : []; return { notes, repairNotes, deviceCondition, accessories, services }; }
function normalizeServices(services) { return [...new Set(services.filter((service) => typeof service === "string").map((service) => cleanText(service, 120)).filter(Boolean))].slice(0, 20); }
function getServicesForTicket(ticketId) { return rowsFromQuery("SELECT service_name FROM work_order_services WHERE ticket_id = ? ORDER BY sort_order, id", [ticketId]).map((row) => row.service_name); }
function replaceWorkOrderServices(ticketId, services, createdAt) { database.run("DELETE FROM work_order_services WHERE ticket_id = ?", [ticketId]); services.forEach((service, index) => database.run("INSERT INTO work_order_services (ticket_id, service_name, sort_order, created_at) VALUES (?, ?, ?, ?)", [ticketId, service, index, createdAt])); }
async function updateWorkOrder(req, res) { const ticket = getTicket(req.params.id); if (!ticket) return res.status(404).json({ error: "Work order not found." }); const status = req.body.status === undefined ? ticket.status : cleanText(req.body.status, 30); if (!validStatuses.has(status)) return res.status(400).json({ error: "That work order status is not available." }); const details = workOrderDetails(req.body, ticket); if (req.body.notes !== undefined && !details.notes) return res.status(400).json({ error: "Notes cannot be empty." }); if (req.body.deviceCondition !== undefined && !details.deviceCondition) return res.status(400).json({ error: "Device condition cannot be empty." }); const updatedAt = new Date().toISOString(); database.run("UPDATE tickets SET assistance = ?, notes = ?, repair_notes = ?, device_condition = ?, accessories = ?, status = ?, updated_at = ? WHERE public_id = ?", [details.notes, details.notes, details.repairNotes, details.deviceCondition, details.accessories, status, updatedAt, ticket.public_id]); if (Array.isArray(req.body.services)) replaceWorkOrderServices(ticket.id, details.services, updatedAt); persistDatabase(); const updatedTicket = getTicket(ticket.public_id); const emailSent = ticket.status === status ? true : await sendStatusEmail(updatedTicket); return res.json({ ok: true, emailSent, workOrder: adminTicket(updatedTicket), ticket: adminTicket(updatedTicket) }); }
function persistDatabase() { const temporaryPath = `${databasePath}.tmp`; fs.writeFileSync(temporaryPath, Buffer.from(database.export())); fs.renameSync(temporaryPath, databasePath); }
function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function setAdminSession(res, user) { const rawToken = crypto.randomBytes(32).toString("base64url"); sessions.set(hashToken(rawToken), { userId: user.id, expiresAt: Date.now() + sessionTtlMs }); res.cookie("neno_admin", rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: sessionTtlMs, path: "/" }); }
function setCustomerSession(res, customer) { const rawToken = crypto.randomBytes(32).toString("base64url"); customerSessions.set(hashToken(rawToken), { customerId: customer.id, expiresAt: Date.now() + sessionTtlMs }); res.cookie("neno_customer", rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: sessionTtlMs, path: "/" }); }
function requireAdmin(req, res, next) { const rawToken = parseCookie(req.headers.cookie || "").neno_admin; const tokenHash = rawToken ? hashToken(rawToken) : ""; const session = sessions.get(tokenHash); const staff = session ? getStaffById(session.userId) : null; if (!session || !staff?.active || session.expiresAt < Date.now()) { sessions.delete(tokenHash); return res.status(401).json({ error: "Admin login required." }); } req.session = { ...session, tokenHash, expiresAt: Date.now() + sessionTtlMs }; req.staff = staff; sessions.set(tokenHash, req.session); return next(); }
function requireCustomer(req, res, next) { const rawToken = parseCookie(req.headers.cookie || "").neno_customer; const tokenHash = rawToken ? hashToken(rawToken) : ""; const session = customerSessions.get(tokenHash); const customer = session ? rowFromQuery("SELECT * FROM customers WHERE id = ?", [session.customerId]) : null; if (!session || !customer || session.expiresAt < Date.now()) { customerSessions.delete(tokenHash); return res.status(401).json({ error: "Customer login required." }); } req.customerSession = { ...session, tokenHash, expiresAt: Date.now() + sessionTtlMs }; req.customer = customer; customerSessions.set(tokenHash, req.customerSession); return next(); }
function requireCsrf(req, res, next) { const token = req.headers["x-csrf-token"]; if (!token || token !== req.session.csrfToken) return res.status(403).json({ error: "This request could not be verified." }); return next(); }
function parseCookie(header) { return header.split(";").reduce((cookies, part) => { const index = part.indexOf("="); if (index > -1) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1)); return cookies; }, {}); }
async function sendStatusEmail(ticket) { if (!ticket) return false; const transport = createTransport(); if (!transport) return false; const statusText = { "contact-needed": "Contact needed", "in-progress": "In progress", completed: "Completed" }[ticket.status]; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ticket.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: `Neno's IT repair — ${ticket.public_id} is ${statusText}`, text: [`Hi ${ticket.name},`, "", `Your Neno's IT repair work order ${ticket.public_id} is now: ${statusText}.`, "", statusMessage(ticket.status), "", "We will contact you if we need more information.", "", "Neno's IT repair"].join("\n") }); return true; } catch (error) { console.error(`Email failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendNewTicketNotification(ticket) { if (!ticket || !adminEmail) return false; const transport = createTransport(); if (!transport) return false; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: adminEmail, replyTo: ticket.email, subject: `New repair request — ${ticket.public_id}`, text: ["A new Neno's IT repair work order was submitted.", "", `Work order: ${ticket.public_id}`, `Name: ${ticket.name}`, `Email: ${ticket.email}`, `Phone: ${ticket.phone}`, "", "Request:", ticket.assistance, "", `Review work orders: ${publicBaseUrl}/admin`].join("\n") }); return true; } catch (error) { console.error(`New ticket notification failed for ${ticket.public_id}:`, error.message); return false; } }
async function sendPasswordResetEmail(rawToken, user) { const transport = createTransport(); if (!transport || !user?.email) return false; const resetUrl = `${publicBaseUrl}/admin/reset?token=${encodeURIComponent(rawToken)}`; try { await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: user.email, replyTo: process.env.REPAIR_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER, subject: "Neno's IT repair — reset your admin password", text: ["A password reset was requested for your Neno's IT repair admin account.", "", `Reset your password here: ${resetUrl}`, "", "This link expires in 30 minutes and can only be used once.", "If you did not request this, you can ignore this email."].join("\n") }); return true; } catch (error) { console.error("Password reset email failed:", error.message); return false; } }
function statusMessage(status) { if (status === "contact-needed") return "We have your request and will contact you to confirm the next step."; if (status === "in-progress") return "Your device or service request is being worked on now."; return "Your repair or service request is complete. We will follow up with pickup or delivery details."; }
function createTransport() { if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null; return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }); }
