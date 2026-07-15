import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const finitePoint = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
const normalize = (value) => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const localAssetPath = (source) => path.join(repoRoot, String(source || "").split(/[?#]/, 1)[0]);
const sha256File = (filepath) => crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest("hex");

function loadMapContract() {
  const sandbox = { window: {} };
  for (const filename of ["map-geography.js", "map-layout.js", "map-data.js"]) {
    const filepath = path.join(repoRoot, filename);
    if (!fs.existsSync(filepath)) throw new Error(`Falta ${filename}; genera primero la geografía GIS.`);
    vm.runInNewContext(fs.readFileSync(filepath, "utf8"), sandbox, { filename });
  }
  return {
    geography: sandbox.window.SAN_PABLO_GEOGRAPHY,
    layout: sandbox.window.CITY_MAP_LAYOUT,
    config: sandbox.window.CITY_MAP_CONFIG,
  };
}

let geography;
let layout;
let config;
try {
  ({ geography, layout, config } = loadMapContract());
} catch (error) {
  console.error(`Validación no ejecutable: ${error.message}`);
  process.exit(1);
}

check(Boolean(geography), "map-geography.js no publica SAN_PABLO_GEOGRAPHY");
check(Boolean(layout), "map-layout.js no publica CITY_MAP_LAYOUT");
check(Boolean(config), "map-data.js no publica CITY_MAP_CONFIG");
if (!geography || !layout || !config) {
  console.error(`Validación fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const EXPECTED_WIDTH = 2048;
const EXPECTED_HEIGHT = 4096;
const EXPECTED_CHUNK_SIZE = 512;
const EXPECTED_CHUNK_COLUMNS = 4;
const EXPECTED_CHUNK_ROWS = 8;
const EXPECTED_NAVIGATION_CELL = 8;
const EXPECTED_NAVIGATION_WIDTH = 256;
const EXPECTED_NAVIGATION_HEIGHT = 512;
const playerRadius = 9;
const tileSize = Number(config.tileSize);
const columns = Math.ceil(config.width / tileSize);
const rows = Math.ceil(config.height / tileSize);
const tileKey = (col, row) => `${col},${row}`;
const tileAtWorld = (x, y) => ({ col: Math.floor(x / tileSize), row: Math.floor(y / tileSize) });

function pngDimensions(filepath) {
  const buffer = fs.readFileSync(filepath);
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${filepath} no es un PNG válido`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function webpDimensions(filepath) {
  const buffer = fs.readFileSync(filepath);
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`${filepath} no es un WebP válido`);
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) break;
    if (type === "VP8X" && size >= 10) {
      return {
        width: 1 + buffer.readUIntLE(start + 4, 3),
        height: 1 + buffer.readUIntLE(start + 7, 3),
      };
    }
    if (type === "VP8L" && size >= 5 && buffer[start] === 0x2f) {
      return {
        width: 1 + buffer[start + 1] + ((buffer[start + 2] & 0x3f) << 8),
        height: 1 + (buffer[start + 2] >> 6) + (buffer[start + 3] << 2)
          + ((buffer[start + 4] & 0x0f) << 10),
      };
    }
    if (type === "VP8 " && size >= 10 && buffer[start + 3] === 0x9d
      && buffer[start + 4] === 0x01 && buffer[start + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(start + 6) & 0x3fff,
        height: buffer.readUInt16LE(start + 8) & 0x3fff,
      };
    }
    offset = start + size + (size % 2);
  }
  throw new Error(`No se pudieron leer las dimensiones de ${filepath}`);
}

function imageDimensions(filepath) {
  const extension = path.extname(filepath).toLowerCase();
  if (extension === ".png") return pngDimensions(filepath);
  if (extension === ".webp") return webpDimensions(filepath);
  throw new Error(`Formato de imagen no soportado en la auditoría: ${extension}`);
}

/* Decodificador PNG mínimo para la máscara L/8 generada por Pillow. No depende
   de paquetes del proyecto y permite contrastar la navegación compilada. */
function decodeGrayscalePng(filepath) {
  const buffer = fs.readFileSync(filepath);
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("firma PNG inválida");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 0 || interlace !== 0) {
    throw new Error(`se esperaba PNG L/8 no entrelazado y se obtuvo depth=${bitDepth}, type=${colorType}, interlace=${interlace}`);
  }
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width;
  const pixels = Buffer.alloc(width * height);
  let sourceOffset = 0;
  const paeth = (left, up, upperLeft) => {
    const prediction = left + up - upperLeft;
    const leftDistance = Math.abs(prediction - left);
    const upDistance = Math.abs(prediction - up);
    const diagonalDistance = Math.abs(prediction - upperLeft);
    return leftDistance <= upDistance && leftDistance <= diagonalDistance ? left
      : (upDistance <= diagonalDistance ? up : upperLeft);
  };
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    for (let column = 0; column < width; column += 1) {
      const raw = inflated[sourceOffset + column];
      const index = row * stride + column;
      const left = column ? pixels[index - 1] : 0;
      const up = row ? pixels[index - stride] : 0;
      const upperLeft = row && column ? pixels[index - stride - 1] : 0;
      let reconstructed;
      if (filter === 0) reconstructed = raw;
      else if (filter === 1) reconstructed = raw + left;
      else if (filter === 2) reconstructed = raw + up;
      else if (filter === 3) reconstructed = raw + Math.floor((left + up) / 2);
      else if (filter === 4) reconstructed = raw + paeth(left, up, upperLeft);
      else throw new Error(`filtro PNG desconocido ${filter}`);
      pixels[index] = reconstructed & 0xff;
    }
    sourceOffset += stride;
  }
  return { width, height, pixels };
}

