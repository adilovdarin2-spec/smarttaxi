# Map, map-pick and address search — 2026-09-04

Follow-on from the three status documents dated 2026-09-03/04, working through
the map design, the logic for picking an address on the map, and address
search. Everything below is committed; nothing is pushed.

## The map pick contradicted its own contract

`reverseAddress()` builds a careful object when a pin resolves to nothing:
`title: "Адрес не определён"`, `source: "point_on_map"`, `confidence: 0`,
`fallback: true`, and a subtitle telling the rider to move the pin. The comment
above it says clients treat that flag as a failed resolution and keep
confirmation disabled.

Both of its main return paths then stamped `fallback: false` over it:

```js
if (mapTiler) return { ...mapTiler, fallback: false };
…
return { source: "nominatim", ...suggestion, fallback: false };
```

So the response said "could not resolve" and "safe to confirm" at once. Latent
rather than live — both clients gate on the label text instead — but the
contract the server documents was false. The literal now comes before the
spread on both paths.

### A bare street was handed to the client to refuse

`passenger_shell.dart`'s `_isUsablePassengerAddressLabel` and `ClientApp.jsx`'s
`technicalAddress` both reject a street label containing no digit. The server
returned exactly that whenever the provider could only resolve the street and
no house stood within 400 m — so the rider got "улица Абая" on the card and a
confirm button that did nothing. It now falls through to the same guidance
state as a road code. The server's own street-word list had also drifted from
the two client guards (`бульвар` and `шоссе` missing), so those slipped past as
well.

### Why neither was caught

`reverseAddress` reached straight for `defaultQuery`, so the local-gazetteer
half of the map-pick path could only ever be exercised with no database at all,
and the only assertions anyone could write were about labels in that degraded
state. It now takes an executor, and `address-selection-check.js` runs the real
cases against fixtures: a road code over a house, a road code over fields, a
bare street over a house, a bare street over only a shop, the two drifted
street words, an address that must be left untouched, the service-area filter,
and every region resolving its own radius by name — plus, on the search side, a
local hit surviving a total provider outage, a row the polygon excludes from
both halves, and a one-character query that must touch neither the database nor
a provider. In `npm test`.

## The picker card said nothing when the pin resolved to nothing

Drag the pin over a field and the card read "Точка на карте" as heading and
"Точка на карте" again as detail, confirm button dead, no explanation. The
server's guidance — which names the rider's own town — was being discarded.

The picker now shows it, falls back to a localised
`passengerMapPointNoAddressHint` in all four languages, and paints the line in
the warning tone so the card reads as blocked. The hint is cleared when the
picker opens, when it is cancelled, and as soon as the map starts moving,
because a stale "move the pin" line under a new position is advice about the
wrong place.

The web client already behaved this way. This is mobile catching up.

## Address search could paint results for a query already gone

Both mobile search sheets awaited the API and set state on whatever returned.
The 360 ms debounce narrows that window but does not close it: a slow request
for "Абая" lands after a fast one for "Абая 1" and repaints the list under a
query the rider has moved past, and its `finally` clears the spinner while the
newer request is still running. The same file already guards the live driver
route with a request id; the search sheets never got one. Both have one now.

`_SimpleAddressSearchSheet` also searched **unscoped**. It is the picker for a
recurring route's pickup and dropoff and for saving a favourite — addresses
that go on to create real orders — so a rider ordering in Атакент could save
"улица Абая" from Шымкент and only discover it when the order flow refused.
It now takes the selected region.

Checked and found correct: the web search already guards itself with an effect
cleanup and is region-scoped, and the map picker's own reverse request already
had an id guard. The region default in `_AddressSearchSheet` is the rider's own
region, not `regions.first` by accident — `_destinationSearchRegions()` puts
the selected region first deliberately.

## A provider outage took down search the catalogue could answer

Found by writing the test, not by reading it.

`searchAddresses` puts the local gazetteer first and says so in a comment: "a
rider searching a street we do hold never waits on a slower, thinner remote
answer". The remote call sat inside the same `try` as the gazetteer, so when
every external provider was unreachable the 503 escaped from there, past a
`catch` that logged it as `[addresses] gazetteer lookup failed`, into a second
remote call that threw again. The rider got an error page for a street the
catalogue had in hand.

That is backwards exactly where it costs most: five of the thirteen launch
regions have no house-level OSM data, and the catalogue is the only thing that
answers for them. Giving it up because someone else's geocoder is down defeats
the reason for holding it.

The gazetteer and the remote enrichment now have separate error handling — a
gazetteer failure still falls through to the cascade, a provider failure leaves
the local results standing, and the cascade may still fail loudly when there
was nothing local, since an empty page would be a lie.

`searchAddresses` took the same executor seam as `reverseAddress`, which is how
the case became reachable at all.

## The two clients were drawing different markers

The address-picker marker is the only piece of art on the priority screen. The
web renders the approved file verbatim —
`design-reference/web-approved/assets/map-initial-square-tail-marker.svg`
inlined as `approvedAddressMarkerMarkup`. Flutter reproduced it from
hand-placed widgets and had drifted:

| | reference / web | Flutter, before |
|---|---|---|
| speed marks | 7 units, at (14,24) (23,24) (18,33) | 4.5 px, 1–2 px off position |
| "S" | filled with the badge gradient | flat `#1d6fff` |
| corner highlight arc | `M10 22C10 14 16.5 8 24 6.5` | absent |

The badge is now stated in the reference's own coordinate space — a 64-unit
viewBox whose badge starts at (2,2) and is 60 across — and scaled once through
a single `_unit`. The tail already worked that way. A test pins the three
details against both the reference file and the web markup.

The folder held a second, contradictory marker: `map-address-picker.png`, with
tapering speed lines instead of the three squares and a thin needle tail instead
of the wide one. Sitting in `web-approved/assets/` beside the real thing, it is
a plausible explanation for how one client ended up part-way between the two.
The owner confirmed on 2026-09-04 that the SVG is correct, so the PNG has moved
to `design-reference/rejected/` and `design-reference/README.md` now records
which file is the specification and which two implementations must follow it.

## CI's api job was red, so none of this gated anything

`npm test` stopped at `routing-location-check.js:101` — "a local street-level
catalog result is still surfaced". That assertion needed a live Postgres, and
the CI api job declares a `DATABASE_URL` with no postgres service behind it.
The chain is `&&`-joined, so the twenty-nine checks after it never ran, the
address checks among them. Confirmed against `c7ac03e` that it predates this
week's work.

Nothing else in the suite needs a database — `addresses-data-check.js` states
that convention in its own header. This one assertion was the exception, and it
made the whole gate depend on the environment. With the executor seam it is a
fixture now: one street row plus one active region whose boundary contains it.
Both statements must be answered, because `filterGazetteerRowsToServiceArea`
drops everything when the region list is empty.

`npm test` exits 0 with all 35 checks reporting ok.

Noted, not changed: CI pins Flutter 3.41.9 while this machine has 3.47.2.
Everything here was analysed and tested on 3.47.2 only.

## Still open

- **Not confirmed on a device.** The picker and the search sheets sit behind
  login, and SMS is still blocked on the Infobip sender ID. Everything here is
  verified by `flutter analyze`, `flutter test` (42), `npm test` (35 checks, now
  green) and reading. The app launches on the emulator with no exceptions, but
  no screen past the auth step has been seen.
- Five regions still have no house-level data at all. That is the RKA import.
- 17 pairs of service polygons overlap; trimming them needs local knowledge.
