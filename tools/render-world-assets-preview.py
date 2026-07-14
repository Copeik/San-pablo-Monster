from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ALPHA_CUTOFF = 16


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Renderiza los worldAssets sobre el mapa para revisar su registro visual.")
    parser.add_argument("--output", type=Path, default=Path("tmp/world-assets-preview.png"))
    parser.add_argument("--annotate", action="store_true", help="Dibuja anclas, profundidad y colliders.")
    parser.add_argument("--half", action="store_true", help="Guarda también una copia al 50 %% para inspección rápida.")
    return parser.parse_args()


def load_config() -> dict:
    command = (
        "global.window={};require('./map-data.js');"
        "process.stdout.write(JSON.stringify(window.CITY_MAP_CONFIG));"
    )
    result = subprocess.run(["node", "-e", command], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def normalize_alpha(sprite: Image.Image) -> Image.Image:
    """Replica el descarte de píxeles casi transparentes del runtime."""
    rgba = sprite.convert("RGBA")
    red, green, blue, alpha = rgba.split()
    alpha = alpha.point(lambda value: 0 if value < ALPHA_CUTOFF else value)
    return Image.merge("RGBA", (red, green, blue, alpha))


def display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def main() -> None:
    args = parse_args()
    config = load_config()
    source = ROOT / "assets/maps/san-pablo-reference-hd.webp"
    output = args.output if args.output.is_absolute() else ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(source) as map_image:
        preview = map_image.convert("RGBA").resize(
            (config["width"], config["height"]), Image.Resampling.LANCZOS,
        )

    for asset in sorted(config["worldAssets"], key=lambda item: item.get("depthY", item["y"])):
        sprite_path = ROOT / config["assetSprites"][asset["sprite"]]
        with Image.open(sprite_path) as sprite_image:
            sprite = normalize_alpha(sprite_image).resize((asset["w"], asset["h"]), Image.Resampling.LANCZOS)
        left = round(asset["x"] - asset["w"] / 2)
        top = round(asset["y"] - asset["h"])
        alpha = sprite.getchannel("A")
        shadow_alpha = alpha.filter(ImageFilter.GaussianBlur(2)).point(lambda value: round(value * 0.28))
        shadow = Image.new("RGBA", sprite.size, (24, 45, 34, 0))
        shadow.putalpha(shadow_alpha)
        preview.alpha_composite(shadow, (left, top + 3))
        preview.alpha_composite(sprite, (left, top))

    if args.annotate:
        draw = ImageDraw.Draw(preview, "RGBA")
        for asset in config["worldAssets"]:
            for rel_x, rel_y, width, height in asset.get("colliders", []):
                x = asset["x"] + rel_x
                y = asset["y"] + rel_y
                draw.rectangle((x, y, x + width, y + height), fill=(236, 43, 129, 80), outline=(255, 255, 255, 230), width=2)
            depth_y = asset.get("depthY", asset["y"])
            draw.line((asset["x"] - 8, depth_y, asset["x"] + 8, depth_y), fill=(255, 224, 55, 255), width=2)
            draw.line((asset["x"], depth_y - 8, asset["x"], depth_y + 8), fill=(255, 224, 55, 255), width=2)

    preview.convert("RGB").save(output, quality=96)
    if args.half:
        half = preview.resize((preview.width // 2, preview.height // 2), Image.Resampling.LANCZOS).convert("RGB")
        half_path = output.with_name(f"{output.stem}-half{output.suffix}")
        half.save(half_path, quality=96)
        print(display_path(half_path))
    print(display_path(output))


if __name__ == "__main__":
    main()
