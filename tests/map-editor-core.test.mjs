import assert from "node:assert/strict";
import { test } from "node:test";
import { groundPaintLayers, isGroundPaintValue, MAP_EDITOR_RULES, validateEditorEntity, validateEditorOperation, validateMapEditorData } from "../map-editor-contract.js";
import {
  boundedBrushCells,
  changedKeysSince,
  chunkOperationBatches,
  CommandBuilder,
  DurableOutboxQueue,
  floodFillCells,
  groundPathConnectionMask,
  groundPathSurface,
  groundPathType,
  isGroundPathType,
  lineCells,
  mergeGroundPaintValue,
  MemoryOutboxAdapter,
  PresenceGate,
  resolveEditorShortcut,
  resolveConflictQueue,
  TransactionHistory,
} from "../map-editor-core.js";

function tileOperation(col, row, value) {
  return { type: "tile.set", key: `${col},${row}`, value };
}

test("los senderos orientan rectas, curvas, cruces y uniones entre acabados", () => {
  const values = new Map();
  const getValue = (col, row) => values.get(`${col},${row}`) || "grass";
  const maskAt = (col, row) => groundPathConnectionMask({ col, row, getValue, bounds: { cols: 12, rows: 12 } });
  const paint = (col, row, surface = "dirt") => values.set(`${col},${row}`, groundPathType(surface));

  paint(5, 5); paint(5, 4, "grass"); paint(6, 5, "asphalt");
  assert.equal(maskAt(5, 5), 3, "la esquina conecta norte y este");
  paint(5, 6); assert.equal(maskAt(5, 5), 7, "la unión en T añade el sur");
  paint(4, 5, "sidewalk"); assert.equal(maskAt(5, 5), 15, "el cruce conecta las cuatro direcciones");

  assert.equal(groundPathSurface("path-asphalt"), "asphalt");
  assert.equal(isGroundPathType("path-grass"), true);
  assert.equal(isGroundPathType("grass"), false);
  assert.equal(groundPathType("unknown"), null);
  assert.equal(validateEditorOperation({ type: "ground.set", key: "5,5", value: "path-dirt" }).valid, true);
});

test("el sendero conserva el suelo base y el valor compuesto sigue siendo válido", () => {
  assert.equal(mergeGroundPaintValue("grass", "path-asphalt"), "grass|path-asphalt");
  assert.equal(mergeGroundPaintValue("grass|path-dirt", "path-asphalt"), "grass|path-asphalt");
  assert.equal(mergeGroundPaintValue("grass|path-asphalt", "sand"), "sand|path-asphalt");
  assert.deepEqual(groundPaintLayers("grass|path-asphalt"), { base: "grass", path: "path-asphalt" });
  assert.equal(groundPathSurface("grass|path-asphalt"), "asphalt");
  assert.equal(isGroundPathType("grass|path-asphalt"), true);
  assert.equal(isGroundPaintValue("grass|path-asphalt"), true);
  assert.equal(isGroundPaintValue("path-asphalt|grass"), false);
  assert.equal(validateEditorOperation({ type: "ground.set", key: "5,5", value: "grass|path-asphalt" }).valid, true);
  assert.equal(validateEditorOperation({ type: "ground.set", key: "5,5", value: "grass|asphalt" }).valid, false);
  assert.equal(validateEditorOperation({ type: "ground.set", key: "5,5", value: "grass|path-unknown" }).valid, false);

  const values = new Map([["3,3", "grass|path-dirt"], ["4,3", "sand|path-asphalt"]]);
  assert.equal(groundPathConnectionMask({
    col: 3, row: 3, getValue: (col, row) => values.get(`${col},${row}`), bounds: { cols: 8, rows: 8, maxCols: 8, maxRows: 8 },
  }), 2, "los caminos compuestos también conectan por el este");
});

test("un trazo 5×5 en borde forma un solo comando deshacer/rehacer", () => {
  const cells = boundedBrushCells({ col: 0, row: 0, size: 5 });
  assert.equal(cells.length, 9);
  assert.equal(cells.every(({ col, row }) => col >= 0 && row >= 0 && col < MAP_EDITOR_RULES.world.cols && row < MAP_EDITOR_RULES.world.rows), true);

  const builder = new CommandBuilder("Pintar terreno", { id: "stroke-1", revision: 4 });
  cells.forEach(({ col, row }) => builder.stage(tileOperation(col, row, "blocked"), tileOperation(col, row, null)));
  const history = new TransactionHistory();
  assert.equal(history.push(builder.command()), true);
  assert.equal(history.undoStack.length, 1);
  const undone = history.undo();
  assert.equal(undone.command.before.length, 9);
  assert.equal(undone.conflicts.length, 0);
  const redone = history.redo();
  assert.equal(redone.after.length, 9);
  assert.equal(history.undoStack.length, 1);
});

