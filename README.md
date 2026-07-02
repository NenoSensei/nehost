# NeHost Site

Marketing site for NeHost, a website creation and hosting service.

## Local Development

```powershell
npm install
npm run dev
```

The production build uses `/nehost/` as its base path so it can be served from `https://nenosensei.com/nehost/` or GitHub Pages at `/nehost/`.

## Contact Email

The contact form opens a prefilled email. Set the production inbox with:

```powershell
$env:VITE_CONTACT_EMAIL="you@example.com"
npm run build
```

If no value is provided, it defaults to `hello@nehost.com`.

## Build

```powershell
npm run build
```

## Server Deploy

On `jt-server`, this repo can be deployed with:

```bash
bash scripts/deploy-unraid.sh
```

The container listens on port `8080` internally and exposes host health at `127.0.0.1:8095/health`.
