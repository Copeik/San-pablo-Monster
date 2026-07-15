import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const [client, html, css, runtime] = await Promise.all([
  readFile(path.join(ROOT, "map-editor.js"), "utf8"),
  readFile(path.join(ROOT, "index.html"), "utf8"),
  readFile(path.join(ROOT, "styles.css"), "utf8"),
  readFile(path.join(ROOT, "script.js"), "utf8"),
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
  assert.match(runtime, /import \{ MAP_EDITOR_RULES \} from "\.\/map-editor-contract\.js\?v=3"/);
  assert.match(runtime, /CITY_MAX_COL/);
  assert.match(runtime, /MAP_EDITOR_RULES\.ranges\.patrolSpeed/);
  assert.doesNotMatch(runtime, /Math\.min\(78,/);
});
