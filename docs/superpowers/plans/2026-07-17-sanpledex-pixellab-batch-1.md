# Sanpledex PixelLab Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar, integrar y validar cuatro animaciones PixelLab personalizadas para las primeras diez criaturas de la Sanpledex.

**Architecture:** Un manifiesto JSON describe identidad, coreografía, fuentes y tiempos; herramientas deterministas generan una proyección clásica para el navegador y empaquetan fotogramas PixelLab en WebP. `script.js` consume un único registro para seleccionar `idle` o `attack` por vista, y conserva los PNG y el ataque CSS actuales como fallbacks.

**Tech Stack:** PixelLab MCP v3, JavaScript clásico + Node.js `node:test`, Python 3 + Pillow, WebP animado RGBA, HTML/CSS.

## Global Constraints

- La fuente de verdad es `docs/superpowers/specs/2026-07-17-sanpledex-pixellab-batch-1-design.md`.
- El lote contiene exactamente los IDs `4, 5, 6, 9001, 9002, 9003, 9101, 9102, 9201, 9202` en ese orden.
- Cada criatura recibe `idle.front`, `idle.back`, `attack.front` y `attack.back`.
- Frente de combate = `south`; espalda del jugador = `north`.
- Cada animación usa el PNG real de su vista como `custom_start_frame_base64`.
- Cada secuencia final tiene 12 fotogramas, transparencia real y lienzo de 384 × 384 px.
- Espera dura 0,9–1,2 s y repite; ataque dura 0,75–1,1 s y vuelve al idle.
- Cada WebP pesa menos de 1,2 MB y cada paquete de cuatro pesa menos de 4,8 MB.
- No se usa modo `pro`; no se sobrescribe ni elimina ningún PNG fuente o activo previo.
- Una criatura sólo se activa cuando sus cuatro WebP han sido validados.
- El segundo lote no comienza hasta entregar este lote para aprobación.

---

## File Structure

- Create: `assets/pokemon/pixellab-batch-1-manifest.json` — fuente declarativa de generación y tiempos.
- Create: `tools/build-sanpledex-animation-data.mjs` — genera el registro clásico del navegador.
- Create: `sanpledex-animation-data.js` — proyección generada que expone `globalThis.SANPLEDEX_ANIMATION_ASSETS`.
- Create: `tools/build-sanpledex-pixellab-animations.py` — prepara referencias y empaqueta fotogramas.
- Create: `tests/sanpledex-animation-manifest.test.mjs` — contrato del manifiesto y proyección.
- Create: `tests/sanpledex-animation-assets.test.mjs` — contrato binario de los 40 WebP.
- Create: `tests/sanpledex-animation-runtime.test.mjs` — selección, Sanpledex, combate y fallbacks.
- Modify: `index.html` — carga el registro antes de `script.js`.
- Modify: `script.js` — consume el registro y cambia entre estados.
- Modify: `styles.css` — evita animación CSS duplicada durante WebP.
- Modify: `assets/pokemon/*-line/CREDITS.txt` — procedencia de los diez paquetes.
- Create per creature: `assets/pokemon/<line>/pixellab-hq/<slug>/{master,frames,pixellab-jobs.json}` — maestros, frames y jobs.

---

### Task 1: Define the canonical batch manifest

**Files:**
- Create: `tests/sanpledex-animation-manifest.test.mjs`
- Create: `assets/pokemon/pixellab-batch-1-manifest.json`

**Interfaces:**
- Produces: JSON con `{version, batch, frameCount, canvas, creatures[]}`; cada criatura contiene `{id, slug, line, source, identity, idle, attack, timing}`.

- [ ] **Step 1: Write the failing manifest test**

```js
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedIds = [4, 5, 6, 9001, 9002, 9003, 9101, 9102, 9201, 9202];

test("batch 1 manifest is complete and source-backed", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "assets/pokemon/pixellab-batch-1-manifest.json"), "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.batch, 1);
  assert.equal(manifest.frameCount, 12);
  assert.equal(manifest.canvas, 384);
  assert.deepEqual(manifest.creatures.map(({ id }) => id), expectedIds);
  for (const creature of manifest.creatures) {
    assert.equal(typeof creature.ready, "boolean");
    assert.match(creature.slug, /^[a-z0-9-]+$/);
    assert.ok(creature.identity.length >= 80);
    assert.ok(creature.idle.length >= 80);
    assert.ok(creature.attack.length >= 80);
    assert.ok(Number.isInteger(creature.timing.idleFrameMs));
    assert.ok(Number.isInteger(creature.timing.attackFrameMs));
    assert.ok(creature.timing.impactMs < creature.timing.attackFrameMs * manifest.frameCount);
    await access(path.join(root, creature.source.front));
    await access(path.join(root, creature.source.back));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/sanpledex-animation-manifest.test.mjs`

Expected: FAIL con `ENOENT` para `pixellab-batch-1-manifest.json`.

- [ ] **Step 3: Create the manifest with exact records**

