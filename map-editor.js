import { MAP_EDITOR_RULES, editorOperationKey, validateEditorEntity, validateEditorOperation } from "./map-editor-contract.js?v=3";
import {
  boundedBrushCells, changedKeysSince, chunkOperationBatches, CommandBuilder, DurableOutboxQueue, floodFillCells,
  IndexedDbOutboxAdapter, lineCells, PresenceGate, rectangleCells, TransactionHistory,
  resolveConflictQueue,
} from "./map-editor-core.js?v=5";

(() => {
  "use strict";

  const bridge = window.__pokemonMapEditorBridge;
  if (!bridge) return;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
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
    version: 2,
    tileOverrides: {}, assetOverrides: {}, addedAssets: [], hiddenAssets: [],
    npcOverrides: {}, addedNpcs: [], hiddenNpcs: [], entrances: [], events: [],
  });
  const normalizeData = (value = {}) => ({
    ...emptyData(),
    tileOverrides: { ...(value.tileOverrides || {}) },
    assetOverrides: clone(value.assetOverrides || {}),
    addedAssets: clone(Array.isArray(value.addedAssets) ? value.addedAssets : []),
    hiddenAssets: [...new Set(Array.isArray(value.hiddenAssets) ? value.hiddenAssets : [])],
    npcOverrides: clone(value.npcOverrides || {}),
    addedNpcs: clone(Array.isArray(value.addedNpcs) ? value.addedNpcs : []),
    hiddenNpcs: [...new Set(Array.isArray(value.hiddenNpcs) ? value.hiddenNpcs : [])],
    entrances: clone(Array.isArray(value.entrances) ? value.entrances : []),
    events: clone(Array.isArray(value.events) ? value.events : []),
  });

  let data = normalizeData(window.CITY_MAP_EDITOR_DATA || {});
  let revision = 0;
  let enabled = false;
  let bound = false;
  let mode = "objects";
  let terrainType = "blocked";
  let selected = null;
  let drag = null;
  let lastPaintedTile = "";
  let eventSource = null;
  let inviteUrl = "";
  let collaborators = [];
  let presenceTimer = 0;
  let presenceHeartbeatTimer = 0;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;
  let flushTimer = 0;
  let sending = false;
  let presenceRequestInFlight = false;
  let pollingOnline = false;
  let presenceCursor = null;
  let pendingBatches = [];
  let conflictState = null;
  let activeTransaction = null;
  let keyboardTransaction = null;
  let formTransaction = null;
  let terrainTool = "pencil";
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
  const storedStringList = (key) => { try { const value = JSON.parse(persistentStorage?.getItem(key) || "[]"); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } };
  const favoriteAssetSprites = new Set(storedStringList("pokemon-map-editor-favorite-assets"));
  let recentAssetSprites = storedStringList("pokemon-map-editor-recent-assets");
  let favoritesOnly = false;
  const actorId = (() => {
    const existing = storage?.getItem("pokemon-map-editor-actor");
    const actorPattern = new RegExp(`^[a-z0-9][a-z0-9_-]{0,${MAP_EDITOR_RULES.lengths.id - 1}}$`, "i");
    if (actorPattern.test(existing || "")) return existing;
    const generated = `editor-${randomIdentifier()}`;
    storage?.setItem("pokemon-map-editor-actor", generated);
    return generated;
  })();
  const legacyOutboxId = `pending:${window.location.pathname}`;
  const outboxId = `${legacyOutboxId}:${actorId}`;
  let outbox = new DurableOutboxQueue(new IndexedDbOutboxAdapter({
    key: outboxId,
    legacyKeys: [legacyOutboxId],
    legacyActorId: actorId,
  }), { actorId, key: outboxId });
  const fallbackOutboxKey = `pokemon-map-editor-outbox-v2:${window.location.pathname}:${actorId}`;
  const legacyFallbackOutboxKey = `pokemon-map-editor-outbox-v2:${window.location.pathname}`;

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
    col: $("#eventColInput"), row: $("#eventRowInput"), type: $("#eventTypeInput"),
    trigger: $("#eventTriggerInput"), message: $("#eventMessageInput"),
    targetMap: $("#eventTargetMapInput"), targetX: $("#eventTargetXInput"), targetY: $("#eventTargetYInput"),
    targetDirection: $("#eventTargetDirectionInput"), effect: $("#eventEffectInput"),
    duration: $("#eventDurationInput"), intensity: $("#eventIntensityInput"),
    once: $("#eventOnceInput"), enabled: $("#eventEnabledInput"),
  };

  function apiUrl(pathname) {
    const url = new URL(pathname, window.location.origin);
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
    const index = list.findIndex((entry) => entry.id === value.id);
    if (index < 0) list.push(clone(value));
    else list[index] = clone(value);
  }

  function arrayDelete(list, id) {
    const index = list.findIndex((entry) => entry.id === id);
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
    if (operation.type === "list.set") {
      bridge.applyEditorData?.(data);
      return;
    }
    if (operation.type === "entity.set") {
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

  function describeOperation(operation) {
    if (operation.type === "tile.set") return `casilla ${operation.key} → ${operation.value || "original"}`;
    if (operation.type === "list.set") return `actualizó ${operation.list}`;
    const labels = { asset: "objeto", npc: "NPC", entrance: "entrada", event: "evento" };
    return `${operation.type === "entity.delete" ? "eliminó" : "editó"} ${labels[operation.entity] || operation.entity} ${operation.id}`;
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
    const pending = preservePending ? pendingBatches.flatMap((batch) => batch.operations).map(clone) : [];
    data = normalizeData(snapshot.data || snapshot);
    setRevision(snapshot.revision ?? revision, true);
    bridge.applyEditorData?.(data);
    pending.forEach((operation) => {
      applyDataOperation(operation);
      applyBridgeOperation(operation);
    });
    renderSelection();
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
    operations.forEach((operation) => {
      applyDataOperation(operation);
      applyBridgeOperation(operation);
      remoteChangedKeys.add(operationKey(operation));
      remoteKeyRevisions.set(operationKey(operation), Number(payload.revision) || revision);
    });
    const terrainCount = operations.filter((operation) => operation.type === "tile.set").length;
    const groupId = payload.groupId || payload.transactionId || "";
    const grouped = remoteActivityGroups.get(groupId) || { operations: 0, terrain: 0 };
    grouped.operations += operations.length; grouped.terrain += terrainCount; remoteActivityGroups.set(groupId, grouped);
    const description = grouped.terrain ? `pintó ${grouped.terrain} casilla${grouped.terrain === 1 ? "" : "s"}` : payload.label || `${grouped.operations} cambios`;
    recordActivity(description, payload.name || "Otro editor", groupId);
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

  function openEventStream() {
    eventSource?.close();
    window.clearTimeout(reconnectTimer);
    const url = apiUrl("/api/dev/map-editor/events");
    url.searchParams.set("actorId", actorId);
    url.searchParams.set("name", editorName);
    url.searchParams.set("color", color);
    url.searchParams.set("mode", mode);
    eventSource = new EventSource(url);
    eventSource.onopen = () => { reconnectAttempt = 0; pollingOnline = false; setConnection("online", "En directo"); };
    eventSource.onerror = () => {
      eventSource?.close();
      setConnection("reconnecting", "Reconectando…");
      scheduleReconnect();
    };
    eventSource.addEventListener("snapshot", (event) => {
      const snapshot = JSON.parse(event.data);
      applySnapshot(snapshot, { preservePending: pendingBatches.length > 0 });
      setConnection("online", "En directo");
    });
    eventSource.addEventListener("operations", (event) => applyRemoteOperations(JSON.parse(event.data)));
    eventSource.addEventListener("presence", (event) => renderPresence(JSON.parse(event.data).users));
  }

  function scheduleReconnect() {
    if (!enabled || reconnectTimer) return;
    const base = Math.min(MAP_EDITOR_RULES.timing.reconnectMaximumMs, 700 * (2 ** reconnectAttempt));
    const delay = base + Math.floor(Math.random() * Math.max(250, base * .35));
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => { reconnectTimer = 0; openEventStream(); }, delay);
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
    if (presenceRequestInFlight) return;
    const payload = presencePayload(cursor);
    const decision = presenceGate.decision(payload, Date.now(), { heartbeat });
    if (!decision.send) return decision;
    presenceRequestInFlight = true;
    try {
      const response = await fetch(apiUrl("/api/dev/map-editor/presence"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
      renderPresence(result.users);
    } finally {
      presenceRequestInFlight = false;
    }
  }

  function sendPresence(cursor = null) {
    presenceCursor = cursor;
    if (presenceTimer) return;
    const publishLatest = async () => {
      presenceTimer = 0;
      if (!enabled) return;
      try {
        const decision = await publishPresence(presenceCursor);
        if (decision && !decision.send && decision.changed && decision.wait > 0) {
          presenceTimer = window.setTimeout(publishLatest, decision.wait);
        }
      } catch { /* EventSource reconnection exposes the connection state. */ }
    };
    presenceTimer = window.setTimeout(publishLatest, 0);
  }

  function startPresenceHeartbeat() {
    window.clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = window.setInterval(() => {
      if (!enabled) return;
      void publishPresence(presenceCursor, { heartbeat: true }).catch(() => {});
    }, MAP_EDITOR_RULES.timing.presenceHeartbeatMs);
  }

  function entityCollection(kind, id) {
    if (kind === "asset") return data.addedAssets.some((entry) => entry.id === id) ? "addedAssets" : "assetOverrides";
    if (kind === "npc") return data.addedNpcs.some((entry) => entry.id === id) ? "addedNpcs" : "npcOverrides";
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
    if (added) { record.id = asset.id; record.sprite = asset.sprite; }
    return record;
  }

  function npcRecord(npc) {
    const record = {
      id: npc.id, col: Math.floor(Number(npc.col)), row: Math.floor(Number(npc.row)),
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
    validateEntrance(entrance);
  }

  function updateEventFieldVisibility(type) {
    $$('[data-event-fields="target"]').forEach((element) => element.classList.toggle("hidden", !["teleport", "transition"].includes(type)));
    $$('[data-event-fields="vibration"]').forEach((element) => element.classList.toggle("hidden", type !== "vibration"));
  }

  function renderEventSelection(event) {
    $("#eventInspector").disabled = !event;
    if (!event) {
      updateEventFieldVisibility("dialogue");
      setInfo("#eventSelectionInfo", "Selecciona un evento", "Haz clic en el mapa");
      return;
    }
    setInfo("#eventSelectionInfo", event.label || event.id, `C${event.col} · F${event.row} · ${event.type}`);
    eventInputs.col.value = event.col; eventInputs.row.value = event.row; eventInputs.type.value = event.type || "dialogue";
    eventInputs.trigger.value = event.trigger || "interact"; eventInputs.message.value = Array.isArray(event.message) ? event.message.join("\n") : event.message || "";
    eventInputs.targetMap.value = event.targetMap || ""; eventInputs.targetX.value = event.targetX ?? ""; eventInputs.targetY.value = event.targetY ?? "";
    eventInputs.targetDirection.value = event.targetDirection || "down"; eventInputs.effect.value = event.effect || (event.type === "transition" ? "fade" : "none");
    eventInputs.duration.value = event.duration ?? 440; eventInputs.intensity.value = event.intensity ?? 1;
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

  function presentEntityValidation(kind, entity, output, inputs = []) {
    const base = validateEditorEntity(kind, entity);
    const result = { ...base, errors: [...base.errors], warnings: [...base.warnings] };
    if (kind === "npc" && entity.patrol?.to) {
      const route = lineCells({ col: entity.col, row: entity.row }, { col: entity.patrol.to[0], row: entity.patrol.to[1] }, bridge.grid());
      if (route.some(({ col, row }) => bridge.tileType(col, row) === "blocked")) result.errors.push("La ruta de patrulla atraviesa una casilla bloqueada.");
    }
    if (kind === "event") {
      const overlaps = (bridge.entities?.("event") || []).filter((candidate) => candidate.id !== entity.id && candidate.col === entity.col && candidate.row === entity.row);
      if (overlaps.length) result.warnings.push(`Comparte casilla con ${overlaps.map((candidate) => candidate.id).join(", ")}.`);
      if (bridge.tileType(entity.col, entity.row) === "blocked") result.warnings.push("El evento está en una casilla bloqueada; comprueba que siga siendo accesible.");
    }
    result.valid = result.errors.length === 0;
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

  function setMode(nextMode) {
    const modes = new Set(["objects", "terrain", "npcs", "entrances", "events"]);
    mode = modes.has(nextMode) ? nextMode : "objects";
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
      objects: [], terrain: ["grid", "collisions"], npcs: ["npcs", "routes"],
      entrances: ["entrances"], events: ["events"],
    }[mode];
    $$('[data-editor-overlay]').forEach((input) => { input.checked = relevantOverlays.includes(input.dataset.editorOverlay); });
    updateEditorOverlays();
    bridge.setEditorMode?.(mode);
    if (selected?.kind !== ({ objects: "asset", npcs: "npc", entrances: "entrance", events: "event" }[mode])) setSelected(null, null);
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
    const changes = command.after.map((after, index) => ({ after, before: command.before[command.before.length - 1 - index] }))
      .filter(({ after, before }) => JSON.stringify(after) !== JSON.stringify(before));
    if (!changes.length) return false;
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
    if (keyboardTransaction) {
      committed = commitTransaction(keyboardTransaction.builder) || committed;
      keyboardTransaction = null;
    }
    if (formTransaction) {
      committed = commitTransaction(formTransaction.builder) || committed;
      formTransaction = null;
    }
    if (activeTransaction) {
      committed = commitTransaction(activeTransaction) || committed;
      activeTransaction = null;
    }
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
    const result = bridge.setEntity?.(kind, next.id, next) || next;
    const current = entityById(kind, next.id) || result;
    const operation = entitySetOperation(kind, current);
    queueOperation(operation);
    if (historyBefore) pushHistory(operation, {
      type: "entity.set", entity: kind, collection: entityCollection(kind, next.id), id: next.id,
      value: cleanEntityRecord(kind, historyBefore),
    }, label);
    setSelected(kind, next.id);
    return current;
  }

  function updateSelected(patch, label = "Editar entidad") {
    const entity = selectedEntity(); if (!entity || !selected) return;
    const before = clone(entity); const next = { ...entity, ...patch };
    upsertLocalEntity(selected.kind, next, { historyBefore: before, label });
  }

  function addAsset(sprite = prototypeSelect?.value, position = bridge.viewportCenter(), template = {}) {
    const prototype = bridge.assetCatalog()[sprite]; if (!prototype) return null;
    recentAssetSprites = [sprite, ...recentAssetSprites.filter((entry) => entry !== sprite)].slice(0, 8);
    persistentStorage?.setItem("pokemon-map-editor-recent-assets", JSON.stringify(recentAssetSprites));
    renderAssetCatalog();
    const asset = {
      id: uniqueId(`editor-${sprite}`), sprite, kind: prototype.kind || "prop", placement: "editor",
      x: snap(position.x), y: snap(position.y), scale: Number(template.scale) || 1,
      rotation: Number(template.rotation) || 0, depthY: snap(position.y) - (prototype.kind === "building" ? 10 : 2),
      solid: template.solid !== false, flipX: Boolean(template.flipX), label: template.label || `Objeto ${sprite}`,
    };
    const operation = { type: "entity.set", entity: "asset", collection: "addedAssets", id: asset.id, value: assetRecord(asset, true) };
    bridge.setEntity("asset", asset.id, asset); queueOperation(operation);
    pushHistory(operation, { type: "entity.delete", entity: "asset", collection: "addedAssets", id: asset.id, hide: false }, "Añadir objeto");
    setSelected("asset", asset.id); return entityById("asset", asset.id);
  }

  function addNpc(template = "dialogue", position = bridge.viewportCenter()) {
    const grid = bridge.grid(); const col = clamp(Math.floor(position.x / grid.tileSize), 0, grid.cols - 1);
    const row = clamp(Math.floor(position.y / grid.tileSize), 0, grid.rows - 1);
    const npc = { id: uniqueId("npc"), col, row, direction: "down", name: template === "patrol" ? "Paseante" : "Vecino", sprite: npcInputs.sprite?.value || "guide", lines: ["Hola, entrenador."] };
    if (template === "patrol") npc.patrol = { to: [col, Math.max(0, row - 4)], tilesPerSecond: .75 };
    const operation = { type: "entity.set", entity: "npc", collection: "addedNpcs", id: npc.id, value: npcRecord(npc) };
    bridge.setEntity("npc", npc.id, npc); queueOperation(operation);
    pushHistory(operation, { type: "entity.delete", entity: "npc", collection: "addedNpcs", id: npc.id, hide: false }, "Añadir NPC");
    setSelected("npc", npc.id); return npc;
  }

  function addEntrance(template = "interior", position = bridge.viewportCenter()) {
    const grid = bridge.grid(); const col = clamp(Math.floor(position.x / grid.tileSize), 0, grid.cols - 1);
    const row = clamp(Math.floor(position.y / grid.tileSize), 0, grid.rows - 1);
    const entrance = template === "new-map"
      ? { id: uniqueId("entrance"), col, row, label: "Salida a nuevo mapa", action: "transition", targetMap: "new-map", targetX: 64, targetY: 64, targetDirection: "down", effect: "fade" }
      : { id: uniqueId("entrance"), col, row, label: "Casa", action: "house", targetMap: "", targetX: null, targetY: null, targetDirection: "down", effect: "fade" };
    const operation = { type: "entity.set", entity: "entrance", collection: "entrances", id: entrance.id, value: entrance };
    bridge.setEntity("entrance", entrance.id, entrance); queueOperation(operation);
    pushHistory(operation, { type: "entity.delete", entity: "entrance", collection: "entrances", id: entrance.id, hide: false }, "Añadir entrada");
    setSelected("entrance", entrance.id); return entrance;
  }

  function addEvent(template = "thought", position = bridge.viewportCenter()) {
    const grid = bridge.grid(); const col = clamp(Math.floor(position.x / grid.tileSize), 0, grid.cols - 1);
    const row = clamp(Math.floor(position.y / grid.tileSize), 0, grid.rows - 1);
    const base = { id: uniqueId("event"), col, row, label: "Evento", type: template, trigger: "interact", message: "Algo llama tu atención.", once: false, enabled: true };
    if (template === "vibration") Object.assign(base, { message: "El suelo tiembla bajo tus pies.", duration: 440, intensity: 1 });
    if (template === "transition") Object.assign(base, { label: "Ir a nuevo mapa", message: "Cruzas hacia otra zona…", targetMap: "new-map", targetX: 64, targetY: 64, targetDirection: "down", effect: "fade" });
    const operation = { type: "entity.set", entity: "event", collection: "events", id: base.id, value: base };
    bridge.setEntity("event", base.id, base); queueOperation(operation);
    pushHistory(operation, { type: "entity.delete", entity: "event", collection: "events", id: base.id, hide: false }, "Añadir evento");
    setSelected("event", base.id); return base;
  }

  function duplicateSelected() {
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
    const entity = selectedEntity(); if (!entity || !selected) return;
    const { kind, id } = selected; const collection = entityCollection(kind, id);
    const baseEntity = (kind === "asset" && collection === "assetOverrides") || (kind === "npc" && collection === "npcOverrides");
    const verb = baseEntity ? "ocultar" : "eliminar";
    if (!window.confirm(`¿Quieres ${verb} «${entity.label || entity.name || id}»?`)) return;
    let operation;
    if (kind === "entrance" && !data.entrances.some((entry) => entry.id === id)) {
      operation = { type: "entity.set", entity: kind, collection: "entrances", id, value: { ...clone(entity), enabled: false } };
    } else operation = { type: "entity.delete", entity: kind, collection, id, hide: baseEntity };
    const inverse = { type: "entity.set", entity: kind, collection, id, value: cleanEntityRecord(kind, entity) };
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
    return { col: Math.floor(point.x / grid.tileSize), row: Math.floor(point.y / grid.tileSize) };
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
    return boundedBrushCells({ col: cell.col, row: cell.row, size: Number($("#terrainBrushSize")?.value) || 1, cols: grid.cols, rows: grid.rows });
  }

  function expandCellsWithBrush(cells) {
    const seen = new Set();
    return cells.flatMap(brushCellsAt).filter((cell) => {
      const key = `${cell.col},${cell.row}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function stageTerrainCells(cells, builder, selectedType = terrainType) {
    const startedAt = performance.now();
    const value = selectedType === "inherit" ? null : selectedType;
    cells.forEach(({ col, row }) => {
      const key = `${col},${row}`; const before = data.tileOverrides[key] ?? null;
      if (before === value) return;
      stageTransaction(builder, { type: "tile.set", key, value }, { type: "tile.set", key, value: before });
    });
    const elapsed = performance.now() - startedAt;
    const previous = Number(document.documentElement.dataset.editorMaxTerrainStageMs) || 0;
    document.documentElement.dataset.editorLastTerrainStageMs = elapsed.toFixed(2);
    document.documentElement.dataset.editorMaxTerrainStageMs = Math.max(previous, elapsed).toFixed(2);
  }

  function paintAtEvent(event, builder = activeTransaction) {
    const center = tileAtEvent(event);
    const brushSize = Math.max(1, Number($("#terrainBrushSize")?.value) || 1);
    const centerCol = center.col; const centerRow = center.row;
    const strokeKey = `${centerCol},${centerRow}:${terrainType}:${brushSize}`; if (strokeKey === lastPaintedTile) return;
    lastPaintedTile = strokeKey;
    stageTerrainCells(brushCellsAt(center), builder, terrainTool === "eraser" ? "inherit" : terrainType);
  }

  function previewTerrainCells(cells) {
    bridge.setTerrainPreview?.(cells.map((cell) => ({ ...cell, type: terrainTool === "eraser" ? "inherit" : terrainType })));
  }

  function onPointerDown(event) {
    if (!enabled || !bridge.isOpen()) return;
    if (event.pointerType === "touch") {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size === 2) {
        const points = [...touchPointers.values()];
        if (activeTransaction) { commitTransaction(activeTransaction); activeTransaction = null; }
        drag = null;
        pinchGesture = {
          distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
          zoom: bridge.zoom?.() || 1,
        };
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
    } else if (event.button !== 0) return;
    if (mode === "terrain") {
      event.preventDefault();
      const start = tileAtEvent(event);
      if (terrainTool === "eyedropper") {
        terrainType = bridge.tileType(start.col, start.row) || "inherit";
        $$('[data-tile-type]').forEach((entry) => entry.classList.toggle("selected", entry.dataset.tileType === terrainType));
        return;
      }
      activeTransaction = beginTransaction(terrainTool === "fill" ? "Rellenar terreno" : terrainTool === "rectangle" ? "Rectángulo de terreno" : "Pintar terreno");
      if (terrainTool === "fill") {
        const cells = floodFillCells({ start, bounds: bridge.grid(), getValue: (col, row) => bridge.tileType(col, row) });
        stageTerrainCells(cells, activeTransaction);
        commitTransaction(activeTransaction); activeTransaction = null; bridge.setTerrainPreview?.([]); return;
      }
      lastPaintedTile = "";
      if (terrainTool === "rectangle" || event.shiftKey) drag = { type: "terrain-shape", shape: terrainTool === "rectangle" ? "rectangle" : "line", pointerId: event.pointerId, start, current: start, transaction: activeTransaction };
      else { drag = { type: "terrain", pointerId: event.pointerId, transaction: activeTransaction }; paintAtEvent(event, activeTransaction); }
    } else if (mode === "objects") {
      if (drag?.type === "pan") { /* Space/middle pan has priority. */ }
      else {
        const handle = selectedAssetHandle(point);
        if (handle) {
          const asset = selectedEntity(); const center = { x: asset.x, y: asset.y - asset.h / 2 };
          event.preventDefault();
          drag = {
            type: "entity-transform", transform: handle.type, kind: "asset", pointerId: event.pointerId,
            before: clone(asset), beforeOperation: entitySetOperation("asset", asset), transaction: beginTransaction(handle.type === "scale" ? "Escalar objeto" : "Rotar objeto"),
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
          before: clone(asset), beforeOperation: entitySetOperation("asset", asset), groupBefore, transaction: beginTransaction(groupBefore?.length > 1 ? "Mover grupo" : "Mover objeto"),
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
          beforeOperation: entitySetOperation(kind, entity), transaction: beginTransaction(`Mover ${kind}`),
        };
      }
    }
    if (drag) canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchGesture && touchPointers.size >= 2) {
        const points = [...touchPointers.values()].slice(0, 2);
        const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
        const anchor = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
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
      if (!drag && mode === "terrain") previewTerrainCells(brushCellsAt(tileAtEvent(event)));
      return;
    }
    event.preventDefault();
    if (drag.type === "pan") {
      bridge.panBy?.(drag.clientX - event.clientX, drag.clientY - event.clientY);
      drag.clientX = event.clientX; drag.clientY = event.clientY; return;
    }
    if (drag.type === "terrain") { paintAtEvent(event, drag.transaction); return; }
    if (drag.type === "terrain-shape") {
      drag.current = tileAtEvent(event);
      const baseCells = drag.shape === "rectangle" ? rectangleCells(drag.start, drag.current, bridge.grid()) : lineCells(drag.start, drag.current, bridge.grid());
      previewTerrainCells(expandCellsWithBrush(baseCells)); return;
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
          stageTransaction(drag.transaction, entitySetOperation("asset", moved), entitySetOperation("asset", asset));
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
      touchPointers.delete(event.pointerId);
      if (touchPointers.size < 2) pinchGesture = null;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag; drag = null; lastPaintedTile = ""; canvas.releasePointerCapture?.(event.pointerId);
    if (finished.type === "terrain-shape") {
      const baseCells = finished.shape === "rectangle" ? rectangleCells(finished.start, finished.current, bridge.grid()) : lineCells(finished.start, finished.current, bridge.grid());
      stageTerrainCells(expandCellsWithBrush(baseCells), finished.transaction);
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
    const labels = { building: "Edificios", tree: "Árboles", prop: "Mobiliario", blocker: "Obstáculos" };
    const groups = new Map();
    Object.entries(bridge.assetCatalog()).forEach(([id, prototype]) => {
      const kind = prototype.kind || "prop"; if (!groups.has(kind)) groups.set(kind, []); groups.get(kind).push([id, prototype]);
    });
    prototypeSelect.replaceChildren(...[...groups].map(([kind, entries]) => {
      const group = document.createElement("optgroup"); group.label = labels[kind] || kind;
      entries.forEach(([id, prototype]) => { const option = document.createElement("option"); option.value = id; option.textContent = `${id} · ${prototype.w}×${prototype.h}`; group.appendChild(option); });
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
      return !query || `${id} ${prototype.kind || "prop"}`.toLowerCase().includes(query);
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
      const image = document.createElement("img"); image.src = prototype.src; image.alt = ""; image.loading = "lazy";
      const name = document.createElement("span"); name.textContent = id;
      const size = document.createElement("small"); size.textContent = `${prototype.w}×${prototype.h}`;
      select.append(image, name, size);
      const favorite = document.createElement("button"); favorite.type = "button"; favorite.dataset.catalogFavorite = id;
      favorite.className = "map-editor-catalog-favorite"; favorite.setAttribute("aria-label", `${favoriteAssetSprites.has(id) ? "Quitar" : "Añadir"} ${id} ${favoriteAssetSprites.has(id) ? "de" : "a"} favoritos`);
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
        if (!formTransaction || formTransaction.kind !== kind || formTransaction.id !== entity.id) {
          formTransaction = { kind, id: entity.id, builder: beginTransaction(label), before: entitySetOperation(kind, entity) };
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
      return { ...event, col: numberValue(eventInputs.col), row: numberValue(eventInputs.row), type: eventInputs.type.value, trigger: eventInputs.trigger.value, message: eventInputs.message.value, targetMap: eventInputs.targetMap.value || null, targetX: eventInputs.targetX.value === "" ? null : numberValue(eventInputs.targetX), targetY: eventInputs.targetY.value === "" ? null : numberValue(eventInputs.targetY), targetDirection: eventInputs.targetDirection.value, effect: eventInputs.effect.value, duration: numberValue(eventInputs.duration), intensity: numberValue(eventInputs.intensity), once: eventInputs.once.checked, enabled: eventInputs.enabled.checked };
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
      stageTransaction(builder, entitySetOperation("asset", { ...asset, ...patch }), entitySetOperation("asset", asset));
    });
    commitTransaction(builder); renderSelection();
  }

  function copySelection() {
    copiedAssets = selectedAssets().map(clone);
    if (!copiedAssets.length && selected?.kind === "asset" && selectedEntity()) copiedAssets = [clone(selectedEntity())];
    if (copiedAssets.length) setSaveStatus(pendingBatches.length ? "pending" : "saved", `${copiedAssets.length} objeto${copiedAssets.length === 1 ? "" : "s"} copiado${copiedAssets.length === 1 ? "" : "s"}.`);
  }

  function pasteSelection() {
    if (!copiedAssets.length) return;
    const builder = beginTransaction("Pegar objetos"); multiSelection.clear();
    copiedAssets.forEach((source, index) => {
      const asset = { ...clone(source), id: uniqueId(`editor-${source.sprite || "asset"}`), x: clamp(Number(source.x) + 32 + index * 8, 0, MAP_EDITOR_RULES.world.width), y: clamp(Number(source.y) + 32 + index * 8, 0, MAP_EDITOR_RULES.world.height), label: `${source.label || source.sprite || "Objeto"} (copia)`, placement: "editor" };
      const after = { type: "entity.set", entity: "asset", collection: "addedAssets", id: asset.id, value: assetRecord(asset, true) };
      const before = { type: "entity.delete", entity: "asset", collection: "addedAssets", id: asset.id, hide: false };
      stageTransaction(builder, after, before); multiSelection.add(selectionKey("asset", asset.id)); selected = { kind: "asset", id: asset.id };
    });
    commitTransaction(builder); bridge.setSelections?.([...multiSelection].map((key) => ({ kind: "asset", id: key.slice(6) }))); renderSelection();
  }

  function applyInputRules() {
    const setRange = (input, range) => { if (!input) return; input.min = String(range[0]); input.max = String(range[1]); };
    [assetInputs.x, assetInputs.y].forEach((input, index) => setRange(input, [0, index ? MAP_EDITOR_RULES.world.height : MAP_EDITOR_RULES.world.width]));
    setRange(assetInputs.scale, MAP_EDITOR_RULES.ranges.scale); setRange(assetInputs.rotation, MAP_EDITOR_RULES.ranges.rotation); setRange(assetInputs.depthY, MAP_EDITOR_RULES.ranges.depthY);
    [npcInputs.col, npcInputs.patrolCol, entranceInputs.col, eventInputs.col, $("#mapEditorJumpCol")].forEach((input) => setRange(input, [0, MAP_EDITOR_RULES.world.cols - 1]));
    [npcInputs.row, npcInputs.patrolRow, entranceInputs.row, eventInputs.row, $("#mapEditorJumpRow")].forEach((input) => setRange(input, [0, MAP_EDITOR_RULES.world.rows - 1]));
    setRange(npcInputs.patrolSpeed, MAP_EDITOR_RULES.ranges.patrolSpeed);
    [entranceInputs.targetX, entranceInputs.targetY, eventInputs.targetX, eventInputs.targetY].forEach((input) => setRange(input, MAP_EDITOR_RULES.ranges.targetCoordinate));
    setRange(eventInputs.duration, MAP_EDITOR_RULES.ranges.duration); setRange(eventInputs.intensity, MAP_EDITOR_RULES.ranges.intensity);
    eventInputs.message.maxLength = MAP_EDITOR_RULES.lengths.eventMessage; npcInputs.lines.maxLength = MAP_EDITOR_RULES.lengths.npcLines * (MAP_EDITOR_RULES.lengths.npcLine + 1);
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

  function prepareOpenEditor() {
    editor.classList.toggle("collapsed", window.innerWidth <= 680);
    editor.classList.remove("fullscreen-inspector");
    $("#mapEditorSheetToggle")?.setAttribute("aria-expanded", String(!editor.classList.contains("collapsed")));
    window.setTimeout(() => $("[data-editor-mode][aria-selected='true']")?.focus(), 0);
    updateZoomLabel();
  }

  function bindUi() {
    if (bound) return; bound = true;
    applyInputRules();
    nameInput.value = editorName;
    nameInput.addEventListener("change", () => {
      editorName = nameInput.value.trim().slice(0, MAP_EDITOR_RULES.lengths.actorName) || `Editor ${actorId.slice(-4).toUpperCase()}`;
      nameInput.value = editorName; persistentStorage?.setItem("pokemon-map-editor-name", editorName); sendPresence();
    });
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
      terrainTool = button.dataset.terrainTool;
      $$('[data-terrain-tool]').forEach((entry) => { entry.classList.toggle("selected", entry === button); entry.setAttribute("aria-pressed", String(entry === button)); });
    }));
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
        persistentStorage?.setItem("pokemon-map-editor-favorite-assets", JSON.stringify([...favoriteAssetSprites]));
        renderAssetCatalog();
        return;
      }
      const option = event.target.closest("[data-catalog-asset]");
      if (!option) return;
      prototypeSelect.value = option.dataset.catalogAsset;
      renderAssetCatalog();
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
      editor.classList.toggle("collapsed"); const expanded = !editor.classList.contains("collapsed");
      $("#mapEditorSheetToggle").setAttribute("aria-expanded", String(expanded));
    });
    $("#mapEditorExpandSheetButton")?.addEventListener("click", () => {
      editor.classList.toggle("fullscreen-inspector"); editor.classList.remove("collapsed"); $("#mapEditorSheetToggle")?.setAttribute("aria-expanded", "true");
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
    $$('[data-multi-action]').forEach((button) => button.addEventListener("click", () => transformSelectedAssets(button.dataset.multiAction)));
    $$('[data-editor-overlay]').forEach((input) => input.addEventListener("change", updateEditorOverlays));
    updateEditorOverlays();
    bindInspectorInputs();
    canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer); canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", () => { if (!drag) bridge.setTerrainPreview?.([]); });
    canvas.addEventListener("wheel", (event) => {
      if (!bridge.isOpen()) return; event.preventDefault();
      setEditorZoom((bridge.zoom?.() || 1) * (event.deltaY < 0 ? 1.12 : .89), bridge.canvasToWorld(event.clientX, event.clientY));
    }, { passive: false });
    $("#miniMapCanvas")?.addEventListener("click", (event) => {
      if (!bridge.isOpen()) return; const rect = event.currentTarget.getBoundingClientRect();
      bridge.centerAt?.((event.clientX - rect.left) / rect.width * MAP_EDITOR_RULES.world.width, (event.clientY - rect.top) / rect.height * MAP_EDITOR_RULES.world.height);
    });
    document.addEventListener("map-editor-open", prepareOpenEditor);
    document.addEventListener("map-editor-close", commitTransientTransactions);
    document.addEventListener("keydown", (event) => {
      if (!enabled) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); flushOperations(); return; }
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (modifier && event.key.toLowerCase() === "c" && bridge.isOpen()) { event.preventDefault(); copySelection(); return; }
      if (modifier && event.key.toLowerCase() === "v" && bridge.isOpen()) { event.preventDefault(); pasteSelection(); return; }
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || ""); if (typing) return;
      if (event.key === " ") { if (bridge.isOpen()) event.preventDefault(); spacePressed = true; return; }
      if (event.key.toLowerCase() === "g" && !event.repeat) { event.preventDefault(); bridge.isOpen() ? bridge.close() : bridge.open(); return; }
      if (!bridge.isOpen() || !selected) return;
      if (modifier && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); return; }
      if (event.key === "Delete") { event.preventDefault(); deleteSelected(); return; }
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key]; if (!direction) return;
      event.preventDefault(); const entity = selectedEntity(); if (!entity) return;
      if (!keyboardTransaction) keyboardTransaction = { builder: beginTransaction(`Mover ${selected.kind}`), before: entitySetOperation(selected.kind, entity), kind: selected.kind, id: entity.id };
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
    window.addEventListener("pagehide", () => {
      commitTransientTransactions();
      eventSource?.close();
      window.clearInterval(presenceHeartbeatTimer);
      window.clearTimeout(reconnectTimer);
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
        if (pendingBatches.length) void flushOperations({ keepalive: true });
        return;
      }
      void fetchSnapshot().then((snapshot) => applySnapshot(snapshot, { preservePending: pendingBatches.length > 0 })).catch(() => scheduleReconnect());
      if (eventSource?.readyState !== EventSource.OPEN) scheduleReconnect();
    });
    window.addEventListener("online", () => { setConnection("reconnecting", "Recuperando conexión…"); void flushOperations(); scheduleReconnect(); });
    window.addEventListener("offline", () => setSaveStatus("offline", "Sin conexión; los cambios están protegidos localmente."));
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
    state: () => ({ enabled, connected: eventSource?.readyState === EventSource.OPEN, mode, revision, pending: pendingOperationCount(), durable: outbox.durable, conflict: Boolean(conflictState), actorId, selected: clone(selected), data: clone(data), collaborators: clone(collaborators) }),
  };
  window.PokemonMapEditor = Object.freeze(publicApi);

  async function connect() {
    try {
      const [result, recovered] = await Promise.all([fetchSnapshot(), recoverOutbox()]);
      if (!result.enabled) throw new Error("Editor desactivado");
      enabled = true;
      pendingBatches = recovered;
      inviteUrl = new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)
        ? result.collaboration?.inviteUrl || window.location.href
        : window.location.href;
      setRevision(result.revision);
      bridge.enable(); populatePrototypes(); populateNpcSprites(); bindUi(); applySnapshot(result, { preservePending: pendingBatches.length > 0 }); setMode("objects");
      if (bridge.isOpen()) prepareOpenEditor();
      openEventStream(); startPresenceHeartbeat(); sendPresence();
      renderOutliner();
      if (pendingBatches.length) {
        setSaveStatus("pending", `Recuperados ${pendingOperationCount()} cambios del cierre anterior.`);
        void flushOperations();
      } else setSaveStatus("saved", `Conectado · los cambios se escriben en ${result.file}`);
    } catch (error) {
      enabled = false; bridge.disable(); setConnection("offline", "Solo disponible en desarrollo");
    }
  }

  connect();
})();
