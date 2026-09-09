# Web session coherence and driver empty states — 2026-09-10

## Scope

This pass fixed two issues confirmed during the local visual QA on
`http://127.0.0.1:5175`:

1. the passenger and driver pages share one browser token, but a token replaced
   in another tab left the old role/profile painted until an unrelated request
   failed;
2. the driver trip and incoming-order empty states were visually unfinished
   and did not provide a useful next action.

## Session result

`browserSession.js` now owns the token key and emits an in-document event for
login/logout/mode-switch writes while also listening for the browser's native
cross-tab `storage` event. Passenger and driver shells clear role-specific
state immediately and validate the replacement token before displaying a new
identity.

The passenger shell also validates `CLIENT` on password login, registration,
password reset and `/auth/me`; a `DRIVER` or admin token is never presented as
a passenger. The driver shell keeps a valid passenger token intact but removes
the previous driver profile, orders, navigation and GPS state before checking
the new role.

Live two-tab verification, without page reload between role changes:

- driver logged in and passenger page open: passenger page showed the
  role-specific login screen, not the stale Test Client profile or a 403;
- passenger login in the other tab: driver page immediately returned to the
  driver login screen and removed the previous shift/orders;
- driver login in the other tab: passenger page immediately returned to the
  passenger login screen and displayed the explicit role guidance;
- the local seed driver was returned to `OFFLINE` after QA.

## Driver empty-state result

The incoming-order and active-trip empty states now use the same premium
blue/white hierarchy as the rest of the driver core: compact icon surface,
clear title, contextual explanation and a single relevant CTA. The CTA routes
offline drivers to the line screen and online drivers to orders.

## Verification

- `npm --prefix apps/web test` — passed (including session propagation and
  client-role tests).
- `npm --prefix apps/web run build` — passed; map build check passed.
- `docker compose up -d --build web` — passed without removing volumes.
- `/api/health/ready` — development, database/Redis/OSRM healthy.
- Local in-app-browser QA — passenger/driver session replacement passed in
  both directions; driver empty trip CTA was inspected and exercised.

## Remaining external constraints

This pass does not claim the externally blocked RKA address coverage, Infobip
sender ID, payment merchant, legal translations/decisions, iOS signing/App
Store work or production infrastructure/secrets.
