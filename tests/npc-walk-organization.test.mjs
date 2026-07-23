import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { validateNpcWalkSheets } from "../tools/validate-npc-walk-sheets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("each NPC owns an exact npc-overworld-v1 folder", () => {
  const report = validateNpcWalkSheets(projectRoot);
  assert.equal(report.valid, true, report.failures.join("\n"));
  assert.equal(report.spriteCount, 48);
  assert.equal(report.folderCount, 48);
  assert.equal(report.contract, "npc-walk-6x8");
  assert.equal(report.profile, "npc-overworld-v1");
});

test("the deterministic catalog resolves stable IDs and aliases to individual packs", async () => {
  const npcRoot = path.join(projectRoot, "assets", "sprites", "npcs");
  const manifest = JSON.parse(await readFile(path.join(npcRoot, "overworld-manifest.json"), "utf8"));
  const source = await readFile(path.join(npcRoot, "catalog.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const catalog = context.NPC_ASSET_CATALOG;

  assert.ok(catalog);
  assert.deepEqual(Object.keys(catalog), [...Object.keys(catalog)].sort());
  assert.equal(new Set(Object.values(catalog)).size, 48);

  for (const sprite of manifest.sprites) {
    const expected = `assets/sprites/npcs/${sprite.path}`;
    for (const id of [sprite.npcId, sprite.spriteId, ...sprite.aliases]) {
      assert.equal(catalog[id], expected, `${id} no resuelve ${expected}`);
    }
  }
  assert.equal(catalog.guide, "assets/sprites/npcs/overworld/guia-de-san-pablo/overworld.png");
  assert.equal(catalog["doctor-potato"], "assets/sprites/npcs/overworld/doctor-potato/overworld.png");
});

test("the entrypoint loads the NPC catalog before runtime resolution", async () => {
  const [html, runtime] = await Promise.all([
    readFile(path.join(projectRoot, "index.html"), "utf8"),
    readFile(path.join(projectRoot, "script.js"), "utf8"),
  ]);
  const catalogPosition = html.indexOf('src="assets/sprites/npcs/catalog.js');
  const runtimePosition = html.indexOf('src="script.js');

  assert.ok(catalogPosition >= 0, "index.html no carga el catálogo NPC");
  assert.ok(runtimePosition > catalogPosition, "el catálogo NPC debe cargarse antes de script.js");
  assert.match(runtime, /globalThis\.NPC_ASSET_CATALOG/);
  assert.match(runtime, /resolveNpcAssetUrl\("guide"\)/);
  assert.doesNotMatch(runtime, /NPC_OVERWORLD_SHEET_BASE_URL/);
  assert.doesNotMatch(runtime, /\$\{[^\n}]*\}\/$\{id\}-walk\.png/);
});