Crear JSON válido con esta tabla de valores; cada registro empieza con `"ready": false`. `identity`, `idle` y `attack` son cadenas completas en inglés construidas exactamente a partir de cada fila, sin entorno, cámara, texto, partículas ni miembros nuevos:

| id | slug / line | source front/back | identity | idle | attack | idle/attack/impact ms |
|---|---|---|---|---|---|---|
| 4 | `braspin` / `braspy-line` | `braspy-front.png`, `braspy-back.png` | Young four-legged brown hedgehog monster; exact cute face, short paws and fan of orange fire quills | Lively breathing, contained paw bounce and gentle waves through attached fire quills; seamless return | Lower snout, compress legs, short head-first ram; quills sweep back then flare at impact | `84 / 77 / 600` |
| 5 | `ascuero` / `braspy-line` | `ascuero-front.png`, `ascuero-back.png` | Heavy four-legged brown beast; exact rock armor plates, large claws and dorsal flame crest | Low defensive breathing; chest and shoulders shift under armor while dorsal fire pulses | Load hind legs and drive shoulder, forehead and shell forward in a heavy body charge | `84 / 82 / 650` |
| 6 | `volcazote` / `braspy-line` | `volcazote-front.png`, `volcazote-back.png` | Massive quadruped; exact dark boulder shell, magma cracks, four clawed limbs and continuous dorsal flames | Deep volcanic breath; torso lowers, magma cracks pulse and flame crown rises | Plant claws, compress the huge body, short seismic surge and double foreleg slam | `88 / 90 / 760` |
| 9001 | `petrillo` / `petrillo-line` | `petrillo-front.png`, `petrillo-back.png` | Round dark seed face inside mossy stone ring; yellow eyes, small mouth, two-leaf sprout and four stone feet | Curious rocking; sprout follows the motion and four feet readjust without translation | Retract face slightly and roll half a turn forward to strike with the stone crown, then recover | `84 / 75 / 580` |
| 9002 | `musgolem` / `petrillo-line` | `musgolem-front.png`, `musgolem-back.png` | Stocky stone guardian; two huge arms, two legs, dark face, yellow eyes, green gem, moss, vines, flowers and side crystals | Guardian breathing; alternate weight between arms while vines and flowers lag softly | Raise both fists, load torso and deliver one double mossy hammer blow without shedding rocks | `88 / 85 / 700` |
| 9003 | `terravordeo` / `petrillo-line` | `terravordeo-front.png`, `terravordeo-back.png` | Monumental bipedal rock and vegetation giant; two arms, two legs, green gems, dark face, crystals, vines and flower crown | Very slow monumental breathing; shoulders rise and foliage reacts with delayed weight | Pull one giant fist back, rotate torso and deliver one heavy seismic punch with opposite arm balancing | `92 / 92 / 780` |
| 9101 | `peyote` / `peyote-line` | `peyote-front.png`, `peyote-back.png` | Exact square adobe-brick body, four short block feet, face and medallion in front, square rear leaf panel without face | Happy in-place dance with small steps and heavy square-body bounce; seamless loop | Aggressive front expression, brief crouch, straight full-body charge, impact, recoil and return; no rear face | `84 / 75 / 610` |
| 9102 | `prensalito` / `peyote-line` | `prensalito-front.png`, `prensalito-back.png` | Cubic brick fortress; two column forearms, white eyes, block jaw, diamond leaf plate and gold gems | Minimal fortress sway; forearms carry weight and masonry body rises imperceptibly | Widen stance, lift central block slightly and fall forward into a two-forearm compression slam | `92 / 88 / 750` |
| 9201 | `criascama` / `dracoscama-line` | `criascama-front.png`, `criascama-back.png` | Juvenile green dragon; exactly two small wings, four paws, cream belly, gold horns and spines, curved tail | Seated energetic bounce, two short wing flaps and elastic tail motion | Small forward hop, open two wings for balance, one claw swipe and clean landing | `80 / 71 / 540` |
| 9202 | `aliscama` / `dracoscama-line` | `aliscama-front.png`, `aliscama-back.png` | Green and gold insectoid dragon; four translucent wings, two antennae, two arms, two legs and segmented tail | Light hover with alternating four-wing beats; limbs, antennae and tail compensate in place | Fold four wings, short diagonal acceleration, cross both front claws, brake with wings open | `80 / 67 / 500` |

Cada prompt debe terminar con: `Preserve the exact supplied silhouette, palette, anatomy and view. Transparent background. Return exactly to the supplied starting pose.`

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/sanpledex-animation-manifest.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add tests/sanpledex-animation-manifest.test.mjs assets/pokemon/pixellab-batch-1-manifest.json
git commit -m "test: define Sanpledex animation batch 1"
```

---

### Task 2: Generate the browser animation registry

**Files:**
- Modify: `tests/sanpledex-animation-manifest.test.mjs`
- Create: `tools/build-sanpledex-animation-data.mjs`
- Create: `sanpledex-animation-data.js`
- Modify: `index.html:682-684`

**Interfaces:**
- Consumes: manifest Task 1.
- Produces: `globalThis.SANPLEDEX_ANIMATION_ASSETS[id]` con `{idle, attack, durationMs, impactMs}`.

- [ ] **Step 1: Add a failing projection test**

```js
import vm from "node:vm";

