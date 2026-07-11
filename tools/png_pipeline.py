#!/usr/bin/env python3
"""PNG -> piece SVG pipeline for the new ChessPiecePNGS art set.

The source PNGs are dark silhouettes on an opaque cream/checkerboard
background (with a small light watermark sparkle in some corners), so the
old svg_pipeline.py (which assumed clean traced paths already existed)
doesn't apply. This script:

  1. thresholds the piece out of the background,
  2. drops speck components (watermark remnants),
  3. traces pixel-boundary contours (outer loops + holes, evenodd),
  4. simplifies them (collinear merge + Douglas-Peucker),
  5. normalizes size/position into the 1024 design space used by the
     existing assets (512 viewBox with a scale(0.5) wrapper):
       - every two-piece composite shares the same bottom baseline,
       - singles keep the size hierarchy of the old set,
  6. writes frontend/src/assets/<name>.svg in the structure the app styles
     at runtime (a single --band-fill silhouette path),
  7. regenerates quantum_<type>.svg trapezoid slices from the new singles.

Tune PIECES entries (box / bottom / mult / dx) to give individual pieces
some love, then re-run.
"""

import os
import re
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PNG_DIR = os.path.join(ROOT, 'ChessPiecePNGS')
ASSETS_DIR = os.path.join(ROOT, 'frontend', 'src', 'assets')

# Targets are in the 1024x1024 design space (the g wrapper scales by 0.5
# into the 512 viewBox). box=(maxW,maxH) fit box, bottom=baseline y of the
# lowest pixel, mult=extra scale love, dx=horizontal nudge.
PAIR_BOX = (600, 820)
PAIR_BOTTOM = 928

# all solo pieces sit on one shared baseline
SINGLE_BOTTOM = 888

SINGLE_DEFAULTS = {
    # keep the old set's size hierarchy (measured from the previous assets)
    'p': dict(box=(506, 684), bottom=SINGLE_BOTTOM),
    'n': dict(box=(638, 808), bottom=SINGLE_BOTTOM, mult=0.92),
    'b': dict(box=(584, 760), bottom=SINGLE_BOTTOM),
    'r': dict(box=(502, 716), bottom=SINGLE_BOTTOM, mult=0.90),
    'q': dict(box=(762, 654), bottom=SINGLE_BOTTOM, mult=0.90),
    'k': dict(box=(516, 678), bottom=SINGLE_BOTTOM),
}

PAIRS = ['bk', 'bq', 'br', 'nb', 'nk', 'nq', 'nr',
         'pb', 'pk', 'pn', 'pq', 'pr', 'qk', 'rk', 'rq']

PIECES = {}
for _s, _cfg in SINGLE_DEFAULTS.items():
    PIECES[_s] = dict({'mult': 1.0, 'dx': 0.0}, **_cfg)
for _p in PAIRS:
    PIECES[_p] = dict(box=PAIR_BOX, bottom=PAIR_BOTTOM, mult=1.0, dx=0.0)

# ---------------------------------------------------------------- masking

def piece_mask(png_path):
    im = Image.open(png_path)
    if im.mode == 'RGBA':
        # all current sources are fully opaque; composite defensively anyway
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    g = np.asarray(im.convert('L'), dtype=np.uint8)
    mask = g < 128

    # drop small disconnected specks (watermarks, dust)
    lab, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        keep = sizes >= sizes.max() * 0.005
        mask = keep[lab - 1] & mask
    return mask

# ------------------------------------------------------------- contouring

# steps: 0=right 1=down 2=left 3=up
STEP = {0: (1, 0), 1: (0, 1), 2: (-1, 0), 3: (0, -1)}

