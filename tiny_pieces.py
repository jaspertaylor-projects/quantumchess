import os
import re

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
    
    q_g_match = re.search(r'<g transform="rotate[^"]*">', quantum_svg)
    if q_g_match:
        new_svg += q_g_match.group(0) + '\n'
        
    new_svg += f'  <defs>\n    <clipPath id="trapClip">\n      <polygon points="{points}" />\n    </clipPath>\n  </defs>\n'
        
    for poly in polygons:
        new_svg += '  ' + poly + '\n'
        
    new_svg += '  <g clip-path="url(#trapClip)">\n'
    new_svg += '    <g transform="translate(194.56, 34.56) scale(0.12)">\n'
    new_svg += '      <g transform="rotate(180, 512, 512)">\n'
    
    for path in new_paths:
        new_svg += '        ' + path + '\n'
        
    new_svg += '      </g>\n'
    new_svg += '    </g>\n'
    new_svg += '  </g>\n'
    
    if q_g_match:
        new_svg += '</g>\n'
        
    new_svg += '</svg>\n'
    
    with open(quantum_file, 'w') as f:
        f.write(new_svg)
        
    print(f'Processed {quantum_file}')

