import { groundPaintLayers, MAP_EDITOR_RULES, editorOperationKey } from "./map-editor-contract.js?v=3";

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const cellInBounds = (col, row, bounds = MAP_EDITOR_RULES.world) => {
  const cols = Number(bounds?.cols ?? bounds?.maxCols);
  const rows = Number(bounds?.rows ?? bounds?.maxRows);
  return Number.isInteger(col) && Number.isInteger(row) && Number.isInteger(cols) && Number.isInteger(rows)
    && col >= 0 && row >= 0 && col < cols && row < rows;
};

export const EDITOR_MODE_ORDER = Object.freeze(["objects", "terrain", "ground", "npcs", "entrances", "events"]);

export function resolveEditorShortcut({ key = "", mode = "objects", modifier = false, shift = false, alt = false } = {}) {
  const normalized = String(key).toLowerCase();
  if (alt) return null;
  if (modifier) {
    if (normalized === "a" && mode === "objects") return { type: shift ? "selection.clear" : "selection.all" };
    if (normalized === "g" && mode === "objects") return { type: "selection.group" };
    return null;
  }
  const modeIndex = Number(normalized) - 1;
  if (Number.isInteger(modeIndex) && modeIndex >= 0 && modeIndex < EDITOR_MODE_ORDER.length) {
    return { type: "mode", value: EDITOR_MODE_ORDER[modeIndex] };
  }
  if (normalized === "escape") return { type: "cancel" };
  if (normalized === "/") return { type: "search" };
  if (normalized === "c") return { type: "selection.center" };
  if (["[", "]", "-", "_", "+", "="].includes(normalized) && (mode === "terrain" || mode === "ground")) {
    return { type: "brush.size", value: ["[", "-", "_"].includes(normalized) ? -1 : 1 };
  }
  if (mode !== "terrain" && mode !== "ground") return null;
  const tools = { b: "pencil", e: "eraser", i: "eyedropper", r: "rectangle", f: "fill" };
  if (mode === "ground") tools.p = "path";
  return tools[normalized] ? { type: "paint.tool", value: tools[normalized] } : null;
}

export function chunkOperationBatches(operations, { id, label = "Cambio", baseRevision = 0, createdAt = Date.now(), maximum = MAP_EDITOR_RULES.limits.operationsPerBatch } = {}) {
  const source = Array.isArray(operations) ? operations : [];
  const groupId = String(id || "").slice(0, MAP_EDITOR_RULES.lengths.id);
  if (!groupId || !source.length) return [];
  const batches = [];
  for (let index = 0; index < source.length; index += maximum) {
    const part = Math.floor(index / maximum); const suffix = `-${part}`;
    const transactionId = `${groupId.slice(0, MAP_EDITOR_RULES.lengths.id - suffix.length)}${suffix}`;
    batches.push({ id: transactionId, transactionId, groupId, label, baseRevision, createdAt, operations: clone(source.slice(index, index + maximum)) });
  }
  return batches;
}

export function resolveConflictQueue(batches, rejectedBatch, { action = "server", revision = 0, retryId = `retry-${Date.now()}` } = {}) {
  const queue = clone(Array.isArray(batches) ? batches : []);
  const rejected = clone(rejectedBatch || null);
  const rejectedGroup = rejected?.groupId || rejected?.id;
  const sameLogicalChange = (batch) => rejectedGroup && (batch.groupId || batch.id) === rejectedGroup;
  const rejectedGroupBatches = queue.filter(sameLogicalChange);
  const remaining = queue.filter((batch) => !sameLogicalChange(batch)).map((batch) => ({ ...batch, baseRevision: revision }));
  if (action !== "reapply") return remaining;
  const source = rejectedGroupBatches.length ? rejectedGroupBatches : (rejected ? [rejected] : []);
  const operations = source.flatMap((batch) => batch.operations || []);
  if (!operations.length) return remaining;
  const reapplied = chunkOperationBatches(operations, {
    id: retryId,
    label: rejected?.label || source[0]?.label || "Reaplicar cambio",
    baseRevision: revision,
    createdAt: Date.now(),
  });
  return [...reapplied, ...remaining];
}

