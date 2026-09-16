# BaiSapar — authenticated driver onboarding, September 16

## Confirmed defect and change

The previous local audit approved a new passenger's driver application, but a
fresh login remained CLIENT and driver-mode returned DRIVER_MODE_UNAVAILABLE.
Review only changed a label; it did not create a usable driver. Application and
application-document endpoints also lacked authenticated applicant ownership.

- Applications now belong to the signed-in account. The account phone is used;
  entering another phone or knowing an application UUID grants no access.
- OWNER explicitly selects one active region. Approval creates the driver,
  region approval and account role, links uploaded documents, and marks the
  application in one transaction. New drivers start OFFLINE.
- Password, session version, customer history and wallet are preserved. Existing
  passenger sessions can use the normal server-authorized mode switch; fresh
  password login returns the driver's actual role. No generated password/token.
- User/application locks and a partial unique index prevent duplicate active
  applications and profiles. Retry returns the existing approved profile.
  Already provisioned drivers must be managed in the driver card, not reverted
  by changing an old application's label.
- NEEDS_INFO can be corrected and resubmitted. Rejected applications can be
  followed by a new application. Web/Flutter read status and documents from the
  server after reopening instead of relying on a local submitted flag.
- Document upload and approval serialize on the application row. After approval,
  uploads belong to the normal driver workflow; no late unlinked document.
- Fixed the OWNER document-card crash (`Icon` was not imported), and application
  search retaining the complete region picker. Status visuals no longer render
  a green success check for a rejected/pending application.

## Compatibility and boundaries

Legacy anonymous applications are NOT matched to accounts by phone. OWNER can
read/reject/request information, but account provisioning requires a new
authenticated application. Old APKs/web tabs need updating for application and
document authentication. Legacy `autoApproveDrivers=true` is no longer accepted:
the unfinished automatic-status path is replaced by explicit owner review and
region selection; existing stored flags do not silently grant access.

This is technical provisioning, not identity verification or a legal approval.
Document completeness is visible to OWNER; this change does not invent a new
automatic document/dispatch policy. QA uses a synthetic OTHER PDF explicitly
labelled QA-ONLY, never a fabricated licence or identity document.

## Verification

- Full API suite and syntax passed. New injected-executor checks cover ownership,
  explicit region, duplicates and provisioning guards.
- Real local PostgreSQL check injects failure after driver/region/role writes and
  verifies rollback leaves none behind. Legacy anonymous refusal and preserved
  password/session verified; DB fixtures rolled back.
- Local development HTTP creates accounts through dev SMS/password, tests
  unauthenticated/foreign access, phone spoofing, concurrent submission and
  approval, NEEDS_INFO correction, document transfer, fresh login, mode switching,
  online and offline. New synthetic drivers are blocked afterward. An interrupted
  earlier browser fixture was explicitly rejected after a superseded QA session.
- Real browser flow at 320 and 390 px: reopened application and document,
  OWNER region selection, approval, refreshed status and actual driver mode.
  No uncaught page errors or applicant horizontal overflow. Screens inspected in
  `%TEMP%/baisapar-driver-onboarding-qa/` (`owner-region.png`, `approved-320.png`,
  `approved-390.png`). The missing-icon regression is also SSR-render tested.
- Web 186 tests and Docker production build passed; Compose config valid.
- Flutter 362 tests and analyze passed. Fresh profile APK built and v2 signature
  verified (one signer). No phone or emulator used: native physical acceptance
  is not claimed.
- Previous commit `19f98c8` CI runs 35099473648 / 35099465391 now both completed
  SUCCESS, including Android build.

## Artifact

`apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-profile.apk`:
191163229 bytes, SHA-256
`3d44c1c1bc467dd827a173cf125303029285269fbe4418f364b677a6de751592`.
Railway-default profile QA artifact, not a Play Store release. Gradle/AGP/Kotlin
future-support warnings remain; no unverified toolchain upgrade was made.

## Remaining acceptance

This closes the reproduced new-driver provisioning gap, not all release gates.
SMS/payment activation, owner/legal/domain/store decisions, authoritative address
completeness, moving navigation/background/performance on physical Android and
production capacity acceptance remain separate. Unit and local browser checks
cannot certify the entire application as bug-free.
