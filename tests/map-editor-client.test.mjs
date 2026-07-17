import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { buildMapEditorBundle } from "../tools/build-map-editor-bundle.mjs";
import { resolveEditorShortcut } from "../map-editor-core.js";

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

test("lapiz y borrador interpolan el arrastre y tileAtEvent limita las celdas al mapa", () => {
  const tileAtEvent = functionSource(client, "tileAtEvent");
  assert.match(tileAtEvent, /const point = bridge\.canvasToWorld\(event\.clientX, event\.clientY\); const grid = bridge\.grid\(\)/);
  assert.match(tileAtEvent, /col: clamp\(Math\.floor\(point\.x \/ grid\.tileSize\), 0, grid\.cols - 1\)/);
  assert.match(tileAtEvent, /row: clamp\(Math\.floor\(point\.y \/ grid\.tileSize\), 0, grid\.rows - 1\)/);

  const paint = functionSource(client, "paintAtEvent");
  assert.match(paint, /const baseCells = fromCell \? lineCells\(fromCell, center, bridge\.grid\(\)\) : \[center\]/);
  assert.doesNotMatch(paint, /selectedTool === "path" && fromCell/);
  assert.match(paint, /selectedTool === "eraser" \? "inherit" : selectedType/);

  const pointerDown = functionSource(client, "onPointerDown");
  assert.match(pointerDown, /drag = \{ type: "terrain",[\s\S]*?tool: selectedTool,[\s\S]*?lastCell: start,[\s\S]*?transaction: activeTransaction \}/);
  const pointerMove = functionSource(client, "onPointerMove");
  assert.match(pointerMove, /drag\.type === "terrain"[\s\S]*?paintAtEvent\(event, drag\.transaction, drag\.lastCell, drag\.tool\)/);
});

test("los atajos son contextuales y las preferencias se aislan por mapa", () => {
  assert.deepEqual(resolveEditorShortcut({ key: "1" }), { type: "mode", value: "objects" });
  assert.deepEqual(resolveEditorShortcut({ key: "6" }), { type: "mode", value: "events" });
  assert.deepEqual(resolveEditorShortcut({ key: "E", mode: "terrain" }), { type: "paint.tool", value: "eraser" });
  assert.deepEqual(resolveEditorShortcut({ key: "P", mode: "ground" }), { type: "paint.tool", value: "path" });
  assert.deepEqual(resolveEditorShortcut({ key: "]", mode: "ground" }), { type: "brush.size", value: 1 });
  assert.deepEqual(resolveEditorShortcut({ key: "+", mode: "terrain" }), { type: "brush.size", value: 1 });
  assert.deepEqual(resolveEditorShortcut({ key: "=", mode: "ground" }), { type: "brush.size", value: 1 });
  assert.deepEqual(resolveEditorShortcut({ key: "-", mode: "terrain" }), { type: "brush.size", value: -1 });
  assert.deepEqual(resolveEditorShortcut({ key: "_", mode: "ground" }), { type: "brush.size", value: -1 });
  assert.equal(resolveEditorShortcut({ key: "+", mode: "objects" }), null);
  assert.equal(resolveEditorShortcut({ key: "-", mode: "ground", alt: true }), null);
  assert.deepEqual(resolveEditorShortcut({ key: "a", mode: "objects", modifier: true }), { type: "selection.all" });
  assert.deepEqual(resolveEditorShortcut({ key: "a", mode: "objects", modifier: true, shift: true }), { type: "selection.clear" });
  assert.deepEqual(resolveEditorShortcut({ key: "Escape", mode: "terrain" }), { type: "cancel" });
  assert.deepEqual(resolveEditorShortcut({ key: "/", mode: "objects" }), { type: "search" });
  assert.equal(resolveEditorShortcut({ key: "e", mode: "objects" }), null);
  assert.equal(resolveEditorShortcut({ key: "e", mode: "terrain", alt: true }), null);

  assert.match(client, /const workspacePreferencesKey = `pokemon-map-editor-workspace-v1:\$\{activeMapId\}`/);
  assert.match(client, /persistentStorage\?\.getItem\(workspacePreferencesKey\)/);
  assert.match(client, /resolveEditorShortcut\(\{ key: event\.key, mode, modifier, shift: event\.shiftKey, alt: event\.altKey \}\)/);

  const persist = functionSource(client, "persistWorkspacePreferences");
  assert.match(persist, /persistentStorage\.setItem\(workspacePreferencesKey, JSON\.stringify\(\{ mode, terrainTool, groundTool, terrainBrushSize, groundBrushSize \}\)\)/);
  assert.match(functionSource(client, "setMode"), /persistWorkspacePreferences\(\)/);
  assert.match(functionSource(client, "setPaintingTool"), /if \(persist\) persistWorkspacePreferences\(\)/);
  assert.match(functionSource(client, "changeBrushSize"), /persistWorkspacePreferences\(\)/);
  assert.match(client, /bindUi\(\); applyWorkspacePreferences\(\);/);
});