test("browser registry projects all four assets and timings", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "assets/pokemon/pixellab-batch-1-manifest.json"), "utf8"));
  const source = await readFile(path.join(root, "sanpledex-animation-data.js"), "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  const registry = context.globalThis.SANPLEDEX_ANIMATION_ASSETS;
  assert.deepEqual(
    Object.keys(registry).map(Number),
    manifest.creatures.filter(({ ready }) => ready).map(({ id }) => id),
  );
  for (const [id, record] of Object.entries(registry)) {
    assert.match(record.idle.front, /-idle-front-pixellab\.webp$/);
    assert.match(record.idle.back, /-idle-back-pixellab\.webp$/);
    assert.match(record.attack.front, /-attack-front-pixellab\.webp$/);
    assert.match(record.attack.back, /-attack-back-pixellab\.webp$/);
    assert.ok(record.impactMs < record.durationMs, id);
  }
});
```

- [ ] **Step 2: Verify red**

Run: `node --test tests/sanpledex-animation-manifest.test.mjs`

Expected: FAIL con `ENOENT` para `sanpledex-animation-data.js`.

- [ ] **Step 3: Implement the deterministic generator**

```js
import { readFile, writeFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("assets/pokemon/pixellab-batch-1-manifest.json", "utf8"));
const registry = Object.fromEntries(manifest.creatures.filter(({ ready }) => ready).map((creature) => {
  const base = `assets/pokemon/${creature.line}/${creature.slug}`;
  return [creature.id, {
    idle: { front: `${base}-idle-front-pixellab.webp`, back: `${base}-idle-back-pixellab.webp` },
    attack: { front: `${base}-attack-front-pixellab.webp`, back: `${base}-attack-back-pixellab.webp` },
    durationMs: creature.timing.attackFrameMs * manifest.frameCount,
    impactMs: creature.timing.impactMs,
  }];
}));
const output = `(() => {\n  "use strict";\n  globalThis.SANPLEDEX_ANIMATION_ASSETS = Object.freeze(${JSON.stringify(registry, null, 2)});\n})();\n`;
await writeFile("sanpledex-animation-data.js", output, "utf8");
```

- [ ] **Step 4: Generate and load it before the game**

Run: `node tools/build-sanpledex-animation-data.mjs`

Add to `index.html` immediately before `script.js`:

```html
<script src="sanpledex-animation-data.js?v=1"></script>
```

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/sanpledex-animation-manifest.test.mjs`

Expected: PASS.

```powershell
git add tools/build-sanpledex-animation-data.mjs sanpledex-animation-data.js index.html tests/sanpledex-animation-manifest.test.mjs
git commit -m "feat: generate Sanpledex animation registry"
```

---

### Task 3: Build reusable reference and WebP tooling

**Files:**
- Create: `tools/build-sanpledex-pixellab-animations.py`
- Create: `tests/test_build_sanpledex_pixellab_animations.py`

**Interfaces:**
- Produces CLI: `prepare --slug <slug>`, `pack --slug <slug>`, `prepare-all`, `pack-all`.
- Creates masters under `pixellab-hq/<slug>/master` and final WebP beside source PNGs.

- [ ] **Step 1: Write failing Python tests**

Crear el test con imports dinámicos porque el nombre del script contiene guiones:

```python
import importlib.util
from pathlib import Path

from PIL import Image
import pytest

SCRIPT = Path(__file__).parents[1] / "tools" / "build-sanpledex-pixellab-animations.py"
SPEC = importlib.util.spec_from_file_location("sanpledex_builder", SCRIPT)
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def make_fixture(root: Path, frame_count: int = 12) -> dict:
    line = root / "assets" / "pokemon" / "fixture-line"
    line.mkdir(parents=True)
    source = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    source.paste((255, 90, 20, 255), (16, 10, 48, 58))
    source.save(line / "fixture-front.png")
    source.save(line / "fixture-back.png")
    creature = {
        "id": 1,
        "slug": "fixture",
        "line": "fixture-line",
        "source": {
            "front": "assets/pokemon/fixture-line/fixture-front.png",
            "back": "assets/pokemon/fixture-line/fixture-back.png",
        },
        "timing": {"idleFrameMs": 84, "attackFrameMs": 75, "impactMs": 600},
    }
    work = line / "pixellab-hq" / "fixture" / "frames"
    for state in ("idle", "attack"):
        for view in ("front", "back"):
            destination = work / state / view
            destination.mkdir(parents=True)
            for index in range(frame_count):
                frame = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
                width = 24 + (index % 3) * 2
                frame.paste((20, 180, 80, 255), (32 - width // 2, 20, 32 + width // 2, 58))
                frame.save(destination / f"frame-{index:02d}.png")
    return creature


def ground_rows(path: Path) -> set[int]:
    image = Image.open(path)
    rows = set()
    for index in range(image.n_frames):
        image.seek(index)
        rows.add(image.convert("RGBA").getchannel("A").getbbox()[3])
    return rows


def test_prepare_reference_fits_opaque_bounds_on_256_canvas(tmp_path):
    creature = make_fixture(tmp_path)
    output = BUILDER.prepare_reference(tmp_path / creature["source"]["front"])
    assert output.mode == "RGBA"
    assert output.size == (256, 256)
    assert output.getchannel("A").getbbox() is not None


def test_pack_rejects_any_sequence_without_twelve_frames(tmp_path):
    creature = make_fixture(tmp_path, frame_count=11)
    with pytest.raises(ValueError, match="expected 12 frames"):
        BUILDER.pack_creature(creature, tmp_path)


def test_idle_and_attack_share_canvas_and_ground_anchor(tmp_path):
    creature = make_fixture(tmp_path)
    outputs = BUILDER.pack_creature(creature, tmp_path)
    assert all(Image.open(path).size == (384, 384) for path in outputs.values())
    assert ground_rows(outputs["idle.front"]) == {352}
    assert ground_rows(outputs["attack.front"]) == {352}
```

