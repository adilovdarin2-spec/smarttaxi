# BaiSapar brand assets

Everything here is generated. Do not hand-edit the SVGs in
`apps/web/public/brand/`, the launcher PNGs, or the Android vector icons —
regenerate them:

```bash
python tools/brand/build_brand.py
docker run --rm -v "$(pwd):/repo" -w /repo alpine:latest sh tools/brand/rasterise.sh
```

`build_brand.py` needs `fonttools` and `skia-pathops`
(`pip install fonttools skia-pathops`). The rasteriser needs nothing but
Docker; the container installs `rsvg-convert` itself.

## Why it is generated

The mark is the name's own **B** — Inter Black, the typeface the apps already
ship — with one slanted gap cut through it: the road. Because the icon and the
logotype come from the same letterform, the badge reads as the first letter of
the name rather than as a separate drawing, and neither can drift from the
other.

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
| `apps/mobile/.../assets/brand/*.png` | the app's own screens |

## Colours

| | |
| --- | --- |
| Field | `#1E4FD0` → `#12307A` |
| Gold | `#FFD24A` → `#FFAE1A` |
| Ink (logotype on light) | `#0C1F52` |
