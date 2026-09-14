#!/bin/sh
# Renders the BaiSapar PNG assets from the SVG masters. Run through the alpine
# container that carries rsvg-convert; nothing here depends on a workstation
# having a rasteriser installed.
set -e
apk add --no-cache rsvg-convert >/dev/null 2>&1
mkdir -p out
for s in 48 72 96 144 192; do
  rsvg-convert -w $s -h $s baisapar_icon.svg       -o out/ic_launcher_${s}.png
  rsvg-convert -w $s -h $s baisapar_icon_round.svg -o out/ic_launcher_round_${s}.png
done
# Master and splash, plus the square app icon the web app shows.
rsvg-convert -w 1024 -h 1024 baisapar_icon.svg -o out/icon_1024.png
rsvg-convert -w 512  -h 512  baisapar_icon.svg -o out/icon_512.png
rsvg-convert -w 384  -h 384  baisapar_icon.svg -o out/splash_icon.png
rsvg-convert -w 180  -h 180  baisapar_icon.svg -o out/apple_touch_icon.png
rsvg-convert -w 64   -h 64   baisapar_icon.svg -o out/favicon_64.png
ls -la out
