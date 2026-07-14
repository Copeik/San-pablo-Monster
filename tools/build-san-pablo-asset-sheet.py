from __future__ import annotations

"""Genera una lamina determinista del catalogo de assets de San Pablo."""

import argparse
import json
import math
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LAYOUT = Path("map-layout.js")
DEFAULT_OUTPUT = Path("assets/generated/san-pablo-rebuilt/asset-contact-sheet.png")

COLUMNS = 4
CELL_WIDTH = 390
CELL_HEIGHT = 300
GAP = 18
MARGIN = 24
HEADER_HEIGHT = 102
FOOTER_HEIGHT = 54
CHECKER_SIZE = 14


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Genera la lamina de prototipos declarados en map-layout.js.",
    )
    parser.add_argument("--layout", type=Path, default=DEFAULT_LAYOUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def resolve(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def load_layout(path: Path) -> dict[str, Any]:
    script = r"""
const path = require("path");
global.window = {};
const target = path.resolve(process.argv[1]);
const loaded = require(target);
const layout = (loaded && loaded.CITY_MAP_LAYOUT) || window.CITY_MAP_LAYOUT;
if (!layout) {
  process.stderr.write(`No se encontro CITY_MAP_LAYOUT en ${target}.\n`);
  process.exit(3);
}
process.stdout.write(JSON.stringify(layout));
"""
    try:
        result = subprocess.run(
            ["node", "-e", script, str(path.resolve())],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("Se necesita Node.js para leer map-layout.js.") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or f"codigo {exc.returncode}"
        raise RuntimeError(f"Node.js no pudo cargar {path}: {detail}") from exc

    try:
        layout = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"La salida de {path} no es JSON valido: {exc}") from exc
    if not isinstance(layout, dict):
        raise TypeError("CITY_MAP_LAYOUT debe ser un objeto serializable.")
    return layout


def font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    filename = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(filename, size)
    except OSError:
        return ImageFont.load_default()


def checkerboard(size: tuple[int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, "#e9edf3")
    draw = ImageDraw.Draw(image)
    dark = "#d5dbe5"
    for y in range(0, height, CHECKER_SIZE):
        for x in range(0, width, CHECKER_SIZE):
            if (x // CHECKER_SIZE + y // CHECKER_SIZE) % 2:
                draw.rectangle(
                    [x, y, min(x + CHECKER_SIZE - 1, width - 1), min(y + CHECKER_SIZE - 1, height - 1)],
                    fill=dark,
                )
    return image


def logical_size(prototype: dict[str, Any], image: Image.Image) -> tuple[int, int]:
    width = int(prototype.get("w") or image.width)
    height = int(prototype.get("h") or image.height)
    if width <= 0 or height <= 0:
        raise ValueError(f"Dimensiones logicas invalidas: {width}x{height}")
    return width, height


def render_sheet(layout: dict[str, Any], layout_path: Path) -> Image.Image:
    catalog = layout.get("assetCatalog")
    if not isinstance(catalog, dict) or not catalog:
        raise ValueError(f"{layout_path} no declara un assetCatalog utilizable.")

    entries = list(catalog.items())
    rows = math.ceil(len(entries) / COLUMNS)
    width = MARGIN * 2 + COLUMNS * CELL_WIDTH + (COLUMNS - 1) * GAP
    height = HEADER_HEIGHT + rows * CELL_HEIGHT + (rows - 1) * GAP + FOOTER_HEIGHT + MARGIN
    sheet = Image.new("RGBA", (width, height), "#111722")
    draw = ImageDraw.Draw(sheet)

    draw.text(
        (MARGIN, 22),
        "San Pablo reconstruido - catalogo de assets",
        fill="#f6f8fc",
        font=font(30, bold=True),
    )
    draw.text(
        (MARGIN, 63),
        f"{len(entries)} prototipos declarados en map-layout.js | sprites runtime con transparencia",
        fill="#aebbd0",
        font=font(17),
    )

    for index, (asset_id, raw_prototype) in enumerate(entries):
        if not isinstance(raw_prototype, dict):
            raise TypeError(f"El prototipo {asset_id!r} no es un objeto.")
        prototype = raw_prototype
        source = prototype.get("src")
        if not isinstance(source, str) or not source:
            raise ValueError(f"El prototipo {asset_id!r} no declara src.")
        source_path = resolve(Path(source))
        if not source_path.is_file():
            raise FileNotFoundError(f"No existe el sprite de {asset_id!r}: {source_path}")

        column = index % COLUMNS
        row = index // COLUMNS
        left = MARGIN + column * (CELL_WIDTH + GAP)
        top = HEADER_HEIGHT + row * (CELL_HEIGHT + GAP)
        right = left + CELL_WIDTH - 1
        bottom = top + CELL_HEIGHT - 1
        draw.rounded_rectangle(
            [left, top, right, bottom],
            radius=14,
            fill="#202838",
            outline="#46546d",
            width=2,
        )

        origin = "nuevo" if "san-pablo-rebuilt" in source.replace("\\", "/") else "reutilizado"
        badge_color = "#2e9b73" if origin == "nuevo" else "#4979b8"
        badge_text = origin.upper()
        badge_font = font(12, bold=True)
        badge_box = draw.textbbox((0, 0), badge_text, font=badge_font)
        badge_width = badge_box[2] - badge_box[0] + 18
        draw.rounded_rectangle(
            [right - badge_width - 14, top + 13, right - 14, top + 38],
            radius=8,
            fill=badge_color,
        )
        draw.text(
            (right - badge_width - 5, top + 18),
            badge_text,
            fill="#ffffff",
            font=badge_font,
        )

        draw.text((left + 16, top + 12), asset_id, fill="#ffffff", font=font(19, bold=True))
        with Image.open(source_path) as opened:
            sprite = opened.convert("RGBA")
        logical_width, logical_height = logical_size(prototype, sprite)
        kind = str(prototype.get("kind") or "asset")
        draw.text(
            (left + 16, top + 41),
            f"{kind} | {logical_width}x{logical_height} px logicos",
            fill="#b9c5d8",
            font=font(14),
        )

        preview_left = left + 13
        preview_top = top + 68
        preview_width = CELL_WIDTH - 26
        preview_height = CELL_HEIGHT - 81
        preview = checkerboard((preview_width, preview_height))
        max_width = preview_width - 28
        max_height = preview_height - 24
        scale = min(max_width / logical_width, max_height / logical_height)
        render_width = max(1, round(logical_width * scale))
        render_height = max(1, round(logical_height * scale))
        sprite = sprite.resize((render_width, render_height), Image.Resampling.LANCZOS)
        offset = ((preview_width - render_width) // 2, (preview_height - render_height) // 2)
        preview.alpha_composite(sprite, offset)
        sheet.alpha_composite(preview, (preview_left, preview_top))
        draw.rounded_rectangle(
            [preview_left, preview_top, preview_left + preview_width - 1, preview_top + preview_height - 1],
            radius=8,
            outline="#59677f",
            width=1,
        )

    footer_y = HEADER_HEIGHT + rows * CELL_HEIGHT + (rows - 1) * GAP + 17
    draw.text(
        (MARGIN, footer_y),
        "Azul: reutilizado de san-pablo-derived | Verde: creado para san-pablo-rebuilt",
        fill="#9facc0",
        font=font(14),
    )
    return sheet.convert("RGB")


def main() -> None:
    args = parse_args()
    layout_path = resolve(args.layout)
    output_path = resolve(args.output)
    layout = load_layout(layout_path)
    sheet = render_sheet(layout, layout_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, format="PNG", optimize=True, compress_level=9)
    print(f"Lamina generada: {output_path.relative_to(ROOT)} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