- [ ] **Step 2: Verify red**

Run:

```powershell
$python = "C:\Users\elabu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $python -m pytest tests/test_build_sanpledex_pixellab_animations.py -q
```

Expected: FAIL porque el módulo no existe.

- [ ] **Step 3: Implement the tool**

Crear el script con esta implementación completa:

```python
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

FRAME_COUNT = 12
REFERENCE_CANVAS = 256
REFERENCE_CONTENT = 224
OUTPUT_CANVAS = 384
OUTPUT_CONTENT = 320
GROUND_Y = 352


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def creature_by_slug(manifest: dict, slug: str) -> dict:
    for creature in manifest["creatures"]:
        if creature["slug"] == slug:
            return creature
    raise ValueError(f"unknown creature slug: {slug}")


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


def work_root(creature: dict, root: Path) -> Path:
    line_root = (root / creature["source"]["front"]).parent
    return line_root / "pixellab-hq" / creature["slug"]


def prepare_creature(creature: dict, root: Path) -> list[Path]:
    destination = work_root(creature, root) / "master"
    destination.mkdir(parents=True, exist_ok=True)
    outputs = []
    for view in ("front", "back"):
        output = destination / f"{view}.png"
        prepare_reference(root / creature["source"][view]).save(output)
        outputs.append(output)
    return outputs


def load_twelve_frames(path: Path) -> list[Image.Image]:
    paths = sorted(path.glob("frame-*.png"))
    if len(paths) != FRAME_COUNT:
        raise ValueError(f"{path}: expected 12 frames, found {len(paths)}")
    return [Image.open(frame).convert("RGBA") for frame in paths]


def shared_view_transform(
    idle: list[Image.Image], attack: list[Image.Image]
) -> tuple[tuple[int, int, int, int], float]:
    boxes = [visible_bbox(image) for image in idle + attack]
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
        minimize_size=True,
    )


def pack_creature(creature: dict, root: Path) -> dict[str, Path]:
    working = work_root(creature, root)
    sequences = {
        (state, view): load_twelve_frames(working / "frames" / state / view)
        for state in ("idle", "attack")
        for view in ("front", "back")
    }
    line_root = (root / creature["source"]["front"]).parent
    outputs = {}
    for view in ("front", "back"):
        union, scale = shared_view_transform(
            sequences[("idle", view)], sequences[("attack", view)]
        )
        for state in ("idle", "attack"):
            frames = normalize_frames(sequences[(state, view)], union, scale)
            output = line_root / f"{creature['slug']}-{state}-{view}-pixellab.webp"
            frame_ms = creature["timing"][f"{state}FrameMs"]
            save_webp(frames, output, frame_ms, 0 if state == "idle" else 1)
            outputs[f"{state}.{view}"] = output
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "prepare-all", "pack", "pack-all"))
    parser.add_argument("--slug")
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("assets/pokemon/pixellab-batch-1-manifest.json"),
    )
    args = parser.parse_args()
    manifest = load_manifest(args.root / args.manifest)
    if args.command in {"prepare", "pack"} and not args.slug:
        parser.error("--slug is required for prepare and pack")
    creatures = (
        [creature_by_slug(manifest, args.slug)]
        if args.command in {"prepare", "pack"}
        else manifest["creatures"]
    )
    operation = prepare_creature if args.command.startswith("prepare") else pack_creature
    for creature in creatures:
        print(creature["slug"], operation(creature, args.root))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Verify green and prepare all masters**

Run:

```powershell
& $python -m pytest tests/test_build_sanpledex_pixellab_animations.py -q
& $python tools/build-sanpledex-pixellab-animations.py prepare-all
```

Expected: tests PASS y 20 maestros RGBA 256 × 256.

- [ ] **Step 5: Commit**

```powershell
git add tools/build-sanpledex-pixellab-animations.py tests/test_build_sanpledex_pixellab_animations.py assets/pokemon/*-line/pixellab-hq/*/master
git commit -m "feat: add reusable Sanpledex animation builder"
```

---

### Task 4: Generate ten PixelLab characters and forty animations sequentially

**Files:**
- Create/Modify per creature: `assets/pokemon/<line>/pixellab-hq/<slug>/pixellab-jobs.json`
- Create per creature: `assets/pokemon/<line>/pixellab-hq/<slug>/frames/{idle,attack}/{front,back}/frame-00.png` … `frame-11.png`

**Interfaces:**
- Consumes: prepared masters and exact prompts from Task 1.
- Produces: one completed `character_id` and four completed animation job IDs per creature.

- [ ] **Step 1: Process creatures strictly in manifest order**

For each creature, finish validation and job recording before starting the next. For all except Peyote call:

```text
create_character(
  mode="v3",
  size=256,
  name=<creature slug>,
  description=<manifest identity>,
  reference_image_base64=<master/front.png Base64>
)
```

For Peyote reuse `character_id=9ce255c4-2070-40a5-bf55-533204b7d300` and do not create a new master.

- [ ] **Step 2: Validate each character before spending four animation jobs**

Poll `get_character(character_id, include_preview=true)` until `completed` or `failed`. Compare `south` to both source and prepared front. Reject extra limbs, missing defining features, palette drift, opaque background or changed silhouette. One technical retry or one stricter identity retry is allowed; a second failure records `status: "fallback"` and moves to the next creature.

- [ ] **Step 3: Queue four v3 animations for each approved character**

Use these exact calls, Base64-encoding the corresponding prepared master:

```text
animate_character(character_id=<id>, mode="v3", directions=["south"], frame_count=12,
  keep_first_frame=false, animation_name="idle-front",
  custom_start_frame_base64=<master/front.png>, action_description=<manifest idle>)