test("los atajos respetan foco y estado, confirman antes de guardar y protegen el teclado", () => {
  const bindings = functionSource(client, "bindUi");
  const keydownStart = bindings.indexOf('document.addEventListener("keydown"');
  const keydownEnd = bindings.indexOf('document.addEventListener("keyup"', keydownStart);
  assert.ok(keydownStart >= 0 && keydownEnd > keydownStart, "falta el listener de teclado del editor");
  const keydown = bindings.slice(keydownStart, keydownEnd);

  assert.match(keydown, /const interactive = Boolean\(event\.target\?\.closest\?\.\("input,select,textarea,button,a,summary,\[contenteditable\]"\)\)/);
  const closedStart = keydown.indexOf("if (!bridge.isOpen())");
  const closedEnd = keydown.indexOf('if (event.key === "Escape")', closedStart);
  const closedBranch = keydown.slice(closedStart, closedEnd);
  assert.match(closedBranch, /!interactive && !modifier && !event\.altKey && key === "g"[\s\S]*?bridge\.open\(\)/);
  assert.match(closedBranch, /return/);
  assert.doesNotMatch(closedBranch, /resolveEditorShortcut|executeEditorShortcut|flushOperations/);

  const saveStart = keydown.indexOf('if (modifier && key === "s")');
  const saveEnd = keydown.indexOf("if (interactive) return", saveStart);
  const saveBranch = keydown.slice(saveStart, saveEnd);
  assert.match(saveBranch, /commitTransientTransactions\(\); void flushOperations\(\)/);
  assert.ok(saveBranch.indexOf("commitTransientTransactions()") < saveBranch.indexOf("flushOperations()"));
  assert.ok(saveEnd < keydown.indexOf("resolveEditorShortcut"), "los controles interactivos deben salir antes de los atajos");

  assert.match(keydown, /if \(drag \|\| activeTransaction \|\| formTransaction \|\| \(keyboardTransaction && !direction\)\) return/);
  assert.ok(keydown.indexOf("if (drag || activeTransaction") < keydown.indexOf("resolveEditorShortcut"));
  assert.match(keydown, /const direction = !modifier && !event\.altKey \? directions\[event\.key\] : null/);
  assert.match(keydown, /keyboardTransaction && \(keyboardTransaction\.kind !== selected\.kind \|\| keyboardTransaction\.id !== entity\.id\)[\s\S]*?commitTransaction\(keyboardTransaction\.builder\); keyboardTransaction = null/);

  const setSelected = functionSource(client, "setSelected");
  assert.match(setSelected, /if \(selectionChanges && keyboardTransaction\) \{[\s\S]*?commitTransaction\(keyboardTransaction\.builder\); keyboardTransaction = null/);
  const pointerDown = functionSource(client, "onPointerDown");
  assert.match(pointerDown, /if \(formTransaction\) \{ commitTransaction\(formTransaction\.builder\); formTransaction = null; \}/);
  assert.match(pointerDown, /if \(keyboardTransaction\) \{ commitTransaction\(keyboardTransaction\.builder\); keyboardTransaction = null; \}/);

  const handleKeyDown = functionSource(runtime, "handleKeyDown");
  assert.match(handleKeyDown, /const editorShortcutModifier = event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey/);
  assert.match(handleKeyDown, /if \(!typing && !editorShortcutModifier && !event\.defaultPrevented && movementKey\)/);
  assert.match(handleKeyDown, /const gameplayModifier = event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey/);
  assert.match(handleKeyDown, /const control = gameplayModifier \|\| event\.defaultPrevented \? null : keyToControl\(event\.key\)/);
  assert.match(handleKeyDown, /if \(!gameplayModifier && \["Enter", " ", "e", "E"\]\.includes\(event\.key\) && !event\.repeat\) advanceDialog\(\)/);
});

test("buscar abre todos los details ancestros y blur finaliza cualquier paneo", () => {
  const search = functionSource(client, "focusEditorSearch");
  assert.match(search, /let ancestor = input\.parentElement/);
  assert.match(search, /while \(ancestor\) \{[\s\S]*?if \(ancestor\.tagName === "DETAILS"\) ancestor\.open = true;[\s\S]*?ancestor = ancestor\.parentElement/);
  assert.match(search, /window\.requestAnimationFrame\(focus\)/);
  assert.match(search, /window\.setTimeout\(focus, 0\)/);

  const bindings = functionSource(client, "bindUi");
  assert.match(bindings, /window\.addEventListener\("blur", \(\) => \{[\s\S]*?if \(bridge\.isOpen\(\)\) commitTransientTransactions\(\);[\s\S]*?else spacePressed = false/);
  const transient = functionSource(client, "commitTransientTransactions");
  assert.match(transient, /drag = null/);
  assert.match(transient, /spacePressed = false/);
});

test("el clic derecho borra temporalmente sin sustituir la herramienta elegida", () => {
  const pointerDown = functionSource(client, "onPointerDown");
  assert.match(pointerDown, /event\.button !== 0 && !\(event\.button === 2 && \(mode === "terrain" \|\| mode === "ground"\)\)/);
  assert.match(pointerDown, /const selectedTool = event\.button === 2 \? "eraser" : \(isGround \? groundTool : terrainTool\)/);
  assert.match(pointerDown, /tool: selectedTool/);
  assert.match(pointerDown, /paintAtEvent\(event, activeTransaction, null, selectedTool\)/);
  assert.doesNotMatch(pointerDown, /(?:terrainTool|groundTool)\s*=\s*"eraser"/);
  assert.doesNotMatch(pointerDown, /setPaintingTool\("eraser"/);

  const bindings = functionSource(client, "bindUi");
  assert.match(bindings, /canvas\.addEventListener\("contextmenu",[\s\S]*?mode === "terrain" \|\| mode === "ground"[\s\S]*?event\.preventDefault\(\)/);
});

test("cancelar revierte la transaccion en curso y limpia previews sin confirmar cambios", () => {
  const revert = functionSource(client, "revertUncommittedBuilder");
  assert.match(revert, /builder\.command\(\)\.before\.forEach/);
  assert.match(revert, /applyDataOperation\(operation\); applyBridgeOperation\(operation\)/);

  const cancel = functionSource(client, "cancelCurrentAction");
  assert.match(cancel, /const clearSelection = options\?\.clearSelection !== false/);
  assert.match(cancel, /new Set\(\[activeTransaction, drag\?\.transaction, formTransaction\?\.builder, keyboardTransaction\?\.builder\]\.filter\(Boolean\)\)/);
  assert.match(cancel, /revertUncommittedBuilder\(builder\)/);
  assert.match(cancel, /releasePointerCapture\?\.\(drag\.pointerId\)/);
  assert.match(cancel, /Boolean\(drag \|\| activeTransaction \|\| keyboardTransaction \|\| formTransaction \|\| pinchGesture \|\| touchPointers\.size\)/);
  assert.match(cancel, /drag = null; activeTransaction = null; keyboardTransaction = null; formTransaction = null/);
  assert.match(cancel, /pinchGesture = null; touchPointers\.clear\(\); spacePressed = false/);
  assert.match(cancel, /bridge\.setTerrainPreview\?\.\(\[\]\); bridge\.setMarquee\?\.\(null\)/);
  assert.match(cancel, /if \(!changed && selected && clearSelection\) setSelected\(null, null\)/);
  assert.match(cancel, /return hadGesture \|\| changed \|\| hadSelection/);
  assert.doesNotMatch(cancel, /commitTransaction\(/);

  const bindings = functionSource(client, "bindUi");
  assert.match(bindings, /canvas\.addEventListener\("pointercancel", \(\) => cancelCurrentAction\(\{ clearSelection: false \}\)\)/);
  assert.match(functionSource(client, "executeEditorShortcut"), /action\.type === "cancel"\) cancelCurrentAction\(\)/);
});

test("el inspector confirma el movimiento de teclado antes de iniciar su formulario", () => {
  const bindings = functionSource(client, "bindInspectorInputs");
  assert.match(bindings, /if \(keyboardTransaction\) \{\s*commitTransaction\(keyboardTransaction\.builder\);\s*keyboardTransaction = null;\s*\}/);
  assert.ok(
    bindings.indexOf("if (keyboardTransaction)") < bindings.indexOf("formTransaction = { kind"),
    "el formulario no debe solaparse con una transaccion de teclado",
  );
});

test("commit transitorio incluye drag y confirma builders en orden antes de limpiar", () => {
  const transient = functionSource(client, "commitTransientTransactions");
  assert.match(transient, /new Set\(\[keyboardTransaction\?\.builder, formTransaction\?\.builder, drag\?\.transaction, activeTransaction\]\.filter\(Boolean\)\)/);
  assert.match(transient, /builders\.forEach\(\(builder\) => \{ committed = commitTransaction\(builder\) \|\| committed; \}\)/);
  assert.match(transient, /releasePointerCapture\?\.\(drag\.pointerId\)/);
  assert.match(transient, /drag = null; keyboardTransaction = null; formTransaction = null; activeTransaction = null/);
  assert.match(transient, /pinchGesture = null; touchPointers\.clear\(\); spacePressed = false/);
  assert.match(transient, /bridge\.setTerrainPreview\?\.\(\[\]\); bridge\.setMarquee\?\.\(null\)/);
  assert.ok(transient.indexOf("builders.forEach") < transient.indexOf("drag = null"), "los builders deben confirmarse antes de limpiar sus referencias");
});

test("cancelar, deshacer y los no-op restauran la procedencia exacta de entidades base", () => {
  const before = functionSource(client, "entityBeforeOperation");
  assert.match(before, /hasOwn\(data\[collection\], entity\.id\)/);
  assert.match(before, /value: clone\(stored\)[\s\S]*?rebuildRuntime: true, baselineValue/);
  assert.match(before, /type: "entity\.delete"[\s\S]*?hide: false[\s\S]*?rebuildRuntime: true, baselineValue/);

  const commit = functionSource(client, "commitTransaction");
  assert.match(commit, /operationsAreEquivalent\(after, before\)/);
  assert.match(commit, /applyDataOperation\(before\); applyBridgeOperation\(before\)/);
  assert.match(functionSource(client, "applyBridgeOperation"), /if \(operation\.rebuildRuntime\)[\s\S]*?bridge\.applyEditorData\?\.\(data\)/);

  const snapshot = functionSource(client, "applySnapshot");
  assert.match(snapshot, /cancelCurrentAction\(\{ clearSelection: false \}\)/);
  assert.match(snapshot, /renderSelection\(\); renderOutliner\(\)/);
});

test("acciones mutantes liquidan el formulario activo antes de leer o encolar", () => {
  ["updateSelected", "addAsset", "addNpc", "addEntrance", "addEvent", "duplicateSelected", "deleteSelected",
    "undo", "redo", "transformSelectedAssets", "pasteSelection", "expandMap", "resetGroundOverrides"].forEach((name) => {
    assert.match(functionSource(client, name), /\)\s*\{\s*commitTransientTransactions\(\);/, `${name} debe confirmar primero`);
  });
  assert.match(functionSource(client, "deleteSelected"), /const inverse = entityBeforeOperation\(kind, entity\)/);
});

test("una operacion remota cancela intenciones locales coincidentes antes de aplicarse", () => {
  const remote = functionSource(client, "applyRemoteOperations");
  assert.match(remote, /const incomingKeys = new Set\(operations\.map\(operationKey\)\)/);
  assert.match(remote, /new Set\(\[drag\?\.transaction, activeTransaction, keyboardTransaction\?\.builder, formTransaction\?\.builder\]\.filter\(Boolean\)\)/);
  assert.match(remote, /new Set\(\[\.\.\.activeBuilders\]\.flatMap\(\(builder\) => builder\.command\(\)\.keys\)\)/);
  assert.match(remote, /\[drag\?\.beforeOperation, keyboardTransaction\?\.before, formTransaction\?\.before\]\.filter\(Boolean\)[\s\S]*?activeKeys\.add\(operationKey\(operation\)\)/);
  assert.match(remote, /drag\?\.groupBefore \|\| \[\][\s\S]*?activeKeys\.add\(operationKey\(\{ type: "entity\.set", entity: "asset", id: entity\.id \}\)\)/);
  assert.match(remote, /const interrupted = \[\.\.\.incomingKeys\]\.some\(\(key\) => activeKeys\.has\(key\)\)/);
  assert.match(remote, /if \(interrupted\) cancelCurrentAction\(\{ clearSelection: false \}\)/);
  const cancelIndex = remote.indexOf("cancelCurrentAction");
  const applyIndex = remote.indexOf("applyDataOperation(operation)");
  assert.ok(cancelIndex >= 0 && cancelIndex < applyIndex, "el gesto local debe revertirse antes de aplicar el remoto");
});

test("Escape solicita una cancelacion cancelable antes de cerrar el editor", () => {
  const handleKeyDown = functionSource(runtime, "handleKeyDown");
  assert.match(handleKeyDown, /new CustomEvent\("map-editor-cancel-request", \{ cancelable: true \}\)/);
  assert.match(handleKeyDown, /if \(document\.dispatchEvent\(cancelRequest\)\) closeBuildingEditorPanel\(\)/);
  assert.match(handleKeyDown, /event\.stopImmediatePropagation\(\)/);
  const requestIndex = handleKeyDown.indexOf('new CustomEvent("map-editor-cancel-request"');
  const dispatchIndex = handleKeyDown.indexOf("document.dispatchEvent(cancelRequest)", requestIndex);
  const closeIndex = handleKeyDown.indexOf("closeBuildingEditorPanel()", requestIndex);
  const stopIndex = handleKeyDown.indexOf("event.stopImmediatePropagation()", dispatchIndex);
  assert.ok(requestIndex >= 0 && requestIndex < closeIndex, "Escape debe ofrecer cancelar antes de cerrar");
  assert.ok(dispatchIndex >= 0 && dispatchIndex < stopIndex, "Escape debe detener otros listeners despues del protocolo cancelable");

  const bindings = functionSource(client, "bindUi");
  assert.match(bindings, /document\.addEventListener\("map-editor-cancel-request", \(event\) => \{/);
  assert.match(bindings, /if \(bridge\.isOpen\(\) && cancelCurrentAction\(\)\) event\.preventDefault\(\)/);
});

test("el pinch conserva un par estable con tres dedos, desplaza y usa un anchor de mundo", () => {
  const startPinch = functionSource(client, "startPinchGesture");
  assert.match(startPinch, /const pair = entries\.slice\(0, 2\)/);
  assert.match(startPinch, /pointerIds: pair\.map\(\(\[pointerId\]\) => pointerId\)/);
  assert.match(startPinch, /distance: Math\.max\(1, Math\.hypot/);
  assert.match(startPinch, /midpoint: \{ x: \(points\[0\]\.x \+ points\[1\]\.x\) \/ 2, y: \(points\[0\]\.y \+ points\[1\]\.y\) \/ 2 \}/);

  const pointerDown = functionSource(client, "onPointerDown");
  const pinchStart = pointerDown.indexOf("if (touchPointers.size >= 2)");
  const pinchEnd = pointerDown.indexOf("const point = bridge.canvasToWorld", pinchStart);
  assert.ok(pinchStart >= 0 && pinchEnd > pinchStart, "falta el inicio de pinch con dos toques");
  const pinch = pointerDown.slice(pinchStart, pinchEnd);

  assert.match(pinch, /const touchEntries = \[\.\.\.touchPointers\.entries\(\)\]/);
  assert.match(pinch, /if \(!pinchGesture\) \{[\s\S]*?if \(drag \|\| activeTransaction\) cancelCurrentAction\(\{ clearSelection: false \}\)/);
  assert.doesNotMatch(pinch, /commitTransaction\(/);
  assert.match(pinch, /touchEntries\.forEach\(\(\[pointerId, point\]\) => \{[\s\S]*?touchPointers\.set\(pointerId, point\)[\s\S]*?canvas\.setPointerCapture\?\.\(pointerId\)/);
  assert.match(pinch, /startPinchGesture\(touchEntries\)/);
  assert.ok(
    pinch.indexOf("cancelCurrentAction") < pinch.indexOf("touchEntries.forEach"),
    "los toques deben restaurarse despues de que cancelar limpie el gesto previo",
  );

  const pointerMove = functionSource(client, "onPointerMove");
  assert.match(pointerMove, /if \(!pinchGesture\.pointerIds\.includes\(event\.pointerId\)\) \{ event\.preventDefault\(\); return; \}/);
  assert.match(pointerMove, /const points = pinchGesture\.pointerIds\.map\(\(pointerId\) => touchPointers\.get\(pointerId\)\)/);
  assert.match(pointerMove, /bridge\.panBy\?\.\(pinchGesture\.midpoint\.x - midpoint\.x, pinchGesture\.midpoint\.y - midpoint\.y\)/);
  assert.match(pointerMove, /pinchGesture\.midpoint = midpoint/);
  assert.match(pointerMove, /const anchor = bridge\.canvasToWorld\(midpoint\.x, midpoint\.y\)/);
  assert.match(pointerMove, /setEditorZoom\(pinchGesture\.zoom \* distance \/ Math\.max\(1, pinchGesture\.distance\), anchor\)/);
  assert.doesNotMatch(pointerMove, /const anchor = \{ x:/);

  const pointerEnd = functionSource(client, "endPointer");
  assert.match(pointerEnd, /const changedPair = pinchGesture\?\.pointerIds\?\.includes\(event\.pointerId\)/);
  assert.match(pointerEnd, /if \(touchPointers\.size < 2\) pinchGesture = null;[\s\S]*?else if \(changedPair\) startPinchGesture\(\)/);
});

test("el catalogo selecciona, arrastra y coloca objetos en las coordenadas del canvas", () => {
  assert.match(client, /const safelyStore = \(target, key, value\) => \{[\s\S]*?try \{ target\?\.setItem\(key, value\); return Boolean\(target\); \}[\s\S]*?catch \{ return false; \}/);
  assert.match(functionSource(client, "addAsset"), /safelyStore\(persistentStorage, "pokemon-map-editor-recent-assets"/);
  const renderCatalog = functionSource(client, "renderAssetCatalog");
  assert.match(renderCatalog, /select\.setAttribute\("role", "option"\)/);
  assert.match(renderCatalog, /select\.setAttribute\("aria-selected", String\(prototypeSelect\.value === id\)\)/);
  assert.match(renderCatalog, /select\.dataset\.catalogAsset = id/);
  assert.match(renderCatalog, /select\.draggable = true/);

  const bindings = functionSource(client, "bindUi");
  assert.match(bindings, /#assetCatalogGrid"\)\?\.addEventListener\("click",[\s\S]*?prototypeSelect\.value = id;[\s\S]*?renderAssetCatalog\(\)/);
  const dragStartIndex = bindings.indexOf('$("#assetCatalogGrid")?.addEventListener("dragstart"');
  const dragEndIndex = bindings.indexOf('$("#assetCatalogGrid")?.addEventListener("dragend"', dragStartIndex);
  const dragStart = bindings.slice(dragStartIndex, dragEndIndex);
  assert.ok(dragStartIndex >= 0 && dragEndIndex > dragStartIndex, "faltan los eventos de arrastre del catalogo");
  assert.match(dragStart, /draggedCatalogAssetId = option\.dataset\.catalogAsset/);
  assert.match(dragStart, /catalogLastActivation = \{ id: "", at: 0 \}/);
  assert.match(dragStart, /editor\.dataset\.catalogDrag = "true"/);
  assert.match(dragStart, /effectAllowed = "copy"/);
  assert.match(dragStart, /setData\("application\/x-pokemon-map-asset", draggedCatalogAssetId\)/);
  assert.doesNotMatch(dragStart, /prototypeSelect\.value|setSelected\(/);
  const dragEndEnd = bindings.indexOf("prototypeSelect.addEventListener", dragEndIndex);
  const dragEnd = bindings.slice(dragEndIndex, dragEndEnd);
  assert.match(dragEnd, /draggedCatalogAssetId = ""/);
  assert.match(dragEnd, /delete editor\.dataset\.catalogDrag/);
  assert.match(bindings, /canvas\.addEventListener\("dragover",[\s\S]*?includes\("application\/x-pokemon-map-asset"\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?dropEffect = "copy"/);
  assert.match(bindings, /canvas\.addEventListener\("drop",[\s\S]*?getData\("application\/x-pokemon-map-asset"\) \|\| draggedCatalogAssetId[\s\S]*?bridge\.assetCatalog\(\)\[sprite\][\s\S]*?draggedCatalogAssetId = ""[\s\S]*?catalogLastActivation = \{ id: "", at: 0 \}[\s\S]*?delete editor\.dataset\.catalogDrag[\s\S]*?prototypeSelect\.value = sprite[\s\S]*?setMode\("objects"\)[\s\S]*?addAsset\(sprite, bridge\.canvasToWorld\(event\.clientX, event\.clientY\)\)/);

  const dragCue = cssRuleSource(css, '#gameCard:has(.building-editor[data-catalog-drag="true"]) #worldCanvas');
  assert.match(dragCue, /outline:\s*\d+px solid/);
  assert.match(dragCue, /box-shadow:\s*inset/);
});

test("plegar y ampliar funcionan en escritorio y mantienen su estado accesible", () => {
  assert.match(html, /id="mapEditorSheetToggle"[^>]*aria-expanded="true"/);
  assert.match(html, /id="mapEditorExpandSheetButton"[^>]*aria-pressed="false"/);

  const prepare = functionSource(client, "prepareOpenEditor");
  assert.match(prepare, /editor\.classList\.remove\("collapsed"\)/);
  assert.match(prepare, /editor\.classList\.remove\("fullscreen-inspector"\)/);
  assert.match(prepare, /#mapEditorSheetToggle"\)\?\.setAttribute\("aria-expanded", "true"\)/);
  assert.match(prepare, /#mapEditorExpandSheetButton"\)\?\.setAttribute\("aria-pressed", "false"\)/);

  const bindings = functionSource(client, "bindUi");
  const collapseStart = bindings.indexOf('$("#mapEditorSheetToggle")?.addEventListener("click"');
  const expandStart = bindings.indexOf('$("#mapEditorExpandSheetButton")?.addEventListener("click"', collapseStart);
  const expandEnd = bindings.indexOf('$("#mapEditorSearchInput")?.addEventListener', expandStart);
  assert.ok(collapseStart >= 0 && expandStart > collapseStart && expandEnd > expandStart, "faltan los controles de plegado y ampliacion");
  const collapse = bindings.slice(collapseStart, expandStart);
  const expand = bindings.slice(expandStart, expandEnd);
  assert.match(collapse, /editor\.classList\.toggle\("collapsed"\)/);
  assert.match(collapse, /const expanded = !editor\.classList\.contains\("collapsed"\)/);
  assert.match(collapse, /setAttribute\("aria-expanded", String\(expanded\)\)/);
  assert.match(expand, /const expanded = editor\.classList\.toggle\("fullscreen-inspector"\)/);
  assert.match(expand, /editor\.classList\.remove\("collapsed"\)/);
  assert.match(expand, /#mapEditorSheetToggle"\)\?\.setAttribute\("aria-expanded", "true"\)/);
  assert.match(expand, /#mapEditorExpandSheetButton"\)\?\.setAttribute\("aria-pressed", String\(expanded\)\)/);
});

test("el diagnostico global conserva estructura accesible dentro de las opciones secundarias", () => {
  for (const id of [
    "mapEditorDiagnostics",
    "mapEditorDiagnosticsCount",
    "mapEditorDiagnosticsStatus",
    "mapEditorDiagnosticsRefresh",
    "mapEditorDiagnosticsList",
  ]) {
    assert.match(html, new RegExp(`\\bid="${id}"`), `falta #${id}`);
  }

  assert.match(html, /<details id="mapEditorDiagnostics" class="map-editor-diagnostics"[^>]*>/);
  assert.match(html, /<summary>[^<]*<span id="mapEditorDiagnosticsCount" data-state="ok">0<\/span><\/summary>/);
  assert.match(html, /<p id="mapEditorDiagnosticsStatus" data-state="ok" role="status">/);
  assert.match(html, /<button id="mapEditorDiagnosticsRefresh" type="button">/);
  assert.match(html, /<ol id="mapEditorDiagnosticsList" aria-live="polite"><\/ol>/);

  const secondary = html.indexOf('id="mapEditorSecondaryPanel"');
  const diagnostics = html.indexOf('id="mapEditorDiagnostics"');
  const overlays = html.indexOf('id="mapEditorOverlayPanel"');
  assert.ok(secondary >= 0 && secondary < diagnostics && diagnostics < overlays, "diagnostico debe vivir en el panel secundario antes de las capas");
});

test("el escaneo diagnostica entidades, limites, duplicados, dialogo, vinculos y transiciones", () => {
  const collect = functionSource(client, "collectMapDiagnostics");
  assert.match(collect, /const entities = allEditorEntities\(\)/);
  assert.match(collect, /const seen = new Set\(\)/);
  assert.match(collect, /const occupiedTransitions = new Map\(\)/);
  assert.match(collect, /const rawSeen = new Set\(\)/);
  assert.match(collect, /\["asset", data\.addedAssets\], \["npc", data\.addedNpcs\]/);
  assert.match(collect, /\["entrance", data\.entrances\], \["event", data\.events\]/);
  assert.match(collect, /Array\.isArray\(records\) \? records : \[\]/);
  assert.match(collect, /const entity = record && typeof record === "object" && !Array\.isArray\(record\) \? record : \{\}/);
  assert.match(collect, /rawSeen\.has\(rawKey\)[\s\S]*?rawSeen\.add\(rawKey\)/);
  assert.match(collect, /contextualEntityValidation\(kind, clone\(record\)\)/);
  assert.match(collect, /seen\.has\(key\)[\s\S]*?seen\.add\(key\)/);
  assert.match(collect, /contextualEntityValidation\(kind, clone\(entity\)\)/);
  assert.match(collect, /const positionKey = `\$\{entity\.col\},\$\{entity\.row\}`[\s\S]*?occupiedTransitions\.get\(positionKey\)[\s\S]*?occupiedTransitions\.set\(positionKey/);
  assert.match(collect, /return \[\.\.\.new Map\(issues\.map/);

  const contextual = functionSource(client, "contextualEntityValidation");
  assert.match(contextual, /validateEditorEntity\(kind, entity\)/);
  assert.match(contextual, /if \(!entity \|\| typeof entity !== "object" \|\| Array\.isArray\(entity\)\) return result/);
  assert.match(contextual, /const grid = bridge\.grid\(\)/);
  assert.match(contextual, /positionIsFinite[\s\S]*?insideGrid/);
  assert.match(contextual, /kind === "asset"[\s\S]*?grid\.cols \* grid\.tileSize[\s\S]*?grid\.rows \* grid\.tileSize/);
  assert.match(contextual, /kind === "npc" && entity\.patrol\?\.to[\s\S]*?patrolInside[\s\S]*?lineCells/);
  assert.match(contextual, /const dialogueLines = Array\.isArray\(entity\.lines\) \? entity\.lines : \[\]/);
  assert.match(contextual, /kind === "entrance" && entity\.linkedAssetId && !bridge\.assets\(\)\.some/);
  assert.match(contextual, /kind === "event"[\s\S]*?overlaps[\s\S]*?bridge\.tileType\(col, row\) === "blocked"/);
  assert.match(contextual, /targetsCurrentMap[\s\S]*?hasTarget[\s\S]*?targetX[\s\S]*?grid\.cols \* grid\.tileSize/);
  assert.match(contextual, /result\.errors = \[\.\.\.new Set\(result\.errors\)\]; result\.warnings = \[\.\.\.new Set\(result\.warnings\)\]/);

  const render = functionSource(client, "renderMapDiagnostics");
  assert.match(render, /issues\.filter\(\(issue\) => issue\.severity === "error"\)/);
  assert.match(render, /count\.dataset\.state = errors \? "error" : warnings \? "warning" : "ok"/);
  assert.match(render, /status\.dataset\.state = errors \? "error" : warnings \? "warning" : "ok"/);
  assert.match(render, /issues\.slice\(0, 50\)/);
  assert.match(render, /if \(issue\.navigable\) button\.dataset\.diagnosticEntity = selectionKey\(issue\.kind, issue\.id\);[\s\S]*?else button\.disabled = true/);

  const schedule = functionSource(client, "scheduleMapDiagnostics");
  assert.match(schedule, /window\.clearTimeout\(diagnosticsTimer\)/);
  assert.match(schedule, /window\.setTimeout\(renderMapDiagnostics, delay\)/);
  assert.match(functionSource(client, "renderOutliner"), /scheduleMapDiagnostics\(\)/);

  const bindings = functionSource(client, "bindUi");
  assert.match(bindings, /#mapEditorDiagnosticsRefresh"\)\?\.addEventListener\("click", renderMapDiagnostics\)/);
  assert.match(bindings, /#mapEditorDiagnosticsList"\)\?\.addEventListener\("click",[\s\S]*?closest\("\[data-diagnostic-entity\]"\)/);
  assert.match(bindings, /const nextMode = \{ asset: "objects", npc: "npcs", entrance: "entrances", event: "events" \}\[kind\]/);
  assert.match(bindings, /if \(!nextMode \|\| !id \|\| !entityById\(kind, id\)\) return/);
  assert.match(bindings, /setMode\(nextMode\); setSelected\(kind, id\); bridge\.focusEntity\?\.\(kind, id\)/);
});

test("el diagnostico distingue estados y mantiene resultados navegables y tactiles", () => {
  assert.match(cssRuleSource(css, ".map-editor-diagnostics"), /overflow:\s*hidden/);
  assert.match(cssRuleSource(css, ".map-editor-diagnostics > summary"), /min-height:\s*(?:4[0-9]|[5-9][0-9])px/);
  assert.match(cssRuleSource(css, ".map-editor-diagnostics-heading button"), /min-height:\s*(?:4[0-9]|[5-9][0-9])px/);
  assert.match(cssRuleSource(css, ".map-editor-diagnostics ol"), /max-height:\s*\d+px/);
  assert.match(cssRuleSource(css, ".map-editor-diagnostics ol"), /overflow-y:\s*auto/);
  assert.match(cssRuleSource(css, ".map-editor-diagnostics li button"), /min-height:\s*(?:4[0-9]|[5-9][0-9])px/);
  assert.match(css, /\.map-editor-diagnostics > summary span\[data-state="warning"\]/);
  assert.match(css, /\.map-editor-diagnostics > summary span\[data-state="error"\]/);
  assert.match(css, /\.map-editor-diagnostics-heading p\[data-state="warning"\]/);
  assert.match(css, /\.map-editor-diagnostics-heading p\[data-state="error"\]/);
  assert.match(css, /\.map-editor-diagnostics li\[data-state="error"\]/);
});

function functionSource(source, name) {
  const signature = new RegExp(`\\bfunction\\s+${name}\\s*\\(`);
  const match = signature.exec(source);
  assert.ok(match, `falta function ${name}()`);
  const parametersOpen = source.indexOf("(", match.index);
  let parametersDepth = 0;
  let open = -1;
  for (let index = parametersOpen; index < source.length; index += 1) {
    if (source[index] === "(") parametersDepth += 1;
    else if (source[index] === ")" && --parametersDepth === 0) {
      open = source.indexOf("{", index + 1);
      break;
    }
  }
  assert.ok(open >= 0, `falta el cuerpo de function ${name}()`);

  let depth = 1;
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  for (let index = open + 1; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(match.index, index + 1);
  }
  assert.fail(`function ${name}() no tiene cierre`);
}

function cssRuleSource(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  assert.ok(match, `falta la regla CSS ${selector}`);
  return match[1];
}
