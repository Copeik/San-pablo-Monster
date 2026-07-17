import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isEditorId, isGroundPaintValue, MAP_EDITOR_RULES, validateEditorOperation, validateMapEditorData } from "./map-editor-contract.js";

const TILE_TYPES = new Set(MAP_EDITOR_RULES.types.terrain);
const DIRECTIONS = new Set(MAP_EDITOR_RULES.types.direction);
const EVENT_TYPES = new Set(MAP_EDITOR_RULES.types.event);
const EVENT_TRIGGERS = new Set(MAP_EDITOR_RULES.types.trigger);
const ENTITY_COLLECTIONS = Object.freeze({
  asset: new Set(["assetOverrides", "addedAssets"]),
  npc: new Set(["npcOverrides", "addedNpcs"]),
  entrance: new Set(["entrances"]),
  event: new Set(["events"]),
});
const HIDDEN_LISTS = new Set(["hiddenAssets", "hiddenNpcs"]);
const MAX_SSE_BUFFER_BYTES = 256 * 1024;
const PRESENCE_TTL_MS = 45_000;

const clone = (value) => JSON.parse(JSON.stringify(value));
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  return Math.max(minimum, Math.min(maximum, finiteNumber(value, fallback)));
}

function cleanText(value, maximum = 160) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

export function cleanEditorId(value) {
  const id = cleanText(value, MAP_EDITOR_RULES.lengths.id);
  return isEditorId(id) ? id : "";
}

function cleanToken(value, maximum = 64) {
  const token = cleanText(value, maximum);
  return /^[a-z0-9][a-z0-9_.:-]{0,63}$/i.test(token) ? token : "";
}

function cleanTileKey(value) {
  const match = /^(\d+),(\d+)$/.exec(String(value || ""));
  if (!match) return "";
  const col = Number(match[1]); const row = Number(match[2]);
  return col < MAP_EDITOR_RULES.world.maxCols && row < MAP_EDITOR_RULES.world.maxRows ? `${col},${row}` : "";
}

function cleanStringList(value, { maximumItems = 12, maximumLength = 500 } = {}) {
  return (Array.isArray(value) ? value : [])
    .slice(0, maximumItems)
    .map((entry) => cleanText(entry, maximumLength));
}

function cleanIdList(value, maximumItems = MAP_EDITOR_RULES.limits.hiddenAssets) {
  return [...new Set((Array.isArray(value) ? value : [])
    .slice(0, maximumItems)
    .map(cleanEditorId)
    .filter(Boolean))];
}

function cleanAssetTransform(value, { id = "", requireIdentity = false } = {}) {
  if (!isPlainObject(value)) return null;
  const transform = {
    x: clamp(value.x, 0, MAP_EDITOR_RULES.world.maxWidth),
    y: clamp(value.y, 0, MAP_EDITOR_RULES.world.maxHeight),
    scale: clamp(value.scale, ...MAP_EDITOR_RULES.ranges.scale, 1),
    rotation: clamp(value.rotation, ...MAP_EDITOR_RULES.ranges.rotation, 0),
    solid: value.solid !== false,
  };
  if (Number.isFinite(Number(value.depthY))) transform.depthY = clamp(value.depthY, ...MAP_EDITOR_RULES.ranges.depthY);
  if (typeof value.flipX === "boolean") transform.flipX = value.flipX;
  const label = cleanText(value.label, MAP_EDITOR_RULES.lengths.assetLabel);
  if (label) transform.label = label;
  if (requireIdentity) {
    transform.id = cleanEditorId(id || value.id);
    transform.sprite = cleanEditorId(value.sprite);
    if (!transform.id || !transform.sprite) return null;
  }
  return transform;
}

