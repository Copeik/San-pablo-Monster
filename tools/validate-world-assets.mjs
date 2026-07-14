import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { window: {} };
const layoutSource = fs.readFileSync(path.join(repoRoot, "map-layout.js"), "utf8");
const source = fs.readFileSync(path.join(repoRoot, "map-data.js"), "utf8");
const gameSource = fs.readFileSync(path.join(repoRoot, "script.js"), "utf8");
vm.runInNewContext(layoutSource, sandbox, { filename: "map-layout.js" });
vm.runInNewContext(source, sandbox, { filename: "map-data.js" });
const config = sandbox.window.CITY_MAP_CONFIG;
const worldObjectsStart = gameSource.indexOf("const worldObjects =");
const worldObjectsEnd = gameSource.indexOf("const INVENTORY_ITEMS", worldObjectsStart);
const objectSandbox = { result: [] };
if (worldObjectsStart >= 0 && worldObjectsEnd > worldObjectsStart) {
  vm.runInNewContext(`${gameSource.slice(worldObjectsStart, worldObjectsEnd)}\nresult = worldObjects;`, objectSandbox);
}
const cityPrismShards = objectSandbox.result.filter((object) => object.dimension === "san_pablo" && object.crystal);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const tileSize = Number(config.tileSize);
const playerRadius = 9;
const columns = Math.ceil(config.width / tileSize);
const rows = Math.ceil(config.height / tileSize);

function pngDimensions(file) {
  const buffer = fs.readFileSync(file);
  check(buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG", `${file} no es un PNG válido`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function colliderRects(asset) {
  return (asset.colliders || []).map(([x, y, w, h]) => ({ x: asset.x + x, y: asset.y + y, w, h }));
}

function circleIntersectsRect(x, y, radius, rect) {
  const nearestX = clamp(x, rect.x, rect.x + rect.w);
  const nearestY = clamp(y, rect.y, rect.y + rect.h);
  return ((x - nearestX) ** 2) + ((y - nearestY) ** 2) <= radius ** 2;
}

function assetBlocks(x, y, radius = playerRadius) {
  return config.worldAssets.some((asset) => asset.solid !== false
    && colliderRects(asset).some((rect) => circleIntersectsRect(x, y, radius, rect)));
}

const defaultTiles = new Map();
const tileKey = (col, row) => `${col},${row}`;
function setRect(type, [startCol, startRow, endCol, endRow]) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) defaultTiles.set(tileKey(col, row), type);
  }
}
function setSegment(type, [x1, y1, x2, y2, width]) {
  const minCol = Math.max(0, Math.floor((Math.min(x1, x2) - width / 2) / tileSize));
  const maxCol = Math.min(columns - 1, Math.ceil((Math.max(x1, x2) + width / 2) / tileSize));
  const minRow = Math.max(0, Math.floor((Math.min(y1, y2) - width / 2) / tileSize));
  const maxRow = Math.min(rows - 1, Math.ceil((Math.max(y1, y2) + width / 2) / tileSize));
  const dx = x2 - x1; const dy = y2 - y1; const lengthSquared = dx * dx + dy * dy || 1;
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const x = (col + 0.5) * tileSize; const y = (row + 0.5) * tileSize;
      const amount = clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
      if (Math.hypot(x - (x1 + dx * amount), y - (y1 + dy * amount)) <= width / 2) {
        defaultTiles.set(tileKey(col, row), type);
      }
    }
  }
}
(config.blockedRects || []).forEach((rect) => setRect("blocked", rect));
(config.walkableRects || []).forEach((rect) => setRect("walkable", rect));
(config.walkableSegments || []).forEach((segment) => setSegment("walkable", segment));
(config.encounterRects || []).forEach((rect) => setRect("encounter", rect));
(config.encounterTiles || []).forEach(([col, row]) => defaultTiles.set(tileKey(col, row), "encounter"));
(config.doors || []).forEach((door) => defaultTiles.set(tileKey(door.col, door.row), "door"));

