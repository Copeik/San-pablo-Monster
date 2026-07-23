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
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : data[9] === 0 ? 1 : 0;
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

function footprintBounds(footprint) {
  const points = Array.from(footprint.points, (point) => Array.from(point));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function reachableTiles(config, start) {
  const [[walkLeft, walkTop, walkRight, walkBottom]] = config.walkableRects;
  const blocked = new Set();
  for (const [left, top, right, bottom] of config.blockedRects) {
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) blocked.add(`${col},${row}`);
    }
  }
  const isFree = (col, row) => col >= walkLeft && col <= walkRight
    && row >= walkTop && row <= walkBottom && !blocked.has(`${col},${row}`);
  assert.equal(isFree(...start), true, `el inicio ${start} debe ser transitable`);
  const queue = [start];
  const seen = new Set([start.join(",")]);
  while (queue.length) {
    const [col, row] = queue.shift();
    for (const [nextCol, nextRow] of [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]]) {
      const key = `${nextCol},${nextRow}`;
      if (isFree(nextCol, nextRow) && !seen.has(key)) {
        seen.add(key);
        queue.push([nextCol, nextRow]);
      }
    }
  }
  return { blocked, isFree, seen };
}

async function assertTransparentPng(relativePath, width, height, requireTransparency = true) {
  const png = decodePng(await readFile(path.join(ROOT, relativePath)));
  assert.deepEqual({ width: png.width, height: png.height, channels: png.channels }, { width, height, channels: 4 });
  if (requireTransparency) {
    assert.ok(png.pixels.some((value, index) => index % 4 === 3 && value === 0), `${relativePath} debe conservar transparencia`);
  }
  assert.ok(png.pixels.some((value, index) => index % 4 === 3 && value > 0), `${relativePath} no puede estar vacío`);
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
    "maps/parking-plaza-farmacia/editor-data.js",
    "maps/parking-plaza-farmacia/map.js",
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
  assert.ok(plaza);
  assert.equal(plaza.config.kind, "district");
  assert.deepEqual({ width: plaza.config.width, height: plaza.config.height }, { width: 1280, height: 1792 });

  const access = city.config.events.find((event) => event.id === "plaza-farmacia-access");
  assert.deepEqual(
    { type: access.type, trigger: access.trigger, targetMap: access.targetMap },
    { type: "transition", trigger: "interact", targetMap: "plaza-farmacia" },
  );
  assert.deepEqual(
    { x: access.targetX, y: access.targetY, direction: access.targetDirection },
    { x: plaza.config.spawn.x, y: plaza.config.spawn.y, direction: plaza.config.spawn.direction },
  );
  assert.deepEqual({ ...plaza.config.spawn }, { x: 80, y: 848, direction: "right" });

  const exit = plaza.config.events.find((event) => event.id === "plaza-farmacia-return-san-pablo-west");
  assert.deepEqual({ type: exit.type, trigger: exit.trigger, targetMap: exit.targetMap }, {
    type: "transition", trigger: "step", targetMap: "san-pablo",
  });
  const navigation = decodePng(await readFile(path.join(ROOT, city.config.navigationMask.image)));
  assert.equal(navigation.channels, 1);
  assert.equal(navigationMaskAllows(
    navigation,
    (access.col + 0.5) * city.config.tileSize,
    (access.row + 0.5) * city.config.tileSize,
    city.config.navigationMask.cellSize,
  ), true);
  assert.equal(navigationMaskAllows(navigation, exit.targetX, exit.targetY, city.config.navigationMask.cellSize), true);
});

