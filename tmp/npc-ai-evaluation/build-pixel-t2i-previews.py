import hashlib
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
CURRENT = ROOT.parents[1] / "assets" / "sprites" / "protagonist-walk.png"
GENERATED = ROOT / "pixel-t2i-output" / "image_conditional_0001.png"

TILE = 64
SCALE = 4
BG_A = (34, 38, 45, 255)
BG_B = (46, 51, 60, 255)


def checker(size: tuple[int, int], cell: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, BG_A)
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=BG_B)
    return image


def tile(sheet: Image.Image, col: int, row: int) -> Image.Image:
    return sheet.crop((col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE))


def save_gif(frames: list[Image.Image], path: Path, duration: int = 110) -> None:
    scaled = [frame.resize((frame.width * SCALE, frame.height * SCALE), Image.Resampling.NEAREST) for frame in frames]
    scaled[0].save(
        path,
        save_all=True,
        append_images=scaled[1:],
        duration=duration,
        loop=0,
        disposal=2,
        optimize=False,
    )


def build_four_direction_preview(generated: Image.Image) -> None:
    # PIXEL-T2I walk rows are west, east, south, north.
    layout = (("N", 3, 4, 4), ("W", 0, 76, 4), ("S", 2, 4, 76), ("E", 1, 76, 76))
    frames = []
    for frame_index in range(9):
        canvas = checker((144, 144))
        draw = ImageDraw.Draw(canvas)
        for label, row, x, y in layout:
            canvas.alpha_composite(tile(generated, frame_index, row), (x, y))
            draw.text((x + 2, y + 2), label, fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(0, 0, 0, 255))
        frames.append(canvas)
    save_gif(frames, ROOT / "pixel-t2i-walk-4dir.gif")


def build_front_comparison(current: Image.Image, generated: Image.Image) -> None:
    # Current south/front is row 0 with four phases; PIXEL-T2I south/front is row 2 with nine.
    frames = []
    for index in range(36):
        canvas = checker((144, 80))
        draw = ImageDraw.Draw(canvas)
        canvas.alpha_composite(tile(current, index % 4, 0), (4, 12))
        canvas.alpha_composite(tile(generated, index % 9, 2), (76, 12))
        draw.text((8, 2), "ACTUAL", fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(0, 0, 0, 255))
        draw.text((80, 2), "PIXEL-T2I", fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(0, 0, 0, 255))
        frames.append(canvas)
    save_gif(frames, ROOT / "protagonist-front-current-vs-pixel-t2i.gif", duration=100)


def verify(current: Image.Image, generated: Image.Image) -> None:
    reference = Image.open(ROOT / "protagonist-front-reference.png").convert("RGBA")
    reference_large = Image.open(ROOT / "protagonist-front-reference-512.png").convert("RGBA")
    fourview = Image.open(ROOT / "protagonist-4view-pixel-t2i.png").convert("RGBA")

    assert reference.tobytes() == tile(current, 0, 0).tobytes()
    assert reference_large.tobytes() == reference.resize((512, 512), Image.Resampling.NEAREST).tobytes()

    expected_views = ((3, 0, 0), (1, 64, 0), (0, 0, 64), (2, 64, 64))
    for source_row, x, y in expected_views:
        expected = tile(current, 0, source_row)
        actual = fourview.crop((x, y, x + TILE, y + TILE))
        assert actual.tobytes() == expected.tobytes()

    action_columns = (9, 8, 6)
    active = 0
    blank = 0
    for action_index, columns in enumerate(action_columns):
        for row in range(action_index * 4, action_index * 4 + 4):
            for column in range(9):
                alpha = tile(generated, column, row).getchannel("A")
                if column < columns:
                    assert alpha.getbbox() is not None
                    active += 1
                else:
                    assert alpha.getbbox() is None
                    blank += 1
    assert active == 92 and blank == 16

    gif_expectations = {
        "pixel-t2i-walk-4dir.gif": (576, 576, 9),
        "protagonist-front-current-vs-pixel-t2i.gif": (576, 320, 36),
    }
    for name, (width, height, frames) in gif_expectations.items():
        preview = Image.open(ROOT / name)
        assert preview.size == (width, height)
        assert preview.n_frames == frames

    digest = hashlib.sha256(GENERATED.read_bytes()).hexdigest()
    print(f"verified output={generated.size} active_tiles={active} blank_tiles={blank}")
    print(f"verified gifs=2 output_sha256={digest}")


def main() -> None:
    current = Image.open(CURRENT).convert("RGBA")
    generated = Image.open(GENERATED).convert("RGBA")
    assert current.size == (256, 256), current.size
    assert generated.size == (576, 768), generated.size
    build_four_direction_preview(generated)
    build_front_comparison(current, generated)
    verify(current, generated)
    print(ROOT / "pixel-t2i-walk-4dir.gif")
    print(ROOT / "protagonist-front-current-vs-pixel-t2i.gif")


if __name__ == "__main__":
    main()