animate_character(character_id=<id>, mode="v3", directions=["north"], frame_count=12,
  keep_first_frame=false, animation_name="idle-back",
  custom_start_frame_base64=<master/back.png>, action_description=<manifest idle + rear-view preservation>)

animate_character(character_id=<id>, mode="v3", directions=["south"], frame_count=12,
  keep_first_frame=false, animation_name="attack-front",
  custom_start_frame_base64=<master/front.png>, action_description=<manifest attack>)

animate_character(character_id=<id>, mode="v3", directions=["north"], frame_count=12,
  keep_first_frame=false, animation_name="attack-back",
  custom_start_frame_base64=<master/back.png>, action_description=<manifest attack + rear-view preservation>)
```

`rear-view preservation` es: `Preserve exactly the supplied back view, rear markings and rear anatomy. Do not invent a face or front-only feature on the back.`

- [ ] **Step 4: Poll, download and record every creature before continuing**

After the four jobs complete, call `get_character` and use its official `/mcp/characters/{id}/download` URL. Store frames as `frame-00.png` through `frame-11.png` in the four canonical directories. Write `provider`, `status` and `directions` exactly as `"PixelLab MCP"`, `"completed"` and `{ "front": "south", "back": "north" }`. Copy the actual UUID returned by `create_character` into `character_id`; copy the four actual UUIDs returned by `animate_character` into `animation_jobs.idle.front`, `.idle.back`, `.attack.front` and `.attack.back`. Validate every stored ID against `^[0-9a-f-]{36}$` before saving.

- [ ] **Step 5: Validate and commit each creature separately**

Run after each creature:

```powershell
$frameRoot = "assets/pokemon/<line>/pixellab-hq/<slug>/frames"
Get-ChildItem -Directory "$frameRoot\idle\front","$frameRoot\idle\back","$frameRoot\attack\front","$frameRoot\attack\back" | ForEach-Object { "{0} {1}" -f $_.FullName,@(Get-ChildItem $_ -Filter '*.png').Count }
```

Expected: four lines ending in `12`.

Commit pattern: `art: generate <Name> PixelLab animations` including only that creature's `pixellab-hq/<slug>` directory.

---

### Task 5: Pack and validate the forty runtime assets

**Files:**
- Create: `tests/sanpledex-animation-assets.test.mjs`
- Create: 40 files matching `assets/pokemon/<line>/<slug>-{idle,attack}-{front,back}-pixellab.webp`

**Interfaces:**
- Consumes: manifest and frames.
- Produces: validated WebP paths consumed by browser registry.

- [ ] **Step 1: Write the failing binary contract**

Crear el archivo con el contrato completo:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "assets/pokemon/pixellab-batch-1-manifest.json"), "utf8"));

function webpChunks(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  const chunks = new Map();
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    chunks.set(name, [...(chunks.get(name) || []), { offset, size }]);
    offset += 8 + size + (size & 1);
  }
  return chunks;
}

function assetPath(creature, state, view) {
  return path.join(root, "assets", "pokemon", creature.line, `${creature.slug}-${state}-${view}-pixellab.webp`);
}

for (const creature of manifest.creatures) {
  for (const state of ["idle", "attack"]) {
    for (const view of ["front", "back"]) {
      test(`${creature.slug} ${state} ${view} is a valid animated WebP`, async () => {
        const asset = await readFile(assetPath(creature, state, view));
        const chunks = webpChunks(asset);
        const vp8x = chunks.get("VP8X")?.[0];
        const anim = chunks.get("ANIM")?.[0];
        const frames = chunks.get("ANMF") || [];
        assert.ok(vp8x);
        assert.ok(anim);
        assert.equal(asset[vp8x.offset + 8] & 0x12, 0x12);
        assert.equal(asset.readUIntLE(vp8x.offset + 12, 3) + 1, manifest.canvas);
        assert.equal(asset.readUIntLE(vp8x.offset + 15, 3) + 1, manifest.canvas);
        assert.equal(asset.readUInt16LE(anim.offset + 12), state === "idle" ? 0 : 1);
        assert.equal(frames.length, manifest.frameCount);
        const durations = frames.map(({ offset }) => asset.readUIntLE(offset + 20, 3));
        assert.deepEqual([...new Set(durations)], [creature.timing[`${state}FrameMs`]]);
        assert.ok(asset.length < 1_200_000);
      });
    }
  }

  test(`${creature.slug} package stays below 4.8 MB`, async () => {
    const assets = await Promise.all(
      ["idle", "attack"].flatMap((state) => ["front", "back"].map((view) => readFile(assetPath(creature, state, view)))),
    );
    assert.ok(assets.reduce((total, asset) => total + asset.length, 0) < 4_800_000);
  });
}
```

