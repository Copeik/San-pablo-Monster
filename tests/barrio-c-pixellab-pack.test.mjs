import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { inflateSync } from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACK = path.join(ROOT, "assets/generated/san-pablo-barrio-c-pixellab");
const manifest = JSON.parse(await readFile(path.join(PACK, "manifest.json"), "utf8"));
const DIRECTIONS = ["east", "west", "north", "south", "north-east", "north-west", "south-east", "south-west"];
const BUILDING_FAMILIES = [
  { slug: "mixed-block", assetPrefix: "barrioCMixedBlock", pixelLabId: "0dc73709-6f3e-4308-9ea8-3c816b24e552", size: 170 },
  { slug: "pharmacy", assetPrefix: "barrioCPharmacy", pixelLabId: "39a2f43e-241e-43e1-a7bb-9df35d664916", size: 170 },
  { slug: "bank", assetPrefix: "barrioCBank", pixelLabId: "bd4f6b10-53b4-4e73-ad10-2fe19a34a5ca", size: 170 },
  { slug: "cafe-bar", assetPrefix: "barrioCCafeBar", pixelLabId: "e4a6fe06-0aeb-48de-b3e8-1c8c7af3821c", size: 170 },
  { slug: "bar-strip", assetPrefix: "barrioCBarStrip", pixelLabId: "f531bd95-b1e3-4caa-9fdc-69a0fb1f1168", size: 170 },
  { slug: "shop", assetPrefix: "barrioCShop", pixelLabId: "9247e736-8388-4bf5-a7ee-34a1e53918a1", size: 170 },
];
const NEW_BUILDING_FAMILIES = BUILDING_FAMILIES.slice(1);
const BUILDING_VARIANTS = ["Front", "VerticalA", "VerticalB"];
const REJECTED_MAP_OBJECT_IDS = [
  "6512f355-ffb2-479f-8d20-2818d2b79994",
  "ef58be6e-bca0-4b44-9b33-0c14bda02b8a",
  "38dadfd6-78c2-4283-bc0b-f5f0c479e1e4",
];

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upperLeft);
  return dl <= du && dl <= dul ? left : du <= dul ? up : upperLeft;
}

