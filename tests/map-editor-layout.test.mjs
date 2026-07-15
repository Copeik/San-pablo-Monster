import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const layoutSource = await readFile(path.join(ROOT, "map-layout.js"), "utf8");
const mapSource = await readFile(path.join(ROOT, "map-data.js"), "utf8");

function buildMap(editorData) {
  const window = { CITY_MAP_EDITOR_DATA: editorData };
  const context = vm.createContext({ window, console });
  vm.runInContext(layoutSource, context, { filename: "map-layout.js" });
  vm.runInContext(mapSource, context, { filename: "map-data.js" });
  return window;
}

test("una puerta base sigue a su edificio cuando el editor lo mueve", () => {
  const window = buildMap({
    version: 2,
    assetOverrides: {
      "north-institution": { x: 1496, y: 462, scale: 1, rotation: 0, solid: true },
    },
  });
  const asset = window.CITY_MAP_LAYOUT.worldAssets.find((entry) => entry.id === "north-institution");
  assert.deepEqual([...asset.door], [46, 14]);
  assert.deepEqual([...asset.approach], [1488, 496, "up"]);
  const door = window.CITY_MAP_CONFIG.doors.find((entry) => entry.linkedAssetId === "north-institution");
  assert.deepEqual({ col: door.col, row: door.row }, { col: 46, row: 14 });
});

test("ocultar un edificio retira también su puerta base", () => {
  const window = buildMap({ version: 2, hiddenAssets: ["west-clinic"] });
  assert.equal(window.CITY_MAP_LAYOUT.worldAssets.some((entry) => entry.id === "west-clinic"), false);
  assert.equal(window.CITY_MAP_CONFIG.doors.some((entry) => entry.col === 18 && entry.row === 21), false);
});
