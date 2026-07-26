# Address search quality + car marker size fix — 2026-07-26

User reported the address search results were showing "a lot of
identical, nonexistent, unclear addresses," and the driver car icon on
the passenger map should have one fixed, smaller size. Two commits on
`dev`, pushed.

## Address search: reproduced live, then fixed the root cause

Queried the live prod API (`GET /api/routes/addresses/search`) with
`q=абая&region=Атакент` and confirmed the exact complaint: the response
included the real street "улица Абая" **three times** (two copies ~190m
apart from different providers disagreeing on the exact coordinate, one
from a genuinely different, more distant village that happens to share
the same generic street name), plus two unrelated villages ("Абай",
"Абат") that only matched by loose string similarity — MapTiler's
"closest guess" behavior when nothing it found actually contains the
query text.

Fixed in `routing.service.js`, in the two functions every address-search
result path already funnels through:

- **`dedupeAddressSuggestions`**: now merges same-label results within
  600m of each other (not just literally-identical coordinates, which is
  all the old exact-key dedup caught). Left alone on purpose when two
  same-label results are kilometers apart — different towns can each
  have their own real street of the same name, and merging those would
  wrongly hide one instead of letting the subtitle disambiguate.
- **`filterRegionAddressSuggestions`**: now drops zero-relevance matches
  (nothing in label/subtitle/city/region actually contains the query
  text) whenever at least one better match exists, instead of letting a
  provider's fuzzy guess dilute the list. Falls back to keeping them if
  literally nothing scores better, so a genuinely obscure query still
  returns something instead of an empty list.

Added a regression test to `routing-location-check.js` reproducing the
exact live scenario. `npm test`: 29/29 pass.

## "Add real addresses for every region" — partially done, rest explained

All 13 seeded regions already have curated `LOCAL_ADDRESS_HINTS` entries
(confirmed: region list in `seed.js` matches 1:1 with the hints file),
most with 2-9 landmarks each (streets, bazaar, akimat, hospital, bus
station), all cited against Wikipedia/2GIS/postaldb in code comments.
Four are thin (just the village center point): Киров, Ынтымак, Бирлик,
Мактаарал.

Attempted to research real additional landmarks for these four the same
way the existing entries were sourced. Found genuine ambiguity, not just
missing data: multiple searches suggest Kirov/Orgebas and Yntymak may not
have their own separate rural-district akim office at all — they may
fall under a neighboring village's shared rural-district administration
(Zhanazhol's, per one source), which is already a separate hint entry.
The one legal document that would settle this precisely
(`adilet.zan.kz/rus/docs/V15UG003059`, the Maktaaral district's own
"apparatus of akim" establishment order) couldn't be fetched — certificate
verification failure from this environment.

Given that ambiguity, adding a specific address for these four villages
would mean guessing rather than citing a real source, which breaks the
rigor every other entry in this file follows. Not done. The address-
search ranking fix above helps these four regions too, though — it's
what determines the quality of whatever the live geocoder (which does
have real street-level data even for small Turkestan villages, confirmed
during testing) returns for them, since they have no curated fallback
to lean on.

If real local landmarks/addresses for these four are known (even
informally — a bazaar name, a school, a mosque), that's exactly what
would let more entries be added with the same confidence as the existing
ones.

## Car marker: unified to one fixed, smaller size

`passenger_shell.dart` had two different sizes for the same car icon:
38 for nearby free drivers before a match, 58 (in a 76×76 box) for the
specific driver once assigned and tracked for the rest of the trip —
nearly 1.5x bigger for no functional reason. Unified both to a single
`_driverCarMarkerSize = 40` constant.

`flutter analyze` clean, `flutter test` 35/35. No live on-device visual
verification — sideloading a debug APK onto the available test device is
blocked by a device-level `INSTALL_FAILED_USER_RESTRICTED` policy (same
limitation hit earlier this session on the driver-wallet fix), and
Flutter web can't render in this environment's browser preview (an
established, unrelated limitation from an earlier session). Verified via
direct code tracing of both marker call sites and the shared
size+18-padding convention instead.
