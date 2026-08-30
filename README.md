# Neno's IT repair

Customer intake and private work-order management for data transfers, PC tune-ups, custom builds, and repair work.

## Local development

```powershell
npm install
npm run build
npm run start
```

The customer site is served at `http://localhost:3001/`. The private admin portal is at `http://localhost:3001/admin`.

Customers can create an account from the Account section on the public site. Accounts are optional when submitting a request, but signed-in customers can see their work orders and status. Work-order numbers use `#MM/YY/DD-0001` format.

## Server configuration

Copy `.env.example` to `.env.production` on the server and set real values. `ADMIN_PASSWORD_HASH` must be a bcrypt hash; never put a plain password in the environment or source code. On first startup, the environment-backed admin is migrated into the staff account table as the owner account. From the admin portal, the owner can create and edit staff access and customer accounts. SMTP values are required for client status emails, new-work-order notifications, and admin password-reset links. `ADMIN_EMAIL` receives a notification whenever someone submits a new request; if omitted, it falls back to `SMTP_USER`.

Generate a password hash with:

```powershell
node -e "import('bcryptjs').then(({default:bcrypt}) => bcrypt.hash(process.argv[1], 12).then(console.log))" "use-a-long-unique-password"
```

Customers, staff accounts, and work orders are stored in `/data/tickets.sqlite`, which should be kept on the server's persistent application-data volume and backed up with the rest of the service data.

## Deployment

Run `bash scripts/deploy-unraid.sh` on the server from the project directory. The service listens on `127.0.0.1:8095` and is intended to sit behind Caddy and Cloudflare.
