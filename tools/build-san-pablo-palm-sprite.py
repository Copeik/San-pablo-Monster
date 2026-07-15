from __future__ import annotations

"""Build the small urban-palm sprite used by the San Pablo map.

The source is intentionally deterministic and code-native so the map does not
depend on a third-party sprite sheet.  It is drawn at 4x and downsampled to a
crisp 2x runtime asset with a transparent background.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/generated/san-pablo-rebuilt/runtime/tree-palm.png"


def build() -> Image.Image:
    scale = 4
    image = Image.new("RGBA", (96 * scale, 128 * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")

    def poly(points: list[tuple[int, int]], fill: str, outline: str | None = None) -> None:
        mapped = [(x * scale, y * scale) for x, y in points]
        draw.polygon(mapped, fill=fill)
        if outline:
            draw.line(mapped + [mapped[0]], fill=outline, width=scale, joint="curve")

    # Soft ground shadow and a warm, segmented trunk.
    draw.ellipse((27 * scale, 114 * scale, 69 * scale, 126 * scale), fill=(28, 68, 38, 82))
    poly([(43, 113), (53, 113), (56, 48), (49, 38), (42, 49)], "#9a632f", "#5b3a24")
    for y in range(54, 111, 10):
        draw.line((43 * scale, y * scale, 54 * scale, (y - 3) * scale), fill="#d49a50", width=2 * scale)

    # Eight asymmetric fronds create the compact HGSS-like silhouette.
    fronds = [
        [(49, 43), (16, 27), (9, 18), (29, 20), (48, 34)],
        [(49, 42), (22, 9), (20, 2), (39, 13), (51, 34)],
        [(50, 41), (44, 5), (49, 0), (58, 18), (54, 36)],
        [(51, 41), (72, 7), (80, 5), (70, 27), (57, 38)],
        [(52, 43), (88, 22), (95, 22), (77, 39), (59, 47)],
        [(50, 45), (86, 48), (91, 55), (65, 55), (54, 49)],
        [(48, 44), (17, 48), (5, 55), (32, 56), (47, 49)],
        [(48, 43), (25, 33), (15, 34), (35, 46), (48, 48)],
    ]
    for index, frond in enumerate(fronds):
        fill = "#2f9b45" if index % 2 else "#42b956"
        poly(frond, fill, "#176735")

    # Crown depth and small highlights keep it readable at gameplay scale.
    draw.ellipse((38 * scale, 32 * scale, 60 * scale, 51 * scale), fill="#267c3a", outline="#155a2e", width=scale)
    draw.ellipse((44 * scale, 37 * scale, 51 * scale, 44 * scale), fill="#f2b34f")
    draw.ellipse((51 * scale, 39 * scale, 57 * scale, 46 * scale), fill="#d78a35")
    draw.line((25 * scale, 20 * scale, 45 * scale, 36 * scale), fill="#76d96c", width=scale)
    draw.line((76 * scale, 16 * scale, 57 * scale, 37 * scale), fill="#76d96c", width=scale)

    return image.resize((192, 256), Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    build().save(OUTPUT, "PNG", optimize=True)
    print(f"Palm sprite: {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
