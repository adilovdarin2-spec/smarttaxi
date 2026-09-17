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

## Original deployment mismatch

The public HTML references `assets/index-BDAs3h1V.css`. The current local
production build references `assets/index-CjVdUpas.css`. Therefore the public
web service had not yet rebuilt from the current `dev` revision at the time of
the check. Its desktop presentation still has the old dark promotional frame;
the current source removes that frame so the web surface matches the mobile
application presentation.

This is a Railway deployment/settings state, not a browser cache conclusion:
the assets have distinct content-addressed names. No dashboard setting,
production deploy or database action was performed during QA.

## Resolution — completed

The current web service is configured to build from the monorepo root with
`Dockerfile.web`. An initial subdirectory upload failed before traffic changed
because that archive did not contain the root Dockerfile. A normal root-context
deployment was then completed successfully:

- deployment: `2e0118e2-e608-4df4-8974-a7c4d67adcae`;
- public HTML now references `assets/index-CjVdUpas.css`;
- the public Railway passenger screen loaded with the current light
  mobile-parity frame, map, all 13 regions and an exact address search for
  `Амангелды улица, 29`;
- the API returned `Access-Control-Allow-Origin` for the public Railway web
  origin, so this result does not rely on a development CORS bypass.

No API, database, account, order or payment data was changed.

The API itself is reachable and returns all 13 active regions. Its `/api/health`
is intentionally `degraded` while production SMS is not configured; clients do
not use that readiness endpoint for address discovery. SMS configuration,
custom domain ownership, payment merchant, Firebase release configuration and
official address-register imports remain external release gates.
