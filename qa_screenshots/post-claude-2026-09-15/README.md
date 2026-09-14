# BaiSapar web visual QA — 2026-09-15

These are unedited screenshots from the repository's local-only Playwright
harness against `http://127.0.0.1:5175` and the isolated development API on
`http://127.0.0.1:4001`.

- `client/`: passenger home, address picker, unresolved-address guard, tariff
  choice and payment sheet at compact phone widths.
- `driver-presentation/`: seeded local driver login, line, incoming orders and
  income screens at 360 and 390 px. `result.json` records that the run stayed
  local and did not change the driver's shift.

The first driver capture exposed a six-item navigation still laid out in five
columns. The committed images are from the corrected rebuild: all six items are
on one row and the shift action remains fully visible above them. These are web
captures, not Android or physical-road evidence.