- [ ] **Step 2: Verify red**

Run: `node --test tests/sanpledex-animation-assets.test.mjs`

Expected: FAIL con el primer WebP aún inexistente.

- [ ] **Step 3: Pack each creature one by one**

Run:

```powershell
& $python tools/build-sanpledex-pixellab-animations.py pack --slug braspin
& $python tools/build-sanpledex-pixellab-animations.py pack --slug ascuero
& $python tools/build-sanpledex-pixellab-animations.py pack --slug volcazote
& $python tools/build-sanpledex-pixellab-animations.py pack --slug petrillo
& $python tools/build-sanpledex-pixellab-animations.py pack --slug musgolem
& $python tools/build-sanpledex-pixellab-animations.py pack --slug terravordeo
& $python tools/build-sanpledex-pixellab-animations.py pack --slug peyote
& $python tools/build-sanpledex-pixellab-animations.py pack --slug prensalito
& $python tools/build-sanpledex-pixellab-animations.py pack --slug criascama
& $python tools/build-sanpledex-pixellab-animations.py pack --slug aliscama
```

- [ ] **Step 4: Verify green and commit**

Run: `node --test tests/sanpledex-animation-assets.test.mjs`

Expected: 40 asset tests PASS.

Only after this command passes, change `ready` from `false` to `true` for the ten validated records, run `node tools/build-sanpledex-animation-data.mjs`, and rerun `node --test tests/sanpledex-animation-manifest.test.mjs`. Expected: the generated browser registry now contains exactly the ten IDs; before this point it contains none, so the game cannot activate a partial package.

```powershell
git add tests/sanpledex-animation-assets.test.mjs assets/pokemon/pixellab-batch-1-manifest.json sanpledex-animation-data.js assets/pokemon/*-line/*-pixellab.webp
git commit -m "feat: package Sanpledex PixelLab batch 1"
```

---

### Task 6: Centralize runtime asset selection

**Files:**
- Create: `tests/sanpledex-animation-runtime.test.mjs`
- Modify: `script.js:420-425,1794-1872`

**Interfaces:**
- Consumes: `globalThis.SANPLEDEX_ANIMATION_ASSETS`.
- Produces: `customPokemonFrameAsset(id, state, view)` and `customPokemonAnimation(id)`.

- [ ] **Step 1: Write failing runtime tests**

Assert source contains:

```js
const SANPLEDEX_ANIMATION_ASSETS = globalThis.SANPLEDEX_ANIMATION_ASSETS || Object.freeze({});
function customPokemonAnimation(id) { return SANPLEDEX_ANIMATION_ASSETS[Number(id)] || null; }
function customPokemonFrameAsset(id, state = "idle", view = "front")
```

Also assert reduced motion returns `null`, invalid state/view returns `null`, and `frontSpriteUrl`/`backSpriteUrl` explicitly request `idle`.

- [ ] **Step 2: Verify red**

Run: `node --test tests/sanpledex-animation-runtime.test.mjs`

Expected: FAIL porque `script.js` aún usa `CUSTOM_POKEMON_FRAME_ASSETS`.

- [ ] **Step 3: Replace the local table with the global registry**