function tileType(col, row) {
  if (col < 0 || row < 0 || col >= columns || row >= rows) return "blocked";
  return defaultTiles.get(tileKey(col, row)) || config.defaultTile;
}
function tileAtWorld(x, y) { return { col: Math.floor(x / tileSize), row: Math.floor(y / tileSize) }; }
function tilesAllow(x, y) {
  if (x < playerRadius || y < playerRadius || x > config.width - playerRadius || y > config.height - playerRadius) return false;
  return [[-playerRadius, -playerRadius], [playerRadius, -playerRadius], [-playerRadius, playerRadius], [playerRadius, playerRadius]]
    .every(([offsetX, offsetY]) => !["blocked", "door"].includes(tileType(
      Math.floor((x + offsetX) / tileSize), Math.floor((y + offsetY) / tileSize),
    )));
}
const canOccupy = (x, y) => tilesAllow(x, y) && !assetBlocks(x, y);

check(Array.isArray(config.worldAssets) && config.worldAssets.length > 0, "No hay worldAssets configurados");
const ids = new Set();
const spriteDimensions = new Map();
for (const asset of config.worldAssets) {
  check(asset.id && !ids.has(asset.id), `ID de asset ausente o duplicado: ${asset.id}`);
  ids.add(asset.id);
  check(["layout", "replacement"].includes(asset.placement), `${asset.id}: colocación desconocida ${asset.placement}`);
  check(config.assetSprites[asset.sprite], `${asset.id}: sprite desconocido ${asset.sprite}`);
  check(Number.isFinite(asset.x) && Number.isFinite(asset.y) && asset.w > 0 && asset.h > 0, `${asset.id}: geometría inválida`);
  check(Number.isInteger(asset.x) && Number.isInteger(asset.y), `${asset.id}: el ancla debe usar coordenadas enteras`);
  check(asset.x - asset.w / 2 >= 0 && asset.x + asset.w / 2 <= config.width && asset.y - asset.h >= 0 && asset.y <= config.height, `${asset.id}: imagen fuera del mundo`);
  if (asset.solid !== false) check(Array.isArray(asset.colliders) && asset.colliders.length > 0, `${asset.id}: asset sólido sin collider`);
  check(Number(asset.depthY) >= asset.y - asset.h && Number(asset.depthY) <= asset.y, `${asset.id}: depthY fuera del sprite`);
  for (const [x, y, w, h] of asset.colliders || []) {
    check(w > 0 && h > 0, `${asset.id}: collider sin área`);
    if (!Number(asset.rotation)) check(x >= -asset.w / 2 && x + w <= asset.w / 2 && y >= -asset.h && y + h <= 0, `${asset.id}: collider fuera de la imagen`);
  }

  const spritePath = path.join(repoRoot, config.assetSprites[asset.sprite].split("?")[0]);
  check(fs.existsSync(spritePath), `${asset.id}: no existe ${config.assetSprites[asset.sprite]}`);
  if (fs.existsSync(spritePath) && !spriteDimensions.has(asset.sprite)) spriteDimensions.set(asset.sprite, pngDimensions(spritePath));
  const dimensions = spriteDimensions.get(asset.sprite);
  if (dimensions) {
    check(dimensions.width >= asset.w && dimensions.height >= asset.h, `${asset.id}: la fuente no alcanza la resolución lógica de dibujo`);
    const sourceRatio = dimensions.width / dimensions.height;
    const drawRatio = asset.w / asset.h;
    check(Math.abs(sourceRatio - drawRatio) / sourceRatio <= 0.15, `${asset.id}: deformación de aspecto superior al 15 %`);
  }

  for (const rect of colliderRects(asset)) {
    check(assetBlocks(rect.x + rect.w / 2, rect.y + rect.h / 2, 0), `${asset.id}: el centro del collider no bloquea`);
  }

  const hasDoor = Array.isArray(asset.door) && asset.door.length === 2;
  const hasApproach = Array.isArray(asset.approach) && asset.approach.length === 3;
  check(hasDoor === hasApproach, `${asset.id}: puerta y aproximación deben declararse juntas`);
  if (asset.door && asset.approach) {
    const [col, row] = asset.door;
    const [approachX, approachY, direction] = asset.approach;
    const door = config.doors.find((candidate) => candidate.col === col && candidate.row === row);
    check(Boolean(door), `${asset.id}: puerta C${col},F${row} no configurada`);
    check(tileType(col, row) === "door", `${asset.id}: C${col},F${row} no está marcada como puerta`);
    check(!canOccupy((col + 0.5) * tileSize, (row + 0.5) * tileSize), `${asset.id}: la puerta se puede atravesar`);
    check(canOccupy(approachX, approachY), `${asset.id}: aproximación frontal bloqueada`);
    const offsets = { up: [0, -24], down: [0, 24], left: [-24, 0], right: [24, 0] };
    const [offsetX, offsetY] = offsets[direction] || [NaN, NaN];
    const targetTile = tileAtWorld(approachX + offsetX, approachY + offsetY);
    check(targetTile.col === col && targetTile.row === row, `${asset.id}: la aproximación no apunta a su puerta`);
  }
}

