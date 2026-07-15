# NPC directional sprite roster

This folder contains 30 original NPC walking sheets plus Doctor Potato, all
built to the same runtime contract as `../protagonist-walk.png`:

- sheet: `256x256` RGBA PNG;
- cell: `64x64` pixels;
- rows: `down`, `left`, `right`, `up`;
- columns: neutral, left-foot step, neutral, right-foot step;
- step frames use opposing arm swing and fixed accessory placement.

## Sprite IDs

1. `npc-01-nurse`
2. `npc-02-shopkeeper`
3. `npc-03-professor`
4. `npc-04-grandmother`
5. `npc-05-child`
6. `npc-06-fisher`
7. `npc-07-grandfather`
8. `npc-08-student`
9. `npc-09-merchant`
10. `npc-10-artist`
11. `npc-11-athlete`
12. `npc-12-caretaker`
13. `npc-13-gardener`
14. `npc-14-officer`
15. `npc-15-chef`
16. `npc-16-mechanic`
17. `npc-17-musician`
18. `npc-18-cyclist`
19. `npc-19-hiker`
20. `npc-20-office-worker`
21. `npc-21-teen-girl`
22. `npc-22-teen-boy`
23. `npc-23-baker`
24. `npc-24-builder`
25. `npc-25-doctor`
26. `npc-26-vendor`
27. `npc-27-librarian`
28. `npc-28-tourist`
29. `npc-29-dancer`
30. `npc-30-ranger`
31. `doctor-potato`

Use an ID as the `sprite` value of an exterior NPC in `map-data.js`. All 30
models are deployed in the current game: 11 distinct sprites serve the active
interior doors, while the other 19 appear around San Pablo as exterior NPCs
with two-line Spanish dialogue. The legacy HGSS idle atlas remains the loading
fallback for interiors. `doctor-potato` is the separately supplied NPC used by
the opening cinematic and is loaded through the same directional roster.

## Imported NPC aliases

The user-provided character sheets are normalized to the same 256x256 walking
contract. Use the following short aliases directly as the `sprite` value when
adding an NPC; no numeric `npc-` prefix is required:

- `nino-sol` — niño con camiseta amarilla.
- `chica-lazo` — chica con vestido turquesa y lazo.
- `skater-verde` — skater con sudadera verde.
- `mochilera` — chica de morado con mochila.
- `campesino` — agricultor con sombrero.
- `nino-polo` — niño con polo amarillo.
- `nina-turquesa` — niña con vestido turquesa.
- `skater-capucha` — skater con capucha verde.
- `chica-mochila` — chica de morado con mochila marrón.
- `hortelano` — hortelano con planta y cesta.
- `camarera-azul` — camarera con delantal azul.
- `camarero-bandeja` — camarero con bandeja.
- `bailaora` — bailaora con vestido negro y rojo.
- `abuelo-cana` — abuelo con bastón.
- `abuela-morada` — abuela con mantón morado.
- `rival` — joven rival con pañuelo y bandolera.

Example: `{ id: "vecino", col: 12, row: 20, direction: "down", name: "Pepe", sprite: "bailaora", lines: ["Hola", "Adiós"] }`.

The unedited magenta source sheets are retained in `source/`; rerun
`powershell -ExecutionPolicy Bypass -File tools/import-npc-sprites.ps1` from
the project root to rebuild the normalized PNG files.

## Generation and verification

The roster was created with OpenAI image generation using the protagonist as a
structural/style reference. Each prompt required a flat magenta chroma-key
background, exact 4x4 direction layout, consistent identity and accessories,
and alternating lead foot/opposing arm swing. Backgrounds were removed locally,
then `tools/build-npc-sprites.py` normalized every cell to the runtime grid.

`npc-roster-preview.png` is the visual contact sheet. `npc-sprites-report.json`
records per-direction gait differences and the detected source column phase.