```js
const SANPLEDEX_ANIMATION_ASSETS = globalThis.SANPLEDEX_ANIMATION_ASSETS || Object.freeze({});

function customPokemonAnimation(id) {
  return SANPLEDEX_ANIMATION_ASSETS[Number(id)] || null;
}

function customPokemonFrameAsset(id, state = "idle", view = "front") {
  if (prefersReducedMotion()) return null;
  if (!new Set(["idle", "attack"]).has(state)) return null;
  if (!new Set(["front", "back"]).has(view)) return null;
  return customPokemonAnimation(id)?.[state]?.[view] || null;
}

function imageCanLoad(src) {
  if (!src) return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = src;
  });
}
```

Update every call site to pass `(id, "idle", view)`. Preserve `customPokemonAsset` as fallback.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/sanpledex-animation-runtime.test.mjs tests/peyote-animation.test.mjs`

Expected: PASS.

```powershell
git add script.js tests/sanpledex-animation-runtime.test.mjs tests/peyote-animation.test.mjs
git commit -m "refactor: centralize Sanpledex animation assets"
```

---

### Task 7: Play both views in the Sanpledex

**Files:**
- Modify: `tests/sanpledex-animation-runtime.test.mjs`
- Modify: `script.js:8573-8632`
- Modify: `styles.css:1030-1045`

- [ ] **Step 1: Add failing Sanpledex assertions**

Assert the preview renders two idle assets, stores attack URLs in `data-attack-src`, swaps both images during `previewSanpledexAttack`, uses `durationMs`, and restores both idle sources in `finally`/timeout cleanup. Assert list and evolution thumbnails still use `iconUrl` static PNGs.

- [ ] **Step 2: Verify red**

Run: `node --test tests/sanpledex-animation-runtime.test.mjs`

Expected: FAIL porque la previsualización aún usa CSS y sólo una pose frontal estática.

- [ ] **Step 3: Implement stateful preview**

In `renderSanpledex`, derive:

```js
const animation = customPokemonAnimation(selectedSanpledexId);
const durationMs = animation?.durationMs || CUSTOM_ATTACK_DURATION;
```

Render each base image with `data-idle-src` and `data-attack-src`. `previewSanpledexAttack` preloads both attack sources, swaps only when both load, sets the button duration from `durationMs`, and restores idle sources after completion. If either attack fails, keep the existing CSS preview.

- [ ] **Step 4: Remove duplicate CSS movement for frame previews**

```css
.sanpledex-combat-preview.previewing-frame-attack .sanpledex-base-sprite {
  animation: none !important;
  transform: none !important;
}
```

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/sanpledex-animation-runtime.test.mjs`

Expected: PASS.

```powershell
git add script.js styles.css tests/sanpledex-animation-runtime.test.mjs
git commit -m "feat: animate Sanpledex batch 1 previews"
```

---

### Task 8: Play personalized attacks in combat

**Files:**
- Modify: `tests/sanpledex-animation-runtime.test.mjs`
- Modify: `script.js:7956-8145`
- Modify: `styles.css:508-520`

- [ ] **Step 1: Add failing combat assertions**

Assert `animateMove` reads `durationMs` and `impactMs`, accepts an impact callback, preloads the attack WebP, swaps to attack, invokes visual and gameplay impact once at `impactMs`, waits `durationMs`, and restores idle in `finally`. Assert `playerAttack` and `enemyTurn` compute hit/damage before animation and pass HP mutation through the impact callback. Assert a failed preload falls through to the current profile/CSS branch.

- [ ] **Step 2: Verify red**

Run: `node --test tests/sanpledex-animation-runtime.test.mjs`

Expected: FAIL porque combat still has a fixed `CUSTOM_ATTACK_DURATION` and pose swap.

- [ ] **Step 3: Implement the frame attack branch**

Change the signature to `async function animateMove(attacker, defender, move, intensity = 1, impact = null)`. Immediately after the existing `later` helper, insert:

```js
let impactTriggered = false;
const triggerImpact = () => {
  if (impactTriggered) return;
  impactTriggered = true;
  if (impact?.landed === false) return;
  defender.classList.add("hit");
  spawnHitParticles(defender, safeMove, intensity, null, effect);
  if (effect.enabled && effect.shake > 0) shakeBattle(effect.shake * intensity);
  impact?.onImpact?.();
};

const animation = customPokemonAnimation(pokemonId);
const view = isFront ? "front" : "back";
const customAttackAsset = customPokemonFrameAsset(pokemonId, "attack", view);
const idleAsset = customPokemonFrameAsset(pokemonId, "idle", view);
const canPlayFrameAttack = customAttackAsset && await imageCanLoad(customAttackAsset);

if (canPlayFrameAttack) {
  try {
    attacker.classList.add("frame-attacking");
    attacker.src = customAttackAsset;
    later(() => nodes.push(...spawnMoveVisual(attacker, defender, safeMove, null, effect)), Math.max(0, animation.impactMs - Math.round(effect.duration * .58)));
    later(triggerImpact, animation.impactMs);
    await wait(animation.durationMs);
  } finally {
    attacker.classList.remove("frame-attacking");
    attacker.src = idleAsset || originalSrc;
  }
}
```

