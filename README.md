# Neno’s IT Repair

Philadelphia computer-service website, optional Customer Portal, and private staff operations hub.

## Hosts

- `repair.nenosensei.com` serves public pages, customer accounts, approvals, and customer APIs.
- `staff.nenosensei.com` serves the staff hub, repair administration, policies, retention, and admin APIs.
- Production rejects unknown hosts. Public admin pages and APIs return 404 and never reveal the staff hostname.

The staff hostname is DNS-only on a private LAN address and is reachable only at home or through the advertised Tailscale `/32`. It is not part of the public Cloudflare Tunnel. See `infra/staff-proxy/README.md`.

## Authentication and data

Staff sign-in requires a password and passkey or TOTP. Every staff account must enroll both methods. TOTP secrets are AES-256-GCM encrypted with `MFA_ENCRYPTION_KEY`. Customer and staff sessions are hashed, durable SQLite records with separate idle and absolute expirations. Cookie-authenticated mutations require CSRF and exact-origin checks.

The SQLite database and local rollback copies are mode `0600` in a mode `0700` data directory. Encrypted off-host backup retention is documented by the existing backup task. The staff health panel accepts only a signed backup result heartbeat; it cannot call arbitrary URLs.

## Local validation

```powershell
npm ci
npx playwright install chromium
npm run check
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

`npm run check` covers lint, server syntax, production build, host/security integration, work-order transitions and closure, retention guards, and automated WCAG checks for public and staff entry routes.

## Production configuration

Copy `.env.example` to the server’s protected `.env.production` and fill the existing SMTP/admin values plus independent random `MFA_ENCRYPTION_KEY` and `BACKUP_HEARTBEAT_KEY` values. Never commit those values. The deployment script takes a pre-migration database copy, preserves mode `0600`, tags the previous image for rollback, and refuses deployment without the new security secrets.

The direct-server emergency command intentionally requires the username twice:

```bash
DATA_DIR=/mnt/user/appdata/nenos-it-repair/data node scripts/reset-staff-mfa.mjs employee --confirm employee
```

It removes only that staff account’s MFA credentials and sessions and writes a security audit event. There is no public or email-only MFA bypass.
