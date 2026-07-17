#!/usr/bin/env python3
"""Build the approved 4x4 diagonal player atlas from two coherent master strips."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps


FRAME_SIZE = 64
FRAME_COUNT = 4
TARGET_HEAD_X = 32
TARGET_FEET_BOTTOM = 60
TARGET_MAX_HEIGHT = 56
HEAD_LOCK_BOTTOM = 36
LEG_REGION_TOP = 41
ALPHA_THRESHOLD = 24


def opaque_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("A sprite frame is empty")
    return bbox


def head_center_x(image: Image.Image, bbox: tuple[int, int, int, int]) -> float:
    left, top, right, bottom = bbox
    head_bottom = top + max(1, round((bottom - top) * 0.44))
    alpha = image.getchannel("A").crop((left, top, right, head_bottom))
    mask = alpha.point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    head_bbox = mask.getbbox()
    if head_bbox is None:
        return (left + right) / 2
    return left + (head_bbox[0] + head_bbox[2]) / 2


def split_strip(path: Path) -> list[Image.Image]:
    strip = Image.open(path).convert("RGBA")
    frames: list[Image.Image] = []
    for column in range(FRAME_COUNT):
        left = round(column * strip.width / FRAME_COUNT)
        right = round((column + 1) * strip.width / FRAME_COUNT)
        frames.append(strip.crop((left, 0, right, strip.height)))
    return frames


def translated(image: Image.Image, offset_x: int, offset_y: int) -> Image.Image:
    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    result.paste(image, (offset_x, offset_y))
    return result


def normalize_master_frames(frames: list[Image.Image]) -> tuple[list[Image.Image], float]:
    source_bboxes = [opaque_bbox(frame) for frame in frames]
    _, neutral_top, _, neutral_bottom = source_bboxes[1]
    scale = TARGET_MAX_HEIGHT / (neutral_bottom - neutral_top)
    normalized: list[Image.Image] = []

    for frame, bbox in zip(frames, source_bboxes):
        left, top, right, bottom = bbox
        cropped = frame.crop(bbox)
        resized = cropped.resize(
            (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
            Image.Resampling.NEAREST,
        )
        canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        source_head_x = head_center_x(frame, bbox) - left
        destination_x = round(TARGET_HEAD_X - source_head_x * scale)
        destination_y = TARGET_FEET_BOTTOM - resized.height
        canvas.paste(resized, (destination_x, destination_y))

        for _ in range(2):
            aligned_bbox = opaque_bbox(canvas)
            offset_x = round(TARGET_HEAD_X - head_center_x(canvas, aligned_bbox))
            offset_y = TARGET_FEET_BOTTOM - aligned_bbox[3]
            if offset_x == 0 and offset_y == 0:
                break
            canvas = translated(canvas, offset_x, offset_y)
        normalized.append(canvas)

    return normalized, scale


def lock_head(frame: Image.Image, neutral: Image.Image) -> Image.Image:
    result = frame.copy()
    result.paste(neutral.crop((0, 0, FRAME_SIZE, HEAD_LOCK_BOTTOM)), (0, 0))
    return result


def apply_opposite_legs(frame: Image.Image, stride_a: Image.Image) -> Image.Image:
    """Keep the facing camera fixed while reversing only the lower stride."""
    result = frame.copy()
    legs = ImageOps.mirror(stride_a.crop((0, LEG_REGION_TOP, FRAME_SIZE, FRAME_SIZE)))
    result.paste(legs, (0, LEG_REGION_TOP))
    return result


def build_cycle(source_frames: list[Image.Image]) -> tuple[list[Image.Image], float]:
    normalized, scale = normalize_master_frames(source_frames)
    neutral = normalized[1]
    stride_a = lock_head(normalized[0], neutral)
    stride_b = apply_opposite_legs(lock_head(normalized[2], neutral), stride_a)
    return [neutral.copy(), stride_a, neutral.copy(), stride_b], scale


def frame_report(frame: Image.Image, index: int) -> dict[str, object]:
    bbox = opaque_bbox(frame)
    return {
        "frame": index,
        "bbox": list(bbox),
        "headX": round(head_center_x(frame, bbox), 2),
        "feetY": bbox[3] - 1,
    }


def paste_row(atlas: Image.Image, row: int, frames: list[Image.Image]) -> None:
    for column, frame in enumerate(frames):
        atlas.alpha_composite(frame, (column * FRAME_SIZE, row * FRAME_SIZE))


def build_atlas(down_right_path: Path, up_right_path: Path, output_path: Path) -> dict[str, object]:
    down_right, down_scale = build_cycle(split_strip(down_right_path))
    up_right, up_scale = build_cycle(split_strip(up_right_path))
    down_left = [ImageOps.mirror(frame) for frame in down_right]
    up_left = [ImageOps.mirror(frame) for frame in up_right]

    rows = [down_left, down_right, up_left, up_right]
    atlas = Image.new("RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE * len(rows)), (0, 0, 0, 0))
    for row, frames in enumerate(rows):
        paste_row(atlas, row, frames)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output_path, format="PNG", optimize=True)
    names = ["down-left", "down-right", "up-left", "up-right"]
    return {
        "output": str(output_path),
        "size": list(atlas.size),
        "cycle": ["neutral", "stride-a", "neutral", "stride-b"],
        "scales": {"down": round(down_scale, 6), "up": round(up_scale, 6)},
        "rows": [
            {"direction": name, "frames": [frame_report(frame, index) for index, frame in enumerate(frames)]}
            for name, frames in zip(names, rows)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--down-right", type=Path, required=True)
    parser.add_argument("--up-right", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build_atlas(args.down_right, args.up_right, args.output)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