function cleanNpc(value, { id = "", requireIdentity = false } = {}) {
  if (!isPlainObject(value)) return null;
  const npc = {};
  const normalizedId = cleanEditorId(id || value.id);
  if (requireIdentity) {
    if (!normalizedId) return null;
    npc.id = normalizedId;
  }
  if (value.col !== undefined) npc.col = Math.floor(clamp(value.col, 0, MAP_EDITOR_RULES.world.maxCols - 1));
  if (value.row !== undefined) npc.row = Math.floor(clamp(value.row, 0, MAP_EDITOR_RULES.world.maxRows - 1));
  if (DIRECTIONS.has(value.direction)) npc.direction = value.direction;
  const name = cleanText(value.name, MAP_EDITOR_RULES.lengths.npcName); if (name) npc.name = name;
  const sprite = cleanEditorId(value.sprite); if (sprite) npc.sprite = sprite;
  if (Array.isArray(value.lines)) npc.lines = cleanStringList(value.lines);
  if (isPlainObject(value.patrol) && Array.isArray(value.patrol.to) && value.patrol.to.length >= 2) {
    npc.patrol = {
      to: [Math.floor(clamp(value.patrol.to[0], 0, MAP_EDITOR_RULES.world.maxCols - 1)), Math.floor(clamp(value.patrol.to[1], 0, MAP_EDITOR_RULES.world.maxRows - 1))],
      tilesPerSecond: clamp(value.patrol.tilesPerSecond, ...MAP_EDITOR_RULES.ranges.patrolSpeed, .75),
    };
  }
  if (typeof value.solid === "boolean") npc.solid = value.solid;
  if (typeof value.enabled === "boolean") npc.enabled = value.enabled;
  if (requireIdentity && (!Number.isInteger(npc.col) || !Number.isInteger(npc.row) || !npc.sprite)) return null;
  return Object.keys(npc).length ? npc : null;
}

function cleanEntrance(value, id = "") {
  if (!isPlainObject(value)) return null;
  const entrance = {
    id: cleanEditorId(id || value.id),
    col: Math.floor(clamp(value.col, 0, MAP_EDITOR_RULES.world.maxCols - 1)),
    row: Math.floor(clamp(value.row, 0, MAP_EDITOR_RULES.world.maxRows - 1)),
  };
  if (!entrance.id) return null;
  const label = cleanText(value.label, MAP_EDITOR_RULES.lengths.label); if (label) entrance.label = label;
  const action = cleanToken(value.action); if (action) entrance.action = action;
  const targetMap = cleanEditorId(value.targetMap); if (targetMap) entrance.targetMap = targetMap;
  if (Number.isFinite(Number(value.targetX))) entrance.targetX = clamp(value.targetX, ...MAP_EDITOR_RULES.ranges.targetCoordinate);
  if (Number.isFinite(Number(value.targetY))) entrance.targetY = clamp(value.targetY, ...MAP_EDITOR_RULES.ranges.targetCoordinate);
  if (DIRECTIONS.has(value.targetDirection)) entrance.targetDirection = value.targetDirection;
  const effect = cleanToken(value.effect); if (effect) entrance.effect = effect;
  const linkedAssetId = cleanEditorId(value.linkedAssetId); if (linkedAssetId) entrance.linkedAssetId = linkedAssetId;
  const npc = cleanEditorId(value.npc); if (npc) entrance.npc = npc;
  if (typeof value.enabled === "boolean") entrance.enabled = value.enabled;
  return entrance;
}