function boundsOfPoints(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    left: Math.min(...xs), right: Math.max(...xs),
    top: Math.min(...ys), bottom: Math.max(...ys),
  };
}

function pointInRing(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[previous];
    if (((y1 > y) !== (y2 > y))
      && x < ((x2 - x1) * (y - y1)) / ((y2 - y1) || Number.EPSILON) + x1) inside = !inside;
  }
  return inside;
}

function pointInFeature(x, y, feature) {
  const exterior = feature.points || [];
  return exterior.length >= 3 && pointInRing(x, y, exterior)
    && !(feature.holes || []).some((hole) => pointInRing(x, y, hole));
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy || 1;
  const amount = clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
  return Math.hypot(x - (x1 + dx * amount), y - (y1 + dy * amount));
}

function circleTouchesRing(x, y, radius, points, closed = true) {
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % points.length;
    if (distanceToSegment(x, y, ...points[index], ...points[next]) <= radius) return true;
  }
  return false;
}

const solidBuildings = (config.buildingFootprints || [])
  .filter((feature) => feature.solid !== false && (feature.points || []).length >= 3)
  .map((feature) => ({ ...feature, bounds: boundsOfPoints(feature.points) }));
const solidBarriers = (config.barrierSegments || [])
  .filter((barrier) => barrier.solid !== false && (barrier.points || []).length >= 2)
  .map((barrier) => {
    const width = Math.max(1.5, Number(barrier.width) || 3);
    return { ...barrier, width, bounds: boundsOfPoints(barrier.points) };
  });

function featureBlocksCircle(feature, x, y, radius) {
  if (x + radius < feature.bounds.left || x - radius > feature.bounds.right
    || y + radius < feature.bounds.top || y - radius > feature.bounds.bottom) return false;
  if (pointInFeature(x, y, feature)) return true;
  return [feature.points, ...(feature.holes || [])]
    .some((ring) => circleTouchesRing(x, y, radius, ring, true));
}

function barrierBlocksCircle(barrier, x, y, radius) {
  const allowance = radius + barrier.width / 2;
  if (x + allowance < barrier.bounds.left || x - allowance > barrier.bounds.right
    || y + allowance < barrier.bounds.top || y - allowance > barrier.bounds.bottom) return false;
  return circleTouchesRing(x, y, allowance, barrier.points, false);
}

const STATIC_BUCKET_SIZE = 128;
const staticCollisionBuckets = new Map();
const addStaticRecord = (record) => {
  const padding = 12;
  const minCol = Math.floor((record.bounds.left - padding) / STATIC_BUCKET_SIZE);
  const maxCol = Math.floor((record.bounds.right + padding) / STATIC_BUCKET_SIZE);
  const minRow = Math.floor((record.bounds.top - padding) / STATIC_BUCKET_SIZE);
  const maxRow = Math.floor((record.bounds.bottom + padding) / STATIC_BUCKET_SIZE);
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const key = `${col},${row}`;
      if (!staticCollisionBuckets.has(key)) staticCollisionBuckets.set(key, []);
      staticCollisionBuckets.get(key).push(record);
    }
  }
};
solidBuildings.forEach((feature) => addStaticRecord({ type: "building", feature, bounds: feature.bounds }));
solidBarriers.forEach((feature) => addStaticRecord({ type: "barrier", feature, bounds: feature.bounds }));

function staticRecordsNear(x, y, radius) {
  const records = new Set();
  const minCol = Math.floor((x - radius) / STATIC_BUCKET_SIZE);
  const maxCol = Math.floor((x + radius) / STATIC_BUCKET_SIZE);
  const minRow = Math.floor((y - radius) / STATIC_BUCKET_SIZE);
  const maxRow = Math.floor((y + radius) / STATIC_BUCKET_SIZE);
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      (staticCollisionBuckets.get(`${col},${row}`) || []).forEach((record) => records.add(record));
    }
  }
  return records;
}

function geometryBlocks(x, y, radius = playerRadius) {
  return [...staticRecordsNear(x, y, radius)].some((record) => record.type === "building"
    ? featureBlocksCircle(record.feature, x, y, radius)
    : barrierBlocksCircle(record.feature, x, y, radius));
}

