import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");

async function loadCiudadAzahar() {
  const sandbox = { console };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const filename of [
    "map-registry.js",
    "maps/ciudad-azahar/editor-data.js",
    "maps/ciudad-azahar/layout.js",
    "maps/ciudad-azahar/map.js",
  ]) {
    vm.runInContext(await readFile(path.join(ROOT, filename), "utf8"), context, { filename });
  }
  return sandbox.GAME_MAP_REGISTRY.get("ciudad-azahar");
}

function occupancyModel(config) {
  const defaultTiles = new Map();
  const key = (col, row) => `${col},${row}`;
  const setRect = (type, [startCol, startRow, endCol, endRow]) => {
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) defaultTiles.set(key(col, row), type);
    }
  };
  const setSegment = (type, [x1, y1, x2, y2, width]) => {
    const size = config.tileSize;
    const minCol = Math.max(0, Math.floor((Math.min(x1, x2) - width / 2) / size));
    const maxCol = Math.min(Math.ceil(config.width / size) - 1, Math.ceil((Math.max(x1, x2) + width / 2) / size));
    const minRow = Math.max(0, Math.floor((Math.min(y1, y2) - width / 2) / size));
    const maxRow = Math.min(Math.ceil(config.height / size) - 1, Math.ceil((Math.max(y1, y2) + width / 2) / size));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const x = (col + 0.5) * size;
        const y = (row + 0.5) * size;
        const amount = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
        if (Math.hypot(x - (x1 + dx * amount), y - (y1 + dy * amount)) <= width / 2) {
          defaultTiles.set(key(col, row), type);
        }
      }
    }
  };

  config.walkableRects.forEach((rect) => setRect("walkable", rect));
  config.walkableSegments.forEach((segment) => setSegment("walkable", segment));
  config.blockedRects.forEach((rect) => setRect("blocked", rect));
  config.encounterTiles.forEach(([col, row]) => defaultTiles.set(key(col, row), "encounter"));
  config.events.forEach((event) => defaultTiles.set(key(event.col, event.row), "event"));
  config.entrances.forEach((entrance) => defaultTiles.set(key(entrance.col, entrance.row), "door"));

  const tileType = (col, row) => {
    if (col < 0 || row < 0 || col >= Math.ceil(config.width / config.tileSize) || row >= Math.ceil(config.height / config.tileSize)) return "blocked";
    return defaultTiles.get(key(col, row)) || config.defaultTile;
  };
  const circleIntersectsRect = (x, y, radius, rect) => {
    const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
  };
  const segmentDistance = (x, y, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    const amount = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
    return Math.hypot(x - (x1 + dx * amount), y - (y1 + dy * amount));
  };
  const assetRects = config.worldAssets.flatMap((asset) => asset.solid === false ? [] : asset.colliders.map((collider) => ({
    id: asset.id,
    x: Number(asset.x) + Number(collider[0]),
    y: Number(asset.y) + Number(collider[1]),
    w: Number(collider[2]),
    h: Number(collider[3]),
  })));
  const barriers = config.barrierSegments.filter((barrier) => barrier.solid !== false);

  const canOccupy = (x, y) => {
    const radius = 9;
    if (x < radius || y < radius || x > config.width - radius || y > config.height - radius) return false;
    const samples = [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]];
    if (samples.some(([offsetX, offsetY]) => tileType(
      Math.floor((x + offsetX) / config.tileSize),
      Math.floor((y + offsetY) / config.tileSize),
    ) === "blocked")) return false;
    if (assetRects.some((rect) => circleIntersectsRect(x, y, radius, rect))) return false;
    if (barriers.some((barrier) => barrier.points.slice(1).some((point, index) => segmentDistance(
      x, y,
      barrier.points[index][0], barrier.points[index][1],
      point[0], point[1],
    ) <= radius + Math.max(1.5, Number(barrier.width) || 3) / 2))) return false;
    return true;
  };

  return { assetRects, canOccupy, tileType };
}