function decodePng(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  let cursor = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed = [];
  while (cursor < buffer.length) {
    const length = buffer.readUInt32BE(cursor);
    const type = buffer.subarray(cursor + 4, cursor + 8).toString("ascii");
    const data = buffer.subarray(cursor + 8, cursor + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "los PNG deben usar canales de 8 bits");
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : data[9] === 0 ? 1 : 0;
      assert.ok(channels, `tipo PNG no soportado: ${data[9]}`);
      assert.equal(data[12], 0, "los PNG no deben estar entrelazados");
    } else if (type === "IDAT") compressed.push(data);
    cursor += length + 12;
  }
  const stride = width * channels;
  const filtered = inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = filtered[sourceOffset++];
    const targetOffset = row * stride;
    for (let index = 0; index < stride; index += 1) {
      const encoded = filtered[sourceOffset++];
      const left = index >= channels ? pixels[targetOffset + index - channels] : 0;
      const up = row ? pixels[targetOffset + index - stride] : 0;
      const upperLeft = row && index >= channels ? pixels[targetOffset + index - stride - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : NaN;
      assert.ok(Number.isFinite(predictor), `filtro PNG no soportado: ${filter}`);
      pixels[targetOffset + index] = (encoded + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

test("el manifiesto conserva las diecisiete llamadas PixelLab y su procedencia", () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.logicalTileSize, 32);
  assert.equal(manifest.generation.maximumCalls, 17);
  assert.equal(manifest.generation.calls.length, 17);
  assert.equal(new Set(manifest.generation.calls.map((entry) => entry.id)).size, 17);
  assert.equal(manifest.generation.calls.every((entry) => entry.tool.startsWith("pixellab.")), true);
  assert.equal(manifest.generation.calls.find((entry) => entry.id === "b93a56d1-2c23-4409-8c2a-78169ef67be3").seed, 348127);
  const rejectedCafe = manifest.generation.calls.find((entry) => entry.id === "d85b0675-e73f-4586-96d6-fa5d1c466e9e");
  assert.ok(rejectedCafe, "falta el primer intento rechazado del café-bar");
  assert.equal(rejectedCafe.status, "rejected");
  const rejectionReason = rejectedCafe.error ?? rejectedCafe.reason;
  assert.equal(typeof rejectionReason, "string");
  assert.match(rejectionReason, /personaje|character|barista|arquitectura|architecture|edificio|building/i);
  for (const id of REJECTED_MAP_OBJECT_IDS) {
    const rejectedMapObject = manifest.generation.calls.find((entry) => entry.id === id);
    assert.ok(rejectedMapObject, `falta la llamada map object rechazada ${id}`);
    assert.equal(rejectedMapObject.tool, "pixellab.create_map_object");
    assert.equal(rejectedMapObject.status, "rejected");
    const reason = rejectedMapObject.error ?? rejectedMapObject.reason;
    assert.equal(typeof reason, "string");
    assert.match(reason, /isom[eé]tric/i);
  }
  for (const family of NEW_BUILDING_FAMILIES) {
    const call = manifest.generation.calls.find((entry) => entry.id === family.pixelLabId);
    assert.ok(call, `falta la llamada PixelLab de ${family.slug}`);
    assert.equal(call.tool, "pixellab.create_8_direction_object");
    assert.equal(call.kind, "eight_direction_object");
    assert.equal(call.status, "completed");
    assert.deepEqual(call.dimensions, { width: 170, height: 170, directions: 8 });
  }
  const { generationsBefore, generationsAfter, generationsConsumed } = manifest.generation.balance;
  assert.equal(Number.isInteger(generationsBefore), true);
  assert.equal(Number.isInteger(generationsAfter), true);
  assert.ok(generationsAfter >= 0);
  assert.equal(Number.isInteger(generationsConsumed), true);
  assert.ok(generationsConsumed >= 0);
  assert.equal(generationsConsumed, generationsBefore - generationsAfter);
  assert.equal(manifest.assets.length, 25);
});

test("dos Wang están disponibles y los otros dos conservan el estado waiting", async () => {
  assert.equal(manifest.terrains.length, 4);
  const completed = manifest.terrains.filter((terrain) => terrain.status === "completed");
  const waiting = manifest.terrains.filter((terrain) => terrain.status === "waiting");
  assert.equal(completed.length, 2);
  assert.equal(waiting.length, 2);
  assert.equal(completed.map((terrain) => terrain.pixelLabId).sort().join(","), [
    "3fa15803-32df-4e96-afd1-2f1f51f36fcc",
    "75bed0c2-e9a9-4945-8c08-147b129eb23e",
  ].join(","));
  assert.equal(waiting.map((terrain) => terrain.pixelLabId).sort().join(","), [
    "4b6a4b40-fe71-48ff-9074-8edd52f0123a",
    "73a0b933-20ca-48b1-b7b7-777842806e69",
  ].join(","));
  assert.equal(waiting.every((terrain) => terrain.original === null && terrain.runtime === null), true);
  for (const terrain of completed) {
    assert.equal(terrain.tileSize, 32);
    assert.equal(terrain.tileCount, 16);
    for (const relative of [terrain.original, terrain.runtime]) {
      const png = decodePng(await readFile(path.join(ROOT, relative)));
      assert.deepEqual({ width: png.width, height: png.height }, { width: 128, height: 128 }, relative);
    }
  }
});

test("cada familia de edificios conserva sus ocho rotaciones originales", async () => {
  for (const family of BUILDING_FAMILIES) {
    for (const direction of DIRECTIONS) {
      const relative = `assets/generated/san-pablo-barrio-c-pixellab/originals/buildings/${family.slug}-${direction}.png`;
      const png = decodePng(await readFile(path.join(ROOT, relative)));
      assert.deepEqual(
        { width: png.width, height: png.height, channels: png.channels },
        { width: family.size, height: family.size, channels: 4 },
        relative,
      );
    }
  }
});

test("cada edificio nuevo ofrece frontal y dos laterales con la misma procedencia", () => {
  for (const family of NEW_BUILDING_FAMILIES) {
    const variants = BUILDING_VARIANTS.map((suffix) => {
      const id = `${family.assetPrefix}${suffix}`;
      const asset = manifest.assets.find((entry) => entry.id === id);
      assert.ok(asset, `falta ${id}`);
      return asset;
    });
    assert.equal(variants.every((asset) => asset.kind === "building"), true, family.slug);
    assert.equal(variants.every((asset) => asset.pixelLabId === family.pixelLabId), true, family.slug);
    assert.equal(variants.every((asset) => asset.status === "completed"), true, family.slug);
  }
});

test("la hoja de detalles y sus fuentes mantienen celdas de 32 px", async () => {
  const sheet = decodePng(await readFile(path.join(ROOT, manifest.details.runtime)));
  assert.deepEqual({ width: sheet.width, height: sheet.height }, { width: 128, height: 128 });
  assert.equal(manifest.details.sources.length, 16);
  for (const relative of manifest.details.sources) {
    const tile = decodePng(await readFile(path.join(ROOT, relative)));
    assert.deepEqual({ width: tile.width, height: tile.height }, { width: 32, height: 32 }, relative);
  }
});

test("los 25 sprites del catálogo son RGBA, transparentes y anclados abajo", async () => {
  const source = await readFile(path.join(PACK, "catalog.js"), "utf8");
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context, { filename: "barrio-c-catalog.js" });
  const catalog = context.window.CITY_BARRIO_C_ASSET_CATALOG;
  assert.equal(Object.keys(catalog).length, 25);
  assert.equal(Object.keys(context.window.CITY_BARRIO_C_TILE_CATALOG).join(","), "asphaltSidewalk,sidewalkGrass,urbanDetails");
  for (const family of NEW_BUILDING_FAMILIES) {
    for (const suffix of BUILDING_VARIANTS) {
      const id = `${family.assetPrefix}${suffix}`;
      assert.equal(catalog[id]?.kind, "building", id);
      assert.equal(catalog[id]?.pixelLabId, family.pixelLabId, id);
    }
  }
  for (const [id, asset] of Object.entries(catalog)) {
    const filename = asset.src.split("?", 1)[0];
    const png = decodePng(await readFile(path.join(ROOT, filename)));
    assert.equal(png.channels, 4, `${id} debe ser RGBA`);
    assert.deepEqual({ width: png.width, height: png.height }, { width: asset.w, height: asset.h });
    const alpha = (x, y) => png.pixels[(y * png.width + x) * 4 + 3];
    assert.deepEqual([
      alpha(0, 0), alpha(png.width - 1, 0),
      alpha(0, png.height - 1), alpha(png.width - 1, png.height - 1),
    ], [0, 0, 0, 0], `${id} debe conservar esquinas transparentes`);
    assert.ok(png.pixels.some((value, index) => index % 4 === 3 && value > 0), `${id} está vacío`);
    assert.ok(Array.from({ length: png.width }, (_, x) => alpha(x, png.height - 1)).some(Boolean), `${id} no está anclado abajo`);
  }
});

test("el catálogo queda registrado sin colocar objetos nuevos en el mapa", async () => {
  const files = [
    "assets/generated/san-pablo-neighborhood/catalog.js",
    "assets/generated/san-pablo-barrio-c-pixellab/catalog.js",
    "map-layout.js",
  ];
  const window = { CITY_MAP_EDITOR_DATA: { version: 3 } };
  const context = vm.createContext({ window, console });
  for (const filename of files) {
    vm.runInContext(await readFile(path.join(ROOT, filename), "utf8"), context, { filename });
  }
  const barrioIds = new Set(Object.keys(window.CITY_BARRIO_C_ASSET_CATALOG));
  assert.equal([...barrioIds].every((id) => window.CITY_MAP_LAYOUT.assetCatalog[id]), true);
  assert.equal(window.CITY_MAP_LAYOUT.worldAssets.some((asset) => barrioIds.has(asset.sprite)), false);
  const html = await readFile(path.join(ROOT, "index.html"), "utf8");
  const catalogIndex = html.indexOf("san-pablo-barrio-c-pixellab/catalog.js");
  assert.ok(catalogIndex > 0 && catalogIndex < html.indexOf("map-layout.js"));
  await access(path.join(PACK, "contact-sheet.png"));
});