const defaultTiles = new Map();
function setTileRect(type, rect) {
  const [startCol, startRow, endCol, endRow] = rect;
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) defaultTiles.set(tileKey(col, row), type);
  }
}
(config.blockedRects || []).forEach((rect) => setTileRect("blocked", rect));
(config.walkableRects || []).forEach((rect) => setTileRect("walkable", rect));
(config.encounterRects || []).forEach((rect) => setTileRect("encounter", rect));
(config.encounterTiles || []).forEach(([col, row]) => defaultTiles.set(tileKey(col, row), "encounter"));
(config.doors || []).forEach((door) => defaultTiles.set(tileKey(door.col, door.row), "door"));

function tileType(col, row) {
  if (col < 0 || row < 0 || col >= columns || row >= rows) return "blocked";
  return defaultTiles.get(tileKey(col, row)) || config.defaultTile;
}

const navigationMaskPath = localAssetPath(config.navigationMask?.image);
let navigationMask = null;
check(Boolean(config.navigationMask?.image), "Falta la ruta de la máscara semántica de navegación");
check(fs.existsSync(navigationMaskPath), `Falta la máscara semántica ${config.navigationMask?.image || ""}`);
if (fs.existsSync(navigationMaskPath)) {
  try {
    navigationMask = decodeGrayscalePng(navigationMaskPath);
  } catch (error) {
    check(false, `No se pudo decodificar la máscara de navegación: ${error.message}`);
  }
}

