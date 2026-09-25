# BaiSapar icon and logo — 2026-09-17

Replaced the previous glossy/silver raster launcher and older blue/gold SVGs
with one blue/white road monogram. The new full logo combines the mark with an
outlined BaiSapar wordmark. Light/dark SVG and PNG variants are available in
`apps/web/public/brand`. The actual delivered artwork is shown in
`design-reference/baisapar-brand-2026-09-17.png`.

Updated Android legacy, round, adaptive, themed and notification resources,
native splash, packaged Flutter artwork, PWA icons and the standalone Flutter
web manifest/icons. Authentication screens retain text-only branding.
No iOS signing, store upload or device installation was performed.

`tools/brand/build_brand.py` is the vector master and
`tools/brand/rasterise.cjs` exports raster assets without Docker. Source prompt,
tool provenance, palette and reproduction steps are in `tools/brand/README.md`.

Validation: visually inspected the actual exported review sheet, including
24/40/64/96px examples; four web brand tests passed; Vite production build and
map build checks passed; all 36 Flutter widget checks passed; Android debug
APK built successfully. Existing Kotlin
Gradle Plugin deprecation warnings remain unrelated to the artwork change.

APK: `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`.
