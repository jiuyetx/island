"""Author the shared tropical atlas (PNG + WebP) without Blender.

The GLBs are geometry-only and UV-map into a fixed 4x4 tile layout, so this
image is the entire material look. Run with the system Python (Pillow):

    python3 tools/build_atlas.py

Tiles run left-to-right, top-to-bottom: sand, grass, wood, wall / roof, leaf,
coral, rock / water, water, cloth, leaf / coral, rock, wood, leaf.
"""
import math
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "generated")
os.makedirs(OUT, exist_ok=True)

# Soft, sunlit material bases. The per-tile treatment below supplies the
# natural variation; keeping these bases restrained avoids a toy-block look.
PALETTE = [
    (.862, .785, .560), (.550, .710, .240), (.474, .294, .145), (.884, .838, .718),
    (.720, .320, .140), (.390, .620, .160), (.800, .292, .356), (.382, .407, .373),
    (.105, .605, .648), (.075, .535, .600), (.870, .810, .650), (.115, .315, .165),
    (.700, .285, .475), (.815, .505, .115), (.350, .245, .145), (.430, .670, .180),
]

DETAIL = ["sand", "grass", "wood", "plaster", "roof", "leaf", "coral", "rock",
          "water", "water", "cloth", "leaf", "coral", "rock", "wood", "leaf"]


def _hash(x, y):
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def _value_noise(x, y):
    xi, yi = int(x), int(y)
    xf, yf = x - xi, y - yi
    sx, sy = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a = _hash(xi, yi)
    b = _hash(xi + 1, yi)
    c = _hash(xi, yi + 1)
    d = _hash(xi + 1, yi + 1)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def _fbm(x, y, octaves):
    value, amp, freq = 0.0, 0.5, 1.0
    for _ in range(octaves):
        value += amp * _value_noise(x * freq, y * freq)
        amp *= 0.5
        freq *= 2.0
    return value


def _detail(tile, u, v):
    """Return brightness plus a small RGB pigment shift for one material."""
    kind = DETAIL[tile]
    if kind == "sand":
        grain = _fbm(u * 118, v * 118, 3) - .5
        ripple = math.sin(v * 74 + math.sin(u * 9) * 2.1)
        wet = _fbm(u * 7, v * 10, 3) - .5
        return .96 + grain * .12 + ripple * .030, (wet * .035, wet * .022, -wet * .025)
    if kind == "grass":
        turf = _fbm(u * 10, v * 10, 4) - .5
        blades = math.sin((u * 83 + v * 19) + _fbm(u * 28, v * 28, 2) * 5)
        return .98 + turf * .13 + blades * .018, (-turf * .022, turf * .020, -turf * .030)
    if kind == "wood":
        grain = math.sin(v * 96 + _fbm(u * 7, v * 22, 3) * 7)
        knots = max(0, _fbm(u * 6, v * 19, 3) - .70)
        return .98 + grain * .055 - knots * .45, (knots * .028, -knots * .017, -knots * .035)
    if kind == "plaster":
        chalk = _fbm(u * 13, v * 13, 4) - .5
        return .99 + chalk * .085, (chalk * .028, chalk * .014, -chalk * .018)
    if kind == "roof":
        row = math.sin(v * 22)
        stagger = math.sin(u * 20 + math.floor(v * 3.5) * 1.8)
        clay = _fbm(u * 34, v * 22, 3) - .5
        return .96 + row * .072 + stagger * .024 + clay * .07, (clay * .050, -clay * .014, -clay * .018)
    if kind == "leaf":
        veins = .5 + .5 * math.sin(u * 34 + math.sin(v * 11) * 2.2)
        mottling = _fbm(u * 22, v * 22, 3) - .5
        return .96 + mottling * .13 - veins * .030, (-mottling * .018, mottling * .027, -mottling * .012)
    if kind == "coral":
        pore = _fbm(u * 65, v * 65, 3) - .5
        return .97 + pore * .15, (pore * .026, -pore * .013, pore * .021)
    if kind == "rock":
        facets = _fbm(u * 18, v * 18, 4) - .5
        pits = max(0, _fbm(u * 54, v * 54, 2) - .69)
        return .96 + facets * .18 - pits * .32, (facets * .010, facets * .006, -facets * .012)
    if kind == "water":
        swell = math.sin(v * 43 + math.sin(u * 7) * 3.1)
        caustic = max(0, math.sin((u + v) * 52) * math.sin((u - v) * 37))
        return .99 + swell * .045 + caustic * .055, (-caustic * .018, caustic * .020, caustic * .035)
    if kind == "cloth":
        weave = math.sin(u * 78) * math.sin(v * 78)
        return 1.0 + weave * .024, (0, weave * .008, weave * .006)
    return 1.0, (0, 0, 0)


def build():
    size, cells, cell = 512, 4, 128
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            tx, ty = x // cell, y // cell
            tile = ty * cells + tx
            color = PALETTE[tile]
            u, v = (x % cell) / cell, (y % cell) / cell
            light, tint = _detail(tile, u, v)
            # No synthetic UV-edge darkening: it made each mesh face read like
            # a separate block. Directional light remains subtle and material-led.
            shade = (.96 + (1 - v) * .035) * light
            pixels[x, y] = tuple(int(round(max(0.0, min(1.0, c * shade + tint[i])) * 255))
                                 for i, c in enumerate(color))

    png = os.path.join(OUT, "tropical-atlas.png")
    webp = os.path.join(OUT, "tropical-atlas.webp")
    image.save(png, "PNG")
    image.save(webp, "WEBP", quality=90)
    print("wrote", png)
    print("wrote", webp)


if __name__ == "__main__":
    build()
