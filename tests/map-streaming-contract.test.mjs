import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("el streaming del mapa se limita por firma cuantizada y por tiempo", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  const interval = source.match(/const MAP_STREAMING_MAX_INTERVAL_MS = (\d+);/);
  assert.ok(interval, "falta el límite temporal del streaming");
  assert.ok(Number(interval[1]) <= 100, "el streaming debe reaccionar en 100 ms o menos");
  assert.match(source, /let lastMapStreamingSignature = "";/);
  assert.match(source, /const streamingSignature = `\$\{Math\.floor\(view\.left \/ MAP_STREAMING_QUANTUM\)/);
  assert.match(source, /streamingSignature === lastMapStreamingSignature[\s\S]*?now - lastMapStreamingUpdateAt < MAP_STREAMING_MAX_INTERVAL_MS[\s\S]*?return;/);
});

test("salir del mapa invalida la firma para que la vuelta recargue lo visible", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  const start = source.indexOf("function releaseAllMapTiles");
  const end = source.indexOf("function decodeMapTileAsImage", start);
  assert.match(source.slice(start, end), /lastMapStreamingSignature = "";/);
});

test("los objetos decorativos se solicitan por viewport y no todos al arrancar", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  const loadStart = source.indexOf("function loadCityWorldAssets");
  const loadEnd = source.indexOf("function encounterGrassReady", loadStart);
  const drawStart = source.indexOf("function drawWorldEntities");
  const drawEnd = source.indexOf("function drawWorldObject", drawStart);

  assert.doesNotMatch(source.slice(loadStart, loadEnd), /cityWorldAssets\.forEach\(ensureCityWorldAssetImage\)/);
  assert.match(source.slice(loadStart, loadEnd), /visibleWorldAssetsForLoad\(\)\.forEach\(ensureCityWorldAssetImage\)/);
  assert.match(source.slice(drawStart, drawEnd), /visibleAssets\.forEach\(ensureCityWorldAssetImage\)/);
});
