import { MAP_EDITOR_RULES, editorOperationKey, validateEditorEntity, validateEditorOperation, validateMapEditorData } from "./map-editor-contract.js?v=3";
import {
  boundedBrushCells, changedKeysSince, chunkOperationBatches, CommandBuilder, DurableOutboxQueue, floodFillCells,
  EDITOR_MODE_ORDER, groundPathSurface, groundPathType, IndexedDbOutboxAdapter, isGroundPathType, lineCells, mergeGroundPaintValue, PresenceGate,
  rectangleCells, resolveConflictQueue, resolveEditorShortcut, TransactionHistory,
} from "./map-editor-core.js?v=8";

(() => {
  "use strict";

  const bridge = window.__pokemonMapEditorBridge;
  if (!bridge) return;
  const activeMapId = String(window.ACTIVE_GAME_MAP_ID || window.CITY_MAP_CONFIG?.id || "san-pablo");
  const soloMode = window.location.protocol === "file:";
  const initialGrid = bridge.grid?.() || {};

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const isPlainRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const randomIdentifier = () => {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    const values = new Uint32Array(4);
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(values);
    } else {
      values.set(Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x100000000)));
    }
    return [...values].map((value) => value.toString(16).padStart(8, "0")).join("-");
  };
  const clamp = (value, minimum, maximum, fallback = minimum) => {
    const number = Number(value);
    return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : fallback));
  };
  const emptyData = () => ({
    version: 3,
    tileOverrides: {}, groundOverrides: {}, interiorGroundOverrides: {}, mapSize: {
      cols: Number(initialGrid.cols) || MAP_EDITOR_RULES.world.cols,
      rows: Number(initialGrid.rows) || MAP_EDITOR_RULES.world.rows,
    },
    assetOverrides: {}, addedAssets: [], hiddenAssets: [],
    npcOverrides: {}, addedNpcs: [], hiddenNpcs: [], entrances: [], events: [],
  });
  const normalizeData = (value = {}) => {
    const source = isPlainRecord(value) ? value : {};
    const mapSize = isPlainRecord(source.mapSize) ? source.mapSize : {};
    return {
      ...emptyData(),
      tileOverrides: { ...(isPlainRecord(source.tileOverrides) ? source.tileOverrides : {}) },
      groundOverrides: { ...(isPlainRecord(source.groundOverrides) ? source.groundOverrides : {}) },
      interiorGroundOverrides: Object.fromEntries(Object.entries(isPlainRecord(source.interiorGroundOverrides) ? source.interiorGroundOverrides : {})
        .filter(([, overrides]) => isPlainRecord(overrides))
        .map(([scene, overrides]) => [scene, { ...overrides }])),
      mapSize: {
        cols: clamp(mapSize.cols, MAP_EDITOR_RULES.world.minCols, MAP_EDITOR_RULES.world.maxCols, Number(initialGrid.cols) || MAP_EDITOR_RULES.world.cols),
        rows: clamp(mapSize.rows, MAP_EDITOR_RULES.world.minRows, MAP_EDITOR_RULES.world.maxRows, Number(initialGrid.rows) || MAP_EDITOR_RULES.world.rows),
      },
      assetOverrides: clone(isPlainRecord(source.assetOverrides) ? source.assetOverrides : {}),
      addedAssets: clone(Array.isArray(source.addedAssets) ? source.addedAssets.filter(isPlainRecord) : []),
      hiddenAssets: [...new Set(Array.isArray(source.hiddenAssets) ? source.hiddenAssets.filter((id) => typeof id === "string") : [])],
      npcOverrides: clone(isPlainRecord(source.npcOverrides) ? source.npcOverrides : {}),
      addedNpcs: clone(Array.isArray(source.addedNpcs) ? source.addedNpcs.filter(isPlainRecord) : []),
      hiddenNpcs: [...new Set(Array.isArray(source.hiddenNpcs) ? source.hiddenNpcs.filter((id) => typeof id === "string") : [])],
      entrances: clone(Array.isArray(source.entrances) ? source.entrances.filter(isPlainRecord) : []),
      events: clone(Array.isArray(source.events) ? source.events.filter(isPlainRecord) : []),
    };
  };

  let rawDataSnapshot = clone(window.CITY_MAP_EDITOR_DATA || {});
  let data = normalizeData(rawDataSnapshot);
  let revision = 0;
  let enabled = false;
  let bound = false;
  let mode = "objects";
  let terrainType = "blocked";
  let groundType = "grass";
  let selected = null;
  let drag = null;
  let lastPaintedTile = "";
  let eventSource = null;
  let inviteUrl = "";
  let collaborators = [];
  let presenceTimer = 0;
  let presenceMovementTimer = 0;
  let presenceHeartbeatTimer = 0;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;
  let flushTimer = 0;
  let diagnosticsTimer = 0;
  let sending = false;
  let presenceRequestsInFlight = 0;
  let presenceSendQueued = false;
  let presenceSequence = Date.now() * 1000;
  let pollingOnline = false;
  let presenceCursor = null;
  let pendingBatches = [];
  let conflictState = null;
  let activeTransaction = null;
  let keyboardTransaction = null;
  let formTransaction = null;
  let terrainTool = "pencil";
  let groundTool = "pencil";
  let spacePressed = false;
  let presenceRenderSignature = "";
  const remoteChangedKeys = new Set();
  const remoteKeyRevisions = new Map();
  const multiSelection = new Set();
  const lockedEntities = new Set();
  const groupedAssets = new Map();
  const touchPointers = new Map();
  let pinchGesture = null;
  const temporarilyHiddenEntities = new Set();
  let copiedAssets = [];
  const history = new TransactionHistory();
  const presenceGate = new PresenceGate();
  const activity = [];
  const remoteActivityGroups = new Map();

  const canvas = $("#worldCanvas");
  const editor = $("#buildingEditor");
  const saveStatus = $("#mapEditorSaveStatus");
  const connectionStatus = $("#mapEditorConnectionStatus");
  const revisionLabel = $("#mapEditorRevision");
  const nameInput = $("#mapEditorNameInput");
  const presenceList = $("#mapEditorPresenceList");
  const activityList = $("#mapEditorActivityList");
  const undoButton = $("#mapEditorUndoButton");
  const redoButton = $("#mapEditorRedoButton");
  const globalSaveStatus = $("#mapEditorGlobalStatus");
  const prototypeSelect = $("#assetPrototypeSelect");
  const snapSelect = $("#assetSnapSelect");
  const token = new URLSearchParams(window.location.search).get("editorToken") || "";
  const storage = (() => { try { return window.sessionStorage; } catch { return null; } })();
  const persistentStorage = (() => { try { return window.localStorage; } catch { return null; } })();
  const safelyStore = (target, key, value) => {
    try { target?.setItem(key, value); return Boolean(target); }
    catch { return false; }
  };
  const storedStringList = (key) => { try { const value = JSON.parse(persistentStorage?.getItem(key) || "[]"); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } };
  const workspacePreferencesKey = `pokemon-map-editor-workspace-v1:${activeMapId}`;
  const workspacePreferences = (() => {
    try {
      const value = JSON.parse(persistentStorage?.getItem(workspacePreferencesKey) || "null");
      return value && typeof value === "object" ? value : {};
    } catch { return {}; }
  })();
  if (EDITOR_MODE_ORDER.includes(workspacePreferences.mode)) mode = workspacePreferences.mode;
  if (["pencil", "eraser", "eyedropper", "rectangle", "fill"].includes(workspacePreferences.terrainTool)) terrainTool = workspacePreferences.terrainTool;
  if (["pencil", "path", "eraser", "eyedropper", "rectangle", "fill"].includes(workspacePreferences.groundTool)) groundTool = workspacePreferences.groundTool;
  const favoriteAssetSprites = new Set(storedStringList("pokemon-map-editor-favorite-assets"));
  let recentAssetSprites = storedStringList("pokemon-map-editor-recent-assets");
  let favoritesOnly = false;
  let catalogLastActivation = { id: "", at: 0 };
  let draggedCatalogAssetId = "";
  const actorId = (() => {
    let existing = "";
    try { existing = storage?.getItem("pokemon-map-editor-actor") || ""; } catch { /* La sesión puede bloquear escritura y lectura. */ }
    const actorPattern = new RegExp(`^[a-z0-9][a-z0-9_-]{0,${MAP_EDITOR_RULES.lengths.id - 1}}$`, "i");
    if (actorPattern.test(existing || "")) return existing;
    const generated = `editor-${randomIdentifier()}`;
    safelyStore(storage, "pokemon-map-editor-actor", generated);
    return generated;
  })();
  const legacyOutboxId = `pending:${window.location.pathname}:${activeMapId}`;
  const outboxId = `${legacyOutboxId}:${actorId}`;
  let outbox = new DurableOutboxQueue(new IndexedDbOutboxAdapter({
    key: outboxId,
    legacyKeys: [legacyOutboxId],
    legacyActorId: actorId,
  }), { actorId, key: outboxId });
  const fallbackOutboxKey = `pokemon-map-editor-outbox-v2:${window.location.pathname}:${activeMapId}:${actorId}`;
  const legacyFallbackOutboxKey = `pokemon-map-editor-outbox-v2:${window.location.pathname}:${activeMapId}`;
  const soloStorageKey = `pokemon-map-editor-solo-v1:${activeMapId}`;

  function readSoloSnapshot() {
    try {
      const stored = JSON.parse(persistentStorage?.getItem(soloStorageKey) || "null");
      return stored?.version === 1 && stored.data ? { revision: Number(stored.revision) || 0, data: stored.data } : null;
    } catch { return null; }
  }

  function persistSoloSnapshot() {
    if (!persistentStorage) return false;
    try {
      persistentStorage.setItem(soloStorageKey, JSON.stringify({ version: 1, revision, data }));
      return true;
    } catch { return false; }
  }

  function localStorageOutboxAdapter() {
    return {
      async read() {
        try {
          const current = JSON.parse(persistentStorage?.getItem(fallbackOutboxKey) || "null");
          if (current != null) return current;
          const legacy = JSON.parse(persistentStorage?.getItem(legacyFallbackOutboxKey) || "null");
          if (legacy == null || (legacy.actorId && legacy.actorId !== actorId)) return null;
          persistentStorage?.setItem(fallbackOutboxKey, JSON.stringify(legacy));
          persistentStorage?.removeItem(legacyFallbackOutboxKey);
          return legacy;
        } catch { return null; }
      },
      async write(value) {
        if (!persistentStorage) throw new Error("No hay almacenamiento local disponible");
        persistentStorage.setItem(fallbackOutboxKey, JSON.stringify(value));
      },
      async clear() { persistentStorage?.removeItem(fallbackOutboxKey); },
    };
  }

  async function recoverOutbox() {
    try {
      return await outbox.recover();
    } catch {
      outbox = new DurableOutboxQueue(localStorageOutboxAdapter(), { actorId, key: outboxId });
      return outbox.recover();
    }
  }
  const color = (() => {
    let hash = 0;
    for (const character of actorId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const palette = ["#45c4ff", "#ff6b8a", "#ffd166", "#7be495", "#b892ff", "#ff955c", "#5de2c2", "#f071d4"];
    return palette[hash % palette.length];
  })();
  let editorName = persistentStorage?.getItem("pokemon-map-editor-name")?.slice(0, MAP_EDITOR_RULES.lengths.actorName)
    || `Editor ${actorId.slice(-4).toUpperCase()}`;

  const assetInputs = {
    label: $("#assetLabelInput"), x: $("#assetXInput"), y: $("#assetYInput"),
    scale: $("#assetScaleInput"), depthY: $("#assetDepthInput"), rotation: $("#assetRotationInput"),
    solid: $("#assetSolidInput"),
  };
  const npcInputs = {
    col: $("#npcColInput"), row: $("#npcRowInput"), name: $("#npcNameInput"),
    sprite: $("#npcSpriteInput"), direction: $("#npcDirectionInput"), lines: $("#npcLinesInput"),
    patrol: $("#npcPatrolEnabledInput"), patrolCol: $("#npcPatrolColInput"),
    patrolRow: $("#npcPatrolRowInput"), patrolSpeed: $("#npcPatrolSpeedInput"),
  };
  const entranceInputs = {
    col: $("#entranceColInput"), row: $("#entranceRowInput"), label: $("#entranceLabelInput"),
    action: $("#entranceActionInput"), targetMap: $("#entranceTargetMapInput"),
    targetX: $("#entranceTargetXInput"), targetY: $("#entranceTargetYInput"),
    targetDirection: $("#entranceTargetDirectionInput"), effect: $("#entranceEffectInput"),
    linkedAssetId: $("#entranceLinkedAssetInput"),
  };
  const eventInputs = {
    col: $("#eventColInput"), row: $("#eventRowInput"), label: $("#eventLabelInput"), type: $("#eventTypeInput"),
    trigger: $("#eventTriggerInput"), message: $("#eventMessageInput"),
    targetMap: $("#eventTargetMapInput"), targetX: $("#eventTargetXInput"), targetY: $("#eventTargetYInput"),
    targetDirection: $("#eventTargetDirectionInput"), effect: $("#eventEffectInput"),
    duration: $("#eventDurationInput"), intensity: $("#eventIntensityInput"),
    itemKind: $("#eventItemKindInput"), itemName: $("#eventItemNameInput"), amount: $("#eventAmountInput"),
    flag: $("#eventFlagInput"), requiresFlag: $("#eventRequiresFlagInput"), requiredFlagValue: $("#eventRequiredFlagValueInput"),
    jingle: $("#eventJingleInput"),
    once: $("#eventOnceInput"), enabled: $("#eventEnabledInput"),
  };

  function apiUrl(pathname) {
    const url = new URL(pathname, window.location.href);
    url.searchParams.set("map", activeMapId);
    if (token) url.searchParams.set("editorToken", token);
    return url;
  }

  function setSaveStatus(state, message) {
    [saveStatus, globalSaveStatus].filter(Boolean).forEach((element) => {
      element.dataset.state = state;
      element.dataset.visible = String(state !== "saved" || bridge.isOpen());
      const text = element.querySelector("span");
      if (text) text.textContent = message;
    });
  }

  function setConnection(state, message) {
    if (!connectionStatus) return;
    connectionStatus.dataset.state = state;
    connectionStatus.textContent = message;
  }

  function setRevision(nextRevision, exact = false) {
    const next = Number(nextRevision) || 0;
    revision = exact ? next : Math.max(revision, next);
    if (revisionLabel) revisionLabel.textContent = `rev ${revision}`;
  }

  function operationKey(operation) {
    return editorOperationKey(operation);
  }

  function arrayUpsert(list, value) {
    const index = list.findIndex((entry) => entry?.id === value.id);
    if (index < 0) list.push(clone(value));
    else list[index] = clone(value);
  }

  function arrayDelete(list, id) {
    const index = list.findIndex((entry) => entry?.id === id);
    if (index >= 0) list.splice(index, 1);
  }

  function setHidden(listName, id, present) {
    const values = new Set(data[listName]);
    if (present) values.add(id); else values.delete(id);
    data[listName] = [...values];
  }

  function applyDataOperation(operation) {
    if (operation.type === "tile.set") {
      if (operation.value == null) delete data.tileOverrides[operation.key];
      else data.tileOverrides[operation.key] = operation.value;
      return;
    }
    if (operation.type === "ground.set") {
      const collection = operation.scene
        ? (data.interiorGroundOverrides[operation.scene] ||= {})
        : data.groundOverrides;
      if (operation.value == null) delete collection[operation.key];
      else collection[operation.key] = operation.value;
      if (operation.scene && !Object.keys(collection).length) delete data.interiorGroundOverrides[operation.scene];
      return;
    }
    if (operation.type === "map.resize") {
      data.mapSize = { ...operation.value };
      updateMapSizeUi();
      scheduleMapDiagnostics();
      return;
    }
    if (operation.type === "list.set") {
      data[operation.list] = [...operation.value];
      return;
    }
    const { collection, id } = operation;
    if (operation.type === "entity.set") {
      if (["assetOverrides", "npcOverrides"].includes(collection)) data[collection][id] = clone(operation.value);
      else arrayUpsert(data[collection], { ...clone(operation.value), id });
      if (collection === "assetOverrides") { arrayDelete(data.addedAssets, id); setHidden("hiddenAssets", id, false); }
      if (collection === "addedAssets") { delete data.assetOverrides[id]; setHidden("hiddenAssets", id, false); }
      if (collection === "npcOverrides") { arrayDelete(data.addedNpcs, id); setHidden("hiddenNpcs", id, false); }
      if (collection === "addedNpcs") { delete data.npcOverrides[id]; setHidden("hiddenNpcs", id, false); }
      return;
    }
    if (["assetOverrides", "npcOverrides"].includes(collection)) delete data[collection][id];
    else arrayDelete(data[collection], id);
    if (collection === "assetOverrides") setHidden("hiddenAssets", id, operation.hide !== false);
    if (collection === "npcOverrides") setHidden("hiddenNpcs", id, operation.hide !== false);
  }

  function applyBridgeOperation(operation) {
    if (operation.type === "tile.set") {
      const [col, row] = operation.key.split(",").map(Number);
      bridge.setTile(col, row, operation.value == null ? "inherit" : operation.value);
      return;
    }
    if (operation.type === "ground.set") {
      const [col, row] = operation.key.split(",").map(Number);
      bridge.setGround(col, row, operation.value == null ? "inherit" : operation.value, operation.scene || "world");
      return;
    }
    if (operation.type === "map.resize") {
      bridge.resizeMap?.(operation.value.cols, operation.value.rows);
      applyInputRules();
      return;
    }
    if (operation.type === "list.set") {
      bridge.applyEditorData?.(data);
      return;
    }
    if (operation.rebuildRuntime) {
      bridge.applyEditorData?.(data);
    } else if (operation.type === "entity.set") {
      bridge.setEntity?.(operation.entity, operation.id, { ...clone(operation.value), id: operation.id });
    } else {
      bridge.deleteEntity?.(operation.entity, operation.id);
    }
  }

  function recordActivity(message, remoteName = "", groupId = "") {
    const formatted = `${remoteName ? `${remoteName}: ` : ""}${message}`;
    const previous = groupId ? remoteActivityGroups.get(groupId)?.formatted : "";
    if (previous) {
      const index = activity.indexOf(previous);
      if (index >= 0) activity.splice(index, 1);
    }
    activity.unshift(formatted);
    if (groupId) remoteActivityGroups.set(groupId, { ...(remoteActivityGroups.get(groupId) || {}), formatted });
    activity.splice(20);
    if (!activityList) return;
    activityList.replaceChildren(...activity.map((entry) => {
      const item = document.createElement("li"); item.textContent = entry; return item;
    }));
  }

  function updateHistoryButtons() {
    if (undoButton) undoButton.disabled = !history.canUndo;
    if (redoButton) redoButton.disabled = !history.canRedo;
  }

  function pushHistory(forward, inverse, label) {
    const after = Array.isArray(forward) ? forward : [forward];
    const before = Array.isArray(inverse) ? inverse : [inverse];
    if (!after.length || after.length !== before.length) return false;
    history.push({
      id: `tx-${randomIdentifier()}`.slice(0, MAP_EDITOR_RULES.lengths.id),
      label,
      revision,
      keys: after.map(operationKey),
      after: clone(after),
      before: clone(before),
    });
    updateHistoryButtons();
    return true;
  }

  function pendingOperationCount() {
    return pendingBatches.reduce((total, batch) => total + batch.operations.length, 0);
  }

  function persistPendingBatches() {
    return outbox.replace(pendingBatches).catch((error) => {
      setSaveStatus("error", `No se pudo proteger la bandeja local: ${error.message}`);
      throw error;
    });
  }

  function queueBatch(operations, { id = `tx-${randomIdentifier()}`, label = "Cambio", baseRevision = revision, applyData = false, applyBridge = false } = {}) {
    const validOperations = [];
    for (const operation of operations || []) {
      const validation = validateEditorOperation(operation);
      if (!validation.valid) {
        setSaveStatus("error", validation.errors[0]);
        return false;
      }
      if (applyData) applyDataOperation(operation);
      if (applyBridge) applyBridgeOperation(operation);
      validOperations.push(clone(operation));
    }
    if (!validOperations.length) return false;
    pendingBatches.push(...chunkOperationBatches(validOperations, { id, label, baseRevision }));
    void persistPendingBatches();
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flushOperations, MAP_EDITOR_RULES.timing.flushDelayMs);
    setSaveStatus("pending", `${pendingOperationCount()} cambios protegidos en este dispositivo.`);
    return true;
  }

  function queueOperation(operation, { applyData = true, applyBridge = false, label = "Cambio" } = {}) {
    return queueBatch([operation], { applyData, applyBridge, label });
  }

  async function fetchSnapshot() {
    const response = await fetch(apiUrl("/api/dev/map-editor"), { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
    return result;
  }

  function applySnapshot(snapshot, { preservePending = false } = {}) {
    if (drag || activeTransaction || keyboardTransaction || formTransaction || pinchGesture || touchPointers.size) {
      cancelCurrentAction({ clearSelection: false });
    }
    const pending = preservePending ? pendingBatches.flatMap((batch) => batch.operations).map(clone) : [];
    rawDataSnapshot = clone(snapshot.data || snapshot);
    data = normalizeData(rawDataSnapshot);
    setRevision(snapshot.revision ?? revision, true);
    bridge.applyEditorData?.(data);
    pending.forEach((operation) => {
      applyDataOperation(operation);
      applyBridgeOperation(operation);
    });
    [...multiSelection].forEach((key) => {
      const separator = key.indexOf(":");
      if (separator <= 0 || !entityById(key.slice(0, separator), key.slice(separator + 1))) multiSelection.delete(key);
    });
    if (selected && !entityById(selected.kind, selected.id)) selected = null;
    bridge.selectEntity?.(selected?.kind || null, selected?.id || null);
    bridge.setSelections?.([...multiSelection].map((key) => {
      const separator = key.indexOf(":"); return { kind: key.slice(0, separator), id: key.slice(separator + 1) };
    }));
    updateMapSizeUi(); applyInputRules(); renderSelection(); renderOutliner();
  }

  async function resyncAfterConflict(result) {
    conflictState = { ...result, batch: clone(pendingBatches[0] || null), snapshot: await fetchSnapshot() };
    setSaveStatus("conflict", "Conflicto recuperable: compara tu cambio con la versión del servidor.");
    recordActivity(`conflicto en ${(result.conflicts || []).join(", ") || "una entidad"}`);
    renderConflict();
  }

  async function flushOperations({ keepalive = false } = {}) {
    window.clearTimeout(flushTimer);
    flushTimer = 0;
    if (!enabled || !pendingBatches.length || conflictState) return;
    if (soloMode) {
      const changeCount = pendingOperationCount();
      setRevision(revision + 1);
      const stored = persistSoloSnapshot();
      rawDataSnapshot = clone(data);
      scheduleMapDiagnostics();
      pendingBatches = [];
      try { await persistPendingBatches(); } catch { /* La copia principal ya se intentó en localStorage. */ }
      setSaveStatus("saved", stored
        ? `Modo solo · ${changeCount} cambio${changeCount === 1 ? "" : "s"} guardado${changeCount === 1 ? "" : "s"} en este navegador.`
        : "Modo solo temporal · este navegador no permite almacenamiento local.");
      return;
    }
    if (sending) { flushTimer = window.setTimeout(flushOperations, 120); return; }
    sending = true;
    const batch = pendingBatches[0];
    const operations = batch.operations;
    const baseRevision = batch.baseRevision;
    setSaveStatus("syncing", `Sincronizando «${batch.label}» (${operations.length})…`);
    try {
      const response = await fetch(apiUrl("/api/dev/map-editor/operations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, name: editorName, baseRevision, operations, transactionId: batch.transactionId, groupId: batch.groupId, label: batch.label, editorToken: token || undefined }),
        keepalive,
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) { await resyncAfterConflict(result); return; }
      if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
      setRevision(result.revision);
      rawDataSnapshot = clone(data);
      scheduleMapDiagnostics();
      pendingBatches.shift();
      pendingBatches.forEach((entry) => { if (entry.baseRevision === baseRevision) entry.baseRevision = revision; });
      await persistPendingBatches();
      const counts = result.counts || {};
      setSaveStatus(pendingBatches.length ? "pending" : "saved",
        pendingBatches.length ? `${pendingOperationCount()} cambios siguen pendientes.`
          : `Guardado · ${counts.tiles ?? 0} casillas · ${counts.objects ?? 0} objetos · ${counts.npcs ?? 0} NPC · ${counts.entrances ?? 0} entradas · ${counts.events ?? 0} eventos`);
    } catch (error) {
      setSaveStatus(navigator.onLine ? "error" : "offline", `Sin conexión: ${error.message}. El lote sigue protegido.`);
      const retry = Math.min(15000, 1200 * (2 ** Math.min(4, reconnectAttempt))) + Math.floor(Math.random() * 500);
      flushTimer = window.setTimeout(flushOperations, retry);
    } finally {
      sending = false;
      if (pendingBatches.length && !flushTimer && !conflictState) flushTimer = window.setTimeout(flushOperations, 120);
    }
  }

  function applyRemoteOperations(payload) {
    setRevision(payload.revision);
    if (payload.actorId === actorId) return;
    const operations = payload.operations || [];
    const incomingKeys = new Set(operations.map(operationKey));
    const activeBuilders = new Set([drag?.transaction, activeTransaction, keyboardTransaction?.builder, formTransaction?.builder].filter(Boolean));
    const activeKeys = new Set([...activeBuilders].flatMap((builder) => builder.command().keys));
    [drag?.beforeOperation, keyboardTransaction?.before, formTransaction?.before].filter(Boolean)
      .forEach((operation) => activeKeys.add(operationKey(operation)));
    (drag?.groupBefore || []).forEach((entity) => activeKeys.add(operationKey({ type: "entity.set", entity: "asset", id: entity.id })));
    const interrupted = [...incomingKeys].some((key) => activeKeys.has(key));
    if (interrupted) cancelCurrentAction({ clearSelection: false });
    const hasAssetChanges = operations.some((operation) => operation.entity === "asset");
    operations.forEach((operation) => {
      applyDataOperation(operation);
      applyBridgeOperation(operation);
      remoteChangedKeys.add(operationKey(operation));
      remoteKeyRevisions.set(operationKey(operation), Number(payload.revision) || revision);
    });
    if (hasAssetChanges) bridge.applyAssetSnapshot?.(data);
    rawDataSnapshot = clone(data);
    scheduleMapDiagnostics();
    const terrainCount = operations.filter((operation) => operation.type === "tile.set").length;
    const groupId = payload.groupId || payload.transactionId || "";
    const grouped = remoteActivityGroups.get(groupId) || { operations: 0, terrain: 0 };
    grouped.operations += operations.length; grouped.terrain += terrainCount; remoteActivityGroups.set(groupId, grouped);
    const description = grouped.terrain ? `pintó ${grouped.terrain} casilla${grouped.terrain === 1 ? "" : "s"}` : payload.label || `${grouped.operations} cambios`;
    recordActivity(description, payload.name || "Otro editor", groupId);
    if (interrupted) setSaveStatus(pendingBatches.length ? "pending" : "saved", "Un cambio remoto tocó tu edición activa; el gesto local se canceló.");
    renderSelection();
    renderOutliner();
  }

  function renderPresence(users = collaborators) {
    collaborators = Array.isArray(users) ? users : [];
    const signature = collaborators.map((user) => `${user.actorId}:${user.name}:${user.color}:${user.selection?.entity || ""}:${user.selection?.id || ""}`).sort().join("|");
    if (signature === presenceRenderSignature) {
      bridge.setCollaborators?.(collaborators
        .filter((user) => user.actorId !== actorId)
        .map((user) => ({ ...user, id: user.actorId, cursor: user.cursor ? { worldX: user.cursor.x, worldY: user.cursor.y } : null })));
      return;
    }
    presenceRenderSignature = signature;
    if (presenceList) {
      presenceList.replaceChildren(...collaborators.map((user) => {
        const chip = document.createElement("span");
        chip.className = "map-editor-presence-person";
        chip.setAttribute("role", "listitem");
        chip.style.setProperty("--editor-user-color", user.color || "#55c2ff");
        chip.dataset.self = String(user.actorId === actorId);
        chip.title = user.actorId === actorId ? `${user.name || editorName} (tú)` : (user.name || "Editor");
        chip.textContent = (user.name || "E").trim().charAt(0) || "E";
        return chip;
      }));
    }
    bridge.setCollaborators?.(collaborators
      .filter((user) => user.actorId !== actorId)
      .map((user) => ({ ...user, id: user.actorId, cursor: user.cursor ? { worldX: user.cursor.x, worldY: user.cursor.y } : null })));
  }

  function realtimeLifecycleActive() {
    return enabled && bridge.isOpen() && document.visibilityState !== "hidden";
  }

  function stopRealtimeLifecycle() {
    eventSource?.close();
    eventSource = null;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    window.clearTimeout(presenceTimer);
    presenceTimer = 0;
    window.clearInterval(presenceMovementTimer);
    presenceMovementTimer = 0;
    window.clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = 0;
    window.clearTimeout(diagnosticsTimer);
    diagnosticsTimer = 0;
    presenceSendQueued = false;
  }

  function startRealtimeLifecycle() {
    if (!realtimeLifecycleActive() || soloMode) {
      stopRealtimeLifecycle();
      return;
    }
    if (!eventSource) openEventStream();
    startPresenceHeartbeat();
    sendPresence(presenceCursor);
  }

  function openEventStream() {
    if (soloMode || !realtimeLifecycleActive()) return;
    eventSource?.close();
    eventSource = null;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    const url = apiUrl("/api/dev/map-editor/events");
    url.searchParams.set("actorId", actorId);
    url.searchParams.set("name", editorName);
    url.searchParams.set("color", color);
    url.searchParams.set("mode", mode);
    const source = new EventSource(url);
    eventSource = source;
    source.onopen = () => {
      if (source !== eventSource || !realtimeLifecycleActive()) return;
      reconnectAttempt = 0; pollingOnline = false; setConnection("online", "En directo");
    };
    source.onerror = () => {
      if (source !== eventSource || !realtimeLifecycleActive()) return;
      source.close();
      eventSource = null;
      setConnection("reconnecting", "Reconectando…");
      scheduleReconnect();
    };
    source.addEventListener("snapshot", (event) => {
      if (source !== eventSource || !realtimeLifecycleActive()) return;
      const snapshot = JSON.parse(event.data);
      applySnapshot(snapshot, { preservePending: pendingBatches.length > 0 });
      setConnection("online", "En directo");
    });
    source.addEventListener("operations", (event) => {
      if (source === eventSource && realtimeLifecycleActive()) applyRemoteOperations(JSON.parse(event.data));
    });
    source.addEventListener("presence", (event) => {
      if (source === eventSource && realtimeLifecycleActive()) renderPresence(JSON.parse(event.data).users);
    });
  }

  function scheduleReconnect() {
    if (soloMode || !realtimeLifecycleActive() || eventSource || reconnectTimer) return;
    const base = Math.min(MAP_EDITOR_RULES.timing.reconnectMaximumMs, 700 * (2 ** reconnectAttempt));
    const delay = base + Math.floor(Math.random() * Math.max(250, base * .35));
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      if (realtimeLifecycleActive()) openEventStream();
    }, delay);
  }

  function presencePayload(cursor = presenceCursor) {
    return {
      actorId, name: editorName, color, cursor, mode,
      selection: selected ? { entity: selected.kind, id: selected.id } : null,
      player: bridge.playerPresence?.() || null,
      editorToken: token || undefined,
    };
  }

  async function publishPresence(cursor = presenceCursor, { heartbeat = false } = {}) {
    if (soloMode || !realtimeLifecycleActive()) return { send: false, wait: 0, changed: false };
    if (presenceRequestsInFlight >= 3) {
      presenceSendQueued = true;
      return { send: false, wait: MAP_EDITOR_RULES.timing.presenceMovementMs, changed: true };
    }
    const payload = presencePayload(cursor);
    const decision = presenceGate.decision(payload, Date.now(), { heartbeat });
    if (!decision.send) return decision;
    payload.sequence = ++presenceSequence;
    presenceRequestsInFlight += 1;
    try {
      const response = await fetch(apiUrl("/api/dev/map-editor/presence"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
      renderPresence(result.users);
    } finally {
      presenceRequestsInFlight = Math.max(0, presenceRequestsInFlight - 1);
      if (presenceSendQueued && realtimeLifecycleActive()) {
        presenceSendQueued = false;
        sendPresence(presenceCursor);
      }
    }
  }

  function sendPresence(cursor = null) {
    presenceCursor = cursor;
    if (soloMode || !realtimeLifecycleActive()) return;
    if (presenceTimer) return;
    const publishLatest = async () => {
      presenceTimer = 0;
      if (!realtimeLifecycleActive()) return;
      try {
        const decision = await publishPresence(presenceCursor);
        if (realtimeLifecycleActive() && decision && !decision.send && decision.changed && decision.wait > 0) {
          presenceTimer = window.setTimeout(publishLatest, decision.wait);
        }
      } catch { /* EventSource reconnection exposes the connection state. */ }
    };
    presenceTimer = window.setTimeout(publishLatest, 0);
  }

  function startPresenceHeartbeat() {
    if (soloMode || !realtimeLifecycleActive()) return;
    window.clearInterval(presenceMovementTimer);
    window.clearInterval(presenceHeartbeatTimer);
    presenceMovementTimer = window.setInterval(() => {
      if (realtimeLifecycleActive()) sendPresence(presenceCursor);
    }, MAP_EDITOR_RULES.timing.presenceMovementMs);
    presenceHeartbeatTimer = window.setInterval(() => {
      if (!realtimeLifecycleActive()) return;
      void publishPresence(presenceCursor, { heartbeat: true }).catch(() => {});
    }, MAP_EDITOR_RULES.timing.presenceHeartbeatMs);
  }

  function entityCollection(kind, id) {
    if (kind === "asset") return data.addedAssets.some((entry) => entry?.id === id) ? "addedAssets" : "assetOverrides";
    if (kind === "npc") return data.addedNpcs.some((entry) => entry?.id === id) ? "addedNpcs" : "npcOverrides";
    return kind === "entrance" ? "entrances" : "events";
  }

  function entityById(kind, id) {
    if (!id) return null;
    const records = kind === "asset" ? bridge.assets() : bridge.entities?.(kind) || [];
    return records.find((entry) => entry.id === id) || null;
  }

  function selectedEntity() { return selected ? entityById(selected.kind, selected.id) : null; }

  function assetRecord(asset, added = false) {
    const record = {
      x: Math.round(Number(asset.x) * 100) / 100,
      y: Math.round(Number(asset.y) * 100) / 100,
      scale: Math.round((Number(asset.scale) || 1) * 1000) / 1000,
      rotation: Math.round((Number(asset.rotation) || 0) * 100) / 100,
      depthY: Math.round(Number(asset.depthY ?? asset.y) * 100) / 100,
      solid: asset.solid !== false,
      flipX: Boolean(asset.flipX),
    };
    if (asset.label) record.label = String(asset.label).slice(0, MAP_EDITOR_RULES.lengths.assetLabel);
    if (added) {
      record.id = asset.id;
      record.sprite = asset.sprite;
      record.scene = String(asset.scene || bridge.sceneInfo?.().id || "world").slice(0, 64);
    }
    return record;
  }

  function npcRecord(npc) {
    const record = {
      id: npc.id, col: Math.floor(Number(npc.col)), row: Math.floor(Number(npc.row)),
      scene: String(npc.scene || bridge.sceneInfo?.().id || "world").slice(0, 64),
      direction: npc.direction || "down", name: String(npc.name || "NPC").slice(0, 80),
      sprite: npc.sprite || "guide", lines: (npc.lines || []).map(String).slice(0, MAP_EDITOR_RULES.lengths.npcLines),
    };
    if (npc.patrol?.to) record.patrol = { to: npc.patrol.to.map(Number), tilesPerSecond: Number(npc.patrol.tilesPerSecond) || .75 };
    return record;
  }

  function cleanEntityRecord(kind, entity) {
    if (kind === "asset") return assetRecord(entity, entityCollection(kind, entity.id) === "addedAssets");
    if (kind === "npc") return npcRecord(entity);
    return clone(entity);
  }

  function selectionKey(kind, id) { return `${kind}:${id}`; }

  function remoteLockOwner(kind, id) {
    return collaborators.find((user) => user.actorId !== actorId && user.selection?.entity === kind && user.selection?.id === id) || null;
  }

  function setSelected(kind, id, { add = false } = {}) {
    const selectionChanges = selected?.kind !== kind || selected?.id !== id;
    if (selectionChanges && keyboardTransaction) {
      commitTransaction(keyboardTransaction.builder); keyboardTransaction = null;
    }
    if (selectionChanges && formTransaction) {
      commitTransaction(formTransaction.builder); formTransaction = null;
    }
    if (!add || kind !== "asset") multiSelection.clear();
    if (kind && id) {
      const key = selectionKey(kind, id);
      if (add && multiSelection.has(key)) multiSelection.delete(key);
      else multiSelection.add(key);
    }
    selected = kind && id ? { kind, id } : null;
    bridge.selectEntity?.(kind, id);
    bridge.setSelections?.([...multiSelection].map((key) => {
      const separator = key.indexOf(":"); return { kind: key.slice(0, separator), id: key.slice(separator + 1) };
    }));
    renderSelection();
    renderOutliner();
    sendPresence();
  }

  function allEditorEntities() {
    return [
      ...bridge.assets().map((entity) => ({ kind: "asset", entity })),
      ...(bridge.entities?.("npc") || []).map((entity) => ({ kind: "npc", entity })),
      ...(bridge.entities?.("entrance") || []).map((entity) => ({ kind: "entrance", entity })),
      ...(bridge.entities?.("event") || []).map((entity) => ({ kind: "event", entity })),
    ];
  }

  function renderOutliner() {
    const list = $("#mapEditorOutlinerList"); if (!list) return;
    const query = String($("#mapEditorSearchInput")?.value || "").trim().toLowerCase();
    const filter = $("#mapEditorFilterInput")?.value || "all";
    const pendingKeys = new Set(pendingBatches.flatMap((batch) => batch.operations.map(operationKey)));
    const entities = allEditorEntities().filter(({ kind, entity }) => {
      if (filter !== "all" && kind !== filter) return false;
      const tile = kind === "asset" ? `${Math.floor(entity.x / bridge.grid().tileSize)},${Math.floor(entity.y / bridge.grid().tileSize)}` : `${entity.col},${entity.row}`;
      return !query || `${entity.id} ${entity.label || entity.name || ""} ${kind} ${tile}`.toLowerCase().includes(query);
    });
    const count = $("#mapEditorOutlinerCount"); if (count) count.textContent = String(entities.length);
    list.replaceChildren(...entities.slice(0, 250).map(({ kind, entity }) => {
      const key = selectionKey(kind, entity.id);
      const row = document.createElement("div"); row.className = "map-editor-outliner-row"; row.setAttribute("role", "listitem");
      row.dataset.selected = String(multiSelection.has(key) || (selected?.kind === kind && selected.id === entity.id));
      const selectButton = document.createElement("button"); selectButton.type = "button"; selectButton.dataset.outlinerSelect = key;
      selectButton.innerHTML = `<span>${kind === "asset" ? "◆" : kind === "npc" ? "♟" : kind === "entrance" ? "⇥" : "✦"}</span>`;
      const text = document.createElement("span");
      const position = kind === "asset" ? `X${Math.round(entity.x)} Y${Math.round(entity.y)}` : `C${entity.col} F${entity.row}`;
      text.innerHTML = `<strong></strong><small></small>`; text.querySelector("strong").textContent = entity.label || entity.name || entity.id; text.querySelector("small").textContent = `${entity.id} · ${position}${groupedAssets.has(key) ? " · grupo" : ""}${pendingKeys.has(operationKey({ entity: kind, id: entity.id })) ? " · local" : remoteChangedKeys.has(operationKey({ entity: kind, id: entity.id })) ? " · remoto" : ""}`;
      selectButton.appendChild(text);
      const centerButton = document.createElement("button"); centerButton.type = "button"; centerButton.dataset.outlinerCenter = key; centerButton.title = "Centrar"; centerButton.setAttribute("aria-label", `Centrar ${entity.id}`); centerButton.textContent = "◎";
      const hideButton = document.createElement("button"); hideButton.type = "button"; hideButton.dataset.outlinerHide = key; hideButton.title = "Ocultar temporalmente"; hideButton.setAttribute("aria-pressed", String(temporarilyHiddenEntities.has(key))); hideButton.textContent = temporarilyHiddenEntities.has(key) ? "◌" : "◉";
      const lockButton = document.createElement("button"); lockButton.type = "button"; lockButton.dataset.outlinerLock = key; lockButton.title = "Bloquear"; lockButton.setAttribute("aria-pressed", String(lockedEntities.has(key))); lockButton.textContent = lockedEntities.has(key) ? "▣" : "▢";
      row.append(selectButton, centerButton, hideButton, lockButton); return row;
    }));
    scheduleMapDiagnostics();
  }

  function collectMapDiagnostics() {
    const issues = [];
    const entities = allEditorEntities();
    const seen = new Set();
    const occupiedTransitions = new Map();
    const push = (severity, kind, entity, message) => {
      const id = String(entity?.id || "");
      issues.push({
        severity, kind, id,
        label: String(entity?.label || entity?.name || entity?.id || "Mapa"), message,
        navigable: Boolean(id && entityById(kind, id)),
      });
    };

    const snapshotValidation = validateMapEditorData(rawDataSnapshot);
    snapshotValidation.errors.forEach((message) => push("error", "map", null, message));

    const rawSeen = new Set();
    [
      ["asset", data.addedAssets], ["npc", data.addedNpcs],
      ["entrance", data.entrances], ["event", data.events],
    ].forEach(([kind, records]) => (Array.isArray(records) ? records : []).forEach((record, index) => {
      const entity = record && typeof record === "object" && !Array.isArray(record) ? record : {};
      const rawKey = entity.id ? selectionKey(kind, entity.id) : "";
      if (rawKey && rawSeen.has(rawKey)) push("error", kind, entity, "Hay otra entidad con el mismo ID en los datos del mapa.");
      if (rawKey) rawSeen.add(rawKey);
      const validation = contextualEntityValidation(kind, clone(record));
      validation.errors.forEach((message) => push("error", kind, { ...entity, label: entity.label || entity.name || `Registro ${index + 1}` }, message));
    }));

    entities.forEach(({ kind, entity }) => {
      const key = selectionKey(kind, entity.id);
      if (seen.has(key)) push("error", kind, entity, "Hay otra entidad con el mismo ID.");
      seen.add(key);
      const validation = contextualEntityValidation(kind, clone(entity));
      validation.errors.forEach((message) => push("error", kind, entity, message));
      validation.warnings.forEach((message) => push("warning", kind, entity, message));
      if ((kind === "entrance" || kind === "event") && (entity.action === "transition" || ["teleport", "transition"].includes(entity.type))) {
        const positionKey = `${entity.scene || "world"}|${entity.col},${entity.row}`;
        const previous = occupiedTransitions.get(positionKey);
        if (previous) push("warning", kind, entity, `Comparte casilla de transición con ${previous}.`);
        else occupiedTransitions.set(positionKey, entity.label || entity.id);
      }
    });
    return [...new Map(issues.map((issue) => [`${issue.severity}:${issue.kind}:${issue.id}:${issue.message}`, issue])).values()];
  }

  function renderMapDiagnostics() {
    const list = $("#mapEditorDiagnosticsList");
    const status = $("#mapEditorDiagnosticsStatus");
    const count = $("#mapEditorDiagnosticsCount");
    if (!list || !status || !count) return;
    const issues = collectMapDiagnostics();
    const errors = issues.filter((issue) => issue.severity === "error").length;
    const warnings = issues.length - errors;
    count.textContent = String(issues.length);
    count.dataset.state = errors ? "error" : warnings ? "warning" : "ok";
    status.dataset.state = errors ? "error" : warnings ? "warning" : "ok";
    status.textContent = errors
      ? `${errors} errores y ${warnings} avisos por revisar.`
      : warnings ? `${warnings} avisos; el mapa se puede probar.` : "Todo listo: no se han encontrado problemas.";
    list.replaceChildren(...issues.slice(0, 50).map((issue) => {
      const item = document.createElement("li"); item.dataset.state = issue.severity;
      const button = document.createElement("button"); button.type = "button";
      if (issue.navigable) button.dataset.diagnosticEntity = selectionKey(issue.kind, issue.id);
      else button.disabled = true;
      const title = document.createElement("strong"); title.textContent = issue.label;
      const message = document.createElement("span"); message.textContent = issue.message;
      button.append(title, message); item.appendChild(button); return item;
    }));
  }

  function scheduleMapDiagnostics(delay = 220) {
    if (!$("#mapEditorDiagnosticsList")) return;
    window.clearTimeout(diagnosticsTimer);
    diagnosticsTimer = 0;
    if (!realtimeLifecycleActive()) return;
    diagnosticsTimer = window.setTimeout(() => {
      diagnosticsTimer = 0;
      if (realtimeLifecycleActive()) renderMapDiagnostics();
    }, delay);
  }

  function setInfo(selector, primary, secondary) {
    const element = $(selector);
    if (!element) return;
    const spans = element.querySelectorAll("span");
    if (spans[0]) spans[0].textContent = primary;
    if (spans[1]) spans[1].textContent = secondary;
  }

  function renderAssetSelection(asset) {
    const inspector = $("#assetInspector");
    inspector.disabled = !asset;
    if (!asset) { setInfo("#assetSelectionInfo", "Selecciona un objeto", "Arrastra sobre el mapa"); return; }
    setInfo("#assetSelectionInfo", asset.label || asset.id, `${asset.sprite || asset.kind} · ${Math.round(asset.w || 0)}×${Math.round(asset.h || 0)} px`);
    assetInputs.label.value = asset.label || ""; assetInputs.x.value = Math.round(Number(asset.x) * 100) / 100;
    assetInputs.y.value = Math.round(Number(asset.y) * 100) / 100; assetInputs.scale.value = Number(asset.scale) || 1;
    assetInputs.depthY.value = Math.round(Number(asset.depthY ?? asset.y) * 100) / 100;
    assetInputs.rotation.value = Number(asset.rotation) || 0; assetInputs.solid.checked = asset.solid !== false;
    $("#deleteAssetButton").textContent = entityCollection("asset", asset.id) === "addedAssets" ? "Eliminar" : "Ocultar";
    presentEntityValidation("asset", asset, $("#assetValidation"), Object.values(assetInputs));
  }

  function renderNpcSelection(npc) {
    $("#npcInspector").disabled = !npc;
    if (!npc) { setInfo("#npcSelectionInfo", "Selecciona un NPC", "Haz clic en el mapa"); return; }
    setInfo("#npcSelectionInfo", npc.name || npc.id, `C${npc.col} · F${npc.row} · ${npc.sprite}`);
    npcInputs.col.value = npc.col; npcInputs.row.value = npc.row; npcInputs.name.value = npc.name || "";
    npcInputs.sprite.value = npc.sprite || "guide"; npcInputs.direction.value = npc.direction || "down";
    npcInputs.lines.value = (npc.lines || []).join("\n"); npcInputs.patrol.checked = Boolean(npc.patrol);
    updateNpcSpritePreview(npc.sprite, npc.direction);
    $("#npcPatrolFields").classList.toggle("hidden", !npc.patrol);
    npcInputs.patrolCol.value = npc.patrol?.to?.[0] ?? npc.col;
    npcInputs.patrolRow.value = npc.patrol?.to?.[1] ?? npc.row;
    npcInputs.patrolSpeed.value = npc.patrol?.tilesPerSecond ?? .75;
    $("#deleteNpcButton").textContent = entityCollection("npc", npc.id) === "addedNpcs" ? "Eliminar" : "Ocultar";
    presentEntityValidation("npc", npc, $("#npcValidation"), Object.values(npcInputs));
  }

  function renderEntranceSelection(entrance) {
    $("#entranceInspector").disabled = !entrance;
    if (!entrance) { setInfo("#entranceSelectionInfo", "Selecciona una entrada", "Haz clic en el mapa"); return; }
    setInfo("#entranceSelectionInfo", entrance.label || entrance.id, `C${entrance.col} · F${entrance.row} → ${entrance.targetMap || entrance.action || "cerrada"}`);
    Object.entries(entranceInputs).forEach(([key, input]) => {
      const fallback = key === "targetDirection" ? "down" : key === "effect" ? "fade" : "";
      input.value = entrance[key] ?? fallback;
    });
    $("#deleteEntranceButton").textContent = bridge.isBaseEntity?.("entrance", entrance.id) ? "Ocultar" : "Eliminar";
    validateEntrance(entrance);
  }

  function updateEventFieldVisibility(type) {
    $$('[data-event-fields="target"]').forEach((element) => element.classList.toggle("hidden", !["teleport", "transition"].includes(type)));
    $$('[data-event-fields="vibration"]').forEach((element) => element.classList.toggle("hidden", type !== "vibration"));
    $$('[data-event-fields="pickup"]').forEach((element) => element.classList.toggle("hidden", type !== "pickup"));
    $$('[data-event-fields="switch"]').forEach((element) => element.classList.toggle("hidden", type !== "switch"));
    $$('[data-event-fields="sound"]').forEach((element) => element.classList.toggle("hidden", type !== "sound"));
  }

  function renderEventSelection(event) {
    $("#eventInspector").disabled = !event;
    if (!event) {
      updateEventFieldVisibility("dialogue");
      setInfo("#eventSelectionInfo", "Selecciona un evento", "Haz clic en el mapa");
      return;
    }
    setInfo("#eventSelectionInfo", event.label || event.id, `C${event.col} · F${event.row} · ${event.type}`);
    eventInputs.col.value = event.col; eventInputs.row.value = event.row; eventInputs.label.value = event.label || "Evento"; eventInputs.type.value = event.type || "dialogue";
    eventInputs.trigger.value = event.trigger || "interact"; eventInputs.message.value = Array.isArray(event.message) ? event.message.join("\n") : event.message || "";
    eventInputs.targetMap.value = event.targetMap || ""; eventInputs.targetX.value = event.targetX ?? ""; eventInputs.targetY.value = event.targetY ?? "";
    eventInputs.targetDirection.value = event.targetDirection || "down"; eventInputs.effect.value = event.effect || (event.type === "transition" ? "fade" : "none");
    eventInputs.duration.value = event.duration ?? 440; eventInputs.intensity.value = event.intensity ?? 1;
    eventInputs.itemKind.value = event.itemKind || "potions"; eventInputs.itemName.value = event.itemName || ""; eventInputs.amount.value = event.amount ?? 1;
    eventInputs.flag.value = event.flag || ""; eventInputs.requiresFlag.value = event.requiresFlag || "";
    eventInputs.requiredFlagValue.value = event.requiredFlagValue === false ? "false" : "true";
    eventInputs.jingle.value = event.jingle || "success";
    eventInputs.once.checked = Boolean(event.once); eventInputs.enabled.checked = event.enabled !== false;
    updateEventFieldVisibility(event.type);
    validateEvent(event);
  }

  function renderSelection() {
    const entity = selectedEntity();
    renderAssetSelection(selected?.kind === "asset" ? entity : null);
    renderNpcSelection(selected?.kind === "npc" ? entity : null);
    renderEntranceSelection(selected?.kind === "entrance" ? entity : null);
    renderEventSelection(selected?.kind === "event" ? entity : null);
    syncPerspectiveEntranceButton();
    const multiActions = $("#assetMultiActions");
    if (multiActions) multiActions.classList.toggle("hidden", multiSelection.size < 2);
    if (selected?.kind === "asset" && multiSelection.size > 1) setInfo("#assetSelectionInfo", `${multiSelection.size} objetos seleccionados`, "Shift + clic para añadir o quitar");
  }

  function updateNpcSpritePreview(sprite = npcInputs.sprite?.value, direction = npcInputs.direction?.value) {
    const preview = $("#npcSpritePreview"); if (!preview) return;
    const rows = { down: 0, left: 1, right: 2, up: 3 };
    const source = bridge.npcSpriteUrl?.(sprite) || "";
    preview.style.backgroundImage = source ? `url("${source.replace(/["\\]/g, "\\$&")}")` : "none";
    preview.style.backgroundPosition = `0 -${(rows[direction] || 0) * 64}px`;
    preview.dataset.missing = String(!source);
    preview.setAttribute("aria-label", source ? `Sprite ${sprite}, dirección ${direction}` : `Sprite ${sprite} sin previsualización disponible`);
  }

  function validateEntrance(entrance) {
    return presentEntityValidation("entrance", entrance, $("#entranceValidation"), Object.values(entranceInputs));
  }

  function validateEvent(event) {
    return presentEntityValidation("event", event, $("#eventValidation"), Object.values(eventInputs));
  }

  function contextualEntityValidation(kind, entity) {
    const base = validateEditorEntity(kind, entity);
    const result = { ...base, errors: [...base.errors], warnings: [...base.warnings] };
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) return result;
    const grid = bridge.grid();
    const col = Number(entity.col); const row = Number(entity.row);
    const positionIsFinite = Number.isFinite(col) && Number.isFinite(row);
    const insideGrid = positionIsFinite && col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;
    if (kind === "asset") {
      const x = Number(entity.x); const y = Number(entity.y);
      if (entity.sprite && !bridge.assetCatalog()[entity.sprite]) {
        result.errors.push("El prototipo visual del objeto no existe en el catálogo.");
      }
      if (Number.isFinite(x) && Number.isFinite(y) && (x < 0 || y < 0 || x > grid.cols * grid.tileSize || y > grid.rows * grid.tileSize)) {
        result.errors.push("El objeto está fuera del tamaño actual del mapa.");
      }
    } else if (positionIsFinite && !insideGrid) result.errors.push("La entidad está fuera de la cuadrícula actual.");
    if (kind === "npc" && entity.patrol?.to) {
      const patrolCol = Number(entity.patrol.to[0]); const patrolRow = Number(entity.patrol.to[1]);
      const patrolInside = Number.isFinite(patrolCol) && Number.isFinite(patrolRow)
        && patrolCol >= 0 && patrolRow >= 0 && patrolCol < grid.cols && patrolRow < grid.rows;
      if (!patrolInside) result.errors.push("El destino de patrulla está fuera del tamaño actual del mapa.");
      else if (insideGrid) {
        const route = lineCells({ col, row }, { col: patrolCol, row: patrolRow }, grid);
        if (route.some((cell) => bridge.tileType(cell.col, cell.row) === "blocked")) result.errors.push("La ruta de patrulla atraviesa una casilla bloqueada.");
      }
    }
    const dialogueLines = Array.isArray(entity.lines) ? entity.lines : [];
    if (kind === "npc" && !dialogueLines.some((line) => String(line).trim())) {
      result.warnings.push("El NPC no tiene diálogo.");
    }
    if (kind === "entrance" && entity.linkedAssetId && !bridge.assets().some((asset) => String(asset.id) === String(entity.linkedAssetId))) {
      result.warnings.push("El edificio vinculado ya no existe.");
    }
    if (kind === "event") {
      const overlaps = (bridge.entities?.("event") || []).filter((candidate) => candidate.id !== entity.id && candidate.col === entity.col && candidate.row === entity.row);
      if (overlaps.length) result.warnings.push(`Comparte casilla con ${overlaps.map((candidate) => candidate.id).join(", ")}.`);
      if (insideGrid && bridge.tileType(col, row) === "blocked") result.warnings.push("El evento está en una casilla bloqueada; comprueba que siga siendo accesible.");
    }
    const targetMap = String(entity.targetMap || "").toLowerCase().replace(/_/g, "-");
    const targetsCurrentMap = targetMap === "current" || targetMap === activeMapId || (activeMapId === "san-pablo" && targetMap === "city");
    const hasTarget = kind === "entrance" ? entity.action === "transition" : kind === "event" && ["teleport", "transition"].includes(entity.type);
    if (hasTarget && targetsCurrentMap) {
      const targetX = Number(entity.targetX); const targetY = Number(entity.targetY);
      if (Number.isFinite(targetX) && Number.isFinite(targetY)
        && (targetX < 0 || targetY < 0 || targetX >= grid.cols * grid.tileSize || targetY >= grid.rows * grid.tileSize)) {
        result.errors.push("El destino está fuera del tamaño actual del mapa.");
      }
    }
    result.errors = [...new Set(result.errors)]; result.warnings = [...new Set(result.warnings)];
    result.valid = result.errors.length === 0;
    return result;
  }

  function presentEntityValidation(kind, entity, output, inputs = []) {
    const result = contextualEntityValidation(kind, entity);
    inputs.filter(Boolean).forEach((input) => {
      input.setAttribute("aria-invalid", String(!result.valid));
      if (output?.id) input.setAttribute("aria-describedby", output.id);
    });
    if (output) {
      output.dataset.state = result.valid ? (result.warnings.length ? "warning" : "ok") : "error";
      output.textContent = result.errors[0] || result.warnings[0] || (entity.enabled === false ? "Entidad desactivada." : "Datos válidos.");
    }
    return result;
  }

  function persistWorkspacePreferences() {
    if (!persistentStorage) return;
    const terrainBrushSize = Number($("#terrainBrushSize")?.value) || Number(workspacePreferences.terrainBrushSize) || 1;
    const groundBrushSize = Number($("#groundBrushSize")?.value) || Number(workspacePreferences.groundBrushSize) || 1;
    try {
      persistentStorage.setItem(workspacePreferencesKey, JSON.stringify({ mode, terrainTool, groundTool, terrainBrushSize, groundBrushSize }));
    } catch { /* Las preferencias nunca deben impedir editar. */ }
  }

  function updatePaintingToolUi(layer = mode) {
    const isGround = layer === "ground";
    const tool = isGround ? groundTool : terrainTool;
    const selector = isGround ? "[data-ground-tool]" : "[data-terrain-tool]";
    $$(selector).forEach((entry) => {
      const active = (isGround ? entry.dataset.groundTool : entry.dataset.terrainTool) === tool;
      entry.classList.toggle("selected", active);
      entry.setAttribute("aria-pressed", String(active));
    });
    if (layer === mode) editor.dataset.tool = tool;
  }

  function setPaintingTool(nextTool, layer = mode, { persist = true } = {}) {
    const allowed = layer === "ground"
      ? ["pencil", "path", "eraser", "eyedropper", "rectangle", "fill"]
      : ["pencil", "eraser", "eyedropper", "rectangle", "fill"];
    if (!allowed.includes(nextTool)) return false;
    if (layer === "ground") groundTool = nextTool; else terrainTool = nextTool;
    updatePaintingToolUi(layer);
    if (persist) persistWorkspacePreferences();
    return true;
  }

  function applyWorkspacePreferences() {
    const brushSizes = new Set([1, 3, 5, 7, 9]);
    const terrainBrush = $("#terrainBrushSize");
    const groundBrush = $("#groundBrushSize");
    const terrainSize = Number(workspacePreferences.terrainBrushSize);
    const groundSize = Number(workspacePreferences.groundBrushSize);
    if (terrainBrush && brushSizes.has(terrainSize)) terrainBrush.value = String(terrainSize);
    if (groundBrush && brushSizes.has(groundSize)) groundBrush.value = String(groundSize);
    updatePaintingToolUi("terrain");
    updatePaintingToolUi("ground");
  }

  function changeBrushSize(direction) {
    const input = $(mode === "ground" ? "#groundBrushSize" : "#terrainBrushSize");
    if (!input) return false;
    const sizes = [1, 3, 5, 7, 9];
    const current = Math.max(0, sizes.indexOf(Number(input.value)));
    const next = sizes[clamp(current + Math.sign(direction), 0, sizes.length - 1, current)];
    input.value = String(next);
    persistWorkspacePreferences();
    const hint = $("#tileEditorHint");
    if (hint && mode === "terrain") hint.textContent = `Pincel ${next} × ${next} · ${terrainType}`;
    return true;
  }

  function revertUncommittedBuilder(builder) {
    if (!builder?.size) return false;
    builder.command().before.forEach((operation) => { applyDataOperation(operation); applyBridgeOperation(operation); });
    return true;
  }

  function cancelCurrentAction(options = {}) {
    const clearSelection = options?.clearSelection !== false;
    const builders = new Set([activeTransaction, drag?.transaction, formTransaction?.builder, keyboardTransaction?.builder].filter(Boolean));
    let changed = false;
    builders.forEach((builder) => { changed = revertUncommittedBuilder(builder) || changed; });
    if (drag?.pointerId != null) {
      try { canvas.releasePointerCapture?.(drag.pointerId); } catch { /* No todos los gestos capturan el puntero. */ }
    }
    const hadGesture = Boolean(drag || activeTransaction || keyboardTransaction || formTransaction || pinchGesture || touchPointers.size);
    const hadSelection = clearSelection && Boolean(selected);
    drag = null; activeTransaction = null; keyboardTransaction = null; formTransaction = null;
    lastPaintedTile = ""; pinchGesture = null; touchPointers.clear(); spacePressed = false;
    draggedCatalogAssetId = ""; delete editor.dataset.catalogDrag;
    bridge.setTerrainPreview?.([]); bridge.setMarquee?.(null);
    if (!changed && selected && clearSelection) setSelected(null, null);
    else { renderSelection(); renderOutliner(); }
    if (hadGesture || changed) setSaveStatus(pendingBatches.length ? "pending" : "saved", "Acción cancelada.");
    return hadGesture || changed || hadSelection;
  }

  function selectAllAssets() {
    const assets = bridge.assets().filter((asset) => !temporarilyHiddenEntities.has(selectionKey("asset", asset.id)));
    multiSelection.clear();
    assets.forEach((asset) => multiSelection.add(selectionKey("asset", asset.id)));
    const last = assets.at(-1);
    selected = last ? { kind: "asset", id: last.id } : null;
    bridge.selectEntity?.("asset", last?.id || null);
    bridge.setSelections?.(assets.map((asset) => ({ kind: "asset", id: asset.id })));
    renderSelection(); renderOutliner(); sendPresence();
  }

  function focusEditorSearch() {
    const input = mode === "objects" ? $("#assetCatalogSearch") : $("#mapEditorSearchInput");
    if (!input) return;
    let ancestor = input.parentElement;
    while (ancestor) {
      if (ancestor.tagName === "DETAILS") ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    const focus = () => { input.focus(); input.select?.(); };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focus);
    else window.setTimeout(focus, 0);
  }

  function executeEditorShortcut(action) {
    if (!action) return false;
    if (action.type === "mode") setMode(action.value);
    else if (action.type === "paint.tool") setPaintingTool(action.value);
    else if (action.type === "brush.size") changeBrushSize(action.value);
    else if (action.type === "selection.all") selectAllAssets();
    else if (action.type === "selection.clear") setSelected(null, null);
    else if (action.type === "selection.group") transformSelectedAssets("group");
    else if (action.type === "selection.center") { if (selected) bridge.focusEntity?.(selected.kind, selected.id); }
    else if (action.type === "search") focusEditorSearch();
    else if (action.type === "cancel") cancelCurrentAction();
    else return false;
    return true;
  }

  function setMode(nextMode) {
    const modes = new Set(EDITOR_MODE_ORDER);
    const scene = bridge.sceneInfo?.() || {};
    const resolvedMode = scene.kind === "interior" && !["objects", "ground", "npcs", "entrances", "events"].includes(nextMode)
      ? "objects"
      : (modes.has(nextMode) ? nextMode : "objects");
    if (resolvedMode !== mode && (drag || activeTransaction || keyboardTransaction || formTransaction)) commitTransientTransactions();
    mode = resolvedMode;
    $$('[data-editor-mode]').forEach((button) => {
      const active = button.dataset.editorMode === mode;
      button.classList.toggle("selected", active); button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    });
    $$('[data-editor-panel]').forEach((panel) => {
      const active = panel.dataset.editorPanel === mode;
      panel.classList.toggle("hidden", !active); panel.hidden = !active;
    });
    editor.dataset.mode = mode;
    const relevantOverlays = {
      objects: [], terrain: ["grid", "collisions"], ground: ["grid"], npcs: ["npcs", "routes"],
      entrances: ["entrances"], events: ["events"],
    }[mode];
    $$('[data-editor-overlay]').forEach((input) => { input.checked = relevantOverlays.includes(input.dataset.editorOverlay); });
    updateEditorOverlays();
    bridge.setEditorMode?.(mode);
    editor.dataset.tool = mode === "ground" ? groundTool : mode === "terrain" ? terrainTool : "select";
    const modeEntityKind = { objects: "asset", npcs: "npc", entrances: "entrance", events: "event" }[mode];
    const outlinerFilter = $("#mapEditorFilterInput");
    if (outlinerFilter && modeEntityKind) outlinerFilter.value = modeEntityKind;
    if (selected?.kind !== modeEntityKind) setSelected(null, null);
    else renderOutliner();
    persistWorkspacePreferences();
    sendPresence();
  }

  function snap(value) {
    const step = Math.max(1, Number(snapSelect?.value) || 1);
    return Math.round(Number(value) / step) * step;
  }

  function uniqueId(prefix) {
    return `${prefix}-${actorId.slice(-6)}-${randomIdentifier().slice(0, 8)}`.slice(0, MAP_EDITOR_RULES.lengths.id);
  }

  function entitySetOperation(kind, entity) {
    const collection = entityCollection(kind, entity.id);
    return { type: "entity.set", entity: kind, collection, id: entity.id, value: cleanEntityRecord(kind, entity) };
  }

  function entityBeforeOperation(kind, entity) {
    const collection = entityCollection(kind, entity.id);
    const stored = ["assetOverrides", "npcOverrides"].includes(collection)
      ? (hasOwn(data[collection], entity.id) ? data[collection][entity.id] : null)
      : data[collection]?.find?.((entry) => entry?.id === entity.id) || null;
    const baselineValue = cleanEntityRecord(kind, entity);
    if (stored) {
      return {
        type: "entity.set", entity: kind, collection, id: entity.id, value: clone(stored),
        rebuildRuntime: true, baselineValue,
      };
    }
    return {
      type: "entity.delete", entity: kind, collection, id: entity.id, hide: false,
      rebuildRuntime: true, baselineValue,
    };
  }

  function operationsAreEquivalent(after, before) {
    if (before?.baselineValue && after?.type === "entity.set"
      && after.entity === before.entity && after.collection === before.collection && after.id === before.id) {
      return JSON.stringify(after.value) === JSON.stringify(before.baselineValue);
    }
    return JSON.stringify(after) === JSON.stringify(before);
  }

  function beginTransaction(label) {
    return new CommandBuilder(label, { revision });
  }

  function stageTransaction(builder, after, before) {
    if (!builder || !after || !before) return false;
    const validation = validateEditorOperation(after);
    if (!validation.valid) {
      setSaveStatus("error", validation.errors[0]);
      return false;
    }
    applyDataOperation(after);
    applyBridgeOperation(after);
    builder.stage(after, before);
    return true;
  }

  function commitTransaction(builder) {
    if (!builder?.size) return false;
    const command = builder.command();
    const staged = command.after.map((after, index) => ({ after, before: command.before[command.before.length - 1 - index] }));
    const changes = staged.filter(({ after, before }) => !operationsAreEquivalent(after, before));
    staged.filter(({ after, before }) => operationsAreEquivalent(after, before)).forEach(({ before }) => {
      applyDataOperation(before); applyBridgeOperation(before);
    });
    if (!changes.length) { renderSelection(); renderOutliner(); return false; }
    command.after = changes.map((change) => change.after);
    command.before = changes.map((change) => change.before).reverse();
    command.keys = command.after.map(operationKey);
    history.push(command);
    updateHistoryButtons();
    queueBatch(command.after, { id: command.id, label: command.label, baseRevision: command.revision });
    const tileCount = command.after.filter((operation) => operation.type === "tile.set").length;
    recordActivity(tileCount ? `pintó ${tileCount} casilla${tileCount === 1 ? "" : "s"}` : command.label);
    renderOutliner();
    return true;
  }

  function commitTransientTransactions() {
    let committed = false;
    const builders = new Set([keyboardTransaction?.builder, formTransaction?.builder, drag?.transaction, activeTransaction].filter(Boolean));
    builders.forEach((builder) => { committed = commitTransaction(builder) || committed; });
    if (drag?.pointerId != null) {
      try { canvas.releasePointerCapture?.(drag.pointerId); } catch { /* El cierre puede haber liberado ya el puntero. */ }
    }
    drag = null; keyboardTransaction = null; formTransaction = null; activeTransaction = null;
    lastPaintedTile = ""; pinchGesture = null; touchPointers.clear(); spacePressed = false;
    draggedCatalogAssetId = ""; delete editor.dataset.catalogDrag;
    bridge.setTerrainPreview?.([]); bridge.setMarquee?.(null);
    if (committed) renderSelection();
    return committed;
  }

  function upsertLocalEntity(kind, next, { historyBefore = null, label = "Editar entidad" } = {}) {
    const validation = validateEditorEntity(kind, { ...next, id: next.id });
    if (!validation.valid) {
      presentEntityValidation(kind, next, kind === "entrance" ? $("#entranceValidation") : kind === "event" ? $("#eventValidation") : null);
      setSaveStatus("error", validation.errors[0]);
      return null;
    }
    const inverse = historyBefore ? entityBeforeOperation(kind, historyBefore) : null;
    const result = bridge.setEntity?.(kind, next.id, next) || next;
    const current = entityById(kind, next.id) || result;
    const operation = entitySetOperation(kind, current);
    queueOperation(operation);
    if (inverse) pushHistory(operation, inverse, label);
    setSelected(kind, next.id);
    return current;
  }

  function updateSelected(patch, label = "Editar entidad") {
    commitTransientTransactions();
    const entity = selectedEntity(); if (!entity || !selected) return;
    const before = clone(entity); const next = { ...entity, ...patch };
    upsertLocalEntity(selected.kind, next, { historyBefore: before, label });
  }

  function addAsset(sprite = prototypeSelect?.value, position = bridge.viewportCenter(), template = {}) {
    commitTransientTransactions();
    const prototype = bridge.assetCatalog()[sprite]; if (!prototype) return null;
    recentAssetSprites = [sprite, ...recentAssetSprites.filter((entry) => entry !== sprite)].slice(0, 8);
    safelyStore(persistentStorage, "pokemon-map-editor-recent-assets", JSON.stringify(recentAssetSprites));
    renderAssetCatalog();
    const scene = bridge.sceneInfo?.() || { id: "world", kind: "world" };
    const asset = {
      id: uniqueId(`editor-${sprite}`), sprite, kind: prototype.kind || "prop", placement: "editor",
      x: snap(position.x), y: snap(position.y), scale: Number(template.scale) || 1,
      rotation: Number(template.rotation) || 0, depthY: snap(position.y) - (prototype.kind === "building" ? 10 : 2),
      solid: typeof template.solid === "boolean" ? template.solid : prototype.solid !== false,
      flipX: Boolean(template.flipX), label: template.label || prototype.label || `Objeto ${sprite}`,
      scene: scene.id || "world",
    };
    const operation = { type: "entity.set", entity: "asset", collection: "addedAssets", id: asset.id, value: assetRecord(asset, true) };
    bridge.setEntity("asset", asset.id, asset); queueOperation(operation);
    pushHistory(operation, { type: "entity.delete", entity: "asset", collection: "addedAssets", id: asset.id, hide: false }, "Añadir objeto");
    setSelected("asset", asset.id); return entityById("asset", asset.id);
  }

  function addNpc(template = "dialogue", position = bridge.viewportCenter()) {
    commitTransientTransactions();
    const grid = bridge.grid(); const col = clamp(Math.floor(position.x / grid.tileSize), 0, grid.cols - 1);
    const row = clamp(Math.floor(position.y / grid.tileSize), 0, grid.rows - 1);
    const scene = bridge.sceneInfo?.() || { id: "world" };
    const npc = { id: uniqueId("npc"), col, row, scene: scene.id || "world", direction: "down", name: template === "patrol" ? "Paseante" : "Vecino", sprite: npcInputs.sprite?.value || "guide", lines: ["Hola, entrenador."] };
    if (template === "patrol") npc.patrol = { to: [col, Math.max(0, row - 4)], tilesPerSecond: .75 };
    const operation = { type: "entity.set", entity: "npc", collection: "addedNpcs", id: npc.id, value: npcRecord(npc) };
    bridge.setEntity("npc", npc.id, npc); queueOperation(operation);
    pushHistory(operation, { type: "entity.delete", entity: "npc", collection: "addedNpcs", id: npc.id, hide: false }, "Añadir NPC");
    setSelected("npc", npc.id); return npc;
  }

  function addEntrance(template = "interior", position = bridge.viewportCenter()) {
    commitTransientTransactions();
    const grid = bridge.grid(); const col = clamp(Math.floor(position.x / grid.tileSize), 0, grid.cols - 1);
    const row = clamp(Math.floor(position.y / grid.tileSize), 0, grid.rows - 1);
    const scene = bridge.sceneInfo?.() || { id: "world", kind: "world" };
    const entrance = template === "pradera-bifaz"
      ? { id: uniqueId("entrance"), col, row, scene: scene.id || "world", label: "Pabellón Bifaz", action: "transition", targetMap: "pradera-bifaz", targetX: 160, targetY: 462, targetDirection: "right", effect: "fade" }
      : template === "new-map"
        ? { id: uniqueId("entrance"), col, row, scene: scene.id || "world", label: "Salida a nuevo mapa", action: "transition", targetMap: "new-map", targetX: 64, targetY: 64, targetDirection: "down", effect: "fade" }
        : scene.kind === "interior"
          ? { id: uniqueId("entrance"), col, row, scene: scene.id, label: "Salida", action: "exit", targetMap: "", targetX: null, targetY: null, targetDirection: "down", effect: "fade" }
          : { id: uniqueId("entrance"), col, row, scene: "world", label: "Casa", action: "house", targetMap: "", targetX: null, targetY: null, targetDirection: "down", effect: "fade" };
    const operation = { type: "entity.set", entity: "entrance", collection: "entrances", id: entrance.id, value: entrance };
    bridge.setEntity("entrance", entrance.id, entrance); queueOperation(operation);
    pushHistory(operation, { type: "entity.delete", entity: "entrance", collection: "entrances", id: entrance.id, hide: false }, "Añadir entrada");
    setSelected("entrance", entrance.id); return entrance;
  }

  function perspectiveEntranceForEditor() {
    return entityById("entrance", "pradera-bifaz-gate")
      || (bridge.entities?.("entrance") || []).find((candidate) => candidate.targetMap === "pradera-bifaz");
  }

  function syncPerspectiveEntranceButton() {
    const button = $("#focusPerspectiveEntranceButton");
    if (!button) return;
    const available = Boolean(perspectiveEntranceForEditor());
    button.disabled = !available;
    button.textContent = available
      ? "⌖ Localizar Pabellón Bifaz existente"
      : "⌖ Pabellón Bifaz · abre San Pablo";
    button.title = available
      ? "Seleccionar la puerta y centrarla en el mapa"
      : "Cambia el mapa activo a San Pablo para editar esta entrada";
  }

  function focusPerspectiveEntrance() {
    const entrance = perspectiveEntranceForEditor();
    if (!entrance) {
      syncPerspectiveEntranceButton();
      return false;
    }
    setMode("entrances");
    setSelected("entrance", entrance.id);
    bridge.focusEntity?.("entrance", entrance.id);
    return true;
  }

  function addEvent(template = "thought", position = bridge.viewportCenter()) {
    commitTransientTransactions();
    const grid = bridge.grid(); const col = clamp(Math.floor(position.x / grid.tileSize), 0, grid.cols - 1);
    const row = clamp(Math.floor(position.y / grid.tileSize), 0, grid.rows - 1);
    const scene = bridge.sceneInfo?.() || { id: "world" };
    const base = { id: uniqueId("event"), col, row, scene: scene.id || "world", label: "Evento", type: template, trigger: "interact", message: "Algo llama tu atención.", once: false, enabled: true };
    if (template === "computer") Object.assign(base, { label: "PC", message: "El PC muestra información interesante." });
    if (template === "letter") Object.assign(base, { label: "Carta", message: "La carta contiene un mensaje para el entrenador." });
    if (template === "pickup") Object.assign(base, { label: "Objeto", message: "Has encontrado un objeto.", itemKind: "potions", itemName: "Poción", amount: 1, once: true });
    if (template === "heal") Object.assign(base, { label: "Punto de descanso", message: "Tu equipo recupera toda su energía." });
    if (template === "switch") Object.assign(base, { label: "Interruptor", message: "El mecanismo cambia de estado.", flag: uniqueId("mecanismo") });
    if (template === "sound") Object.assign(base, { label: "Sonido", message: "Escuchas una melodía.", jingle: "success" });
    if (template === "vibration") Object.assign(base, { message: "El suelo tiembla bajo tus pies.", duration: 440, intensity: 1 });
    if (template === "transition") Object.assign(base, { label: "Ir a nuevo mapa", message: "Cruzas hacia otra zona…", targetMap: "new-map", targetX: 64, targetY: 64, targetDirection: "down", effect: "fade" });
    const operation = { type: "entity.set", entity: "event", collection: "events", id: base.id, value: base };
    bridge.setEntity("event", base.id, base); queueOperation(operation);
    pushHistory(operation, { type: "entity.delete", entity: "event", collection: "events", id: base.id, hide: false }, "Añadir evento");
    setSelected("event", base.id); return base;
  }

  function duplicateSelected() {
    commitTransientTransactions();
    const entity = selectedEntity(); if (!entity || !selected) return;
    if (selected.kind === "asset") { addAsset(entity.sprite, { x: entity.x + 32, y: entity.y + 32 }, { ...entity, label: `${entity.label || entity.sprite} (copia)` }); return; }
    const duplicate = clone(entity); const grid = bridge.grid(); duplicate.id = uniqueId(selected.kind); duplicate.col = clamp(Number(duplicate.col) + 1, 0, grid.cols - 1); duplicate.row = clamp(Number(duplicate.row) + 1, 0, grid.rows - 1);
    if (selected.kind === "npc") {
      const operation = { type: "entity.set", entity: "npc", collection: "addedNpcs", id: duplicate.id, value: npcRecord(duplicate) };
      bridge.setEntity("npc", duplicate.id, duplicate); queueOperation(operation);
      pushHistory(operation, { type: "entity.delete", entity: "npc", collection: "addedNpcs", id: duplicate.id, hide: false }, "Duplicar NPC");
    } else {
      const collection = selected.kind === "entrance" ? "entrances" : "events";
      const operation = { type: "entity.set", entity: selected.kind, collection, id: duplicate.id, value: duplicate };
      bridge.setEntity(selected.kind, duplicate.id, duplicate); queueOperation(operation);
      pushHistory(operation, { type: "entity.delete", entity: selected.kind, collection, id: duplicate.id, hide: false }, `Duplicar ${selected.kind}`);
    }
    setSelected(selected.kind, duplicate.id);
  }

  function deleteSelected() {
    commitTransientTransactions();
    const entity = selectedEntity(); if (!entity || !selected) return;
    const { kind, id } = selected; const collection = entityCollection(kind, id);
    const baseEntrance = kind === "entrance" && (bridge.isBaseEntity?.("entrance", id)
      || !data.entrances.some((entry) => entry.id === id));
    const baseEntity = (kind === "asset" && collection === "assetOverrides")
      || (kind === "npc" && collection === "npcOverrides") || baseEntrance;
    const verb = baseEntity ? "ocultar" : "eliminar";
    if (!window.confirm(`¿Quieres ${verb} «${entity.label || entity.name || id}»?`)) return;
    let operation;
    if (baseEntrance) {
      operation = { type: "entity.set", entity: kind, collection: "entrances", id, value: { ...clone(entity), enabled: false } };
    } else operation = { type: "entity.delete", entity: kind, collection, id, hide: baseEntity };
    const inverse = entityBeforeOperation(kind, entity);
    applyBridgeOperation(operation); queueOperation(operation);
    pushHistory(operation, inverse, `${baseEntity ? "Ocultar" : "Eliminar"} ${kind}`);
    setSelected(null, null);
  }

  function assetsAtPoint(point) {
    return bridge.assets().filter((asset) => point.x >= asset.x - asset.w / 2 && point.x <= asset.x + asset.w / 2
      && point.y >= asset.y - asset.h && point.y <= asset.y)
      .sort((a, b) => Number(b.depthY ?? b.y) - Number(a.depthY ?? a.y));
  }

  function assetAtPoint(point, cycle = false) {
    const matches = assetsAtPoint(point);
    if (!cycle || matches.length < 2) return matches[0] || null;
    const currentIndex = matches.findIndex((asset) => asset.id === selected?.id);
    return matches[(currentIndex + 1 + matches.length) % matches.length] || null;
  }

  function gridEntityAtPoint(kind, point) {
    const size = bridge.grid().tileSize; const col = Math.floor(point.x / size); const row = Math.floor(point.y / size);
    return (bridge.entities?.(kind) || []).filter((entity) => entity.enabled !== false && entity.col === col && entity.row === row).at(-1) || null;
  }

  function tileAtEvent(event) {
    const point = bridge.canvasToWorld(event.clientX, event.clientY); const grid = bridge.grid();
    return {
      col: clamp(Math.floor(point.x / grid.tileSize), 0, grid.cols - 1),
      row: clamp(Math.floor(point.y / grid.tileSize), 0, grid.rows - 1),
    };
  }

  function selectedAssetHandle(point) {
    if (selected?.kind !== "asset") return null;
    const asset = selectedEntity(); if (!asset) return null;
    const top = asset.y - asset.h; const tolerance = 15 / Math.max(.35, bridge.zoom?.() || 1);
    const handles = [
      { type: "scale", x: asset.x + asset.w / 2, y: asset.y },
      { type: "rotate", x: asset.x, y: top - 28 },
    ];
    return handles.find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance) || null;
  }

  function brushCellsAt(cell) {
    const grid = bridge.grid();
    const brushInput = mode === "ground" ? $("#groundBrushSize") : $("#terrainBrushSize");
    return boundedBrushCells({ col: cell.col, row: cell.row, size: Number(brushInput?.value) || 1, cols: grid.cols, rows: grid.rows });
  }

  function expandCellsWithBrush(cells) {
    const seen = new Set();
    return cells.flatMap(brushCellsAt).filter((cell) => {
      const key = `${cell.col},${cell.row}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function stageTerrainCells(cells, builder, selectedType = mode === "ground" ? groundType : terrainType, layer = mode === "ground" ? "ground" : "terrain") {
    const startedAt = performance.now();
    const value = selectedType === "inherit" ? null : selectedType;
    const scene = bridge.sceneInfo?.() || { id: "world", kind: "world" };
    const groundScene = layer === "ground" && scene.kind === "interior" ? scene.id : "";
    const collection = layer === "ground"
      ? (groundScene ? (data.interiorGroundOverrides[groundScene] ||= {}) : data.groundOverrides)
      : data.tileOverrides;
    const operationType = layer === "ground" ? "ground.set" : "tile.set";
    cells.forEach(({ col, row }) => {
      const key = `${col},${row}`; const before = collection[key] ?? null;
      const after = layer === "ground" && value !== null ? mergeGroundPaintValue(before, value) : value;
      if (before === after) return;
      const address = groundScene ? { scene: groundScene } : {};
      stageTransaction(builder, { type: operationType, key, value: after, ...address }, { type: operationType, key, value: before, ...address });
    });
    const elapsed = performance.now() - startedAt;
    const previous = Number(document.documentElement.dataset.editorMaxTerrainStageMs) || 0;
    document.documentElement.dataset.editorLastTerrainStageMs = elapsed.toFixed(2);
    document.documentElement.dataset.editorMaxTerrainStageMs = Math.max(previous, elapsed).toFixed(2);
  }

  function selectedGroundPaintType(type = groundType, tool = groundTool) {
    if (type === "inherit") return type;
    const surface = groundPathSurface(type) || type;
    return tool === "path" ? (groundPathType(surface) || surface) : surface;
  }

  function paintAtEvent(event, builder = activeTransaction, fromCell = null, toolOverride = null) {
    const center = tileAtEvent(event);
    const isGround = mode === "ground";
    const selectedTool = toolOverride || (isGround ? groundTool : terrainTool);
    const selectedType = isGround ? selectedGroundPaintType(groundType, selectedTool) : terrainType;
    const brushSize = Math.max(1, Number($(isGround ? "#groundBrushSize" : "#terrainBrushSize")?.value) || 1);
    const centerCol = center.col; const centerRow = center.row;
    const strokeKey = `${mode}:${selectedTool}:${centerCol},${centerRow}:${selectedType}:${brushSize}`; if (strokeKey === lastPaintedTile) return center;
    lastPaintedTile = strokeKey;
    const baseCells = fromCell ? lineCells(fromCell, center, bridge.grid()) : [center];
    stageTerrainCells(expandCellsWithBrush(baseCells), builder, selectedTool === "eraser" ? "inherit" : selectedType, isGround ? "ground" : "terrain");
    return center;
  }

  function previewTerrainCells(cells, toolOverride = null) {
    const isGround = mode === "ground";
    const selectedTool = toolOverride || (isGround ? groundTool : terrainTool);
    const selectedType = isGround ? selectedGroundPaintType(groundType, selectedTool) : terrainType;
    bridge.setTerrainPreview?.(cells.map((cell) => ({ ...cell, type: selectedTool === "eraser" ? "inherit" : selectedType, layer: isGround ? "ground" : "terrain", tool: selectedTool })));
  }

  function startPinchGesture(entries = [...touchPointers.entries()]) {
    const pair = entries.slice(0, 2);
    if (pair.length < 2) { pinchGesture = null; return false; }
    const points = pair.map(([, point]) => point);
    pinchGesture = {
      pointerIds: pair.map(([pointerId]) => pointerId),
      distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
      midpoint: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
      zoom: bridge.zoom?.() || 1,
    };
    return true;
  }

  function onPointerDown(event) {
    if (!enabled || !bridge.isOpen()) return;
    if (formTransaction) { commitTransaction(formTransaction.builder); formTransaction = null; }
    if (keyboardTransaction) { commitTransaction(keyboardTransaction.builder); keyboardTransaction = null; }
    if (event.pointerType === "touch") {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size >= 2) {
        const touchEntries = [...touchPointers.entries()];
        if (!pinchGesture) {
          if (drag || activeTransaction) cancelCurrentAction({ clearSelection: false });
          touchEntries.forEach(([pointerId, point]) => {
            touchPointers.set(pointerId, point);
            try { canvas.setPointerCapture?.(pointerId); } catch { /* El navegador puede haber liberado ya un toque. */ }
          });
          startPinchGesture(touchEntries);
        }
        event.preventDefault();
        return;
      }
    }
    const point = bridge.canvasToWorld(event.clientX, event.clientY);
    if (event.button === 1 || (event.button === 0 && spacePressed)) {
      event.preventDefault();
      drag = { type: "pan", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
      return;
    } else if (event.button !== 0 && !(event.button === 2 && (mode === "terrain" || mode === "ground"))) return;
    if (mode === "terrain" || mode === "ground") {
      event.preventDefault();
      const start = tileAtEvent(event);
      const isGround = mode === "ground";
      const selectedTool = event.button === 2 ? "eraser" : (isGround ? groundTool : terrainTool);
      if (selectedTool === "eyedropper") {
        if (isGround) {
          const sampledType = bridge.groundType(start.col, start.row) || "inherit";
          groundType = groundPathSurface(sampledType) || sampledType;
          setPaintingTool(isGroundPathType(sampledType) ? "path" : "pencil", "ground");
          $$('[data-ground-type]').forEach((entry) => entry.classList.toggle("selected", entry.dataset.groundType === groundType));
        } else {
          terrainType = bridge.tileType(start.col, start.row) || "inherit";
          $$('[data-tile-type]').forEach((entry) => entry.classList.toggle("selected", entry.dataset.tileType === terrainType));
          setPaintingTool("pencil", "terrain");
        }
        return;
      }
      const layerLabel = isGround ? "suelo" : "terreno";
      activeTransaction = beginTransaction(selectedTool === "fill" ? `Rellenar ${layerLabel}` : selectedTool === "rectangle" ? `Rectángulo de ${layerLabel}` : `Pintar ${layerLabel}`);
      if (selectedTool === "fill") {
        const cells = floodFillCells({ start, bounds: bridge.grid(), getValue: (col, row) => isGround ? bridge.groundType(col, row) : bridge.tileType(col, row) });
        stageTerrainCells(cells, activeTransaction, isGround ? groundType : terrainType, isGround ? "ground" : "terrain");
        commitTransaction(activeTransaction); activeTransaction = null; bridge.setTerrainPreview?.([]); return;
      }
      lastPaintedTile = "";
      if (selectedTool === "rectangle" || event.shiftKey) drag = { type: "terrain-shape", layer: isGround ? "ground" : "terrain", shape: selectedTool === "rectangle" ? "rectangle" : "line", tool: selectedTool, pointerId: event.pointerId, start, current: start, transaction: activeTransaction };
      else { drag = { type: "terrain", layer: isGround ? "ground" : "terrain", tool: selectedTool, pointerId: event.pointerId, lastCell: start, transaction: activeTransaction }; paintAtEvent(event, activeTransaction, null, selectedTool); }
    } else if (mode === "objects") {
      if (drag?.type === "pan") { /* Space/middle pan has priority. */ }
      else {
        const handle = selectedAssetHandle(point);
        if (handle) {
          const asset = selectedEntity(); const center = { x: asset.x, y: asset.y - asset.h / 2 };
          event.preventDefault();
          drag = {
            type: "entity-transform", transform: handle.type, kind: "asset", pointerId: event.pointerId,
            before: clone(asset), beforeOperation: entityBeforeOperation("asset", asset), transaction: beginTransaction(handle.type === "scale" ? "Escalar objeto" : "Rotar objeto"),
            center, startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y)), startAngle: Math.atan2(point.y - center.y, point.x - center.x),
          };
          canvas.setPointerCapture?.(event.pointerId); return;
        }
        event.preventDefault(); const asset = assetAtPoint(point, event.altKey); setSelected(asset ? "asset" : null, asset?.id || null, { add: Boolean(event.shiftKey && asset) });
        if (!asset && event.shiftKey) {
          drag = { type: "marquee", pointerId: event.pointerId, start: point, current: point };
          bridge.setMarquee?.({ start: point, end: point });
          canvas.setPointerCapture?.(event.pointerId); return;
        }
        const groupId = asset ? groupedAssets.get(selectionKey("asset", asset.id)) : null;
        const groupBefore = groupId ? bridge.assets().filter((candidate) => groupedAssets.get(selectionKey("asset", candidate.id)) === groupId).map(clone) : null;
        drag = asset ? {
          type: "entity", kind: "asset", pointerId: event.pointerId, offsetX: point.x - asset.x, offsetY: point.y - asset.y,
          before: clone(asset), beforeOperation: entityBeforeOperation("asset", asset), groupBefore, transaction: beginTransaction(groupBefore?.length > 1 ? "Mover grupo" : "Mover objeto"),
        } : null;
        if (asset && (lockedEntities.has(selectionKey("asset", asset.id)) || remoteLockOwner("asset", asset.id))) {
          const owner = remoteLockOwner("asset", asset.id);
          drag = null;
          setSaveStatus(pendingBatches.length ? "pending" : "saved", owner ? `${owner.name || "Otro editor"} está editando este objeto.` : "El objeto está bloqueado localmente.");
        }
      }
    } else {
      const kind = { npcs: "npc", entrances: "entrance", events: "event" }[mode];
      const entity = gridEntityAtPoint(kind, point); setSelected(entity ? kind : null, entity?.id || null);
      if (entity) {
        const owner = remoteLockOwner(kind, entity.id);
        if (lockedEntities.has(selectionKey(kind, entity.id)) || owner) {
          setSaveStatus(pendingBatches.length ? "pending" : "saved", owner ? `${owner.name || "Otro editor"} está editando esta entidad.` : "La entidad está bloqueada localmente.");
          return;
        }
        event.preventDefault(); drag = {
          type: "entity", kind, pointerId: event.pointerId, before: clone(entity),
          beforeOperation: entityBeforeOperation(kind, entity), transaction: beginTransaction(`Mover ${kind}`),
        };
      }
    }
    if (drag) canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchGesture && touchPointers.size >= 2) {
        if (!pinchGesture.pointerIds.includes(event.pointerId)) { event.preventDefault(); return; }
        const points = pinchGesture.pointerIds.map((pointerId) => touchPointers.get(pointerId));
        if (points.some((point) => !point)) { startPinchGesture(); event.preventDefault(); return; }
        const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
        const midpoint = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
        bridge.panBy?.(pinchGesture.midpoint.x - midpoint.x, pinchGesture.midpoint.y - midpoint.y);
        pinchGesture.midpoint = midpoint;
        const anchor = bridge.canvasToWorld(midpoint.x, midpoint.y);
        setEditorZoom(pinchGesture.zoom * distance / Math.max(1, pinchGesture.distance), anchor);
        event.preventDefault();
        return;
      }
    }
    if (enabled && bridge.isOpen()) {
      const cursor = bridge.canvasToWorld(event.clientX, event.clientY);
      sendPresence({ x: Math.round(cursor.x), y: Math.round(cursor.y) });
    }
    if (!drag || drag.pointerId !== event.pointerId || !bridge.isOpen()) {
      if (!drag && (mode === "terrain" || mode === "ground")) previewTerrainCells(brushCellsAt(tileAtEvent(event)));
      return;
    }
    event.preventDefault();
    if (drag.type === "pan") {
      bridge.panBy?.(drag.clientX - event.clientX, drag.clientY - event.clientY);
      drag.clientX = event.clientX; drag.clientY = event.clientY; return;
    }
    if (drag.type === "terrain") { drag.lastCell = paintAtEvent(event, drag.transaction, drag.lastCell, drag.tool) || drag.lastCell; return; }
    if (drag.type === "terrain-shape") {
      drag.current = tileAtEvent(event);
      const baseCells = drag.shape === "rectangle" ? rectangleCells(drag.start, drag.current, bridge.grid()) : lineCells(drag.start, drag.current, bridge.grid());
      previewTerrainCells(expandCellsWithBrush(baseCells), drag.tool); return;
    }
    if (drag.type === "marquee") {
      drag.current = bridge.canvasToWorld(event.clientX, event.clientY);
      bridge.setMarquee?.({ start: drag.start, end: drag.current }); return;
    }
    const entity = selectedEntity(); if (!entity) return;
    const point = bridge.canvasToWorld(event.clientX, event.clientY);
    if (drag.type === "entity-transform") {
      const next = drag.transform === "scale"
        ? { ...entity, scale: clamp((Number(drag.before.scale) || 1) * Math.hypot(point.x - drag.center.x, point.y - drag.center.y) / drag.startDistance, ...MAP_EDITOR_RULES.ranges.scale) }
        : { ...entity, rotation: clamp((Number(drag.before.rotation) || 0) + (Math.atan2(point.y - drag.center.y, point.x - drag.center.x) - drag.startAngle) * 180 / Math.PI, ...MAP_EDITOR_RULES.ranges.rotation) };
      stageTransaction(drag.transaction, entitySetOperation("asset", next), drag.beforeOperation);
      renderSelection();
      return;
    }
    let next;
    if (drag.kind === "asset") {
      next = { ...entity, x: snap(point.x - drag.offsetX), y: snap(point.y - drag.offsetY) };
      if (drag.groupBefore?.length > 1) {
        const deltaX = next.x - drag.before.x; const deltaY = next.y - drag.before.y;
        drag.groupBefore.forEach((asset) => {
          const moved = { ...asset, x: snap(asset.x + deltaX), y: snap(asset.y + deltaY) };
          stageTransaction(drag.transaction, entitySetOperation("asset", moved), entityBeforeOperation("asset", asset));
        });
        setSelected(drag.kind, next.id);
        return;
      }
    } else {
      const grid = bridge.grid();
      next = { ...entity, col: clamp(Math.floor(point.x / grid.tileSize), 0, grid.cols - 1), row: clamp(Math.floor(point.y / grid.tileSize), 0, grid.rows - 1) };
    }
    stageTransaction(drag.transaction, entitySetOperation(drag.kind, next), drag.beforeOperation);
    setSelected(drag.kind, next.id);
  }

  function endPointer(event) {
    if (event.pointerType === "touch") {
      const changedPair = pinchGesture?.pointerIds?.includes(event.pointerId);
      touchPointers.delete(event.pointerId);
      if (touchPointers.size < 2) pinchGesture = null;
      else if (changedPair) startPinchGesture();
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag; drag = null; lastPaintedTile = ""; canvas.releasePointerCapture?.(event.pointerId);
    if (finished.type === "terrain-shape") {
      const baseCells = finished.shape === "rectangle" ? rectangleCells(finished.start, finished.current, bridge.grid()) : lineCells(finished.start, finished.current, bridge.grid());
      const selectedType = finished.layer === "ground" ? selectedGroundPaintType(groundType, finished.tool) : terrainType;
      stageTerrainCells(expandCellsWithBrush(baseCells), finished.transaction, finished.tool === "eraser" ? "inherit" : selectedType, finished.layer);
      bridge.setTerrainPreview?.([]);
    }
    if (finished.type === "marquee") {
      const left = Math.min(finished.start.x, finished.current.x); const right = Math.max(finished.start.x, finished.current.x);
      const top = Math.min(finished.start.y, finished.current.y); const bottom = Math.max(finished.start.y, finished.current.y);
      multiSelection.clear();
      bridge.assets().filter((asset) => asset.x >= left && asset.x <= right && asset.y >= top && asset.y <= bottom)
        .forEach((asset) => multiSelection.add(selectionKey("asset", asset.id)));
      const lastKey = [...multiSelection].at(-1); const id = lastKey?.slice(lastKey.indexOf(":") + 1);
      selected = id ? { kind: "asset", id } : null;
      bridge.selectEntity?.("asset", id || null); bridge.setSelections?.([...multiSelection].map((key) => ({ kind: "asset", id: key.slice(6) }))); bridge.setMarquee?.(null);
      renderSelection(); renderOutliner(); return;
    }
    if (["terrain", "terrain-shape", "entity", "entity-transform"].includes(finished.type)) commitTransaction(finished.transaction);
    activeTransaction = null;
  }

  function applyHistoryOperations(operations, label) {
    operations.forEach((operation) => { applyDataOperation(operation); applyBridgeOperation(operation); });
    queueBatch(operations, { label, baseRevision: revision });
    renderSelection(); renderOutliner();
  }

  function undo() {
    commitTransientTransactions();
    const candidate = history.peekUndo();
    const result = history.undo({ changedKeys: changedKeysSince(remoteKeyRevisions, candidate?.revision) });
    if (!result.command) return;
    if (result.conflicts.length) {
      conflictState = {
        type: "undo",
        conflicts: result.conflicts,
        batch: { id: `undo-${randomIdentifier()}`, transactionId: `undo-${randomIdentifier()}`, label: `Deshacer: ${result.command.label}`, baseRevision: revision, operations: result.command.before },
        current: Object.fromEntries(result.conflicts.map((key) => [key, "Cambió remotamente después de tu acción"])),
      };
      setSaveStatus("conflict", "Deshacer se detuvo porque otra persona modificó la misma entidad.");
      renderConflict(); return;
    }
    applyHistoryOperations(result.command.before, `Deshacer: ${result.command.label}`);
    updateHistoryButtons(); recordActivity(`deshacer: ${result.command.label}`);
  }

  function redo() {
    commitTransientTransactions();
    const command = history.redo(); if (!command) return;
    applyHistoryOperations(command.after, `Rehacer: ${command.label}`);
    updateHistoryButtons(); recordActivity(`rehacer: ${command.label}`);
  }

  function renderConflict() {
    const panel = $("#mapEditorConflictPanel");
    if (!panel) return;
    panel.hidden = !conflictState;
    panel.classList.toggle("hidden", !conflictState);
    if (!conflictState) return;
    const local = $("#mapEditorConflictLocal"); const server = $("#mapEditorConflictServer");
    if (local) local.textContent = JSON.stringify(conflictState.batch?.operations || [], null, 2);
    if (server) server.textContent = JSON.stringify(conflictState.current || conflictState.snapshot?.data || {}, null, 2);
  }

  async function resolveConflict(action) {
    if (!conflictState) return;
    const currentConflict = conflictState;
    if (action === "cancel") {
      setSaveStatus("conflict", "Conflicto pendiente; tu copia sigue protegida localmente.");
      return;
    }
    if (currentConflict.type === "undo") {
      history.undo({ changedKeys: new Set() });
      if (action === "reapply") {
        remoteChangedKeys.clear();
        remoteKeyRevisions.clear();
        applyHistoryOperations(currentConflict.batch.operations, currentConflict.batch.label);
      }
      conflictState = null; renderConflict(); updateHistoryButtons();
      return;
    }
    applySnapshot(currentConflict.snapshot, { preservePending: false });
    const retryId = `retry-${randomIdentifier()}`.slice(0, MAP_EDITOR_RULES.lengths.id);
    pendingBatches = resolveConflictQueue(pendingBatches, currentConflict.batch, {
      action,
      revision,
      retryId,
    });
    if (action === "reapply") {
      pendingBatches.filter((batch) => batch.groupId === retryId).flatMap((batch) => batch.operations)
        .forEach((operation) => { applyDataOperation(operation); applyBridgeOperation(operation); });
    }
    conflictState = null; renderConflict(); renderSelection(); renderOutliner(); await persistPendingBatches();
    if (pendingBatches.length) { setSaveStatus("pending", "Cambio preparado para reaplicar."); void flushOperations(); }
    else setSaveStatus("saved", "Se conservó la versión del servidor.");
  }

  function populatePrototypes() {
    if (!prototypeSelect) return;
    const labels = { building: "Edificios", tree: "Árboles", prop: "Mobiliario urbano", furniture: "Muebles de interior", blocker: "Obstáculos" };
    const groups = new Map();
    Object.entries(bridge.assetCatalog()).forEach(([id, prototype]) => {
      const kind = prototype.kind || "prop"; if (!groups.has(kind)) groups.set(kind, []); groups.get(kind).push([id, prototype]);
    });
    prototypeSelect.replaceChildren(...[...groups].map(([kind, entries]) => {
      const group = document.createElement("optgroup"); group.label = labels[kind] || kind;
      entries.forEach(([id, prototype]) => { const option = document.createElement("option"); option.value = id; option.textContent = `${prototype.label || id} · ${prototype.w}×${prototype.h}`; group.appendChild(option); });
      return group;
    }));
    renderAssetCatalog();
  }

  function renderAssetCatalog() {
    const grid = $("#assetCatalogGrid"); if (!grid) return;
    const query = String($("#assetCatalogSearch")?.value || "").trim().toLowerCase();
    const category = $("#assetCatalogCategory")?.value || "all";
    const entries = Object.entries(bridge.assetCatalog()).filter(([id, prototype]) => {
      if (favoritesOnly && !favoriteAssetSprites.has(id)) return false;
      if (category !== "all" && (prototype.kind || "prop") !== category) return false;
      return !query || `${id} ${prototype.label || ""} ${(prototype.tags || []).join(" ")} ${prototype.kind || "prop"}`.toLowerCase().includes(query);
    }).sort(([first], [second]) => {
      const firstRecent = recentAssetSprites.indexOf(first); const secondRecent = recentAssetSprites.indexOf(second);
      if (firstRecent >= 0 && secondRecent >= 0) return firstRecent - secondRecent;
      if (firstRecent >= 0) return -1;
      if (secondRecent >= 0) return 1;
      return first.localeCompare(second);
    });
    grid.replaceChildren(...entries.map(([id, prototype]) => {
      const item = document.createElement("div"); item.className = "map-editor-catalog-item";
      const select = document.createElement("button"); select.type = "button"; select.setAttribute("role", "option");
      select.setAttribute("aria-selected", String(prototypeSelect.value === id)); select.dataset.catalogAsset = id;
      select.draggable = true;
      select.title = "Seleccionar · doble clic para colocar · arrastrar al mapa";
      const image = document.createElement("img"); image.src = prototype.src; image.alt = ""; image.loading = "lazy";
      const name = document.createElement("span"); name.textContent = prototype.label || id;
      const size = document.createElement("small"); size.textContent = `${prototype.w}×${prototype.h}`;
      select.append(image, name, size);
      const favorite = document.createElement("button"); favorite.type = "button"; favorite.dataset.catalogFavorite = id;
      favorite.className = "map-editor-catalog-favorite"; favorite.setAttribute("aria-label", `${favoriteAssetSprites.has(id) ? "Quitar" : "Añadir"} ${prototype.label || id} ${favoriteAssetSprites.has(id) ? "de" : "a"} favoritos`);
      favorite.setAttribute("aria-pressed", String(favoriteAssetSprites.has(id))); favorite.textContent = favoriteAssetSprites.has(id) ? "★" : "☆";
      item.append(select, favorite); return item;
    }));
  }

  function populateNpcSprites() {
    const options = $("#npcSpriteOptions");
    const sprites = new Set(["guide", "nino-polo", "nina-turquesa", "campesino", "hortelano"]);
    (bridge.entities?.("npc") || []).forEach((npc) => sprites.add(npc.sprite));
    for (let index = 1; index <= 30; index += 1) {
      const current = (bridge.entities?.("npc") || []).find((npc) => String(npc.sprite).startsWith(`npc-${String(index).padStart(2, "0")}-`));
      if (current) sprites.add(current.sprite);
    }
    options?.replaceChildren(...[...sprites].filter(Boolean).sort().map((sprite) => {
      const option = document.createElement("option"); option.value = sprite; option.textContent = sprite; return option;
    }));
    const buildings = $("#mapEditorBuildingOptions");
    buildings?.replaceChildren(...bridge.assets().filter((asset) => asset.kind === "building").map((asset) => {
      const option = document.createElement("option"); option.value = asset.id; option.label = asset.label || asset.id; return option;
    }));
  }

  function bindInspectorInputs() {
    const numberValue = (input) => input.value === "" ? Number.NaN : Number(input.value);
    const bindGroupedForm = ({ fieldset, kind, label, read, inputs, output }) => {
      if (!fieldset) return;
      const ensureTransaction = () => {
        const entity = selectedEntity();
        if (!entity || selected?.kind !== kind) return null;
        if (keyboardTransaction) {
          commitTransaction(keyboardTransaction.builder);
          keyboardTransaction = null;
        }
        if (!formTransaction || formTransaction.kind !== kind || formTransaction.id !== entity.id) {
          formTransaction = { kind, id: entity.id, builder: beginTransaction(label), before: entityBeforeOperation(kind, entity) };
        }
        return formTransaction;
      };
      const update = () => {
        const transaction = ensureTransaction(); if (!transaction) return;
        const next = read(); if (!next) return;
        const result = presentEntityValidation(kind, { ...next, id: next.id }, output, inputs);
        if (!result.valid) {
          setSaveStatus("error", result.errors[0]);
          return;
        }
        if (stageTransaction(transaction.builder, entitySetOperation(kind, next), transaction.before)) {
          setSaveStatus("pending", "Cambio del formulario sin confirmar; sal del campo para protegerlo.");
        }
      };
      fieldset.addEventListener("focusin", ensureTransaction);
      fieldset.addEventListener("input", update);
      fieldset.addEventListener("change", update);
      fieldset.addEventListener("focusout", () => window.setTimeout(() => {
        if (fieldset.contains(document.activeElement) || !formTransaction || formTransaction.kind !== kind) return;
        commitTransaction(formTransaction.builder); formTransaction = null; renderSelection();
      }, 0));
    };

    const readAsset = () => {
      const asset = selectedEntity(); if (!asset || selected?.kind !== "asset") return null;
      return { ...asset, label: assetInputs.label.value, x: numberValue(assetInputs.x), y: numberValue(assetInputs.y), scale: numberValue(assetInputs.scale), depthY: numberValue(assetInputs.depthY), rotation: numberValue(assetInputs.rotation), solid: assetInputs.solid.checked };
    };
    bindGroupedForm({ fieldset: $("#assetInspector"), kind: "asset", label: "Editar objeto", read: readAsset, inputs: Object.values(assetInputs), output: $("#assetValidation") });

    const readNpc = () => {
      const npc = selectedEntity(); if (!npc || selected?.kind !== "npc") return null;
      const next = { ...npc, col: numberValue(npcInputs.col), row: numberValue(npcInputs.row), name: npcInputs.name.value, sprite: npcInputs.sprite.value, direction: npcInputs.direction.value, lines: npcInputs.lines.value.split(/\r?\n/) };
      if (npcInputs.patrol.checked) next.patrol = { to: [numberValue(npcInputs.patrolCol), numberValue(npcInputs.patrolRow)], tilesPerSecond: numberValue(npcInputs.patrolSpeed) };
      else delete next.patrol;
      return next;
    };
    Object.values(npcInputs).forEach((input) => input.addEventListener("change", () => {
      $("#npcPatrolFields").classList.toggle("hidden", !npcInputs.patrol.checked);
      updateNpcSpritePreview();
    }));
    npcInputs.sprite.addEventListener("input", () => updateNpcSpritePreview());
    bindGroupedForm({ fieldset: $("#npcInspector"), kind: "npc", label: "Editar NPC", read: readNpc, inputs: Object.values(npcInputs), output: $("#npcValidation") });

    const readEntrance = () => {
      const entrance = selectedEntity(); if (!entrance || selected?.kind !== "entrance") return null;
      return { ...entrance, col: numberValue(entranceInputs.col), row: numberValue(entranceInputs.row), label: entranceInputs.label.value, action: entranceInputs.action.value, targetMap: entranceInputs.targetMap.value, targetX: entranceInputs.targetX.value === "" ? null : numberValue(entranceInputs.targetX), targetY: entranceInputs.targetY.value === "" ? null : numberValue(entranceInputs.targetY), targetDirection: entranceInputs.targetDirection.value, effect: entranceInputs.effect.value, linkedAssetId: entranceInputs.linkedAssetId.value || null, enabled: true };
    };
    bindGroupedForm({ fieldset: $("#entranceInspector"), kind: "entrance", label: "Editar entrada", read: readEntrance, inputs: Object.values(entranceInputs), output: $("#entranceValidation") });

    const readEvent = () => {
      const event = selectedEntity(); if (!event || selected?.kind !== "event") return null;
      return {
        ...event,
        col: numberValue(eventInputs.col), row: numberValue(eventInputs.row), label: eventInputs.label.value,
        type: eventInputs.type.value, trigger: eventInputs.trigger.value, message: eventInputs.message.value,
        targetMap: eventInputs.targetMap.value || null,
        targetX: eventInputs.targetX.value === "" ? null : numberValue(eventInputs.targetX),
        targetY: eventInputs.targetY.value === "" ? null : numberValue(eventInputs.targetY),
        targetDirection: eventInputs.targetDirection.value, effect: eventInputs.effect.value,
        duration: numberValue(eventInputs.duration), intensity: numberValue(eventInputs.intensity),
        itemKind: eventInputs.itemKind.value, itemName: eventInputs.itemName.value,
        amount: numberValue(eventInputs.amount), flag: eventInputs.flag.value || null,
        requiresFlag: eventInputs.requiresFlag.value || null, requiredFlagValue: eventInputs.requiredFlagValue.value !== "false",
        jingle: eventInputs.jingle.value, once: eventInputs.once.checked, enabled: eventInputs.enabled.checked,
      };
    };
    Object.values(eventInputs).forEach((input) => input.addEventListener("change", () => {
      updateEventFieldVisibility(eventInputs.type.value);
    }));
    bindGroupedForm({ fieldset: $("#eventInspector"), kind: "event", label: "Editar evento", read: readEvent, inputs: Object.values(eventInputs), output: $("#eventValidation") });
  }

  function selectedAssets() {
    return [...multiSelection].filter((key) => key.startsWith("asset:")).map((key) => entityById("asset", key.slice(6))).filter(Boolean);
  }

  function transformSelectedAssets(action) {
    commitTransientTransactions();
    const assets = selectedAssets();
    if (action === "lock") {
      assets.forEach((asset) => lockedEntities.add(selectionKey("asset", asset.id))); renderOutliner(); return;
    }
    if (action === "group") {
      if (assets.length < 2) return;
      const existing = groupedAssets.get(selectionKey("asset", assets[0].id));
      const sameGroup = existing && assets.every((asset) => groupedAssets.get(selectionKey("asset", asset.id)) === existing);
      const groupId = existing || uniqueId("group");
      assets.forEach((asset) => {
        const key = selectionKey("asset", asset.id);
        if (sameGroup) groupedAssets.delete(key); else groupedAssets.set(key, groupId);
      });
      setSaveStatus(pendingBatches.length ? "pending" : "saved", sameGroup ? "Grupo disuelto." : `${assets.length} objetos agrupados localmente.`);
      renderOutliner(); return;
    }
    if (assets.length < 2) return;
    const builder = beginTransaction("Transformar selección");
    const sorted = [...assets].sort((a, b) => a.x - b.x);
    assets.forEach((asset, index) => {
      let patch = {};
      if (action === "align-x") patch = { x: assets[0].x };
      if (action === "align-y") patch = { y: assets[0].y };
      if (action === "distribute" && sorted.length > 2) {
        const step = (sorted.at(-1).x - sorted[0].x) / (sorted.length - 1);
        const order = sorted.findIndex((entry) => entry.id === asset.id);
        patch = { x: sorted[0].x + step * order };
      }
      if (!Object.keys(patch).length) return;
      stageTransaction(builder, entitySetOperation("asset", { ...asset, ...patch }), entityBeforeOperation("asset", asset));
    });
    commitTransaction(builder); renderSelection();
  }

  function copySelection() {
    copiedAssets = selectedAssets().map(clone);
    if (!copiedAssets.length && selected?.kind === "asset" && selectedEntity()) copiedAssets = [clone(selectedEntity())];
    if (copiedAssets.length) setSaveStatus(pendingBatches.length ? "pending" : "saved", `${copiedAssets.length} objeto${copiedAssets.length === 1 ? "" : "s"} copiado${copiedAssets.length === 1 ? "" : "s"}.`);
  }

  function pasteSelection() {
    commitTransientTransactions();
    if (!copiedAssets.length) return;
    const builder = beginTransaction("Pegar objetos"); multiSelection.clear();
    copiedAssets.forEach((source, index) => {
      const grid = bridge.grid();
      const asset = { ...clone(source), id: uniqueId(`editor-${source.sprite || "asset"}`), x: clamp(Number(source.x) + 32 + index * 8, 0, grid.cols * grid.tileSize), y: clamp(Number(source.y) + 32 + index * 8, 0, grid.rows * grid.tileSize), label: `${source.label || source.sprite || "Objeto"} (copia)`, placement: "editor" };
      const after = { type: "entity.set", entity: "asset", collection: "addedAssets", id: asset.id, value: assetRecord(asset, true) };
      const before = { type: "entity.delete", entity: "asset", collection: "addedAssets", id: asset.id, hide: false };
      stageTransaction(builder, after, before); multiSelection.add(selectionKey("asset", asset.id)); selected = { kind: "asset", id: asset.id };
    });
    commitTransaction(builder); bridge.setSelections?.([...multiSelection].map((key) => ({ kind: "asset", id: key.slice(6) }))); renderSelection();
  }

  function applyInputRules() {
    const setRange = (input, range) => { if (!input) return; input.min = String(range[0]); input.max = String(range[1]); };
    const grid = bridge.grid();
    [assetInputs.x, assetInputs.y].forEach((input, index) => setRange(input, [0, (index ? grid.rows : grid.cols) * grid.tileSize]));
    setRange(assetInputs.scale, MAP_EDITOR_RULES.ranges.scale); setRange(assetInputs.rotation, MAP_EDITOR_RULES.ranges.rotation); setRange(assetInputs.depthY, MAP_EDITOR_RULES.ranges.depthY);
    [npcInputs.col, npcInputs.patrolCol, entranceInputs.col, eventInputs.col, $("#mapEditorJumpCol")].forEach((input) => setRange(input, [0, grid.cols - 1]));
    [npcInputs.row, npcInputs.patrolRow, entranceInputs.row, eventInputs.row, $("#mapEditorJumpRow")].forEach((input) => setRange(input, [0, grid.rows - 1]));
    setRange(npcInputs.patrolSpeed, MAP_EDITOR_RULES.ranges.patrolSpeed);
    [entranceInputs.targetX, entranceInputs.targetY, eventInputs.targetX, eventInputs.targetY].forEach((input) => setRange(input, MAP_EDITOR_RULES.ranges.targetCoordinate));
    setRange(eventInputs.duration, MAP_EDITOR_RULES.ranges.duration); setRange(eventInputs.intensity, MAP_EDITOR_RULES.ranges.intensity);
    setRange(eventInputs.amount, MAP_EDITOR_RULES.ranges.itemAmount);
    eventInputs.message.maxLength = MAP_EDITOR_RULES.lengths.eventMessage; npcInputs.lines.maxLength = MAP_EDITOR_RULES.lengths.npcLines * (MAP_EDITOR_RULES.lengths.npcLine + 1);
  }

  function updateMapSizeUi() {
    const size = data.mapSize || { cols: MAP_EDITOR_RULES.world.cols, rows: MAP_EDITOR_RULES.world.rows };
    const output = $("#mapEditorSizeInfo");
    const width = size.cols === MAP_EDITOR_RULES.world.cols ? MAP_EDITOR_RULES.world.width : size.cols * MAP_EDITOR_RULES.world.tileSize;
    const height = size.rows === MAP_EDITOR_RULES.world.rows ? MAP_EDITOR_RULES.world.height : size.rows * MAP_EDITOR_RULES.world.tileSize;
    if (output) output.textContent = `Tamaño actual: ${size.cols} × ${size.rows} casillas (${width} × ${height} px)`;
    const colsInput = $("#mapExpandCols"); const rowsInput = $("#mapExpandRows");
    if (colsInput) colsInput.max = String(Math.min(64, MAP_EDITOR_RULES.world.maxCols - size.cols));
    if (rowsInput) rowsInput.max = String(Math.min(64, MAP_EDITOR_RULES.world.maxRows - size.rows));
    const button = $("#expandMapButton");
    if (button) button.disabled = size.cols >= MAP_EDITOR_RULES.world.maxCols && size.rows >= MAP_EDITOR_RULES.world.maxRows;
  }

  function expandMap() {
    commitTransientTransactions();
    const current = data.mapSize || { cols: MAP_EDITOR_RULES.world.cols, rows: MAP_EDITOR_RULES.world.rows };
    const addCols = Math.max(0, Math.floor(Number($("#mapExpandCols")?.value) || 0));
    const addRows = Math.max(0, Math.floor(Number($("#mapExpandRows")?.value) || 0));
    const next = {
      cols: Math.min(MAP_EDITOR_RULES.world.maxCols, current.cols + addCols),
      rows: Math.min(MAP_EDITOR_RULES.world.maxRows, current.rows + addRows),
    };
    if (next.cols === current.cols && next.rows === current.rows) {
      setSaveStatus("error", "Indica cuántas filas o columnas quieres añadir.");
      return;
    }
    queueOperation({ type: "map.resize", value: next }, { applyBridge: true, label: "Expandir mapa" });
    setSaveStatus("pending", `Mapa ampliado a ${next.cols} × ${next.rows} casillas.`);
  }

  function resetGroundOverrides() {
    commitTransientTransactions();
    const scene = bridge.sceneInfo?.() || { id: "world", kind: "world" };
    const groundScene = scene.kind === "interior" ? scene.id : "";
    const collection = groundScene ? (data.interiorGroundOverrides[groundScene] || {}) : data.groundOverrides;
    const entries = Object.keys(collection);
    if (!entries.length) return;
    const builder = beginTransaction("Borrar suelo pintado");
    entries.forEach((key) => {
      const address = groundScene ? { scene: groundScene } : {};
      stageTransaction(builder, { type: "ground.set", key, value: null, ...address }, { type: "ground.set", key, value: collection[key], ...address });
    });
    commitTransaction(builder);
  }

  function updateZoomLabel() {
    const output = $("#mapEditorZoomLevel"); if (output) output.textContent = `${Math.round((bridge.zoom?.() || 1) * 100)}%`;
  }

  function setEditorZoom(value, anchor = null) {
    bridge.setZoom?.(clamp(value, .35, 3), anchor); updateZoomLabel();
  }

  function updateEditorOverlays() {
    const overlays = Object.fromEntries($$('[data-editor-overlay]').map((input) => [input.dataset.editorOverlay, input.checked]));
    bridge.setEditorOverlays?.(overlays);
  }

  function setEditorPanelCollapsed(collapsed) {
    const shouldCollapse = Boolean(collapsed);
    editor.classList.toggle("collapsed", shouldCollapse);
    if (shouldCollapse) editor.classList.remove("fullscreen-inspector");
    const toggle = $("#mapEditorSheetToggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(!shouldCollapse));
      toggle.setAttribute("aria-label", shouldCollapse ? "Mostrar menú lateral" : "Ocultar menú lateral");
      toggle.title = shouldCollapse ? "Mostrar menú lateral" : "Ocultar menú lateral y editar detrás";
      toggle.textContent = shouldCollapse ? "☰" : "›";
    }
    if (shouldCollapse) $("#mapEditorExpandSheetButton")?.setAttribute("aria-pressed", "false");
  }

  function prepareOpenEditor() {
    const scene = bridge.sceneInfo?.() || { id: "world", kind: "world", label: "San Pablo" };
    const interior = scene.kind === "interior";
    if (selected && !entityById(selected.kind, selected.id)) setSelected(null, null);
    const categorySelect = $("#assetCatalogCategory");
    if (categorySelect) {
      if (interior) categorySelect.value = "furniture";
      else if (categorySelect.value === "furniture") categorySelect.value = "all";
    }
    const eyebrow = $("#mapEditorEyebrow");
    const title = $("#mapEditorTitle");
    if (eyebrow) eyebrow.textContent = interior ? "MODO DIOS · INTERIOR" : "MODO DIOS · SOLO DESARROLLO";
    if (title) title.textContent = interior ? `Decorar ${scene.label || "casa"}` : "Editor del mundo";
    $$('[data-editor-mode]').forEach((button) => {
      const unavailable = interior && !["objects", "ground", "npcs", "entrances", "events"].includes(button.dataset.editorMode);
      button.disabled = unavailable;
      button.setAttribute("aria-disabled", String(unavailable));
    });
    if (interior && !["objects", "ground", "npcs", "entrances", "events"].includes(mode)) setMode("objects");
    $$('[data-ground-scope="world"]').forEach((element) => element.classList.toggle("hidden", interior));
    $$('[data-ground-scope="interior"]').forEach((element) => element.classList.toggle("hidden", !interior));
    if (interior && groundTool === "path") setPaintingTool("pencil", "ground", { persist: false });
    if (interior && !groundType.startsWith("interior-")) groundType = "interior-oak-honey";
    if (!interior && groundType.startsWith("interior-")) groundType = "grass";
    $$('[data-ground-type]').forEach((element) => element.classList.toggle("selected", element.dataset.groundType === groundType));
    const expansion = $("#groundEditorPanel .map-editor-expansion");
    if (expansion) expansion.classList.toggle("hidden", interior);
    populatePrototypes();
    populateNpcSprites();
    renderSelection();
    renderOutliner();
    setEditorPanelCollapsed(false);
    editor.classList.remove("fullscreen-inspector");
    $("#mapEditorExpandSheetButton")?.setAttribute("aria-pressed", "false");
    window.setTimeout(() => $("[data-editor-mode][aria-selected='true']")?.focus(), 0);
    updateZoomLabel();
  }

  function bindUi() {
    if (bound) return; bound = true;
    applyInputRules();
    const mapSelect = $("#mapEditorMapSelect");
    if (mapSelect) {
      mapSelect.value = activeMapId;
      mapSelect.addEventListener("change", () => {
        const targetMapId = mapSelect.value;
        if (!targetMapId || targetMapId === activeMapId) return;
        if (pendingBatches.length && !window.confirm("Hay cambios pendientes. ¿Cambiar de mapa después de intentar sincronizarlos?")) {
          mapSelect.value = activeMapId;
          return;
        }
        if (pendingBatches.length) void flushOperations({ keepalive: true });
        const url = new URL(window.location.href);
        url.searchParams.set("map", targetMapId);
        window.location.assign(url.href);
      });
    }
    nameInput.value = editorName;
    nameInput.addEventListener("change", () => {
      editorName = nameInput.value.trim().slice(0, MAP_EDITOR_RULES.lengths.actorName) || `Editor ${actorId.slice(-4).toUpperCase()}`;
      nameInput.value = editorName; safelyStore(persistentStorage, "pokemon-map-editor-name", editorName); sendPresence();
    });
    document.addEventListener("map-editor-player-presence-change", () => sendPresence(presenceCursor));
    $("#copyEditorInviteButton").addEventListener("click", async () => {
      const value = inviteUrl || window.location.href;
      try { await navigator.clipboard.writeText(value); setConnection("online", "Enlace copiado"); }
      catch { window.prompt("Copia este enlace de colaboración:", value); }
    });
    const tabs = $$('[data-editor-mode]');
    tabs.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.editorMode));
      button.addEventListener("keydown", (event) => {
        const current = tabs.indexOf(button); let target = -1;
        if (event.key === "ArrowRight") target = (current + 1) % tabs.length;
        if (event.key === "ArrowLeft") target = (current - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") target = 0;
        if (event.key === "End") target = tabs.length - 1;
        if (target < 0) return;
        event.preventDefault(); setMode(tabs[target].dataset.editorMode); tabs[target].focus();
      });
    });
    $$('[data-tile-type]').forEach((button) => button.addEventListener("click", () => {
      terrainType = button.dataset.tileType;
      $$('[data-tile-type]').forEach((entry) => entry.classList.toggle("selected", entry === button));
    }));
    $$('[data-terrain-tool]').forEach((button) => button.addEventListener("click", () => {
      setPaintingTool(button.dataset.terrainTool, "terrain");
    }));
    $$('[data-ground-type]').forEach((button) => button.addEventListener("click", () => {
      groundType = button.dataset.groundType;
      $$('[data-ground-type]').forEach((entry) => entry.classList.toggle("selected", entry === button));
    }));
    $$('[data-ground-tool]').forEach((button) => button.addEventListener("click", () => {
      setPaintingTool(button.dataset.groundTool, "ground");
    }));
    $("#terrainBrushSize")?.addEventListener("change", persistWorkspacePreferences);
    $("#groundBrushSize")?.addEventListener("change", persistWorkspacePreferences);
    $("#resetGroundMap")?.addEventListener("click", resetGroundOverrides);
    $("#expandMapButton")?.addEventListener("click", expandMap);
    $("#addAssetButton").addEventListener("click", () => addAsset());
    $("#assetCatalogSearch")?.addEventListener("input", renderAssetCatalog);
    $("#assetCatalogCategory")?.addEventListener("change", renderAssetCatalog);
    $("#assetCatalogFavorites")?.addEventListener("click", (event) => {
      favoritesOnly = !favoritesOnly;
      event.currentTarget.setAttribute("aria-pressed", String(favoritesOnly));
      renderAssetCatalog();
    });
    $("#assetCatalogGrid")?.addEventListener("click", (event) => {
      const favorite = event.target.closest("[data-catalog-favorite]");
      if (favorite) {
        const id = favorite.dataset.catalogFavorite;
        if (favoriteAssetSprites.has(id)) favoriteAssetSprites.delete(id); else favoriteAssetSprites.add(id);
        safelyStore(persistentStorage, "pokemon-map-editor-favorite-assets", JSON.stringify([...favoriteAssetSprites]));
        renderAssetCatalog();
        return;
      }
      const option = event.target.closest("[data-catalog-asset]");
      if (!option) return;
      const id = option.dataset.catalogAsset;
      const now = Date.now();
      const shouldPlace = catalogLastActivation.id === id && now - catalogLastActivation.at <= 500;
      catalogLastActivation = shouldPlace ? { id: "", at: 0 } : { id, at: now };
      prototypeSelect.value = id;
      if (shouldPlace) { addAsset(id); return; }
      renderAssetCatalog();
    });
    $("#assetCatalogGrid")?.addEventListener("dragstart", (event) => {
      const option = event.target.closest("[data-catalog-asset]");
      if (!option || !event.dataTransfer) return;
      draggedCatalogAssetId = option.dataset.catalogAsset;
      catalogLastActivation = { id: "", at: 0 };
      editor.dataset.catalogDrag = "true";
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-pokemon-map-asset", draggedCatalogAssetId);
      event.dataTransfer.setData("text/plain", draggedCatalogAssetId);
    });
    $("#assetCatalogGrid")?.addEventListener("dragend", () => {
      draggedCatalogAssetId = ""; delete editor.dataset.catalogDrag;
    });
    prototypeSelect.addEventListener("change", renderAssetCatalog);
    $("#duplicateAssetButton").addEventListener("click", duplicateSelected);
    $("#flipAssetButton").addEventListener("click", () => { const asset = selectedEntity(); if (asset) updateSelected({ flipX: !asset.flipX }, "Voltear objeto"); });
    $("#deleteAssetButton").addEventListener("click", deleteSelected);
    $("#addNpcButton").addEventListener("click", () => addNpc($("[data-npc-template].selected")?.dataset.npcTemplate || "dialogue"));
    $$('[data-npc-template]').forEach((button) => button.addEventListener("click", () => { $$('[data-npc-template]').forEach((entry) => entry.classList.toggle("selected", entry === button)); }));
    $("#duplicateNpcButton").addEventListener("click", duplicateSelected); $("#deleteNpcButton").addEventListener("click", deleteSelected);
    $("#testNpcButton").addEventListener("click", () => { const npc = selectedEntity(); if (npc) bridge.previewEvent?.({ id: `preview-${npc.id}`, col: npc.col, row: npc.row, type: "dialogue", label: npc.name, message: (npc.lines || []).join("\n") }); });
    $("#addEntranceButton").addEventListener("click", () => addEntrance($("[data-entrance-template].selected")?.dataset.entranceTemplate || "interior"));
    $("#focusPerspectiveEntranceButton")?.addEventListener("click", focusPerspectiveEntrance);
    $$('[data-entrance-template]').forEach((button) => button.addEventListener("click", () => { $$('[data-entrance-template]').forEach((entry) => entry.classList.toggle("selected", entry === button)); }));
    $("#duplicateEntranceButton").addEventListener("click", duplicateSelected); $("#deleteEntranceButton").addEventListener("click", deleteSelected);
    $("#testEntranceButton").addEventListener("click", () => {
      const entrance = selectedEntity(); if (!entrance) return;
      bridge.previewEvent?.(entrance.action === "transition" ? { ...entrance, type: "transition", message: `Prueba: ${entrance.label}` }
        : { id: `preview-${entrance.id}`, col: entrance.col, row: entrance.row, type: "dialogue", label: entrance.label, message: `Entrada «${entrance.label}» · acción ${entrance.action}.` });
    });
    $("#addEventButton").addEventListener("click", () => addEvent($("[data-event-template].selected")?.dataset.eventTemplate || "thought"));
    $$('[data-event-template]').forEach((button) => button.addEventListener("click", () => { $$('[data-event-template]').forEach((entry) => entry.classList.toggle("selected", entry === button)); }));
    $("#duplicateEventButton").addEventListener("click", duplicateSelected); $("#deleteEventButton").addEventListener("click", deleteSelected);
    $("#testEventButton").addEventListener("click", () => { const event = selectedEntity(); if (event) bridge.previewEvent?.(event); });
    undoButton.addEventListener("click", undo); redoButton.addEventListener("click", redo);
    $("#mapEditorConflictKeepServer")?.addEventListener("click", () => void resolveConflict("server"));
    $("#mapEditorConflictReapply")?.addEventListener("click", () => void resolveConflict("reapply"));
    $("#mapEditorConflictCancel")?.addEventListener("click", () => void resolveConflict("cancel"));
    $("#mapEditorCenterButton")?.addEventListener("click", () => { if (selected) bridge.focusEntity?.(selected.kind, selected.id); });
    $("#mapEditorFitButton")?.addEventListener("click", () => { bridge.fitWorld?.(); updateZoomLabel(); });
    $("#mapEditorZoomInButton")?.addEventListener("click", () => setEditorZoom((bridge.zoom?.() || 1) * 1.2));
    $("#mapEditorZoomOutButton")?.addEventListener("click", () => setEditorZoom((bridge.zoom?.() || 1) / 1.2));
    $("#mapEditorZoomResetButton")?.addEventListener("click", () => setEditorZoom(1));
    $("#mapEditorJumpForm")?.addEventListener("submit", (event) => {
      event.preventDefault(); const grid = bridge.grid();
      const col = clamp(Number($("#mapEditorJumpCol").value), 0, grid.cols - 1); const row = clamp(Number($("#mapEditorJumpRow").value), 0, grid.rows - 1);
      bridge.centerAt?.((col + .5) * grid.tileSize, (row + .5) * grid.tileSize);
    });
    $("#mapEditorSheetToggle")?.addEventListener("click", () => {
      setEditorPanelCollapsed(!editor.classList.contains("collapsed"));
    });
    $("#mapEditorExpandSheetButton")?.addEventListener("click", () => {
      const expanded = editor.classList.toggle("fullscreen-inspector");
      setEditorPanelCollapsed(false);
      $("#mapEditorExpandSheetButton")?.setAttribute("aria-pressed", String(expanded));
    });
    $("#mapEditorSearchInput")?.addEventListener("input", renderOutliner); $("#mapEditorFilterInput")?.addEventListener("change", renderOutliner);
    $("#mapEditorOutlinerList")?.addEventListener("click", (event) => {
      const button = event.target.closest("button"); if (!button) return;
      const raw = button.dataset.outlinerSelect || button.dataset.outlinerCenter || button.dataset.outlinerHide || button.dataset.outlinerLock; if (!raw) return;
      const separator = raw.indexOf(":"); const kind = raw.slice(0, separator); const id = raw.slice(separator + 1); const key = selectionKey(kind, id);
      if (button.dataset.outlinerSelect) {
        const nextMode = { asset: "objects", npc: "npcs", entrance: "entrances", event: "events" }[kind]; setMode(nextMode); setSelected(kind, id, { add: event.shiftKey });
      } else if (button.dataset.outlinerCenter) bridge.focusEntity?.(kind, id);
      else if (button.dataset.outlinerHide) {
        if (temporarilyHiddenEntities.has(key)) temporarilyHiddenEntities.delete(key); else temporarilyHiddenEntities.add(key);
        bridge.setEntityVisibility?.(kind, id, !temporarilyHiddenEntities.has(key)); renderOutliner();
      } else if (button.dataset.outlinerLock) {
        if (lockedEntities.has(key)) lockedEntities.delete(key); else lockedEntities.add(key); renderOutliner();
      }
    });
    $("#mapEditorDiagnosticsRefresh")?.addEventListener("click", renderMapDiagnostics);
    $("#mapEditorDiagnosticsList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-diagnostic-entity]");
      const raw = button?.dataset.diagnosticEntity;
      if (!raw) return;
      const separator = raw.indexOf(":");
      if (separator <= 0) return;
      const kind = raw.slice(0, separator); const id = raw.slice(separator + 1);
      const nextMode = { asset: "objects", npc: "npcs", entrance: "entrances", event: "events" }[kind];
      if (!nextMode || !id || !entityById(kind, id)) return;
      setMode(nextMode); setSelected(kind, id); bridge.focusEntity?.(kind, id);
    });
    $$('[data-multi-action]').forEach((button) => button.addEventListener("click", () => transformSelectedAssets(button.dataset.multiAction)));
    $$('[data-editor-overlay]').forEach((input) => input.addEventListener("change", updateEditorOverlays));
    updateEditorOverlays();
    bindInspectorInputs();
    canvas.addEventListener("dragover", (event) => {
      const hasCatalogType = Array.from(event.dataTransfer?.types || []).includes("application/x-pokemon-map-asset");
      if (!bridge.isOpen() || (!hasCatalogType && !draggedCatalogAssetId)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    canvas.addEventListener("drop", (event) => {
      if (!bridge.isOpen()) return;
      const sprite = event.dataTransfer?.getData("application/x-pokemon-map-asset") || draggedCatalogAssetId;
      if (!sprite || !bridge.assetCatalog()[sprite]) return;
      event.preventDefault();
      draggedCatalogAssetId = "";
      catalogLastActivation = { id: "", at: 0 };
      delete editor.dataset.catalogDrag;
      prototypeSelect.value = sprite;
      setMode("objects");
      addAsset(sprite, bridge.canvasToWorld(event.clientX, event.clientY));
    });
    canvas.addEventListener("contextmenu", (event) => {
      if (bridge.isOpen() && (mode === "terrain" || mode === "ground")) event.preventDefault();
    });
    canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer); canvas.addEventListener("pointercancel", () => cancelCurrentAction({ clearSelection: false }));
    canvas.addEventListener("pointerleave", () => { if (!drag) bridge.setTerrainPreview?.([]); });
    canvas.addEventListener("wheel", (event) => {
      if (!bridge.isOpen()) return; event.preventDefault();
      setEditorZoom((bridge.zoom?.() || 1) * (event.deltaY < 0 ? 1.12 : .89), bridge.canvasToWorld(event.clientX, event.clientY));
    }, { passive: false });
    $("#miniMapCanvas")?.addEventListener("click", (event) => {
      if (!bridge.isOpen()) return; const rect = event.currentTarget.getBoundingClientRect();
      const grid = bridge.grid();
      bridge.centerAt?.((event.clientX - rect.left) / rect.width * grid.cols * grid.tileSize, (event.clientY - rect.top) / rect.height * grid.rows * grid.tileSize);
    });
    document.addEventListener("map-editor-open", () => {
      prepareOpenEditor();
      startRealtimeLifecycle();
      scheduleMapDiagnostics();
    });
    document.addEventListener("map-editor-close", () => {
      commitTransientTransactions();
      stopRealtimeLifecycle();
      if (pendingBatches.length) void flushOperations();
    });
    document.addEventListener("map-editor-cancel-request", (event) => {
      if (bridge.isOpen() && cancelCurrentAction()) event.preventDefault();
    });
    document.addEventListener("keydown", (event) => {
      if (!enabled) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const interactive = Boolean(event.target?.closest?.("input,select,textarea,button,a,summary,[contenteditable]"));
      if (!bridge.isOpen()) {
        if (!interactive && !modifier && !event.altKey && key === "g" && !event.repeat) { event.preventDefault(); bridge.open(); }
        return;
      }
      if (event.key === "Escape") return;
      if (modifier && key === "s") {
        event.preventDefault(); commitTransientTransactions(); void flushOperations(); return;
      }
      if (interactive) return;
      if (!modifier && !event.altKey && key === "g" && !event.repeat) { event.preventDefault(); bridge.close(); return; }
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = !modifier && !event.altKey ? directions[event.key] : null;
      if (drag || activeTransaction || formTransaction || (keyboardTransaction && !direction)) return;
      if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (modifier && key === "c") { event.preventDefault(); copySelection(); return; }
      if (modifier && key === "v") { event.preventDefault(); pasteSelection(); return; }
      if (event.key === " ") { event.preventDefault(); spacePressed = true; return; }
      const shortcut = resolveEditorShortcut({ key: event.key, mode, modifier, shift: event.shiftKey, alt: event.altKey });
      if (shortcut && executeEditorShortcut(shortcut)) { event.preventDefault(); return; }
      if (!selected) return;
      if (modifier && key === "d") { event.preventDefault(); duplicateSelected(); return; }
      if (event.key === "Delete") { event.preventDefault(); deleteSelected(); return; }
      if (!direction) return;
      event.preventDefault(); const entity = selectedEntity(); if (!entity) return;
      if (keyboardTransaction && (keyboardTransaction.kind !== selected.kind || keyboardTransaction.id !== entity.id)) {
        commitTransaction(keyboardTransaction.builder); keyboardTransaction = null;
      }
      if (!keyboardTransaction) keyboardTransaction = { builder: beginTransaction(`Mover ${selected.kind}`), before: entityBeforeOperation(selected.kind, entity), kind: selected.kind, id: entity.id };
      const grid = bridge.grid(); const next = selected.kind === "asset"
        ? { ...entity, x: entity.x + direction[0] * (event.shiftKey ? grid.tileSize : 1), y: entity.y + direction[1] * (event.shiftKey ? grid.tileSize : 1) }
        : { ...entity, col: clamp(entity.col + direction[0], 0, grid.cols - 1), row: clamp(entity.row + direction[1], 0, grid.rows - 1) };
      stageTransaction(keyboardTransaction.builder, entitySetOperation(selected.kind, next), keyboardTransaction.before);
    });
    document.addEventListener("keyup", (event) => {
      if (event.key === " ") spacePressed = false;
      if (keyboardTransaction && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        commitTransaction(keyboardTransaction.builder); keyboardTransaction = null; renderSelection();
      }
    });
    window.addEventListener("blur", () => {
      if (bridge.isOpen()) commitTransientTransactions();
      else spacePressed = false;
    });
    window.addEventListener("pagehide", () => {
      commitTransientTransactions();
      stopRealtimeLifecycle();
      if (pendingBatches.length) {
        void persistPendingBatches();
        void flushOperations({ keepalive: true });
      }
    });
    window.addEventListener("beforeunload", (event) => {
      commitTransientTransactions();
      if (!pendingBatches.length || outbox.durable) return;
      event.preventDefault(); event.returnValue = "";
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        commitTransientTransactions();
        stopRealtimeLifecycle();
        if (pendingBatches.length) void flushOperations({ keepalive: !soloMode });
        return;
      }
      if (!bridge.isOpen()) {
        stopRealtimeLifecycle();
        return;
      }
      if (soloMode) {
        scheduleMapDiagnostics();
        return;
      }
      startRealtimeLifecycle();
      void fetchSnapshot().then((snapshot) => {
        if (realtimeLifecycleActive()) applySnapshot(snapshot, { preservePending: pendingBatches.length > 0 });
      }).catch(() => scheduleReconnect());
    });
    window.addEventListener("online", () => { if (!soloMode) { setConnection("reconnecting", "Recuperando conexión…"); void flushOperations(); scheduleReconnect(); } });
    window.addEventListener("offline", () => { if (!soloMode) setSaveStatus("offline", "Sin conexión; los cambios están protegidos localmente."); });
  }

  const publicApi = {
    consumeLegacyClick: () => enabled && bridge.isOpen(),
    syncTileOverrides(overrides) {
      const next = { ...(overrides || {}) }; const keys = new Set([...Object.keys(data.tileOverrides), ...Object.keys(next)]);
      keys.forEach((key) => {
        const value = next[key] ?? null; if ((data.tileOverrides[key] ?? null) === value) return;
        queueOperation({ type: "tile.set", key, value });
      });
    },
    save: flushOperations,
    state: () => ({ enabled, solo: soloMode, connected: soloMode || eventSource?.readyState === EventSource.OPEN, mode, revision, pending: pendingOperationCount(), durable: outbox.durable, conflict: Boolean(conflictState), actorId, selected: clone(selected), data: clone(data), collaborators: clone(collaborators) }),
  };
  window.PokemonMapEditor = Object.freeze(publicApi);

  async function connect() {
    try {
      if (soloMode) {
        const [stored, recovered] = await Promise.all([Promise.resolve(readSoloSnapshot()), recoverOutbox()]);
        enabled = true;
        pendingBatches = recovered;
        inviteUrl = window.location.href;
        bridge.enable(); populatePrototypes(); populateNpcSprites(); bindUi(); applyWorkspacePreferences();
        applySnapshot({ revision: stored?.revision || 0, data: stored?.data || window.CITY_MAP_EDITOR_DATA || {} }, { preservePending: pendingBatches.length > 0 });
        setMode(mode);
        if (bridge.isOpen()) prepareOpenEditor();
        renderPresence([{ actorId, name: editorName, color }]);
        renderOutliner();
        setConnection("online", "Modo solo");
        if (pendingBatches.length) {
          setSaveStatus("pending", `Recuperados ${pendingOperationCount()} cambios locales.`);
          void flushOperations();
        } else {
          setSaveStatus("saved", stored
            ? `Modo solo · cambios de ${activeMapId} cargados desde este navegador.`
            : `Modo solo · ${activeMapId} usa los datos incluidos en index.html.`);
        }
        return;
      }
      const [result, recovered] = await Promise.all([fetchSnapshot(), recoverOutbox()]);
      if (!result.enabled) throw new Error("Editor desactivado");
      enabled = true;
      pendingBatches = recovered;
      inviteUrl = new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)
        ? result.collaboration?.inviteUrl || window.location.href
        : window.location.href;
      setRevision(result.revision);
      bridge.enable(); populatePrototypes(); populateNpcSprites(); bindUi(); applyWorkspacePreferences(); applySnapshot(result, { preservePending: pendingBatches.length > 0 }); setMode(mode);
      if (bridge.isOpen()) prepareOpenEditor();
      startRealtimeLifecycle();
      renderOutliner();
      if (pendingBatches.length) {
        setSaveStatus("pending", `Recuperados ${pendingOperationCount()} cambios del cierre anterior.`);
        void flushOperations();
      } else setSaveStatus("saved", `Conectado a ${result.mapId || activeMapId} · los cambios se escriben en ${result.file}`);
    } catch (error) {
      enabled = false; stopRealtimeLifecycle(); bridge.disable(); setConnection("offline", "Solo disponible en desarrollo");
    }
  }

  connect();
})();
