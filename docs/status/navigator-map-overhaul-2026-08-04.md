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

## Open, not yet resolved: the incoming-order card shows no addresses

Screenshot 54. The driver's "Заказы в регионе" card renders **"Точка
посадки" / "Точка назначения"** where the street names should be, for an
order that definitely has them (улица Бектасова → улица Акниет). Those
two strings are exactly the fallbacks in `OrderSummary.fromJson`
(models.dart), so the parsed `pickup`/`dropoff` came back empty.

Not yet established which of these it is, and it matters:

1. **A bug.** `ORDER_SELECT` starts with `o.*` and
   `publicOrderResponse` spreads the whole row, so the REST list *should*
   carry `pickup_text`. If it does and the card still shows fallbacks,
   something between is dropping it.
2. **Deliberate privacy.** `publicOrderEvent()` intentionally strips
   pickup/dropoff text from the broadcast-to-many-drivers payload, and
   hiding the exact address until a driver accepts is normal for the
   category — Yandex does it too. If the card is fed from the socket
   event rather than the REST row, this is working as designed.

Worth resolving before judging it: if it is (2), the card should still
say something useful — a district, or a distance — rather than a bare
placeholder that reads as missing data. Right now a driver decides
whether to accept without knowing where the trip goes, and the card
looks broken either way.

## Ground rules for this work

- Verify by looking, not by reading. Every claim in this document must
  trace to a screenshot or a measured pixel.
- Check `lastUpdateTime` against the APK mtime before trusting any
  post-install screenshot — a chained install has silently failed
  before and produced a convincing false negative.
- Sample pixels rather than judging colour by eye.

---

## Round 2 — 2026-08-05 evening: the navigator's bottom panel

Everything below traces to a screenshot in
`qa_screenshots/bluewhite_2026-08-03/`, taken after checking
`lastUpdateTime` against the APK mtime.

### What screenshot 60 showed, and what it cost

The panel had been rebuilt as three equal-width metric cards (Скорость /
Осталось / В пути). On device that was worse, not better:

- **The middle card showed no number at all** — just the word "Осталось"
  and the unit "км". A 40sp value in a card one-third of the screen wide
  cannot fit "2.7", and the `TextOverflow.ellipsis` swallowed it.
- **The panel said everything twice.** The strip above already read
  "До места назначения: 2.7 км · 9 мин"; the cards below repeated the
  same two figures.
- The speed card's "0" sat alone in white space — the equal-thirds grid
  gives every reading the same room regardless of how much it needs.

### What replaced it (screenshots 62, 63)

- A round **speed dial** (72px, blue ring, red when speeding) — an
  instrument shape, spotted without being looked for.
- A **content-sized route block**: "2.7 км" at 28sp, "9 мин" beside it at
  16sp, "Прибытие в 23:21" underneath. Arrival is computed off the live
  remaining duration, so it moves as traffic does. A driver answering
  "сколько ещё" says a time, not a duration.
- The **top line now names the target address** instead of repeating the
  numbers, with a person icon for the pickup leg and a pin for the
  drop-off leg.

### Two map defects fixed in the same round

**The pickup pin looked like the driver's own position.** It was
`radio_button_checked_rounded` on blue — a blue disc inside a white ring,
which is the glyph Google, Yandex and every other map uses for "you are
here". A few metres from the car marker it read as a second, offset copy
of the driver. It is `person_rounded` now, on all three driver maps.

An earlier note in this session called this "два разных маркера машины,
смещённых друг от друга". That reading was wrong — they were never two
self-markers. The pin was the passenger all along; it simply looked like
something else, which is the same defect from the driver's side.

**The pickup pin outlived its purpose.** Once the passenger is aboard the
navigator kept drawing it, leaving a destination-looking marker in the
middle of a route that no longer passes it. Now gated on the leg.

### Route line

The casing was `Colors.white` at 0.9 alpha under a 5.5px core. On a
near-white map that is not a casing — the route was a bare thin stroke the
street grid kept cutting through. Now a `goldDeep` casing under a `gold`
core, 12/8 on the navigator and 11/7 elsewhere, on both driver maps and
the passenger map.

### Not a bug: the "Точка назначения" placeholder

The destination reads as a literal placeholder in screenshots 62/63.
`GET /drivers/me/active-order` does `SELECT o.*`, so `dropoff_text` does
reach the app, and `OrderSummary.fromJson` reads it directly. The test
order simply carries that string in the column. Test data, not a defect —
but a demo order should be created with a real address.

### Still open

- The maneuver banner is a dark navy surface in light theme. Off-palette,
  but high-contrast and legible, and mainstream navigators do the same.
  Left alone deliberately rather than by omission.
- Addresses: gazetteer search must handle Russian and Kazakh street forms
  (the customer confirmed both are used); 11 of 13 regions still
  unimported.