def boundary_loops(mask):
    """Trace pixel-boundary loops with the filled region on the left."""
    m = np.pad(mask, 1)
    edges = {}  # start (x,y) -> list of (dir, end)

    def add(ys, xs, d):
        dx, dy = STEP[d]
        for y, x in zip(ys, xs):
            # anchor per edge type so the region is on the left
            if d == 0: sx, sy = x, y            # top edge, going right
            elif d == 1: sx, sy = x + 1, y      # right edge, going down
            elif d == 2: sx, sy = x + 1, y + 1  # bottom edge, going left
            else: sx, sy = x, y + 1             # left edge, going up
            edges.setdefault((sx, sy), []).append((d, (sx + dx, sy + dy)))

    filled = m
    up = filled[1:-1, 1:-1] & ~m[:-2, 1:-1]
    down = filled[1:-1, 1:-1] & ~m[2:, 1:-1]
    left = filled[1:-1, 1:-1] & ~m[1:-1, :-2]
    right = filled[1:-1, 1:-1] & ~m[1:-1, 2:]
    for arr, d in ((up, 0), (right, 1), (down, 2), (left, 3)):
        ys, xs = np.nonzero(arr)
        add(ys, xs, d)

    loops = []
    while edges:
        start, lst = next(iter(edges.items()))
        d, cur = lst.pop()
        if not lst:
            del edges[start]
        loop = [start, cur]
        while cur != start:
            cands = edges[cur]
            if len(cands) == 1:
                nd, nxt = cands.pop()
                del edges[cur]
            else:
                # pinch point: prefer the sharpest left turn to keep the
                # interior on our left and the loops separate
                best = min(range(len(cands)), key=lambda i: (cands[i][0] - d - 1) % 4)
                nd, nxt = cands.pop(best)
            d = nd
            cur = nxt
            loop.append(cur)
        loops.append(loop[:-1])  # drop duplicated closing point
    return loops

def merge_collinear(pts):
    out = [pts[0]]
    for p in pts[1:]:
        if len(out) >= 2:
            a, b = out[-2], out[-1]
            if (b[0] - a[0]) * (p[1] - b[1]) == (b[1] - a[1]) * (p[0] - b[0]):
                out[-1] = p
                continue
        out.append(p)
    # check wrap-around collinearity
    if len(out) > 2:
        a, b, c = out[-2], out[-1], out[0]
        if (b[0] - a[0]) * (c[1] - b[1]) == (b[1] - a[1]) * (c[0] - b[0]):
            out.pop()
    return out

def rdp(pts, eps):
    """Iterative Douglas-Peucker on a closed loop (split at extremes)."""
    if len(pts) < 3:
        return pts
    pts = np.asarray(pts, dtype=float)
    # anchor at the two most distant-ish points to make the loop two chains
    i0 = 0
    i1 = int(np.argmax(np.abs(pts - pts[0]).sum(axis=1)))
    keep = np.zeros(len(pts), dtype=bool)
    keep[[i0, i1]] = True
    # treat the loop as two open chains: [i0..i1] and [i1..end..i0]
    idx = np.arange(len(pts))
    chains = [idx[i0:i1 + 1], np.concatenate([idx[i1:], idx[:1]])]
    for chain in chains:
        st = [(0, len(chain) - 1)]
        while st:
            a, b = st.pop()
            if b <= a + 1:
                continue
            pa, pb = pts[chain[a]], pts[chain[b]]
            seg = pb - pa
            L = np.hypot(*seg)
            sub = pts[chain[a + 1:b]]
            if L == 0:
                dist = np.hypot(*(sub - pa).T)
            else:
                dist = np.abs(np.cross(seg, sub - pa)) / L
            imax = int(np.argmax(dist))
            if dist[imax] > eps:
                k = a + 1 + imax
                keep[chain[k]] = True
                st.append((a, k))
                st.append((k, b))
    return [tuple(p) for p in pts[keep]]

def trace(mask, eps):
    loops = [merge_collinear(l) for l in boundary_loops(mask)]
    # drop micro-loops (speck holes)
    def area(l):
        a = 0.0
        for (x0, y0), (x1, y1) in zip(l, l[1:] + [l[0]]):
            a += x0 * y1 - x1 * y0
        return abs(a) / 2
    big = max(area(l) for l in loops)
    loops = [l for l in loops if area(l) >= big * 0.0004]
    return [rdp(l, eps) for l in loops]

# ------------------------------------------------------------- svg output

def path_d(loops, fn):
    parts = []
    for loop in loops:
        pts = [fn(x, y) for x, y in loop]
        parts.append('M ' + ' L '.join(f'{x:.2f} {y:.2f}' for x, y in pts) + ' Z')
    return ' '.join(parts)

def bbox(loops):
    xs = [x for l in loops for x, _ in l]
    ys = [y for l in loops for _, y in l]
    return min(xs), min(ys), max(xs), max(ys)

BASE_STYLE = '<style>:root{--band-fill:#000;--icon-color:#000;}</style>'

