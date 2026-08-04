# Navigator / route / map overhaul — brief and plan (2026-08-04)

## The brief, as given

The customer called four things badly done: **the in-trip navigator, the
route drawing, the map's behaviour, and the map's appearance.** No
verbatim quotes were available — all four areas were confirmed as in
scope.

Decisions taken so I can work unattended:

- **Reference to match: Яндекс Go.** When a judgement call comes up, the
  question to ask is "what would Yandex Go do here".
- **Free tiles only.** No MapTiler key, no Google, no 2GIS. Stay on OSM
  raster and get everything possible out of what sits *on top* of it.
- **Authority granted:** rewrite navigator logic (not just colours),
  push backend to prod, phone stays connected for visual checks, and
  test orders may be created/completed against production with the seed
  accounts.

## The tension worth naming

"Free only" and "the map looks cheap" pull against each other. Yandex
renders buildings, courtyards, POIs and labels from its own commercial
data; plain OSM raster will never reach that, and no amount of code
changes it. What *is* reachable: most of the cheap feeling comes from
what is drawn over the tiles — route line weight and smoothing, marker
craft, camera behaviour, the manoeuvre panel. That is where the effort
goes.

## Order of work

1. **See it first.** The navigator has never been observed on-device
   with a live route. Create a test order, take the driver into an
   active trip, and screenshot the navigator before changing anything —
   the complaint is about behaviour, and behaviour cannot be judged from
   source.
2. **Route line.** Weight, colour, casing/outline, joins and caps,
   smoothing. A thin hairline polyline is the single strongest "cheap"
   signal versus Yandex's thick cased route.
3. **Camera.** Follow the car, course-up rotation, sensible zoom for
   speed, smooth interpolation rather than jumps, and a recenter
   affordance that behaves after a manual pan.
4. **Manoeuvre panel.** Next turn, distance to it, street name,
   lane/exit where available.
5. **Tiles.** Evaluate the free OSM style options; keep the cool tint
   already in place. Lowest expected payoff of the four — noted so it
   does not eat the night.

## Two things found while setting up the test rig

**A finished trip blocks the client from ordering again.**
`CLIENT_ACTIVE_ORDER_STATUSES` (order-dispatch.service.js:48) includes
`TRIP_COMPLETED` and `PAYMENT_PENDING`, so until someone marks the fare
received the rider gets `CLIENT_HAS_ACTIVE_ORDER` on the next order.
That is deliberate — an unpaid ride should not let you book another —
but it is a live demo hazard: complete one trip in front of an audience
and the second booking fails with an error. The way out is the driver's
"Оплата получена" (`POST /orders/:id/mark-paid`). Order
`1cae24bb-…` is currently sitting in exactly this state and needs
clearing before the passenger account can order again.

**Driver curl tokens and the driver phone session are mutually
exclusive.** Signing the device in as the driver rotates
`session_version` and invalidates any driver token held by curl (and
vice versa) — this is the single-active-session feature working as
designed. Consequence for this work: with the phone signed in as the
driver, order state can no longer be driven over HTTP as the driver.
Either drive it through the driver UI on the phone (which is the better
test anyway, since it exercises the incoming-order card), or create
orders with the *client* token, which does not conflict.

## Ground rules for this work

- Verify by looking, not by reading. Every claim in this document must
  trace to a screenshot or a measured pixel.
- Check `lastUpdateTime` against the APK mtime before trusting any
  post-install screenshot — a chained install has silently failed
  before and produced a convincing false negative.
- Sample pixels rather than judging colour by eye.