const blockers = config.worldAssets.filter((asset) => asset.kind === "blocker");
check(blockers.length >= 4, "Faltan barreras visibles en las continuaciones cerradas");
for (const blocker of blockers) {
  check(blocker.solid !== false && (blocker.colliders || []).length > 0, `${blocker.id}: la barrera no bloquea físicamente`);
  check(blocker.interaction?.prompt === "Examinar obstaculo", `${blocker.id}: prompt de obstáculo ausente`);
  check((blocker.interaction?.lines || []).includes("Parece que necesito algo para avanzar"), `${blocker.id}: falta el mensaje de avance`);
}

const navigationMaskPath = path.join(repoRoot, config.navigationMask?.image || "");
check(Boolean(config.navigationMask?.image) && fs.existsSync(navigationMaskPath), "Falta la máscara semántica de navegación");
if (fs.existsSync(navigationMaskPath)) {
  const dimensions = pngDimensions(navigationMaskPath);
  const cellSize = Number(config.navigationMask.cellSize);
  check(dimensions.width === Math.ceil(config.width / cellSize) && dimensions.height === Math.ceil(config.height / cellSize),
    `Máscara de navegación inesperada: ${dimensions.width}x${dimensions.height}`);
}

const encounterAreas = config.encounterAreas || [];
const encounterTiles = config.encounterTiles || [];
check(encounterAreas.length === 6, `Se esperaban 6 zonas de captura y hay ${encounterAreas.length}`);
check(encounterTiles.length > 0, "Las zonas de captura no generan casillas de encuentro");
const encounterGrassPath = path.join(repoRoot, config.encounterGrass?.image || "");
check(Boolean(config.encounterGrass?.image) && fs.existsSync(encounterGrassPath), "Falta el spritesheet de hierba alta");
if (fs.existsSync(encounterGrassPath)) {
  const dimensions = pngDimensions(encounterGrassPath);
  const frameSize = Number(config.encounterGrass.frameSize);
  const frameCount = Number(config.encounterGrass.frames);
  check(dimensions.width === frameSize * frameCount && dimensions.height === frameSize,
    `Spritesheet de hierba inesperado: ${dimensions.width}x${dimensions.height}`);
}
for (const area of encounterAreas) {
  const areaTiles = encounterTiles.filter(([col, row]) => {
    const x = (col + .5) * tileSize; const y = (row + .5) * tileSize;
    if (area.shape === "polygon") {
      let inside = false;
      const points = area.points || [];
      for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const [x1, y1] = points[index]; const [x2, y2] = points[previous];
        if (((y1 > y) !== (y2 > y)) && x < ((x2 - x1) * (y - y1)) / ((y2 - y1) || Number.EPSILON) + x1) inside = !inside;
      }
      return inside;
    }
    return x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h;
  });
  check(area.id && area.name, "Zona de captura sin id o nombre");
  check(areaTiles.length > 0, `${area.id}: no contiene casillas de encuentro`);
}

check(canOccupy(config.spawn.x, config.spawn.y), "El punto de aparición está bloqueado");

for (const [x, y, label] of config.blockedProbes || []) {
  check(!canOccupy(x, y), `La regresión ${label} (${x},${y}) ha quedado transitable`);
}

