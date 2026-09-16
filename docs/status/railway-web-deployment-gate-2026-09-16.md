# Temporary Railway web deployment gate — 2026-09-16

## What was verified

- The current `dev` branch was pushed through commit `fca06ac`.
- A local Vite QA preview loaded the current passenger screen through the
  Railway API proxy: map, all 13 regions, POIs and an exact-house search
  (`Амангелды улица, 29`) all resolved without signing in or creating an
  order.
- The public temporary site
  `https://smarttaxi-web-production.up.railway.app/order` responded with HTTP
  200 and its passenger screen loaded against the Railway API.

## Confirmed deployment mismatch

The public HTML references `assets/index-BDAs3h1V.css`. The current local
production build references `assets/index-CjVdUpas.css`. Therefore the public
web service had not yet rebuilt from the current `dev` revision at the time of
the check. Its desktop presentation still has the old dark promotional frame;
the current source removes that frame so the web surface matches the mobile
application presentation.

This is a Railway deployment/settings state, not a browser cache conclusion:
the assets have distinct content-addressed names. No dashboard setting,
production deploy or database action was performed during QA.

## Owner action before presenting the public link

In Railway, open the **web** service and verify that it watches this repository
and branch `dev`, uses `apps/web` as its root directory, and uses
`apps/web/Dockerfile`. Trigger one normal deploy from the current `dev` HEAD
only after those settings are confirmed. Then reload the public URL in a fresh
browser and verify that its HTML no longer references `index-BDAs3h1V.css`.

The API itself is reachable and returns all 13 active regions. Its `/api/health`
is intentionally `degraded` while production SMS is not configured; clients do
not use that readiness endpoint for address discovery. SMS configuration,
custom domain ownership, payment merchant, Firebase release configuration and
official address-register imports remain external release gates.