test("la plaza v14 y el parking v4 usan PNG nativos y datos de editor sincronizados", async () => {
  const { GAME_MAP_REGISTRY } = await loadPlazaMap();
  const plaza = GAME_MAP_REGISTRY.get("plaza-farmacia");
  const parking = GAME_MAP_REGISTRY.get("parking-plaza-farmacia");
  const plazaEditor = parseMapEditorSource(await readFile(path.join(ROOT, "maps/plaza-farmacia/editor-data.js"), "utf8"));
  const parkingEditor = parseMapEditorSource(await readFile(path.join(ROOT, "maps/parking-plaza-farmacia/editor-data.js"), "utf8"));

  assert.equal(plaza.editorData.version, 14);
  assert.equal(parking.editorData.version, 4);
  assert.deepEqual(plazaEditor.mapSize, { cols: 40, rows: 56 });
  assert.deepEqual(parkingEditor.mapSize, { cols: 40, rows: 32 });
  assert.deepEqual(plazaEditor.interiorGroundOverrides, {});
  assert.deepEqual(parkingEditor.interiorGroundOverrides, {});

  assert.deepEqual(
    [plaza.layout.revision, plaza.config.revision, plaza.config.assetRevision],
    [14, 14, 14],
  );
  assert.deepEqual(
    [parking.layout.revision, parking.config.revision, parking.config.assetRevision],
    [4, 4, 4],
  );
  assert.equal(plaza.config.previewImage, "maps/plaza-farmacia/base-v14.png?rev=14");
  assert.equal(plaza.config.tiles[0].image, "maps/plaza-farmacia/base-v14.png?rev=14");
  assert.equal(parking.config.previewImage, "maps/parking-plaza-farmacia/base-v3.png?rev=4");
  assert.equal(parking.config.tiles[0].image, "maps/parking-plaza-farmacia/base-v3.png?rev=4");

  const plazaBase = decodePng(await readFile(path.join(ROOT, "maps/plaza-farmacia/base-v14.png")));
  const parkingBase = decodePng(await readFile(path.join(ROOT, "maps/parking-plaza-farmacia/base-v3.png")));
  assert.deepEqual(
    { width: plazaBase.width, height: plazaBase.height, channels: plazaBase.channels },
    { width: 1280, height: 1792, channels: 3 },
  );
  assert.deepEqual(
    { width: parkingBase.width, height: parkingBase.height, channels: parkingBase.channels },
    { width: 1280, height: 1024, channels: 4 },
  );

  const indexHtml = await readFile(path.join(ROOT, "index.html"), "utf8");
  assert.match(indexHtml, /maps\/plaza-farmacia\/editor-data\.js\?v=14/);
  assert.match(indexHtml, /maps\/plaza-farmacia\/map\.js\?v=14/);
  assert.match(indexHtml, /maps\/parking-plaza-farmacia\/editor-data\.js\?v=4/);
  assert.match(indexHtml, /maps\/parking-plaza-farmacia\/map\.js\?v=4/);
});

test("el fondo autoritativo v14 contiene todo el arte sin sprites superpuestos", async () => {
  const { GAME_MAP_REGISTRY } = await loadPlazaMap();
  const plaza = GAME_MAP_REGISTRY.get("plaza-farmacia");
  assert.deepEqual(Array.from(plaza.layout.worldAssets), []);
  assert.deepEqual(Array.from(plaza.config.worldAssets), []);
  assert.equal(plaza.layout.worldAssets, plaza.config.worldAssets);
  assert.deepEqual(Array.from(plaza.config.tiles, (tile) => ({ ...tile })), [{
    id: "r0-c0",
    col: 0,
    row: 0,
    x: 0,
    y: 0,
    w: 1280,
    h: 1792,
    image: "maps/plaza-farmacia/base-v14.png?rev=14",
  }]);

  const reference = decodePng(await readFile(path.join(
    ROOT,
    "assets/references/plaza-farmacia-final-authoritative.png",
  )));
  const originalWithSideDoor = decodePng(await readFile(path.join(
    ROOT,
    "assets/references/plaza-farmacia-final-authoritative-with-side-door-v1.png",
  )));
  const base = decodePng(await readFile(path.join(ROOT, "maps/plaza-farmacia/base-v14.png")));
  assert.deepEqual(
    { width: reference.width, height: reference.height, channels: reference.channels },
    { width: 1060, height: 1484, channels: 3 },
  );
  assert.deepEqual(
    { width: base.width, height: base.height, channels: base.channels },
    { width: 1280, height: 1792, channels: 3 },
  );
  assert.equal(reference.width * base.height, reference.height * base.width, "la base debe conservar la proporción 5:7");

  let cleanedPixels = 0;
  for (let y = 0; y < 835; y += 1) {
    for (let x = 932; x < 992; x += 1) {
      const targetOffset = (y * reference.width + x) * reference.channels;
      const sourceOffset = (y * originalWithSideDoor.width + x + 53) * originalWithSideDoor.channels;
      const originalOffset = (y * originalWithSideDoor.width + x) * originalWithSideDoor.channels;
      for (let channel = 0; channel < 3; channel += 1) {
        assert.equal(
          reference.pixels[targetOffset + channel],
          originalWithSideDoor.pixels[sourceOffset + channel],
          "el lateral retirado debe ser una continuación exacta de la acera",
        );
        if (reference.pixels[targetOffset + channel] !== originalWithSideDoor.pixels[originalOffset + channel]) {
          cleanedPixels += 1;
        }
      }
    }
  }
  assert.ok(cleanedPixels > 1000, "la puerta lateral azul y su pavimento beige deben desaparecer");

  const sampledColors = new Set();
  const sampleStep = Math.max(3, Math.floor(base.pixels.length / 4096 / 3) * 3);
  for (let offset = 0; offset + 2 < base.pixels.length; offset += sampleStep) {
    sampledColors.add(`${base.pixels[offset]},${base.pixels[offset + 1]},${base.pixels[offset + 2]}`);
  }
  assert.ok(sampledColors.size > 128, "el fondo v14 debe contener la composición visual completa");
});