test("arrastre y formulario coalescen cambios repetidos de la misma entidad", () => {
  const before = { type: "entity.set", entity: "asset", collection: "assetOverrides", id: "house", value: { x: 10, y: 20 } };
  const builder = new CommandBuilder("Mover objeto", { id: "drag-1" });
  builder.stage({ ...before, value: { x: 11, y: 20 } }, before);
  builder.stage({ ...before, value: { x: 120, y: 220 } }, before);
  const command = builder.command();
  assert.equal(command.after.length, 1);
  assert.deepEqual(command.before[0].value, { x: 10, y: 20 });
  assert.deepEqual(command.after[0].value, { x: 120, y: 220 });
});

test("deshacer no pisa una clave cambiada remotamente", () => {
  const builder = new CommandBuilder("Editar casa", { id: "own-change" });
  const before = { type: "entity.set", entity: "asset", collection: "assetOverrides", id: "house", value: { x: 10 } };
  builder.stage({ ...before, value: { x: 20 } }, before);
  const history = new TransactionHistory(); history.push(builder.command());
  const result = history.undo({ changedKeys: new Set(["entity:asset:house"]) });
  assert.deepEqual(result.conflicts, ["entity:asset:house"]);
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);
});

test("deshacer solo se bloquea por cambios remotos posteriores a la acción local", () => {
  const key = "entity:asset:house";
  const before = { type: "entity.set", entity: "asset", collection: "assetOverrides", id: "house", value: { x: 10 } };
  const builder = new CommandBuilder("Editar casa", { id: "own-after-remote", revision: 4 });
  builder.stage({ ...before, value: { x: 20 } }, before);

  const safeHistory = new TransactionHistory(); safeHistory.push(builder.command());
  const remoteBefore = changedKeysSince(new Map([[key, 3]]), safeHistory.peekUndo().revision);
  assert.equal(safeHistory.undo({ changedKeys: remoteBefore }).conflicts.length, 0);

  const blockedHistory = new TransactionHistory(); blockedHistory.push(builder.command());
  const remoteAfter = changedKeysSince(new Map([[key, 5]]), blockedHistory.peekUndo().revision);
  assert.deepEqual(blockedHistory.undo({ changedKeys: remoteAfter }).conflicts, [key]);
});

test("la bandeja durable recupera cambios tras recarga y conserva memoria si falla el disco", async () => {
  const adapter = new MemoryOutboxAdapter();
  const first = new DurableOutboxQueue(adapter, { actorId: "alice" });
  await first.enqueue({ id: "tx-1", label: "Cambio", baseRevision: 2, operations: [tileOperation(4, 5, "event")] });
  assert.equal(first.durable, true);

  const reloaded = new DurableOutboxQueue(adapter, { actorId: "alice" });
  const recovered = await reloaded.recover();
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].operations[0].key, "4,5");

  adapter.failWrites = true;
  await assert.rejects(reloaded.enqueue({ id: "tx-2", operations: [tileOperation(6, 6, "blocked")] }), /outbox write failed/);
  assert.equal(reloaded.durable, false);
  assert.deepEqual(reloaded.snapshot().map(({ id }) => id), ["tx-1", "tx-2"]);
});

test("la bandeja no recupera lotes pertenecientes a otra sesión", async () => {
  const adapter = new MemoryOutboxAdapter({
    version: 2,
    actorId: "alice",
    batches: [{ id: "alice-1", operations: [tileOperation(1, 1, "blocked")] }],
  });
  const bob = new DurableOutboxQueue(adapter, { actorId: "bob" });
  assert.deepEqual(await bob.recover(), []);
});

test("presencia deduplica reposo, limita movimiento y mantiene heartbeat", () => {
  const gate = new PresenceGate({ movementInterval: 110, heartbeatInterval: 12000 });
  const idle = { name: "Alice", mode: "terrain", cursor: { x: 10, y: 20 } };
  assert.equal(gate.decision(idle, 0).send, true);
  assert.equal(gate.decision(idle, 110).send, false);
  assert.equal(gate.decision({ ...idle, cursor: { x: 11, y: 20 } }, 50).send, false);
  assert.equal(gate.decision({ ...idle, cursor: { x: 11, y: 20 } }, 110).send, true);
  assert.equal(gate.decision({ ...idle, cursor: { x: 11, y: 20 } }, 12109, { heartbeat: true }).send, false);
  assert.equal(gate.decision({ ...idle, cursor: { x: 11, y: 20 } }, 12110, { heartbeat: true }).send, true);
});

