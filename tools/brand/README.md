# BaiSapar brand assets — September 17 identity

Everything here is generated. Do not hand-edit the SVGs in
`apps/web/public/brand/`, the launcher PNGs, or the Android vector icons —
regenerate them:

```bash
rtk python tools/brand/build_brand.py
rtk node tools/brand/rasterise.cjs
```

`build_brand.py` needs `fonttools` and `skia-pathops`
(`pip install fonttools skia-pathops`). The cross-platform rasterizer requires
`sharp`, installed locally or resolved through `NODE_PATH`. The older Docker
script does not export the new maskable assets or review sheet.

## Why it is generated

The custom B/S monogram uses broad white shapes with a winding road in negative
space. The wordmark uses outlined Inter at weight 750. Both derive from the
single generator. There is no small text in the app icon, and authentication
screens retain text branding without an icon in their content.

Every shipped asset is **outlines, not text**. An SVG loaded through an `<img>`
tag cannot reach the page's webfonts at all, so a logo built from a `<text>`
element silently renders in Arial on the site and in whatever the platform
happens to have elsewhere. That is what the previous wordmark did.

## What lands where

| Output | Used by |
| --- | --- |
| `apps/web/public/brand/*.svg` | the site, and the masters for everything below |
| `apps/web/public/brand/baisapar_icon_1024.png` | store listings |
| `android/.../mipmap-*/ic_launcher*.png` | Android 7 and older |
| `android/.../mipmap-anydpi-v26/*.xml` + `drawable/ic_launcher_*.xml` | Android 8+ adaptive icon, and the Android 13+ themed icon |
| `android/.../drawable/baisapar_splash_icon.png` | the native launch screen |
| `apps/mobile/.../assets/brand/*.png` | packaged Flutter brand resources |
| `apps/web/public/brand/baisapar_play_feature.png` | Google Play's feature graphic (1024×500) |

## Colours

| | |
| --- | --- |
| Field | `#1D6FFF` → `#0B4FD1` |
| Mark | `#FFFFFF` |
| Ink (logotype on light) | `#10264B` |

The review sheet is `design-reference/baisapar-brand-2026-09-17.png`, rendered
from the actual shipped vectors with 96, 64, 40 and 24px icon examples.
The PWA maskable icon has a full-bleed background. Native Android adaptive
and monochrome resources use the same monogram inside the safe area.

## Concept provenance

Built-in imagegen was used for initial exploration. The final deliverable is
the vector master in `build_brand.py` with outlined typography, exported by
`rasterise.cjs`. Generated slogans are not part of the final identity.
The concept-generation prompt was:

> Use case: logo-brand. Create a refined original identity presentation for Kazakhstan taxi app BaiSapar. A single coherent concept, not alternatives. The symbol is a bold, elegant custom geometric capital B whose negative space suggests a smooth winding road, confident broad shapes, slightly forward moving, extremely legible at 24px. Premium contemporary mobility identity. Colors only white, electric royal blue #1D6FFF and deep blue #0B4FD1, very pale blue background #EAF3FF. No gold, no silver, no metallic textures, no jewels, no cars, no checkers, no generic location pin, no shadows or mockup devices. Main large square app icon on left, rich blue full field and centered white symbol. On right, identical symbol in blue paired with exact wordmark 'BaiSapar' in carefully spaced modern rounded geometric sans. Small repeat of the app icon to demonstrate small-size legibility. Beautiful restrained brand design presentation on white with lots of space. Flat vector-like edges. Do not imitate existing ride-hailing brands. This is a concept artwork; produce polished minimalist brand sheet.
