export const MAP_EDITOR_RULES = Object.freeze({
  version: 2,
  world: Object.freeze({
    width: 2508,
    height: 2508,
    tileSize: 32,
    cols: Math.ceil(2508 / 32),
    rows: Math.ceil(2508 / 32),
  }),
  types: Object.freeze({
    terrain: Object.freeze(["walkable", "blocked", "door", "encounter", "event"]),
    event: Object.freeze(["dialogue", "thought", "vibration", "teleport", "transition"]),
    trigger: Object.freeze(["interact", "step"]),
    entranceAction: Object.freeze(["transition", "house", "heal", "shop", "lab", "route", "closed", "prism"]),
    direction: Object.freeze(["up", "down", "left", "right"]),
    effect: Object.freeze(["fade", "flash", "none"]),
  }),
  lengths: Object.freeze({
    id: 80,
    label: 120,
    assetLabel: 80,
    npcName: 80,
    npcLines: 12,
    npcLine: 500,
    eventMessage: 1000,
    actorName: 32,
  }),
  ranges: Object.freeze({
    scale: Object.freeze([0.25, 4]),
    rotation: Object.freeze([-360, 360]),
    depthY: Object.freeze([-2508, 5016]),
    patrolSpeed: Object.freeze([0.05, 10]),
    duration: Object.freeze([0, 60000]),
    intensity: Object.freeze([0, 10]),
    targetCoordinate: Object.freeze([0, 100000]),
  }),
  limits: Object.freeze({
    operationsPerBatch: 256,
    historyCommands: 80,
    tileOverrides: 7000,
    assetOverrides: 1000,
    addedAssets: 500,
    hiddenAssets: 1000,
    npcOverrides: 500,
    addedNpcs: 500,
    hiddenNpcs: 1000,
    entrances: 500,
    events: 1000,
  }),
  timing: Object.freeze({
    presenceMovementMs: 110,
    presenceHeartbeatMs: 12000,
    flushDelayMs: 180,
    reconnectMaximumMs: 30000,
  }),
});

const ID_PATTERN = new RegExp(`^[a-z0-9][a-z0-9_-]{0,${MAP_EDITOR_RULES.lengths.id - 1}}$`, "i");
const plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function editorOperationKey(operation) {
  if (operation?.type === "tile.set") return `tile:${operation.key}`;
  if (operation?.type === "list.set") return `list:${operation.list}`;
  return `entity:${operation?.entity || ""}:${operation?.id || ""}`;
}

export function isEditorId(value) {
  return typeof value === "string" && value.length <= MAP_EDITOR_RULES.lengths.id && ID_PATTERN.test(value);
}

export function tileInBounds(col, row, rules = MAP_EDITOR_RULES) {
  return Number.isInteger(col) && Number.isInteger(row)
    && col >= 0 && row >= 0 && col < rules.world.cols && row < rules.world.rows;
}