def write_base_svg(name, loops, cfg):
    x0, y0, x1, y1 = bbox(loops)
    w, h = x1 - x0, y1 - y0
    bw, bh = cfg['box']
    s = min(bw / w, bh / h) * cfg.get('mult', 1.0)
    cx = 512 + cfg.get('dx', 0.0)
    bot = cfg['bottom']

    def fn(x, y):
        return ((x - (x0 + x1) / 2) * s + cx, (y - y1) * s + bot)

    d = path_d(loops, fn)
    # single-color pieces: just the band-fill silhouette, no outline pass
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
           f'viewBox="0 0 512 512">{BASE_STYLE}\n'
           f'<g transform="translate(0.00,0.00) scale(0.500000)">\n'
           f'<path d="{d}" fill="var(--band-fill, currentColor)" fill-rule="evenodd" />\n'
           f'</g>\n</svg>\n')
    with open(os.path.join(ASSETS_DIR, f'{name}.svg'), 'w') as f:
        f.write(svg)

# --- quantum trapezoid slices (port of svg_pipeline.py fit logic) ---

QUANTUM_STYLE = '<style>:root{--band-fill:#111;--band-stroke:#fff;--icon-color:#fff;}</style>'
TRAP_POINTS = '144.00,29.15 368.00,29.15 303.00,164.15 209.00,164.15'
TRAP_ROT = {'p': 0.0, 'n': 60.0, 'b': 300.0, 'r': 240.0, 'q': 120.0, 'k': 180.0}
TRAP_Y_TOP, TRAP_Y_BOT = 29.15, 164.15
TRAP_CX, TRAP_BOT_W = 256.0, 94.0
# the crown is wide/short so a plain fit leaves it tiny in the wedge
QUANTUM_MULTS = {'p': 0.8, 'n': 1.0, 'b': 0.9, 'r': 0.9, 'q': 1.2, 'k': 0.95}

def write_quantum_svg(name, loops):
    x0, y0, x1, y1 = bbox(loops)
    w, h = x1 - x0, y1 - y0
    pad = 6
    avail_w, avail_h = TRAP_BOT_W - 2 * pad, (TRAP_Y_BOT - TRAP_Y_TOP) - 2 * pad
    s = min(avail_w / w, avail_h / h) * QUANTUM_MULTS.get(name, 1.0)
    new_h = h * s
    cx, cy = TRAP_CX, TRAP_Y_TOP + pad + new_h / 2

    def fn(x, y):
        # flip vertically: the piece base (max y) maps to the wide outer edge
        return ((x - (x0 + x1) / 2) * s + cx, cy - (y - (y0 + y1) / 2) * s)

    d = path_d(loops, fn)
    rot = TRAP_ROT[name]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
           f'viewBox="0 0 512 512">{QUANTUM_STYLE}\n'
           f'<g transform="rotate({rot:.2f},256.00,256.00)">\n'
           f'<polygon points="{TRAP_POINTS}" fill="var(--band-fill)" />'
           f'<polygon points="{TRAP_POINTS}" fill="none" stroke="var(--band-stroke)" '
           f'stroke-width="6" stroke-linejoin="round" />\n'
           f'<defs>\n  <clipPath id="trapClip">\n    <polygon points="{TRAP_POINTS}" />\n'
           f'  </clipPath>\n</defs>\n'
           f'<g clip-path="url(#trapClip)">\n'
           f'  <path d="{d}" fill="var(--icon-color)" fill-rule="evenodd" />\n'
           f'</g>\n</g>\n</svg>\n')
    with open(os.path.join(ASSETS_DIR, f'quantum_{name}.svg'), 'w') as f:
        f.write(svg)

# ------------------------------------------------------------------ main

def main():
    for name, cfg in sorted(PIECES.items()):
        png = os.path.join(PNG_DIR, f'{name}.png')
        mask = piece_mask(png)
        src = max(mask.shape)
        eps = 1.2 * src / 1024.0
        loops = trace(mask, eps)
        npts = sum(len(l) for l in loops)
        write_base_svg(name, loops, cfg)
        if name in TRAP_ROT:
            write_quantum_svg(name, loops)
        print(f'{name}: {mask.shape[1]}x{mask.shape[0]} -> {len(loops)} loops, {npts} pts')

if __name__ == '__main__':
    main()
