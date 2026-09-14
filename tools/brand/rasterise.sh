#!/bin/sh
# Rasterises the BaiSapar SVG masters into every PNG the apps ship, and puts
# each one where it belongs. Run it from the repository root:
#
#   python tools/brand/build_brand.py
#   docker run --rm -v "$(pwd):/repo" -w /repo alpine:latest sh tools/brand/rasterise.sh
#
# Nothing here needs a rasteriser on the workstation; alpine supplies one.
set -e
apk add --no-cache rsvg-convert >/dev/null 2>&1 || true

BRAND=apps/web/public/brand
RES=apps/mobile/smarttaxi_app/android/app/src/main/res
FLUTTER=apps/mobile/smarttaxi_app/assets/brand

# Legacy launcher icons. Android 8+ uses the adaptive icon instead (see
# mipmap-anydpi-v26), so these only reach phones on 7 and older.
set -- mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192
for pair in "$@"; do
  d=${pair%%:*}; s=${pair##*:}
  rsvg-convert -w "$s" -h "$s" $BRAND/baisapar_icon.svg       -o $RES/mipmap-$d/ic_launcher.png
  rsvg-convert -w "$s" -h "$s" $BRAND/baisapar_icon_round.svg -o $RES/mipmap-$d/ic_launcher_round.png
done

# The native launch screen, shown at 96dp before Flutter attaches.
rsvg-convert -w 384 -h 384 $BRAND/baisapar_icon.svg -o $RES/drawable/baisapar_splash_icon.png

# In-app artwork.
rsvg-convert -w 512 -h 512 $BRAND/baisapar_icon.svg          -o $FLUTTER/baisapar_app_icon.png
rsvg-convert -h 160        $BRAND/baisapar_wordmark.svg      -o $FLUTTER/baisapar_wordmark.png
rsvg-convert -h 160        $BRAND/baisapar_wordmark_light.svg -o $FLUTTER/baisapar_wordmark_light.png

# Web: the store master and the one icon iOS Safari insists on as a bitmap.
rsvg-convert -w 1024 -h 1024 $BRAND/baisapar_icon.svg -o $BRAND/baisapar_icon_1024.png
rsvg-convert -w 180  -h 180  $BRAND/baisapar_icon.svg -o $BRAND/baisapar_apple_touch_icon.png

echo "brand rasterised"
