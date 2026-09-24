"""Build the OneDriver OD monogram and outlined logotype from one master.

The mark is two letterforms and one road marking, unioned into a single
silhouette. Launcher masks, the notification resource, web logos and every
raster export come from that one path, so the icon on a phone and the logo on
the site can never drift apart.
"""
import pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import pathops

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/mobile/smarttaxi_app/assets/fonts/InterVariable.ttf"

# The logotype is set at 750; the monogram is cut from the same family at 900,
# because a mark has to hold at 24px where the lighter weight closes up.
logo_font = instantiateVariableFont(TTFont(SRC), {"wght": 750, "opsz": 32}, inplace=False)
mark_font = instantiateVariableFont(TTFont(SRC), {"wght": 900, "opsz": 32}, inplace=False)
gs, cmap, hmtx = logo_font.getGlyphSet(), logo_font.getBestCmap(), logo_font["hmtx"]
mgs, mcmap = mark_font.getGlyphSet(), mark_font.getBestCmap()

NAME = "OneDriver"
SPLIT = 3                                    # "One" | "Driver"

FIELD0, FIELD1 = "#1D6FFF", "#0B4FD1"
MARK0, MARK1 = "#FFFFFF", "#FFFFFF"
INK = "#10264B"


def draw(ch, pen): gs[cmap[ord(ch)]].draw(pen)


def bbox(ch):
    bp = BoundsPen(gs); draw(ch, bp); return bp.bounds


def d_of(path, prec=2):
    pen = SVGPathPen(None, ntos=lambda v: f"{round(v, prec):g}")
    path.draw(pen); return pen.getCommands()


def _bounds(path):
    bp = BoundsPen(None); path.draw(bp); return bp.bounds


def _glyph(ch, tx=0.0):
    p = pathops.Path()
    mgs[mcmap[ord(ch)]].draw(TransformPen(p.getPen(glyphSet=mgs), (1, 0, 0, 1, tx, 0)))
    return p


def _union(*paths):
    out = pathops.Path(); pathops.union(list(paths), out.getPen()); return out


def _quad(*points):
    p = pathops.Path(); pen = p.getPen(); pen.moveTo(points[0])
    for q in points[1:]:
        pen.lineTo(q)
    pen.closePath(); return p


# --------------------------------------------------------------- the monogram
# O and D set solid and just touching: merged any further and the pair reads as
# one capsule rather than two letters, which is what the first attempt did.
_O = _glyph("O")
_OB = _bounds(_O)
_DB = _bounds(_glyph("D"))
_DX = (_OB[2] - _DB[0]) - (_DB[2] - _DB[0]) * 0.02
_LETTERS = _union(_O, _glyph("D", tx=_DX))
_L, _B, _R, _T = _bounds(_LETTERS)
_W, _CAP = _R - _L, _T - _B

# The road under them: two lane marks, the long one first. It says what the app
# is for without drawing a car, and it squares up the monogram — letters alone
# are nearly twice as wide as tall, which sits badly inside a launcher icon.
_SPLIT_AT, _GAP, _THICK, _DROP = 0.58, 0.10, 0.135, 0.28
_ROAD_Y0 = _B - _CAP * _DROP
_ROAD_Y1 = _ROAD_Y0 + _CAP * _THICK
_DASH_END = _L + _W * _SPLIT_AT
_DASH_START = _DASH_END + _W * _GAP
MONOGRAM = _union(
    _LETTERS,
    _quad((_L, _ROAD_Y0), (_DASH_END, _ROAD_Y0), (_DASH_END, _ROAD_Y1), (_L, _ROAD_Y1)),
    _quad((_DASH_START, _ROAD_Y0), (_R, _ROAD_Y0), (_R, _ROAD_Y1), (_DASH_START, _ROAD_Y1)),
)


def mark(width, cx=512, cy=512):
    """The monogram scaled to `width` and optically centred on (cx, cy)."""
    x0, y0, x1, y1 = _bounds(MONOGRAM)
    s = width / (x1 - x0)
    out = pathops.Path()
    MONOGRAM.draw(TransformPen(out.getPen(), (
        s, 0, 0, -s, cx - (x0 + x1) / 2 * s, cy + (y0 + y1) / 2 * s)))
    return d_of(out)


