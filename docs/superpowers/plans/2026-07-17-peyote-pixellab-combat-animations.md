# Peyote PixelLab Combat Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar con el MCP de PixelLab un Peyote pixel-art de alta resolución y cuatro animaciones de combate —idle frontal/trasera y ataque frontal/trasero—, empaquetarlas como WebP transparentes y usarlas durante el combate con respaldo estático.

**Architecture:** PixelLab crea primero un personaje maestro coherente desde `peyote-front.png` y después produce dos animaciones direccionales de 12 fotogramas. Un script Python determinista normaliza los fotogramas a lienzos transparentes de 384 × 384 con anclaje inferior compartido y construye los cuatro WebP. `script.js` selecciona idle o ataque según vista y estado, restaura siempre el idle en `finally`, conserva el impacto existente sobre el defensor y recurre al ataque CSS actual si falta un recurso.

**Tech Stack:** PixelLab MCP (`create_character` v3, `animate_character` v3), Python 3 + Pillow, JavaScript ES modules, CSS, Node.js `node:test`, WebP animado RGBA.

## Global Constraints

- El diseño aprobado en `docs/superpowers/specs/2026-07-17-peyote-pixellab-combat-animations-design.md` es la fuente de verdad.
- PixelLab debe recibir las imágenes originales del usuario: `peyote-front.png` para `south` y `peyote-back.png` como `custom_start_frame` obligatorio para `north`; no se inventan proyectiles, polvo, rocas, escenarios ni accesorios.
- Frente de batalla = dirección `south`; espalda del jugador = dirección `north`.
- Todas las secuencias tienen exactamente 12 fotogramas, transparencia real y un lienzo final de 384 × 384.
- Idle dura aproximadamente 1,0 s y repite sin cortes. Ataque dura aproximadamente 0,9 s, se muestra una vez desde JavaScript y vuelve al idle.
- Cada WebP debe pesar menos de 1,2 MB y el conjunto menos de 4,8 MB.
- No se borran ni sobrescriben `peyote-front.png`, `peyote-back.png`, `peyote-idle-front.webp`, `peyote-idle-back.webp` ni `peyote-attack-front.png`; son recursos de respaldo.
- Antes de pagar las animaciones, se inspeccionan `master/front.png` y `master/back.png`. La espalda debe conservar el panel cuadrado con la hoja y no debe mostrar una cara. Si alguna vista deriva, se detiene la generación.

---

### Task 1: Fijar el contrato de los cuatro recursos nuevos

**Files:**
- Modify: `tests/peyote-animation.test.mjs`
- Test: `tests/peyote-animation.test.mjs`

- [ ] **Step 1: Sustituir las expectativas de los dos idle antiguos por la matriz de cuatro recursos nuevos**

Agregar al principio del archivo, después de `webpChunks`, estas constantes y lectores:

```js
const animations = [
  { state: "idle", view: "front", loop: 0, duration: 84 },
  { state: "idle", view: "back", loop: 0, duration: 84 },
  { state: "attack", view: "front", loop: 1, duration: 75 },
  { state: "attack", view: "back", loop: 1, duration: 75 },
];

function animationPath({ state, view }) {
  return path.join(
    root,
    "assets",
    "pokemon",
    "peyote-line",
    `peyote-${state}-${view}-pixellab.webp`,
  );
}

function webpFrameDurations(buffer, chunks) {
  return (chunks.get("ANMF") || []).map(({ offset }) => buffer.readUIntLE(offset + 20, 3));
}
```

- [ ] **Step 2: Escribir la prueba de dimensiones, transparencia, fotogramas, bucle y duración**

Reemplazar los tests actuales de metadatos y presupuesto por:

```js
for (const animation of animations) {
  test(`Peyote ${animation.state} ${animation.view} is a compact 12-frame alpha WebP`, async () => {
    const asset = await readFile(animationPath(animation));
    const chunks = webpChunks(asset);
    const vp8x = chunks.get("VP8X")?.[0];
    const anim = chunks.get("ANIM")?.[0];
    const frames = chunks.get("ANMF") || [];

    assert.ok(vp8x, "VP8X metadata is required for animation and alpha");
    assert.ok(anim, "ANIM loop metadata is required");
    assert.equal(asset[vp8x.offset + 8] & 0x12, 0x12, "alpha and animation flags");
    assert.equal(asset.readUIntLE(vp8x.offset + 12, 3) + 1, 384);
    assert.equal(asset.readUIntLE(vp8x.offset + 15, 3) + 1, 384);
    assert.equal(asset.readUInt16LE(anim.offset + 12), animation.loop);
    assert.equal(frames.length, 12);
    assert.deepEqual([...new Set(webpFrameDurations(asset, chunks))], [animation.duration]);
    assert.ok(asset.length < 1_200_000, `${path.basename(animationPath(animation))} exceeds 1.2 MB`);
  });
}

test("all four Peyote combat animations stay within 4.8 MB", async () => {
  const assets = await Promise.all(animations.map((animation) => readFile(animationPath(animation))));
  assert.ok(assets.reduce((total, asset) => total + asset.length, 0) < 4_800_000);
});
```

- [ ] **Step 3: Ejecutar el test y comprobar que falla porque aún no existen los archivos**

Run:

```powershell
node --test tests/peyote-animation.test.mjs
```

Expected: FAIL con `ENOENT` para `peyote-idle-front-pixellab.webp` (y los otros tres recursos).

- [ ] **Step 4: Registrar la evidencia roja sin dejar la rama rota**

Guardar en el reporte de la tarea el comando, el `ENOENT` esperado y la razón del fallo. No crear todavía un commit: el test rojo y los recursos que lo vuelven verde se confirmarán juntos al finalizar Task 4, de modo que ningún commit de la rama deje la suite deliberadamente rota.

---

### Task 2: Crear y aprobar el personaje maestro de PixelLab

**Files:**
- Create: `assets/pokemon/peyote-line/pixellab-hq/master/front.png`
- Create: `assets/pokemon/peyote-line/pixellab-hq/master/back.png`
- Create: `assets/pokemon/peyote-line/pixellab-hq/pixellab-jobs.json`
- Reference: `assets/pokemon/peyote-line/peyote-front.png`
- Reference: `assets/pokemon/peyote-line/peyote-back.png`

- [ ] **Step 1: Preparar la referencia admitida por el MCP sin alterar el original**

Convertir `peyote-front.png` y `peyote-back.png` a copias RGBA de 256 × 256 con Pillow, preservando la relación de aspecto y transparencia. Guardarlas como `master/front.png` y `master/back.png` y codificar la frontal como Base64 para `reference_image_base64`. No guardar secretos ni el encabezado de autorización en el repositorio.

- [ ] **Step 2: Llamar a `create_character` mediante el MCP de PixelLab**

Usar exactamente:

```text
tool: create_character
mode: v3
size: 256
reference_image_base64: usar el valor Base64 calculado en Step 1
description: A cute living square adobe-brick monster named Peyote. Preserve the exact stacked brown stone block body, round black eyes, tiny smile, four short block feet, carved circular leaf medallion centered on the forehead, warm ochre palette, thick dark pixel-art outline, no props, no background.
```

Expected: el MCP devuelve un `job_id` y no un error de autorización, transporte o tamaño.

- [ ] **Step 3: Consultar el job hasta completarlo y conservar `south` sólo como validación frontal**

Consultar el estado con la herramienta de estado indicada por la respuesta de PixelLab cada 2–5 segundos, nunca en un bloqueo superior a 60 segundos. Comparar `south` con `master/front.png`. No sustituir `master/back.png` por el `north` generado automáticamente: la espalda del usuario es la referencia vinculante.

```text
south -> validar contra assets/pokemon/peyote-line/pixellab-hq/master/front.png
north -> no usar como fuente visual; usar master/back.png preparado desde peyote-back.png
```

Registrar en `pixellab-jobs.json` únicamente datos no sensibles. El campo `character_job_id` recibe programáticamente el ID real de la respuesta de `create_character`; no se escribe un texto provisional:

```json
{
  "provider": "PixelLab MCP",
  "character_job_id": "427d9942-7cf8-4895-a363-d1e6fb87bd00",
  "animation_jobs": {},
  "directions": { "front": "south", "back": "north" },
  "source": "../peyote-front.png"
}
```

El UUID anterior ilustra el tipo de dato con el job de la prueba estática previa; sustituirlo al escribir el archivo por el UUID real del nuevo maestro de 256 px.

- [ ] **Step 4: Validar técnica y visualmente los maestros antes de continuar**

Run:

```powershell
$python = "C:\Users\elabu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $python -c "from PIL import Image; from pathlib import Path; files=[Path('assets/pokemon/peyote-line/pixellab-hq/master/front.png'),Path('assets/pokemon/peyote-line/pixellab-hq/master/back.png')]; [print(p, Image.open(p).mode, Image.open(p).size, Image.open(p).getbbox()) for p in files]"
```

Expected: dos PNG `RGBA`, 256 × 256, con contenido no vacío. Abrir ambos con el visor de imágenes. El frente debe conservar silueta cuadrada, medallón circular, ojos negros, cuatro patas y paleta marrón/ocre. La espalda debe conservar exactamente la composición de `peyote-back.png`: panel cuadrado con hoja, mampostería, cuatro patas y ninguna cara.

- [ ] **Step 5: Commit de los maestros aprobados y la trazabilidad**

```powershell
git add assets/pokemon/peyote-line/pixellab-hq/master assets/pokemon/peyote-line/pixellab-hq/pixellab-jobs.json
git commit -m "art: add approved Peyote PixelLab masters"
```

---

### Task 3: Generar con PixelLab los cuatro juegos de fotogramas

**Files:**
- Create: `assets/pokemon/peyote-line/pixellab-hq/frames/idle/front/*.png`
- Create: `assets/pokemon/peyote-line/pixellab-hq/frames/idle/back/*.png`
- Create: `assets/pokemon/peyote-line/pixellab-hq/frames/attack/front/*.png`
- Create: `assets/pokemon/peyote-line/pixellab-hq/frames/attack/back/*.png`
- Modify: `assets/pokemon/peyote-line/pixellab-hq/pixellab-jobs.json`

- [ ] **Step 1: Generar el idle feliz frontal desde la referencia frontal**

Usar `animate_character` v3 sobre el `character_job_id` aprobado:

```text
tool: animate_character
mode: v3
character_id: usar el UUID real guardado en pixellab-jobs.json bajo character_job_id
directions: ["south"]
frame_count: 12
keep_first_frame: false
custom_start_frame: Base64 de pixellab-hq/master/front.png
animation_description: Happy dance in place for a seamless battle idle loop. Peyote alternates small foot steps, gently bounces its heavy square adobe body, tilts slightly side to side and keeps a joyful cute face. Preserve the exact body proportions, forehead leaf medallion, four feet, brown ochre palette and bottom-center ground contact. No translation across the canvas, no camera motion, no environment, no props, no text, no particles, no dust and no extra effects. End in the starting pose.
```

Expected: un job de animación aceptado para `south` con 12 fotogramas.

- [ ] **Step 2: Generar el idle feliz trasero desde la foto trasera existente**

Repetir la llamada anterior con `directions: ["north"]` y `custom_start_frame` igual al Base64 de `pixellab-hq/master/back.png`. Añadir a la descripción: `Preserve the exact square rear leaf panel, rear masonry pattern and absence of a face shown in the supplied start frame.`

Expected: un job de animación aceptado para `north` con 12 fotogramas cuya pose inicial coincide con `peyote-back.png`.

- [ ] **Step 3: Generar el ataque de carga agresiva frontal**

```text
tool: animate_character
mode: v3
character_id: usar el UUID real guardado en pixellab-jobs.json bajo character_job_id
directions: ["south"]
frame_count: 12
keep_first_frame: false
custom_start_frame: Base64 de pixellab-hq/master/front.png
animation_description: One strong battle charge attack. Peyote changes from neutral to an aggressive determined face, crouches and leans back to prepare, then launches its whole heavy square adobe body straight forward as a body slam. Hold a clear impact pose with compressed legs and forceful expression, recoil from the hit, then return exactly to the starting stance. Preserve the exact body proportions, forehead leaf medallion, four feet, brown ochre palette and bottom-center anchor. No projectile, no rocks, no dust, no environment, no camera movement, no text and no added visual effects.
```

Expected: un job aceptado para `south` con 12 fotogramas.

- [ ] **Step 4: Generar el ataque de carga agresiva trasero desde la foto trasera existente**

Repetir la llamada de ataque con `directions: ["north"]` y `custom_start_frame` igual al Base64 de `pixellab-hq/master/back.png`. Sustituir la instrucción de cara agresiva por: `Show aggression only through the heavy body lean and forceful leg compression; do not invent eyes or a mouth on the back. Preserve the exact square rear leaf panel.`

