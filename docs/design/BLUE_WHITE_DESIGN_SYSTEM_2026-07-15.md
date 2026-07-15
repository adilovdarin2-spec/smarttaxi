# SmartTaxi — Blue/White Design System (canonical, 2026-07-15)

Decided by the product owner on 2026-07-15. This **supersedes the color direction** in:
- `docs/design/DESIGN_AUDIT.md` (dark graphite + gold) — structural notes (radius, spacing, icon style) still apply, colors do not.
- `docs/SMARTTAXI_CLIENT_GOLD_WHITE_UX_BLUEPRINT.md` (gold + white) — same: structure fine, colors superseded.

Any screen currently built in dark-graphite-gold or gold-white should be migrated to the tokens below when touched. Don't do a blanket repaint pass unless explicitly asked — migrate opportunistically as you work on a screen.

Reference mockup (tokens + key screens + toast + admin table): see the artifact built alongside this doc, or regenerate from the tokens below — the values here are the source of truth, not the artifact.

## Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F4F7FD` | `#0B1224` | page background |
| `surface` | `#FFFFFF` | `#101B34` | cards, sheets |
| `surface-2` | `#EEF2FC` | `#16223F` | recessed panels, map background |
| `border` | `#E1E7F5` | `#23335C` | hairlines |
| `text-primary` | `#10192E` | `#EAF0FF` | body text |
| `text-secondary` | `#5B6B8C` | `#93A5D1` | muted/labels |
| `text-muted` | `#93A0BE` | `#5E6E96` | placeholders, captions |
| `accent` | `#2C5FE0` | `#6FA1FF` | primary CTA, links, active states |
| `accent-sky` | `#6FA8FF` | `#93C5FF` | gradient top (splash), light accents |
| `accent-deep` | `#152352` | `#0A1330` | gradient bottom (splash), dark accents |
| `success` | `#1E9E6B` | `#3FC088` | |
| `danger` | `#E14B4B` | `#F17575` | SOS, cancel, errors |
| `warning` | `#C98A12` | `#E0A93A` | |

Splash/auth gradient: `linear-gradient(180deg, accent-sky 0%, accent 55%, accent-deep 100%)` — this is what's already implemented on the auth screens tonight; treat it as the reference gradient everywhere else a hero/gradient surface is needed (not just auth).

## Typography

No custom webfont — use the system stack (renders Cyrillic correctly on every platform, no CDN/embedding risk):
- Display/headings: `-apple-system, "Segoe UI Semibold", "Segoe UI", ui-rounded, system-ui, sans-serif`, weight 600, slight negative letter-spacing on large sizes (prices, headline numbers).
- Body: `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`, weight 400.
- Prices and any tabular numbers: `font-variant-numeric: tabular-nums`.

## Component rules

- Radius: 14px cards, 12px controls/inputs, 18-20px phone-frame-style sheets, full pill (999px) for chips/badges.
- Borders: 0.5-1px hairline in `border` token, not heavier — this is a light, airy system, not a heavy-outlined one.
- One accent per screen. Don't mix accent-filled buttons with gold/other brand colors left over from the old systems.
- Semantic colors (`success`/`danger`/`warning`) are separate from `accent` — never repurpose accent for status.
- Map markers: "моё местоположение" = solid accent dot with soft pulsing ring (`accent` at low opacity, `scale` animation, respects `prefers-reduced-motion`); "выбранный адрес" / "выбор адреса" = single accent teardrop pin, IDENTICAL shape for pickup and dropoff (see [[feedback_map_marker_consistency]] equivalent — only the field label differs, never the marker art).
- Toast/notification: top-center, slides down from above the screen, auto-dismiss (longer for errors), stacks up to ~3.

## Known deviation

Three chats (mobile/web) started tonight's work referencing the old gold-based docs before this decision was made. Sections already built there may still be gold-themed — that's expected technical debt, not a bug to panic about. Fix opportunistically per the migration note above.