export function boundedBrushCells({ col, row, size = 1, cols = MAP_EDITOR_RULES.world.cols, rows = MAP_EDITOR_RULES.world.rows }) {
  const brushSize = Math.max(1, Math.min(15, Math.floor(Number(size) || 1)));
  const radius = Math.floor(brushSize / 2);
  const cells = [];
  for (let currentRow = row - radius; currentRow <= row + radius; currentRow += 1) {
    for (let currentCol = col - radius; currentCol <= col + radius; currentCol += 1) {
      if (currentCol >= 0 && currentRow >= 0 && currentCol < cols && currentRow < rows) cells.push({ col: currentCol, row: currentRow });
    }
  }
  return cells;
}

export const GROUND_PATH_PREFIX = "path-";

export function groundPathType(surface) {
  const normalized = String(surface || "").replace(/^path-/, "");
  return MAP_EDITOR_RULES.types.ground.includes(normalized)
    && MAP_EDITOR_RULES.types.ground.includes(`${GROUND_PATH_PREFIX}${normalized}`)
    ? `${GROUND_PATH_PREFIX}${normalized}`
    : null;
}

export function groundPathSurface(type) {
  const path = groundPaintLayers(type)?.path;
  return path ? path.slice(GROUND_PATH_PREFIX.length) : null;
}

export function isGroundPathType(type) {
  return groundPathSurface(type) !== null;
}

export function mergeGroundPaintValue(current, selected) {
  if (selected == null || selected === "inherit") return null;
  const next = groundPaintLayers(selected);
  if (!next) return null;
  if (next.base && next.path) return selected;
  const previous = groundPaintLayers(current) || { base: null, path: null };
  const base = next.base || previous.base;
  const path = next.path || previous.path;
  return base && path ? `${base}|${path}` : (base || path || null);
}

export function groundPathConnectionMask({ col, row, getValue, bounds = MAP_EDITOR_RULES.world }) {
  if (!Number.isInteger(col) || !Number.isInteger(row) || typeof getValue !== "function" || !isGroundPathType(getValue(col, row))) return 0;
  const directions = [
    { bit: 1, col: 0, row: -1 },
    { bit: 2, col: 1, row: 0 },
    { bit: 4, col: 0, row: 1 },
    { bit: 8, col: -1, row: 0 },
  ];
  return directions.reduce((mask, direction) => {
    const neighborCol = col + direction.col; const neighborRow = row + direction.row;
    return cellInBounds(neighborCol, neighborRow, bounds) && isGroundPathType(getValue(neighborCol, neighborRow))
      ? mask | direction.bit
      : mask;
  }, 0);
}

export function lineCells(start, end, bounds = MAP_EDITOR_RULES.world) {
  const values = [start?.col, start?.row, end?.col, end?.row].map(Number);
  if (!values.every(Number.isFinite)) return [];
  let x0 = Math.floor(values[0]); let y0 = Math.floor(values[1]);
  const x1 = Math.floor(values[2]); const y1 = Math.floor(values[3]);
  if (!cellInBounds(x0, y0, bounds) || !cellInBounds(x1, y1, bounds)) return [];
  const dx = Math.abs(x1 - x0); const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0); const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  const cells = [];
  while (true) {
    if (cellInBounds(x0, y0, bounds)) cells.push({ col: x0, row: y0 });
    if (x0 === x1 && y0 === y1) break;
    const doubled = error * 2;
    if (doubled >= dy) { error += dy; x0 += sx; }
    if (doubled <= dx) { error += dx; y0 += sy; }
  }
  return cells;
}

export function rectangleCells(start, end, bounds = MAP_EDITOR_RULES.world) {
  const minimumCol = Math.max(0, Math.min(Math.floor(start.col), Math.floor(end.col)));
  const maximumCol = Math.min(bounds.cols - 1, Math.max(Math.floor(start.col), Math.floor(end.col)));
  const minimumRow = Math.max(0, Math.min(Math.floor(start.row), Math.floor(end.row)));
  const maximumRow = Math.min(bounds.rows - 1, Math.max(Math.floor(start.row), Math.floor(end.row)));
  const cells = [];
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let col = minimumCol; col <= maximumCol; col += 1) cells.push({ col, row });
  }
  return cells;
}