function navigationAllows(x, y, radius = playerRadius) {
  if (!navigationMask) return true;
  const cellSize = Number(config.navigationMask.cellSize);
  const samples = [[0, 0]];
  if (radius > 0) {
    for (let index = 0; index < 12; index += 1) {
      const angle = Math.PI * 2 * index / 12;
      samples.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
  }
  return samples.every(([offsetX, offsetY]) => {
    const col = Math.floor((x + offsetX) / cellSize);
    const row = Math.floor((y + offsetY) / cellSize);
    return col >= 0 && row >= 0 && col < navigationMask.width && row < navigationMask.height
      && navigationMask.pixels[row * navigationMask.width + col] >= 128;
  });
}

function tilesAllow(x, y, radius = playerRadius) {
  if (x < radius || y < radius || x > config.width - radius || y > config.height - radius) return false;
  const samples = radius > 0
    ? [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]
    : [[0, 0]];
  return samples.every(([offsetX, offsetY]) => !["blocked", "door"].includes(tileType(
    Math.floor((x + offsetX) / tileSize), Math.floor((y + offsetY) / tileSize),
  )));
}

const canOccupy = (x, y, radius = playerRadius) => tilesAllow(x, y, radius)
  && !geometryBlocks(x, y, radius) && navigationAllows(x, y, radius);

/* Contrato de mundo y procedencia GIS. */
check(config.width === EXPECTED_WIDTH && config.height === EXPECTED_HEIGHT,
  `Dimensiones inesperadas: ${config.width}x${config.height}; se esperaba ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`);
check(layout.width === EXPECTED_WIDTH && layout.height === EXPECTED_HEIGHT,
  `El layout no mide ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`);
check(geography.width === EXPECTED_WIDTH && geography.height === EXPECTED_HEIGHT,
  `La geografía no mide ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`);
check(config.defaultTile === "walkable" && layout.openExceptSolids === true,
  "El mapa debe ser abierto salvo edificios, muros y vallas");
check(tileSize === 32, `tileSize inesperado: ${tileSize}`);

const sourceBuildingCount = geography.buildingFootprints?.length || 0;
const sourceBarrierCount = geography.barrierSegments?.length || 0;
const sourceTreeCount = (geography.trees?.length || 0) + (geography.palms?.length || 0);
check(sourceBuildingCount >= 250, `La fuente GIS solo contiene ${sourceBuildingCount} construcciones; se esperaban al menos 250`);
check(sourceBarrierCount >= 700, `La fuente GIS solo contiene ${sourceBarrierCount} barreras; se esperaban al menos 700`);
check(sourceTreeCount >= 700, `La fuente GIS solo contiene ${sourceTreeCount} árboles/palmeras; se esperaban al menos 700`);
check(solidBuildings.length > 0, "No hay huellas de edificio sólidas en el runtime");
check(solidBarriers.length >= 700, `El runtime solo conserva ${solidBarriers.length} barreras sólidas`);
check(config.mapMetadata?.counts?.buildings === solidBuildings.length,
  "metadata.counts.buildings no coincide con las huellas sólidas");
check(config.mapMetadata?.counts?.barriers === solidBarriers.length,
  "metadata.counts.barriers no coincide con las barreras sólidas");
check(config.mapMetadata?.counts?.trees === sourceTreeCount,
  "metadata.counts.trees no coincide con el inventario vegetal");

for (const [collectionName, collection, minimumPoints] of [
  ["buildingFootprints", config.buildingFootprints || [], 3],
  ["barrierSegments", config.barrierSegments || [], 2],
]) {
  const ids = new Set();
  for (const feature of collection) {
    check(feature.id && !ids.has(feature.id), `${collectionName}: id ausente o duplicado ${feature.id || "(vacío)"}`);
    ids.add(feature.id);
    check(Array.isArray(feature.points) && feature.points.length >= minimumPoints
      && feature.points.every(finitePoint), `${feature.id}: geometría GIS inválida`);
    for (const point of feature.points || []) {
      check(point[0] >= 0 && point[0] <= config.width && point[1] >= 0 && point[1] <= config.height,
        `${feature.id}: punto fuera del mundo`);
    }
  }
}

/* Ada y Jerusalén se comprueban desde los ejes, además de la metadata. */
const namedStreetMetrics = config.mapMetadata?.namedStreetMetrics || {};
const orientationText = normalize(config.mapMetadata?.orientation);
check(orientationText.includes("ada") && orientationText.includes("vertical")
  && orientationText.includes("jerusalen") && orientationText.includes("horizontal"),
"La metadata no documenta Ada vertical y Jerusalén horizontal");
const streetMetric = (pattern) => {
  const points = (geography.streetCenterlines || [])
    .filter((street) => pattern.test(normalize(street.name)))
    .flatMap((street) => street.points || []);
  if (points.length < 2) return null;
  const bounds = boundsOfPoints(points);
  return { horizontalSpan: bounds.right - bounds.left, verticalSpan: bounds.bottom - bounds.top };
};
const adaMetric = streetMetric(/(^|\s)ada($|\s)/);
const jerusalenMetric = streetMetric(/jerusalen/);
check(Boolean(adaMetric), "No se encontró el eje de Calle Ada");
check(Boolean(jerusalenMetric), "No se encontró el eje de Calle Jerusalén");
if (adaMetric) check(adaMetric.verticalSpan >= adaMetric.horizontalSpan * 3,
  `Calle Ada no es dominantemente vertical (${adaMetric.horizontalSpan.toFixed(1)}×${adaMetric.verticalSpan.toFixed(1)})`);
if (jerusalenMetric) check(jerusalenMetric.horizontalSpan >= jerusalenMetric.verticalSpan * 3,
  `Calle Jerusalén no es dominantemente horizontal (${jerusalenMetric.horizontalSpan.toFixed(1)}×${jerusalenMetric.verticalSpan.toFixed(1)})`);
if (namedStreetMetrics.ada && adaMetric) {
  check(Math.abs(namedStreetMetrics.ada.horizontalSpan - adaMetric.horizontalSpan) < 1
    && Math.abs(namedStreetMetrics.ada.verticalSpan - adaMetric.verticalSpan) < 1,
  "La métrica publicada de Ada no coincide con la geometría fuente");
}
if (namedStreetMetrics.jerusalen && jerusalenMetric) {
  check(Math.abs(namedStreetMetrics.jerusalen.horizontalSpan - jerusalenMetric.horizontalSpan) < 1
    && Math.abs(namedStreetMetrics.jerusalen.verticalSpan - jerusalenMetric.verticalSpan) < 1,
  "La métrica publicada de Jerusalén no coincide con la geometría fuente");
}

/* Assets: el arbolado municipal es decorativo y nunca crea paredes invisibles. */
check(Array.isArray(config.worldAssets) && config.worldAssets.length === sourceTreeCount,
  `Se esperaban ${sourceTreeCount} assets vegetales y hay ${config.worldAssets?.length || 0}`);
const assetIds = new Set();
const spriteDimensions = new Map();
for (const asset of config.worldAssets || []) {
  check(asset.id && !assetIds.has(asset.id), `ID de asset ausente o duplicado: ${asset.id || "(vacío)"}`);
  assetIds.add(asset.id);
  check(asset.kind === "tree", `${asset.id}: el inventario GIS debe materializarse como árbol`);
  check(asset.solid === false, `${asset.id}: un árbol no debe bloquear`);
  check(Array.isArray(asset.colliders) && asset.colliders.length === 0, `${asset.id}: árbol con collider inesperado`);
  check(asset.placement === "layout", `${asset.id}: colocación desconocida ${asset.placement}`);
  check(Number.isInteger(asset.x) && Number.isInteger(asset.y) && asset.w > 0 && asset.h > 0,
    `${asset.id}: geometría de dibujo inválida`);
  check(asset.x - asset.w / 2 >= 0 && asset.x + asset.w / 2 <= config.width
    && asset.y - asset.h >= 0 && asset.y <= config.height, `${asset.id}: imagen fuera del mundo`);
  check(Number(asset.depthY) >= asset.y - asset.h && Number(asset.depthY) <= asset.y,
    `${asset.id}: depthY fuera del sprite`);
  const spriteSource = config.assetSprites?.[asset.sprite];
  check(Boolean(spriteSource), `${asset.id}: sprite desconocido ${asset.sprite}`);
  if (!spriteSource) continue;
  const spritePath = localAssetPath(spriteSource);
  check(fs.existsSync(spritePath), `${asset.id}: no existe ${spriteSource}`);
  if (fs.existsSync(spritePath) && !spriteDimensions.has(asset.sprite)) {
    try { spriteDimensions.set(asset.sprite, imageDimensions(spritePath)); }
    catch (error) { check(false, error.message); }
  }
  const dimensions = spriteDimensions.get(asset.sprite);
  if (dimensions) check(dimensions.width >= asset.w && dimensions.height >= asset.h,
    `${asset.id}: el sprite fuente no alcanza su tamaño lógico`);
}

/* Texturas compiladas: retrato 1:2, base 2x y máscara 8 px. */
check(config.sourceWidth === EXPECTED_WIDTH * 2 && config.sourceHeight === EXPECTED_HEIGHT * 2,
  `Resolución HD inesperada: ${config.sourceWidth}x${config.sourceHeight}`);
const previewPath = localAssetPath(config.previewImage);
const basePath = path.join(repoRoot, "assets/maps/san-pablo-rebuilt-base-hd.webp");
check(Boolean(config.previewImage) && fs.existsSync(previewPath), "Falta el preview compilado");
check(fs.existsSync(basePath), "Falta la base HD compilada");
let previewDimensions = null;
let baseDimensions = null;
if (fs.existsSync(previewPath)) {
  try { previewDimensions = imageDimensions(previewPath); }
  catch (error) { check(false, error.message); }
}
if (fs.existsSync(basePath)) {
  try { baseDimensions = imageDimensions(basePath); }
  catch (error) { check(false, error.message); }
}
if (previewDimensions) check(previewDimensions.width === EXPECTED_WIDTH && previewDimensions.height === EXPECTED_HEIGHT,
  `Preview inesperado: ${previewDimensions.width}x${previewDimensions.height}`);
if (baseDimensions) check(baseDimensions.width === config.sourceWidth && baseDimensions.height === config.sourceHeight,
  `Base HD inesperada: ${baseDimensions.width}x${baseDimensions.height}`);
if (previewDimensions && baseDimensions) {
  check(baseDimensions.width / previewDimensions.width === baseDimensions.height / previewDimensions.height,
    "Base y preview no conservan la misma escala");
  check(previewDimensions.width / previewDimensions.height === config.width / config.height,
    "El preview no conserva la proporción vertical 1:2 del mundo");
}
const reportPath = path.join(repoRoot, "assets/maps/san-pablo-rebuilt-report-v2.json");
check(fs.existsSync(reportPath), "Falta el informe reproducible del compilador");
if (fs.existsSync(reportPath)) {
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    for (const filename of ["map-geography.js", "map-layout.js", "map-data.js"]) {
      const expectedHash = report.inputs?.[filename];
      check(Boolean(expectedHash), `El informe no registra ${filename}`);
      if (expectedHash) check(expectedHash === sha256File(path.join(repoRoot, filename)),
        `${filename} cambió después de compilar los artefactos del mapa`);
    }
    check(report.dimensions?.logicalWidth === EXPECTED_WIDTH
      && report.dimensions?.logicalHeight === EXPECTED_HEIGHT
      && report.dimensions?.pixelWidth === EXPECTED_WIDTH * 2
      && report.dimensions?.pixelHeight === EXPECTED_HEIGHT * 2,
    "El informe declara dimensiones distintas al contrato 2048×4096 @2x");
    check(report.chunks?.count === 32 && report.chunks?.columns === 4 && report.chunks?.rows === 8,
      "El informe no acredita los 32 chunks 4×8");
    check(report.comparison?.generated === true
      && JSON.stringify(report.comparison?.panels) === JSON.stringify(["reference", "render", "overlay50"]),
    "El informe no acredita la comparación referencia/render/overlay50");
  } catch (error) {
    check(false, `No se pudo auditar el informe del compilador: ${error.message}`);
  }
}
check(Number(config.navigationMask?.cellSize) === EXPECTED_NAVIGATION_CELL,
  `La máscara debe usar celdas de ${EXPECTED_NAVIGATION_CELL} px`);
