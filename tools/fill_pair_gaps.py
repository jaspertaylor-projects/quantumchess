#!/usr/bin/env python3
"""Create cleaned, continuous silhouette sources for two-piece composites.

The pair artwork intentionally separates neighboring pieces, but several
sources also contain narrow horizontal background bands through collars and
bases.  A tall, one-pixel-wide closing kernel fills only those horizontal
cuts: it does not bridge the vertical seam between pieces and is too short to
erase identity marks such as the bishop's diagonal slit.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from png_pipeline import PAIRS, piece_mask


ROOT = Path(__file__).resolve().parent.parent
PNG_DIR = ROOT / "ChessPiecePNGS"
INK = np.array((31, 35, 40, 255), dtype=np.uint8)
PAPER = np.array((246, 241, 232, 255), dtype=np.uint8)


def clean_pair(name: str) -> None:
    source = PNG_DIR / f"{name}.png"
    mask = piece_mask(source)

    # About 2.8% of the canvas height: enough for the widest accidental base
    # separator, but still shorter than the bishop slit and identity cutouts.
    gap_height = max(9, round(mask.shape[0] * 0.028))
    structure = np.ones((gap_height, 1), dtype=bool)
    candidate = ndimage.binary_closing(mask, structure=structure)

    # Accept only additions shaped like horizontal separator bands. This
    # rejects diagonal/vertical identity cuts (bishop slit, knight details)
    # even when their local vertical span happens to fit inside the kernel.
    added = candidate & ~mask
    labels, count = ndimage.label(added)
    accepted = np.zeros_like(mask)
    for label in range(1, count + 1):
        ys, xs = np.nonzero(labels == label)
        if not len(xs):
            continue
        width = int(xs.max() - xs.min() + 1)
        height = int(ys.max() - ys.min() + 1)
        if width >= height * 1.5:
            accepted[labels == label] = True
    cleaned = mask | accepted

    rgba = np.empty((*cleaned.shape, 4), dtype=np.uint8)
    rgba[:] = PAPER
    rgba[cleaned] = INK
    output = PNG_DIR / f"{name}-stylish.png"
    Image.fromarray(rgba, mode="RGBA").save(output)
    print(f"{name}: closed <= {gap_height}px horizontal gaps -> {output.name}")


def main() -> None:
    for name in PAIRS:
        clean_pair(name)


if __name__ == "__main__":
    main()
