#!/usr/bin/env python3
"""Import the CC0 Superpowers battle effects used by the web client."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "assets" / "effects" / "battle" / "superpowers"
RAW_BASE_URL = (
    "https://raw.githubusercontent.com/sparklinlabs/"
    "superpowers-asset-packs/master/ninja-adventure/fx"
)
EFFECTS = (
    {"upstream": 1, "filename": "normal-impact.png", "frames": 5},
    {"upstream": 2, "filename": "fire-ring.png", "frames": 5},
    {"upstream": 14, "filename": "water-swirl.png", "frames": 6},
    {"upstream": 19, "filename": "electric-bolt.png", "frames": 6},
)


def download_png(effect_id: int) -> Image.Image:
    request = Request(
        f"{RAW_BASE_URL}/{effect_id}.png",
        headers={"User-Agent": "pokemon-adventure-battle-fx-importer"},
    )
    with urlopen(request, timeout=30) as response:
        return Image.open(BytesIO(response.read())).convert("RGBA")


def normalize_transparency(image: Image.Image) -> int:
    pixels = list(image.get_flattened_data())
    transparent = 0
    cleaned = []
    for red, green, blue, alpha in pixels:
        if alpha == 0:
            cleaned.append((0, 0, 0, 0))
            transparent += 1
        else:
            cleaned.append((red, green, blue, alpha))
    image.putdata(cleaned)
    return transparent


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for effect in EFFECTS:
        image = download_png(effect["upstream"])
        expected_size = (32 * effect["frames"], 32)
        if image.size != expected_size:
            raise ValueError(
                f"FX {effect['upstream']} has size {image.size}; expected {expected_size}"
            )
        transparent = normalize_transparency(image)
        if transparent == 0:
            raise ValueError(f"FX {effect['upstream']} did not contain transparent pixels")
        destination = OUTPUT_DIR / effect["filename"]
        image.save(destination, optimize=True)
        print(
            f"Imported FX {effect['upstream']} -> {destination.relative_to(ROOT)} "
            f"({effect['frames']} frames, {transparent} transparent pixels)"
        )


if __name__ == "__main__":
    main()