Expected: un job aceptado para `north` con 12 fotogramas y sin cara trasera inventada.

- [ ] **Step 5: Descargar los resultados con nombres ordenables**

Guardar los fotogramas como `frame-00.png` … `frame-11.png` en cada directorio, mapeando `south -> front` y `north -> back`. Registrar los cuatro job IDs bajo `animation_jobs.idle.front`, `animation_jobs.idle.back`, `animation_jobs.attack.front` y `animation_jobs.attack.back` en `pixellab-jobs.json`.

- [ ] **Step 6: Verificar la integridad de las cuatro secuencias**

Run:

```powershell
$roots = @(
  "assets/pokemon/peyote-line/pixellab-hq/frames/idle/front",
  "assets/pokemon/peyote-line/pixellab-hq/frames/idle/back",
  "assets/pokemon/peyote-line/pixellab-hq/frames/attack/front",
  "assets/pokemon/peyote-line/pixellab-hq/frames/attack/back"
)
$roots | ForEach-Object { "$_ $((Get-ChildItem -LiteralPath $_ -Filter '*.png').Count)" }
```

Expected: cada línea termina en `12`. Inspeccionar montajes de los cuatro directorios: el idle no deriva de posición; el ataque frontal muestra cara agresiva, preparación, avance, impacto, retroceso y regreso; la espalda mantiene el panel cuadrado con hoja sin cara; ninguna secuencia introduce objetos o efectos.

- [ ] **Step 7: Commit de los fotogramas crudos**

```powershell
git add assets/pokemon/peyote-line/pixellab-hq/frames assets/pokemon/peyote-line/pixellab-hq/pixellab-jobs.json
git commit -m "art: generate Peyote PixelLab combat frames"
```

---

### Task 4: Normalizar y empaquetar los fotogramas de forma reproducible

**Files:**
- Create: `tools/build-peyote-combat-animations.py`
- Create: `assets/pokemon/peyote-line/peyote-idle-front-pixellab.webp`
- Create: `assets/pokemon/peyote-line/peyote-idle-back-pixellab.webp`
- Create: `assets/pokemon/peyote-line/peyote-attack-front-pixellab.webp`
- Create: `assets/pokemon/peyote-line/peyote-attack-back-pixellab.webp`
- Test: `tests/peyote-animation.test.mjs`

- [ ] **Step 1: Crear el constructor con anclaje inferior compartido**

Crear `tools/build-peyote-combat-animations.py` con este contenido:

