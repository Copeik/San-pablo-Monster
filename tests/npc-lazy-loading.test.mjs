import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("el arranque no descarga ni decodifica los 48 NPC", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  const start = source.indexOf("function loadNpcRosterSprites");
  const end = source.indexOf("function loadPrismAssets", start);
  const loader = source.slice(start, end);

  assert.match(source, /function ensureNpcRosterSprite\(spriteId\)/);
  assert.doesNotMatch(loader, /Object\.entries\(NPC_ROSTER_SHEET_URLS\)\.forEach/);
  assert.doesNotMatch(source, /guideNpcSheet|NPC_SHEET_URL|source\/hgss/);
});

test("solo los NPC visibles entran en la caché y esta tiene un límite", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  const limit = source.match(/const NPC_ROSTER_CACHE_LIMIT = (\d+);/);
  assert.ok(limit);
  assert.ok(Number(limit[1]) <= 24);
  const start = source.indexOf("function drawWorldEntities");
  const end = source.indexOf("function drawWorldObject", start);
  const drawing = source.slice(start, end);
  assert.match(drawing, /const visibleNpcs = activeSceneNpcs\(\)[\s\S]*?entityInView\(mapNpcPosition\(npc\), bounds, 80\)/);
  assert.match(drawing, /visibleNpcs\.forEach\(\(npc\) => ensureNpcRosterSprite\(npc\.sprite\)\)/);
  assert.match(drawing, /trimNpcRosterCache\(new Set\(visibleNpcs\.map\(\(npc\) => npc\.sprite\)\)\)/);
});