export function floodFillCells({ start, getValue, bounds = MAP_EDITOR_RULES.world, maximum = MAP_EDITOR_RULES.limits.tileOverrides }) {
  if (!cellInBounds(start.col, start.row, bounds)) return [];
  const target = getValue(start.col, start.row);
  const queue = [{ col: start.col, row: start.row }];
  let queueIndex = 0;
  const visited = new Set();
  const cells = [];
  while (queueIndex < queue.length && cells.length < maximum) {
    const cell = queue[queueIndex]; queueIndex += 1;
    const key = `${cell.col},${cell.row}`;
    if (visited.has(key) || !cellInBounds(cell.col, cell.row, bounds)) continue;
    visited.add(key);
    if (getValue(cell.col, cell.row) !== target) continue;
    cells.push(cell);
    queue.push({ col: cell.col + 1, row: cell.row }, { col: cell.col - 1, row: cell.row }, { col: cell.col, row: cell.row + 1 }, { col: cell.col, row: cell.row - 1 });
  }
  return cells;
}

export class CommandBuilder {
  constructor(label, { id = globalThis.crypto?.randomUUID?.() || `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`, revision = 0 } = {}) {
    this.id = id;
    this.label = label;
    this.revision = revision;
    this.changes = new Map();
  }

  stage(after, before) {
    const key = editorOperationKey(after);
    const existing = this.changes.get(key);
    this.changes.set(key, { before: clone(existing?.before ?? before), after: clone(after) });
    return this;
  }

  get size() { return this.changes.size; }

  command() {
    return {
      id: this.id,
      label: this.label,
      revision: this.revision,
      keys: [...this.changes.keys()],
      before: [...this.changes.values()].map((change) => clone(change.before)).reverse(),
      after: [...this.changes.values()].map((change) => clone(change.after)),
    };
  }
}

export class TransactionHistory {
  constructor({ limit = MAP_EDITOR_RULES.limits.historyCommands } = {}) {
    this.limit = Math.max(1, limit);
    this.undoStack = [];
    this.redoStack = [];
  }

  push(command) {
    if (!command?.after?.length || command.after.length !== command.before?.length) return false;
    this.undoStack.push(clone(command));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    return true;
  }

  peekUndo() { return clone(this.undoStack.at(-1) || null); }
  peekRedo() { return clone(this.redoStack.at(-1) || null); }

  undo({ changedKeys = new Set() } = {}) {
    const command = this.undoStack.at(-1);
    if (!command) return { command: null, conflicts: [] };
    const conflicts = command.keys.filter((key) => changedKeys.has(key));
    if (conflicts.length) return { command: clone(command), conflicts };
    this.undoStack.pop();
    this.redoStack.push(command);
    return { command: clone(command), conflicts: [] };
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return null;
    this.undoStack.push(command);
    return clone(command);
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

export function changedKeysSince(remoteVersions, revision = 0) {
  const entries = remoteVersions instanceof Map
    ? remoteVersions.entries()
    : Object.entries(remoteVersions && typeof remoteVersions === "object" ? remoteVersions : {});
  return new Set([...entries]
    .filter(([, changedAt]) => Number(changedAt) > Number(revision || 0))
    .map(([key]) => String(key)));
}

export class MemoryOutboxAdapter {
  constructor(initialValue = null) { this.value = clone(initialValue); this.failWrites = false; }
  async read() { return clone(this.value); }
  async write(value) {
    if (this.failWrites) throw new Error("outbox write failed");
    this.value = clone(value);
  }
  async clear() { this.value = null; }
}

export class IndexedDbOutboxAdapter {
  constructor({ database = "pokemon-map-editor-v2", store = "outbox", key = "pending", legacyKeys = [], legacyActorId = "" } = {}) {
    this.database = database;
    this.store = store;
    this.key = key;
    this.legacyKeys = [...new Set((Array.isArray(legacyKeys) ? legacyKeys : []).map(String))].filter((entry) => entry && entry !== key);
    this.legacyActorId = String(legacyActorId || "");
    this.connection = null;
  }

  async open() {
    if (this.connection) return this.connection;
    if (!globalThis.indexedDB) throw new Error("IndexedDB no está disponible");
    this.connection = await new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.database, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(this.store)) request.result.createObjectStore(this.store); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB"));
    });
    return this.connection;
  }

  async transact(mode, action) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.store, mode);
      const request = action(transaction.objectStore(this.store));
      request.onsuccess = () => resolve(clone(request.result ?? null));
      request.onerror = () => reject(request.error || new Error("Falló la bandeja local"));
      transaction.onabort = () => reject(transaction.error || new Error("Se canceló la bandeja local"));
    });
  }

  async read() {
    const current = await this.transact("readonly", (store) => store.get(this.key));
    if (current != null) return current;
    for (const legacyKey of this.legacyKeys) {
      const legacy = await this.transact("readonly", (store) => store.get(legacyKey));
      if (legacy == null) continue;
      if (this.legacyActorId && legacy.actorId && legacy.actorId !== this.legacyActorId) continue;
      await this.write(legacy);
      await this.transact("readwrite", (store) => store.delete(legacyKey));
      return legacy;
    }
    return null;
  }
  write(value) { return this.transact("readwrite", (store) => store.put(clone(value), this.key)); }
  clear() { return this.transact("readwrite", (store) => store.delete(this.key)); }
}