if (navigationMask) {
  check(navigationMask.width === EXPECTED_NAVIGATION_WIDTH && navigationMask.height === EXPECTED_NAVIGATION_HEIGHT,
    `Máscara inesperada: ${navigationMask.width}x${navigationMask.height}`);
  const values = new Set(navigationMask.pixels);
  check([...values].every((value) => value === 0 || value === 255),
    "La máscara de navegación debe ser binaria");
  check(values.has(0) && values.has(255), "La máscara debe contener suelo abierto y sólidos");
}

/* Los 32 chunks declarados deben existir y corresponder a su recorte 2x. */
check(config.chunkSize === EXPECTED_CHUNK_SIZE, `chunkSize inesperado: ${config.chunkSize}`);
check(config.tileColumns === EXPECTED_CHUNK_COLUMNS && config.tileRows === EXPECTED_CHUNK_ROWS,
  `Retícula de chunks inesperada: ${config.tileColumns}x${config.tileRows}`);
check(Array.isArray(config.tiles) && config.tiles.length === EXPECTED_CHUNK_COLUMNS * EXPECTED_CHUNK_ROWS,
  `Se esperaban 32 chunks y hay ${config.tiles?.length || 0}`);
const chunkIds = new Set();
const chunkPaths = new Set();
for (const chunk of config.tiles || []) {
  check(chunk.id && !chunkIds.has(chunk.id), `Chunk duplicado: ${chunk.id || "(vacío)"}`);
  chunkIds.add(chunk.id);
  const expectedId = `r${chunk.row}-c${chunk.col}`;
  check(chunk.id === expectedId, `${chunk.id}: id/posición incoherente`);
  check(chunk.x === chunk.col * config.chunkSize && chunk.y === chunk.row * config.chunkSize,
    `${chunk.id}: origen lógico inesperado`);
  check(chunk.w === EXPECTED_CHUNK_SIZE && chunk.h === EXPECTED_CHUNK_SIZE,
    `${chunk.id}: tamaño lógico inesperado ${chunk.w}x${chunk.h}`);
  const chunkPath = localAssetPath(chunk.image);
  chunkPaths.add(path.resolve(chunkPath));
  check(Boolean(chunk.image) && fs.existsSync(chunkPath), `${chunk.id}: falta ${chunk.image || "imagen"}`);
  if (!fs.existsSync(chunkPath)) continue;
  try {
    const dimensions = imageDimensions(chunkPath);
    const gutter = Number(config.chunkGutter) || 0;
    const density = Number(config.textureScale) || 1;
    const cropLeft = Math.max(0, chunk.x - gutter);
    const cropTop = Math.max(0, chunk.y - gutter);
    const cropRight = Math.min(config.width, chunk.x + chunk.w + gutter);
    const cropBottom = Math.min(config.height, chunk.y + chunk.h + gutter);
    check(dimensions.width === (cropRight - cropLeft) * density
      && dimensions.height === (cropBottom - cropTop) * density,
    `${chunk.id}: textura ${dimensions.width}x${dimensions.height} no coincide con su recorte 2x`);
  } catch (error) { check(false, error.message); }
}
if (config.tiles?.length) {
  const chunkDirectory = path.dirname(localAssetPath(config.tiles[0].image));
  if (fs.existsSync(chunkDirectory)) {
    const actualChunks = fs.readdirSync(chunkDirectory)
      .filter((name) => /^san-pablo-r\d+-c\d+\.webp$/i.test(name))
      .map((name) => path.resolve(chunkDirectory, name));
    check(actualChunks.length === 32, `El directorio contiene ${actualChunks.length} chunks San Pablo; se esperaban 32`);
    check(actualChunks.every((filepath) => chunkPaths.has(filepath)), "Quedan chunks obsoletos no declarados");
  }
}

