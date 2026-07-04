import os
import re
import math

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

# Trapezoid geometry (local coords, before outer rotation)
trap_y_top = 29.15    # fat/wide edge
trap_y_bot = 164.15   # narrow edge  
trap_height = trap_y_bot - trap_y_top  # 135
trap_cx = 256.0
trap_top_width = 224.0
trap_bot_width = 94.0

pieces = ['p', 'n', 'b', 'r', 'q', 'k']
assets_dir = 'frontend/src/assets'

for piece in pieces:
    info = pieces_info[piece]
    base_file = os.path.join(assets_dir, f'{piece}.svg')
    quantum_file = os.path.join(assets_dir, f'quantum_{piece}.svg')
    
    # Read the original quantum SVG from git to get the structure
    result = os.popen(f'git show HEAD:frontend/src/assets/quantum_{piece}.svg').read()
    
    # Read the base piece SVG
    with open(base_file, 'r') as f:
        base_svg = f.read()
    
    # Extract quantum style
    style_match = re.search(r'<style>.*?</style>', result)
    q_style = style_match.group(0) if style_match else '<style>:root{--band-fill:#111;--band-stroke:#fff;--icon-color:#fff;}</style>'
    
    # Extract polygon info
    polygons = re.findall(r'<polygon[^>]*>', result)
    points_match = re.search(r'points="([^"]+)"', polygons[0])
    points = points_match.group(1)
    
    # Extract outer rotation  
    rot_match = re.search(r'rotate\(([^,]+),256\.00,256\.00\)', result)
    outer_rot = float(rot_match.group(1)) if rot_match else 0.0
    
    # Extract the path from the base piece
    path_match = re.search(r'<path d="([^"]*)"', base_svg)
    path_d = path_match.group(1)
    
    # Get the base transform
    tx, ty = info['translate']
    s = info['scale']
    xmin, ymin, xmax, ymax = info['raw_bounds']
    
    # Transformed piece bounds
    piece_x0 = xmin * s + tx
    piece_y0 = ymin * s + ty
    piece_x1 = xmax * s + tx
    piece_y1 = ymax * s + ty
    piece_w = piece_x1 - piece_x0
    piece_h = piece_y1 - piece_y0
    piece_cx = (piece_x0 + piece_x1) / 2
    piece_cy = (piece_y0 + piece_y1) / 2
    
    # Fit into trapezoid
    padding = 6
    avail_width = trap_bot_width - 2*padding  # 82
    avail_height = trap_height - 2*padding     # 123
    
    scale_w = avail_width / piece_w
    scale_h = avail_height / piece_h
    fit_scale = min(scale_w, scale_h)
    
    new_w = piece_w * fit_scale
    new_h = piece_h * fit_scale
    
    # The piece base (large y) should be at the fat/wide edge (y=29.15 + padding)
    # The piece head (small y) points toward the narrow edge
    # We need to flip 180° about the piece's center
    
    # After flipping vertically about piece center:
    #   base was at piece_y1, now at piece_y0 effectively
    #   head was at piece_y0, now at piece_y1 effectively
    # 
    # Final positioning: 
    #   The flipped base should be at y = trap_y_top + padding
    #   Center X should be at trap_cx = 256
    
    # The approach: use a single combined transform on the path group
    # 1. Apply base transform: translate(tx,ty) scale(s) -> maps raw path to ~512x512
    # 2. Scale by fit_scale about piece_cx, piece_cy
    # 3. Flip 180° about piece_cx, piece_cy  
    # 4. Translate so the (now-flipped) base is at the top of the trapezoid
    
    # After step 2: piece occupies [piece_cx - new_w/2, piece_cx + new_w/2] x [piece_cy - new_h/2, piece_cy + new_h/2]
    # After step 3 (flip about center): same bounds, but content is flipped
    # After step 4: translate so top edge = trap_y_top + padding
    #   Currently top edge = piece_cy - new_h/2
    #   Need top edge at trap_y_top + padding
    #   dy = (trap_y_top + padding) - (piece_cy * fit_scale + (1-fit_scale)*piece_cy - new_h/2)
    # Wait, let me think more carefully.
    
    # Let me use an explicit matrix approach.
    # Step 1: Base transform
    #   M1 = translate(tx,ty) * scale(s)
    #   This maps raw coords to piece coords: x' = x*s + tx, y' = y*s + ty
    
    # Step 2+3+4 combined: scale to fit, flip, and position
    # Combined_scale = fit_scale  
    # Flip = scale(1, -1) about piece center = translate(0, 2*piece_cy) scale(1,-1) 
    # 
    # Let's just compute the target position directly.
    # Raw center: raw_cx = (xmin+xmax)/2, raw_cy = (ymin+ymax)/2
    # After base transform: piece_cx, piece_cy
    # 
    # Final desired center: (trap_cx, trap_y_top + padding + new_h/2)
    # 
    # The combined transform on the <path> element can be:
    #   translate(final_cx, final_cy) scale(combined_s, -combined_s) translate(-raw_cx, -raw_cy)
    # where combined_s = s * fit_scale
    # This scales raw coords, flips vertically, and centers at final position
    
    raw_cx = (xmin + xmax) / 2
    raw_cy = (ymin + ymax) / 2
    combined_s = s * fit_scale
    
    final_cx = trap_cx
    final_cy = trap_y_top + padding + new_h / 2
    
    # SVG transform: translate(final_cx, final_cy) scale(combined_s, -combined_s) translate(-raw_cx, -raw_cy)
    # But we also need the base tx,ty... Actually:
    # The path uses raw coords. We want:
    #   x_final = (x_raw - raw_cx) * combined_s + final_cx
    #   y_final = -(y_raw - raw_cy) * combined_s + final_cy   (flip!)
    # = x_raw * combined_s - raw_cx * combined_s + final_cx
    # = y_raw * (-combined_s) + raw_cy * combined_s + final_cy
    #
    # As matrix: translate(final_cx - raw_cx*combined_s, final_cy + raw_cy*combined_s) scale(combined_s, -combined_s)
    
    final_tx = final_cx - raw_cx * combined_s
    final_ty = final_cy + raw_cy * combined_s
    
    transform_str = f"translate({final_tx:.2f}, {final_ty:.2f}) scale({combined_s:.6f}, {-combined_s:.6f})"
    
    # Also need counter-rotation to keep piece upright
    counter_rot = -outer_rot
    
    print(f"{piece}: outer_rot={outer_rot}, combined_s={combined_s:.6f}")
    print(f"  transform: {transform_str}")
    print(f"  counter-rot: {counter_rot} about ({trap_cx}, {(trap_y_top+trap_y_bot)/2:.2f})")
    
    # Build the SVG
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{q_style}\n'
    
    # Outer rotation (same as original)
    svg += f'<g transform="rotate({outer_rot:.2f},256.00,256.00)">\n'
    
    # Trapezoid fill and stroke
    svg += f'<polygon points="{points}" fill="var(--band-fill)" />'
    svg += f'<polygon points="{points}" fill="none" stroke="var(--band-stroke)" stroke-width="6" stroke-linejoin="round" />\n'
    
    # ClipPath definition
    svg += f'<defs>\n'
    svg += f'  <clipPath id="trapClip">\n'
    svg += f'    <polygon points="{points}" />\n'
    svg += f'  </clipPath>\n'
    svg += f'</defs>\n'
    
    # Clipped piece group with counter-rotation and transform
    trap_center_y = (trap_y_top + trap_y_bot) / 2
    svg += f'<g clip-path="url(#trapClip)">\n'
    if counter_rot != 0:
        svg += f'  <g transform="rotate({counter_rot:.2f},{trap_cx:.2f},{trap_center_y:.2f})">\n'
    svg += f'    <path d="{path_d}" fill="var(--icon-color)" fill-rule="evenodd" transform="{transform_str}" />\n'
    if counter_rot != 0:
        svg += f'  </g>\n'
    svg += f'</g>\n'
    
    svg += f'</g>\n'
    svg += f'</svg>\n'
    
    with open(quantum_file, 'w') as f:
        f.write(svg)
    
    print(f"  Written {quantum_file}")
    print()

