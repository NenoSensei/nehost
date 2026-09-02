# Private staff proxy

`staff.nenosensei.com` is intentionally not part of the public Cloudflare Tunnel. Deploy this Caddy image on a verified-unused static LAN address attached to Unraid `br0`, and also attach it to `nenosensei-edge` so it can reach `nenos-it-repair:8080`.

The DNS record must be DNS-only and point to that private LAN address. Advertise only that address as a `/32` through Tailscale. The Cloudflare token is used solely for DNS-01 certificate issuance and must be restricted to Zone DNS Edit plus Zone Read for `nenosensei.com`.

Unraid isolates the host from containers attached directly to `br0`. Run `configure-host-route.sh` at boot to create a narrow macvlan shim for only the staff proxy `/32`; otherwise Tailscale can advertise the route but cannot forward traffic into the proxy. The helper address must also be verified unused and kept outside DHCP assignments.

Do not add arbitrary proxy or health-check targets. Confirm the exact LAN address is unused immediately before creating the container. Install the scoped DNS token only after action-time approval.
