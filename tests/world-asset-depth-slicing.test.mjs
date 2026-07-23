import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "script.js"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`no se pudo extraer ${name}`);
}

function loadDepthHelpers(overrides = {}) {
  const sandbox = {
    drawWorldAsset: () => {},
    drawWorldAssetSlice: () => {},
    ...overrides,
  };
  vm.runInNewContext(`
    ${extractFunction("worldAssetDepthSlices")}
    ${extractFunction("worldAssetRenderEntities")}
    globalThis.worldAssetDepthSlices = worldAssetDepthSlices;
    globalThis.worldAssetRenderEntities = worldAssetRenderEntities;
  `, sandbox);
  return sandbox;
}

test("depthSliceHeight crea franjas con profundidad en su borde inferior", () => {
  const { worldAssetDepthSlices } = loadDepthHelpers();
  const slices = worldAssetDepthSlices({ y: 800, depthY: 790, h: 128, depthSliceHeight: 32 });

  assert.deepEqual(Array.from(slices, (slice) => [slice.top, slice.bottom, slice.depthY]), [
    [0, 32, 694],
    [32, 64, 726],
    [64, 96, 758],
    [96, 128, 790],
  ]);
});

test("los assets sin depthSliceHeight conservan una sola entidad de dibujo", () => {
  const drawCalls = [];
  const helpers = loadDepthHelpers({
    drawWorldAsset: (...args) => drawCalls.push(args),
  });
  const asset = { id: "legacy", kind: "building", x: 100, y: 200, w: 64, h: 96 };
  const entities = helpers.worldAssetRenderEntities({}, asset);

  assert.equal(entities.length, 1);
  assert.equal(entities[0].y, 200);
  assert.equal(entities[0].priority, 0);
  entities[0].draw();
  assert.equal(drawCalls.length, 1);
});

test("la sombra del edificio segmentado se dibuja una vez y castShadow false la elimina", () => {
  const fullDraws = [];
  const sliceDraws = [];
  const helpers = loadDepthHelpers({
    drawWorldAsset: (...args) => fullDraws.push(args),
    drawWorldAssetSlice: (...args) => sliceDraws.push(args),
  });
  const asset = { id: "wing", kind: "building", x: 100, y: 224, w: 96, h: 96, depthSliceHeight: 32 };
  const entities = helpers.worldAssetRenderEntities({}, asset);

  assert.equal(entities.length, 4, "una pasada de sombra mas tres franjas");
  assert.deepEqual(Array.from(entities, (entity) => entity.priority), [-1, 0, 0, 0]);
  assert.deepEqual(Array.from(entities, (entity) => entity.y), [160, 160, 192, 224]);
  entities.forEach((entity) => entity.draw());
  assert.equal(fullDraws.length, 1);
  assert.equal(sliceDraws.length, 3);

  const noShadow = helpers.worldAssetRenderEntities({}, { ...asset, castShadow: false });
  assert.equal(noShadow.length, 3);
  noShadow.forEach((entity) => entity.draw());
  assert.equal(fullDraws.length, 1, "castShadow false no agrega una pasada completa");
  assert.equal(sliceDraws.length, 6);
});

test("las franjas recortan una proyeccion unica y nunca repiten drop-shadow", () => {
  const drawStart = source.indexOf("function drawWorldAsset(context");
  const drawEnd = source.indexOf("function drawWorldAssetColliders", drawStart);
  const drawing = source.slice(drawStart, drawEnd);
  const entitiesStart = source.indexOf("function drawWorldEntities");
  const entitiesEnd = source.indexOf("function mapOpeningPlayerFrame", entitiesStart);

  assert.match(drawing, /asset\.castShadow !== false && castShadow/);
  assert.match(drawing, /context\.rect\(left, top \+ slice\.top, width, slice\.bottom - slice\.top\);/);
  assert.match(drawing, /context\.clip\(\);[\s\S]*?drawWorldAsset\(context, asset, \{ castShadow: false \}\);/);
  assert.match(source.slice(entitiesStart, entitiesEnd), /visibleAssets\.flatMap\(\(asset\) => worldAssetRenderEntities\(context, asset\)\)/);
});
