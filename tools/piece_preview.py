#!/usr/bin/env python3
"""Build ChessPiecePNGS/preview.html: every generated piece SVG rendered on
board squares in both side colorways (styled the way the app injects CSS
vars), plus quantum trapezoid overlay examples. Pair cells draw a guide line
at the shared baseline so bottom alignment is easy to eyeball."""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'frontend', 'src', 'assets')
OUT = os.path.join(ROOT, 'ChessPiecePNGS', 'preview.html')

WHITE = {'--icon-color': '#111827', '--band-fill': '#e5e7eb', '--band-stroke': '#111827'}
BLACK = {'--icon-color': '#ffffff', '--band-fill': '#254065', '--band-stroke': '#f2f2f2'}
BOARD_LIGHT, BOARD_DARK = '#f0d9b5', '#b58863'

SINGLES = ['p', 'n', 'b', 'r', 'q', 'k']
PAIRS = ['bk', 'bq', 'br', 'nb', 'nk', 'nq', 'nr',
         'pb', 'pk', 'pn', 'pq', 'pr', 'qk', 'rk', 'rq']

PAIR_BASELINE_PX = 464 / 512    # fraction of the square height
SINGLE_BASELINE_PX = 444 / 512  # singles share their own baseline

_uid = 0

def load_svg(name):
    global _uid
    _uid += 1
    svg = open(os.path.join(ASSETS, f'{name}.svg')).read()
    svg = re.sub(r'<style>.*?</style>', '', svg, flags=re.S)
    svg = svg.replace('trapClip', f'trapClip{_uid}')
    svg = svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ', 1)
    return svg

def vars_style(v):
    return ';'.join(f'{k}:{val}' for k, val in v.items())

def cell(name, side_vars, square, baseline=None, label=''):
    guide = (f'<div class="guide" style="top:{baseline*100:.2f}%"></div>'
             if baseline else '')
    return (f'<div class="cell">'
            f'<div class="sq" style="background:{square};{vars_style(side_vars)}">'
            f'{load_svg(name)}{guide}</div>'
            f'<div class="cap">{label or name}</div></div>')

def overlay_cell(types, side_vars, square, label):
    imgs = ''.join(f'<div class="ov">{load_svg("quantum_" + t)}</div>' for t in types)
    return (f'<div class="cell"><div class="sq" style="background:{square};{vars_style(side_vars)}">'
            f'{imgs}</div><div class="cap">{label}</div></div>')

def row(title, cells):
    return f'<h2>{title}</h2><div class="row">{"".join(cells)}</div>'

def main():
    sections = []

    for title, vars_, sq in (('White pieces', WHITE, BOARD_DARK),
                             ('Black pieces', BLACK, BOARD_LIGHT)):
        sections.append(row(f'{title} — singles (red line = shared baseline)',
                            [cell(s, vars_, sq, baseline=SINGLE_BASELINE_PX) for s in SINGLES]))
        sections.append(row(f'{title} — two-type composites (red line = shared baseline)',
                            [cell(p, vars_, sq, baseline=PAIR_BASELINE_PX) for p in PAIRS]))

    sections.append(row('Quantum trapezoid slices (3+ type overlays, per-type)',
                        [cell(f'quantum_{s}', WHITE, BOARD_DARK) for s in SINGLES]))
    sections.append(row('Full quantum pieces (trapezoid overlay stacks)', [
        overlay_cell(['n', 'b', 'q'], WHITE, BOARD_DARK, 'white n/b/q'),
        overlay_cell(['n', 'b', 'q'], BLACK, BOARD_LIGHT, 'black n/b/q'),
        overlay_cell(['p', 'n', 'b', 'r', 'q', 'k'], WHITE, BOARD_DARK, 'white full ring'),
        overlay_cell(['p', 'n', 'b', 'r', 'q', 'k'], BLACK, BOARD_LIGHT, 'black full ring'),
    ]))

    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>QuantumChess piece preview</title>
<style>
  body {{ background:#20232a; color:#eee; font-family:system-ui,sans-serif; padding:24px; }}
  h2 {{ font-size:15px; font-weight:600; margin:26px 0 8px; color:#a8b2d1; }}
  .row {{ display:flex; flex-wrap:wrap; gap:10px; }}
  .cell {{ text-align:center; }}
  .sq {{ position:relative; width:128px; height:128px; border-radius:4px; overflow:hidden; }}
  .sq > svg, .ov > svg {{ position:relative; }}
  .guide {{ position:absolute; left:0; right:0; height:1px; background:rgba(255,0,0,.75); pointer-events:none; }}
  .ov {{ position:absolute; inset:1%; opacity:.95; }}
  .cap {{ font-size:11px; color:#888; margin-top:3px; }}
</style></head><body>
<h1 style="font-size:18px">New piece set — generated from ChessPiecePNGS</h1>
{''.join(sections)}
</body></html>"""
    with open(OUT, 'w') as f:
        f.write(html)
    print('wrote', OUT)

if __name__ == '__main__':
    main()
