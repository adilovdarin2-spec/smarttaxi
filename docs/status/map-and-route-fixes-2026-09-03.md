# Map layering and route ETA — 2026-09-03

Follow-on from `address-region-geometry-2026-09-03.md`, same session. Four
defects, all found by reading the two map screens against each other and
against the web client.

Flutter could not be analysed here — there is no `flutter`/`dart` on this
machine's PATH — so the Dart changes are verified by reading, against the
`maplibre_gl` 0.21.0 API in the pub cache. Run `flutter analyze` and
`flutter test` before shipping them.

## 1. The driver's 3D buildings covered the street names

`driver_shell.dart`'s `_enable3dBuildings()` called `addFillExtrusionLayer`
with **no `belowLayerId`**. MapLibre puts a runtime layer above every existing
style layer unless told otherwise, so the extrusion went on top of the whole
style — including the symbol layers carrying street, POI and city names.

The navigation screen is the one place a street name has to stay readable, and
it was the screen drawing houses over them. This also contradicts the handoff's
"3D buildings are inserted below street/city/POI labels", which was true of the
passenger map only.

## 2. The passenger's 3D buildings were one style change from disappearing

`passenger_shell.dart` did pass an anchor, but a hardcoded one:
`belowLayerId: 'road_one_way_arrow'`. That layer exists in the deployed
OpenFreeMap Liberty style. In a style without it, `addFillExtrusionLayer`
throws, and the surrounding `catch (_)` — there to tolerate a missing building
source — swallowed it. The map would silently lose its buildings altogether
rather than draw them in a slightly different place.

Both now call `resolveLabelAnchorLayerId()` in the new
`lib/core/utils/map_layers.dart`:

- `road_one_way_arrow` stays the first choice, so the deployed style keeps the
  exact layering it was QA'd with;
- otherwise the lowest label layer by name, since `getLayerIds()` returns style
  order bottom-first — the same anchor `MapView.jsx` computes on the web;
- otherwise null, which is MapLibre's own default and the only sensible answer
  for a style with no labels to stay readable above.

## 3. The web route line was painted over the street labels

`MapView.jsx` added `smarttaxi-route` and `smarttaxi-route-shadow` with no
`beforeId`, so 4 px of near-opaque `#1D6FFF` plus an 8 px blurred shadow went
on top of the entire style — laid along exactly the streets a rider following
the route is trying to read. The 3D building layer in the same file already
resolved a label anchor correctly; the route layers just never used it.

Both route layers now take the same anchor, extracted as `firstLabelLayerId()`.
Markers are unaffected: `maplibregl.Marker` is a DOM overlay and stays above
the canvas, so pickup/dropoff/driver pins remain on top of the buildings.

## 4. The web passenger never saw an ETA at all

`driverEtaText(order)` read `order.driver_eta_min`, `order.driverEtaMin` and
`order.etaMin`. **No endpoint writes any of them** — grep the API for all three
and there is not one hit. So the function could only ever reach its two status
sentences ("Водитель едет к точке подачи" / "Водитель подтвердил заказ").

Meanwhile the same screen already fetches the live driver→target leg every 8 s
into `liveRoute`, and the Flutter app renders a minute figure from that exact
response (`_driverPickupMeta`). So the web passenger was the only one of the
three clients without an ETA.

`driverEtaText(order, route)` now reads `route.durationSeconds` first, threaded
through from `activeRoute` at all three call sites (`clientLifecycleStage`, the
driver-found header, `RideStatusNote`). The old order fields stay as a fallback
rather than being deleted, in case a future endpoint does populate them.

### And it says when the number is a guess

When OSRM is unreachable, `routing.service.js` answers with
`straightLineRouteFallback()`: great-circle distance padded by 1.3, ETA at a
flat 28 km/h, `fallback: true` on the response. The driver app appends
"приблизительно" for this (`liveRouteMeta`); the passenger apps did not, on
either platform, despite reading the same field.

That is the wrong way round — the passenger is the one deciding whether to keep
waiting. Both passenger clients now append it:

- Flutter `_driverPickupMeta` reuses the existing `driverRouteFallbackNotice`
  string, already translated in ru/kk/uz/zh;
- web appends " · приблизительно".

This closes the open item from `blue-white-design-pass-2026-08-02.md`
("no UI badge for приблизительно").

## Not changed

`searchGazetteer()` labels a result with the *requested* region rather than the
one that owns the row. Section 6 of the address audit called this worth fixing;
on reading the code it is a deliberate decision with its reasoning in place —
"otherwise a valid border-street can look as if it belongs to a neighbouring
town". Left alone. The remaining option for the overlap problem is trimming the
boxes, which needs local knowledge of where each settlement ends.

## Verification

- `npm --prefix apps/web run build` — ok
- `npm --prefix apps/api run syntax` — ok
- `node apps/api/src/tools/addresses-data-check.js` — ok
- Dart: not analysed (no Flutter toolchain here). `belowLayerId` is `String?`
  in `maplibre_gl` 0.21.0 and `getLayerIds()` exists, both confirmed against
  the pub cache.
