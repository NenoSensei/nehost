# Neno's IT repair

Customer intake and private work-order management for data transfers, PC tune-ups, custom builds, repair work, PC cleaning, and training.

## Local development

```powershell
npm install
npm run build
npm run start
```

The customer site is served at `http://localhost:3001/`. The private admin portal is at `http://localhost:3001/admin`.

Customers can create an account from the Account section or sign in through the separate Orders page. Accounts are optional when submitting a request. Admin-created accounts receive a one-time password setup link that expires after 48 hours. Signed-in customers can see their work orders, notes, device condition, accessories, selected services, prices, approval details, and status. Work-order numbers use `#MM/YY/DD-0001` format.

Authorized staff can search customer accounts in the admin portal, create work orders for an existing customer, and edit the Notes, internal Repair notes, device condition, accessories, services, prices, and status. Services are stored as ordered line items in integer cents and can be added, removed, repriced, or replaced with custom services. Repair notes are restricted to admin staff and are not returned to customer accounts.

Orders remain Contact needed until the customer reviews the current terms, chooses the accessory and backup options, and signs electronically. The signed order stores the accepted policy text, service-price snapshot, signature name, and timestamp. Admin staff can then move it to In progress. Changing customer-facing order details revokes the old approval and requests a new signature.

The owner can publish versioned terms from the Terms section of the admin portal. The seeded policy is a draft for business-owner and qualified legal review; approval emails are not sent until a published version exists. Customers can print or save the policy from the approval page.

## Server configuration

Copy `.env.example` to `.env.production` on the server and set real values. `ADMIN_PASSWORD_HASH` must be a bcrypt hash; never put a plain password in the environment or source code. On first startup, the environment-backed admin is migrated into the staff account table as the owner account. From the admin portal, the owner can create and edit staff access, customer accounts, and terms. SMTP values are required for invitation emails, work-order approval emails, signed-approval confirmations, client status emails, new-work-order notifications, and admin password-reset links. `ADMIN_EMAIL` receives new-request and signed-approval notifications; if omitted, it falls back to `SMTP_USER`. Email failures do not discard saved records.

Generate a password hash with:

```powershell
node -e "import('bcryptjs').then(({default:bcrypt}) => bcrypt.hash(process.argv[1], 12).then(console.log))" "use-a-long-unique-password"
```

Customers, staff accounts, and work orders are stored in `/data/tickets.sqlite`, which should be kept on the server's persistent application-data volume and backed up with the rest of the service data.

## Deployment

Run `bash scripts/deploy-unraid.sh` on the server from the project directory. The service listens on `127.0.0.1:8095` and is intended to sit behind Caddy and Cloudflare.
