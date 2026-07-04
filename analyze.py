import xml.etree.ElementTree as ET
import base64
from PIL import Image
from io import BytesIO

tree = ET.parse('frontend/src/assets/quantum_n.svg')
root = tree.getroot()
ns = {'svg': 'http://www.w3.org/2000/svg'}

# Find the image tag
image = root.find('.//svg:image', ns)
href = image.attrib.get('href') or image.attrib.get('{http://www.w3.org/1999/xlink}href')

if href.startswith('data:image/png;base64,'):
    data = base64.b64decode(href.split(',')[1])
    img = Image.open(BytesIO(data))
    bbox = img.getbbox()
    print("PNG Bounding Box (left, upper, right, lower):", bbox)
    print("PNG Size:", img.size)
