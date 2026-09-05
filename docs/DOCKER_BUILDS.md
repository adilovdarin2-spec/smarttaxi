# Docker dependency locking

## Local Compose / root-context builds

`docker-compose.yml` builds API and web from the repository root through
`infra/docker/Dockerfile`, selecting the `api` and `web` targets. Both run
`npm ci` for their workspace using the tracked root `package-lock.json`.
Manifest/lock mismatches now fail a build instead of silently resolving new
dependency versions. API installs production dependencies only; the web image
contains only nginx and the generated static files.

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

This locks npm dependencies, not every image byte: Node/nginx base tags remain
the existing tags and their platform/security updates can change image digests.

## Railway boundary

The documented Railway services use `apps/api` and `apps/web` as their Root
Directory with the service-local `Dockerfile`. Those Dockerfiles and
`railway.json` files are unchanged. Replacing their `COPY` paths with
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

Observed dependency warnings are not silently fixed here: a locked web
dependency (`@mapbox/jsonlint-lines-primitives@2.0.3`) declares Node >=22 while
the current base/CI use Node 20; this build succeeded. npm's install audit
reported 11 moderate advisories for API dependencies and none for web. No
forced dependency upgrade or toolchain migration was performed.