test("presencia publica los cambios de mapa e interior", () => {
  const gate = new PresenceGate({ movementInterval: 50, heartbeatInterval: 12000 });
  const outside = {
    name: "Alice",
    mode: "objects",
    player: { x: 480, y: 560, direction: "up", dimension: "san_pablo", interior: null, moving: false },
  };
  assert.equal(gate.decision(outside, 0).send, true);
  assert.equal(gate.decision({
    ...outside,
    player: { ...outside.player, dimension: "prism" },
  }, 50).send, true);
  assert.equal(gate.decision({
    ...outside,
    player: { ...outside.player, interior: "interior:casa-azul:abc" },
  }, 100).send, true);
});

test("una transacción grande usa fragmentos idempotentes únicos y conserva su grupo", () => {
  const operations = Array.from({ length: 600 }, (_, index) => tileOperation(index % 79, Math.floor(index / 79), "blocked"));
  const longId = `tx-${"x".repeat(77)}`;
  const batches = chunkOperationBatches(operations, { id: longId, label: "Rellenar", baseRevision: 4 });
  assert.deepEqual(batches.map((batch) => batch.operations.length), [256, 256, 88]);
  assert.equal(new Set(batches.map((batch) => batch.transactionId)).size, 3);
  assert.equal(new Set(batches.map((batch) => batch.groupId)).size, 1);
  assert.equal(batches.every((batch) => batch.transactionId.length <= MAP_EDITOR_RULES.lengths.id), true);
});

test("resolver un conflicto descarta o reagrupa todos los fragmentos de la acción lógica", () => {
  const conflicted = chunkOperationBatches(Array.from({ length: 600 }, (_, index) => tileOperation(index % 79, Math.floor(index / 79), "event")), {
    id: "fill-original", label: "Rellenar", baseRevision: 1,
  });
  const later = chunkOperationBatches([tileOperation(70, 70, "blocked")], { id: "later", baseRevision: 1 });
  const keepServer = resolveConflictQueue([...conflicted, ...later], conflicted[0], { action: "server", revision: 8 });
  assert.deepEqual(keepServer.map((batch) => batch.groupId), ["later"]);
  assert.equal(keepServer[0].baseRevision, 8);

  const reapply = resolveConflictQueue([...conflicted, ...later], conflicted[0], { action: "reapply", revision: 8, retryId: "retry-fill" });
  assert.deepEqual(reapply.map((batch) => batch.operations.length), [256, 256, 88, 1]);
  assert.equal(new Set(reapply.slice(0, 3).map((batch) => batch.transactionId)).size, 3);
  assert.equal(reapply.slice(0, 3).every((batch) => batch.groupId === "retry-fill" && batch.baseRevision === 8), true);
  assert.equal(reapply[3].baseRevision, 8);
});

test("cliente y servidor comparten límites y rechazan sin truncar", () => {
  const tooLong = "x".repeat(MAP_EDITOR_RULES.lengths.eventMessage + 1);
  const event = { id: "bad-event", col: 2, row: 3, type: "dialogue", trigger: "step", message: tooLong };
  assert.equal(validateEditorEntity("event", event).valid, false);
  const operation = { type: "entity.set", entity: "event", collection: "events", id: event.id, value: event };
  const validation = validateEditorOperation(operation);
  assert.equal(validation.valid, false);
  assert.equal(operation.value.message.length, MAP_EDITOR_RULES.lengths.eventMessage + 1);

  const outside = validateEditorEntity("entrance", {
    id: "bad-exit", col: 1, row: 1, action: "transition", targetMap: "current",
    targetX: MAP_EDITOR_RULES.world.maxWidth + 1, targetY: 20,
  });
  assert.equal(outside.valid, false);
  assert.match(outside.errors.join(" "), /Destino X/);
});

