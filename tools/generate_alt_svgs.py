import os
import re

src_dir = '/home/anonymous/TheCode/QuantumChess/frontend/src/assets'

base_pieces = ['p', 'n', 'b', 'r', 'q', 'k']
pieces = {}

def get_inner_g(piece_name):
    path = os.path.join(src_dir, f'{piece_name}.svg')
    with open(path, 'r') as f:
        content = f.read()
        
    g_match = re.search(r'<g[^>]*>([\s\S]*?)<\/g>', content)
    transform_match = re.search(r'<g transform="([^"]+)"', content)
    
    if not g_match:
        raise Exception(f'Could not parse {piece_name}.svg')
        
    return {
        'innerHtml': g_match.group(1),
        'transform': transform_match.group(1) if transform_match else ''
    }

for p in base_pieces:
    pieces[p] = get_inner_g(p)

def generate_combo(p1, p2, out_name):
    g1 = pieces[p1]
    g2 = pieces[p2]
    
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<style>:root{{--band-fill:#000;--icon-color:#000;}}</style>
<g transform="translate(14, 34) scale(0.75)">
  <g transform="{g1['transform']}">
    {g1['innerHtml']}
  </g>
</g>
<g transform="translate(114, 94) scale(0.75)">
  <g transform="{g2['transform']}">
    {g2['innerHtml']}
  </g>
</g>
</svg>"""

    with open(os.path.join(src_dir, out_name), 'w') as f:
        f.write(svg)

combos = [
  'pb', 'pk', 'pn', 'pq', 'pr',
  'nb', 'nk', 'nq', 'nr',
  'bk', 'bq', 'br',
  'qk', 'rq', 'rk'
]

for c in combos:
    generate_combo(c[0], c[1], f'{c}_alt.svg')
