#!/usr/bin/env python3
"""Extract the July 2026 user-supplied Fakemon sheets into battle sprites.

The source directory is supplied at runtime because Codex clipboard attachments live
in a temporary folder. Each crop is intentionally limited to one existing front or
back illustration; no view is synthesized by this tool.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


SHEETS = {
    "cucarin": "codex-clipboard-557c19aa-b08f-44b1-b646-15176b9c3fb7.png",
    "burbixir": "codex-clipboard-f6bf375c-61da-4ce0-ad1b-ce66501829de.webp",
    "alapina": "codex-clipboard-c780209e-0b64-4d3f-9938-628f27b0f551.webp",
    "tortihuevo": "codex-clipboard-4c9b5e07-f867-4ef6-a74c-b57de4b071cc.webp",
    "lincacho": "codex-clipboard-6ee59df8-2737-4382-9d69-3e84877f96fd.webp",
    "aquachorro": "codex-clipboard-db7f2789-dd6d-499f-8a4d-0b8d4e779f1e.webp",
    "cincco": "codex-clipboard-a3d913b1-81a7-482d-a592-7cac29cc3f9f.webp",
    "currasma": "codex-clipboard-90f5d44a-4901-4d56-bbea-11075c8397d5.webp",
    "gazpinito": "codex-clipboard-2602f77a-ba4f-4898-9fca-ce761371fc55.webp",
    "turistin": "codex-clipboard-78a4fd1d-ade6-49ee-ac80-b19534f04b7a.webp",
    "freskito": "codex-clipboard-ed3dc405-006e-4f17-8d70-9ac5dcf56a1d.webp",
    "castanin": "codex-clipboard-f19443e0-6870-408b-b485-8d20f720d83b.webp",
    "cajito": "codex-clipboard-f5f9a521-e156-4deb-835b-485735c6a2be.webp",
    "heroiny": "codex-clipboard-a4b0b0b1-7b07-428d-bf37-ed0abb7d34cf.webp",
    "cordillo": "codex-clipboard-b9b0a250-7b9d-423f-a186-bdf33766005a.webp",
    "vaporan": "codex-clipboard-372b91f6-0e2c-4134-8c37-efc356aaf110.webp",
    "canijo": "codex-clipboard-e19d92ad-804d-419a-91d9-a693617336e4.webp",
    "cestin": "codex-clipboard-b524d9ea-4f15-4095-b63c-cdc2e6bbf7ce.webp",
    "coquinia": "codex-clipboard-c5c10b7b-fe76-40c2-8f85-19047ffc07d3.webp",
    "podenin": "codex-clipboard-e417e2bf-a4d3-44f1-9ba6-25a7da71e8ca.webp",
    "nazarion": "codex-clipboard-bb91b414-d949-4f2a-a2df-a6552c9a64e4.webp",
    "pipator": "codex-clipboard-43b72923-71e5-4a5e-8306-e85fe798b97f.webp",
    "culebrin": "codex-clipboard-dd52defe-99c4-4f25-8938-0fac9e0bac72.webp",
}


# line, species, view, crop (x, y, width, height)
SPRITES = [
    ("cucarin", "cucarin", "front", (45, 285, 195, 285)),
    ("cucarin", "cucarin", "back", (244, 280, 190, 292)),
    ("cucarin", "cucarrox", "front", (472, 235, 235, 345)),
    ("cucarin", "cucarrox", "back", (704, 240, 192, 340)),
    ("cucarin", "cucarrex", "front", (949, 220, 260, 365)),
    ("cucarin", "cucarrex", "back", (1211, 235, 207, 350)),
    ("burbixir", "burbixir", "front", (340, 75, 340, 310)),
    ("burbixir", "burbixir", "back", (697, 75, 285, 310)),
    ("burbixir", "toxifizz", "front", (305, 395, 365, 360)),
    ("burbixir", "toxifizz", "back", (650, 395, 365, 360)),
    ("alapina", "alapina", "front", (205, 60, 225, 220)),
    ("alapina", "alapina", "back", (445, 58, 240, 225)),
    ("alapina", "pinorrin", "front", (210, 285, 230, 220)),
    ("alapina", "pinorrin", "back", (440, 285, 260, 220)),
    ("alapina", "conegal", "front", (180, 500, 285, 225)),
    ("alapina", "conegal", "back", (440, 495, 300, 235)),
    ("tortihuevo", "tortihuevo", "front", (255, 55, 365, 195)),
    ("tortihuevo", "tortihuevo", "back", (625, 55, 360, 195)),
    ("tortihuevo", "patatorti", "front", (250, 260, 375, 230)),
    ("tortihuevo", "patatorti", "back", (630, 260, 365, 230)),
    ("tortihuevo", "tortilloro", "front", (245, 500, 385, 265)),
    ("tortihuevo", "tortilloro", "back", (630, 500, 370, 265)),
    ("lincacho", "lincacho", "front", (165, 15, 335, 315)),
    ("lincacho", "lincacho", "back", (505, 15, 260, 315)),
    ("lincacho", "lincebrio", "front", (155, 340, 350, 340)),
    ("lincacho", "lincebrio", "back", (495, 340, 285, 340)),
    ("aquachorro", "aquachorro", "front", (150, 55, 285, 220)),
    ("aquachorro", "aquachorro", "back", (470, 55, 265, 220)),
    ("aquachorro", "hidrocanonazo", "front", (135, 395, 320, 245)),
    ("aquachorro", "hidrocanonazo", "back", (455, 395, 275, 245)),
    ("cincco", "cincco", "front", (145, 35, 335, 290)),
    ("cincco", "cincco", "back", (475, 35, 290, 290)),
    ("cincco", "cincabrio", "front", (135, 345, 375, 330)),
    ("cincco", "cincabrio", "back", (490, 345, 285, 330)),
    ("currasma", "currasma", "front", (155, 175, 365, 370)),
    ("currasma", "currasma", "back", (515, 170, 420, 380)),
    ("gazpinito", "gazpinito", "front", (155, 265, 125, 135)),
    ("gazpinito", "gazpinito", "back", (285, 265, 125, 135)),
    ("gazpinito", "gazpalado", "front", (560, 315, 150, 120)),
    ("gazpinito", "gazpalado", "back", (725, 315, 140, 120)),
    ("turistin", "turistin", "front", (210, 35, 255, 210)),
    ("turistin", "turistin", "back", (485, 35, 260, 210)),
    ("turistin", "turistardo", "front", (180, 250, 305, 235)),
    ("turistin", "turistardo", "back", (480, 250, 285, 235)),
    ("turistin", "turistimo", "front", (145, 485, 355, 280)),
    ("turistin", "turistimo", "back", (470, 485, 310, 280)),
    ("freskito", "freskito", "front", (375, 40, 190, 145)),
    ("freskito", "freskito", "back", (635, 40, 180, 145)),
    ("freskito", "freskon", "front", (345, 190, 250, 165)),
    ("freskito", "freskon", "back", (615, 190, 205, 165)),
    ("freskito", "freskeaire", "front", (320, 355, 325, 185)),
    ("freskito", "freskeaire", "back", (625, 350, 290, 190)),
    ("castanin", "castanin", "front", (205, 25, 310, 300)),
    ("castanin", "castanin", "back", (490, 25, 285, 300)),
    ("castanin", "castanon", "front", (200, 340, 320, 315)),
    ("castanin", "castanon", "back", (490, 340, 295, 315)),
    ("cajito", "cajito", "front", (225, 70, 330, 300)),
    ("cajito", "cajito", "back", (615, 70, 305, 300)),
    ("cajito", "fernacesto", "front", (205, 390, 400, 365)),
    ("cajito", "fernacesto", "back", (570, 390, 420, 365)),
    ("heroiny", "heroiny", "front", (445, 82, 140, 175)),
    ("heroiny", "heroiny", "back", (595, 82, 125, 175)),
    ("heroiny", "diacetyl", "front", (475, 295, 140, 200)),
    ("heroiny", "diacetyl", "back", (600, 295, 140, 200)),
    ("cordillo", "cordillo", "front", (235, 40, 250, 210)),
    ("cordillo", "cordillo", "back", (475, 40, 250, 210)),
    ("cordillo", "rasguelo", "front", (215, 255, 270, 240)),
    ("cordillo", "rasguelo", "back", (465, 255, 270, 240)),
    ("cordillo", "bordonte", "front", (175, 485, 340, 270)),
    ("cordillo", "bordonte", "back", (455, 485, 285, 270)),
    ("vaporan", "vaporan", "front", (245, 55, 285, 450)),
    ("vaporan", "vaporan", "back", (500, 55, 285, 450)),
    ("canijo", "canijo", "front", (265, 25, 235, 240)),
    ("canijo", "canijo", "back", (480, 25, 235, 240)),
    ("canijo", "macarrizo", "front", (245, 270, 250, 245)),
    ("canijo", "macarrizo", "back", (475, 270, 245, 245)),
    ("canijo", "sevillardo", "front", (235, 505, 270, 265)),
    ("canijo", "sevillardo", "back", (475, 505, 270, 265)),
    ("cestin", "cestin", "front", (65, 305, 235, 240)),
    ("cestin", "cestin", "back", (65, 545, 240, 185)),
    ("cestin", "cestaro", "front", (330, 280, 260, 255)),
    ("cestin", "cestaro", "back", (330, 520, 260, 210)),
    ("cestin", "cestarron", "front", (675, 250, 300, 300)),
    ("cestin", "cestarron", "back", (690, 530, 290, 235)),
    ("coquinia", "coquinia", "front", (320, 80, 305, 280)),
    ("coquinia", "coquinia", "back", (665, 80, 300, 280)),
    ("coquinia", "coquiterro", "front", (280, 445, 350, 310)),
    ("coquinia", "coquiterro", "back", (650, 445, 350, 310)),
    ("podenin", "podenin", "front", (260, 60, 260, 315)),
    ("podenin", "podenin", "back", (550, 60, 285, 315)),
    ("podenin", "sevipod", "front", (270, 400, 265, 350)),
    ("podenin", "sevipod", "back", (545, 400, 270, 350)),
    ("nazarion", "nazarion", "front", (330, 65, 330, 645)),
    ("nazarion", "nazarion", "back", (650, 65, 320, 645)),
    ("pipator", "pipator", "front", (25, 70, 285, 250)),
    ("pipator", "pipator", "back", (285, 70, 285, 250)),
    ("pipator", "pipator-comando", "front", (135, 325, 265, 260)),
    ("pipator", "pipator-comando", "back", (320, 325, 250, 260)),
    ("pipator", "pipator-paladin", "front", (560, 325, 250, 260)),
    ("pipator", "pipator-paladin", "back", (755, 325, 250, 260)),
    ("culebrin", "culebrin", "front", (25, 65, 295, 225)),
    ("culebrin", "culebrin", "back", (335, 65, 175, 225)),
    ("culebrin", "maldrina", "front", (25, 315, 235, 270)),
    ("culebrin", "maldrina", "back", (245, 315, 245, 270)),
    ("culebrin", "lumibrina", "front", (540, 315, 225, 280)),
    ("culebrin", "lumibrina", "back", (745, 315, 270, 280)),
]


SPRITE_OPTIONS = {
    ("cucarin", "cucarrox", "front"): (
        "--background-seed", "80", "190",
        "--clear-light", "18", "0", "20", "345", "100",
        "--clear", "0", "145", "45", "55",
    ),
    ("cucarin", "cucarrex", "front"): (
        "--background-seed", "68", "79",
        "--background-seed", "65", "100",
        "--background-seed", "80", "150",
    ),
    ("pipator", "pipator", "front"): ("--clear", "0", "5", "185", "45"),
}


PIXELLAB_OUTPUTS = {
    ("pipator", "pipator", "front"),
    ("pipator", "pipator", "back"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--project", type=Path, default=Path("."))
    parser.add_argument("--extractor", type=Path, required=True)
    parser.add_argument("--line", choices=sorted(SHEETS))
    parser.add_argument(
        "--include-pixellab-source",
        action="store_true",
        help="Also extract Pipator's obstructed source views for PixelLab reference preparation.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    selected = [
        entry for entry in SPRITES
        if (not args.line or entry[0] == args.line)
        and (args.include_pixellab_source or entry[:3] not in PIXELLAB_OUTPUTS)
    ]
    for line, species, view, crop in selected:
        source = args.source_dir / SHEETS[line]
        out = args.project / "assets" / "pokemon" / f"{line}-line" / f"{species}-{view}.png"
        command = [
            sys.executable,
            str(args.extractor),
            "--input", str(source),
            "--out", str(out),
            "--crop", *(str(value) for value in crop),
            "--background", "light",
            "--tolerance", "55",
            "--canvas", "512",
            "--padding", "32",
            "--largest-component",
        ]
        command.extend(SPRITE_OPTIONS.get((line, species, view), ()))
        subprocess.run(command, check=True)
    print(f"Extracted {len(selected)} sprites across {len({entry[0] for entry in selected})} line(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
