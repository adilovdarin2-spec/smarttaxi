# Navigator speed-camera coverage — 2026-07-25 (apps/api/src/modules/road-alerts, apps/mobile driver navigator)

Follow-up to `routing-geocoding-fixes-2026-07-24.md`. User asked specifically
for camera coverage in Atakent and the surrounding corridor, and to look for
a third-party camera API (named "Кобра"/Cobra as an example). Scope was
`osm-navigation.service.js`, the mobile camera-fetch radius, and the
road-alerts crowd-sourcing copy. Three commits on `dev`, tested
(`flutter analyze`/`flutter test` 35/35, `npm test` 27/27 backend suites)
and live-verified.

## Researched: no free public Kazakhstan camera API exists

- "Кобра" and comparable radar-detector brands (Sho-Me, iBox, Artway,
  Roadgid, CARMEGA) sell downloadable database-update files to their own
  hardware owners — proprietary, paid, no third-party API. Did not attempt
  to reverse-engineer any of these; that would be unauthorized use of a
  commercial product, not "finding an API".
- **SCDB.info** ("Worldwide Speed Camera Database") has 753 real entries
  for Kazakhstan and offers a B2B licensing path for embedding in a
  third-party app — but pricing/terms aren't public; requires the business
  to apply at `clients.scdb.info/apply`. A legitimate option if the user
  wants more coverage than OSM+driver-reports give, but it's a purchase
  decision for them, not something to build around silently.
- Kazakhstan's real camera network ("Sergek") has no public data/API —
  confirmed via search, consistent with what earlier sessions already
  established.

## Confirmed: real, free OSM coverage exists near Atakent already

Queried Overpass directly (not a guess): **275 `highway=speed_camera`
nodes nationwide**, **214 within 100km of Atakent** (nearest ~13km, on the
roads toward Zhetysay/Kirov/Shymkent — none inside Atakent itself, which
tracks: municipal cameras go on through-traffic roads, not village
centers). The existing `osm-navigation.service.js` already queries this
correctly; no code was wrong here, just under-utilized by too small a
client-side radius (see below).

## Fix 1: reverse-geocoded coordinates could be wildly wrong for "road" features

While reverse-geocoding the cameras above for descriptive context, found a
real bug: MapTiler's top match for a point on the Asian Highway 5 route
(OSM relation r176922, spans TM/UZ/CN/KG/TR/KZ) was that route's own
`center` — its geometric centroid, hundreds of km away near Almaty — not
the queried point. `publicMapTilerAddressSuggestion` blindly trusted
`feature.center` for reverse lookups. Since this operating area sits on
real international corridors (AH5, A-15), a client tapping a pickup/dropoff
point on one of these ways could have been silently relocated by hundreds
of km. Fixed in `reverseAddressWithMapTiler`: the queried lat/lng always
wins now; only the descriptive label comes from the matched feature.
Verified live (a point near the Uzbek border no longer jumps to Almaty).

## Fix 2: camera lookup radius was smaller than the backend already allows

`road-alerts.routes.js`'s `OsmNavigationQuery` allows up to `radiusM: 8000`,
but the mobile client (`api_client.dart`'s `getOsmNavigation`) defaulted to
3000 and the single call site (`driver_shell.dart`) never overrode it. Real
impact: the nearest cameras near Atakent start ~13km out, so at 3km radius
a camera wasn't even in the driver's known list until they were already
close — a fast-moving vehicle risked reaching the 500m/200m voice-warning
thresholds (`_checkCameraProximity`, already built and correct — computes
real live distance independent of fetch radius) before the next periodic
refetch (every 800m moved) had loaded it. Raised the default to 8000.
Same single call site, so this covers every driver automatically. No
other logic needed changing — the proximity/voice-warning system was
already solid.

## Fix 3: encourage the crowd-sourcing path that was already built

`road_alerts` already supports drivers submitting `SPEED_CAMERA` reports
(with a heading picker, since direction matters) through the existing
"Дорожные события" screen, with a confirm/dismiss mechanic
(`PATCH /:id/confirm`, `confirmations_count`/`dismissals_count`/
`confidence_score`) for other drivers, and these reports merge directly
into the same navigator list as OSM cameras
(`driver_shell.dart`'s `_allNavigatorAlerts = [..._roadAlerts,
..._osmCameras]`). This is the only realistic path to get camera coverage
inside small towns like Atakent itself, which no dataset (OSM or paid)
has granular local knowledge of — but local drivers do. The screen's
copy didn't say any of this (`driverRoadAlertsSubtitle` was generic
"reports needed for road safety and rule compliance"). Reworded in both
ru/kk to state the actual mechanism: reports are immediately visible to
other drivers on the navigator. Verified live on-device (renders cleanly,
no overflow, in Kazakh).

## What's left (genuinely outside code)

- Real Atakent-corridor camera coverage now depends on driver adoption of
  the reporting feature — a fleet-communication/incentive question, not a
  code gap.
- SCDB.info B2B licensing remains available if the user wants to pursue
  paid coverage beyond OSM + driver reports; not pursued further without
  their explicit decision to apply/pay.
