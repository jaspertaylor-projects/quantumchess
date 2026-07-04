import os
import re

pieces_info = {
    'p': {'translate': (0, 0), 'scale': 0.5, 
          'raw_bounds': (259, 164, 764, 848)},
    'n': {'translate': (25.6, 25.6), 'scale': 0.45,
          'raw_bounds': (122, 66, 831, 964)},
    'b': {'translate': (25.6, 25.6), 'scale': 0.45,
          'raw_bounds': (187, 72, 836, 917)},
    'r': {'translate': (0, 0), 'scale': 0.5,
          'raw_bounds': (261, 171, 763, 887)},
    'q': {'translate': (-12.8, -12.8), 'scale': 0.525,
          'raw_bounds': (148, 185, 874, 807)},
    'k': {'translate': (0, 0), 'scale': 0.5,
          'raw_bounds': (254, 145, 769, 823)},
}

# The user wants queen bigger, rook smaller, and pawn slightly smaller
manual_mults = {
    'p': 0.9,
    'q': 1.3,
    'r': 0.8,
}

trap_y_top = 29.15
trap_y_bot = 164.15
trap_height = trap_y_bot - trap_y_top
trap_cx = 256.0
trap_bot_width = 94.0

pieces = ['p', 'n', 'b', 'r', 'q', 'k']
assets_dir = 'frontend/src/assets'

for piece in pieces:
    info = pieces_info[piece]
    base_file = os.path.join(assets_dir, f'{piece}.svg')
    quantum_file = os.path.join(assets_dir, f'quantum_{piece}.svg')
    
    result = os.popen(f'git show HEAD:frontend/src/assets/quantum_{piece}.svg').read()
    
    with open(base_file, 'r') as f:
        base_svg = f.read()
    
    style_match = re.search(r'<style>.*?</style>', result)
    q_style = style_match.group(0)
    
    polygons = re.findall(r'<polygon[^>]*>', result)
    points_match = re.search(r'points="([^"]+)"', polygons[0])
    points = points_match.group(1)
    
    rot_match = re.search(r'rotate\(([^,]+),256\.00,256\.00\)', result)
    outer_rot = float(rot_match.group(1)) if rot_match else 0.0
    
    path_match = re.search(r'<path d="([^"]*)"', base_svg)
    path_d = path_match.group(1)
    
    tx, ty = info['translate']
    s = info['scale']
    xmin, ymin, xmax, ymax = info['raw_bounds']
    
    piece_x0 = xmin * s + tx
    piece_y0 = ymin * s + ty
    piece_x1 = xmax * s + tx
    piece_y1 = ymax * s + ty
    piece_w = piece_x1 - piece_x0
    piece_h = piece_y1 - piece_y0
    
    padding = 6
    avail_width = trap_bot_width - 2*padding
    avail_height = trap_height - 2*padding
    
    scale_w = avail_width / piece_w
    scale_h = avail_height / piece_h
    
    # Base fit scale
    fit_scale = min(scale_w, scale_h)
    
    # Apply manual multipliers
    fit_scale *= manual_mults.get(piece, 1.0)
    
    new_w = piece_w * fit_scale
    new_h = piece_h * fit_scale
    
    raw_cx = (xmin + xmax) / 2
    raw_cy = (ymin + ymax) / 2
    combined_s = s * fit_scale
    
    # Position: base (large y) at fat/wide edge (y=29.15 + padding)
    # This means we flip: scale Y is negative
    final_cx = trap_cx
    final_cy = trap_y_top + padding + new_h / 2
    
    final_tx = final_cx - raw_cx * combined_s
    final_ty = final_cy + raw_cy * combined_s
    
    transform_str = f"translate({final_tx:.2f}, {final_ty:.2f}) scale({combined_s:.6f}, {-combined_s:.6f})"
    
    # Build SVG - NO counter-rotation, pieces naturally follow their slice orientation
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{q_style}\n'
    svg += f'<g transform="rotate({outer_rot:.2f},256.00,256.00)">\n'
    svg += f'<polygon points="{points}" fill="var(--band-fill)" />'
    svg += f'<polygon points="{points}" fill="none" stroke="var(--band-stroke)" stroke-width="6" stroke-linejoin="round" />\n'
    svg += f'<defs>\n'
    svg += f'  <clipPath id="trapClip">\n'
    svg += f'    <polygon points="{points}" />\n'
    svg += f'  </clipPath>\n'
    svg += f'</defs>\n'
    svg += f'<g clip-path="url(#trapClip)">\n'
    svg += f'  <path d="{path_d}" fill="var(--icon-color)" fill-rule="evenodd" transform="{transform_str}" />\n'
    svg += f'</g>\n'
    svg += f'</g>\n'
    svg += f'</svg>\n'
    
    with open(quantum_file, 'w') as f:
        f.write(svg)
    
    print(f"Written {quantum_file} (rot={outer_rot}, scale_mult={manual_mults.get(piece, 1.0)})")

