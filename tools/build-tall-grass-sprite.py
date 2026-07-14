#!/usr/bin/env python3
"""Compact the AI tall-grass atlas into four 64x64 runtime frames."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "assets/generated/san-pablo-rebuilt/runtime/grass-tall-atlas-alpha.png"
DEFAULT_OUTPUT = ROOT / "assets/generated/san-pablo-rebuilt/runtime/grass-tall-spritesheet.png"
FRAME_SIZE = 64
FRAME_COUNT = 4


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Una celda del atlas no contiene pixels visibles")
    return bbox


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    image = Image.open(source).convert("RGBA")
    if image.width < 4 or image.height < 4:
        raise ValueError(f"Atlas demasiado pequeno: {image.size}")

    cell_width = image.width // 2
    cell_height = image.height // 2
    sheet = Image.new("RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE), (0, 0, 0, 0))
    opaque_counts: list[int] = []

    for index in range(FRAME_COUNT):
        column = index % 2
        row = index // 2
        left = column * cell_width
        top = row * cell_height
        right = image.width if column == 1 else left + cell_width
        bottom = image.height if row == 1 else top + cell_height
        cell = image.crop((left, top, right, bottom))
        bbox = alpha_bbox(cell)
        tuft = cell.crop(bbox)

        max_width = FRAME_SIZE - 4
        max_height = FRAME_SIZE - 6
        scale = min(max_width / tuft.width, max_height / tuft.height)
        target = (
            max(1, round(tuft.width * scale)),
            max(1, round(tuft.height * scale)),
        )
        tuft = tuft.resize(target, Image.Resampling.NEAREST)
        frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        frame.alpha_composite(tuft, ((FRAME_SIZE - tuft.width) // 2, FRAME_SIZE - tuft.height - 2))
        opaque_counts.append(sum(frame.getchannel("A").histogram()[220:]))
        sheet.alpha_composite(frame, (index * FRAME_SIZE, 0))

    if min(opaque_counts) < 350:
        raise ValueError(f"Cobertura insuficiente en los frames: {opaque_counts}")

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)
    print(f"Spritesheet: {output.relative_to(ROOT)} ({sheet.width}x{sheet.height})")
    print(f"Pixels opacos por frame: {opaque_counts}")


if __name__ == "__main__":
    main()
