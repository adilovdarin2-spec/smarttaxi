# SmartTaxi Firebase Admin runtime pass — 2026-09-10

## Result

The API production image now uses Firebase Admin 14's modular Messaging API and
verifies the exact minimal dependency set during every Docker build.

## Confirmed issue

`npm audit --omit=dev` reported a vulnerable legacy `uuid` tree below Firebase
Admin's optional Google Cloud Storage/Firestore packages. Updating Firebase Admin
also exposed a real major-version incompatibility: the removed legacy
`admin.messaging()` namespace call would fail when production push credentials
were eventually supplied.

## Changes

- Updated `firebase-admin` from the 13.x range to `^14.3.0`. The repository and
  Docker image already require Node 22, which is the package's supported minimum.
- Migrated initialization, credentials, and Messaging to `firebase-admin/app`
  and `firebase-admin/messaging`.
- Updated the offline runtime verifier for the modular API.
- Added that verifier as an API Docker build layer after application sources are
  copied. A build now fails if Messaging cannot initialize, patched `qs` does not
  resolve, or unused optional Cloud SDKs leak into the production image.

## Verification

- API syntax check: passed.
- Complete API test chain: passed, including address checks for 121,361 rows.
- `npm audit --omit=dev --omit=optional`: 0 vulnerabilities.
- Clean API Docker build: passed.
- In-image runtime dependency check: passed; Firebase Messaging initialized
  offline and optional Firestore/Storage dependency trees were absent.
- Recreated API container: healthy.
- Development readiness: DB `ok`, Redis `PONG`, OSRM `ok`.

The normal developer install retains Firebase's optional Cloud packages and npm
therefore still reports their upstream moderate advisory unless `--omit=optional`
is used. They are neither imported by SmartTaxi nor shipped in the production API
image. Production Firebase credentials and end-to-end device push delivery remain
an external release gate; no credentials or notification delivery were faked.
