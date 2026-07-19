# NPC overworld sprites

All NPC artwork is organized below this directory. The game loads only the
normalized sheets in `overworld/`.

## Folder layout

- `overworld/` — 48 runtime-ready, individual NPC sheets.
- `legacy-4x4/` — the original 256x256 sheets kept as lossless rebuild inputs.
- `source/` — supplied source art, including the roster sheets, rival, Doctor
  Potato and the HGSS fallback source.
- `npc-walk-contract.json` — the shared runtime composition.
- `overworld-manifest.json` — the complete generated asset inventory.
- `previews/` and `metadata/` — created by the specialist import tools when
  previews or reports are rebuilt.

## Shared movement composition

Every file in `overworld/` follows the same layout as the protagonist:

- PNG RGBA sheet: `384x512`;
- cell: `64x64` pixels;
- columns: 6 walk frames;
- rows: `down`, `down-right`, `right`, `up-right`, `up`, `up-left`, `left`,
  `down-left`;
- nearest-neighbour rendering with no smoothing.

The existing NPC designs have four authored directions and four authored walk
frames. Normalization preserves those pixels exactly. The six-frame cycle is
derived with source order `0, 1, 2, 3, 2, 1`; diagonal rows reuse the matching
left or right authored view. This gives every NPC one stable 6x8 runtime
contract without regenerating or changing its design.

## Sprite IDs

The manifest is the canonical inventory. It contains the 30 numbered NPCs,
the 15 imported aliases, `rival`, `doctor-potato`, and `npc-guide`.

Use an ID as the `sprite` value of an NPC in map data. The guide remains the
special `guide` runtime alias, which resolves to `npc-guide-walk.png` in the
same `overworld/` folder.

## Rebuilding

Specialist importers first rebuild a source sheet in `legacy-4x4/`. After any
legacy source changes, normalize the complete roster:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/normalize-npc-walk-sheets.ps1
```

The command rewrites all individual files in `overworld/` and refreshes
`overworld-manifest.json`. It is deterministic and does not call an image
generation service.