/* La geometría fuente y la máscara deben coincidir en sondas representativas. */
for (const [x, y, label] of config.blockedProbes || []) {
  check(geometryBlocks(x, y, 0), `La sonda sólida ${label} no cae sobre edificio/muro/valla`);
  check(!canOccupy(x, y, 0), `La regresión ${label} (${x},${y}) ha quedado transitable`);
}
for (const [x, y, label] of config.openProbes || []) {
  check(!geometryBlocks(x, y, playerRadius), `La sonda abierta ${label} toca geometría sólida`);
  check(canOccupy(x, y), `El acceso ${label} (${x},${y}) ha quedado bloqueado `
    + `(GIS=${geometryBlocks(x, y, playerRadius)}, máscara=${!navigationAllows(x, y, playerRadius)}, casilla=${!tilesAllow(x, y, playerRadius)})`);
}
check(canOccupy(config.spawn.x, config.spawn.y), "El punto de aparición está bloqueado");

/* Conectividad real a la resolución de la máscara (8 px), no solo entre
   centros de casillas de 32 px: una calle estrecha puede ser perfectamente
   jugable aunque no contenga una hilera completa de centros de tile. */
const connectivityStep = Math.max(4, (Number(config.navigationMask?.cellSize) || 8) / 2);
const connectivityKey = (col, row) => `${col},${row}`;
const connectivityPoint = (col, row) => ({
  col, row,
  x: (col + .5) * connectivityStep,
  y: (row + .5) * connectivityStep,
});
const connectivityNodeAt = (x, y) => ({
  col: Math.floor(x / connectivityStep),
  row: Math.floor(y / connectivityStep),
});
const occupancyCache = new Map();
const gridCanOccupy = (col, row) => {
  const key = connectivityKey(col, row);
  if (occupancyCache.has(key)) return occupancyCache.get(key);
  const { x, y } = connectivityPoint(col, row);
  const open = canOccupy(x, y);
  occupancyCache.set(key, open);
  return open;
};
const segmentIsOpen = (fromX, fromY, toX, toY) => [0, .25, .5, .75, 1].every((amount) => canOccupy(
  fromX + (toX - fromX) * amount,
  fromY + (toY - fromY) * amount,
));
const nearbyOpenNodes = (x, y) => {
  const origin = connectivityNodeAt(x, y);
  const candidates = [];
  for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
    for (let deltaCol = -1; deltaCol <= 1; deltaCol += 1) {
      const point = connectivityPoint(origin.col + deltaCol, origin.row + deltaRow);
      if (Math.hypot(point.x - x, point.y - y) > connectivityStep * 1.6) continue;
      if (gridCanOccupy(point.col, point.row) && segmentIsOpen(x, y, point.x, point.y)) candidates.push(point);
    }
  }
  return candidates;
};
const queue = canOccupy(config.spawn.x, config.spawn.y)
  ? nearbyOpenNodes(config.spawn.x, config.spawn.y).map(({ col, row }) => ({ col, row }))
  : [];
