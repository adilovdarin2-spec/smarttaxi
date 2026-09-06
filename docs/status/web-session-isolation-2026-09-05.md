# Web session isolation — 2026-09-05

Local-only follow-up on `dev` after `1b94e63`.

## Reproduction

The browser holds a genuine authenticated `/api/driver/profile` request,
logs out, then signs into the same local test driver account again through
the real password-login endpoint. The backend rotates `session_version`.
When the old request is released, the backend itself responds with
`401 SESSION_SUPERSEDED` for the old token.

Before the fix, the shared web API wrapper unconditionally removed the token
currently in local storage and dispatched its logout event. It therefore
erased the newer valid session, returning the user to the login screen.
The reproduction failed its session-preservation assertion; its diagnostic
image remains in ignored `tmp-2026-09-05-captures/session-isolation-before/`.
No response, session token, authentication or backend authorization was forged.

## Change

- Added `sessionGuard.js`: an operation is current only while its original
  non-empty token still matches and its owner remains mounted.
- The shared API wrapper emits session expiration only for the token used by
  the rejected request. Genuine supersession of the current session still
  clears it, once. Late requests from a former session do not log out a new one.
- Driver profile/order/earnings reconciliation, road alerts and mutation
  callbacks now check the captured session before applying success, error or
  completion state. A late operation cannot repopulate a new session's screen
  or clear its action spinner. Already-authorized server mutations are not
  reversed or replayed.
- Driver logout clears account-owned view state, pending UI indicators, road
  comment and password input. The phone number remains for convenient login;
  no server profile, financial history, order or account is deleted.

Backend session rotation, authentication requirements, API paths, map rendering,
pricing, design assets, native code and external providers are unchanged.

## Checks

- Web unit tests: 35 passed, including four new session-lifetime checks.
- API: dependency policy and all 36 checks passed.
- Normal root-context Docker web build and Compose configuration passed.
  Only the local web container was recreated; all four services are healthy.
  Readiness confirms development mode, PostgreSQL, Redis and OSRM.
- The regression passed with actual local backend responses: the late old-token
  401 preserved the new token, driver screen and absence of stale error text.
- Positive security control passed: a subsequent real login outside that browser
  revoked its actual current session and returned it to login with an empty
  password field. Session revocation was not disabled to obtain the pass.
- Passenger address/tariff/payment UI smoke passed at 390px/360px.
- Final paired driver/passenger lifecycle passed after the session change:
  failed actions retain the order, GPS permission recovery retains BUSY, both
  live route legs update, unpaid state recovers and manual cash receipt reaches
  PAID. Local test order: `5066176d-8010-4809-93d0-994337ba85d6`.

Final evidence:

- [Screen retained after old-session response](screenshots/2026-09-05-session-isolation/late-old-session.png)
- [Session assertions](screenshots/2026-09-05-session-isolation/result.json)
- [Final full-lifecycle assertions](screenshots/2026-09-05-session-isolation/lifecycle-result.json)
- [Final location/route evidence](screenshots/2026-09-05-session-isolation/lifecycle-network.json)

The smoke refuses to run outside localhost/development or with an unrelated
active trip. It uses only the seeded local QA driver and does not create trips,
send SMS or alter driver availability. JSON evidence never includes tokens or
passwords. Test assertions compare token equality without printing their values.

Flutter was not changed or rebuilt in this pass; its last verified baseline is
62 tests, clean analysis and the local debug APK. Physical Android acceptance
still requires device-side installation approval. Official RKA data, legal,
merchant/SMS, licensed services and iOS/store release gates remain external.
