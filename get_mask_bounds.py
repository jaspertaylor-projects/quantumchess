import xml.etree.ElementTree as ET
import base64
from PIL import Image
import numpy as np
from io import BytesIO

tree = ET.parse('frontend/src/assets/quantum_p.svg')
ns = {'svg': 'http://www.w3.org/2000/svg'}
img_node = tree.getroot().find('.//svg:image', ns)
href = img_node.attrib.get('href') or img_node.attrib.get('{http://www.w3.org/1999/xlink}href')
data = base64.b64decode(href.split(',')[1])
img = Image.open(BytesIO(data))
alpha = np.array(img.split()[-1])

y, x = np.nonzero(alpha)
print("X:", np.min(x), np.max(x))
print("Y:", np.min(y), np.max(y))

# Let's print the actual shape of the piece by drawing a small ascii art of the mask
alpha_small = np.array(img.resize((64, 64), Image.Resampling.BILINEAR).split()[-1])
for row in alpha_small:
    print("".join("#" if val > 128 else "." for val in row))