Insert this branch immediately before the existing `if (!profile)` block and change only that token to `else if (!profile)`. Keep the existing `else` profile body byte-for-byte intact, so preload failure follows the current CSS/profile attack path.

Replace the two existing inline defender-hit timer callbacks in the CSS/profile branches with `later(triggerImpact, existingDelay)`. Before `playerAttack` calls `animateMove`, compute accuracy and damage once, then pass:

```js
const landed = Math.random() * 100 <= move.accuracy;
const result = landed ? calculateDamage(active, battle.enemy, move) : null;
await animateMove(elements.activeSprite, elements.enemySprite, move, 1, {
  landed,
  onImpact: () => {
    battle.enemy.hp = Math.max(0, battle.enemy.hp - result.damage);
    if (move.drain) active.hp = Math.min(active.maxHp, active.hp + Math.max(1, Math.floor(result.damage / 3)));
    updateBattleHealth();
    spawnDamageNumber(elements.enemySprite, result.damage, result.critical ? "#ffd24a" : "#ffffff");
  },
});
```

Delete the old post-animation HP mutation and damage-number block. Use the same structure in `enemyTurn`, with `enemy` as attacker, `active` as target and `elements.activeSprite` as the damage-number anchor. Keep critical/effectiveness messages after the awaited animation; if `landed` is false, show the existing miss message and never call `calculateDamage`.

- [ ] **Step 4: Disable duplicate transforms**

```css
.battle-pokemon.frame-attacking {
  animation: none !important;
  transform: none !important;
  transform-origin: 50% 92%;
  will-change: contents;
}
```

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/sanpledex-animation-runtime.test.mjs tests/battle-effects.test.mjs tests/peyote-animation.test.mjs`

Expected: PASS.

```powershell
git add script.js styles.css tests/sanpledex-animation-runtime.test.mjs
git commit -m "feat: play personalized PixelLab battle attacks"
```

---

### Task 9: Credit, verify, and present batch 1

**Files:**
- Modify: `assets/pokemon/braspy-line/CREDITS.txt`
- Modify: `assets/pokemon/petrillo-line/CREDITS.txt`
- Modify: `assets/pokemon/peyote-line/CREDITS.txt`
- Modify: `assets/pokemon/dracoscama-line/CREDITS.txt`
- Modify: `docs/superpowers/plans/2026-07-17-sanpledex-pixellab-batch-1.md`

- [ ] **Step 1: Add provenance**

Append one section per line stating that idle/attack front/back WebP were generated in July 2026 with PixelLab MCP v3 from the user's local front/back PNGs, normalized with Pillow, and manually reviewed. List every generated filename; do not store tokens or authorization headers.

- [ ] **Step 2: Run focused and full verification**

```powershell
$python = "C:\Users\elabu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $python -m pytest tests/test_build_sanpledex_pixellab_animations.py -q
node --test tests/sanpledex-animation-manifest.test.mjs tests/sanpledex-animation-assets.test.mjs tests/sanpledex-animation-runtime.test.mjs
npm test
git diff --check
```

Expected: all commands exit 0; `git diff --check` prints nothing.

- [ ] **Step 3: Browser QA**

Start `npm start` and inspect all ten IDs using debug battles and the Sanpledex. For every creature verify: front/back idle, front/back attack, correct impact timing, no double CSS movement, static thumbnails, transparent background, stable ground anchor, reduced-motion PNG fallback, and attack-load failure fallback.

- [ ] **Step 4: Review exact scope**

Run: `git status --short` and `git diff --stat HEAD~1`. Confirm unrelated pre-existing logs and deleted temporary dependencies remain untouched.

- [ ] **Step 5: Commit documentation**

```powershell
git add assets/pokemon/braspy-line/CREDITS.txt assets/pokemon/petrillo-line/CREDITS.txt assets/pokemon/peyote-line/CREDITS.txt assets/pokemon/dracoscama-line/CREDITS.txt docs/superpowers/plans/2026-07-17-sanpledex-pixellab-batch-1.md
git commit -m "docs: credit Sanpledex PixelLab batch 1"
```

---

## Final Acceptance Checklist

- [ ] Diez personajes aprobados y cuarenta animaciones v3 registradas con IDs reales.
- [ ] Cuarenta WebP RGBA de 384 × 384, doce frames y peso válido.
- [ ] Sanpledex muestra idle frontal/trasero y reproduce ambos ataques.
- [ ] Combate reproduce el ataque propio, sincroniza el impacto y restaura idle.
- [ ] Miniaturas, fallbacks estáticos y movimiento reducido conservan los PNG originales.
- [ ] Ninguna criatura tiene integración parcial ni deriva anatómica visible.
- [ ] Python tests, Node tests, `npm test` y navegador pasan.
- [ ] El lote se entrega antes de iniciar las criaturas 11–20.
