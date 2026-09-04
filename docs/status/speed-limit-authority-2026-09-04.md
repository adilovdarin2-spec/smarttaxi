# The speed limit is presented as regulatory, and it isn't

Handoff risk #5 says: *"Cameras, speed limits, signs and road alerts require a
legal, maintained data provider for the launch regions. Do not present
scraped/uncertain data as authoritative."*

The backend honours that carefully. `osm-navigation.service.js` documents
exactly what it is — community-tagged OpenStreetMap `highway=speed_camera`
nodes and `maxspeed` way tags, read through the public Overpass mirrors,
**never persisted** to `road_alerts` — and says plainly that coverage "depends
entirely on what OSM contributors have mapped; it's genuinely populated in big
cities and sparse-to-empty in small towns". No complaint with any of that. It
is the honest, legal, zero-cost option while there is no access to Sergek.

The presentation does not carry that honesty through.

## What the driver sees

`_SpeedLimitSign` (`driver_shell.dart`) draws an exact replica of a regulatory
sign: a 56 px white circle, a 5 px `#E0343A` red border, a black numeral.
Nothing distinguishes it from the sign on the pole. There is no source, no
qualifier, no "approximate".

## What the driver hears

Worse, because audio carries more authority and cannot be inspected:

```dart
_announceSpeedLimitChange(previousLimit, info.speedLimit);
…
_voice.announce(AppLocalizations.of(context).driverSpeedLimitAnnouncement(next));
```

`"driverSpeedLimitAnnouncement": "Ограничение скорости {limit}"` — a flat
statement of fact, spoken to someone driving, derived from a tag a volunteer
may have entered years ago or never entered at all.

## Why this matters beyond tidiness

- **Wrong high**: OSM says 90 where the posted limit is 60. The driver is told
  90 by their dispatch app.
- **Wrong low / missing**: sparse rural coverage means the sign simply vanishes,
  which trains drivers to ignore it — including where it is right.
- The app already knows how to make this distinction elsewhere:
  `driverAlertSpeedLimitHint` tells a driver reporting an alert
  *"Только если указано знаком"*. The crowd-reported path is careful about
  exactly the thing the OSM path states outright.

## Deliberately not changed here

Three options, all reasonable, none mine to pick:

1. **Qualify it.** Keep the sign and the announcement, mark them advisory — a
   caption under the sign and wording like "ограничение примерно 60" or
   "по данным карт, 60". Cheapest, keeps the utility.
2. **Demote the voice, keep the sign.** Silence is the safer default for audio;
   a glanced icon the driver can weigh is different from an instruction spoken
   at them.
3. **Hide until licensed.** Ship the layer only where a maintained provider
   covers, per handoff #5.

Not done blind because it is a safety-critical presentation in a domain the
handoff already assigns to the owner, and **the navigator cannot be looked at
from this session** — it is behind driver login, and SMS delivery is still
blocked on the Infobip sender ID. Changing how a speed limit is shown and
spoken to a driver, without being able to see or hear the result, is not a
change to make on inference.

The wording in options 1 and 2 also needs a native speaker's ear and, plausibly,
the same lawyer who approved the legal documents.
