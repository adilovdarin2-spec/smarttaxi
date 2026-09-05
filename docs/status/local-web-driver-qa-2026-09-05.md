# Local web and driver QA — 2026-09-05

This pass used only the local Docker stack at `127.0.0.1`, seeded development
accounts, and the development SMS flow.  It did not contact production users,
payment providers, or external SMS sender infrastructure.

## Visual checks completed

- Passenger start screen: local map, current-position control, approved
  square-and-wide-tail address marker, and address bottom sheet render as one
  blue/white mobile surface.
- Driver sign-in: the form is now a bottom sheet over a restrained blue map
  treatment rather than a small card floating inside an empty phone shell.
- Driver line screen: local authenticated session rendered the map, online
  status, earnings strip, region selector, shift card, and five-item bottom
  navigation at phone width.

The passenger and driver surfaces use the same primary blue (`#1D6FFF`), deep
blue (`#0B4FD1`), pale blue (`#EAF3FF`), rounded sheet language and touch-sized
controls.  Original in-repository tariff vehicle assets remain in use; no
third-party vehicle photo, taxi brand, or reference artwork was copied.

## Functional checks completed

- Docker Compose rebuild and health/readiness check: database, Redis and OSRM
  were healthy in the local development stack.
- `npm --prefix apps/web run build` completed successfully.
- `npm --prefix apps/api run smoke:stage11` against local Docker completed the
  driver lifecycle: offline/online, incoming order, reject, accept,
  going-to-client, arrived, waiting, trip start, complete, payment, rating,
  status history and earnings.  It also checked the two important invalid
  transitions: a driver with an active order cannot go offline, and a started
  trip cannot be cancelled.

## Release blockers that remain external

1. A verified address register is still required for every operating region:
   `rka`, display label, latitude, longitude, and a separate per-region
   `meta.json` checksum.  The supplied `s_buildings-data.xlsx` cannot supply
   this: it contains Pavlodar-only rows without coordinates.  See
   `rka-input-audit-2026-09-04.md`.
2. A legitimate vector-map style/source credential is needed for the full 3D
   building treatment from the design reference.  The local product continues
   to use its legal OpenStreetMap fallback; it does not pretend raster tiles
   are 3D.  The API reports this explicitly as `maptiler: not_configured`.
3. No physical Android device was visible to ADB during this pass.  No emulator
   was substituted.  Native route-line ordering must stay unchanged until it
   can receive the visual device QA described in
   `map-and-address-pass-2026-09-04.md`.

