# NPC overworld sprites

The 48 runtime NPC sprites are stored as individual, named packs. Runtime code
resolves stable sprite IDs and aliases through `catalog.js`; it never builds a
filename from an ID.

## Folder layout

- `overworld/{entity-slug}/` — one character pack containing exactly
  `overworld.png`, `manifest.json` and `credits.txt`.
- `legacy-4x4/` — declared historical sources. These are not runtime assets and
  are not treated as the canonical pixels for the 6x8 sheets.
- `source/` — supplied source art and historical atlases.
- `npc-walk-contract.json` — the shared movement composition.
- `overworld-manifest.json` — the exact 48-pack inventory.
- `catalog.js` — deterministic `globalThis.NPC_ASSET_CATALOG` mapping stable
  IDs and aliases to pack URLs.

Folder names come from the character's readable `displayName`, not from a
technical sprite ID. For example, `npc-11-athlete` is preserved as the
`spriteId` but lives in `overworld/deportista-max/`; the runtime alias `guide`
resolves to the `npc-guide` pack in `overworld/guia-de-san-pablo/`.

## npc-overworld-v1

Every `overworld.png` is the approved canonical sheet and has:

- PNG RGBA, non-interlaced, `384x512`;
- a `6x8` grid of `64x64` cells;
- rows `down`, `down-right`, `right`, `up-right`, `up`, `up-left`, `left`,
  `down-left`;
- 48 visible cells and nearest-neighbour runtime rendering.

Validation checks geometry, PNG encoding, visible cells, manifest SHA-256,
declared legacy-source existence, the exact three-file pack topology, the root
inventory and runtime catalog usage. It intentionally does not compare the
approved sheet with the historical 4x4 source.

## Metadata refresh

After moving an already-approved sheet without altering it, rebuild the pack
manifests, root inventory and catalog:

```powershell
node tools/build-npc-asset-catalog.mjs
node tools/validate-npc-walk-sheets.mjs
```

The former 4x4 normalizer now stops with instructions because rebuilding from
legacy sources could overwrite approved canonical pixels. Any artistic change
must follow the repository's PixelLab MCP workflow.
