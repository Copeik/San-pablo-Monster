#!/usr/bin/env python3
"""Extract the exact Doctor Potato portrait from its connected white backdrop."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def is_connected_backdrop(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, _alpha = pixel
    return min(red, green, blue) >= 210 and max(red, green, blue) - min(red, green, blue) <= 22


def extract_portrait(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index] or not is_connected_backdrop(pixels[x, y]):
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(1, height - 1):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    for index, backdrop in enumerate(visited):
        if backdrop:
            x = index % width
            y = index // width
            red, green, blue, _alpha = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0)

    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Doctor Potato disappeared during background extraction")
    padding = 14
    left = max(0, bounds[0] - padding)
    top = max(0, bounds[1] - padding)
    right = min(width, bounds[2] + padding)
    bottom = min(height, bounds[3] + padding)
    return image.crop((left, top, right, bottom))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("assets/portraits/doctor-potato-source.png"))
    parser.add_argument("--out", type=Path, default=Path("assets/portraits/doctor-potato.png"))
    args = parser.parse_args()

    portrait = extract_portrait(Image.open(args.source))
    corners = (
        portrait.getpixel((0, 0))[3],
        portrait.getpixel((portrait.width - 1, 0))[3],
        portrait.getpixel((0, portrait.height - 1))[3],
        portrait.getpixel((portrait.width - 1, portrait.height - 1))[3],
    )
    if any(corners):
        raise ValueError(f"portrait corners are not transparent: {corners}")
    if portrait.getchannel("A").getbbox() is None:
        raise ValueError("portrait has no visible subject")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    portrait.save(args.out, optimize=True)
    print(f"OK: {args.out} {portrait.width}x{portrait.height} RGBA, transparent corners")


if __name__ == "__main__":
    main()
