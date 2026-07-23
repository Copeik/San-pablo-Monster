import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import vm from "node:vm";
import { parseMapEditorSource } from "../map-editor-server.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

async function loadAdaEfesoMap() {
  const sandbox = { console };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const scripts = [
    "map-registry.js",
    "map-editor-data.js",
    "assets/generated/san-pablo-neighborhood/catalog.js",
    "assets/generated/san-pablo-barrio-c-pixellab/catalog.js",
    "map-layout.js",
    "map-data.js",
    "maps/san-pablo/register.js",
    "maps/ada-efeso/editor-data.js",
    "maps/ada-efeso/map.js",
  ];
  for (const filename of scripts) {
    vm.runInContext(await readFile(path.join(ROOT, filename), "utf8"), context, { filename });
  }
  return sandbox;
}

test("Ada-Efeso registra el plano completo como mapa independiente", async () => {
  const { GAME_MAP_REGISTRY } = await loadAdaEfesoMap();
  const map = GAME_MAP_REGISTRY.get("ada-efeso");
  assert.ok(map);
  assert.equal(GAME_MAP_REGISTRY.defaultMapId, "ada-efeso");
  assert.equal(GAME_MAP_REGISTRY.resolve(), "ada-efeso");
  assert.equal(map.config.kind, "district");
  assert.equal(map.config.name, "Distrito Ada-Efeso");
  assert.deepEqual(
    { width: map.config.width, height: map.config.height },
    { width: 2304, height: 3072 },
  );
  assert.deepEqual(
    { cols: map.editorData.mapSize.cols, rows: map.editorData.mapSize.rows },
    { cols: 72, rows: 96 },
  );

  const spawnCol = Math.floor(map.config.spawn.x / map.config.tileSize);
  const spawnRow = Math.floor(map.config.spawn.y / map.config.tileSize);
  assert.ok(map.config.walkableRects.some(([left, top, right, bottom]) => (
    spawnCol >= left && spawnCol <= right && spawnRow >= top && spawnRow <= bottom
  )), "la aparición de Avenida Ada debe ser transitable");

  const sectionIds = new Set(map.layout.sections.map((section) => section.id));
  for (const id of ["avenida-ada", "plazoletas-norte", "plazoletas-centro", "plazoletas-sur", "paseo-efeso", "campus-efeso"]) {
    assert.ok(sectionIds.has(id), `falta la sección ${id}`);
  }
});

test("el trazado conserva avenida, tres calles de plazoletas, aparcamientos y Efeso", async () => {
  const { GAME_MAP_REGISTRY } = await loadAdaEfesoMap();
  const map = GAME_MAP_REGISTRY.get("ada-efeso");

  const avenue = map.layout.roads.find((road) => road.id === "avenida-ada");
  assert.equal(avenue.width, 288);
  assert.deepEqual(Array.from(avenue.points[0]), [208, 0]);
  assert.deepEqual(Array.from(avenue.points[1]), [208, 3072]);

  const efeso = map.layout.paths.find((walk) => walk.id === "paseo-efeso");
  assert.equal(efeso.width, 112);
  assert.equal(efeso.walkable, true);

  const plazas = map.layout.surfaceRects.filter((surface) => surface.id.startsWith("plazas-"));
  assert.equal(plazas.length, 3);
  assert.deepEqual(Array.from(plazas, (surface) => surface.y), [288, 1264, 2240]);
  assert.ok(plazas.every((surface) => surface.w === 1056 && surface.surface === "plaza"));

  const parkings = map.layout.surfaceRects.filter((surface) => surface.id.includes("parking"));
  assert.equal(parkings.length, 5);
  assert.ok(parkings.some((surface) => surface.id === "campus-parking"));
  assert.ok(map.layout.surfaceRects.some((surface) => surface.id === "playground"));

  assert.equal(map.config.barrierSegments.length, 5);
  const lowerFence = map.config.barrierSegments.filter((segment) => segment.id.startsWith("campus-fence-bottom"));
  assert.equal(lowerFence.length, 2, "la valla del campus debe dejar una puerta central");
});

