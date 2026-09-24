# OneDriver brand assets — September 24 identity

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

## The mark

**OD, with the road under it.** The two letters are Inter at weight 900, set
solid and just touching, unioned into one silhouette. Under them run two lane
marks — a long one and a short one, with a gap between.

The road is not decoration. Letters alone are close to twice as wide as they
are tall, which sits badly inside a launcher icon: the mark ends up a thin
band across the middle of a square. The lane marks square the block up, and
they say what the app is for without drawing a car, a checker or a pin.

Two earlier attempts are worth not repeating. Merging the O and the D more
deeply turns the pair into one capsule that reads as a single letter. And
cutting a diagonal through them — the device the previous identity used for
its B — turns OD into the fraction `O/D`; through the O alone it becomes `Ø`.

The wordmark is outlined Inter at weight 750. Both come from the one
generator, so the icon on a phone and the logo on the site cannot drift apart.

Every shipped asset is **outlines, not text**. An SVG loaded through an `<img>`
tag cannot reach the page's webfonts at all, so a logo built from a `<text>`
element silently renders in Arial on the site and in whatever the platform
happens to have elsewhere. That is what an older wordmark did.

## What lands where

| Output | Used by |
| --- | --- |
| `apps/web/public/brand/*.svg` | the site, and the masters for everything below |
| `apps/web/public/brand/onedriver_icon_1024.png` | store listings |
| `android/.../mipmap-*/ic_launcher*.png` | Android 7 and older |
| `android/.../mipmap-anydpi-v26/*.xml` + `drawable/ic_launcher_*.xml` | Android 8+ adaptive icon, and the Android 13+ themed icon |
| `android/.../drawable/ic_launcher_foreground.xml` | the native launch screen, as a vector |
| `apps/mobile/.../assets/brand/*.png` | packaged Flutter brand resources |
| `apps/web/public/brand/onedriver_play_feature.png` | Google Play's feature graphic (1024×500) |

The splash used to also ship raster copies in `drawable/` and
`drawable-nodpi/`. Nothing referenced them and they went into every APK, one
of them 2.7 MB; they are no longer generated.

## Colours

| | |
| --- | --- |
| Field | `#1D6FFF` → `#0B4FD1` |
| Mark | `#FFFFFF` |
| Ink (logotype on light) | `#10264B` |

The review sheet is `design-reference/onedriver-brand-2026-09-24.png`, rendered
from the actual shipped vectors with 96, 64, 40 and 24px icon examples.
The PWA maskable icon has a full-bleed background. Native Android adaptive
and monochrome resources use the same monogram inside the safe area, drawn
smaller than the square icon: at full width a round launcher mask clipped the
lane marks.

## Checked, not assumed

The adaptive icon was rendered under all three masks Android applies — circle,
squircle and rounded square — and at 96, 72, 64, 48, 40, 32 and 24 px, plus
the Android 13 themed layer on a dark tile and the status-bar silhouette. The
gap between the lane marks closes below about 32 px; the mark still reads as
OD on a line, which is the size at which nothing finer would survive anyway.
