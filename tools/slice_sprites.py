"""Slice reference/sprites.png into images/sprites/r{row}c{col}.png by detecting gold frames."""
import os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'reference', 'sprites.png')
if not os.path.exists(SRC):
    alt = [f for f in os.listdir(os.path.join(ROOT, 'reference')) if f.lower() == 'sprites.png']
    SRC = os.path.join(ROOT, 'reference', alt[0])
OUT = os.path.join(ROOT, 'images', 'sprites')
os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC).convert('RGB')
W, H = img.size
px = img.load()

def gold(p):
    r, g, b = p
    return r > 150 and b < 90 and g > 70

# Count gold pixels per column and per row
colc = [0] * W
rowc = [0] * H
for y in range(H):
    for x in range(W):
        if gold(px[x, y]):
            colc[x] += 1
            rowc[y] += 1

def bands(counts, thresh):
    """Return list of (start,end) runs where counts exceed thresh."""
    out, start = [], None
    for i, c in enumerate(counts):
        if c >= thresh and start is None:
            start = i
        elif c < thresh and start is not None:
            out.append((start, i - 1)); start = None
    if start is not None:
        out.append((start, len(counts) - 1))
    return out

def frames(counts, n, approx):
    # Gold frame edges are lines with high counts; pick threshold adaptively
    for frac in (0.5, 0.4, 0.3, 0.25, 0.2, 0.15):
        th = max(counts) * frac
        b = bands(counts, th)
        # merge bands closer than 4px
        merged = []
        for s, e in b:
            if merged and s - merged[-1][1] <= 4:
                merged[-1] = (merged[-1][0], e)
            else:
                merged.append((s, e))
        if len(merged) >= n:
            # pair into (left edge, right edge) using approx frame size
            edges = [ (s+e)//2 for s, e in merged ]
            pairs, i = [], 0
            while i < len(edges):
                nxt = edges[i+1] - edges[i] if i + 1 < len(edges) else 999
                if 95 <= nxt <= 118:
                    pairs.append((merged[i][1], merged[i+1][0])); i += 2
                else:
                    # missing far edge: infer from typical frame size
                    end = merged[i][1] + approx
                    pairs.append((merged[i][1], end)); i += 1
                    # skip a stray far edge that belongs to this inferred frame
                    while i < len(edges) and abs(edges[i] - end) <= 6:
                        i += 1
            if len(pairs) == n:
                return pairs
    return None

cols = frames(colc, 13, 105)
rows = frames(rowc, 8, 108)
if not cols:
    cols = [(8 + 118 * i, 8 + 118 * i + 105) for i in range(13)]
    print('WARN: fallback column grid')
if not rows:
    rows = [(8 + 127 * i, 8 + 127 * i + 110) for i in range(8)]
    print('WARN: fallback row grid')
print('cols', cols)
print('rows', rows)
INSET = 3
for r, (y0, y1) in enumerate(rows):
    for c, (x0, x1) in enumerate(cols):
        tile = img.crop((x0 + INSET, y0 + INSET, x1 - INSET + 1, y1 - INSET + 1))
        tile.save(os.path.join(OUT, f'r{r}c{c}.png'))
print('saved', len(rows) * len(cols), 'tiles to', OUT)