/* La capa de acabado es puramente visual, pero debe seguir registrada sobre
   calles y accesos reales para no comunicar recorridos falsos al jugador. */
const streetIds = new Set((config.streets || []).map((street) => street.id));
const streetPolish = config.streetPolish || {};
const streetPolishAccessPaths = Array.isArray(streetPolish.accessPaths) ? streetPolish.accessPaths : [];
const streetPolishCrossings = Array.isArray(streetPolish.crossings) ? streetPolish.crossings : [];
const polishIds = new Set();
check(Number(streetPolish.revision) > 0, "streetPolish no declara una revisión válida");
for (const streetId of streetPolish.edgeStreetIds || []) {
  check(streetIds.has(streetId), `streetPolish referencia una calle desconocida: ${streetId}`);
}
for (const access of streetPolishAccessPaths) {
  check(access.id && !polishIds.has(access.id), `Acceso visual ausente o duplicado: ${access.id}`);
  polishIds.add(access.id);
  check(Number(access.width) >= 12 && Number(access.width) <= tileSize, `${access.id}: anchura visual fuera de rango`);
  check(Array.isArray(access.points) && access.points.length >= 2, `${access.id}: se necesitan al menos dos puntos`);
  for (const point of access.points || []) {
    check(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite), `${access.id}: punto inválido`);
    if (Array.isArray(point) && point.length === 2) {
      check(point[0] >= 0 && point[0] <= config.width && point[1] >= 0 && point[1] <= config.height, `${access.id}: punto fuera del mundo`);
    }
  }
  const door = (config.doors || []).find((candidate) => candidate.col === access.door?.[0] && candidate.row === access.door?.[1]);
  check(Boolean(door), `${access.id}: no enlaza una puerta configurada`);
  if (door && access.points?.[0]) {
    const doorX = (door.col + 0.5) * tileSize;
    const doorY = (door.row + 0.5) * tileSize;
    check(Math.hypot(access.points[0][0] - doorX, access.points[0][1] - doorY) <= tileSize, `${access.id}: no comienza en su puerta`);
  }
}
for (const crossing of streetPolishCrossings) {
  check(crossing.id && !polishIds.has(crossing.id), `Cruce visual ausente o duplicado: ${crossing.id}`);
  polishIds.add(crossing.id);
  check([crossing.x, crossing.y, crossing.length, crossing.width, crossing.stripes].every(Number.isFinite), `${crossing.id}: geometría inválida`);
  check(canOccupy(crossing.x, crossing.y), `${crossing.id}: el cruce no está sobre la red transitable`);
}

/* La máscara semántica resta mobiliario y fachadas del ancho visual; lo que
   nunca puede quedar obstruido es la línea central útil de una calle. Las
   barreras son la excepción intencional y se validan por separado. */
for (const [index, [x1, y1, x2, y2]] of config.walkableSegments.entries()) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(length / 16));
  const offenders = new Set();
  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps;
    const x = x1 + (x2 - x1) * amount; const y = y1 + (y2 - y1) * amount;
    for (const asset of config.worldAssets) {
      if (asset.kind === "blocker") continue;
      if (colliderRects(asset).some((rect) => circleIntersectsRect(x, y, playerRadius, rect))) offenders.add(asset.id);
    }
  }
  check(offenders.size === 0, `Corredor ${index}: la línea central choca con ${[...offenders].join(", ")}`);
}

/* Conectividad real desde el spawn con puertas sólidas y colliders activos. */
const spawnTile = tileAtWorld(config.spawn.x, config.spawn.y);
const queue = [spawnTile];
const reachable = new Set([tileKey(spawnTile.col, spawnTile.row)]);
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const current = queue[cursor];
  for (const [deltaCol, deltaRow] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const col = current.col + deltaCol; const row = current.row + deltaRow;
    const key = tileKey(col, row);
    if (reachable.has(key)) continue;
    const x = (col + 0.5) * tileSize; const y = (row + 0.5) * tileSize;
    if (!canOccupy(x, y)) continue;
    reachable.add(key); queue.push({ col, row });
  }
}