function reachablePoints(config, canOccupy, step = 16) {
  const snap = (value) => Math.round(value / step) * step;
  const start = [snap(config.spawn.x), snap(config.spawn.y)];
  const queue = [start];
  const visited = new Set([start.join(",")]);
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nextX = x + dx;
      const nextY = y + dy;
      const nextKey = `${nextX},${nextY}`;
      if (visited.has(nextKey) || !canOccupy(nextX, nextY)) continue;
      visited.add(nextKey);
      queue.push([nextX, nextY]);
    }
  }
  return { snap, visited };
}

test("Ciudad Azahar se registra como paquete aislado con artefactos propios", async () => {
  const map = await loadCiudadAzahar();
  assert.ok(map);
  assert.equal(map.config.id, "ciudad-azahar");
  assert.deepEqual({ width: map.config.width, height: map.config.height }, { width: 2560, height: 2304 });
  assert.equal(map.editorDataPath, "maps/ciudad-azahar/editor-data.js");
  assert.equal(map.config.tiles.length, 25);
  assert.equal(map.config.worldAssets.length >= 100, true);
  assert.equal(map.config.assetSprites.fountain, "assets/generated/ciudad-azahar/runtime/fountain-civic.png");

  for (const filename of [
    "assets/generated/ciudad-azahar/runtime/fountain-civic.png",
    "assets/maps/ciudad-azahar-base-hd.webp",
    "assets/maps/ciudad-azahar-preview.webp",
    "assets/maps/ciudad-azahar-navigation.png",
    "assets/maps/ciudad-azahar-walkability.png",
  ]) await access(path.join(ROOT, filename));
  const chunks = (await readdir(path.join(ROOT, "assets/maps/ciudad-azahar-chunks-2x")))
    .filter((filename) => /^ciudad-azahar-r\d+-c\d+\.webp$/.test(filename));
  assert.equal(chunks.length, 25);
});

test("aparición, ronda, plaza, campo y parques pertenecen a una sola red transitable", async () => {
  const { config } = await loadCiudadAzahar();
  const { canOccupy } = occupancyModel(config);
  assert.equal(canOccupy(config.spawn.x, config.spawn.y), true, "el spawn debe admitir el círculo del jugador");
  const { snap, visited } = reachablePoints(config, canOccupy);
  assert.equal(visited.size > 10000, true, "la red transitable no debe reducirse a un corredor aislado");
  for (const [x, y, label] of config.openProbes) {
    assert.equal(canOccupy(x, y), true, `${label} debe estar libre`);
    assert.equal(visited.has(`${snap(x)},${snap(y)}`), true, `${label} debe ser alcanzable desde el spawn`);
  }
});

test("edificios, árboles, farolas, bancos, fuente y vallas bloquean al protagonista", async () => {
  const { config } = await loadCiudadAzahar();
  const { assetRects, canOccupy } = occupancyModel(config);
  assert.equal(assetRects.length, config.worldAssets.length, "cada asset visible debe aportar un collider");
  for (const [x, y, label] of config.blockedProbes) {
    assert.equal(canOccupy(x, y), false, `${label} debe bloquear`);
  }
  for (const rect of assetRects) {
    assert.equal(canOccupy(rect.x + rect.w / 2, rect.y + rect.h / 2), false, `collider de ${rect.id}`);
  }
});

test("la auditoría compilada confirma máscara precisa y todas las sondas bloqueadas", async () => {
  const report = JSON.parse(await readFile(path.join(ROOT, "assets/maps/ciudad-azahar-report.json"), "utf8"));
  assert.deepEqual(report.dimensions, {
    density: 2,
    logicalHeight: 2304,
    logicalWidth: 2560,
    pixelHeight: 4608,
    pixelWidth: 5120,
    tileSize: 32,
  });
  assert.deepEqual(report.walkability.navigationMask, { cellSize: 8, columns: 320, rows: 288 });
  assert.equal(report.walkability.blockedProbeFailures, 0);
  assert.equal(report.geometry.counts.assetColliders, 155);
  assert.equal(report.geometry.counts.solidBarrierSegments, 5);
});

