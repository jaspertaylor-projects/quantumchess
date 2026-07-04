import xml.etree.ElementTree as ET
import base64
from PIL import Image
import numpy as np
from io import BytesIO

def analyze(svg_file):
    tree = ET.parse(svg_file)
    root = tree.getroot()
    ns = {'svg': 'http://www.w3.org/2000/svg'}
    image = root.find('.//svg:image', ns)
    href = image.attrib.get('href') or image.attrib.get('{http://www.w3.org/1999/xlink}href')
    data = base64.b64decode(href.split(',')[1])
    img = Image.open(BytesIO(data))
    alpha = np.array(img.split()[-1])
    
    y, x = np.nonzero(alpha)
    if len(y) == 0:
        print(f"{svg_file}: Empty")
        return
        
    min_x, max_x = np.min(x), np.max(x)
    min_y, max_y = np.min(y), np.max(y)
    
    # Center of bounding box
    cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2
    width, height = max_x - min_x, max_y - min_y
    
    print(f"{svg_file}:")
    print(f"  Bbox: ({min_x}, {min_y}, {max_x}, {max_y})")
    print(f"  Center: ({cx}, {cy})")
    print(f"  Size: {width}x{height}")

analyze('frontend/src/assets/quantum_p.svg')
