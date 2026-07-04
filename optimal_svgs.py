import os
import re

params = {
    'p': {'scale': '0.190', 'tx': '158.815', 'ty': '0.510', 'rot': '0'},
    'n': {'scale': '0.135', 'tx': '191.670', 'ty': '27.125', 'rot': '-60'},
    'b': {'scale': '0.150', 'tx': '179.275', 'ty': '22.475', 'rot': '60'},  # Wait, outer is 120, so counter should be -120? Let's check: bishop is at 120?
    # Wait, the subagent says:
    # Bishop: rot 60. But outer is usually 120? Wait, let's see original SVGs for rotation angles.
    'r': {'scale': '0.185', 'tx': '161.280', 'ty': '-1.215', 'rot': '120'},
    'q': {'scale': '0.155', 'tx': '176.795', 'ty': '19.770', 'rot': '-120'},
    'k': {'scale': '0.185', 'tx': '161.370', 'ty': '7.110', 'rot': '180'}
}

# Wait, let's extract the actual outer rotation from the quantum_*.svg file and negate it!
# This is safer than hardcoding the subagent's `rot` values, since the subagent might have made a typo in the table (e.g., Bishop is 60? Knight is -60?)
# The outer angles in original quantum_*.svg:
# p: 0
# n: 60
# b: 120
# r: 180
# q: 240
# k: 300
# So counter-rotations should be:
# p: 0
# n: -60
# b: -120
# r: -180
# q: -240
# k: -300

pieces = ['p', 'n', 'b', 'r', 'q', 'k']
assets_dir = 'frontend/src/assets'

for piece in pieces:
    base_file = os.path.join(assets_dir, f'{piece}.svg')
    quantum_file = os.path.join(assets_dir, f'quantum_{piece}.svg')
    
    with open(base_file, 'r') as f:
        base_svg = f.read()
        
    with open(quantum_file, 'r') as f:
        quantum_svg = f.read()
        
    style_match = re.search(r'<style>.*?</style>', quantum_svg)
    q_style = style_match.group(0) if style_match else '<style>:root{--band-fill:#111;--band-stroke:#fff;--icon-color:#fff;}</style>'
    
    polygons = re.findall(r'<polygon.*?>', quantum_svg)
    points_match = re.search(r'points="([^"]+)"', polygons[0])
    points = points_match.group(1) if points_match else "144.00,29.15 368.00,29.15 303.00,164.15 209.00,164.15"
    
    paths = re.findall(r'<path d="[^"]*"', base_svg)
    new_paths = []
    if len(paths) >= 1:
        new_paths.append(paths[0] + ' fill="var(--icon-color)" fill-rule="evenodd" />')
        
    new_svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{q_style}\n'
    
    # Extract outer rotation
    q_g_match = re.search(r'<g transform="rotate\(([^,]+),256\.00,256\.00\)">', quantum_svg)
    outer_rot = float(q_g_match.group(1)) if q_g_match else 0.0
    counter_rot = -outer_rot
    
    if q_g_match:
        new_svg += q_g_match.group(0) + '\n'
        
    new_svg += f'  <defs>\n    <clipPath id="trapClip">\n      <polygon points="{points}" />\n    </clipPath>\n  </defs>\n'
        
    for poly in polygons:
        new_svg += '  ' + poly + '\n'
        
    prm = params[piece]
    scale = prm['scale']
    tx = prm['tx']
    ty = prm['ty']
    
    new_svg += '  <g clip-path="url(#trapClip)">\n'
    new_svg += f'    <g transform="rotate({counter_rot}, 256, 96.65) translate({tx}, {ty}) scale({scale})">\n'
    
    for path in new_paths:
        new_svg += '        ' + path + '\n'
        
    new_svg += '    </g>\n'
    new_svg += '  </g>\n'
    
    if q_g_match:
        new_svg += '</g>\n'
        
    new_svg += '</svg>\n'
    
    with open(quantum_file, 'w') as f:
        f.write(new_svg)
        
    print(f'Processed {quantum_file} with outer rot {outer_rot} and counter {counter_rot}')

