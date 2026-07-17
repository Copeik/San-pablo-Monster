import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { buildMapEditorBundle } from "../tools/build-map-editor-bundle.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const [client, html, css, runtime, rules, standalone, expectedStandalone] = await Promise.all([
  readFile(path.join(ROOT, "map-editor.js"), "utf8"),
  readFile(path.join(ROOT, "index.html"), "utf8"),
  readFile(path.join(ROOT, "styles.css"), "utf8"),
  readFile(path.join(ROOT, "script.js"), "utf8"),
  readFile(path.join(ROOT, "map-editor-rules.js"), "utf8"),
  readFile(path.join(ROOT, "map-editor-standalone.js"), "utf8"),
  buildMapEditorBundle(),
]);

test("sincronización usa SSE, outbox durable y heartbeat de baja frecuencia", () => {
  assert.doesNotMatch(client, /pollRemoteState|setInterval\([^)]*1200/);
  assert.match(client, /IndexedDbOutboxAdapter/);
  assert.match(client, /pagehide/);
  assert.match(client, /presenceHeartbeatMs/);
  assert.match(client, /transactionId/);
  assert.match(client, /outboxId = `\$\{legacyOutboxId\}:\$\{actorId\}`/);
  assert.match(client, /map-editor-close/);
  assert.match(client, /commitTransientTransactions/);
});

test("tabs, foco, móvil y controles táctiles conservan accesibilidad", () => {
  assert.match(html, /role="tab"/);
  assert.match(client, /event\.key === "ArrowRight"/);
  assert.match(client, /event\.key === "Home"/);
  assert.match(client, /map-editor-open/);
  assert.match(runtime, /target\?\.focus\(\)/);
  assert.match(client, /pointerType === "touch"/);
  assert.match(css, /height:\s*min\(42vh/);
  assert.match(css, /font-size:\s*(?:12|13|14)px/);
  assert.match(css, /\.building-editor\.open\s*\{[^}]*visibility:\s*visible/);
  assert.match(css, /visibility:\s*hidden;\s*pointer-events:\s*none/);
});

test("render de overlays se cachea e instrumenta sin bucle de texto por frame", () => {
  assert.match(runtime, /editorOverlayCacheHits/);
  assert.match(runtime, /editorOverlayBuildMs/);
  const drawOverlay = runtime.slice(runtime.indexOf("function drawEditorOverlay("), runtime.indexOf("function drawEditorPresence("));
  assert.doesNotMatch(drawOverlay, /for \(let row/);
  assert.doesNotMatch(drawOverlay, /fillText/);
});

test("el runtime consume el contrato compartido y no conserva el límite duplicado de 78", () => {
  assert.match(runtime, /globalThis\.MAP_EDITOR_RULES/);
  assert.match(rules, /root\.MAP_EDITOR_RULES = Object\.freeze/);
  assert.match(runtime, /CITY_MAX_COL/);
  assert.match(runtime, /MAP_EDITOR_RULES\.ranges\.patrolSpeed/);
  assert.doesNotMatch(runtime, /Math\.min\(78,/);
});

test("el juego conserva un arranque clásico compatible con abrir index.html directamente", () => {
  assert.match(html, /<script src="map-registry\.js\?v=1"><\/script>/);
  assert.match(html, /<script src="map-editor-rules\.js\?v=2"><\/script>/);
  assert.match(html, /<script src="map-bootstrap\.js\?v=1"><\/script>/);
  assert.match(html, /<script src="player-movement\.js\?v=\d+"><\/script>/);
  assert.match(html, /<script src="script\.js\?v=\d+"><\/script>/);
  assert.match(html, /<script src="map-editor-standalone\.js\?v=\d+"><\/script>/);
  assert.ok(html.indexOf("player-movement.js") < html.indexOf("script.js"));
  assert.doesNotMatch(html, /type="module" src="script\.js/);
  assert.doesNotMatch(html, /type="module" src="map-editor\.js/);
  assert.doesNotMatch(runtime, /^\s*import\s/m);
  assert.doesNotMatch(standalone, /^\s*(?:import|export)\s/m);
  assert.equal(standalone, expectedStandalone);
});

test("file:// activa un modo solo persistente sin degradar errores HTTP a datos locales", () => {
  assert.match(client, /const soloMode = window\.location\.protocol === "file:"/);
  assert.match(client, /pokemon-map-editor-solo-v1/);
  assert.match(client, /if \(soloMode\) \{[\s\S]*?readSoloSnapshot\(\)[\s\S]*?bridge\.enable\(\)/);
  assert.match(client, /if \(soloMode\) return;[\s\S]*?eventSource\?\.close/);
  const httpBranch = client.slice(client.indexOf("const [result, recovered] = await Promise.all([fetchSnapshot()"));
  assert.match(httpBranch, /catch \(error\) \{\s*enabled = false; bridge\.disable\(\)/);
  assert.doesNotMatch(httpBranch, /readSoloSnapshot\(/);
});

test("el editor separa mapas, destinos registrados y bandejas durables", () => {
  assert.match(html, /id="mapEditorMapSelect"/);
  assert.match(client, /url\.searchParams\.set\("map", activeMapId\)/);
  assert.match(client, /window\.location\.pathname\}:\$\{activeMapId\}/);
  assert.match(runtime, /state\.mapId = target\.id/);
  assert.match(runtime, /pokemon-map-transfer-resume/);
  assert.match(runtime, /MAP_REGISTRY\.get\(targetMap\)/);
});

test("suelo visual y expansión son herramientas independientes del terreno", () => {
  assert.match(html, /data-editor-mode="ground"/);
  assert.match(html, /data-ground-type="asphalt"/);
  assert.match(html, /id="expandMapButton"/);
  assert.match(client, /type: "ground\.set"/);
  assert.match(client, /type: "map\.resize"/);
  assert.match(runtime, /function drawGroundOverrides/);
  assert.match(runtime, /resizeRuntimeWorld/);
});

test("el pincel de senderos interpola el arrastre y renderiza conexiones direccionales", () => {
  assert.match(html, /data-ground-tool="path"/);
  assert.match(client, /groundPathType/);
  assert.match(client, /lineCells\(fromCell, center/);
  assert.match(runtime, /function groundPathConnectionMask/);
  assert.match(runtime, /function traceGroundPathShape/);
  assert.match(runtime, /drawGroundPathTile/);
  assert.match(client, /mergeGroundPaintValue\(before, value\)/);
  assert.match(runtime, /GROUND_LAYER_SEPARATOR/);
  assert.match(runtime, /tileset-grass-dirt\.png/);
  assert.match(runtime, /tileset-road-sidewalk\.png/);
  assert.match(runtime, /paintGroundPathLayer/);
});
