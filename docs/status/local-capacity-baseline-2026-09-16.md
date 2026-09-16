# BaiSapar — local API/PostgreSQL capacity baseline, September 16

## Scope

This is a reproducible read-only baseline of the owned local Docker stack, not
a production sizing guarantee. It exercises the real Express middleware,
distributed Redis rate limiter, JWT verification, PostgreSQL pool and response
serialization. It does not load public geocoders, public map tiles or a public
routing server, and it creates no users, orders, stands or address rows.

`apps/api/src/tools/local-capacity-smoke.js` uses a distinct signed rate-limit
identity for each virtual user. Those tokens are not accepted as accounts and
are used only on public endpoints. Half of the requests read all 13 active
regions; half search an exact locally catalogued house in regions that currently
have house-number data. Exact scoped house queries return from PostgreSQL before
external provider fallback.

The tool is guarded to development and loopback/container hostnames, caps a run
at 20,000 requests and 500 concurrent connections, validates every response,
and fails on timeouts, rate limits, non-200 responses or missing catalogue data.

## Observed local results

Each run used 5,000 distinct virtual users and 5,000 total requests:

| Concurrency | All responses | Elapsed | Throughput | p50 | p95 | p99 | max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 5,000 HTTP 200 | 4.299 s | 1,163.0 req/s | 89 ms | 131 ms | 170 ms | 233 ms |
| 250 | 5,000 HTTP 200 | 3.967 s | 1,260.2 req/s | 184 ms | 274 ms | 291 ms | 338 ms |
| 500 | 5,000 HTTP 200 | 3.878 s | 1,289.3 req/s | 328 ms | 542 ms | 603 ms | 641 ms |
| 500, repeat A | 5,000 HTTP 200 | 6.116 s | 817.5 req/s | 566 ms | 916 ms | 1,155 ms | 1,253 ms |
| 500, repeat B | 5,000 HTTP 200 | 5.851 s | 854.5 req/s | 508 ms | 1,036 ms | 1,099 ms | 1,134 ms |

Commands run inside the rebuilt local API image, with the API addressed only at
`127.0.0.1:4000`. PostgreSQL and Redis were the Compose services. The initial
draft was stopped when POI-only samples could have invoked provider fallback;
the final tool restricts address requests to `kind='housenumber'`. A validation
key mismatch in the harness then correctly failed the run and was corrected
before the three recorded passes.

The complete API suite, capacity-tool syntax check, Compose configuration and a
fresh API image build passed afterward.

Reproduce after `docker compose up -d --build`:

```powershell
rtk docker compose exec -T -e CAPACITY_BASE_URL=http://127.0.0.1:4000 `
  -e CAPACITY_CONCURRENCY=100 api npm run smoke:capacity-local
```

## What this proves and does not prove

The current code and local single API container can serve this narrow read mix
without an error at up to 500 simultaneous connections. Repeated 500-concurrency
runs also show that latency varies materially on this development host, so the
fastest p95 must not be used as a production promise. It is useful evidence
that the API, Redis limiter and database pool do not collapse immediately under
bursty reads. It does not establish that 5,000 people can simultaneously route,
stream GPS, use WebSockets, write orders, upload documents or receive push/SMS.

Production Railway CPU/RAM, replica count, PostgreSQL/PgBouncer connection
limits, Redis plan, private OSRM capacity, real traffic shape and an agreed p95
SLO still need a controlled staging test. Production and public providers were
not load-tested. No autoscaling or paid-plan change is inferred from this local
result.