test("la geometría v14 sigue la U, la carretera y las dos alas derruidas del fondo final", async () => {
  const { GAME_MAP_REGISTRY } = await loadPlazaMap();
  const plaza = GAME_MAP_REGISTRY.get("plaza-farmacia");
  assert.deepEqual(
    Array.from(plaza.config.buildingFootprints, (footprint) => ({ id: footprint.id, bounds: footprintBounds(footprint) })),
    [
      { id: "plaza-u-north-footprint", bounds: [144, 64, 1136, 288] },
      { id: "plaza-u-west-footprint", bounds: [144, 288, 320, 896] },
      { id: "plaza-u-east-footprint", bounds: [960, 288, 1136, 896] },
      { id: "abandoned-mall-west-footprint", bounds: [64, 1280, 544, 1760] },
      { id: "abandoned-mall-east-footprint", bounds: [768, 1280, 1216, 1760] },
    ],
  );
  const [north, west, east, ruinedWest, ruinedEast] = plaza.config.buildingFootprints;
  assert.deepEqual(Array.from(north.storefrontOrder), ["KEBAB", "LOCAL CERRADO", "BAR"]);
  assert.deepEqual(Array.from(west.storefrontOrder), ["CHINO", "LOCAL CERRADO", "MAR DE GAMBAS"]);
  assert.deepEqual(Array.from(east.storefrontOrder), ["FRUTERÍA", "LOCAL CERRADO", "FARMACIA"]);
  assert.deepEqual([north.storefrontFaces, west.storefrontFaces, east.storefrontFaces], [
    "south-courtyard", "east-courtyard", "west-courtyard",
  ]);
  assert.deepEqual(Array.from(north.facadeBand), [320, 224, 960, 288]);
  assert.deepEqual(Array.from(west.facadeBand), [288, 288, 320, 896]);
  assert.deepEqual(Array.from(east.facadeBand), [960, 288, 992, 896]);
  const intervals = (footprint) => Array.from(
    footprint.storefrontIntervals,
    ({ name, from, to }) => [name, from, to],
  );
  assert.deepEqual(intervals(north), [
    ["KEBAB", 320, 544], ["LOCAL CERRADO", 544, 768], ["BAR", 768, 960],
  ]);
  assert.deepEqual(intervals(west), [
    ["CHINO", 288, 480], ["LOCAL CERRADO", 480, 672], ["MAR DE GAMBAS", 672, 896],
  ]);
  assert.deepEqual(intervals(east), [
    ["FRUTERÍA", 288, 480],
    ["LOCAL CERRADO", 480, 672],
    ["FARMACIA", 672, 896],
  ]);
  assert.equal(east.pharmacyGlassFacadeFaces, "south-road");
  assert.ok(!plaza.config.buildingFootprints.some(
    (footprint) => footprint.id === "plaza-u-pharmacy-projection-footprint",
  ));

  assert.deepEqual([ruinedWest.kind, ruinedWest.wing, ruinedEast.kind, ruinedEast.wing], [
    "abandoned-building", "west", "abandoned-building", "east",
  ]);

  const expectedBlockedRects = [
    [5, 2, 34, 8], [5, 9, 9, 27], [30, 9, 34, 27],
    [18, 11, 21, 14], [11, 11, 15, 12], [12, 13, 15, 14], [24, 11, 28, 12],
    [24, 13, 28, 14], [12, 20, 13, 21], [26, 20, 27, 21], [11, 23, 13, 24],
    [26, 23, 28, 24], [11, 25, 14, 26], [25, 25, 28, 26], [10, 26, 10, 27],
    [29, 26, 29, 27], [14, 21, 15, 29], [24, 21, 25, 29], [2, 40, 16, 54],
    [24, 40, 37, 54], [17, 42, 18, 45], [21, 42, 23, 45],
  ];
  assert.deepEqual(Array.from(plaza.config.blockedRects, (rect) => Array.from(rect)), expectedBlockedRects);

  const road = plaza.layout.roads.find((candidate) => candidate.id === "plaza-two-way-road");
  assert.deepEqual({
    points: Array.from(road.points, (point) => Array.from(point)),
    width: road.width,
    surface: road.surface,
  }, {
    points: [[0, 1112], [1280, 1112]],
    width: 208,
    surface: "asphalt",
  });

  const driveway = plaza.layout.paths.find((candidate) => candidate.id === "plaza-garage-driveway");
  const crosswalk = plaza.layout.paths.find((candidate) => candidate.id === "plaza-crosswalk");
  assert.deepEqual(Array.from(driveway.points, (point) => Array.from(point)), [[640, 672], [640, 1008]]);
  assert.equal(driveway.width, 256);
  assert.equal(driveway.points[1][1], road.points[0][1] - road.width / 2);
  assert.deepEqual(Array.from(crosswalk.points, (point) => Array.from(point)), [[640, 1008], [640, 1216]]);
  assert.equal(crosswalk.width, 128);

  const paths = Object.fromEntries(Array.from(plaza.layout.paths, (candidate) => [
    candidate.id,
    {
      points: Array.from(candidate.points, (point) => Array.from(point)),
      width: candidate.width,
      surface: candidate.surface,
      walkable: candidate.walkable,
    },
  ]));
  assert.deepEqual(paths, {
    "plaza-left-sidewalk": {
      points: [[64, 96], [64, 992]], width: 64, surface: "sidewalk", walkable: true,
    },
    "plaza-right-sidewalk": {
      points: [[1216, 96], [1216, 992]], width: 64, surface: "sidewalk", walkable: true,
    },
    "plaza-crosswalk": {
      points: [[640, 1008], [640, 1216]], width: 128, surface: "sidewalk", walkable: true,
    },
    "plaza-garage-driveway": {
      points: [[640, 672], [640, 1008]], width: 256, surface: "asphalt", walkable: true,
    },
    "abandoned-entrance-axis": {
      points: [[640, 1216], [640, 1792]], width: 128, surface: "sidewalk", walkable: true,
    },
  });
  assert.deepEqual(Array.from(plaza.layout.sections, ({ id, x, y, w, h }) => ({ id, x, y, w, h })), [
    { id: "commercial-plaza", x: 0, y: 0, w: 1280, h: 1008 },
    { id: "two-way-road", x: 0, y: 1008, w: 1280, h: 208 },
    { id: "abandoned-site", x: 0, y: 1216, w: 1280, h: 576 },
  ]);

  const events = Object.fromEntries(Array.from(plaza.config.events, (event) => [event.id, event]));
  assert.deepEqual([events["plaza-farmacia-welcome"].col, events["plaza-farmacia-welcome"].row], [4, 30]);
  assert.deepEqual(
    [
      events["plaza-parking-ramp"].col,
      events["plaza-parking-ramp"].row,
      events["plaza-parking-ramp"].targetMap,
      events["plaza-parking-ramp"].targetX,
      events["plaza-parking-ramp"].targetY,
      events["plaza-parking-ramp"].targetDirection,
    ],
    [20, 29, "parking-plaza-farmacia", 640, 288, "down"],
  );
  assert.deepEqual([events["plaza-lightwell"].col, events["plaza-lightwell"].row], [20, 13]);
  assert.deepEqual([events["abandoned-mall-warning"].col, events["abandoned-mall-warning"].row], [20, 42]);
  for (const [id, col] of [
    ["plaza-farmacia-return-san-pablo-west", 1],
    ["plaza-farmacia-return-san-pablo-east", 38],
  ]) {
    const event = events[id];
    assert.deepEqual(
      [event.col, event.row, event.type, event.trigger, event.targetMap, event.targetX, event.targetY],
      [col, 26, "transition", "step", "san-pablo", 1008, 576],
    );
  }
});

