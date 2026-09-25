# Missing l10n commit — broken clean-checkout build, fixed — 2026-07-26

User noted the other parallel sessions had gone idle. Checked `git status`
on the tree they'd been editing and found generated-l10n files still
uncommitted, unchanged across several idle autonomous-loop ticks —
confirming they'd stopped, not just paused. Investigated instead of
assuming it was harmless leftover WIP.

## The actual problem

`driver_support_screen.dart` (built for the driver ticket-history follow-up)
and `passenger_shell.dart`'s recurring-booking skip display (built for the
skip-visibility follow-up) — both already committed and pushed to
`origin/dev` — reference l10n getters:
`driverSupportHistoryTitle`, `driverSupportStatusResolved`,
`driverSupportStatusPending`, `driverSupportResponseLabel`,
`driverSupportLoadError`, `driverSupportEmptyTitle`, `driverSupportEmptyText`,
`passengerRecurringStatusSkippedToday`, `passengerRecurringSkippedTodayText`.

These getters did not exist in the committed `app_ru.arb`/`app_kk.arb`/
generated `app_localizations*.dart` files — confirmed directly via
`git show HEAD:path` before touching anything. The `.arb` sources and
their generated Dart getters had been sitting in the working tree only,
apparently added by whichever session built those screens, never
staged/committed alongside the `.dart` files that reference them.

**This session's own `flutter analyze` had been reporting clean
throughout**, which is exactly why this went unnoticed for as long as it
did: `flutter analyze` runs against the working tree, and the working
tree happened to still have these files present locally. But
`origin/dev` as it stood — what anyone would get from a fresh
`git clone` — had committed code calling getters that didn't exist in the
committed generated l10n files. That build would have failed to compile.

## Fix

Committed the missing state as-is (no code changes, purely the
already-correct `.arb`/generated-`.dart` content that had been sitting
uncommitted): `app_ru.arb`, `app_kk.arb`, `app_localizations.dart`,
`app_localizations_ru.dart`, `app_localizations_kk.dart`. Diffs were
purely additive (130 insertions, 0 deletions across 5 files) — verified
before staging, consistent with what the referencing code actually needed.

## Verification

- Confirmed via `git show HEAD:<path>` (both before and after the fix)
  that the getters were genuinely absent from the prior commit and
  present after.
- Attempted a fresh clone + checkout of the pre-fix commit to prove the
  broken state reproducibly from a clean tree — hit an unrelated Windows
  `MAX_PATH` limitation on long asset/iOS project paths during checkout,
  not something worth working around for a already-conclusively-proven
  point. The `git show HEAD:path` evidence is direct and sufficient.
- Cross-checked for any *other* similar gaps by diffing every `l10n.xxx`
  reference in the codebase against every getter defined in
  `app_localizations.dart`. Initial pass showed ~60 "missing" names, but
  these were false positives from an imprecise regex (methods taking
  parameters, e.g. `String passengerTimeAgoDays(int days)`, don't match a
  plain-getter pattern) — spot-checked several and confirmed they're
  correctly defined. `flutter analyze` already type-checks every
  reference in the codebase and passed clean against the fully-committed
  state, which is the authoritative signal here; no further gaps found.
- `flutter analyze`: no issues. `flutter test`: 35/35 pass.

## Why this matters going forward

This is the same class of risk flagged in `project_prod_backend_deployment_gap.md`
memory for the backend (recurring uncommitted-file risk silently breaking
deploys) — turns out it applies to generated mobile l10n files too. Worth
a habit: after any round of parallel-session work lands, check
`git show HEAD:<referenced-file>` for anything a newly-added screen reads
from, not just that the working tree currently compiles.
