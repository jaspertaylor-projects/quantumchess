import os
import re

pieces = ['p', 'n', 'b', 'r', 'q', 'k']
assets_dir = '.'

for piece in pieces:
    base_file = os.path.join(assets_dir, f'{piece}.svg')
    quantum_file = os.path.join(assets_dir, f'quantum_{piece}.svg')
    
    with open(base_file, 'r') as f:
        base_svg = f.read()
        
    with open(quantum_file, 'r') as f:
        quantum_svg = f.read()
        
    # Extract style from quantum
    style_match = re.search(r'<style>.*?</style>', quantum_svg)
    q_style = style_match.group(0) if style_match else '<style>:root{--band-fill:#111;--band-stroke:#fff;--icon-color:#fff;}</style>'
    
    # Extract polygons from quantum
    polygons = re.findall(r'<polygon.*?>', quantum_svg)
    
    # Extract the g transform from base piece
    g_match = re.search(r'<g transform="[^"]*">', base_svg)
    g_open = g_match.group(0) if g_match else '<g>'
    
    # Extract paths from base piece
    paths = re.findall(r'<path d="[^"]*"', base_svg)
    # The first path is the filled area. We'll fill it with var(--icon-color) to match the old mask behavior
    # We will also use the outline to make it look nicer or match the bounds perfectly.
    
    # Old behavior was just a flat mask filled with var(--icon-color)
    new_paths = []
    if len(paths) >= 1:
        new_paths.append(paths[0] + ' fill="var(--icon-color)" fill-rule="evenodd" />')
        
    # Assemble new SVG
    new_svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{q_style}\n'
    
    # Wrap in the quantum's transform if it exists, wait, quantum_p has rotate
    q_g_match = re.search(r'<g transform="rotate[^"]*">', quantum_svg)
    if q_g_match:
        new_svg += q_g_match.group(0) + '\n'
        
    for poly in polygons:
        new_svg += poly + '\n'
        
    # Now add the paths inside the base transform
    new_svg += g_open + '\n'
    for path in new_paths:
        new_svg += path + '\n'
    new_svg += '</g>\n'
    
    if q_g_match:
        new_svg += '</g>\n'
        
    new_svg += '</svg>\n'
    
    with open(quantum_file, 'w') as f:
        f.write(new_svg)
        
    print(f'Processed {quantum_file}')
