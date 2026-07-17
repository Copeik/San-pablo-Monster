"""Prepare and package per-creature PixelLab battle animations.

PixelLab receives compact 256 px transparent references.  Completed frame
sequences are normalized onto a shared 384 px canvas so idle and every attack
variant do not jump in scale or ground position when the browser swaps between
them.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile

from PIL import Image


DEFAULT_FRAME_COUNT = 8
REFERENCE_CANVAS = 256
REFERENCE_CONTENT = 224
OUTPUT_CANVAS = 384
OUTPUT_CONTENT = 320
GROUND_Y = 352
PIXELLAB_DIRECTIONS = {"front": "south", "back": "north"}
ATTACK_VARIANTS = ("melee", "ranged")


def positive_frame_count(value: str) -> int:
    try:
        frame_count = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("frame count must be an integer") from error
    if frame_count <= 0:
        raise argparse.ArgumentTypeError("frame count must be greater than zero")
    return frame_count


def validate_frame_count(frame_count: int) -> None:
    if frame_count <= 0:
        raise ValueError("frame_count must be greater than zero")


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("image has no visible pixels")
    return bbox


def prepare_reference(path: Path) -> Image.Image:
    source = Image.open(path).convert("RGBA")
    crop = source.crop(visible_bbox(source))
    scale = min(REFERENCE_CONTENT / crop.width, REFERENCE_CONTENT / crop.height)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (REFERENCE_CANVAS, REFERENCE_CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((REFERENCE_CANVAS - resized.width) // 2, (REFERENCE_CANVAS - resized.height) // 2),
    )
    return canvas


def prepare(front: Path, back: Path, output_root: Path) -> list[Path]:
    master_root = output_root / "master"
    upload_root = output_root / "upload"
    master_root.mkdir(parents=True, exist_ok=True)
    upload_root.mkdir(parents=True, exist_ok=True)
    outputs = []
    for view, source in (("front", front), ("back", back)):
        prepared = prepare_reference(source)
        output = master_root / f"{view}.png"
        prepared.save(output, optimize=True, compress_level=9)
        upload = upload_root / f"{view}.png"
        prepared.quantize(
            colors=96,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.NONE,
        ).save(upload, optimize=True, compress_level=9)
        outputs.extend((output, upload))
    return outputs


def load_frames(path: Path, frame_count: int) -> list[Image.Image]:
    validate_frame_count(frame_count)
    paths = sorted(path.glob("frame-*.png"))
    if len(paths) != frame_count:
        raise ValueError(f"{path}: expected {frame_count} frames, found {len(paths)}")
    return [Image.open(frame).convert("RGBA") for frame in paths]


def curate_frames(source: Path, destination: Path, indices: list[int]) -> list[Path]:
    """Copy a reviewed PixelLab sequence without modifying its raw frames."""
    if not indices:
        raise ValueError("at least one frame index is required")
    source_frames = sorted(source.glob("frame-*.png"))
    if not source_frames:
        raise ValueError(f"{source}: no PixelLab frames found")
    if min(indices) < 0 or max(indices) >= len(source_frames):
        raise ValueError(
            f"{source}: frame indices must be between 0 and {len(source_frames) - 1}"
        )
    destination.mkdir(parents=True, exist_ok=True)
    outputs = []
    for output_index, source_index in enumerate(indices):
        output = destination / f"frame-{output_index:02d}.png"
        copyfile(source_frames[source_index], output)
        outputs.append(output)
    return outputs


def import_archive(archive: Path, frame_root: Path, frame_count: int) -> list[Path]:
    validate_frame_count(frame_count)
    outputs = []
    with ZipFile(archive) as bundle:
        names = bundle.namelist()
        for state in ("idle", "attack"):
            for view, direction in PIXELLAB_DIRECTIONS.items():
                marker = f"/animations/{state}-{view}/{direction}/"
                frames = sorted(
                    name for name in names
                    if marker in f"/{name}" and name.lower().endswith(".png")
                )
                if len(frames) != frame_count:
                    raise ValueError(
                        f"{archive}: expected {frame_count} {state}/{view} frames, found {len(frames)}"
                    )
                destination = frame_root / state / view
                destination.mkdir(parents=True, exist_ok=True)
                for index, name in enumerate(frames):
                    output = destination / f"frame-{index:02d}.png"
                    output.write_bytes(bundle.read(name))
                    with Image.open(output) as image:
                        if image.size != (256, 256) or image.mode not in {"RGBA", "P"}:
                            raise ValueError(f"unexpected PixelLab frame format: {name}")
                    outputs.append(output)
    return outputs


def import_combat_archive(
    archive: Path,
    frame_root: Path,
    character_id: str,
    frame_count: int,
    prefer_label: str | None = None,
    only_tokens: set[str] | None = None,
) -> list[Path]:
    """Import the six named combat sequences from an official PixelLab bundle."""
    validate_frame_count(frame_count)
    targets = {
        "idle_front": ("idle", None, "front", "south"),
        "idle_back": ("idle", None, "back", "north"),
        "melee_front": ("attack", "melee", "front", "south"),
        "melee_back": ("attack", "melee", "back", "north"),
        "ranged_front": ("attack", "ranged", "front", "south"),
        "ranged_back": ("attack", "ranged", "back", "north"),
    }
    outputs = []
    with ZipFile(archive) as bundle:
        metadata = json.loads(bundle.read("metadata.json"))
        states = [
            state for state in metadata.get("states", [])
            if state.get("character", {}).get("id") == character_id
        ]
        if len(states) != 1:
            raise ValueError(
                f"{archive}: expected one state for {character_id}, found {len(states)}"
            )
        animations = states[0].get("frames", {}).get("animations", {})
        for token, (state, variant, view, direction) in targets.items():
            if only_tokens and token not in only_tokens:
                continue
            matches = []
            for label, directions in animations.items():
                canonical = label.casefold().replace("-", "_").replace(" ", "_")
                if token in canonical and direction in directions:
                    matches.append((label, directions[direction]))
            if len(matches) > 1 and prefer_label:
                preferred = [
                    match for match in matches
                    if prefer_label.casefold() in match[0].casefold()
                ]
                if len(preferred) == 1:
                    matches = preferred
            if len(matches) != 1:
                labels = ", ".join(label for label, _ in matches) or "none"
                raise ValueError(
                    f"{archive}: expected one {token} animation, found {len(matches)} ({labels})"
                )
            label, frames = matches[0]
            if len(frames) != frame_count:
                raise ValueError(
                    f"{archive}: expected {frame_count} frames for {label}, found {len(frames)}"
                )
            destination = frame_root / state
            if variant:
                destination /= variant
            destination /= view
            destination.mkdir(parents=True, exist_ok=True)
            for index, name in enumerate(frames):
                output = destination / f"frame-{index:02d}.png"
                output.write_bytes(bundle.read(name))
                with Image.open(output) as image:
                    if image.size != (256, 256) or image.mode not in {"RGBA", "P"}:
                        raise ValueError(f"unexpected PixelLab frame format: {name}")
                outputs.append(output)
    return outputs


def shared_view_transform(
    *sequences: list[Image.Image],
) -> tuple[tuple[int, int, int, int], float]:
    boxes = [visible_bbox(image) for sequence in sequences for image in sequence]
    if not boxes:
        raise ValueError("at least one animation frame is required")
    union = (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )
    width, height = union[2] - union[0], union[3] - union[1]
    return union, min(OUTPUT_CONTENT / width, OUTPUT_CONTENT / height)


def normalize_frames(
    frames: list[Image.Image], union: tuple[int, int, int, int], scale: float
) -> list[Image.Image]:
    normalized = []
    for image in frames:
        crop = image.crop(union)
        resized = crop.resize(
            (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
            Image.Resampling.NEAREST,
        )
        canvas = Image.new("RGBA", (OUTPUT_CANVAS, OUTPUT_CANVAS), (0, 0, 0, 0))
        canvas.alpha_composite(
            resized,
            ((OUTPUT_CANVAS - resized.width) // 2, GROUND_Y - resized.height),
        )
        normalized.append(canvas)
    return normalized


def save_webp(frames: list[Image.Image], path: Path, frame_ms: int, loop: int) -> None:
    frames[0].save(
        path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=frame_ms,
        loop=loop,
        lossless=True,
        method=6,
        exact=True,
        # WebP may encode adjacent identical held poses as one longer ANMF
        # chunk. The eight reviewed source frames remain in accepted-frames.
        minimize_size=True,
    )


def preview(
    frame_root: Path,
    output_root: Path,
    frame_count: int,
    attack_variants: list[str] | tuple[str, ...] | None = None,
) -> list[Path]:
    validate_frame_count(frame_count)
    variants = tuple(dict.fromkeys(attack_variants or ()))
    unknown_variants = set(variants).difference(ATTACK_VARIANTS)
    if unknown_variants:
        unexpected = ", ".join(sorted(unknown_variants))
        raise ValueError(f"unsupported attack variant(s): {unexpected}")
    output_root.mkdir(parents=True, exist_ok=True)
    outputs = []
    cell = 192
    sequences = [("idle", None)]
    sequences.extend(("attack", variant) for variant in variants or (None,))
    for state, variant in sequences:
        for view in ("front", "back"):
            source = frame_root / state
            if variant:
                source /= variant
            frames = load_frames(source / view, frame_count)
            sheet = Image.new("RGBA", (cell * 4, cell * 2), (238, 236, 225, 255))
            for index, frame in enumerate(frames):
                background = Image.new("RGBA", (cell, cell), (236, 234, 224, 255))
                for y in range(0, cell, 16):
                    for x in range(0, cell, 16):
                        if (x // 16 + y // 16) % 2:
                            background.paste((207, 210, 201, 255), (x, y, x + 16, y + 16))
                sprite = frame.copy()
                sprite.thumbnail((cell - 8, cell - 8), Image.Resampling.NEAREST)
                background.alpha_composite(sprite, ((cell - sprite.width) // 2, (cell - sprite.height) // 2))
                sheet.alpha_composite(background, ((index % 4) * cell, (index // 4) * cell))
            label = f"{state}-{variant}" if variant else state
            output = output_root / f"{label}-{view}-contact.png"
            sheet.convert("RGB").save(output, optimize=True)
            outputs.append(output)
    return outputs


def pack(
    frame_root: Path,
    output_root: Path,
    slug: str,
    idle_frame_ms: int,
    attack_frame_ms: int,
    frame_count: int = DEFAULT_FRAME_COUNT,
    attack_variants: list[str] | tuple[str, ...] | None = None,
) -> dict[str, Path]:
    validate_frame_count(frame_count)
    variants = tuple(dict.fromkeys(attack_variants or ()))
    unknown_variants = set(variants).difference(ATTACK_VARIANTS)
    if unknown_variants:
        unexpected = ", ".join(sorted(unknown_variants))
        raise ValueError(f"unsupported attack variant(s): {unexpected}")

    idle_sequences = {
        view: load_frames(frame_root / "idle" / view, frame_count)
        for view in ("front", "back")
    }
    if variants:
        attack_sequences = {
            (variant, view): load_frames(
                frame_root / "attack" / variant / view, frame_count
            )
            for variant in variants
            for view in ("front", "back")
        }
    else:
        attack_sequences = {
            ("attack", view): load_frames(frame_root / "attack" / view, frame_count)
            for view in ("front", "back")
        }

    output_root.mkdir(parents=True, exist_ok=True)
    outputs: dict[str, Path] = {}
    for view in ("front", "back"):
        attack_names = variants or ("attack",)
        union, scale = shared_view_transform(
            idle_sequences[view],
            *(attack_sequences[(attack_name, view)] for attack_name in attack_names),
        )
        normalized_idle = normalize_frames(idle_sequences[view], union, scale)
        idle_output = output_root / f"{slug}-idle-{view}-pixellab.webp"
        save_webp(normalized_idle, idle_output, idle_frame_ms, 0)
        outputs[f"idle.{view}"] = idle_output

        for attack_name in attack_names:
            normalized_attack = normalize_frames(
                attack_sequences[(attack_name, view)], union, scale
            )
            if variants:
                filename_stem = f"{slug}-attack-{attack_name}-{view}-pixellab"
                output_key = f"attack.{attack_name}.{view}"
                pose_key = f"pose.{attack_name}.{view}"
            else:
                filename_stem = f"{slug}-attack-{view}-pixellab"
                output_key = f"attack.{view}"
                pose_key = f"pose.{view}"

            attack_output = output_root / f"{filename_stem}.webp"
            save_webp(normalized_attack, attack_output, attack_frame_ms, 1)
            outputs[output_key] = attack_output

            pose = output_root / f"{filename_stem}.png"
            normalized_attack[-1].save(pose, optimize=True, compress_level=9)
            outputs[pose_key] = pose
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--front", type=Path, required=True)
    prepare_parser.add_argument("--back", type=Path, required=True)
    prepare_parser.add_argument("--output-root", type=Path, required=True)

    import_parser = subparsers.add_parser("import-zip")
    import_parser.add_argument("--archive", type=Path, required=True)
    import_parser.add_argument("--frame-root", type=Path, required=True)
    import_parser.add_argument(
        "--frame-count", type=positive_frame_count, default=DEFAULT_FRAME_COUNT
    )

    combat_import_parser = subparsers.add_parser("import-combat-zip")
    combat_import_parser.add_argument("--archive", type=Path, required=True)
    combat_import_parser.add_argument("--frame-root", type=Path, required=True)
    combat_import_parser.add_argument("--character-id", required=True)
    combat_import_parser.add_argument(
        "--prefer-label",
        help="when a reviewed retry exists, choose the matching animation label",
    )
    combat_import_parser.add_argument(
        "--only-tokens",
        nargs="+",
        choices=(
            "idle_front", "idle_back", "melee_front", "melee_back",
            "ranged_front", "ranged_back",
        ),
        help="import only the listed reviewed sequences",
    )
    combat_import_parser.add_argument(
        "--frame-count", type=positive_frame_count, default=DEFAULT_FRAME_COUNT
    )

    curate_parser = subparsers.add_parser("curate")
    curate_parser.add_argument("--source", type=Path, required=True)
    curate_parser.add_argument("--destination", type=Path, required=True)
    curate_parser.add_argument("--indices", nargs="+", type=int, required=True)

    preview_parser = subparsers.add_parser("preview")
    preview_parser.add_argument("--frame-root", type=Path, required=True)
    preview_parser.add_argument("--output-root", type=Path, required=True)
    preview_parser.add_argument(
        "--frame-count", type=positive_frame_count, default=DEFAULT_FRAME_COUNT
    )
    preview_parser.add_argument(
        "--attack-variants",
        nargs="+",
        choices=ATTACK_VARIANTS,
        help="preview attacks from attack/<variant>/<view>",
    )

    pack_parser = subparsers.add_parser("pack")
    pack_parser.add_argument("--frame-root", type=Path, required=True)
    pack_parser.add_argument("--output-root", type=Path, required=True)
    pack_parser.add_argument("--slug", required=True)
    pack_parser.add_argument("--idle-frame-ms", type=int, required=True)
    pack_parser.add_argument("--attack-frame-ms", type=int, required=True)
    pack_parser.add_argument(
        "--frame-count", type=positive_frame_count, default=DEFAULT_FRAME_COUNT
    )
    pack_parser.add_argument(
        "--attack-variants",
        nargs="+",
        choices=ATTACK_VARIANTS,
        help="pack attacks from attack/<variant>/<view> using one shared transform",
    )

    args = parser.parse_args()
    if args.command == "prepare":
        outputs = prepare(args.front, args.back, args.output_root)
    elif args.command == "import-zip":
        outputs = import_archive(args.archive, args.frame_root, args.frame_count)
    elif args.command == "curate":
        outputs = curate_frames(args.source, args.destination, args.indices)
    elif args.command == "import-combat-zip":
        outputs = import_combat_archive(
            args.archive,
            args.frame_root,
            args.character_id,
            args.frame_count,
            args.prefer_label,
            set(args.only_tokens or ()),
        )
    elif args.command == "preview":
        outputs = preview(
            args.frame_root,
            args.output_root,
            args.frame_count,
            args.attack_variants,
        )
    else:
        outputs = pack(
            args.frame_root,
            args.output_root,
            args.slug,
            args.idle_frame_ms,
            args.attack_frame_ms,
            args.frame_count,
            args.attack_variants,
        ).values()
    for output in outputs:
        print(f"wrote {output} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
