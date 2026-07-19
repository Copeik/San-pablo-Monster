import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { MAP_EDITOR_RULES, validateEditorEntity, validateMapEditorData } from "../map-editor-contract.js";
import { sanitizeMapEditorData } from "../map-editor-server.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const script = await readFile(path.join(ROOT, "script.js"), "utf8");
const editor = await readFile(path.join(ROOT, "map-editor.js"), "utf8");
const layout = await readFile(path.join(ROOT, "map-layout.js"), "utf8");
const html = await readFile(path.join(ROOT, "index.html"), "utf8");

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `no se pudo aislar ${name}`);
  return source.slice(start, end);
}

test("el modo dios reconoce una escena estable y separada para cada interior", () => {
  assert.match(script, /function stableInteriorSceneId\(type, door\)/);
  assert.match(script, /const interiorAssetsByScene = new Map\(\)/);
  assert.match(script, /sceneInfo: \(\) => currentInteriorSceneId\(\)/);
  assert.match(script, /assets: \(\) => activeEditorAssets\(\)/);
  assert.match(editor, /scene\.kind === "interior" && !\["objects", "ground", "npcs", "entrances", "events"\]\.includes\(nextMode\)/);
  assert.match(editor, /record\.scene = String\(asset\.scene/);
  assert.match(editor, /scene: String\(npc\.scene \|\| bridge\.sceneInfo\?\.\(\)\.id \|\| "world"\)/);
});

test("las salas building no inyectan muebles ni NPC procedurales", () => {
  const drawInterior = functionSource(script, "drawInterior", "drawInteriorGroundOverrides");
  assert.doesNotMatch(drawInterior, /drawInteriorFurniture|drawInteriorNpc|INDOOR_NPC/);
  assert.match(drawInterior, /activeInteriorAssets\(\)/);
  assert.match(drawInterior, /activeSceneNpcs\(\)/);
  assert.match(drawInterior, /if \(!hasCustomInteriorEntrance\(\)\)/);
  assert.match(drawInterior, /SALIDA DE SEGURIDAD/);
  assert.match(script, /if \(!hasCustomInteriorEntrance\(\) && distance\(player, INDOOR_EXIT\)/);
  assert.match(script, /activeInteriorAssets\(\)\.some\(\(asset\) => asset\.solid !== false/);
  assert.match(script, /sceneAssets\.filter\(\(asset\) => asset\.layer === "floor"\)/);
  assert.match(script, /entities\.sort\(\(first, second\) => first\.y - second\.y/);
});

test("NPC y entradas interiores se guardan, filtran y validan por escena", () => {
  const sceneA = "interior:casa-azul:abc";
  const sceneB = "interior:casa-roja:def";
  const source = {
    addedNpcs: [
      { id: "npc-a", col: 4, row: 5, scene: sceneA, direction: "down", name: "A", sprite: "guide", lines: ["A"] },
      { id: "npc-b", col: 4, row: 5, scene: sceneB, direction: "down", name: "B", sprite: "guide", lines: ["B"] },
    ],
    entrances: [
      { id: "exit-a", col: 14, row: 17, scene: sceneA, action: "exit", label: "Salir A" },
      { id: "exit-b", col: 14, row: 17, scene: sceneB, action: "exit", label: "Salir B" },
    ],
  };
  const sanitized = sanitizeMapEditorData(source);
  assert.deepEqual(sanitized.addedNpcs.map(({ id, scene }) => ({ id, scene })), [
    { id: "npc-a", scene: sceneA }, { id: "npc-b", scene: sceneB },
  ]);
  assert.deepEqual(sanitized.entrances.map(({ id, scene, action }) => ({ id, scene, action })), [
    { id: "exit-a", scene: sceneA, action: "exit" }, { id: "exit-b", scene: sceneB, action: "exit" },
  ]);
  assert.equal(validateMapEditorData(sanitized).valid, true);
  assert.equal(validateEditorEntity("npc", source.addedNpcs[0]).valid, true);
  assert.equal(validateEditorEntity("npc", { ...source.addedNpcs[0], scene: "../mala" }).valid, false);
  assert.equal(validateEditorEntity("entrance", source.entrances[0]).valid, true);
  assert.equal(validateEditorEntity("entrance", { ...source.entrances[0], scene: "world" }).valid, false);
  assert.deepEqual(sanitizeMapEditorData({
    entrances: [{ ...source.entrances[0], id: "exit-invalida", scene: "../mala" }],
  }).entrances, [{ id: "exit-invalida", col: 14, row: 17, label: "Salir A", action: "closed" }]);
  assert.ok(MAP_EDITOR_RULES.types.entranceAction.includes("exit"));
  assert.match(html, /<option value="exit">Salir del interior<\/option>/);
  assert.match(editor, /scene: scene\.id \|\| "world"/);
  assert.match(editor, /scene: scene\.id, label: "Salida", action: "exit"/);
  assert.match(script, /function sceneTileKey\(scene, col, row\)/);
  assert.match(script, /entranceTileIndex\.get\(sceneTileKey\(currentRuntimeSceneId\(\), col, row\)\)/);
  assert.match(script, /if \(door\.action === "exit"\) \{\s*void leaveInterior\(\);/);
  assert.match(script, /activeSceneNpcs\(\).*drawWorldNpc\(context, npc\)/s);
  assert.match(script, /&& !worldNpcBlocksPosition\(x, y\)/);
});

test("en interiores solo Terreno permanece desactivado", () => {
  const preparation = functionSource(editor, "prepareOpenEditor", "bindUi");
  assert.match(preparation, /!\["objects", "ground", "npcs", "entrances", "events"\]\.includes\(button\.dataset\.editorMode\)/);
  for (const mode of ["objects", "ground", "npcs", "entrances", "events"]) {
    assert.ok(preparation.includes(`"${mode}"`), `falta habilitar ${mode}`);
  }
  assert.doesNotMatch(preparation, /\["objects", "terrain"/);
});

test("los 20 PNG de PixelLab existen y estan registrados como interiores", async () => {
  const sources = [...layout.matchAll(/src: "(assets\/interiors\/pixellab-house\/[^"]+\.png)"/g)].map((match) => match[1]);
  assert.equal(sources.length, 20);
  await Promise.all(sources.map((source) => access(path.join(ROOT, source))));
  assert.equal((layout.match(/interior: true/g) || []).length, 20);
});

test("los suelos PixelLab se pintan y persisten por escena interior", async () => {
  const floorTypes = MAP_EDITOR_RULES.types.ground.filter((type) => type.startsWith("interior-"));
  assert.equal(floorTypes.length, 16);
  await Promise.all(floorTypes.map((type) => access(path.join(
    ROOT,
    "assets",
    "interiors",
    "pixellab-house",
    "floors",
    `${type.slice("interior-".length)}.png`,
  ))));

  const source = {
    interiorGroundOverrides: {
      "interior:casa-azul:abc": { "3,4": "interior-oak-honey" },
      "interior:casa-roja:def": { "3,4": "interior-terracotta" },
    },
  };
  const sanitized = sanitizeMapEditorData(source);
  assert.deepEqual(sanitized.interiorGroundOverrides, source.interiorGroundOverrides);
  assert.equal(validateMapEditorData(sanitized).valid, true);
  assert.match(script, /const interiorGroundOverridesByScene = new Map\(\)/);
  assert.match(script, /function drawInteriorGroundOverrides\(context\)/);
  assert.match(editor, /scene\.kind === "interior" && !\["objects", "ground", "npcs", "entrances", "events"\]\.includes\(nextMode\)/);
});

test("el modo dios ofrece interacciones con E para PC, cartas, objetos y utilidades", () => {
  for (const type of ["computer", "letter", "pickup", "heal", "switch", "sound"]) {
    assert.ok(MAP_EDITOR_RULES.types.event.includes(type), `falta el evento ${type}`);
  }
  const base = { id: "interior-event", col: 4, row: 5, scene: "interior:casa:abc", trigger: "interact" };
  assert.equal(validateEditorEntity("event", { ...base, type: "computer", message: "INICIANDO SISTEMA" }).valid, true);
  assert.equal(validateEditorEntity("event", { ...base, type: "letter", message: "Querido entrenador…" }).valid, true);
  assert.equal(validateEditorEntity("event", { ...base, type: "pickup", itemKind: "potions", itemName: "Poción", amount: 2 }).valid, true);
  assert.equal(validateEditorEntity("event", { ...base, type: "pickup", itemKind: "desconocido", amount: 0 }).valid, false);
  assert.equal(validateEditorEntity("event", { ...base, type: "switch", flag: "luz-sotano", message: "Interruptor" }).valid, true);
  assert.equal(validateEditorEntity("event", { ...base, type: "sound", jingle: "capture" }).valid, true);
  assert.match(script, /computer: "Leer PC"/);
  assert.match(script, /letter: "Abrir carta"/);
  assert.match(script, /pickup: "Coger objeto"/);
  assert.match(script, /event\.type === "heal"/);
  assert.match(script, /state\.eventFlags\[event\.flag\]/);
});