function cleanEvent(value, id = "") {
  if (!isPlainObject(value)) return null;
  const event = {
    id: cleanEditorId(id || value.id),
    col: Math.floor(clamp(value.col, 0, MAP_EDITOR_RULES.world.maxCols - 1)),
    row: Math.floor(clamp(value.row, 0, MAP_EDITOR_RULES.world.maxRows - 1)),
    type: EVENT_TYPES.has(value.type) ? value.type : "dialogue",
    trigger: EVENT_TRIGGERS.has(value.trigger) ? value.trigger : "interact",
  };
  if (!event.id) return null;
  const message = cleanText(value.message, MAP_EDITOR_RULES.lengths.eventMessage); if (message) event.message = message;
  const targetMap = cleanEditorId(value.targetMap); if (targetMap) event.targetMap = targetMap;
  if (Number.isFinite(Number(value.targetX))) event.targetX = clamp(value.targetX, ...MAP_EDITOR_RULES.ranges.targetCoordinate);
  if (Number.isFinite(Number(value.targetY))) event.targetY = clamp(value.targetY, ...MAP_EDITOR_RULES.ranges.targetCoordinate);
  if (DIRECTIONS.has(value.targetDirection)) event.targetDirection = value.targetDirection;
  const effect = cleanToken(value.effect); if (effect) event.effect = effect;
  if (Number.isFinite(Number(value.duration))) event.duration = clamp(value.duration, ...MAP_EDITOR_RULES.ranges.duration);
  if (Number.isFinite(Number(value.intensity))) event.intensity = clamp(value.intensity, ...MAP_EDITOR_RULES.ranges.intensity);
  event.once = value.once === true;
  event.enabled = value.enabled !== false;
  return event;
}

function cleanRecord(value, cleaner, maximumItems) {
  const result = {};
  Object.entries(isPlainObject(value) ? value : {}).slice(0, maximumItems).forEach(([rawId, entry]) => {
    const id = cleanEditorId(rawId);
    const cleaned = id ? cleaner(entry, id) : null;
    if (cleaned) result[id] = cleaned;
  });
  return result;
}

function cleanEntityArray(value, cleaner, maximumItems) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .slice(0, maximumItems)
    .map((entry) => cleaner(entry, cleanEditorId(entry?.id)))
    .filter((entry) => entry && !seen.has(entry.id) && seen.add(entry.id));
}

export function emptyMapEditorData() {
  return {
    version: 3,
    tileOverrides: {},
    groundOverrides: {},
    mapSize: { cols: MAP_EDITOR_RULES.world.cols, rows: MAP_EDITOR_RULES.world.rows },
    assetOverrides: {},
    addedAssets: [],
    hiddenAssets: [],
    npcOverrides: {},
    addedNpcs: [],
    hiddenNpcs: [],
    entrances: [],
    events: [],
  };
}

export function sanitizeMapEditorData(value) {
  const source = isPlainObject(value) ? value : {};
  const result = emptyMapEditorData();
  Object.entries(isPlainObject(source.tileOverrides) ? source.tileOverrides : {})
    .slice(0, MAP_EDITOR_RULES.limits.tileOverrides)
    .forEach(([rawKey, type]) => {
      const key = cleanTileKey(rawKey);
      if (key && TILE_TYPES.has(type)) result.tileOverrides[key] = type;
    });
  Object.entries(isPlainObject(source.groundOverrides) ? source.groundOverrides : {})
    .slice(0, MAP_EDITOR_RULES.limits.groundOverrides)
    .forEach(([rawKey, type]) => {
      const key = cleanTileKey(rawKey);
      if (key && isGroundPaintValue(type)) result.groundOverrides[key] = type;
    });
  if (isPlainObject(source.mapSize)) {
    result.mapSize = {
      cols: Math.floor(clamp(source.mapSize.cols, MAP_EDITOR_RULES.world.minCols, MAP_EDITOR_RULES.world.maxCols, MAP_EDITOR_RULES.world.cols)),
      rows: Math.floor(clamp(source.mapSize.rows, MAP_EDITOR_RULES.world.minRows, MAP_EDITOR_RULES.world.maxRows, MAP_EDITOR_RULES.world.rows)),
    };
  }
  result.assetOverrides = cleanRecord(source.assetOverrides, (entry) => cleanAssetTransform(entry), MAP_EDITOR_RULES.limits.assetOverrides);
  result.addedAssets = cleanEntityArray(source.addedAssets,
    (entry, id) => cleanAssetTransform(entry, { id, requireIdentity: true }), MAP_EDITOR_RULES.limits.addedAssets);
  result.hiddenAssets = cleanIdList(source.hiddenAssets);
  result.npcOverrides = cleanRecord(source.npcOverrides, (entry) => cleanNpc(entry), MAP_EDITOR_RULES.limits.npcOverrides);
  result.addedNpcs = cleanEntityArray(source.addedNpcs,
    (entry, id) => cleanNpc(entry, { id, requireIdentity: true }), MAP_EDITOR_RULES.limits.addedNpcs);
  result.hiddenNpcs = cleanIdList(source.hiddenNpcs);
  result.entrances = cleanEntityArray(source.entrances, cleanEntrance, MAP_EDITOR_RULES.limits.entrances);
  result.events = cleanEntityArray(source.events, cleanEvent, MAP_EDITOR_RULES.limits.events);
  return result;
}

