# SmartTaxi — Blue/White Design System (canonical, 2026-07-15)

Decided by the product owner on 2026-07-15, and the only colour direction in
the repository since 2026-09-03: the dark-graphite-gold and gold-white
packages that this used to supersede have been deleted, along with every gold
pigment and every `gold`-named token in the Flutter app and the web PWA.
See `docs/design/DESIGN_AUDIT.md` for what was removed.

Reference mockup (tokens + key screens + toast + admin table): see the artifact built alongside this doc, or regenerate from the tokens below — the values here are the source of truth, not the artifact.

## Color tokens

> **Reconciled 2026-08-02.** The accent/surface hexes originally written
> here (`#2C5FE0` / `#F4F7FD` / `#152352` …) were never actually
> implemented anywhere. Both products shipped a slightly brighter blue
> ramp instead, and the web CSS additionally carried four competing
> `:root` override layers with their own near-miss values. The table
> below now records the ramp that is really in the code, verified
> against `SmartTaxiColors` (mobile) and every `:root` layer in
> `apps/web/src/styles.css` — so mobile, web and this doc agree. Don't
> "restore" the old hexes: they would repaint every screen the product
> owner has already signed off on.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F7FBFF` | `#05070C` | page background |
| `surface` | `#FFFFFF` | `#0D121F` | cards, sheets |
| `surface-2` | `#F2F7FF` | `#141B2E` | recessed panels, map background |
| `border` | `#E1E7F5` | `#1F2740` | hairlines |
| `text-primary` | `#10192E` | `#F5F7FB` | body text |
| `text-secondary` | `#5B6B8C` | `#9AA4BA` | muted/labels |
| `text-muted` | `#93A0BE` | `#6B7488` | placeholders, captions |
| `accent` | `#1D6FFF` | `#1D6FFF` | primary CTA, links, active states |
| `accent-sky` | `#65A3FF` | `#93C5FF` | gradient top (splash/CTA), light accents |
| `accent-deep` | `#0B4FD1` | `#5B9BFF` | gradient bottom (splash/CTA), dark accents |
| `success` | `#16A34A` | `#16A34A` | |
| `danger` | `#DC2626` | `#EF4444` | SOS, cancel, errors |
| `warning` | `#C98A12` | `#E0A93A` | amber, deliberately NOT a blue — see below |

`warning` spent a while set to `#0B66D8`, a blue almost identical to
`accent`, which made every "needs attention" state (road hazards, pending
payouts, active-trip pills, rating stars) read as an ordinary CTA. It is
an amber on purpose; keep it clearly distinct from `accent`.

Splash/auth gradient: `linear-gradient(180deg, accent-sky 0%, accent 55%, accent-deep 100%)` — this is what's already implemented on the auth screens tonight; treat it as the reference gradient everywhere else a hero/gradient surface is needed (not just auth).

## Typography

No custom webfont — use the system stack (renders Cyrillic correctly on every platform, no CDN/embedding risk):
- Display/headings: `-apple-system, "Segoe UI Semibold", "Segoe UI", ui-rounded, system-ui, sans-serif`, weight 600, slight negative letter-spacing on large sizes (prices, headline numbers).
- Body: `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`, weight 400.
- Prices and any tabular numbers: `font-variant-numeric: tabular-nums`.

## Component rules

- Radius: 14px cards, 12px controls/inputs, 18-20px phone-frame-style sheets, full pill (999px) for chips/badges.
- Borders: 0.5-1px hairline in `border` token, not heavier — this is a light, airy system, not a heavy-outlined one.
- One accent per screen. Don't mix accent-filled buttons with other brand colors.
- Semantic colors (`success`/`danger`/`warning`) are separate from `accent` — never repurpose accent for status.
- Map markers: "моё местоположение" = solid accent dot with soft pulsing ring (`accent` at low opacity, `scale` animation, respects `prefers-reduced-motion`); "выбранный адрес" / "выбор адреса" = single accent teardrop pin, IDENTICAL shape for pickup and dropoff (see [[feedback_map_marker_consistency]] equivalent — only the field label differs, never the marker art).
- Toast/notification: top-center, slides down from above the screen, auto-dismiss (longer for errors), stacks up to ~3.

## Screens covered in the reference artifact

Splash/auth, order creation with price-negotiation slider, active trip with driver counter-offer + quick-message chips + SOS, settings, trip history, driver navigator (camera-distance banner, live speed, ETA), favorites + referral, driver earnings/payout, plus a toast demo and an admin promo-codes table (desktop density, same tokens). All built from the token table above — no extra colors introduced.

Cross-checked against `docs/status/*-overnight-2026-07-15.md` this pass: no `mobile-overnight` status file exists yet (mobile session hasn't landed a fresh commit since the last check) — nothing to reconcile yet, will re-check next cycle. `routing-overnight` shows a straight-line fallback route mode (1.3x road-distance factor) with no UI badge for "приблизительно" — worth a small `warning`-token badge on the trip card if a route is ever in fallback mode, using the existing map-mock/card pattern above rather than a new component.

## Migration status

Closed on 2026-09-03. The gold theme is gone from the product: no gold hex
survives in `apps/web/public/ui`, `apps/web/public/legal`, the landing page or
`apps/mobile/smarttaxi_app/assets` (the Kazakhstan flag keeps its yellow), and
the `gold*` token names in `styles.css` and `SmartTaxiColors` are now `brand*`.
The only remaining mentions are historical notes in `docs/status/` and three
source comments that explain why a value changed.
