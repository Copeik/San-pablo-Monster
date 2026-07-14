#!/usr/bin/env python3
"""Normalize generated 4x4 NPC sources into the game's 64px cell contract.

Input images must already have transparency.  The generated sources use one
quarter of the canvas per frame but are not necessarily divisible by four;
cell boundaries are therefore computed proportionally.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


CELL = 64
ROWS = ("down", "left", "right", "up")


def proportional_edges(length: int) -> list[int]:
    return [round(index * length / 4) for index in range(5)]


def alpha_bbox(image: Image.Image, threshold: int = 16) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    return alpha.getbbox()


def crop_cells(source: Image.Image) -> list[list[Image.Image]]:
    x_edges = proportional_edges(source.width)
    y_edges = proportional_edges(source.height)
    return [
        [
            source.crop((x_edges[col], y_edges[row], x_edges[col + 1], y_edges[row + 1]))
            for col in range(4)
        ]
        for row in range(4)
    ]


def clean_small_components(image: Image.Image) -> Image.Image:
    """Drop isolated generation specks without removing real detached feet/props."""
    alpha = image.getchannel("A")
    width, height = image.size
    opaque = bytearray(1 if value > 24 else 0 for value in alpha.tobytes())
    visited = bytearray(width * height)
    components: list[list[int]] = []
    for start in range(width * height):
        if not opaque[start] or visited[start]:
            continue
        stack = [start]
        visited[start] = 1
        component: list[int] = []
        while stack:
            index = stack.pop()
            component.append(index)
            x = index % width
            y = index // width
            for nx, ny in ((x - 1, y - 1), (x, y - 1), (x + 1, y - 1),
                           (x - 1, y),                 (x + 1, y),
                           (x - 1, y + 1), (x, y + 1), (x + 1, y + 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    neighbor = ny * width + nx
                    if opaque[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        stack.append(neighbor)
        components.append(component)

    if not components:
        return image
    main_component = max(components, key=len)
    largest = len(main_component)
    main_bottom = max(index // width for index in main_component) + 1
    minimum = max(48, round(largest * 0.01))
    kept_components = []
    for component in components:
        component_top = min(index // width for index in component)
        detached_below = component_top > main_bottom + max(12, round(height * 0.04))
        if len(component) >= minimum and not (detached_below and len(component) < largest * 0.25):
            kept_components.append(component)
    keep = {index for component in kept_components for index in component}
    cleaned_alpha = alpha.copy()
    cleaned_pixels = cleaned_alpha.load()
    for index in range(width * height):
        if index not in keep:
            cleaned_pixels[index % width, index // width] = 0
    cleaned = image.copy()
    cleaned.putalpha(cleaned_alpha)
    return cleaned


def detect_phase_order(cells: list[list[Image.Image]]) -> tuple[list[int], dict[str, list[int]]]:
    """Choose N,S,N,S or S,N,S,N from side-view silhouette widths."""
    side_widths: dict[str, list[int]] = {}
    for row, direction in ((1, "left"), (2, "right")):
        widths = []
        for cell in cells[row]:
            box = alpha_bbox(cell)
            widths.append(0 if box is None else box[2] - box[0])
        side_widths[direction] = widths

    column_means = [
        sum(side_widths[direction][col] for direction in ("left", "right")) / 2
        for col in range(4)
    ]
    even_mean = (column_means[0] + column_means[2]) / 2
    odd_mean = (column_means[1] + column_means[3]) / 2
    # Walking side views are normally wider than neutral ones.  Keep the
    # entire column phase synchronized across all four direction rows.
    order = [1, 0, 3, 2] if even_mean > odd_mean else [0, 1, 2, 3]
    return order, side_widths


def normalize_sheet(source: Image.Image) -> tuple[Image.Image, list[int], dict[str, object]]:
    cells = [[clean_small_components(cell) for cell in row] for row in crop_cells(source.convert("RGBA"))]
    order, side_widths = detect_phase_order(cells)
    cells = [[row[index] for index in order] for row in cells]

    boxes = [[alpha_bbox(cell) for cell in row] for row in cells]
    valid_boxes = [box for row in boxes for box in row if box is not None]
    if len(valid_boxes) != 16:
        raise ValueError(f"expected 16 non-empty frames, found {len(valid_boxes)}")

    max_width = max(box[2] - box[0] for box in valid_boxes)
    max_height = max(box[3] - box[1] for box in valid_boxes)
    scale = min(58 / max_width, 58 / max_height)

    sheet = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    frame_metrics: dict[str, list[dict[str, object]]] = {}
    normalized_frames: list[list[Image.Image]] = []
    for row_index, direction in enumerate(ROWS):
        output_row = []
        frame_metrics[direction] = []
        for col_index, cell in enumerate(cells[row_index]):
            box = boxes[row_index][col_index]
            assert box is not None
            content = cell.crop(box)
            width = max(1, round(content.width * scale))
            height = max(1, round(content.height * scale))
            content = content.resize((width, height), Image.Resampling.NEAREST)

            frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            x = (CELL - width) // 2
            y = 60 - height
            frame.alpha_composite(content, (x, y))
            sheet.alpha_composite(frame, (col_index * CELL, row_index * CELL))
            output_row.append(frame)
            frame_metrics[direction].append({"bbox": list(alpha_bbox(frame) or (0, 0, 0, 0))})
        normalized_frames.append(output_row)

    gait: dict[str, dict[str, int | bool]] = {}
    for row_index, direction in enumerate(ROWS):
        neutral_a, step_a, neutral_b, step_b = normalized_frames[row_index]
        lower_a = step_a.crop((0, 42, CELL, CELL))
        lower_b = step_b.crop((0, 42, CELL, CELL))
        lower_diff = sum(1 for value in ImageChops.difference(lower_a, lower_b).getchannel("A").tobytes() if value > 24)

        arm_a = step_a.crop((0, 24, CELL, 48))
        arm_b = step_b.crop((0, 24, CELL, 48))
        arm_bytes = ImageChops.difference(arm_a, arm_b).convert("RGB").tobytes()
        arm_diff = sum(1 for index in range(0, len(arm_bytes), 3) if max(arm_bytes[index:index + 3]) > 24)

        neutral_diff_a = sum(1 for value in ImageChops.difference(neutral_a, step_a).getchannel("A").tobytes() if value > 24)
        neutral_diff_b = sum(1 for value in ImageChops.difference(neutral_b, step_b).getchannel("A").tobytes() if value > 24)
        gait[direction] = {
            "lower_step_difference": lower_diff,
            "arm_step_difference": arm_diff,
            "neutral_to_step_a": neutral_diff_a,
            "neutral_to_step_b": neutral_diff_b,
            "passes": lower_diff >= 8 and arm_diff >= 12 and neutral_diff_a >= 8 and neutral_diff_b >= 8,
        }

    metrics = {
        "source_size": list(source.size),
        "column_order": order,
        "side_source_widths": side_widths,
        "scale": scale,
        "frames": frame_metrics,
        "gait": gait,
        "passes_gait": all(item["passes"] for item in gait.values()),
    }
    return sheet, order, metrics


def build_preview(records: list[tuple[str, Image.Image]], destination: Path) -> None:
    columns = 5
    card_width = 282
    card_height = 300
    rows = (len(records) + columns - 1) // columns
    preview = Image.new("RGBA", (columns * card_width, rows * card_height), (241, 238, 222, 255))
    draw = ImageDraw.Draw(preview)
    for index, (npc_id, sheet) in enumerate(records):
        card_x = (index % columns) * card_width
        card_y = (index // columns) * card_height
        checker = Image.new("RGBA", (256, 256), (232, 229, 214, 255))
        checker_draw = ImageDraw.Draw(checker)
        for y in range(0, 256, 16):
            for x in range(0, 256, 16):
                if (x // 16 + y // 16) % 2:
                    checker_draw.rectangle((x, y, x + 15, y + 15), fill=(216, 222, 207, 255))
        checker.alpha_composite(sheet)
        preview.alpha_composite(checker, (card_x + 13, card_y + 8))
        draw.text((card_x + 13, card_y + 270), npc_id, fill=(34, 48, 40, 255))
    destination.parent.mkdir(parents=True, exist_ok=True)
    preview.save(destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {"cell_size": CELL, "rows": list(ROWS), "sprites": {}}
    preview_records = []
    for source_path in sorted(args.input_dir.glob("npc-*.png")):
        npc_id = source_path.stem
        sheet, _order, metrics = normalize_sheet(Image.open(source_path))
        output_path = args.output_dir / f"{npc_id}-walk.png"
        sheet.save(output_path, optimize=True)
        report["sprites"][npc_id] = {"file": output_path.as_posix(), **metrics}
        preview_records.append((npc_id, sheet))

    report["sprite_count"] = len(preview_records)
    report["all_pass_gait"] = all(record["passes_gait"] for record in report["sprites"].values())
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    build_preview(preview_records, args.preview)
    print(f"Built {len(preview_records)} NPC sheets")
    print(f"Gait checks: {'PASS' if report['all_pass_gait'] else 'FAIL'}")


if __name__ == "__main__":
    main()
