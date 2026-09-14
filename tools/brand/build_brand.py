"""Builds every BaiSapar asset from Inter Black's outlines.

One source of truth: the B in the app icon and the B in the logotype are the
same letterform, so the mark reads as the first letter of the name and not as
a separate drawing. Everything is emitted as outlines — no shipped asset
depends on a font being present where it is rendered.
"""
import json, math, os, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import pathops

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/mobile/smarttaxi_app/assets/fonts/InterVariable.ttf"
inst = instantiateVariableFont(TTFont(SRC), {"wght": 900, "opsz": 32}, inplace=False)
gs, cmap, hmtx = inst.getGlyphSet(), inst.getBestCmap(), inst["hmtx"]

FIELD0, FIELD1 = "#1E4FD0", "#12307A"
GOLD0, GOLD1 = "#FFD24A", "#FFAE1A"
INK = "#0C1F52"
SLICE_ANGLE = -10

def draw(ch, pen): gs[cmap[ord(ch)]].draw(pen)
def bbox(ch):
    bp = BoundsPen(gs); draw(ch, bp); return bp.bounds
def d_of(path, prec=2):
    pen = SVGPathPen(None, ntos=lambda v: f"{round(v, prec):g}")
    path.draw(pen); return pen.getCommands()

def mark(cap, cx, cy, gap):
    """The B with the road cut through it, as one outline."""
    x0, y0, x1, y1 = bbox("B")
    s = cap / (y1 - y0)
    p = pathops.Path()
    draw("B", TransformPen(p.getPen(glyphSet=gs),
         (s, 0, 0, -s, cx - s * (x0 + x1) / 2, cy + s * (y0 + y1) / 2)))
    if not gap:
        return d_of(p)
    band = pathops.Path(); pen = band.getPen(glyphSet=gs)
    a = math.radians(SLICE_ANGLE); ca, sa = math.cos(a), math.sin(a)
    corners = [(-1600, -gap/2), (1600, -gap/2), (1600, gap/2), (-1600, gap/2)]
    pts = [(cx + px*ca - py*sa, cy + px*sa + py*ca) for px, py in corners]
    pen.moveTo(pts[0])
    for q in pts[1:]: pen.lineTo(q)
    pen.closePath()
    out = pathops.Path()
    pathops.difference(list(p.contours), list(band.contours), out.getPen(glyphSet=gs))
    return d_of(out)

MARK_ICON = mark(610, 512, 512, 46)          # legacy/square icon
# Smaller than the square icon's: what a launcher shows of an adaptive icon is
# the middle 72dp of 108, and at 470 the B pressed against the edge of a round
# mask. Checked against circle, squircle and rounded-square masks.
MARK_ADAPTIVE = mark(430, 512, 512, 33)
MARK_ALONE = mark(880, 512, 512, 66)         # on its own, no field
MARK_NOTIFY = mark(760, 512, 512, 58)        # status bar, one flat colour

DEFS = f'''  <defs>
    <linearGradient id="fld" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{FIELD0}"/><stop offset="1" stop-color="{FIELD1}"/>
    </linearGradient>
    <linearGradient id="gold" x1="0.12" y1="0" x2="0.88" y2="1">
      <stop offset="0" stop-color="{GOLD0}"/><stop offset="1" stop-color="{GOLD1}"/>
    </linearGradient>
  </defs>
'''
NOTE = ('  <!-- BaiSapar. The mark is the name\'s own B (Inter Black, outlined) with\n'
        '       one slanted gap through it: the road. This file IS the artwork —\n'
        '       it is not text, and re-typesetting it will not reproduce it. -->\n')

def icon_svg(round_=False):
    shape = ('<circle cx="512" cy="512" r="512" fill="url(#fld)"/>' if round_ else
             '<rect width="1024" height="1024" rx="232" fill="url(#fld)"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"'
            ' role="img" aria-label="BaiSapar">\n  <title>BaiSapar</title>\n' + NOTE + DEFS
            + f'  {shape}\n  <path d="{MARK_ICON}" fill="url(#gold)"/>\n</svg>\n')

def mark_svg(fill="url(#gold)"):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"'
            ' role="img" aria-label="BaiSapar">\n  <title>BaiSapar</title>\n' + DEFS
            + f'  <path d="{MARK_ALONE}" fill="{fill}"/>\n</svg>\n')

# ------------------------------------------------------------------ logotype
TRACK = -34
def typeset(text="BaiSapar"):
    x, out = 0, []
    for ch in text:
        p = pathops.Path()
        draw(ch, TransformPen(p.getPen(glyphSet=gs), (1, 0, 0, -1, x, 0)))
        out.append((ch, x, d_of(p, 1)))
        x += hmtx[cmap[ord(ch)]][0] + TRACK
    return out, x - TRACK

GLYPHS, ADV = typeset()
TOP = max(bbox(c)[3] for c in "BaiSapar")
BOT = min(bbox(c)[1] for c in "BaiSapar")
S_X = GLYPHS[3][1]                    # where "Sapar" begins
PAD = 24
VB = (-PAD, -TOP - PAD, ADV + 2 * PAD, TOP - BOT + 2 * PAD)

def wordmark_svg(first, second, h=200):
    w = round(h * VB[2] / VB[3])
    body = "\n".join(
        f'  <path d="{d}" fill="{first if x < S_X else second}"/>' for ch, x, d in GLYPHS)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}"'
            f' width="{w}" height="{h}" role="img" aria-label="BaiSapar">\n  <title>BaiSapar</title>\n'
            '  <!-- Inter Black, outlined and tracked by hand. Artwork, not text. -->\n'
            + body + "\n</svg>\n")

