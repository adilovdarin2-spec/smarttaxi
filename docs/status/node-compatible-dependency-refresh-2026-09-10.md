# SmartTaxi compatible Node dependency refresh — 2026-09-10

## Result

The root lockfile was refreshed only within the dependency ranges already
declared by the API and web applications. Breaking major upgrades were not
mixed into the local release gate.

## Updated direct runtime packages

- API: `@sentry/node` 10.72.0 → 10.74.0, `helmet` 8.1.0 → 8.3.0,
  `pg` 8.20.0 → 8.23.0.
- Web: `react` and `react-dom` 19.2.6 → 19.3.0.

The current major upgrades for Express, Vite, TypeScript, Redis, Zod,
`bcryptjs`, `dotenv`, the React Vite plugin and MapLibre remain deliberately
separate migration work. They require targeted compatibility and visual map
regression QA instead of an unreviewed lockfile jump.

## Verification

- Production dependency audit: API with dev/optional packages omitted — 0
  vulnerabilities; web with dev packages omitted — 0 vulnerabilities.
- API complete test chain passed, including 121,361 address rows in 13 regions.
- Web tests: 124/124 passed.
- Web production build and bundled MapLibre worker/marker check passed.
- `docker compose up -d --build` rebuilt API and web without removing volumes.
- The minimal API image completed its offline runtime dependency check and
  reported 0 production-install vulnerabilities.
- API, web, PostgreSQL and Redis became healthy; readiness returned development
  mode with DB `ok`, Redis `PONG` and OSRM `ok`.
- Read-only routing QA passed after the rebuild for Atakent, Zhetysay and
  Myrzakent. The API geometry and metrics matched the provider candidate with
  the minimum estimated duration, with distance as tie-breaker. Two opposite
  moving-driver headings also produced matching constrained departure
  directions.

The route result is the fastest estimate returned by the configured OSRM
provider. It is not presented as live-traffic routing because the public
provider supplies no contracted current-traffic feed.