```python
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

CANVAS = 384
FRAME_COUNT = 12
CONFIG = {
    ("idle", "front"): (84, 0),
    ("idle", "back"): (84, 0),
    ("attack", "front"): (75, 1),
    ("attack", "back"): (75, 1),
}


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("frame has no visible pixels")
    return bbox


def normalized_frames(source: Path) -> list[Image.Image]:
    paths = sorted(source.glob("frame-*.png"))
    if len(paths) != FRAME_COUNT:
        raise ValueError(f"{source}: expected {FRAME_COUNT} frames, found {len(paths)}")
    images = [Image.open(path).convert("RGBA") for path in paths]
    bboxes = [alpha_bbox(image) for image in images]
    union = (
        min(left for left, top, right, bottom in bboxes),
        min(top for left, top, right, bottom in bboxes),
        max(right for left, top, right, bottom in bboxes),
        max(bottom for left, top, right, bottom in bboxes),
    )
    union_width = union[2] - union[0]
    union_height = union[3] - union[1]
    scale = min(320 / union_width, 320 / union_height)
    ground_y = 352
    output: list[Image.Image] = []
    for image in images:
        crop = image.crop(union)
        resized = crop.resize(
            (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
            Image.Resampling.NEAREST,
        )
        canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        x = (CANVAS - resized.width) // 2
        y = ground_y - resized.height
        canvas.alpha_composite(resized, (x, y))
        output.append(canvas)
    return output


def build(source_root: Path, output_root: Path) -> None:
    for (state, view), (duration, loop) in CONFIG.items():
        frames = normalized_frames(source_root / state / view)
        output = output_root / f"peyote-{state}-{view}-pixellab.webp"
        frames[0].save(
            output,
            format="WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=duration,
            loop=loop,
            lossless=True,
            method=6,
            exact=True,
            minimize_size=True,
        )
        print(f"wrote {output} ({output.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-root",
        type=Path,
        default=Path("assets/pokemon/peyote-line/pixellab-hq/frames"),
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("assets/pokemon/peyote-line"),
    )
    args = parser.parse_args()
    build(args.source_root, args.output_root)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Construir los cuatro WebP**

Run:

```powershell
$python = "C:\Users\elabu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $python tools\build-peyote-combat-animations.py
```

Expected: cuatro líneas que empiezan por `wrote`; cada una indica menos de `1200000 bytes`.

- [ ] **Step 3: Ejecutar el contrato de recursos**

Run:

```powershell
node --test tests/peyote-animation.test.mjs
```

Expected: los tests de los cuatro WebP y su presupuesto pasan. El test de integración de `script.js` puede seguir rojo hasta Task 5.

- [ ] **Step 4: Inspeccionar visualmente los cuatro WebP**

Confirmar fondo transparente, pixel art nítido, pies estables, sin recortes; idle continuo; ataque legible en ambas vistas y regreso al encuadre inicial. Si una secuencia falla visualmente, regenerar sólo ese job en PixelLab y repetir el constructor.

- [ ] **Step 5: Commit del contrato, el constructor y los WebP finales**

```powershell
git add tests/peyote-animation.test.mjs tools/build-peyote-combat-animations.py assets/pokemon/peyote-line/peyote-*-pixellab.webp
git commit -m "feat: build Peyote PixelLab combat animations"
```

---

### Task 5: Conectar idle y ataque al sistema de combate

**Files:**
- Modify: `tests/peyote-animation.test.mjs`
- Modify: `script.js:420`
- Modify: `script.js:1796`
- Modify: `script.js:7956`
- Modify: `styles.css:508`
- Test: `tests/peyote-animation.test.mjs`

- [ ] **Step 1: Escribir primero el contrato rojo de integración**

Reemplazar el último test por:

```js
test("Peyote swaps between PixelLab idle and attack with static fallbacks", async () => {
  const [script, styles] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);

  assert.match(script, /9101:[\s\S]*?idle:[\s\S]*?peyote-idle-front-pixellab\.webp[\s\S]*?peyote-idle-back-pixellab\.webp/);
  assert.match(script, /9101:[\s\S]*?attack:[\s\S]*?peyote-attack-front-pixellab\.webp[\s\S]*?peyote-attack-back-pixellab\.webp/);
  assert.match(script, /function customPokemonFrameAsset\(id, state = "idle", view = "front"\)/);
  assert.match(script, /if \(prefersReducedMotion\(\)\) return null;/);
  assert.match(script, /const customAttackAsset = customPokemonFrameAsset\([\s\S]*?pokemonId,[\s\S]*?"attack"/);
  assert.match(script, /await imageCanLoad\(customAttackAsset\)/);
  assert.match(script, /try \{[\s\S]*?frame-attacking[\s\S]*?await wait\(CUSTOM_FRAME_ATTACK_DURATION\)[\s\S]*?\} finally \{[\s\S]*?attacker\.src = idleAsset \|\| originalSrc/);
  assert.match(script, /REDUCED_MOTION_QUERY\.addEventListener\("change", refreshVisiblePokemonFrameAssets\)/);
  assert.match(styles, /\.battle-pokemon\.frame-attacking/);
  assert.match(styles, /\.enemy-pokemon\.frame-animated/);
  assert.match(styles, /\.player-pokemon\.frame-animated/);
});
```

- [ ] **Step 2: Ejecutar el test y confirmar el fallo por el mapeo antiguo**

Run:

```powershell
node --test tests/peyote-animation.test.mjs
```

Expected: FAIL porque `CUSTOM_POKEMON_FRAME_ASSETS` todavía no distingue `idle` y `attack`.

- [ ] **Step 3: Cambiar el catálogo y el selector de recursos**

En `script.js`, reemplazar la entrada de Peyote por:

```js
const CUSTOM_POKEMON_FRAME_ASSETS = Object.freeze({
  9101: {
    idle: {
      front: "assets/pokemon/peyote-line/peyote-idle-front-pixellab.webp",
      back: "assets/pokemon/peyote-line/peyote-idle-back-pixellab.webp",
    },
    attack: {
      front: "assets/pokemon/peyote-line/peyote-attack-front-pixellab.webp",
      back: "assets/pokemon/peyote-line/peyote-attack-back-pixellab.webp",
    },
  },
});
const CUSTOM_FRAME_ATTACK_DURATION = 900;
```

Cambiar el helper y añadir un comprobador de carga por:

```js
function customPokemonFrameAsset(id, state = "idle", view = "front") {
  if (prefersReducedMotion()) return null;
  return CUSTOM_POKEMON_FRAME_ASSETS[Number(id)]?.[state]?.[view] || null;
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

Actualizar todos los call sites de `customPokemonFrameAsset` para solicitar explícitamente `"idle"` y no confundir el argumento de vista con el nuevo argumento de estado:

```js
const frameAnimated = Boolean(customPokemonFrameAsset(id, "idle", view));
function frontSpriteUrl(id) { return customPokemonFrameAsset(id, "idle", "front") || customPokemonAsset(id) || ""; }
function backSpriteUrl(id) { return customPokemonFrameAsset(id, "idle", "back") || customPokemonAsset(id, "back") || ""; }
const animatedAsset = customPokemonFrameAsset(id, "idle", view);
```

Aplicar la misma forma `customPokemonFrameAsset(selectedSanpledexId, "idle", view)` dentro de `refreshVisiblePokemonFrameAssets` y las formas con `"front"`/`"back"` en las dos lecturas del modal Sanpledex cercanas a la línea 8574. Mantener el PNG de `customPokemonAsset` como fallback de carga y para movimiento reducido.

- [ ] **Step 4: Añadir una rama de ataque por fotogramas con restauración garantizada**

Dentro de `animateMove`, después de calcular `isFront`, añadir:

```js
const customAttackAsset = customPokemonFrameAsset(
  pokemonId,
  "attack",
  isFront ? "front" : "back",
);
const idleAsset = customPokemonFrameAsset(
  pokemonId,
  "idle",
  isFront ? "front" : "back",
);
const canPlayCustomAttack = customAttackAsset && await imageCanLoad(customAttackAsset);
```

Después del reinicio de clases y antes de `if (!profile)`, introducir la rama:

```js
if (canPlayCustomAttack) {
  try {
    attacker.classList.add("frame-attacking");
    attacker.src = customAttackAsset;
    later(() => nodes.push(...spawnMoveVisual(attacker, defender, safeMove, null, effect)), 360);
    later(() => {
      defender.classList.add("hit");
      spawnHitParticles(defender, safeMove, intensity, null, effect);
      if (effect.enabled && effect.shake > 0) shakeBattle(effect.shake * intensity);
    }, 450);
    await wait(CUSTOM_FRAME_ATTACK_DURATION);
  } finally {
    attacker.classList.remove("frame-attacking");
    if (idleAsset || originalSrc) attacker.src = idleAsset || originalSrc;
  }
} else if (!profile) {
  attacker.classList.add("attacking");
  nodes.push(...spawnMoveVisual(attacker, defender, safeMove, null, effect));
  later(() => {
    defender.classList.add("hit");
    spawnHitParticles(defender, safeMove, intensity, null, effect);
    if (effect.enabled && effect.shake > 0) shakeBattle(effect.shake * intensity);
  }, Math.max(110, Math.round(effect.duration * .58)));
  await wait(Math.max(430, attackEffectTravelTail(effect) + 80));
} else {
  attacker.classList.add("anatomy-attacking");
  anatomyCue = spawnAnatomyCue(attacker, profile);
  if (attackPose) later(() => {
    attacker.classList.add("attack-pose-active");
    attacker.src = attackPose;
  }, 690);
  later(() => nodes.push(...spawnMoveVisual(attacker, defender, safeMove, null, effect)), 880);
  later(() => {
    defender.classList.add("hit");
    spawnHitParticles(defender, safeMove, intensity, null, effect);
    if (effect.enabled && effect.shake > 0) shakeBattle(effect.shake * intensity);
  }, 880 + Math.max(110, Math.round(effect.duration * .58)));
  if (attackPose) later(() => {
    attacker.classList.remove("attack-pose-active");
    if (originalSrc) attacker.src = originalSrc;
  }, 1810);
  await wait(Math.max(CUSTOM_ATTACK_DURATION, 880 + attackEffectTravelTail(effect) + 80));
}
```

Conservar después de este bloque la limpieza final común ya existente para timers, partículas, clase `hit` y pistas anatómicas. La rama PixelLab no añade `attacking` ni `anatomy-attacking`, por lo que la carga dibujada en los frames no se duplica con una traslación CSS. Si la precarga falla, `canPlayCustomAttack` es falso y Peyote usa su rama anatómica actual.

- [ ] **Step 5: Añadir el estado CSS de ataque por fotogramas**

Junto a `.battle-pokemon.attacking`, añadir:

```css
.battle-pokemon.frame-attacking {
  animation: none !important;
  transform: none;
  transform-origin: 50% 92%;
  will-change: contents;
}
```

- [ ] **Step 6: Ejecutar el test focalizado hasta verde**

Run:

```powershell
node --test tests/peyote-animation.test.mjs
```

Expected: PASS para metadatos, presupuesto, mapeo, `try/finally`, fallback y CSS.

- [ ] **Step 7: Commit de la integración**

```powershell
git add script.js styles.css tests/peyote-animation.test.mjs
git commit -m "feat: play Peyote PixelLab battle animations"
```

---

### Task 6: Documentar procedencia y hacer verificación completa

**Files:**
- Modify: `assets/pokemon/peyote-line/CREDITS.txt`
- Modify: `docs/superpowers/plans/2026-07-17-peyote-pixellab-combat-animations.md`
- Test: `tests/peyote-animation.test.mjs`

- [ ] **Step 1: Añadir créditos y trazabilidad sin credenciales**

Agregar a `CREDITS.txt`:

```text

Animaciones de combate PixelLab de Peyote: personaje maestro y fotogramas generados en julio de 2026 mediante PixelLab MCP, usando peyote-front.png como referencia visual proporcionada por el usuario. Los fotogramas se normalizaron offline con Pillow a WebP RGBA de 384 × 384. Contenido generado con IA y revisado manualmente.
- peyote-idle-front-pixellab.webp
- peyote-idle-back-pixellab.webp
- peyote-attack-front-pixellab.webp
- peyote-attack-back-pixellab.webp
```

- [ ] **Step 2: Ejecutar la prueba focalizada y la suite completa**

Run:

```powershell
node --test tests/peyote-animation.test.mjs
npm test
```

Expected: ambos comandos terminan con exit code 0 y ninguna regresión.

- [ ] **Step 3: Probar en navegador los cuatro caminos**

Levantar el juego con `npm start`, abrir la URL local que informa `server.mjs` y comprobar:

1. Peyote rival muestra `idle/front` bailando feliz.
2. Peyote del jugador muestra `idle/back` bailando feliz.
3. Al atacar, cada vista cambia a su carga agresiva, el golpe coincide con el impacto del defensor y luego vuelve al idle.
4. Con `prefers-reduced-motion: reduce`, se muestran los PNG estáticos.
5. Simulando un 404 del WebP de ataque, el combate usa el ataque CSS actual y no queda bloqueado.

Expected: no hay salto de tamaño, deriva, doble carga, pérdida de transparencia ni sprite atascado en ataque.

- [ ] **Step 4: Marcar las casillas completadas y revisar el diff**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: `git diff --check` no produce salida; sólo aparecen los archivos previstos y cualquier cambio ajeno preexistente sigue intacto.

- [ ] **Step 5: Commit final de documentación**

```powershell
git add assets/pokemon/peyote-line/CREDITS.txt docs/superpowers/plans/2026-07-17-peyote-pixellab-combat-animations.md
git commit -m "docs: credit Peyote PixelLab animations"
```

---

## Final Acceptance Checklist

- [ ] Los cuatro WebP PixelLab existen, son RGBA 384 × 384 y contienen exactamente 12 fotogramas.
- [ ] Los idle repiten sin cortes; los ataques muestran cara agresiva, carga, impacto, retroceso y regreso.
- [ ] Frente y espalda mantienen la misma identidad visual y anclaje inferior.
- [ ] `animateMove` reproduce el ataque por fotogramas una vez, conserva el impacto del defensor y restaura el idle en `finally`.
- [ ] PNG y animaciones antiguas siguen disponibles como fallback; movimiento reducido nunca reproduce WebP.
- [ ] Cada recurso pesa menos de 1,2 MB y el conjunto menos de 4,8 MB.
- [ ] `node --test tests/peyote-animation.test.mjs` y `npm test` pasan.
- [ ] La inspección visual del navegador pasa en rival, jugador, movimiento reducido y fallo de red.
- [ ] `CREDITS.txt` y `pixellab-jobs.json` documentan procedencia y job IDs sin guardar la credencial.