def lockup_svg(first, second, h=200):
    """Mark and logotype, set to the proportions a lockup keeps everywhere."""
    cap = TOP                       # logotype cap height in font units
    icon = cap * 1.34               # the badge stands a third taller than the caps
    gapx = cap * 0.30
    scale = icon / 1024
    total_w = icon + gapx + ADV
    vb = (-PAD, -TOP - PAD - (icon - TOP) / 2, total_w + 2 * PAD, icon + 2 * PAD)
    w = round(h * vb[2] / vb[3])
    words = "\n".join(
        f'    <path d="{d}" fill="{first if x < S_X else second}"/>' for ch, x, d in GLYPHS)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.0f} {vb[1]:.0f} {vb[2]:.0f} {vb[3]:.0f}"'
            f' width="{w}" height="{h}" role="img" aria-label="BaiSapar">\n  <title>BaiSapar</title>\n'
            + DEFS
            + f'  <g transform="translate(0,{vb[1]:.1f}) scale({scale:.5f})">\n'
              f'    <rect width="1024" height="1024" rx="232" fill="url(#fld)"/>\n'
              f'    <path d="{MARK_ICON}" fill="url(#gold)"/>\n  </g>\n'
            + f'  <g transform="translate({icon + gapx:.1f},0)">\n{words}\n  </g>\n</svg>\n')

OUT = ROOT / "apps/web/public/brand"
OUT.mkdir(parents=True, exist_ok=True)
files = {
 "baisapar_icon.svg": icon_svg(),
 "baisapar_icon_round.svg": icon_svg(round_=True),
 "baisapar_mark.svg": mark_svg(),
 "baisapar_mark_white.svg": mark_svg("#FFFFFF"),
 "baisapar_wordmark.svg": wordmark_svg(INK, INK),
 "baisapar_wordmark_light.svg": wordmark_svg("#FFFFFF", "#FFFFFF"),
 "baisapar_lockup.svg": lockup_svg(INK, INK),
 "baisapar_lockup_light.svg": lockup_svg("#FFFFFF", "#FFFFFF"),
}
for name, svg in files.items():
    (OUT / name).write_text(svg, encoding="utf-8")

# ------------------------------------------------------- Android vector icons
# Written straight into the app: an adaptive icon is the only kind Android 8+
# does not shrink into a white shim of its own, and the monochrome layer is
# what makes the themed icons of Android 13+ show the B instead of a blank.
RES = ROOT / "apps/mobile/smarttaxi_app/android/app/src/main/res"

BACKGROUND = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Adaptive icon background. The launcher crops this to whatever shape it
     uses, so it carries no artwork of its own. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
  <path android:pathData="M0,0h1024v1024h-1024z">
    <aapt:attr name="android:fillColor">
      <gradient
          android:type="linear"
          android:startX="0" android:startY="0"
          android:endX="1024" android:endY="1024">
        <item android:offset="0" android:color="{FIELD0}"/>
        <item android:offset="1" android:color="{FIELD1}"/>
      </gradient>
    </aapt:attr>
  </path>
</vector>
"""

FOREGROUND = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- The name's own B with the road cut through it. Drawn smaller than the
     legacy square icon on purpose: only the middle 66% of an adaptive icon is
     guaranteed to survive the launcher's mask. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
  <path android:pathData="{MARK_ADAPTIVE}">
    <aapt:attr name="android:fillColor">
      <gradient
          android:type="linear"
          android:startX="300" android:startY="230"
          android:endX="760" android:endY="800">
        <item android:offset="0" android:color="{GOLD0}"/>
        <item android:offset="1" android:color="{GOLD1}"/>
      </gradient>
    </aapt:attr>
  </path>
</vector>
"""

MONOCHROME = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Themed icons (Android 13+): the system paints this one flat colour, so it
     is the bare letterform with no gradient of its own. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
  <path
      android:pathData="{MARK_ADAPTIVE}"
      android:fillColor="#FFFFFF"/>
</vector>
"""

ADAPTIVE = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
"""

(RES / "drawable").mkdir(parents=True, exist_ok=True)
(RES / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
(RES / "drawable/ic_launcher_background.xml").write_text(BACKGROUND, encoding="utf-8")
(RES / "drawable/ic_launcher_foreground.xml").write_text(FOREGROUND, encoding="utf-8")
(RES / "drawable/ic_launcher_monochrome.xml").write_text(MONOCHROME, encoding="utf-8")
(RES / "mipmap-anydpi-v26/ic_launcher.xml").write_text(ADAPTIVE, encoding="utf-8")
(RES / "mipmap-anydpi-v26/ic_launcher_round.xml").write_text(ADAPTIVE, encoding="utf-8")

# The status-bar notification icon. Android throws away every colour here and
# repaints the alpha channel flat white, so it has to be a silhouette — which
# the mark already is, the slice included.
NOTIFY = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Status-bar notification icon: the BaiSapar mark as a silhouette. Android
     strips all colour from this and repaints it flat white through the alpha
     channel per Material's notification-icon rules, so it must never become
     the full-colour launcher icon — the OS would draw that as a white blob. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
  <path
      android:fillColor="#FFFFFFFF"
      android:pathData="{MARK_NOTIFY}"/>
</vector>
"""
(RES / "drawable/ic_stat_notify.xml").write_text(NOTIFY, encoding="utf-8")

print("wrote", len(files), "svg masters and 6 android vector resources")