MARK_ICON = mark(596)        # legacy/square icon and every full-bleed export
# An adaptive icon is masked to its middle 72dp of 108, so the mark has to fit
# the inscribed circle: at the square icon's width the road marks were clipped
# by a round launcher. Checked against circle, squircle and rounded square.
MARK_ADAPTIVE = mark(486)
MARK_ALONE = mark(940)       # on its own, no field behind it
MARK_NOTIFY = mark(840)      # status bar, one flat colour

DEFS = f'''  <defs>
    <linearGradient id="fld" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{FIELD0}"/><stop offset="1" stop-color="{FIELD1}"/>
    </linearGradient>
    <linearGradient id="mark" x1="0.12" y1="0" x2="0.88" y2="1">
      <stop offset="0" stop-color="{MARK0}"/><stop offset="1" stop-color="{MARK1}"/>
    </linearGradient>
  </defs>
'''
NOTE = f'  <!-- {NAME} OD monogram. Generated from tools/brand/build_brand.py. -->\n'


def icon_svg(round_=False):
    shape = ('<circle cx="512" cy="512" r="512" fill="url(#fld)"/>' if round_ else
             '<rect width="1024" height="1024" rx="232" fill="url(#fld)"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"'
            f' role="img" aria-label="{NAME}">\n  <title>{NAME}</title>\n' + NOTE + DEFS
            + f'  {shape}\n  <path d="{MARK_ICON}" fill="url(#mark)"/>\n</svg>\n')


def mark_svg(fill=FIELD0):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"'
            f' role="img" aria-label="{NAME}">\n  <title>{NAME}</title>\n' + DEFS
            + f'  <path d="{MARK_ALONE}" fill="{fill}"/>\n</svg>\n')


# ------------------------------------------------------------------ logotype
TRACK = -22


def typeset(text=NAME):
    x, out = 0, []
    for ch in text:
        p = pathops.Path()
        draw(ch, TransformPen(p.getPen(glyphSet=gs), (1, 0, 0, -1, x, 0)))
        out.append((ch, x, d_of(p, 1)))
        x += hmtx[cmap[ord(ch)]][0] + TRACK
    return out, x - TRACK


GLYPHS, ADV = typeset()
TOP = max(bbox(c)[3] for c in NAME)
BOT = min(bbox(c)[1] for c in NAME)
S_X = GLYPHS[SPLIT][1]                # where the second word begins
PAD = 24
VB = (-PAD, -TOP - PAD, ADV + 2 * PAD, TOP - BOT + 2 * PAD)


def wordmark_svg(first, second, h=200):
    w = round(h * VB[2] / VB[3])
    body = "\n".join(
        f'  <path d="{d}" fill="{first if x < S_X else second}"/>' for ch, x, d in GLYPHS)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}"'
            f' width="{w}" height="{h}" role="img" aria-label="{NAME}">\n  <title>{NAME}</title>\n'
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
            f' width="{w}" height="{h}" role="img" aria-label="{NAME}">\n  <title>{NAME}</title>\n'
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
        f' width="1024" height="500" role="img" aria-label="{NAME}">\n'
        f'  <title>{NAME}</title>\n'
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
 "onedriver_icon.svg": icon_svg(),
 "onedriver_icon_round.svg": icon_svg(round_=True),
 "onedriver_mark.svg": mark_svg(),
 "onedriver_mark_white.svg": mark_svg("#FFFFFF"),
 "onedriver_wordmark.svg": wordmark_svg(INK, INK),
 "onedriver_wordmark_light.svg": wordmark_svg("#FFFFFF", "#FFFFFF"),
 "onedriver_lockup.svg": lockup_svg(INK, INK),
 "onedriver_lockup_light.svg": lockup_svg("#FFFFFF", "#FFFFFF"),
 "onedriver_play_feature.svg": feature_graphic(),
}
for name, svg in files.items():
    (OUT / name).write_text(svg, encoding="utf-8")

# ------------------------------------------------------- Android vector icons
# Written straight into the app: an adaptive icon is the only kind Android 8+
# does not shrink into a white shim of its own, and the monochrome layer is what
# makes the themed icons of Android 13+ show the OD instead of a blank.
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
<!-- {NAME} OD monogram. Drawn smaller than the legacy square icon on purpose:
     only the middle 66% of an adaptive icon is guaranteed to survive the
     launcher's mask, and at full width a round mask ate the road marks. -->
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
     is the bare monogram with no gradient of its own. -->
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
# the monogram already is, road marks included.
NOTIFY = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Status-bar notification icon: the {NAME} monogram as a silhouette. Android
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
