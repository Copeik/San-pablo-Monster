#!/usr/bin/env python3
"""Build the permanent 4x4 Doctor Potato walking atlas from its 6x3 source."""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


CELL = 64
ROWS = ("down", "left", "right", "up")
SOURCE_FRAMES = (
    ((2, 0), (0, 0), (2, 0), (1, 0)),
    ((3, 2), (4, 2), (3, 2), (5, 2)),
    ((3, 1), (4, 1), (3, 1), (5, 1)),
    ((3, 0), (4, 0), (3, 0), (5, 0)),
)


def source_edges(length: int, cells: int) -> list[int]:
    return [round(index * length / cells) for index in range(cells + 1)]


def is_background(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, _alpha = pixel
    brightest = max(red, green, blue)
    darkest = min(red, green, blue)
    luminance = (red + green + blue) / 3
    return brightest - darkest <= 24 and 75 <= luminance <= 176


def remove_connected_background(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    pixels = result.load()
    width, height = result.size
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index] or not is_background(pixels[x, y]):
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

    for index, was_background in enumerate(visited):
        if was_background:
            x = index % width
            y = index // width
            red, green, blue, _alpha = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0)
    return result


def extract_frame(source: Image.Image, col: int, row: int) -> Image.Image:
    x_edges = source_edges(source.width, 6)
    y_edges = source_edges(source.height, 3)
    inset = 3
    box = (
        x_edges[col] + inset,
        y_edges[row] + inset,
        x_edges[col + 1] - inset,
        y_edges[row + 1] - inset,
    )
    frame = remove_connected_background(source.crop(box))
    alpha_box = frame.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError(f"empty Doctor Potato frame at source C{col}, F{row}")
    return frame.crop(alpha_box)


def difference_count(first: Image.Image, second: Image.Image, threshold: int = 12) -> int:
    difference = ImageChops.difference(first.convert("RGBA"), second.convert("RGBA"))
    pixels = difference.tobytes()
    channels = len(difference.getbands())
    return sum(
        1
        for offset in range(0, len(pixels), channels)
        if max(pixels[offset:offset + channels]) > threshold
    )


def build_sheet(source: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    cache: dict[tuple[int, int], Image.Image] = {}
    for row in SOURCE_FRAMES:
        for coordinate in row:
            if coordinate not in cache:
                cache[coordinate] = extract_frame(source, *coordinate)

    max_width = max(frame.width for frame in cache.values())
    max_height = max(frame.height for frame in cache.values())
    scale = min(58 / max_width, 58 / max_height)
    sheet = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    normalized: dict[str, list[Image.Image]] = {}
    frame_metrics: dict[str, list[dict[str, object]]] = {}

    for row_index, (direction, coordinates) in enumerate(zip(ROWS, SOURCE_FRAMES, strict=True)):
        normalized[direction] = []
        frame_metrics[direction] = []
        for col_index, coordinate in enumerate(coordinates):
            source_frame = cache[coordinate]
            width = max(1, round(source_frame.width * scale))
            height = max(1, round(source_frame.height * scale))
            content = source_frame.resize((width, height), Image.Resampling.NEAREST)
            frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            x = (CELL - width) // 2
            y = 60 - height
            frame.alpha_composite(content, (x, y))
            sheet.alpha_composite(frame, (col_index * CELL, row_index * CELL))
            normalized[direction].append(frame)
            frame_metrics[direction].append({"source": list(coordinate), "bbox": list(frame.getchannel("A").getbbox() or ())})

    gait: dict[str, dict[str, int | bool]] = {}
    for direction, frames in normalized.items():
        neutral_a, step_a, neutral_b, step_b = frames
        neutral_match = difference_count(neutral_a, neutral_b) == 0
        step_difference = difference_count(step_a, step_b)
        neutral_to_a = difference_count(neutral_a, step_a)
        neutral_to_b = difference_count(neutral_a, step_b)
        gait[direction] = {
            "neutral_match": neutral_match,
            "step_difference": step_difference,
            "neutral_to_step_a": neutral_to_a,
            "neutral_to_step_b": neutral_to_b,
            "passes": neutral_match and step_difference >= 24 and neutral_to_a >= 24 and neutral_to_b >= 24,
        }

    report = {
        "id": "doctor-potato",
        "source_size": list(source.size),
        "output_size": list(sheet.size),
        "cell_size": CELL,
        "rows": list(ROWS),
        "sequence": ["neutral", "step-a", "neutral", "step-b"],
        "scale": scale,
        "frames": frame_metrics,
        "gait": gait,
        "all_directions_pass": all(metrics["passes"] for metrics in gait.values()),
    }
    return sheet, report


def build_preview(sheet: Image.Image, destination: Path) -> None:
    preview = Image.new("RGBA", (512, 512), (235, 232, 216, 255))
    draw = ImageDraw.Draw(preview)
    for y in range(0, 512, 32):
        for x in range(0, 512, 32):
            if (x // 32 + y // 32) % 2:
                draw.rectangle((x, y, x + 31, y + 31), fill=(211, 218, 203, 255))
    preview.alpha_composite(sheet.resize((512, 512), Image.Resampling.NEAREST))
    destination.parent.mkdir(parents=True, exist_ok=True)
    preview.save(destination, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("assets/sprites/doctor-potato-source.png"))
    parser.add_argument("--output", type=Path, default=Path("assets/sprites/npcs/doctor-potato-walk.png"))
    parser.add_argument("--report", type=Path, default=Path("assets/sprites/npcs/doctor-potato-report.json"))
    parser.add_argument("--preview", type=Path, default=Path("tmp/doctor-potato-preview.png"))
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGBA")
    sheet, report = build_sheet(source)
    if sheet.size != (256, 256):
        raise ValueError(f"unexpected atlas size: {sheet.size}")
    if not report["all_directions_pass"]:
        raise ValueError(f"walking validation failed: {json.dumps(report['gait'], ensure_ascii=False)}")
    for row in range(4):
        for col in range(4):
            if sheet.getpixel((col * CELL, row * CELL))[3] != 0:
                raise ValueError(f"frame C{col}, F{row} does not have a transparent corner")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, optimize=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    build_preview(sheet, args.preview)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
