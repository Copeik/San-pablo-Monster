from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera microteselas nativas para el mapa de San Pablo.")
    parser.add_argument("--source", type=Path, default=Path("assets/maps/san-pablo-reference-hd.webp"))
    parser.add_argument("--output", type=Path, default=Path("assets/maps/san-pablo-chunks-2x"))
    parser.add_argument("--world-size", type=int, default=2508)
    parser.add_argument("--chunk-size", type=int, default=512)
    parser.add_argument("--density", type=int, default=2)
    parser.add_argument("--gutter", type=int, default=2)
    parser.add_argument("--quality", type=int, default=100)
    parser.add_argument("--lossless", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    expected = args.world_size * args.density
    columns = math.ceil(args.world_size / args.chunk_size)
    rows = math.ceil(args.world_size / args.chunk_size)
    args.output.mkdir(parents=True, exist_ok=True)

    with Image.open(args.source) as source:
        image = source.convert("RGB")
        if image.size != (expected, expected):
            raise ValueError(f"La fuente debe medir {expected}x{expected}; mide {image.width}x{image.height}.")

        for row in range(rows):
            for column in range(columns):
                logical_x = column * args.chunk_size
                logical_y = row * args.chunk_size
                logical_width = min(args.chunk_size, args.world_size - logical_x)
                logical_height = min(args.chunk_size, args.world_size - logical_y)
                crop_left = max(0, logical_x - args.gutter)
                crop_top = max(0, logical_y - args.gutter)
                crop_right = min(args.world_size, logical_x + logical_width + args.gutter)
                crop_bottom = min(args.world_size, logical_y + logical_height + args.gutter)
                box = (
                    crop_left * args.density,
                    crop_top * args.density,
                    crop_right * args.density,
                    crop_bottom * args.density,
                )
                chunk = image.crop(box)
                target = args.output / f"san-pablo-r{row}-c{column}.webp"
                temporary = target.with_suffix(".tmp.webp")
                chunk.save(temporary, "WEBP", quality=args.quality, lossless=args.lossless, method=6)
                temporary.replace(target)

    print(f"Generadas {columns * rows} teselas ({columns}x{rows}) en {args.output}")


if __name__ == "__main__":
    main()
