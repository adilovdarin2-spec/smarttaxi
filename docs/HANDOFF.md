# Handoff — where this project stands, 2026-08-07

Read this first. It is the shortest path to being useful here, and it names
the traps that have already cost real time.

## Getting the code

Everything is in git and pushed. There is nothing to copy by hand.

    git clone -b dev https://github.com/adilovdarin2-spec/smarttaxi.git

Branch `dev` is the working branch and what production deploys from. `main`
is stale — a worktree checked out from it once and was missing most of the
app.

**Not in git, and deliberately so:** `.env` files carrying Railway,
MapTiler and Firebase keys. Configure those in Railway's own settings. Do
not paste them into a chat.

**Not worth moving:** `qa_screenshots/`, `output/`, `data/osrm/` — working
debris.

## Shape of the repo

- `apps/api` — Node/Express, Postgres, Socket.IO. Deploys to Railway.
- `apps/mobile/smarttaxi_app` — Flutter, passenger and driver in one binary.
- `apps/web` — React panels (client, driver, admin).
- `docs/status/*.md` — what was actually done and verified, dated.

## How things actually run

- **The backend deploys only on `git push origin dev`.** A local commit
  changes nothing in production.
- Railway has two services. `smarttaxi-api` is the backend;
  `smarttaxi-web` is the panels. Deployments listed against the *project*
  show the web service and are often SKIPPED — that is not the API. Check
  the API service explicitly before concluding a deploy failed.
- **The container cannot reach Overpass.** Anything needing OSM data must
  be harvested on a developer machine and committed. See
  `docs/status/address-gazetteer-2026-08-06.md`.

## Verification discipline that earned itself

Every one of these came from getting it wrong first:

- **Compare `dumpsys package … lastUpdateTime` against the APK's mtime
  before trusting any post-install screenshot.** A chained
  `install && start && screencap` once swallowed a failed install and the
  screenshot showed the previous build.
- **`adb install -r -t`** — the `-t` flag clears
  `INSTALL_FAILED_USER_RESTRICTED`. Still intermittent; retry after ~12s.
- **Editing repo files from Python flips LF to CRLF.** `flutter analyze`
  and `git diff --stat` stay clean while `test/widget_test.dart` fails with
  a message pointing at code you never touched. Bash `cat -A` does *not*
  detect it — the MSYS tools normalise the output. Pass `newline='\n'`.
- **Type phone numbers into the app digit by digit with ~0.45s spacing**
  and read them back off a screenshot before submitting. Fast `adb input
  text` scrambles them.
- **Measure before cutting.** A "fix" to the address region rule would have
  discarded 63 807 of 81 603 rows; it was caught only by printing the count
  before pushing.

## Open, and honestly open

1. **The Uzbek border.** Мырзакент straddles it and the 25 km service-area
   floor cannot separate two countries — ~36 Guliston addresses still reach
   riders there. Needs the actual boundary polygon or a country filter at
   harvest time, not a distance threshold.
2. **Атакент: 364 rows unexplained.** The manifest expects 3 489, the
   loader wrote 3 125, and both use the same function. Until understood,
   Атакент re-upserts on every boot.
3. **The passenger app has not had its design pass.** The driver side has
   (Линия, Заказы). Doing it needs the device logged in as the seed client.

## What "done" has meant here

The customer's complaints were addresses, navigator, route and design. The
first three are closed and verified against the live API — Мырзакент went
from returning nothing but its own name to answering with house numbers,
schools, and Kazakh category words. Design is two screens in out of roughly
twenty.

Nothing in `docs/status/` claims more than was measured. Keep it that way —
three separate "fixes" in one day looked complete and were not, and each was
only caught by checking production rather than reasoning about it.
