#!/usr/bin/env python3
"""Create the slightly wider-base solo pawn source."""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from png_pipeline import piece_mask


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "ChessPiecePNGS" / "p.png"
OUTPUT = ROOT / "ChessPiecePNGS" / "p-stylish.png"
INK = np.array((31, 35, 40, 255), dtype=np.uint8)
PAPER = np.array((246, 241, 232, 255), dtype=np.uint8)


def main() -> None:
    mask = piece_mask(SOURCE)
    ys, xs = np.nonzero(mask)
    top, bottom = int(ys.min()), int(ys.max())
    left, right = int(xs.min()), int(xs.max())

    # The foot occupies the bottom quarter of the silhouette. Expand that
    # region by roughly five percent per side, preserving everything above it.
    base_top = round(top + (bottom - top) * 0.74)
    grow_each_side = max(1, round((right - left) * 0.05))
    widened = mask.copy()
    base = mask[base_top:bottom + 1]
    kernel = np.ones((1, grow_each_side * 2 + 1), dtype=bool)
    widened[base_top:bottom + 1] |= ndimage.binary_dilation(base, structure=kernel)

    rgba = np.empty((*widened.shape, 4), dtype=np.uint8)
    rgba[:] = PAPER
    rgba[widened] = INK
    Image.fromarray(rgba, mode="RGBA").save(OUTPUT)
    print(f"wrote {OUTPUT} (+{grow_each_side}px per side at the base)")


if __name__ == "__main__":
    main()