const reachable = new Set(queue.map(({ col, row }) => connectivityKey(col, row)));
const positionIsReachable = (x, y) => {
  if (!canOccupy(x, y)) return false;
  return nearbyOpenNodes(x, y).some((node) => reachable.has(connectivityKey(node.col, node.row)));
};
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const current = queue[cursor];
  for (const [deltaCol, deltaRow] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const col = current.col + deltaCol;
    const row = current.row + deltaRow;
    const key = connectivityKey(col, row);
    if (reachable.has(key)) continue;
    if (!gridCanOccupy(col, row)) continue;
    reachable.add(key);
    queue.push({ col, row });
  }
}
check(reachable.size > 0, "No existe red transitable desde el spawn");

const reachableTileCenters = [];
for (let row = 0; row < rows; row += 1) {
  for (let col = 0; col < columns; col += 1) {
    const x = (col + .5) * tileSize;
    const y = (row + .5) * tileSize;
    if (positionIsReachable(x, y)) reachableTileCenters.push({ col, row, x, y });
  }
}
const nearestReachableTile = (x, y) => reachableTileCenters.reduce((best, candidate) => {
  const distance = Math.hypot(candidate.x - x, candidate.y - y);
  return !best || distance < best.distance ? { ...candidate, distance } : best;
}, null);
const reachabilityHint = (x, y) => {
  const nearest = nearestReachableTile(x, y);
  return nearest
    ? `; casilla alcanzable más próxima C${nearest.col},F${nearest.row} (${Math.round(nearest.distance)} px)`
    : "";
};
const blockingHint = (x, y) => [
  geometryBlocks(x, y, playerRadius) ? "geometría GIS" : null,
  !navigationAllows(x, y, playerRadius) ? "máscara" : null,
  !tilesAllow(x, y, playerRadius) ? "casilla/puerta" : null,
].filter(Boolean).join("+") || "componente aislado";

const entityIds = new Set();
check((config.npcs || []).length >= 20, `Se esperaban al menos 20 NPC y hay ${config.npcs?.length || 0}`);
for (const npc of config.npcs || []) {
  check(npc.id && !entityIds.has(npc.id), `NPC con id ausente o duplicado: ${npc.id || "(vacío)"}`);
  entityIds.add(npc.id);
  check(Number.isInteger(npc.col) && Number.isInteger(npc.row), `${npc.id}: casilla inválida`);
  const x = (npc.col + .5) * tileSize;
  const y = (npc.row + .5) * tileSize;
  const open = canOccupy(x, y);
  const connected = positionIsReachable(x, y);
  check(open, `${npc.id}: NPC colocado sobre un sólido (${blockingHint(x, y)})`);
  check(connected, `${npc.id}: NPC no alcanzable desde el spawn${reachabilityHint(x, y)}`);
}

const worldObjects = config.worldObjects || [];
check(worldObjects.length >= 6, `Se esperaban al menos 6 objetos y hay ${worldObjects.length}`);
const objectIds = new Set();
for (const object of worldObjects) {
  check(object.id && !objectIds.has(object.id), `Objeto con id ausente o duplicado: ${object.id || "(vacío)"}`);
  objectIds.add(object.id);
  check(Number.isFinite(object.x) && Number.isFinite(object.y), `${object.id}: posición inválida`);
  if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) continue;
  const open = canOccupy(object.x, object.y);
  const connected = positionIsReachable(object.x, object.y);
  check(open, `${object.id}: objeto colocado sobre un sólido (${blockingHint(object.x, object.y)})`);
  check(connected, `${object.id}: objeto no alcanzable desde el spawn${reachabilityHint(object.x, object.y)}`);
}
const cityPrismShards = worldObjects.filter((object) => object.dimension === "san_pablo" && object.crystal);
check(cityPrismShards.length === 3,
  `Se esperaban 3 Fragmentos Prisma en config.worldObjects y hay ${cityPrismShards.length}`);

