# Smart Taxi UI Design Audit

Superseded: 2026-09-03.

The dark/gold visual spec that used to fill this file is gone, along with the
gold reference packages it pointed at (`smarttaxi-darkgold-52/`,
`smart-taxi-handoff/`, `smart-taxi-handoff-v2/`, `references/`). SmartTaxi is a
blue-and-white product.

**Canonical design source:** `docs/design/BLUE_WHITE_DESIGN_SYSTEM_2026-07-15.md`,
kept in lockstep with `apps/web/src/styles.css` (`--brand*` tokens) and
`apps/mobile/smarttaxi_app/lib/core/theme/app_theme.dart` (`SmartTaxiColors`).

## Protected Files Not To Delete

The one part of the original audit that is not about colour. These are
infrastructure and configuration, and a UI pass must never touch them:

- `.env`, `.env.*`, `.env.example`
- `docker-compose.yml`
- `.github/workflows/*`
- `infra/scripts/deploy.sh`
- `infra/nginx/*` if present
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `apps/web/nginx.conf`
- `apps/api/src/config/env.js`
- `apps/api/src/modules/maps/*`
- Firebase, Google Maps, API key, SSL/cert/deploy/VPS config files
- root and workspace `package.json` / lockfiles
- backend source unless a later backend stage explicitly requires it

No secrets or key values are printed in this document.
