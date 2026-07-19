import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { inflateSync } from "node:zlib";
import { parseMapEditorSource } from "../map-editor-server.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= upDistance && leftDistance <= diagonalDistance ? left
    : upDistance <= diagonalDistance ? up : upperLeft;
}

function decodePng(png) {
  let cursor = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed = [];
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor);
    const type = png.subarray(cursor + 4, cursor + 8).toString("ascii");
    const data = png.subarray(cursor + 8, cursor + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "los sprites deben usar canales de 8 bits");
      channels = data[9] === 6 ? 4 : data[9] === 0 ? 1 : 0;
      assert.ok(channels, `tipo de color PNG no soportado: ${data[9]}`);
    } else if (type === "IDAT") compressed.push(data);
    cursor += length + 12;
  }

  const bytesPerPixel = channels;
  const stride = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = filtered[sourceOffset++];
    const targetOffset = row * stride;
    for (let index = 0; index < stride; index += 1) {
      const encoded = filtered[sourceOffset++];
      const left = index >= bytesPerPixel ? pixels[targetOffset + index - bytesPerPixel] : 0;
      const up = row > 0 ? pixels[targetOffset + index - stride] : 0;
      const upperLeft = row > 0 && index >= bytesPerPixel
        ? pixels[targetOffset + index - stride - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft) : NaN;
      assert.ok(Number.isFinite(predictor), `filtro PNG no soportado: ${filter}`);
      pixels[targetOffset + index] = (encoded + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

function navigationMaskAllows(mask, x, y, cellSize, radius = 9) {
  const samples = [[0, 0]];
  for (let index = 0; index < 12; index += 1) {
    const angle = Math.PI * 2 * index / 12;
    samples.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return samples.every(([offsetX, offsetY]) => {
    const col = Math.floor((x + offsetX) / cellSize);
    const row = Math.floor((y + offsetY) / cellSize);
    return col >= 0 && row >= 0 && col < mask.width && row < mask.height
      && mask.pixels[row * mask.width + col] >= 128;
  });
}

async function loadPlazaMap() {
  const sandbox = { console };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const scripts = [
    "map-registry.js",
    "map-editor-data.js",
    "assets/generated/san-pablo-neighborhood/catalog.js",
    "map-layout.js",
    "map-data.js",
    "maps/san-pablo/register.js",
    "maps/plaza-farmacia/editor-data.js",
    "maps/plaza-farmacia/map.js",
  ];
  for (const filename of scripts) {
    vm.runInContext(await readFile(path.join(ROOT, filename), "utf8"), context, { filename });
  }
  return sandbox;
}

test("la plaza de la farmacia es un mapa separado conectado en ambos sentidos", async () => {
  const sandbox = await loadPlazaMap();
  const city = sandbox.GAME_MAP_REGISTRY.get("san-pablo");
  const plaza = sandbox.GAME_MAP_REGISTRY.get("plaza-farmacia");

  assert.ok(plaza, "el paquete de la plaza debe registrarse");
  assert.equal(plaza.config.kind, "district");
  assert.deepEqual(
    { width: plaza.config.width, height: plaza.config.height },
    { width: 1280, height: 960 },
  );

  const access = city.config.events.find((event) => event.id === "plaza-farmacia-access");
  assert.equal(access.type, "transition");
  assert.equal(access.trigger, "interact");
  assert.equal(access.targetMap, "plaza-farmacia");
  assert.deepEqual(
    { x: access.targetX, y: access.targetY, direction: access.targetDirection },
    { x: plaza.config.spawn.x, y: plaza.config.spawn.y, direction: plaza.config.spawn.direction },
  );
  const spawnCol = Math.floor(plaza.config.spawn.x / plaza.config.tileSize);
  const spawnRow = Math.floor(plaza.config.spawn.y / plaza.config.tileSize);
  assert.ok(plaza.config.walkableRects.some(([left, top, right, bottom]) => (
    spawnCol >= left && spawnCol <= right && spawnRow >= top && spawnRow <= bottom
  )));

  const exit = plaza.config.events.find((event) => event.id === "plaza-farmacia-return-san-pablo");
  assert.equal(exit.type, "transition");
  assert.equal(exit.trigger, "step");
  assert.equal(exit.targetMap, "san-pablo");

  const navigationPng = await readFile(path.join(ROOT, city.config.navigationMask.image));
  const navigation = decodePng(navigationPng);
  assert.equal(navigation.channels, 1);
  assert.equal(navigationMaskAllows(
    navigation,
    (access.col + 0.5) * city.config.tileSize,
    (access.row + 0.5) * city.config.tileSize,
    city.config.navigationMask.cellSize,
  ), true, "la casilla de entrada debe ser transitable");
  assert.equal(navigationMaskAllows(
    navigation,
    exit.targetX,
    exit.targetY,
    city.config.navigationMask.cellSize,
  ), true, "el destino de regreso debe ser transitable");
});

test("los datos de la plaza se pueden cargar y guardar desde el editor", async () => {
  const source = await readFile(path.join(ROOT, "maps/plaza-farmacia/editor-data.js"), "utf8");
  const parsed = parseMapEditorSource(source);
  assert.deepEqual(parsed.mapSize, { cols: 40, rows: 30 });
  assert.deepEqual(parsed.interiorGroundOverrides, {});
  assert.deepEqual(parsed.entrances, []);
  assert.deepEqual(parsed.events, []);
});

test("la composicion contiene los comercios y la terraza PixelLab", async () => {
  const { GAME_MAP_REGISTRY } = await loadPlazaMap();
  const plaza = GAME_MAP_REGISTRY.get("plaza-farmacia");
  const city = GAME_MAP_REGISTRY.get("san-pablo");
  const required = new Map([
    ["plazaPharmacy", [283, 132]],
    ["plazaBank", [230, 140]],
    ["plazaShop", [202, 156]],
    ["plazaBars", [358, 109]],
    ["plazaTerrace", [161, 107]],
  ]);

  for (const [sprite, [expectedWidth, expectedHeight]] of required) {
    const prototype = plaza.layout.assetCatalog[sprite];
    assert.ok(prototype, `falta el prototipo ${sprite}`);
    assert.ok(plaza.config.worldAssets.some((asset) => asset.sprite === sprite));

    const png = await readFile(path.join(ROOT, prototype.src));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    const decoded = decodePng(png);
    assert.equal(decoded.channels, 4);
    assert.equal(decoded.width, expectedWidth);
    assert.equal(decoded.height, expectedHeight);
    const alpha = decoded.pixels.filter((value, index) => index % 4 === 3);
    assert.ok(alpha.some((value) => value === 0), `${prototype.src} debe conservar fondo transparente`);
    assert.ok(alpha.some((value) => value > 0), `${prototype.src} no puede estar vacio`);
    assert.ok(
      decoded.pixels.subarray((decoded.height - 1) * decoded.width * 4)
        .some((value, index) => index % 4 === 3 && value > 0),
      `${prototype.src} debe estar recortado hasta su base visible`,
    );
  }

  const commercialSprites = new Set(["plazaPharmacy", "plazaBank", "plazaShop", "plazaBars"]);
  const commercialRow = plaza.config.worldAssets.filter((asset) => commercialSprites.has(asset.sprite));
  assert.equal(commercialRow.length, 4);
  assert.ok(commercialRow.every((asset) => asset.y === 330), "las cuatro fachadas deben compartir linea de base");
  assert.equal(plaza.config.assetRevision, city.config.assetRevision);
  const enlargedTree = plaza.config.worldAssets.find((asset) => asset.id === "plaza-tree-main");
  assert.deepEqual(Array.from(enlargedTree.colliders[0]), [-64, -66, 128, 104], "el collider debe cubrir el alcorque completo");

  assert.equal(plaza.editorData.mapSize.cols, 40);
  assert.equal(plaza.editorData.mapSize.rows, 30);
  assert.equal(plaza.editorData.events.length, 0);
});
