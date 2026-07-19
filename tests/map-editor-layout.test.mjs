import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const layoutSource = await readFile(path.join(ROOT, "map-layout.js"), "utf8");
const mapSource = await readFile(path.join(ROOT, "map-data.js"), "utf8");
const neighborhoodCatalogSource = await readFile(path.join(ROOT, "assets/generated/san-pablo-neighborhood/catalog.js"), "utf8");
const barrioCCatalogSource = await readFile(path.join(ROOT, "assets/generated/san-pablo-barrio-c-pixellab/catalog.js"), "utf8");

function buildMap(editorData) {
  const window = { CITY_MAP_EDITOR_DATA: editorData };
  const context = vm.createContext({ window, console });
  vm.runInContext(neighborhoodCatalogSource, context, { filename: "catalog.js" });
  vm.runInContext(barrioCCatalogSource, context, { filename: "barrio-c-catalog.js" });
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

test("el catálogo expone los recursos urbanos y 20 muebles ortogonales de interior", () => {
  const window = buildMap({ version: 3 });
  const catalog = window.CITY_MAP_LAYOUT.assetCatalog;
  assert.equal(Object.keys(window.CITY_NEIGHBORHOOD_ASSET_CATALOG).length, 40);
  assert.equal(Object.keys(window.CITY_BARRIO_C_ASSET_CATALOG).length, 25);
  assert.equal(Object.keys(catalog).length, 110);
  const furniture = Object.values(catalog).filter((asset) => asset.interior === true);
  assert.equal(furniture.length, 20);
  assert.equal(furniture.every((asset) => asset.kind === "furniture" && asset.pixelated === true), true);
  assert.equal(furniture.filter((asset) => asset.solid === false).length, 2);
  assert.equal(catalog.orangeTreeMature.label, "Naranjo adulto");
  assert.equal(catalog.civicUNorth.label, "Centro civico norte");
  assert.equal(catalog.whiteWallVertical.kind, "prop");
});

test("los muebles guardados para una casa no se filtran al exterior", () => {
  const window = buildMap({
    version: 3,
    addedAssets: [{
      id: "editor-bed-house-1", sprite: "interiorBedSingleVertical", scene: "interior:house-1:abc",
      x: 180, y: 220, scale: 1, solid: true,
    }],
  });
  assert.equal(window.CITY_MAP_LAYOUT.worldAssets.some((asset) => asset.id === "editor-bed-house-1"), false);
});

test("los reemplazos urbanos usan alzados ortogonales y respetan las correcciones", () => {
  const window = buildMap({ version: 3 });
  const catalog = window.CITY_NEIGHBORHOOD_ASSET_CATALOG;
  assert.equal(catalog.orangeTreePair.label, "Naranjo alto");
  assert.equal(catalog.orangeTreePair.units, 1);
  assert.equal(catalog.orangeTreePair.orientation, "vertical");
  assert.equal(catalog.towerWhiteOrangeFront.storeys, 4);
  assert.equal(catalog.towerWhiteOrangeFront.orientation, "horizontal");
  assert.equal(catalog.towerWhiteOrangeLeft.storeys, 4);
  assert.equal(catalog.towerWhiteOrangeLeft.orientation, "vertical");

  const correctedIds = [
    "towerTanLeft", "towerTanRight", "towerTanCorner", "towerWhiteOrangeFront",
    "towerWhiteOrangeLeft", "apartmentAwningCorner", "apartmentBrickSide",
    "residentialBlockCorner", "shopGroceryLeft", "shopGroceryRight",
    "shopCornerAwning", "billboardSingle",
  ];
  for (const id of correctedIds) {
    assert.match(catalog[id].orientation, /^(horizontal|vertical)$/);
    assert.doesNotMatch(catalog[id].label, /esquina|izquierda|derecha/i);
  }
});

test("la ampliacion sur contiene cuatro torres, el bar central y suelo transitable propio", () => {
  const window = buildMap({ version: 3, mapSize: { cols: 79, rows: 128 } });
  const assets = window.CITY_MAP_LAYOUT.worldAssets;
  const towers = [
    "four-towers-west",
    "four-towers-central",
    "four-towers-northeast",
    "four-towers-southeast",
  ].map((id) => assets.find((asset) => asset.id === id));
  assert.equal(towers.every((asset) => asset?.sprite === "apartmentBrickFront"), true);

  const bar = assets.find((asset) => asset.id === "four-towers-central-bar");
  assert.equal(bar.sprite, "shopBakeryFront");
  assert.deepEqual([...bar.door], [38, 101]);
  assert.equal(window.CITY_MAP_LAYOUT.extensionSurfaces.length, 8);
  assert.equal(window.CITY_MAP_CONFIG.extensionSurfaces.length, 8);
  assert.equal(window.CITY_MAP_CONFIG.height, 4096);
  assert.equal(window.CITY_MAP_CONFIG.sections.some((section) => section.id === "four-towers"), true);
});
