# Docker npm TLS defaults — 2026-09-05

## Confirmed issue and scope

Both API Dockerfiles and the Compose fallback previously used
`NPM_STRICT_SSL=false`. A checkout without an explicit override therefore
disabled npm registry certificate validation even though `.env.example`
already recommended `true`.

The defaults now agree on `true` in `infra/docker/Dockerfile`,
`apps/api/Dockerfile` and `docker-compose.yml`. The explicit compatibility
argument remains; this is a secure default, not a claim that an operator
cannot override it. No environment file, certificate, host trust store,
dependency version, database data or production setting was changed.

`infra/scripts/tests/docker-build-policy-check.mjs` checks both Dockerfiles,
Compose and the environment template, and rejects hardcoded npm/Node TLS
bypasses in the API Dockerfiles. CI runs it before `npm ci`. It belongs at
repository scope rather than API pretest because deployed API images do not
contain Compose or the Dockerfiles.

## Verification

- RED: the new check failed against the old root Dockerfile's `false` default.
- GREEN: `rtk node infra/scripts/tests/docker-build-policy-check.mjs` passes
  after the fix. `rtk docker compose config -q` and `rtk git diff --check` pass.
- The resolved local Compose API build argument is `true`; this check printed
  only that argument, not the resolved environment or secrets.
- `rtk docker compose build api` completed successfully. Image history records
  the new locked npm-install layer at 2026-09-05 23:11:45 +05:00 with
  `NPM_STRICT_SSL=true`; the previous disabled-validation layer was not reused.
- `rtk docker run --rm --network none --workdir /app smarttaxi-api npm config
  get strict-ssl` returned `true`. The root working directory is intentional:
  npm's `config` command rejects the automatically selected API workspace.
- API syntax and `runtime-dependencies-check.js` pass in network-disabled
  disposable containers. Patched `qs`, absent unused optional cloud SDKs and
  offline Firebase Messaging construction remain verified.
- The complete API test command passes again inside the final image: dependency
  policy pretest plus all 36 checks. It used dummy CI variables and a read-only
  web-source mount for cross-client assertions, with no external network or
  real database. The expected unavailable dummy-DB fallback diagnostic is not
  an actual database connection or a failed assertion.
- `rtk docker compose up -d --no-deps api` recreated only the local API after
  the build succeeded. PostgreSQL, Redis, web and data volumes were preserved.
- The running API also reports `strict-ssl=true`. All four services are
  healthy; `/api/health/ready` reports `development`, `ok`, database `ok`, Redis
  `PONG` and a valid OSRM test route. MapTiler remains unconfigured; readiness
  does not imply that every external map provider is configured.

The service-local Dockerfile default is covered by the policy check, but its
unlocked `npm install` context was not rebuilt or deployed in this follow-up.
The root-lock build boundary in [DOCKER_BUILDS](../DOCKER_BUILDS.md) remains.
Remote CI execution was not independently confirmed.

No web or Flutter application source changed in this TLS follow-up. The
immediately preceding [regional routing pass](regional-routing-2026-09-05.md)
records web 46/46, Flutter 89/89, all 34 regional tariff previews and the full
paired browser trip lifecycle. Physical Android acceptance and the external
release prerequisites remain open; this build fix does not close them.