export class DurableOutboxQueue {
  constructor(adapter, { actorId = "", key = "map-editor-v2" } = {}) {
    this.adapter = adapter;
    this.actorId = actorId;
    this.key = key;
    this.batches = [];
    this.durable = true;
    this.writeTail = Promise.resolve();
    this.writeVersion = 0;
  }

  snapshot() { return clone(this.batches); }

  async recover() {
    const stored = await this.adapter.read();
    const belongsToActor = !stored?.actorId || !this.actorId || stored.actorId === this.actorId;
    this.batches = belongsToActor && stored?.version === 2 && Array.isArray(stored.batches) ? clone(stored.batches) : [];
    this.durable = true;
    return this.snapshot();
  }

  enqueue(batch) {
    const next = { id: batch.id, transactionId: batch.transactionId || batch.id, groupId: batch.groupId || batch.id, label: batch.label || "Cambio", baseRevision: Number(batch.baseRevision) || 0, createdAt: batch.createdAt || Date.now(), operations: clone(batch.operations || []) };
    if (!next.id || !next.operations.length) return Promise.resolve(false);
    this.batches.push(next);
    this.durable = false;
    return this.persist().then(() => true);
  }

  replace(batches) {
    this.batches = clone(Array.isArray(batches) ? batches : []);
    this.durable = false;
    return this.persist();
  }

  async remove(id) {
    this.batches = this.batches.filter((batch) => batch.id !== id);
    await this.persist();
  }

  persist() {
    const payload = { version: 2, actorId: this.actorId, key: this.key, updatedAt: Date.now(), batches: this.snapshot() };
    const version = ++this.writeVersion;
    this.writeTail = this.writeTail.catch(() => {}).then(async () => {
      if (payload.batches.length) await this.adapter.write(payload);
      else await this.adapter.clear();
      if (version === this.writeVersion) this.durable = true;
    }).catch((error) => {
      if (version === this.writeVersion) this.durable = false;
      throw error;
    });
    return this.writeTail;
  }
}

export class PresenceGate {
  constructor({ movementInterval = MAP_EDITOR_RULES.timing.presenceMovementMs, heartbeatInterval = MAP_EDITOR_RULES.timing.presenceHeartbeatMs } = {}) {
    this.movementInterval = movementInterval;
    this.heartbeatInterval = heartbeatInterval;
    this.lastSignature = "";
    this.lastSentAt = -Infinity;
  }

  signature(value) {
    const selection = value?.selection ? `${value.selection.entity || ""}:${value.selection.id || ""}` : "";
    const cursor = value?.cursor ? `${Math.round(value.cursor.x)},${Math.round(value.cursor.y)}` : "";
    const player = value?.player ? `${Math.round(value.player.x)},${Math.round(value.player.y)},${value.player.direction || ""},${Number(value.player.moving)}` : "";
    return `${value?.name || ""}|${value?.mode || ""}|${selection}|${cursor}|${player}`;
  }

  decision(value, now, { heartbeat = false } = {}) {
    const signature = this.signature(value);
    const changed = signature !== this.lastSignature;
    const elapsed = now - this.lastSentAt;
    if ((!heartbeat && (!changed || elapsed < this.movementInterval)) || (heartbeat && elapsed < this.heartbeatInterval)) {
      return { send: false, wait: heartbeat ? this.heartbeatInterval - elapsed : this.movementInterval - elapsed, changed };
    }
    this.lastSignature = signature;
    this.lastSentAt = now;
    return { send: true, wait: 0, changed };
  }
}
