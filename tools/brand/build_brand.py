"""Build the BaiSapar road monogram and outlined logotype from one master.

The custom mark is independent of typography. All launcher masks, notification
resources, web logos and raster exports share the same road silhouette.
"""
import pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.svgLib.path import parse_path
import pathops

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/mobile/smarttaxi_app/assets/fonts/InterVariable.ttf"
inst = instantiateVariableFont(TTFont(SRC), {"wght": 750, "opsz": 32}, inplace=False)
gs, cmap, hmtx = inst.getGlyphSet(), inst.getBestCmap(), inst["hmtx"]

FIELD0, FIELD1 = "#1D6FFF", "#0B4FD1"
MARK0, MARK1 = "#FFFFFF", "#FFFFFF"
INK = "#10264B"

def draw(ch, pen): gs[cmap[ord(ch)]].draw(pen)
def bbox(ch):
    bp = BoundsPen(gs); draw(ch, bp); return bp.bounds
def d_of(path, prec=2):
    pen = SVGPathPen(None, ntos=lambda v: f"{round(v, prec):g}")
    path.draw(pen); return pen.getCommands()

def mark(cap, cx, cy, gap):
    """Original B/S road silhouette, optically centered, in a 512-unit master.

    Two broad shapes describe the B bowls and a continuous winding road in
    negative space. There are no hairlines or detached decoration at small sizes.
    `gap` is retained for compatibility with the existing generator callers.
    """
    master = (
        "M32 0H284C400 0 480 60 480 150 "
        "C480 218 445 267 398 294 "
        "C468 322 512 377 512 439C512 469 500 495 480 512 "
        "C492 449 454 409 378 374L305 340 "
        "C260 319 250 307 250 289C250 264 280 250 307 235 "
        "C349 213 369 195 369 174C369 151 348 140 310 140H32Z "
        "M0 512V356C0 267 109 237 332 214 "
        "C307 236 261 252 217 277C157 311 154 342 186 377 "
        "C225 419 261 452 256 512Z"
    )
    s = cap / 512
    p = pathops.Path()
    parse_path(master, TransformPen(p.getPen(), (s, 0, 0, s, cx-cap/2, cy-cap/2)))
    return d_of(p)

MARK_ICON = mark(560, 512, 512, 46)          # legacy/square icon
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
    <linearGradient id="mark" x1="0.12" y1="0" x2="0.88" y2="1">
      <stop offset="0" stop-color="{MARK0}"/><stop offset="1" stop-color="{MARK1}"/>
    </linearGradient>
  </defs>
'''
NOTE = '  <!-- BaiSapar road monogram. Generated from tools/brand/build_brand.py. -->\n'

def icon_svg(round_=False):
    shape = ('<circle cx="512" cy="512" r="512" fill="url(#fld)"/>' if round_ else
             '<rect width="1024" height="1024" rx="232" fill="url(#fld)"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"'
            ' role="img" aria-label="BaiSapar">\n  <title>BaiSapar</title>\n' + NOTE + DEFS
            + f'  {shape}\n  <path d="{MARK_ICON}" fill="url(#mark)"/>\n</svg>\n')

def mark_svg(fill=FIELD0):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"'
            ' role="img" aria-label="BaiSapar">\n  <title>BaiSapar</title>\n' + DEFS
            + f'  <path d="{MARK_ALONE}" fill="{fill}"/>\n</svg>\n')

# ------------------------------------------------------------------ logotype
TRACK = -22
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
            '  <!-- Inter 750, outlined. No installed font required. -->\n'
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
              f'    <path d="{MARK_ICON}" fill="url(#mark)"/>\n  </g>\n'
            + f'  <g transform="translate({icon + gapx:.1f},0)">\n{words}\n  </g>\n</svg>\n')

def feature_graphic():
    """Google Play's feature graphic, at the one size the console accepts.

    The store crops this differently on every surface it appears on, so the
    lockup sits in the middle 62% and nothing else goes near an edge.
    """
    icon = TOP * 1.34
    gapx = TOP * 0.30
    block = icon + gapx + ADV
    k = 1024 * 0.62 / block
    x = (1024 - block * k) / 2
    words = "\n".join(
        f'      <path d="{d}" fill="#FFFFFF"/>' for ch, _x, d in GLYPHS)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500"'
        ' width="1024" height="500" role="img" aria-label="BaiSapar">\n'
        '  <title>BaiSapar</title>\n'
        + DEFS
        + '  <rect width="1024" height="500" fill="url(#fld)"/>\n'
        + f'  <g transform="translate({x:.1f},250) scale({k:.5f})">\n'
        + f'    <g transform="translate(0,{-icon / 2:.1f}) scale({icon / 1024:.5f})">\n'
        + '      <rect width="1024" height="1024" rx="232" fill="#FFFFFF" fill-opacity="0.08"/>\n'
        + f'      <path d="{MARK_ICON}" fill="url(#mark)"/>\n'
        + '    </g>\n'
        + f'    <g transform="translate({icon + gapx:.1f},{TOP / 2:.1f})">\n'
        + words + '\n    </g>\n  </g>\n</svg>\n')


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
 "baisapar_play_feature.svg": feature_graphic(),
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
<!-- BaiSapar road monogram. Drawn smaller than the
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
        <item android:offset="0" android:color="{MARK0}"/>
        <item android:offset="1" android:color="{MARK1}"/>
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
