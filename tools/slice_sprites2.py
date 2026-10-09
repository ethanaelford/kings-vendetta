"""Slice reference/sprites2.webp (labelled portraits) into images/cards/<slug>.png custom art overrides.
Frame boxes were measured from the gold borders; the art is cropped above each name banner."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'reference', 'sprites2.webp')
OUT = os.path.join(ROOT, 'images', 'cards')

COLS7 = [(11, 213), (228, 430), (445, 651), (666, 874), (889, 1093), (1108, 1311), (1326, 1527)]
ROWS = [(10, 202), (258, 445), (501, 684)]  # (frame top, name banner top)
GRID = [
    ['ace', 'admiral', 'apprentice', 'cannon', 'cobalt-knight', 'commander', 'field-marshall'],
    ['fire-sprite', 'fire-striker', 'foot-soldier', 'guardian', 'joker', 'lava-guardian', 'magma-knight'],
    ['lightning-ninja', 'ranged-expert', 'redstone-warrior', 'tactical-ninja', 'tactical-warrior', 'the-manipulator', 'unstable-titan'],
]
LAST = [((534, 762), 'war-captain'), ((777, 1003), 'wisp-major')]
LAST_ROW = (743, 943)
INSET = 7

img = Image.open(SRC).convert('RGB')


def save(box, slug):
    (x0, x1), (y0, y1) = box
    tile = img.crop((x0 + INSET, y0 + INSET + 8, x1 - INSET, y1 - 2))
    w, h = tile.size
    side = min(w, h)  # square crop, keep the face (top-centre)
    left = (w - side) // 2
    tile = tile.crop((left, 0, left + side, side))
    tile.save(os.path.join(OUT, slug + '.png'))
    print(slug, tile.size)


for r, (y0, y1) in enumerate(ROWS):
    for c, slug in enumerate(GRID[r]):
        save((COLS7[c], (y0, y1)), slug)
for xs, slug in LAST:
    save((xs, LAST_ROW), slug)