const directionOffsets = {
  up: [0, -24], down: [0, 24], left: [-24, 0], right: [24, 0],
};
const doorIds = new Set();
let reachableDoors = 0;
check((config.doors || []).length >= 9, `Se esperaban al menos 9 puertas/eventos y hay ${config.doors?.length || 0}`);
for (const door of config.doors || []) {
  check(door.id && !doorIds.has(door.id), `Puerta con id ausente o duplicado: ${door.id || door.label || "(vacío)"}`);
  doorIds.add(door.id);
  check(Number.isInteger(door.col) && Number.isInteger(door.row), `${door.label}: casilla de puerta inválida`);
  check(tileType(door.col, door.row) === "door", `${door.label}: casilla no marcada como puerta`);
  check(!canOccupy((door.col + .5) * tileSize, (door.row + .5) * tileSize),
    `${door.label}: el centro de la puerta no bloquea la interacción`);
  const declared = Array.isArray(door.approach) && door.approach.length === 3
    ? [{ x: door.approach[0], y: door.approach[1], direction: door.approach[2] }]
    : [];
  const candidates = declared.length ? declared : [
    { x: (door.col + 1.5) * tileSize, y: (door.row + .5) * tileSize, direction: "left" },
    { x: (door.col - .5) * tileSize, y: (door.row + .5) * tileSize, direction: "right" },
    { x: (door.col + .5) * tileSize, y: (door.row + 1.5) * tileSize, direction: "up" },
    { x: (door.col + .5) * tileSize, y: (door.row - .5) * tileSize, direction: "down" },
  ];
  const validApproaches = candidates.filter((candidate) => {
    const offset = directionOffsets[candidate.direction];
    if (!offset) return false;
    const target = tileAtWorld(candidate.x + offset[0], candidate.y + offset[1]);
    return canOccupy(candidate.x, candidate.y)
      && positionIsReachable(candidate.x, candidate.y)
      && target.col === door.col && target.row === door.row;
  });
  check(validApproaches.length > 0,
    `${door.label || door.id}: no tiene aproximación abierta y alcanzable hacia C${door.col},F${door.row}`
      + `${reachabilityHint(candidates[0]?.x ?? door.col * tileSize, candidates[0]?.y ?? door.row * tileSize)}`);
  if (validApproaches.length) reachableDoors += 1;
}

const encounterAreas = config.encounterAreas || [];
const encounterTiles = config.encounterTiles || [];
if (encounterAreas.length || encounterTiles.length) {
  check(encounterAreas.length === 6, `Se esperaban 6 zonas de captura y hay ${encounterAreas.length}`);
  check(encounterTiles.length > 0, "Las zonas de captura no generan casillas de encuentro");
  for (const area of encounterAreas) {
    check(area.id && area.name, "Zona de captura sin id o nombre");
    const areaTiles = encounterTiles.filter(([col, row]) => {
      const x = (col + .5) * tileSize;
      const y = (row + .5) * tileSize;
      return area.shape === "polygon"
        ? pointInRing(x, y, area.points || [])
        : x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h;
    });
    check(areaTiles.length > 0, `${area.id}: no contiene casillas de encuentro`);
    const reachableArea = areaTiles.some(([col, row]) => positionIsReachable(
      (col + .5) * tileSize, (row + .5) * tileSize,
    ));
    const areaCenter = area.shape === "polygon" && area.points?.length
      ? area.points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
        .map((value) => value / area.points.length)
      : [area.x + area.w / 2, area.y + area.h / 2];
    const unusedReachableGreens = !reachableArea ? (geography.greens || [])
      .filter((green) => !encounterAreas.some((selected) => selected.id === `capture-green-${green.id}`))
      .filter((green) => {
        const points = green.points || [];
        if (points.length < 3) return false;
        const bounds = boundsOfPoints(points);
        const minCol = Math.max(0, Math.floor(bounds.left / tileSize));
        const maxCol = Math.min(columns - 1, Math.floor(bounds.right / tileSize));
        const minRow = Math.max(0, Math.floor(bounds.top / tileSize));
        const maxRow = Math.min(rows - 1, Math.floor(bounds.bottom / tileSize));
        for (let row = minRow; row <= maxRow; row += 1) {
          for (let col = minCol; col <= maxCol; col += 1) {
            const x = (col + .5) * tileSize;
            const y = (row + .5) * tileSize;
            if (pointInRing(x, y, points) && positionIsReachable(x, y)) return true;
          }
        }
        return false;
      })
      .map((green) => green.id) : [];
    check(reachableArea,
      `${area.id}: no tiene casillas abiertas alcanzables${reachabilityHint(areaCenter[0], areaCenter[1])}`
        + (unusedReachableGreens.length ? `; alternativas ${unusedReachableGreens.join(", ")}` : ""));
  }
  const grassPath = localAssetPath(config.encounterGrass?.image);
  check(Boolean(config.encounterGrass?.image) && fs.existsSync(grassPath), "Falta el spritesheet de hierba alta");
  if (fs.existsSync(grassPath)) {
    try {
      const dimensions = imageDimensions(grassPath);
      check(dimensions.width === Number(config.encounterGrass.frameSize) * Number(config.encounterGrass.frames)
        && dimensions.height === Number(config.encounterGrass.frameSize),
      `Spritesheet de hierba inesperado: ${dimensions.width}x${dimensions.height}`);
    } catch (error) { check(false, error.message); }
  }
}

if (failures.length) {
  console.error(`Validación fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `OK GIS: ${sourceBuildingCount} construcciones fuente (${solidBuildings.length} sólidas), `
    + `${solidBarriers.length} barreras, ${sourceTreeCount} árboles/palmeras, `
    + `32 chunks, ${encounterAreas.length} zonas y ${reachableDoors}/${config.doors.length} puertas alcanzables.`,
  );
}