test("NPC y entradas aceptan escenas, y exit solo es válido dentro de un interior", () => {
  const scene = "interior:casa-prueba:abc";
  assert.equal(validateEditorEntity("npc", {
    id: "npc-interior", col: 3, row: 4, scene, sprite: "guide", direction: "down", lines: ["Hola"],
  }).valid, true);
  assert.equal(validateEditorEntity("entrance", {
    id: "salida-interior", col: 14, row: 17, scene, action: "exit",
  }).valid, true);
  assert.equal(validateEditorEntity("entrance", {
    id: "salida-exterior", col: 14, row: 17, scene: "world", action: "exit",
  }).valid, false);
  assert.equal(validateEditorEntity("entrance", {
    id: "salida-mala", col: 14, row: 17, scene: "../interior", action: "exit",
  }).valid, false);
});

test("el snapshot exige arrays y diccionarios en sus colecciones publicas", () => {
  const valid = validateMapEditorData({
    addedAssets: [],
    hiddenAssets: [],
    entrances: [],
    events: [],
    tileOverrides: {},
    groundOverrides: {},
    assetOverrides: {},
    npcOverrides: {},
  });
  assert.equal(valid.valid, true, valid.errors.join("\n"));

  for (const name of ["addedAssets", "hiddenAssets", "entrances", "events"]) {
    const result = validateMapEditorData({ [name]: {} });
    assert.equal(result.valid, false, name + " debe rechazar un objeto");
    assert.match(result.errors.join(" "), new RegExp(name));
  }
  for (const name of ["tileOverrides", "groundOverrides", "assetOverrides", "npcOverrides"]) {
    const result = validateMapEditorData({ [name]: [] });
    assert.equal(result.valid, false, name + " debe rechazar un array");
    assert.match(result.errors.join(" "), new RegExp(name));
  }
});

test("los atajos del espacio de trabajo son contextuales y no pisan modificadores", () => {
  assert.deepEqual(resolveEditorShortcut({ key: "2" }), { type: "mode", value: "terrain" });
  assert.deepEqual(resolveEditorShortcut({ key: "E", mode: "terrain" }), { type: "paint.tool", value: "eraser" });
  assert.deepEqual(resolveEditorShortcut({ key: "P", mode: "ground" }), { type: "paint.tool", value: "path" });
  assert.deepEqual(resolveEditorShortcut({ key: "]", mode: "ground" }), { type: "brush.size", value: 1 });
  assert.deepEqual(resolveEditorShortcut({ key: "-", mode: "terrain" }), { type: "brush.size", value: -1 });
  assert.deepEqual(resolveEditorShortcut({ key: "+", mode: "terrain", shift: true }), { type: "brush.size", value: 1 });
  assert.deepEqual(resolveEditorShortcut({ key: "a", mode: "objects", modifier: true }), { type: "selection.all" });
  assert.deepEqual(resolveEditorShortcut({ key: "a", mode: "objects", modifier: true, shift: true }), { type: "selection.clear" });
  assert.deepEqual(resolveEditorShortcut({ key: "g", mode: "objects", modifier: true }), { type: "selection.group" });
  assert.equal(resolveEditorShortcut({ key: "p", mode: "terrain" }), null);
  assert.equal(resolveEditorShortcut({ key: "e", mode: "objects" }), null);
  assert.equal(resolveEditorShortcut({ key: "e", mode: "terrain", alt: true }), null);
});

test("líneas y relleno respetan bounds {cols, rows} y rechazan extremos inválidos", () => {
  const bounds = { cols: 4, rows: 3 };
  assert.deepEqual(lineCells({ col: 0, row: 0 }, { col: 3, row: 2 }, bounds), [
    { col: 0, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 2 },
  ]);
  assert.deepEqual(lineCells({ col: 3, row: 2 }, { col: 3, row: 0 }, bounds), [
    { col: 3, row: 2 }, { col: 3, row: 1 }, { col: 3, row: 0 },
  ]);

  const filled = floodFillCells({
    start: { col: 0, row: 0 },
    bounds,
    getValue: (col) => col < 2 ? "grass" : "blocked",
  });
  assert.equal(filled.length, 6);
  assert.ok(filled.every(({ col, row }) => col >= 0 && col < 2 && row >= 0 && row < bounds.rows));

  assert.deepEqual(lineCells({ col: 0, row: 0 }, { col: bounds.cols, row: 2 }, bounds), []);
  assert.deepEqual(lineCells({ col: 0, row: 0 }, { col: 3, row: bounds.rows }, bounds), []);
  assert.deepEqual(floodFillCells({ start: { col: bounds.cols, row: 0 }, bounds, getValue: () => "grass" }), []);
  assert.deepEqual(lineCells({ col: 1, row: 1 }, { col: Number.NaN, row: 2 }, bounds), []);
});
