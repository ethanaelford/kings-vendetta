"""Slice reference/sprites3.png (terrain, props, chests, rank badges/banners) into images/ui/*.png.
Boxes are column ranges measured from the sheet; each crop is trimmed to its visible pixels."""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
img = Image.open(os.path.join(ROOT, 'reference', 'sprites3.png')).convert('RGBA')
A = np.asarray(img.convert('RGB')).astype(int)
OUT = os.path.join(ROOT, 'images', 'ui')
os.makedirs(OUT, exist_ok=True)


def clear_background(tile):
    """Make the sheet's dark background transparent (flood fill from the edges)."""
    rgba = np.asarray(tile).copy()
    dark = rgba[:, :, :3].max(axis=2) < 12
    h, w = dark.shape
    seen = np.zeros_like(dark)
    stack = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not dark[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    rgba[seen, 3] = 0
    return Image.fromarray(rgba, 'RGBA')


def save(name, x0, x1, y0, y1, trim=True, square=False, clear=False):
    box = (x0, y0, x1, y1)
    if trim:
        m = A[y0:y1, x0:x1].max(axis=2) > 45
        ys, xs = np.where(m)
        if len(xs):
            box = (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)
    tile = img.crop(box)
    if clear:
        tile = clear_background(tile)
    if square:
        w, h = tile.size
        s = min(w, h)
        tile = tile.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    tile.save(os.path.join(OUT, name + '.png'))
    return name


TERRAIN1 = [('grass', 3, 104), ('grass2', 114, 212), ('meadow', 222, 322), ('dirt', 330, 435), ('sand', 446, 548),
            ('snow', 559, 664), ('stone', 676, 777), ('moss', 789, 888), ('cobble', 901, 996), ('mosscobble', 1008, 1096),
            ('planks', 1110, 1202), ('boards', 1221, 1317), ('crate', 1332, 1428)]
for n, a, b in TERRAIN1:
    save('t_' + n, a + 4, b - 4, 12, 92, trim=False, square=True)
TERRAIN2 = [('brick', 902, 997), ('mossbrick', 1010, 1096)]
for n, a, b in TERRAIN2:
    save('t_' + n, a + 4, b - 4, 114, 196, trim=False, square=True)
TERRAIN4 = [('water', 8, 116), ('deepwater', 129, 236), ('shallows', 248, 356), ('lava', 564, 664), ('void', 674, 774)]
for n, a, b in TERRAIN4:
    save('t_' + n, a + 4, b - 4, 366, 470, trim=False, square=True)
PROPS = [('oak', 8, 124, 215, 352), ('autumn', 130, 247, 215, 352), ('pine', 254, 367, 215, 352), ('rock', 872, 961, 215, 352),
         ('crystal', 969, 1053, 215, 352), ('amethyst', 1057, 1140, 215, 352), ('arch', 784, 881, 355, 478), ('cave', 1371, 1529, 355, 478)]
for n, a, b, y0, y1 in PROPS:
    save('p_' + n, a, b, y0, y1, clear=True)

CHEST_X = [(143, 270), (292, 426), (448, 580), (615, 758), (791, 945), (969, 1113), (1137, 1293), (1322, 1491)]
CHESTS = ['wood', 'gold', 'silver', 'epic', 'infernal', 'royal', 'frost', 'legendary']
for (a, b), n in zip(CHEST_X, CHESTS):
    save('chest_' + n, a - 4, b + 4, 486, 604, clear=True)
    save('chest_' + n + '_open', max(a - 18, 148), b + 18, 606, 736, clear=True)

TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'grandmaster', 'legendary']
BADGE_X = [(168, 265), (306, 420), (452, 579), (612, 742), (776, 913), (945, 1085), (1128, 1272), (1318, 1468)]
BANNER_X = [(154, 276), (323, 427), (455, 579), (612, 739), (779, 909), (951, 1080), (1130, 1269), (1315, 1467)]
for (a, b), n in zip(BADGE_X, TIERS):
    save('rank_' + n, a - 4, b + 4, 742, 842, clear=True)
for (a, b), n in zip(BANNER_X, TIERS):
    save('banner_' + n, a - 4, b + 4, 872, 1020, clear=True)
print('sliced into', OUT, len(os.listdir(OUT)), 'files')