function numberError(value, [minimum, maximum], label, { integer = false, optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return "";
  if (typeof value !== "number" || !Number.isFinite(value)) return `${label} debe ser un número.`;
  if (integer && !Number.isInteger(value)) return `${label} debe ser un entero.`;
  if (value < minimum || value > maximum) return `${label} debe estar entre ${minimum} y ${maximum}.`;
  return "";
}

function textError(value, maximum, label, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return "";
  if (typeof value !== "string") return `${label} debe ser texto.`;
  if (value.length > maximum) return `${label} admite como máximo ${maximum} caracteres.`;
  return "";
}

function idError(value, label, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return "";
  return isEditorId(value) ? "" : `${label} debe usar letras, números, guiones o guiones bajos y medir como máximo ${MAP_EDITOR_RULES.lengths.id} caracteres.`;
}

function pushIf(errors, message) {
  if (message) errors.push(message);
}

function validateLocalDestination(value, errors) {
  if (!value?.targetMap || !["san-pablo", "city", "current"].includes(String(value.targetMap).toLowerCase())) return;
  if (Number(value.targetX) > MAP_EDITOR_RULES.world.width) errors.push(`Destino X debe estar entre 0 y ${MAP_EDITOR_RULES.world.width} para este mapa.`);
  if (Number(value.targetY) > MAP_EDITOR_RULES.world.height) errors.push(`Destino Y debe estar entre 0 y ${MAP_EDITOR_RULES.world.height} para este mapa.`);
}

function validateGridPosition(value, errors) {
  pushIf(errors, numberError(value.col, [0, MAP_EDITOR_RULES.world.cols - 1], "La columna", { integer: true }));
  pushIf(errors, numberError(value.row, [0, MAP_EDITOR_RULES.world.rows - 1], "La fila", { integer: true }));
}

export function validateEditorEntity(kind, value, { requireIdentity = true } = {}) {
  const errors = [];
  const warnings = [];
  if (!plainObject(value)) return { valid: false, errors: ["La entidad debe ser un objeto."], warnings };
  if (requireIdentity) pushIf(errors, idError(value.id, "El ID"));

  if (kind === "asset") {
    pushIf(errors, numberError(value.x, [0, MAP_EDITOR_RULES.world.width], "X", { optional: !requireIdentity }));
    pushIf(errors, numberError(value.y, [0, MAP_EDITOR_RULES.world.height], "Y", { optional: !requireIdentity }));
    pushIf(errors, numberError(value.scale, MAP_EDITOR_RULES.ranges.scale, "La escala", { optional: true }));
    pushIf(errors, numberError(value.rotation, MAP_EDITOR_RULES.ranges.rotation, "La rotación", { optional: true }));
    pushIf(errors, numberError(value.depthY, MAP_EDITOR_RULES.ranges.depthY, "La profundidad", { optional: true }));
    pushIf(errors, textError(value.label, MAP_EDITOR_RULES.lengths.assetLabel, "El nombre", { optional: true }));
    if (requireIdentity) pushIf(errors, idError(value.sprite, "El sprite"));
  } else if (kind === "npc") {
    if (hasOwn(value, "col") || requireIdentity) validateGridPosition(value, errors);
    pushIf(errors, textError(value.name, MAP_EDITOR_RULES.lengths.npcName, "El nombre", { optional: true }));
    if (hasOwn(value, "sprite") || requireIdentity) pushIf(errors, idError(value.sprite, "El sprite"));
    if (hasOwn(value, "direction") && !MAP_EDITOR_RULES.types.direction.includes(value.direction)) errors.push("La dirección del NPC no es válida.");
    if (hasOwn(value, "lines")) {
      if (!Array.isArray(value.lines)) errors.push("El diálogo debe ser una lista de líneas.");
      else {
        if (value.lines.length > MAP_EDITOR_RULES.lengths.npcLines) errors.push(`El diálogo admite como máximo ${MAP_EDITOR_RULES.lengths.npcLines} líneas.`);
        value.lines.forEach((line, index) => pushIf(errors, textError(line, MAP_EDITOR_RULES.lengths.npcLine, `La línea ${index + 1}`)));
      }
    }
    if (value.patrol !== undefined) {
      if (!plainObject(value.patrol) || !Array.isArray(value.patrol.to) || value.patrol.to.length !== 2) errors.push("La patrulla necesita una casilla de destino.");
      else {
        pushIf(errors, numberError(value.patrol.to[0], [0, MAP_EDITOR_RULES.world.cols - 1], "La columna de patrulla", { integer: true }));
        pushIf(errors, numberError(value.patrol.to[1], [0, MAP_EDITOR_RULES.world.rows - 1], "La fila de patrulla", { integer: true }));
        pushIf(errors, numberError(value.patrol.tilesPerSecond, MAP_EDITOR_RULES.ranges.patrolSpeed, "La velocidad de patrulla"));
      }
    }
  } else if (kind === "entrance") {
    validateGridPosition(value, errors);
    pushIf(errors, textError(value.label, MAP_EDITOR_RULES.lengths.label, "El nombre", { optional: true }));
    if (!MAP_EDITOR_RULES.types.entranceAction.includes(value.action)) errors.push("La acción de entrada no es válida.");
    pushIf(errors, idError(value.targetMap, "El mapa de destino", { optional: value.action !== "transition" }));
    pushIf(errors, numberError(value.targetX, MAP_EDITOR_RULES.ranges.targetCoordinate, "Destino X", { optional: value.action !== "transition" }));
    pushIf(errors, numberError(value.targetY, MAP_EDITOR_RULES.ranges.targetCoordinate, "Destino Y", { optional: value.action !== "transition" }));
    if (value.action === "transition") validateLocalDestination(value, errors);
    if (value.targetDirection !== undefined && !MAP_EDITOR_RULES.types.direction.includes(value.targetDirection)) errors.push("La dirección de llegada no es válida.");
    if (value.effect !== undefined && !MAP_EDITOR_RULES.types.effect.includes(value.effect)) errors.push("El efecto no es válido.");
    pushIf(errors, idError(value.linkedAssetId, "El edificio vinculado", { optional: true }));
    if (value.targetMap && !["san-pablo", "city", "current"].includes(String(value.targetMap).toLowerCase())) warnings.push("El destino se validará cuando ese mapa esté registrado.");
  } else if (kind === "event") {
    validateGridPosition(value, errors);
    if (!MAP_EDITOR_RULES.types.event.includes(value.type)) errors.push("El tipo de evento no es válido.");
    if (!MAP_EDITOR_RULES.types.trigger.includes(value.trigger)) errors.push("La activación del evento no es válida.");
    pushIf(errors, textError(value.message, MAP_EDITOR_RULES.lengths.eventMessage, "El mensaje", { optional: !["dialogue", "thought"].includes(value.type) }));
    if (["dialogue", "thought"].includes(value.type) && !String(value.message || "").trim()) errors.push("El evento necesita un mensaje.");
    const needsTarget = ["teleport", "transition"].includes(value.type);
    pushIf(errors, idError(value.targetMap, "El mapa de destino", { optional: !needsTarget }));
    pushIf(errors, numberError(value.targetX, MAP_EDITOR_RULES.ranges.targetCoordinate, "Destino X", { optional: !needsTarget }));
    pushIf(errors, numberError(value.targetY, MAP_EDITOR_RULES.ranges.targetCoordinate, "Destino Y", { optional: !needsTarget }));
    if (needsTarget) validateLocalDestination(value, errors);
    if (value.targetDirection !== undefined && !MAP_EDITOR_RULES.types.direction.includes(value.targetDirection)) errors.push("La dirección de llegada no es válida.");
    if (value.effect !== undefined && !MAP_EDITOR_RULES.types.effect.includes(value.effect)) errors.push("El efecto no es válido.");
    pushIf(errors, numberError(value.duration, MAP_EDITOR_RULES.ranges.duration, "La duración", { optional: value.type !== "vibration" }));
    pushIf(errors, numberError(value.intensity, MAP_EDITOR_RULES.ranges.intensity, "La intensidad", { optional: value.type !== "vibration" }));
    if (needsTarget && value.targetMap && !["san-pablo", "city", "current"].includes(String(value.targetMap).toLowerCase())) warnings.push("El destino se validará cuando ese mapa esté registrado.");
  } else {
    errors.push("El tipo de entidad no es válido.");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

const ENTITY_COLLECTIONS = Object.freeze({
  asset: Object.freeze(["assetOverrides", "addedAssets"]),
  npc: Object.freeze(["npcOverrides", "addedNpcs"]),
  entrance: Object.freeze(["entrances"]),
  event: Object.freeze(["events"]),
});

export function validateEditorOperation(operation) {
  const errors = [];
  if (!plainObject(operation)) return { valid: false, errors: ["La operación debe ser un objeto."], warnings: [] };
  if (operation.type === "tile.set") {
    const match = /^(\d+),(\d+)$/.exec(String(operation.key || ""));
    if (!match || !tileInBounds(Number(match[1]), Number(match[2]))) errors.push("La casilla está fuera del mapa.");
    if (operation.value !== null && !MAP_EDITOR_RULES.types.terrain.includes(operation.value)) errors.push("El tipo de terreno no es válido.");
    return { valid: errors.length === 0, errors, warnings: [] };
  }
  if (operation.type === "list.set") {
    if (!["hiddenAssets", "hiddenNpcs"].includes(operation.list)) errors.push("La lista no es válida.");
    if (!Array.isArray(operation.value)) errors.push("El valor de la lista debe ser un array.");
    else {
      const maximum = MAP_EDITOR_RULES.limits[operation.list];
      if (operation.value.length > maximum) errors.push(`La lista admite como máximo ${maximum} elementos.`);
      operation.value.forEach((id) => pushIf(errors, idError(id, "El ID de la lista")));
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [] };
  }
  if (!["entity.set", "entity.delete"].includes(operation.type)) errors.push("El tipo de operación no está permitido.");
  if (!ENTITY_COLLECTIONS[operation.entity]?.includes(operation.collection)) errors.push("La colección no corresponde a la entidad.");
  pushIf(errors, idError(operation.id, "El ID"));
  if (operation.type === "entity.set" && errors.length === 0) {
    const requireIdentity = ["addedAssets", "addedNpcs", "entrances", "events"].includes(operation.collection);
    const result = validateEditorEntity(operation.entity, { ...operation.value, id: operation.id }, { requireIdentity });
    errors.push(...result.errors);
    return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: result.warnings };
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [] };
}

export function validateMapEditorData(value) {
  const errors = [];
  if (!plainObject(value)) return { valid: false, errors: ["Los datos del editor deben ser un objeto."], warnings: [] };
  const collections = [
    ["tileOverrides", value.tileOverrides, MAP_EDITOR_RULES.limits.tileOverrides],
    ["assetOverrides", value.assetOverrides, MAP_EDITOR_RULES.limits.assetOverrides],
    ["addedAssets", value.addedAssets, MAP_EDITOR_RULES.limits.addedAssets],
    ["hiddenAssets", value.hiddenAssets, MAP_EDITOR_RULES.limits.hiddenAssets],
    ["npcOverrides", value.npcOverrides, MAP_EDITOR_RULES.limits.npcOverrides],
    ["addedNpcs", value.addedNpcs, MAP_EDITOR_RULES.limits.addedNpcs],
    ["hiddenNpcs", value.hiddenNpcs, MAP_EDITOR_RULES.limits.hiddenNpcs],
    ["entrances", value.entrances, MAP_EDITOR_RULES.limits.entrances],
    ["events", value.events, MAP_EDITOR_RULES.limits.events],
  ];
  collections.forEach(([name, collection, maximum]) => {
    if (collection == null) return;
    const count = Array.isArray(collection) ? collection.length : plainObject(collection) ? Object.keys(collection).length : Infinity;
    if (!Number.isFinite(count)) errors.push(`${name} no tiene el formato esperado.`);
    else if (count > maximum) errors.push(`${name} admite como máximo ${maximum} elementos.`);
  });
  Object.entries(plainObject(value.tileOverrides) ? value.tileOverrides : {}).forEach(([key, terrain]) => {
    const result = validateEditorOperation({ type: "tile.set", key, value: terrain });
    errors.push(...result.errors.map((message) => `${key}: ${message}`));
  });
  const validateRecord = (record, kind, collection) => Object.entries(plainObject(record) ? record : {}).forEach(([id, entry]) => {
    const result = validateEditorOperation({ type: "entity.set", entity: kind, collection, id, value: entry });
    errors.push(...result.errors.map((message) => `${id}: ${message}`));
  });
  const validateArray = (entries, kind, collection) => (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
    const result = validateEditorOperation({ type: "entity.set", entity: kind, collection, id: entry?.id, value: entry });
    errors.push(...result.errors.map((message) => `${collection}[${index}]: ${message}`));
  });
  validateRecord(value.assetOverrides, "asset", "assetOverrides");
  validateArray(value.addedAssets, "asset", "addedAssets");
  validateRecord(value.npcOverrides, "npc", "npcOverrides");
  validateArray(value.addedNpcs, "npc", "addedNpcs");
  [["hiddenAssets", value.hiddenAssets], ["hiddenNpcs", value.hiddenNpcs]].forEach(([collection, entries]) => {
    (Array.isArray(entries) ? entries : []).forEach((id, index) => pushIf(errors, idError(id, `${collection}[${index}]`)));
  });
  validateArray(value.entrances, "entrance", "entrances");
  validateArray(value.events, "event", "events");
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [] };
}
