import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

const EDITOR_TEMPLATE = [
  "/* Datos persistentes del editor para __MAP_NAME__. */",
  "window.CITY_MAP_EDITOR_DATA = {",
  "  version: 3,",
  "  tileOverrides: {},",
  "  groundOverrides: {},",
  "  mapSize: { cols: __COLS__, rows: __ROWS__ },",
  "  assetOverrides: {},",
  "  addedAssets: [],",
  "  hiddenAssets: [],",
  "  npcOverrides: {},",
  "  addedNpcs: [],",
  "  hiddenNpcs: [],",
  "  entrances: [],",
  "  events: []",
  "};",
  "",
].join("\n");

const MAP_TEMPLATE = [
  "(function registerGeneratedMap(root) {",
  "  \"use strict\";",
  "  const tileSize = 32;",
  "  const cols = __COLS__;",
  "  const rows = __ROWS__;",
  "  const width = cols * tileSize;",
  "  const height = rows * tileSize;",
  "  const sharedCatalog = root.GAME_MAP_REGISTRY.get(\"san-pablo\")?.layout?.assetCatalog || Object.freeze({});",
  "  const sharedSprites = Object.freeze(Object.fromEntries(",
  "    Object.entries(sharedCatalog).map(([id, prototype]) => [id, prototype.src]),",
  "  ));",
  "  const layout = Object.freeze({",
  "    revision: 1, width, height, tileSize, navigationCellSize: 8,",
  "    assetCatalog: sharedCatalog, worldAssets: Object.freeze([]),",
  "    roads: Object.freeze([]), paths: Object.freeze([]), surfaceRects: Object.freeze([]),",
  "    surfacePolygons: Object.freeze([]), encounterAreas: Object.freeze([]), blockedRects: Object.freeze([]),",
  "    sections: Object.freeze([{ id: \"__MAP_ID__\", name: \"__MAP_NAME__\", x: 0, y: 0, w: width, h: height }]),",
  "  });",
  "  const config = Object.freeze({",
  "    id: \"__MAP_ID__\", name: \"__MAP_NAME__\", kind: \"route\", revision: 1,",
  "    previewImage: \"maps/__MAP_ID__/base.svg\", width, height, baseWidth: width, baseHeight: height,",
  "    sourceWidth: width, sourceHeight: height, textureScale: 1, tileColumns: 1, tileRows: 1,",
  "    chunkSize: Math.max(width, height), chunkGutter: 0, memoryBudgetMB: 16, prefetchLimit: 0,",
  "    tiles: Object.freeze([{ id: \"r0-c0\", col: 0, row: 0, x: 0, y: 0, w: width, h: height, image: \"maps/__MAP_ID__/base.svg\" }]),",
  "    tileSize, defaultTile: \"blocked\", spawn: Object.freeze({ x: width / 2, y: height - 80, direction: \"up\" }),",
  "    assetSprites: sharedSprites, assetRevision: 1, worldAssets: Object.freeze([]), editorVacatedRects: Object.freeze([]),",
  "    sections: layout.sections, extensionSurfaces: Object.freeze([]), blockedRects: Object.freeze([]),",
  "    walkableRects: Object.freeze([[1, 1, cols - 2, rows - 2]]), walkableSegments: Object.freeze([]),",
  "    encounterAreas: Object.freeze([]), encounterTiles: Object.freeze([]), encounterRects: Object.freeze([]),",
  "    entrances: Object.freeze([]), npcs: Object.freeze([]), events: Object.freeze([]), worldObjects: Object.freeze([]),",
  "  });",
  "  root.GAME_MAP_REGISTRY.register(\"__MAP_ID__\", {",
  "    name: config.name, config, layout, editorData: root.CITY_MAP_EDITOR_DATA,",
  "    editorDataPath: \"maps/__MAP_ID__/editor-data.js\",",
  "  });",
  "})(globalThis);",
  "",
].join("\n");

