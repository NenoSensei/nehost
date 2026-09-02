import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";

const [username, flag, confirmation] = process.argv.slice(2);
if (!username || flag !== "--confirm" || confirmation !== username) {
  console.error("Usage: node scripts/reset-staff-mfa.mjs <username> --confirm <same-username>");
  process.exit(2);
}
const dataDir = process.env.DATA_DIR;
if (!dataDir) { console.error("DATA_DIR must identify the application data directory."); process.exit(2); }
const databasePath = path.resolve(dataDir, "tickets.sqlite");
if (!fs.existsSync(databasePath)) { console.error(`Database not found: ${databasePath}`); process.exit(2); }
const SQL = await initSqlJs({ locateFile: (file) => path.resolve("node_modules/sql.js/dist", file) });
const database = new SQL.Database(fs.readFileSync(databasePath));
const result = database.exec("SELECT id, username FROM staff_users WHERE username = ? COLLATE NOCASE", [username]);
if (!result.length || !result[0].values.length) { console.error("Staff username not found."); process.exit(1); }
const staffId = result[0].values[0][0]; const now = new Date().toISOString();
database.run("DELETE FROM staff_passkeys WHERE staff_user_id = ?", [staffId]);
database.run("DELETE FROM staff_totp WHERE staff_user_id = ?", [staffId]);
database.run("DELETE FROM auth_sessions WHERE principal_type = 'admin' AND principal_id = ?", [staffId]);
database.run("DELETE FROM auth_challenges WHERE staff_user_id = ?", [staffId]);
database.run("INSERT INTO security_events (event_type, principal_type, principal_id, details_json, created_at) VALUES ('emergency-mfa-reset', 'staff', ?, ?, ?)", [staffId, JSON.stringify({ confirmedUsername: username, source: "direct-server-command" }), now]);
const temporaryPath = `${databasePath}.tmp`; fs.writeFileSync(temporaryPath, Buffer.from(database.export()), { mode: 0o600 }); fs.chmodSync(temporaryPath, 0o600); fs.renameSync(temporaryPath, databasePath); fs.chmodSync(databasePath, 0o600);
console.log(`MFA reset recorded for ${username}. The account must enroll both a passkey and TOTP at next sign-in.`);
