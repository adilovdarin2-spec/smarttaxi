# Docker dependency locking

## Local Compose / root-context builds

`docker-compose.yml` builds API and web from the repository root through
`infra/docker/Dockerfile`, selecting the `api` and `web` targets. Both run
`npm ci` for their workspace using the tracked root `package-lock.json`.
Manifest/lock mismatches now fail a build instead of silently resolving new
dependency versions. API installs production, non-optional dependencies only; the web image
contains only nginx and the generated static files.

Node 22 is the shared CI and Docker baseline, including the service-local
Railway Dockerfiles. The root manifest and lock metadata declare Node >=22
for local tooling. This satisfies the existing locked map dependency's engine
requirement without changing any dependency version.

The root `.dockerignore` is an allowlist: manifests/lock, API source/address
data, web source/public assets/build config, and shared source. Local `.env`
files, credentials, keystores, uploads, SDKs, node_modules, previous build
outputs and QA screenshots are excluded from the build context. Add new
required source inputs deliberately if the build structure changes.

Build without restarting any running service:

```bash
docker compose build api web
```

Or build isolated validation tags without changing the normal Compose tags:

```bash
docker build -f infra/docker/Dockerfile --target api -t smarttaxi-qa-api:locked .
docker build -f infra/docker/Dockerfile --target web --build-arg VITE_API_URL=http://localhost:4001 --build-arg VITE_SOCKET_URL=http://localhost:4001 -t smarttaxi-qa-web:locked .
docker run --rm --network none smarttaxi-qa-api:locked npm run syntax
docker run --rm --network none --entrypoint nginx smarttaxi-qa-web:locked -t
```

Runtime API environment variables and listening ports are unchanged. The
workspace working directory is `/app/apps/api`; the existing secrets mount is
still `/app/secrets`. `/app/apps/api/uploads` links to `/app/uploads` to
preserve the existing upload location. Address data ships with the API image.

Web build arguments retain their existing meanings: API/socket URLs and public
map settings. Public browser map keys are intentionally compiled into the web
bundle; never supply a private server credential through a `VITE_*` argument.
Card payments and OpenFreeMap keep their existing application defaults.

`NPM_STRICT_SSL` is preserved as the existing API build override; this change
does not alter the local proxy/TLS setup. `.env.example` supplies `true` for a
configured deployment. The prior Compose fallback remains unchanged.

This locks npm dependencies, not every image byte: Node/nginx base tags can
receive platform/security updates that change image digests.

## Railway boundary

The documented Railway services use `apps/api` and `apps/web` as their Root
Directory with the service-local `Dockerfile`. Their build context, `COPY`
paths and `railway.json` files are unchanged. The compatible Node base is
aligned to 22; API installs also omit unused optional dependencies and use
the API manifest's mirrored `qs` security override. Replacing their `COPY` paths with
root-relative paths would break a build that cannot access the repository root.

**Railway subdirectory builds still use `npm install` without the root lock.**
They are not covered by the dependency-locking claim above. Adopting the
root-context build there requires a separately reviewed service configuration
migration: repository-root context, correct Dockerfile/target, watch paths,
build arguments, start command and health checks. No Railway setting,
deployment or production variable was changed in this pass.

## Verification — 2026-09-05

- Both isolated targets built successfully with the tracked root lock.
- API image: 300 installed package versions matched their lock entries; direct
  dependency imports resolved, the gazetteer existed, and private/unrelated
  source paths were absent. API syntax passed inside a network-disabled
  disposable container. Upload compatibility link resolved to `/app/uploads`.
- Web: locked install and Vite build passed; final nginx configuration,
  `index.html`, and both original tariff vehicle assets were checked in a
  network-disabled disposable container.
- `docker compose config -q` and `git diff --check` passed. Existing running
  services, database volumes and published ports were not recreated.
- Node 22 follow-up: both locked targets rebuilt successfully with no
  `EBADENGINE` warning. API runtime reported `v22.23.2`; all 300 installed
  package versions still matched the lock. The full API test command passed
  in a network-disabled container with web source mounted read-only for its
  cross-platform contract assertions; no shared database was connected.
  The web lifecycle tests also passed 16/16 on Node 22 with read-only source,
  and the final nginx configuration passed again.

The initial Node 20 verification exposed a locked web dependency
(`@mapbox/jsonlint-lines-primitives@2.0.3`) that declares Node >=22. The shared
baseline was therefore aligned to Node 22. npm's install audit reported 11
moderate advisories for API dependencies and none for web. The subsequent
[API dependency hardening pass](status/api-dependency-hardening-2026-09-05.md)
patches `qs` and omits unused optional Firebase SDKs from API images: the
production/non-optional audit is clean, while the full lock retains eight
moderate optional-chain findings. No forced dependency upgrade was performed.
