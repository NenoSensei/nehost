# NeHost Site

Marketing site for NeHost, a website creation and hosting service.

## Local Development

```powershell
npm install
npm run dev
```

The production build uses relative asset paths so it works at the GitHub Pages project URL and the custom domain.

## GitHub Pages

Pushing to `main` deploys the built site through GitHub Pages. The expected public URL is:

```text
https://nehost.nenosensei.com/
```

## Contact Form

The contact form submits in-page through a configurable email form endpoint. By default, it posts to FormSubmit's AJAX endpoint for `nehost@nenosensei.com` and sends structured project details.

Set the production inbox with:

```powershell
$env:VITE_CONTACT_EMAIL="you@example.com"
npm run build
```

Set a different provider endpoint with:

```powershell
$env:VITE_CONTACT_FORM_ENDPOINT="https://example.com/contact-endpoint"
npm run build
```

If no value is provided, the public email defaults to `nehost@nenosensei.com`.

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