test("el parking v4 es una planta conectada, legible y laberíntica", async () => {
  const { GAME_MAP_REGISTRY } = await loadPlazaMap();
  const plaza = GAME_MAP_REGISTRY.get("plaza-farmacia");
  const parking = GAME_MAP_REGISTRY.get("parking-plaza-farmacia");
  assert.deepEqual({ width: parking.config.width, height: parking.config.height }, { width: 1280, height: 1024 });

  const expectedBlockedRects = [
    [5, 4, 6, 12], [5, 16, 6, 27], [11, 8, 12, 21], [11, 25, 12, 29],
    [15, 4, 16, 10], [23, 4, 24, 12], [23, 20, 24, 28], [29, 7, 30, 19],
    [29, 23, 30, 29], [35, 4, 36, 14], [35, 18, 36, 27], [6, 12, 11, 13],
    [12, 21, 16, 22], [24, 19, 30, 20], [30, 14, 36, 15], [6, 27, 12, 28],
    [16, 13, 16, 18], [25, 13, 26, 17], [17, 24, 21, 25], [25, 8, 28, 9],
    [7, 18, 10, 19], [31, 24, 34, 25], [2, 8, 4, 9],
  ];
  assert.deepEqual(Array.from(parking.config.blockedRects, (rect) => Array.from(rect)), expectedBlockedRects);

  const walls = parking.config.worldAssets.find((asset) => asset.id === "parking-walls-v9");
  assert.deepEqual([walls.x, walls.y, walls.w, walls.h, walls.depthSliceHeight], [640, 1024, 1280, 1024, 32]);
  assert.equal(walls.solid, false);
  assert.equal(walls.castShadow, false);
  assert.deepEqual(Array.from(walls.colliders), []);
  await assertTransparentPng(parking.layout.assetCatalog.parkingWalls.src, 1280, 1024);

  const lightwell = parking.config.worldAssets.find((asset) => asset.id === "parking-lightwell-below");
  assert.deepEqual([lightwell.w, lightwell.h], [192, 192]);
  assert.equal(lightwell.solid, false);
  assert.equal(parking.config.worldAssets.filter((asset) => asset.sprite === "parkingClutterA").length, 1);
  assert.equal(parking.config.worldAssets.filter((asset) => asset.sprite === "parkingClutterB").length, 1);
  assert.equal(parking.config.worldAssets.filter((asset) => asset.sprite === "parkingCarWhite").length, 1);
  assert.equal(parking.config.worldAssets.filter((asset) => asset.sprite === "parkingCarBlue").length, 1);
  assert.equal(parking.config.worldAssets.filter((asset) => asset.sprite.startsWith("parkingWeb")).length, 8);

  const start = [Math.floor(parking.config.spawn.x / 32), Math.floor(parking.config.spawn.y / 32)];
  const graph = reachableTiles(parking.config, start);
  const allFree = [];
  for (let row = 1; row <= 30; row += 1) {
    for (let col = 1; col <= 38; col += 1) if (graph.isFree(col, row)) allFree.push(`${col},${row}`);
  }
  assert.equal(graph.seen.size, allFree.length, "todo el parking transitable debe formar un único componente");
  assert.ok(allFree.length < 850, "los tabiques deben cerrar suficiente superficie para que se lea como laberinto");
  for (const eventId of ["parking-return-plaza", "parking-first-web", "parking-lightwell"]) {
    const event = parking.config.events.find((candidate) => candidate.id === eventId);
    assert.ok(graph.seen.has(`${event.col},${event.row}`), `${eventId} debe ser accesible`);
  }

  const plazaRamp = plaza.config.events.find((event) => event.id === "plaza-parking-ramp");
  const parkingReturn = parking.config.events.find((event) => event.id === "parking-return-plaza");
  assert.equal(plazaRamp.targetMap, "parking-plaza-farmacia");
  assert.deepEqual([plazaRamp.targetX, plazaRamp.targetY], [parking.config.spawn.x, parking.config.spawn.y]);
  assert.equal(parkingReturn.targetMap, "plaza-farmacia");
  assert.deepEqual([parkingReturn.targetX, parkingReturn.targetY, parkingReturn.targetDirection], [640, 944, "down"]);
});
