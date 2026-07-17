from __future__ import annotations

"""Extrae el croma, optimiza y cataloga los 40 assets urbanos del editor."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "assets/generated/san-pablo-neighborhood"
MANIFEST = PACK / "manifest.json"
SOURCES = PACK / "sources"
RUNTIME = PACK / "runtime"
INTERMEDIATE = ROOT / "tmp/neighborhood-assets-alpha"


def helper_path() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    return codex_home / "skills/.system/imagegen/scripts/remove_chroma_key.py"


def font(size: int, bold: bool = False):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


def extract_alpha(source: Path, output: Path) -> None:
    helper = helper_path()
    if not helper.is_file():
        raise FileNotFoundError(f"No se encontro el extractor de croma: {helper}")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.is_file() and output.stat().st_mtime_ns >= source.stat().st_mtime_ns:
        return
    output.unlink(missing_ok=True)
    subprocess.run([
        sys.executable, str(helper), "--input", str(source), "--out", str(output),
        "--auto-key", "border", "--soft-matte", "--transparent-threshold", "12",
        "--opaque-threshold", "220", "--despill",
    ], check=True)


def fitted_sprite(alpha_path: Path, max_width: int, max_height: int) -> Image.Image:
    with Image.open(alpha_path) as opened:
        image = opened.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError(f"El recorte quedo totalmente transparente: {alpha_path}")
    cropped = image.crop(bbox)
    scale = min(max_width / cropped.width, max_height / cropped.height)
    size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    resized = cropped.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size[0] + 8, size[1] + 8), (0, 0, 0, 0))
    canvas.alpha_composite(resized, (4, 4))
    return canvas


def collider(entry: dict, width: int, height: int) -> list[list[int]]:
    kind = entry["kind"]
    if kind == "tree":
        collider_width = min(round(width * .34), 44)
        collider_height = min(max(round(height * .14), 14), 24)
    elif kind == "building":
        collider_width = max(28, round(width * .78))
        collider_height = min(max(round(height * .1), 24), 58)
    else:
        collider_width = max(10, round(width * .82))
        collider_height = min(max(round(height * .2), 10), 30)
    return [[-collider_width // 2, -collider_height, collider_width, collider_height]]


def checkerboard(size: tuple[int, int]) -> Image.Image:
    result = Image.new("RGBA", size, "#e9edf3")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], 12):
        for x in range(0, size[0], 12):
            if (x // 12 + y // 12) % 2:
                draw.rectangle((x, y, min(x + 11, size[0] - 1), min(y + 11, size[1] - 1)), fill="#d5dbe5")
    return result


def contact_sheet(records: list[dict]) -> None:
    columns, cell_width, cell_height = 4, 330, 250
    rows = (len(records) + columns - 1) // columns
    sheet = Image.new("RGB", (32 + columns * cell_width, 96 + rows * cell_height), "#111722")
    draw = ImageDraw.Draw(sheet)
    draw.text((22, 18), "San Pablo - 40 assets del barrio", fill="white", font=font(28, True))
    draw.text((22, 57), "Naranjos, edificios, comercios y mobiliario | PNG RGBA", fill="#b6c2d4", font=font(15))
    for index, record in enumerate(records):
        col, row = index % columns, index // columns
        left, top = 16 + col * cell_width, 88 + row * cell_height
        draw.rounded_rectangle((left, top, left + cell_width - 12, top + cell_height - 12), 12, fill="#202838", outline="#46546d", width=2)
        draw.text((left + 12, top + 10), record["label"], fill="white", font=font(16, True))
        draw.text((left + 12, top + 34), f'{record["id"]} · {record["kind"]} · {record["w"]}x{record["h"]}', fill="#b9c5d8", font=font(11))
        preview = checkerboard((cell_width - 36, cell_height - 76))
        with Image.open(ROOT / record["src"].split("?", 1)[0]) as opened:
            sprite = opened.convert("RGBA")
        scale = min((preview.width - 18) / sprite.width, (preview.height - 14) / sprite.height, 1.8)
        sprite = sprite.resize((max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))), Image.Resampling.LANCZOS)
        preview.alpha_composite(sprite, ((preview.width - sprite.width) // 2, (preview.height - sprite.height) // 2))
        sheet.paste(preview.convert("RGB"), (left + 12, top + 58))
    sheet.save(PACK / "contact-sheet.png", optimize=True)


def build_ground_palette() -> None:
    grass_path = ROOT / "assets/generated/san-pablo-derived/tileset-grass-dirt.png"
    road_path = ROOT / "assets/generated/san-pablo-derived/tileset-road-sidewalk.png"
    with Image.open(grass_path) as opened:
        grass_sheet = opened.convert("RGB")
    with Image.open(road_path) as opened:
        road_sheet = opened.convert("RGB")
    cell = grass_sheet.width // 4
    road_cell = road_sheet.width // 4
    grass = grass_sheet.crop((0, 0, cell, cell)).resize((32, 32), Image.Resampling.LANCZOS)
    dirt = grass_sheet.crop((cell, 0, cell * 2, cell)).resize((32, 32), Image.Resampling.LANCZOS)
    asphalt = road_sheet.crop((0, 0, road_cell, road_cell)).resize((32, 32), Image.Resampling.LANCZOS)
    sidewalk = road_sheet.crop((road_cell, 0, road_cell * 2, road_cell)).resize((32, 32), Image.Resampling.LANCZOS)
    plaza = ImageOps.colorize(ImageOps.grayscale(sidewalk), "#776f66", "#e8d8b5")
    sand = ImageOps.colorize(ImageOps.grayscale(dirt), "#9c713d", "#f0cf82")
    palette = Image.new("RGB", (192, 32))
    for index, tile in enumerate([grass, dirt, asphalt, sidewalk, plaza, sand]):
        palette.paste(tile, (index * 32, 0))
    palette.save(RUNTIME / "ground-palette.png", optimize=True)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    asset_version = int(manifest.get("version", 1))
    entries = manifest["assets"]
    if len(entries) != 40:
        raise ValueError(f"El manifiesto debe contener 40 assets, contiene {len(entries)}")
    RUNTIME.mkdir(parents=True, exist_ok=True)
    INTERMEDIATE.mkdir(parents=True, exist_ok=True)
    records = []
    for entry in entries:
        source = SOURCES / f'{entry["file"]}-magenta.png'
        if not source.is_file():
            raise FileNotFoundError(source)
        intermediate = INTERMEDIATE / f'{entry["file"]}-alpha.png'
        output = RUNTIME / f'{entry["file"]}.png'
        if output.is_file() and output.stat().st_mtime_ns >= source.stat().st_mtime_ns:
            with Image.open(output) as opened:
                sprite = opened.convert("RGBA")
        else:
            extract_alpha(source, intermediate)
            sprite = fitted_sprite(intermediate, int(entry["maxWidth"]), int(entry["maxHeight"]))
            sprite.save(output, optimize=True, compress_level=9)
        alpha = sprite.getchannel("A")
        if any(alpha.getpixel(point) for point in [(0, 0), (sprite.width - 1, 0), (0, sprite.height - 1), (sprite.width - 1, sprite.height - 1)]):
            raise ValueError(f"{entry['id']} no tiene esquinas transparentes")
        runtime_src = output.relative_to(ROOT).as_posix()
        record = {
            "id": entry["id"], "src": f"{runtime_src}?v={asset_version}", "kind": entry["kind"],
            "label": entry["label"], "tags": entry.get("tags", []), "w": sprite.width,
            "h": sprite.height, "colliders": collider(entry, sprite.width, sprite.height),
        }
        for metadata_key in ("orientation", "storeys", "units"):
            if metadata_key in entry:
                record[metadata_key] = entry[metadata_key]
        records.append(record)
    build_ground_palette()
    contact_sheet(records)
    body = json.dumps({record["id"]: {key: value for key, value in record.items() if key != "id"} for record in records}, ensure_ascii=False, indent=2)
    (PACK / "catalog.js").write_text(
        "/* Generado por tools/build-neighborhood-asset-pack.py. */\n"
        f"window.CITY_NEIGHBORHOOD_ASSET_CATALOG = Object.freeze({body});\n",
        encoding="utf-8",
    )
    shutil.rmtree(INTERMEDIATE, ignore_errors=True)
    print(f"Pack urbano generado: {len(records)} assets + 6 suelos")


if __name__ == "__main__":
    main()
