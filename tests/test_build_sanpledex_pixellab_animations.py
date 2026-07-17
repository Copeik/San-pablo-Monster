import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from PIL import Image


SCRIPT = Path(__file__).parents[1] / "tools" / "build-sanpledex-pixellab-animations.py"
SPEC = importlib.util.spec_from_file_location("sanpledex_builder", SCRIPT)
BUILDER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(BUILDER)


class SanpledexPixelLabBuilderTests(unittest.TestCase):
    def test_curate_frames_preserves_raw_sequence_and_reviewed_order(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "raw"
            destination = root / "accepted"
            source.mkdir()
            for index in range(8):
                frame = Image.new("RGBA", (16, 16), (index, 0, 0, 255))
                frame.save(source / f"frame-{index:02d}.png")

            outputs = BUILDER.curate_frames(
                source, destination, [0, 1, 2, 3, 4, 4, 4, 4]
            )

            self.assertEqual(len(outputs), 8)
            self.assertEqual(len(list(source.glob("frame-*.png"))), 8)
            with Image.open(outputs[-1]) as image:
                self.assertEqual(image.getpixel((0, 0)), (4, 0, 0, 255))

    def test_import_combat_archive_routes_only_the_six_named_sequences(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "character.zip"
            character_id = "c0000000-0000-0000-0000-000000000001"
            animations = {}
            with ZipFile(archive, "w") as bundle:
                for token, direction in (
                    ("idle_front", "south"),
                    ("idle_back", "north"),
                    ("melee_front", "south"),
                    ("melee_back", "north"),
                    ("ranged_front", "south"),
                    ("ranged_back", "north"),
                ):
                    label = f"Fixture {token}"
                    paths = []
                    for index in range(8):
                        frame = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
                        frame.paste((220, 80, 30, 255), (80 + index, 90, 160 + index, 210))
                        frame_path = root / f"{token}-{index}.png"
                        frame.save(frame_path)
                        member = f"Fixture/animations/{token}/{direction}/frame_{index:03d}.png"
                        bundle.write(frame_path, member)
                        paths.append(member)
                    animations[label] = {direction: paths}
                metadata = {
                    "states": [{
                        "character": {"id": character_id},
                        "frames": {"animations": animations},
                    }]
                }
                bundle.writestr("metadata.json", json.dumps(metadata))

            outputs = BUILDER.import_combat_archive(
                archive, root / "frames", character_id, 8
            )

            self.assertEqual(len(outputs), 48)
            for state, variant in (("idle", None), ("attack", "melee"), ("attack", "ranged")):
                for view in ("front", "back"):
                    destination = root / "frames" / state
                    if variant:
                        destination /= variant
                    destination /= view
                    self.assertEqual(len(list(destination.glob("frame-*.png"))), 8)

    def test_prepare_reference_preserves_alpha_on_compact_canvas(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = Image.new("RGBA", (64, 48), (0, 0, 0, 0))
            source.paste((255, 90, 20, 255), (12, 8, 52, 44))
            path = root / "source.png"
            source.save(path)

            prepared = BUILDER.prepare_reference(path)

            self.assertEqual(prepared.mode, "RGBA")
            self.assertEqual(prepared.size, (256, 256))
            self.assertIsNotNone(prepared.getchannel("A").getbbox())
            self.assertEqual(prepared.getpixel((0, 0))[3], 0)

    def test_pack_writes_four_animations_and_two_final_poses(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            frame_root = root / "frames"
            for state in ("idle", "attack"):
                for view in ("front", "back"):
                    destination = frame_root / state / view
                    destination.mkdir(parents=True)
                    for index in range(8):
                        frame = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
                        x = 18 + (index if state == "attack" else index % 2)
                        frame.paste((220, 80, 30, 255), (x, 18, x + 26, 58))
                        frame.save(destination / f"frame-{index:02d}.png")

            outputs = BUILDER.pack(frame_root, root / "output", "fixture", 84, 77)

            self.assertEqual(set(outputs), {
                "idle.front", "idle.back", "attack.front", "attack.back",
                "pose.front", "pose.back",
            })
            for key in ("idle.front", "idle.back", "attack.front", "attack.back"):
                with Image.open(outputs[key]) as animation:
                    self.assertEqual(animation.size, (384, 384))
                self.assertEqual(animation.n_frames, 8)
            for key in ("pose.front", "pose.back"):
                with Image.open(outputs[key]) as image:
                    pose = image.convert("RGBA")
                    self.assertEqual(pose.size, (384, 384))
                    self.assertEqual(pose.getchannel("A").getbbox()[3], 352)
                self.assertTrue(outputs[key].name.endswith("-pixellab.png"))

    def test_pack_writes_melee_and_ranged_variants_with_named_poses(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            frame_root = root / "frames"
            sequences = (
                ("idle", None),
                ("attack", "melee"),
                ("attack", "ranged"),
            )
            for state, variant in sequences:
                for view in ("front", "back"):
                    destination = frame_root / state
                    if variant:
                        destination /= variant
                    destination /= view
                    destination.mkdir(parents=True)
                    for index in range(8):
                        frame = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
                        width = 24 if variant is None else 32 if variant == "melee" else 40
                        frame.paste((220, 80, 30, 255), (12, 18, 12 + width, 58))
                        frame.save(destination / f"frame-{index:02d}.png")

            outputs = BUILDER.pack(
                frame_root,
                root / "output",
                "fixture",
                84,
                77,
                attack_variants=["melee", "ranged"],
            )

            self.assertEqual(set(outputs), {
                "idle.front", "idle.back",
                "attack.melee.front", "attack.melee.back",
                "attack.ranged.front", "attack.ranged.back",
                "pose.melee.front", "pose.melee.back",
                "pose.ranged.front", "pose.ranged.back",
            })
            for variant in ("melee", "ranged"):
                for view in ("front", "back"):
                    animation = outputs[f"attack.{variant}.{view}"]
                    pose = outputs[f"pose.{variant}.{view}"]
                    self.assertEqual(
                        animation.name,
                        f"fixture-attack-{variant}-{view}-pixellab.webp",
                    )
                    self.assertEqual(
                        pose.name,
                        f"fixture-attack-{variant}-{view}-pixellab.png",
                    )


if __name__ == "__main__":
    unittest.main()
