# API dependency hardening — 2026-09-05

## Scope

This pass changes only dependency resolution and API image contents. It does
not configure cloud credentials, send notifications, deploy to Railway,
or change a database volume. Isolated validation did not restart services;
the subsequent integrated QA switched only the local API/web containers as
recorded in `SESSION-2026-09-05-CONTINUATION.md`.

- Pin `qs` to **6.16.0** using identical root and `apps/api/package.json`
  overrides. npm honors the override at its install root: Compose/CI use the
  repository root; the existing Railway service-local Docker context uses
  `apps/api`. The duplication is intentional, not a second dependency policy.
- Regenerate the root lock mechanically: `qs` 6.15.2 → 6.16.0, plus its required
  `side-channel` patch 1.1.0 → 1.1.1. Other package versions remain unchanged.
- Both API Docker install commands use `--omit=dev --omit=optional`.
  Web install flags and the nginx/static runtime are unchanged.
- A new API `pretest` checks both overrides and every locked `qs` entry, so a
  future edit cannot silently drift the build contexts apart. In a standalone
  image, where the repository root is absent, it checks the API override and
  locally generated lock instead; a missing lock is an error, not a skip.

Host npm 11.17.0 did not apply the workspace override during the initial
lock-only install/update. The successful targeted lock update ran under the
existing Node 22 / npm 10.9.8 QA image. Unrelated Rollup `libc` metadata omitted
by npm 10's serialization was preserved from the previous lock. No force,
Firebase major upgrade/downgrade, or UUID major override was used.

## Runtime boundary

The only application Firebase use found is `admin.messaging(app)` in
`apps/api/src/modules/notifications/push.service.js`. Firestore and Storage
accessors are lazy in the installed Firebase SDK; the application does not
call them.

The API install now excludes Firebase's optional `@google-cloud/firestore`
and `@google-cloud/storage`, and their optional legacy dependencies including
`google-gax`, `retry-request`, `teeny-request`, `uuid` 9.0.1, and `gaxios` 6.7.1.
Firebase Admin itself and its required Messaging/authentication dependencies
remain; the required Google authentication tree uses `gaxios` 7.3.1. Omission
applies to *all* optional dependencies in the selected API install, not only
to advisory-listed packages. No omission flag was added to the web builder.

Do not add Firestore/Storage application features without revisiting this
runtime policy and upstream dependency fixes. The full workspace lock still
contains those optional packages for reproducibility and other install modes.

`runtime-dependencies-check.js` is an offline API-image check: it verifies
the removed cloud packages are not resolvable, Express/body-parser resolve
`qs` 6.16.0, and both modular and namespace Firebase imports can construct
Messaging. It initializes only a named local test app, uses no credentials,
sends no request/notification, and deletes that in-memory app afterwards.
This does **not** claim real-device push delivery is configured or tested.

## Audits

Initial API production audit: **11 moderate, 0 high/critical**, representing
three distinct advisories and their transitive parent findings.

After the patch:

| Command from repository root | Result |
| --- | --- |
| `rtk proxy npm audit --omit=dev --omit=optional --json` | 0 vulnerabilities |
| `rtk proxy npm audit --omit=dev --json` | 8 moderate, 0 high/critical |
| `rtk proxy npm audit --json` | 8 moderate, 0 high/critical |

The remaining eight findings are the optional UUID/Firebase dependency chain,
not eight independent vulnerabilities and not an unresolved `qs` finding.
There are no additional dev-only findings in this lock; its current metadata
reports zero dev dependencies. The full-lock audit is **not** clean. Adding
`--omit=optional` to the audit reflects the new API runtime install policy;
it is not a claim that the lock entries were removed or patched.

The `qs` fixes cover [comma array-limit bypass](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)
and [attacker-controlled isBuffer during stringify](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
Current application code does not enable `comma: true` or reserialize parsed
queries with `qs.stringify`; patching still removes the vulnerable library
from the API runtime. The remaining [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
concerns `v3/v5/v6` with caller-provided buffers. Inspected Google SDK call
sites use `v4()` without buffers, and those optional SDKs no longer ship in
the hardened API install. This is a scoped reachability assessment, not a
claim that all Firebase functionality or future application paths are safe.

## Verification

- Host `rtk npm --prefix apps/api test`: dependency policy pretest and all
  36 existing API checks passed. Existing host node_modules were not replaced,
  so the isolated image checks below verify the actual patched install.
- Root production/non-optional audit: passed with zero findings. A transient
  registry `ECONNRESET` on the first request was followed by a successful audit.
- Root-context production Dockerfile: two fresh install attempts failed on
  registry `EIDLETIMEOUT` (395 s and 818 s), not a lock/override mismatch. The
  final fresh-base root-context build is **not** claimed to pass.
- Locked runtime fallback: a disposable validation build seeded npm's cache
  from the previously verified local `smarttaxi-qa-api:node22-20260905` image.
  `npm ci --omit=dev --omit=optional --workspace=apps/api
  --include-workspace-root=false --prefer-offline` replaced the dependency
  tree from the final lock, installing 205 packages. Registry integrity checks
  remain enabled. `--no-audit` was used only for this temporary validation
  install; the dedicated audits above were run separately. SSL was unchanged.
- `smarttaxi-qa-api:cache-hardened-20260905`: both dependency checks, API syntax,
  and all 36 API checks passed in network-disabled disposable containers. The
  full suite used the existing CI placeholder variables and web source mounted
  read-only for parity assertions; no database or external service connected.
  `CMD` is `["npm", "start"]`, `WORKDIR` is `/app/apps/api`. All 119 API source
  files matched the current workspace byte-for-byte (aggregate SHA-256
  `800e8b23d07922a04fa9a5bc3d2f1aec286ccd50da6407899a351c6d55b7f867`).
- Service-local Dockerfile: after an initial Docker Hub TLS metadata timeout,
  the real install completed successfully (210 packages; install audit zero).
  The image was rebuilt with final source using its successful install cache.
  `smarttaxi-qa-api:service-hardened-20260905` passed both standalone dependency
  policy and Messaging/optional-absence checks with `--network none`.
- A separate disposable `/standalone` layout also passed both checks with a
  generated service-local lock; it does not rely on finding a repository root.
- `docker compose config -q` and `git diff --check` passed.

The root-context fresh-build registry failure is distinct from the successful
locked runtime validation and successful real service-local Docker build.
The cache-validation image is a local QA artifact, not a Railway deployment.

The service-local build remains unlocked beyond its manifest overrides; this
pass does not change Railway's existing subdirectory context or make that
build equivalent to the root-lock Compose build.