for (const area of encounterAreas) {
  const reachableAreaTiles = encounterTiles.filter(([col, row]) => {
    const x = (col + .5) * tileSize; const y = (row + .5) * tileSize;
    return reachable.has(tileKey(col, row)) && canOccupy(x, y) && (
      area.shape === "polygon"
        ? (() => {
          let inside = false; const points = area.points || [];
          for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
            const [x1, y1] = points[index]; const [x2, y2] = points[previous];
            if (((y1 > y) !== (y2 > y)) && x < ((x2 - x1) * (y - y1)) / ((y2 - y1) || Number.EPSILON) + x1) inside = !inside;
          }
          return inside;
        })()
        : x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h
    );
  });
  check(reachableAreaTiles.length > 0, `${area.id}: la zona de captura no es alcanzable desde el spawn`);
}

check(cityPrismShards.length === 3, `Se esperaban 3 Fragmentos Prisma en San Pablo y hay ${cityPrismShards.length}`);
for (const shard of cityPrismShards) {
  const approaches = [...reachable]
    .map((key) => key.split(",").map(Number))
    .map(([col, row]) => ({ col, row, x: (col + .5) * tileSize, y: (row + .5) * tileSize }))
    .filter((point) => canOccupy(point.x, point.y) && Math.hypot(point.x - shard.x, point.y - shard.y) < 38);
  if (!approaches.length) {
    const nearest = [...reachable]
      .map((key) => key.split(",").map(Number))
      .map(([col, row]) => ({ col, row, x: (col + .5) * tileSize, y: (row + .5) * tileSize }))
      .sort((a, b) => Math.hypot(a.x - shard.x, a.y - shard.y) - Math.hypot(b.x - shard.x, b.y - shard.y))[0];
    const suggestion = nearest ? `; punto abierto cercano: ${nearest.x},${nearest.y}` : "";
    check(false, `${shard.id}: no puede recogerse desde una casilla alcanzable${suggestion}`);
  }
}

for (const access of streetPolishAccessPaths) {
  const endpoint = access.points?.[access.points.length - 1];
  if (!endpoint) continue;
  const endTile = tileAtWorld(endpoint[0], endpoint[1]);
  check(canOccupy(endpoint[0], endpoint[1]), `${access.id}: termina en una posición bloqueada`);
  check(reachable.has(tileKey(endTile.col, endTile.row)), `${access.id}: termina fuera de la red alcanzable`);
}

const doorApproachDirections = [
  { deltaCol: 0, deltaRow: 1, direction: "up" },
  { deltaCol: 0, deltaRow: -1, direction: "down" },
  { deltaCol: 1, deltaRow: 0, direction: "left" },
  { deltaCol: -1, deltaRow: 0, direction: "right" },
];
let reachableDoors = 0;
for (const door of config.doors) {
  const approachDiagnostics = doorApproachDirections.map(({ deltaCol, deltaRow, direction }) => {
    const col = door.col + deltaCol; const row = door.row + deltaRow;
    const x = (col + 0.5) * tileSize; const y = (row + 0.5) * tileSize;
    const offsets = { up: [0, -24], down: [0, 24], left: [-24, 0], right: [24, 0] };
    const [offsetX, offsetY] = offsets[direction];
    const target = tileAtWorld(x + offsetX, y + offsetY);
    const open = canOccupy(x, y);
    const connected = reachable.has(tileKey(col, row));
    const pointsToDoor = target.col === door.col && target.row === door.row;
    return { col, row, direction, open, connected, pointsToDoor, valid: open && connected && pointsToDoor };
  });
  const approaches = approachDiagnostics.filter((candidate) => candidate.valid);
  check(approaches.length > 0, `Puerta ${door.label} C${door.col},F${door.row} no tiene aproximación alcanzable`);
  if (!approaches.length) console.error(`  candidatos: ${JSON.stringify(approachDiagnostics)}`);
  if (approaches.length) reachableDoors += 1;
}

if (failures.length) {
  console.error(`Validación fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`OK: ${config.worldAssets.length} colocaciones, ${spriteDimensions.size} sprites, ${config.walkableSegments.length} corredores completos, ${encounterAreas.length} zonas de captura y ${reachableDoors}/${config.doors.length} puertas alcanzables.`);
}