export function mapEditorSource(data) {
  return `/*\n * Cambios persistentes creados con el editor de desarrollo del mapa.\n * Este archivo forma parte de los datos del juego; editelo desde el modo dios.\n */\nwindow.CITY_MAP_EDITOR_DATA = ${JSON.stringify(sanitizeMapEditorData(data), null, 2)};\n`;
}

export function parseMapEditorSource(source) {
  const match = /window\.CITY_MAP_EDITOR_DATA\s*=\s*([\s\S]*);\s*$/.exec(String(source || ""));
  if (!match) throw Object.assign(new Error("El archivo del editor no tiene un formato válido"), { statusCode: 500 });
  try {
    return sanitizeMapEditorData(JSON.parse(match[1]));
  } catch {
    throw Object.assign(new Error("No se pudo leer el JSON del editor"), { statusCode: 500 });
  }
}

export async function loadMapEditorData(filePath) {
  try {
    return parseMapEditorSource(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return emptyMapEditorData();
    throw error;
  }
}

export async function atomicWriteMapEditorData(filePath, data) {
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let handle = null;
  try {
    handle = await open(temporaryPath, "wx");
    await handle.writeFile(mapEditorSource(data), "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, filePath);
  } catch (error) {
    try { await handle?.close(); } catch { /* Ya estaba cerrado. */ }
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function mapEditorCounts(data) {
  return {
    tiles: Object.keys(data.tileOverrides).length,
    ground: Object.keys(data.groundOverrides).length,
    objects: Object.keys(data.assetOverrides).length + data.addedAssets.length,
    npcs: Object.keys(data.npcOverrides).length + data.addedNpcs.length,
    entrances: data.entrances.length,
    events: data.events.length,
  };
}

function fail(message, statusCode = 400, details = {}) {
  throw Object.assign(new Error(message), { statusCode, details });
}

function upsertById(collection, value) {
  const index = collection.findIndex((entry) => entry.id === value.id);
  if (index < 0) collection.push(value);
  else collection[index] = value;
}

function removeById(collection, id) {
  const index = collection.findIndex((entry) => entry.id === id);
  if (index >= 0) collection.splice(index, 1);
}

function setHidden(data, list, id, present) {
  const values = new Set(data[list]);
  if (present) values.add(id); else values.delete(id);
  data[list] = [...values];
}

function normalizeOperation(rawOperation) {
  if (!isPlainObject(rawOperation)) fail("Operación del editor no válida");
  const validation = validateEditorOperation(rawOperation);
  if (!validation.valid) fail(validation.errors[0] || "Operación del editor no válida", 400, { code: "validation", errors: validation.errors });
  if (rawOperation.type === "tile.set") {
    const key = cleanTileKey(rawOperation.key);
    if (!key || (rawOperation.value !== null && !TILE_TYPES.has(rawOperation.value))) fail("Casilla o tipo de terreno no válido");
    return { type: "tile.set", key, value: rawOperation.value };
  }
  if (rawOperation.type === "ground.set") {
    const key = cleanTileKey(rawOperation.key);
    if (!key || (rawOperation.value !== null && !isGroundPaintValue(rawOperation.value))) fail("Casilla o tipo de suelo no válido");
    return { type: "ground.set", key, value: rawOperation.value };
  }
  if (rawOperation.type === "map.resize") {
    return {
      type: "map.resize",
      value: {
        cols: Math.floor(clamp(rawOperation.value.cols, MAP_EDITOR_RULES.world.minCols, MAP_EDITOR_RULES.world.maxCols)),
        rows: Math.floor(clamp(rawOperation.value.rows, MAP_EDITOR_RULES.world.minRows, MAP_EDITOR_RULES.world.maxRows)),
      },
    };
  }
  if (rawOperation.type === "list.set") {
    if (!HIDDEN_LISTS.has(rawOperation.list)) fail("Lista del editor no válida");
    if (!Array.isArray(rawOperation.value)) fail("El valor de la lista debe ser un array");
    return { type: "list.set", list: rawOperation.list, value: cleanIdList(rawOperation.value) };
  }
  if (rawOperation.type !== "entity.set" && rawOperation.type !== "entity.delete") fail("Tipo de operación no permitido");
  const entity = rawOperation.entity;
  const collection = rawOperation.collection;
  const id = cleanEditorId(rawOperation.id);
  if (!ENTITY_COLLECTIONS[entity]?.has(collection) || !id) fail("Entidad o colección del editor no válida");
  if (rawOperation.type === "entity.delete") {
    return { type: "entity.delete", entity, collection, id, hide: rawOperation.hide !== false };
  }
  let value;
  if (collection === "assetOverrides") value = cleanAssetTransform(rawOperation.value);
  else if (collection === "addedAssets") value = cleanAssetTransform(rawOperation.value, { id, requireIdentity: true });
  else if (collection === "npcOverrides") value = cleanNpc(rawOperation.value);
  else if (collection === "addedNpcs") value = cleanNpc(rawOperation.value, { id, requireIdentity: true });
  else if (collection === "entrances") value = cleanEntrance(rawOperation.value, id);
  else value = cleanEvent(rawOperation.value, id);
  if (!value) fail("Datos de entidad no válidos");
  return { type: "entity.set", entity, collection, id, value };
}

function operationKey(operation) {
  if (operation.type === "tile.set") return `tile:${operation.key}`;
  if (operation.type === "ground.set") return `ground:${operation.key}`;
  if (operation.type === "map.resize") return "map:size";
  if (operation.type === "list.set") return `list:${operation.list}`;
  return `entity:${operation.entity}:${operation.id}`;
}

function operationTouchedKeys(operation) {
  const keys = [operationKey(operation)];
  if (operation.entity === "asset") keys.push("list:hiddenAssets");
  if (operation.entity === "npc") keys.push("list:hiddenNpcs");
  return keys;
}

function currentValueForKey(data, key) {
  if (key.startsWith("tile:")) return data.tileOverrides[key.slice(5)] ?? null;
  if (key.startsWith("ground:")) return data.groundOverrides[key.slice(7)] ?? null;
  if (key === "map:size") return clone(data.mapSize);
  if (key === "list:hiddenAssets" || key === "list:hiddenNpcs") return clone(data[key.slice(5)] || []);
  const match = /^entity:(asset|npc|entrance|event):(.+)$/.exec(key);
  if (!match) return null;
  const [, entity, id] = match;
  if (entity === "asset") return clone(data.assetOverrides[id] || data.addedAssets.find((entry) => entry.id === id) || null);
  if (entity === "npc") return clone(data.npcOverrides[id] || data.addedNpcs.find((entry) => entry.id === id) || null);
  const collection = entity === "entrance" ? data.entrances : data.events;
  return clone(collection.find((entry) => entry.id === id) || null);
}

function applyOperation(data, operation) {
  if (operation.type === "tile.set") {
    if (operation.value === null) delete data.tileOverrides[operation.key];
    else data.tileOverrides[operation.key] = operation.value;
    return;
  }
  if (operation.type === "ground.set") {
    if (operation.value === null) delete data.groundOverrides[operation.key];
    else data.groundOverrides[operation.key] = operation.value;
    return;
  }
  if (operation.type === "map.resize") {
    data.mapSize = {
      cols: Math.max(data.mapSize?.cols || MAP_EDITOR_RULES.world.cols, operation.value.cols),
      rows: Math.max(data.mapSize?.rows || MAP_EDITOR_RULES.world.rows, operation.value.rows),
    };
    return;
  }
  if (operation.type === "list.set") {
    data[operation.list] = [...operation.value];
    return;
  }
  const { collection, id } = operation;
  if (operation.type === "entity.set") {
    if (collection === "assetOverrides") {
      data.assetOverrides[id] = operation.value;
      removeById(data.addedAssets, id);
      setHidden(data, "hiddenAssets", id, false);
    } else if (collection === "addedAssets") {
      upsertById(data.addedAssets, operation.value);
      delete data.assetOverrides[id];
      setHidden(data, "hiddenAssets", id, false);
    } else if (collection === "npcOverrides") {
      data.npcOverrides[id] = operation.value;
      removeById(data.addedNpcs, id);
      setHidden(data, "hiddenNpcs", id, false);
    } else if (collection === "addedNpcs") {
      upsertById(data.addedNpcs, operation.value);
      delete data.npcOverrides[id];
      setHidden(data, "hiddenNpcs", id, false);
    } else upsertById(data[collection], operation.value);
    return;
  }
  if (collection === "addedAssets") {
    removeById(data.addedAssets, id);
    setHidden(data, "hiddenAssets", id, false);
  } else if (collection === "assetOverrides") {
    delete data.assetOverrides[id];
    setHidden(data, "hiddenAssets", id, operation.hide);
  } else if (collection === "addedNpcs") {
    removeById(data.addedNpcs, id);
    setHidden(data, "hiddenNpcs", id, false);
  } else if (collection === "npcOverrides") {
    delete data.npcOverrides[id];
    setHidden(data, "hiddenNpcs", id, operation.hide);
  } else removeById(data[collection], id);
}

function cleanPresence(value) {
  if (!isPlainObject(value)) fail("Presencia no válida");
  const actorId = cleanEditorId(value.actorId);
  if (!actorId) fail("Falta actorId");
  const user = {
    actorId,
    name: cleanText(value.name, MAP_EDITOR_RULES.lengths.actorName) || "Editor",
    color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : "#55c2ff",
    cursor: null,
    player: null,
    mode: cleanToken(value.mode, 32) || "objects",
    selection: null,
  };
  if (isPlainObject(value.cursor) && Number.isFinite(Number(value.cursor.x)) && Number.isFinite(Number(value.cursor.y))) {
    user.cursor = { x: clamp(value.cursor.x, 0, MAP_EDITOR_RULES.world.maxWidth), y: clamp(value.cursor.y, 0, MAP_EDITOR_RULES.world.maxHeight) };
  }
  if (isPlainObject(value.selection)) {
    const entity = cleanToken(value.selection.entity, 32); const id = cleanEditorId(value.selection.id);
    if (entity && id) user.selection = { entity, id };
  } else if (typeof value.selection === "string") {
    const id = cleanEditorId(value.selection); if (id) user.selection = { id };
  }
  if (isPlainObject(value.player)
    && Number.isFinite(Number(value.player.x))
    && Number.isFinite(Number(value.player.y))) {
    const direction = ["up", "down", "left", "right"].includes(value.player.direction)
      ? value.player.direction
      : "down";
    const interior = value.player.interior == null ? null : cleanToken(value.player.interior, 64) || null;
    user.player = {
      x: clamp(value.player.x, 0, MAP_EDITOR_RULES.world.maxWidth),
      y: clamp(value.player.y, 0, MAP_EDITOR_RULES.world.maxHeight),
      direction,
      dimension: cleanToken(value.player.dimension, 32) || "san_pablo",
      interior,
      moving: Boolean(value.player.moving),
      running: Boolean(value.player.running),
      frame: Math.floor(clamp(value.player.frame, 0, 3)),
    };
  }
  return user;
}

function writeSse(response, event, payload, id = null) {
  if (response.destroyed || response.writableEnded) return false;
  if (response.writableLength > MAX_SSE_BUFFER_BYTES) {
    response.end();
    return false;
  }
  const idLine = id === null ? "" : `id: ${id}\n`;
  return response.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function createMapEditorHub({ editorDataPath, persist = atomicWriteMapEditorData, now = () => Date.now() }) {
  let data = emptyMapEditorData();
  let revision = 0;
  let resetRevision = 0;
  let mutationTail = Promise.resolve();
  const keyVersions = new Map();
  const connections = new Map();
  const presence = new Map();
  const processedTransactions = new Map();
  const readyPromise = loadMapEditorData(editorDataPath).then((loaded) => { data = loaded; });
  readyPromise.catch(() => {});

  const serializeMutation = (task) => {
    const result = mutationTail.then(async () => { await readyPromise; return task(); });
    mutationTail = result.catch(() => {});
    return result;
  };

  const activeUsers = () => {
    const activeActors = new Set([...connections.values()].map((entry) => entry.actorId));
    const cutoff = now() - PRESENCE_TTL_MS;
    return [...presence.values()]
      .filter((entry) => activeActors.has(entry.actorId) || entry.updatedAt >= cutoff)
      .map(({ updatedAt, ...entry }) => clone(entry));
  };

  const broadcast = (event, payload, id = null) => {
    connections.forEach((entry, connectionId) => {
      if (!writeSse(entry.response, event, payload, id)) {
        if (entry.response.destroyed || entry.response.writableEnded) connections.delete(connectionId);
      }
    });
  };
  const broadcastPresence = () => broadcast("presence", { users: activeUsers() });

  const sweepTimer = setInterval(() => {
    const activeActors = new Set([...connections.values()].map((entry) => entry.actorId));
    const cutoff = now() - PRESENCE_TTL_MS;
    let changed = false;
    presence.forEach((entry, actorId) => {
      if (!activeActors.has(actorId) && entry.updatedAt < cutoff) { presence.delete(actorId); changed = true; }
    });
    if (changed) broadcastPresence();
    connections.forEach((entry) => {
      if (!entry.response.destroyed && !entry.response.writableEnded) entry.response.write(": ping\n\n");
    });
  }, 15_000);
  sweepTimer.unref?.();

  return {
    async ready() { await readyPromise; },
    async snapshot() {
      await readyPromise;
      return { data: clone(data), revision };
    },
    async replace(rawData) {
      return serializeMutation(async () => {
        const next = sanitizeMapEditorData(rawData);
        await persist(editorDataPath, next);
        data = next;
        revision += 1;
        resetRevision = revision;
        keyVersions.clear();
        const payload = { data: clone(data), revision };
        broadcast("snapshot", payload, revision);
        return { revision, counts: mapEditorCounts(data) };
      });
    },
    async apply(body) {
      return serializeMutation(async () => {
        if (!isPlainObject(body)) fail("Petición de operaciones no válida");
        const actorId = cleanEditorId(body.actorId);
        const name = cleanText(body.name, MAP_EDITOR_RULES.lengths.actorName) || "Editor";
        const baseRevision = Number(body.baseRevision);
        if (!actorId) fail("Falta actorId");
        if (!Number.isInteger(baseRevision) || baseRevision < 0) fail("baseRevision no válida");
        if (baseRevision > revision) fail("La revisión del cliente está por delante", 409, { revision, code: "revision_ahead" });
        if (!Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > 256) fail("Se requieren entre 1 y 256 operaciones");
        const operations = body.operations.map(normalizeOperation);
        const transactionId = cleanEditorId(body.transactionId);
        const transactionKey = transactionId ? `${actorId}:${transactionId}` : "";
        const operationSignature = JSON.stringify(operations);
        const processed = transactionKey ? processedTransactions.get(transactionKey) : null;
        if (processed) {
          if (processed.signature !== operationSignature) fail("El identificador de transacción ya se usó para otro cambio", 409, { revision, code: "transaction_reused", transactionId });
          return clone(processed.result);
        }
        const conflictKeys = [...new Set(operations.map(operationKey))];
        const touchedKeys = [...new Set(operations.flatMap(operationTouchedKeys))];
        const conflicts = conflictKeys.filter((key) => Math.max(resetRevision, keyVersions.get(key) || 0) > baseRevision);
        if (conflicts.length) fail("Hay cambios más recientes en las mismas entidades", 409, {
          revision,
          code: "conflict",
          conflicts,
          current: Object.fromEntries(conflicts.map((key) => [key, currentValueForKey(data, key)])),
          transactionId: cleanEditorId(body.transactionId),
        });
        const next = clone(data);
        operations.forEach((operation) => applyOperation(next, operation));
        const sanitized = sanitizeMapEditorData(next);
        if (JSON.stringify(sanitized) === JSON.stringify(data)) {
          const result = { revision, counts: mapEditorCounts(data), operations: [] };
          if (transactionKey) processedTransactions.set(transactionKey, { signature: operationSignature, result });
          return result;
        }
        await persist(editorDataPath, sanitized);
        data = sanitized;
        revision += 1;
        touchedKeys.forEach((key) => keyVersions.set(key, revision));
        const event = {
          actorId,
          name,
          revision,
          operations: clone(operations),
          transactionId: cleanEditorId(body.transactionId),
          groupId: cleanEditorId(body.groupId),
          label: cleanText(body.label, MAP_EDITOR_RULES.lengths.label),
        };
        broadcast("operations", event, revision);
        const result = { revision, counts: mapEditorCounts(data), operations };
        if (transactionKey) {
          processedTransactions.set(transactionKey, { signature: operationSignature, result: clone(result) });
          if (processedTransactions.size > 2000) processedTransactions.delete(processedTransactions.keys().next().value);
        }
        return result;
      });
    },
    updatePresence(rawPresence) {
      const user = cleanPresence(rawPresence);
      const previous = presence.get(user.actorId);
      const { updatedAt: _updatedAt, ...previousUser } = previous || {};
      const unchanged = Boolean(previous) && JSON.stringify(previousUser) === JSON.stringify(user);
      presence.set(user.actorId, { ...user, updatedAt: now() });
      if (!unchanged) broadcastPresence();
      return { users: activeUsers() };
    },
    async subscribe(request, response, rawPresence) {
      await readyPromise;
      const user = cleanPresence(rawPresence);
      presence.set(user.actorId, { ...user, updatedAt: now() });
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      });
      response.flushHeaders?.();
      response.write("retry: 1500\n\n");
      const connectionId = randomUUID();
      connections.set(connectionId, { actorId: user.actorId, response });
      writeSse(response, "snapshot", { data: clone(data), revision }, revision);
      broadcastPresence();
      const close = () => {
        if (!connections.delete(connectionId)) return;
        const stillConnected = [...connections.values()].some((entry) => entry.actorId === user.actorId);
        if (!stillConnected) presence.delete(user.actorId);
        broadcastPresence();
      };
      request.once("close", close);
      response.once("close", close);
    },
    close() {
      clearInterval(sweepTimer);
      connections.forEach((entry) => entry.response.end());
      connections.clear(); presence.clear(); processedTransactions.clear();
    },
  };
}
