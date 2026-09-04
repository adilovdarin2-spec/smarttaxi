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
and every region resolving its own radius by name. In `npm test`.

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

Note for whoever picks this up: `map-address-picker.png` in the same folder
shows a *different* marker — speed lines rather than squares, a needle tail.
The status doc names the HTML as the approved one, and the HTML matches the
SVG, so the PNG is the odd one out. Worth deciding which is actually wanted.

## Still open

- **Not confirmed on a device.** The picker and the search sheets sit behind
  login, and SMS is still blocked on the Infobip sender ID. Everything here is
  verified by `flutter analyze`, `flutter test` (42), `npm test` additions and
  reading; none of it has been seen on the emulator.
- Five regions still have no house-level data at all. That is the RKA import.
- 17 pairs of service polygons overlap; trimming them needs local knowledge.
