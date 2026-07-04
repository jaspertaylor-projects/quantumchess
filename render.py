import cairosvg
from PIL import Image
import numpy as np

cairosvg.svg2png(url='frontend/src/assets/quantum_p.svg', write_to='test_p.png')
img = Image.open('test_p.png')
alpha = np.array(img.split()[-1])
y, x = np.nonzero(alpha)
print("Bounds of non-transparent pixels in rendered quantum_p:")
print("X:", np.min(x), np.max(x))
print("Y:", np.min(y), np.max(y))