test("los recursos PixelLab específicos están presentes y colocados", async () => {
  const { GAME_MAP_REGISTRY } = await loadAdaEfesoMap();
  const map = GAME_MAP_REGISTRY.get("ada-efeso");
  const assets = map.config.worldAssets;
  assert.equal(assets.filter((asset) => asset.sprite.startsWith("adaApartment")).length, 24);
  assert.equal(assets.filter((asset) => asset.sprite === "efesoUniversity").length, 2);
  assert.equal(assets.filter((asset) => asset.sprite === "adaPlayground").length, 1);
  assert.ok(assets.filter((asset) => asset.sprite.startsWith("adaCar")).length >= 30);
  assert.ok(assets.filter((asset) => asset.id.startsWith("campus-fence-")).length >= 50);
  assert.ok(assets.filter((asset) => asset.id.startsWith("campus-fence-left-")).every((asset) => (
    asset.sprite === "adaFenceVertical" && !asset.rotation
  )));
  assert.ok(assets.filter((asset) => asset.id.startsWith("campus-fence-top-")).every((asset) => (
    asset.sprite === "adaFenceHorizontal" && !asset.rotation
  )));

  const northernBuildings = assets.filter((asset) => /-bloque-n-/.test(asset.id));
  const southernBuildings = assets.filter((asset) => /-bloque-s-/.test(asset.id));
  assert.equal(northernBuildings.length, 12);
  assert.equal(southernBuildings.length, 12);
  assert.ok(northernBuildings.every((asset) => (
    asset.sprite === "adaApartmentSouth" && asset.entranceFacing === "south" && asset.accessSide === "plaza"
  )));
  assert.ok(southernBuildings.every((asset) => (
    asset.sprite === "adaApartmentNorth" && asset.entranceFacing === "north"
      && asset.accessSide === "plaza" && asset.parkingFacingFacade === "doorless"
  )));

  for (const asset of assets) {
    const source = map.layout.assetCatalog[asset.sprite]?.src || "";
    assert.match(source, /^assets\/generated\/ada-efeso-pixellab\//, `${asset.id} debe usar arte PixelLab local`);
  }

  const expected = new Map([
    ["building-apartment-south.png", [151, 151]],
    ["building-apartment-north.png", [151, 151]],
    ["building-apartment-parking-rear.png", [151, 151]],
    ["building-university-south.png", [151, 151]],
    ["prop-playground.png", [256, 256]],
  ]);
  for (const [filename, [width, height]] of expected) {
    const png = await readFile(path.join(ROOT, "assets/generated/ada-efeso-pixellab", filename));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.equal(png[24], 8, "los PNG deben usar canales de 8 bits");
    assert.equal(png[25], 6, "los PNG deben ser RGBA con transparencia");
  }

  const jobs = JSON.parse(await readFile(path.join(ROOT, "assets/generated/ada-efeso-pixellab/pixellab-jobs.json"), "utf8"));
  assert.equal(jobs.generator, "PixelLab MCP");
  assert.equal(jobs.jobs.length, 8);
  assert.equal(jobs.jobs.every((job) => job.status === "completed" && job.id), true);
  assert.deepEqual(jobs.jobs.map((job) => job.cost), [40, 40, 20, 20, 20, 25, 20, 20]);
});

test("la base contiene exclusivamente teselas PixelLab y no objetos pintados", async () => {
  const base = await readFile(path.join(ROOT, "maps/ada-efeso/base-pixellab-borderless.png"));
  assert.equal(base.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(base.readUInt32BE(16), 2304);
  assert.equal(base.readUInt32BE(20), 3072);
  assert.equal(base[25], 6, "la base debe conservar RGBA de las teselas PixelLab");

  const { stdout } = await execFileAsync("python", ["tools/build-ada-efeso-pixellab-map.py", "--check"], { cwd: ROOT });
  assert.match(stdout, /contains only exact PixelLab terrain tiles/);

  const { GAME_MAP_REGISTRY } = await loadAdaEfesoMap();
  const map = GAME_MAP_REGISTRY.get("ada-efeso");
  assert.equal(map.config.previewImage, "maps/ada-efeso/base-pixellab-borderless.png");
  assert.equal(map.config.tiles[0].image, "maps/ada-efeso/base-pixellab-borderless.png");
  assert.ok(!map.config.tiles[0].image.endsWith(".svg"));
});

test("el arranque directo publica el Distrito Ada-Efeso", async () => {
  const html = await readFile(path.join(ROOT, "index.html"), "utf8");
  const editorScript = html.indexOf("maps/ada-efeso/editor-data.js");
  const mapScript = html.indexOf("maps/ada-efeso/map.js");
  const bootstrap = html.indexOf("map-bootstrap.js");
  assert.ok(editorScript >= 0 && mapScript > editorScript && bootstrap > mapScript);

  const editorSource = await readFile(path.join(ROOT, "maps/ada-efeso/editor-data.js"), "utf8");
  const parsed = parseMapEditorSource(editorSource);
  assert.deepEqual(parsed.mapSize, { cols: 72, rows: 96 });
});

test("una sesión nueva activa Ada-Efeso como mapa base", async () => {
  const sandbox = await loadAdaEfesoMap();
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.location = { search: "" };
  sandbox.localStorage = { getItem: () => null };
  sandbox.document = {
    documentElement: { dataset: {} },
    querySelector: () => null,
  };
  vm.runInContext(
    await readFile(path.join(ROOT, "map-bootstrap.js"), "utf8"),
    vm.createContext(sandbox),
    { filename: "map-bootstrap.js" },
  );
  assert.equal(sandbox.ACTIVE_GAME_MAP_ID, "ada-efeso");
  assert.equal(sandbox.ACTIVE_GAME_MAP.config.id, "ada-efeso");
  assert.equal(sandbox.document.documentElement.dataset.activeMap, "ada-efeso");
});

test("la apertura muestra el robo, el despertar South-West y tres huidas configurables", async () => {
  const { GAME_MAP_REGISTRY } = await loadAdaEfesoMap();
  const opening = GAME_MAP_REGISTRY.get("ada-efeso").config.openingSequence;
  assert.equal(opening.id, "ada-efeso-robbery-intro");
  assert.equal(opening.startNewGameHere, true);
  assert.equal(opening.startAreaId, "avenida-ada");
  assert.equal(opening.skipStarterVideo, true);
  assert.equal(opening.skipDoctorPotato, true);
  assert.deepEqual(Array.from([opening.player.x, opening.player.y]), [208, 2832]);
  assert.equal(opening.player.faintedDirection, "south-west");
  assert.equal(opening.player.standingDirection, "down-left");
  assert.equal(opening.thieves.length, 3);
  assert.deepEqual(Array.from(opening.thieves, (thief) => thief.item), ["CARTERA", "MÓVIL", "LLAVES"]);
  assert.deepEqual(Array.from(opening.thieves, (thief) => thief.fleeDirection), ["left", "right", "down"]);
  assert.ok(opening.thieves.every((thief) => thief.provisionalHide.length === 2));

  const expectedSheets = [
    ["protagonist-fainted-lying-south-west-pixellab.png", 896, 112],
    ["protagonist-getting-up-south-west-pixellab.png", 1008, 112],
  ];
  for (const [filename, width, height] of expectedSheets) {
    const png = await readFile(path.join(ROOT, "assets/sprites/protagonist", filename));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.equal(png[25], 6, "las tiras PixelLab deben conservar transparencia RGBA");
  }

  const manifest = JSON.parse(await readFile(path.join(ROOT, "assets/sprites/protagonist/manifest.json"), "utf8"));
  assert.equal(manifest.generator, "PixelLab MCP");
  assert.equal(manifest.characterId, "b96197cb-8527-4fdf-bd6d-d48c01c41804");
  assert.equal(manifest.direction, "south-west");
  assert.deepEqual(manifest.animations.map((animation) => animation.frames), [8, 9]);

  const runtime = await readFile(path.join(ROOT, "script.js"), "utf8");
  const styles = await readFile(path.join(ROOT, "styles.css"), "utf8");
  assert.match(runtime, /function startMapOpeningSequence\(/);
  assert.match(runtime, /function updateMapOpeningSequence\(/);
  assert.match(runtime, /function drawMapOpeningThief\(/);
  assert.match(runtime, /playerOpeningAnimationSource = "pixellab:b96197cb-8527-4fdf-bd6d-d48c01c41804:south-west"/);
  assert.match(runtime, /const DOCTOR_POTATO_ENABLED = false;/);
  assert.match(runtime, /if \(MAP_OPENING\?\.skipStarterVideo\)/);
  assert.match(runtime, /doctorPotatoIntroPending = DOCTOR_POTATO_ENABLED && !MAP_OPENING\?\.skipDoctorPotato/);
  assert.match(styles, /\.flash-overlay\.wake-from-unconscious/);
});