const SVG_TEMPLATE = [
  "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"__WIDTH__\" height=\"__HEIGHT__\" viewBox=\"0 0 __WIDTH__ __HEIGHT__\">",
  "  <defs><pattern id=\"g\" width=\"32\" height=\"32\" patternUnits=\"userSpaceOnUse\"><rect width=\"32\" height=\"32\" fill=\"#69a85a\"/><path d=\"M7 26l3-8 3 8m12-12l2-6 3 7\" stroke=\"#4a8848\" stroke-width=\"2\" fill=\"none\"/></pattern></defs>",
  "  <rect width=\"__WIDTH__\" height=\"__HEIGHT__\" fill=\"#244c39\"/>",
  "  <rect x=\"32\" y=\"32\" width=\"__INNER_WIDTH__\" height=\"__INNER_HEIGHT__\" rx=\"16\" fill=\"url(#g)\" stroke=\"#183b2d\" stroke-width=\"8\"/>",
  "  <path d=\"M__CENTER__ 32V__BOTTOM__\" stroke=\"#d4b06b\" stroke-width=\"64\"/>",
  "  <text x=\"__CENTER__\" y=\"90\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"24\" font-weight=\"700\" fill=\"#f8f3d8\">__MAP_NAME__</text>",
  "</svg>",
  "",
].join("\n");

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const values = argv.filter((value) => !value.startsWith("--"));
  const valueAfter = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  return {
    id: String(values[0] || "").trim().toLowerCase().replace(/_/g, "-"),
    name: String(valueAfter("--name", values[0] || "Nuevo mapa")).trim(),
    cols: Number(valueAfter("--cols", 20)),
    rows: Number(valueAfter("--rows", 20)),
  };
}

function fill(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll("__" + key + "__", String(value)), template);
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

export async function createMapPackage({ root = PROJECT_ROOT, id, name, cols = 20, rows = 20 }) {
  if (!ID_PATTERN.test(id || "")) throw new Error("Usa un ID en kebab-case: letras, numeros y guiones.");
  if (!Number.isInteger(cols) || cols < 12 || cols > 128 || !Number.isInteger(rows) || rows < 12 || rows > 128) {
    throw new Error("El mapa debe medir entre 12 y 128 casillas por lado.");
  }
  const directory = path.join(root, "maps", id);
  if (await exists(directory)) throw new Error("Ya existe maps/" + id + ".");
  const safeName = String(name || id).replace(/[<>]/g, "").slice(0, 80);
  const values = { MAP_ID: id, MAP_NAME: safeName, COLS: cols, ROWS: rows };
  await mkdir(directory, { recursive: false });
  await writeFile(path.join(directory, "editor-data.js"), fill(EDITOR_TEMPLATE, values), "utf8");
  await writeFile(path.join(directory, "map.js"), fill(MAP_TEMPLATE, values), "utf8");
  await writeFile(path.join(directory, "base.svg"), fill(SVG_TEMPLATE, {
    ...values,
    WIDTH: cols * 32,
    HEIGHT: rows * 32,
    INNER_WIDTH: (cols - 2) * 32,
    INNER_HEIGHT: (rows - 2) * 32,
    CENTER: cols * 16,
    BOTTOM: rows * 32 - 32,
  }), "utf8");

  const indexPath = path.join(root, "index.html");
  const index = await readFile(indexPath, "utf8");
  const marker = "    <!-- GAME_MAP_PACKAGES -->";
  if (!index.includes(marker)) throw new Error("Falta el marcador GAME_MAP_PACKAGES en index.html.");
  const scripts = [
    "    <script src=\"maps/" + id + "/editor-data.js?v=1\"></script>",
    "    <script src=\"maps/" + id + "/map.js?v=1\"></script>",
    marker,
  ].join("\n");
  await writeFile(indexPath, index.replace(marker, scripts), "utf8");
  return { id, name: safeName, cols, rows, directory };
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  const options = parseArguments(process.argv.slice(2));
  if (options.help || !options.id) {
    console.log("Uso: npm run map:new -- <map-id> [--name \"Nombre\"] [--cols 20] [--rows 20]");
    process.exitCode = options.help ? 0 : 1;
  } else {
    createMapPackage(options).then((result) => {
      console.log("Mapa creado: " + result.id + " (" + result.cols + "x" + result.rows + ") en " + result.directory);
    }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
