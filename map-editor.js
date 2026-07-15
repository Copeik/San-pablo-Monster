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
  let snapshotPollTimer = 0;
  let flushTimer = 0;
  let sending = false;
  let presenceRequestInFlight = false;
  let pollingOnline = false;
  let presenceCursor = null;
  let pendingBaseRevision = null;
  const pendingOperations = new Map();
  const undoStack = [];
  const redoStack = [];
  const activity = [];

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
  const prototypeSelect = $("#assetPrototypeSelect");
  const snapSelect = $("#assetSnapSelect");
  const token = new URLSearchParams(window.location.search).get("editorToken") || "";
  const storage = (() => { try { return window.sessionStorage; } catch { return null; } })();
  const persistentStorage = (() => { try { return window.localStorage; } catch { return null; } })();
  const actorId = (() => {
    const existing = storage?.getItem("pokemon-map-editor-actor");
    if (/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(existing || "")) return existing;
    const generated = `editor-${randomIdentifier()}`;
    storage?.setItem("pokemon-map-editor-actor", generated);
    return generated;
  })();
  const color = (() => {
    let hash = 0;
    for (const character of actorId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const palette = ["#45c4ff", "#ff6b8a", "#ffd166", "#7be495", "#b892ff", "#ff955c", "#5de2c2", "#f071d4"];
    return palette[hash % palette.length];
  })();
  let editorName = persistentStorage?.getItem("pokemon-map-editor-name")?.slice(0, 32)
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
    if (!saveStatus) return;
    saveStatus.dataset.state = state;
    const text = saveStatus.querySelector("span");
    if (text) text.textContent = message;
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
    if (operation.type === "tile.set") return `tile:${operation.key}`;
    if (operation.type === "list.set") return `list:${operation.list}`;
    return `entity:${operation.entity}:${operation.id}`;
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

  function recordActivity(message, remoteName = "") {
    activity.unshift(`${remoteName ? `${remoteName}: ` : ""}${message}`);
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
    if (undoButton) undoButton.disabled = !undoStack.length;
    if (redoButton) redoButton.disabled = !redoStack.length;
  }

  function pushHistory(forward, inverse, label) {
    if (!forward || !inverse) return;
    undoStack.push({ forward: clone(forward), inverse: clone(inverse), label });
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    updateHistoryButtons();
  }

  function queueOperation(operation, { applyData = true, applyBridge = false } = {}) {
    if (applyData) applyDataOperation(operation);
    if (applyBridge) applyBridgeOperation(operation);
    if (pendingBaseRevision == null) pendingBaseRevision = revision;
    pendingOperations.set(operationKey(operation), clone(operation));
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flushOperations, 180);
    setSaveStatus("dirty", "Cambios pendientes de sincronizar…");
  }

  async function fetchSnapshot() {
    const response = await fetch(apiUrl("/api/dev/map-editor"), { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
    return result;
  }

  function applySnapshot(snapshot, { preservePending = false } = {}) {
    const pending = preservePending ? [...pendingOperations.values()].map(clone) : [];
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
    setSaveStatus("error", "Conflicto: otra persona editó lo mismo. Se conserva la versión del servidor.");
    recordActivity(`conflicto en ${(result.conflicts || []).join(", ") || "una entidad"}`);
    applySnapshot(await fetchSnapshot(), { preservePending: pendingOperations.size > 0 });
    pendingBaseRevision = pendingOperations.size ? revision : null;
  }

  async function flushOperations() {
    window.clearTimeout(flushTimer);
    flushTimer = 0;
    if (!enabled || !pendingOperations.size) return;
    if (sending) { flushTimer = window.setTimeout(flushOperations, 120); return; }
    sending = true;
    const entries = [...pendingOperations.entries()].slice(0, 240);
    entries.forEach(([key]) => pendingOperations.delete(key));
    const operations = entries.map(([, operation]) => operation);
    const baseRevision = pendingBaseRevision ?? revision;
    pendingBaseRevision = pendingOperations.size ? baseRevision : null;
    setSaveStatus("saving", `Sincronizando ${operations.length} cambio${operations.length === 1 ? "" : "s"}…`);
    try {
      const response = await fetch(apiUrl("/api/dev/map-editor/operations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, name: editorName, baseRevision, operations, editorToken: token || undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) { await resyncAfterConflict(result); return; }
      if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
      setRevision(result.revision);
      if (pendingOperations.size && pendingBaseRevision === baseRevision) pendingBaseRevision = revision;
      const counts = result.counts || {};
      setSaveStatus(pendingOperations.size ? "dirty" : "saved",
        pendingOperations.size ? "Hay cambios nuevos pendientes…"
          : `Guardado · ${counts.tiles ?? 0} casillas · ${counts.objects ?? 0} objetos · ${counts.npcs ?? 0} NPC · ${counts.entrances ?? 0} entradas · ${counts.events ?? 0} eventos`);
    } catch (error) {
      entries.forEach(([key, operation]) => { if (!pendingOperations.has(key)) pendingOperations.set(key, operation); });
      pendingBaseRevision = pendingBaseRevision == null ? baseRevision : Math.min(pendingBaseRevision, baseRevision);
      setSaveStatus("error", `Sin conexión: ${error.message}. Se reintentará.`);
      flushTimer = window.setTimeout(flushOperations, 1600);
    } finally {
      sending = false;
      if (pendingOperations.size && !flushTimer) flushTimer = window.setTimeout(flushOperations, 120);
    }
  }

  function applyRemoteOperations(payload) {
    setRevision(payload.revision);
    if (payload.actorId === actorId) return;
    (payload.operations || []).forEach((operation) => {
      applyDataOperation(operation);
      applyBridgeOperation(operation);
      recordActivity(describeOperation(operation), payload.name || "Otro editor");
    });
    renderSelection();
  }

  function renderPresence(users = collaborators) {
    collaborators = Array.isArray(users) ? users : [];
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
    const url = apiUrl("/api/dev/map-editor/events");
    url.searchParams.set("actorId", actorId);
    url.searchParams.set("name", editorName);
    url.searchParams.set("color", color);
    url.searchParams.set("mode", mode);
    eventSource = new EventSource(url);
    eventSource.onopen = () => setConnection("online", "En directo");
    eventSource.onerror = () => {
      if (!pollingOnline) setConnection("reconnecting", "Reconectando…");
    };
    eventSource.addEventListener("snapshot", (event) => {
      const snapshot = JSON.parse(event.data);
      applySnapshot(snapshot, { preservePending: pendingOperations.size > 0 });
      setConnection("online", "En directo");
    });
    eventSource.addEventListener("operations", (event) => applyRemoteOperations(JSON.parse(event.data)));
    eventSource.addEventListener("presence", (event) => renderPresence(JSON.parse(event.data).users));
  }

  async function publishPresence(cursor = presenceCursor) {
    if (presenceRequestInFlight) return;
    presenceRequestInFlight = true;
    try {
      const response = await fetch(apiUrl("/api/dev/map-editor/presence"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorId, name: editorName, color, cursor, mode,
          selection: selected ? { entity: selected.kind, id: selected.id } : null,
          player: bridge.playerPresence?.() || null,
          editorToken: token || undefined,
        }),
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
    window.clearTimeout(presenceTimer);
    presenceTimer = window.setTimeout(async () => {
      if (!enabled) return;
      try {
        await publishPresence(presenceCursor);
      } catch { /* EventSource reconnection exposes the connection state. */ }
    }, 90);
  }

  function startPresenceHeartbeat() {
    window.clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = window.setInterval(() => {
      if (!enabled) return;
      void publishPresence().catch(() => {});
    }, 160);
  }

  async function pollRemoteState() {
    window.clearTimeout(snapshotPollTimer);
    snapshotPollTimer = 0;
    if (!enabled) return;
    try {
      const snapshot = await fetchSnapshot();
      const normalizedSnapshot = normalizeData(snapshot.data || snapshot);
      const snapshotDiffers = JSON.stringify(normalizedSnapshot) !== JSON.stringify(data);
      if (Number(snapshot.revision) > revision || (Number(snapshot.revision) === revision && snapshotDiffers)) {
        applySnapshot(snapshot, { preservePending: pendingOperations.size > 0 });
      }
      await publishPresence();
      pollingOnline = true;
      if (eventSource?.readyState !== EventSource.OPEN) setConnection("online", "En directo");
    } catch {
      pollingOnline = false;
      if (eventSource?.readyState !== EventSource.OPEN) setConnection("reconnecting", "Reconectando…");
    } finally {
      if (enabled) snapshotPollTimer = window.setTimeout(pollRemoteState, 1200);
    }
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
    if (asset.label) record.label = String(asset.label).slice(0, 80);
    if (added) { record.id = asset.id; record.sprite = asset.sprite; }
    return record;
  }

  function npcRecord(npc) {
    const record = {
      id: npc.id, col: Math.floor(Number(npc.col)), row: Math.floor(Number(npc.row)),
      direction: npc.direction || "down", name: String(npc.name || "NPC").slice(0, 80),
      sprite: npc.sprite || "guide", lines: (npc.lines || []).map(String).filter(Boolean).slice(0, 12),
    };
    if (npc.patrol?.to) record.patrol = { to: npc.patrol.to.map(Number), tilesPerSecond: Number(npc.patrol.tilesPerSecond) || .75 };
    return record;
  }

  function cleanEntityRecord(kind, entity) {
    if (kind === "asset") return assetRecord(entity, entityCollection(kind, entity.id) === "addedAssets");
    if (kind === "npc") return npcRecord(entity);
    return clone(entity);
  }

  function setSelected(kind, id) {
    selected = kind && id ? { kind, id } : null;
    bridge.selectEntity?.(kind, id);
    renderSelection();
    sendPresence();
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
  }

  function renderNpcSelection(npc) {
    $("#npcInspector").disabled = !npc;
    if (!npc) { setInfo("#npcSelectionInfo", "Selecciona un NPC", "Haz clic en el mapa"); return; }
    setInfo("#npcSelectionInfo", npc.name || npc.id, `C${npc.col} · F${npc.row} · ${npc.sprite}`);
    npcInputs.col.value = npc.col; npcInputs.row.value = npc.row; npcInputs.name.value = npc.name || "";
    npcInputs.sprite.value = npc.sprite || "guide"; npcInputs.direction.value = npc.direction || "down";
    npcInputs.lines.value = (npc.lines || []).join("\n"); npcInputs.patrol.checked = Boolean(npc.patrol);
    $("#npcPatrolFields").classList.toggle("hidden", !npc.patrol);
    npcInputs.patrolCol.value = npc.patrol?.to?.[0] ?? npc.col;
    npcInputs.patrolRow.value = npc.patrol?.to?.[1] ?? npc.row;
    npcInputs.patrolSpeed.value = npc.patrol?.tilesPerSecond ?? .75;
    $("#deleteNpcButton").textContent = entityCollection("npc", npc.id) === "addedNpcs" ? "Eliminar" : "Ocultar";
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
  }

  function validateEntrance(entrance) {
    const output = $("#entranceValidation"); if (!output) return;
    if (entrance.action === "transition" && !entrance.targetMap) output.textContent = "Indica el mapa de destino.";
    else if (entrance.action === "transition" && (!Number.isFinite(Number(entrance.targetX)) || !Number.isFinite(Number(entrance.targetY)))) output.textContent = "Indica X e Y de destino.";
    else output.textContent = entrance.targetMap && !["san-pablo", "city", "current"].includes(String(entrance.targetMap).toLowerCase())
      ? "Destino preparado: se activará cuando ese mapa se registre." : "Entrada válida.";
  }

  function validateEvent(event) {
    const output = $("#eventValidation"); if (!output) return;
    if (["teleport", "transition"].includes(event.type) && (!Number.isFinite(Number(event.targetX)) || !Number.isFinite(Number(event.targetY)))) output.textContent = "El traslado necesita X e Y de destino.";
    else if (["dialogue", "thought"].includes(event.type) && !String(event.message || "").trim()) output.textContent = "Añade un mensaje.";
    else output.textContent = event.enabled === false ? "Evento desactivado." : "Evento válido.";
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
    if (selected?.kind !== ({ objects: "asset", npcs: "npc", entrances: "entrance", events: "event" }[mode])) setSelected(null, null);
    sendPresence();
  }

  function snap(value) {
    const step = Math.max(1, Number(snapSelect?.value) || 1);
    return Math.round(Number(value) / step) * step;
  }

  function uniqueId(prefix) {
    return `${prefix}-${actorId.slice(-6)}-${randomIdentifier().slice(0, 8)}`.slice(0, 80);
  }

  function entitySetOperation(kind, entity) {
    const collection = entityCollection(kind, entity.id);
    return { type: "entity.set", entity: kind, collection, id: entity.id, value: cleanEntityRecord(kind, entity) };
  }

  function upsertLocalEntity(kind, next, { historyBefore = null, label = "Editar entidad" } = {}) {
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
    const duplicate = clone(entity); duplicate.id = uniqueId(selected.kind); duplicate.col = clamp(Number(duplicate.col) + 1, 0, 78); duplicate.row = clamp(Number(duplicate.row) + 1, 0, 78);
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

  function assetAtPoint(point) {
    return bridge.assets().filter((asset) => point.x >= asset.x - asset.w / 2 && point.x <= asset.x + asset.w / 2
      && point.y >= asset.y - asset.h && point.y <= asset.y)
      .sort((a, b) => Number(b.depthY ?? b.y) - Number(a.depthY ?? a.y))[0] || null;
  }

  function gridEntityAtPoint(kind, point) {
    const size = bridge.grid().tileSize; const col = Math.floor(point.x / size); const row = Math.floor(point.y / size);
    return (bridge.entities?.(kind) || []).filter((entity) => entity.enabled !== false && entity.col === col && entity.row === row).at(-1) || null;
  }

  function paintAtEvent(event) {
    const point = bridge.canvasToWorld(event.clientX, event.clientY); const grid = bridge.grid();
    const centerCol = Math.floor(point.x / grid.tileSize); const centerRow = Math.floor(point.y / grid.tileSize);
    const brushSize = Math.max(1, Number($("#terrainBrushSize")?.value) || 1); const radius = Math.floor(brushSize / 2);
    const strokeKey = `${centerCol},${centerRow}:${terrainType}:${brushSize}`; if (strokeKey === lastPaintedTile) return;
    lastPaintedTile = strokeKey;
    for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
      for (let col = centerCol - radius; col <= centerCol + radius; col += 1) {
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
        const key = `${col},${row}`; const before = data.tileOverrides[key] ?? null;
        const value = terrainType === "inherit" ? null : terrainType;
        if (before === value) continue;
        bridge.setTile(col, row, terrainType);
        const forward = { type: "tile.set", key, value };
        queueOperation(forward);
        pushHistory(forward, { type: "tile.set", key, value: before }, "Pintar terreno");
      }
    }
  }

  function onPointerDown(event) {
    if (!enabled || !bridge.isOpen() || event.button !== 0) return;
    const point = bridge.canvasToWorld(event.clientX, event.clientY);
    if (mode === "terrain") {
      event.preventDefault(); lastPaintedTile = ""; drag = { type: "terrain", pointerId: event.pointerId }; paintAtEvent(event);
    } else if (mode === "objects") {
      event.preventDefault(); const asset = assetAtPoint(point); setSelected(asset ? "asset" : null, asset?.id || null);
      drag = asset ? { type: "entity", kind: "asset", pointerId: event.pointerId, offsetX: point.x - asset.x, offsetY: point.y - asset.y, before: clone(asset) } : null;
    } else {
      const kind = { npcs: "npc", entrances: "entrance", events: "event" }[mode];
      const entity = gridEntityAtPoint(kind, point); setSelected(entity ? kind : null, entity?.id || null);
      if (entity) { event.preventDefault(); drag = { type: "entity", kind, pointerId: event.pointerId, before: clone(entity) }; }
    }
    if (drag) canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (enabled && bridge.isOpen()) {
      const cursor = bridge.canvasToWorld(event.clientX, event.clientY);
      sendPresence({ x: Math.round(cursor.x), y: Math.round(cursor.y) });
    }
    if (!drag || drag.pointerId !== event.pointerId || !bridge.isOpen()) return;
    event.preventDefault();
    if (drag.type === "terrain") { paintAtEvent(event); return; }
    const entity = selectedEntity(); if (!entity) return;
    const point = bridge.canvasToWorld(event.clientX, event.clientY);
    if (drag.kind === "asset") {
      upsertLocalEntity("asset", { ...entity, x: snap(point.x - drag.offsetX), y: snap(point.y - drag.offsetY) });
    } else {
      const grid = bridge.grid();
      upsertLocalEntity(drag.kind, { ...entity, col: clamp(Math.floor(point.x / grid.tileSize), 0, grid.cols - 1), row: clamp(Math.floor(point.y / grid.tileSize), 0, grid.rows - 1) });
    }
  }

  function endPointer(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag; drag = null; lastPaintedTile = ""; canvas.releasePointerCapture?.(event.pointerId);
    if (finished.type === "entity") {
      const entity = selectedEntity();
      if (entity && JSON.stringify(cleanEntityRecord(finished.kind, entity)) !== JSON.stringify(cleanEntityRecord(finished.kind, finished.before))) {
        pushHistory(entitySetOperation(finished.kind, entity), {
          type: "entity.set", entity: finished.kind, collection: entityCollection(finished.kind, entity.id), id: entity.id,
          value: cleanEntityRecord(finished.kind, finished.before),
        }, `Mover ${finished.kind}`);
      }
    }
  }

  function applyHistoryOperation(operation) {
    applyDataOperation(operation); applyBridgeOperation(operation);
    queueOperation(operation, { applyData: false }); renderSelection();
  }

  function undo() {
    const entry = undoStack.pop(); if (!entry) return;
    applyHistoryOperation(entry.inverse); redoStack.push(entry); updateHistoryButtons(); recordActivity(`deshacer: ${entry.label}`);
  }

  function redo() {
    const entry = redoStack.pop(); if (!entry) return;
    applyHistoryOperation(entry.forward); undoStack.push(entry); updateHistoryButtons(); recordActivity(`rehacer: ${entry.label}`);
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
  }

  function populateNpcSprites() {
    const sprites = new Set(["guide", "nino-polo", "nina-turquesa", "campesino", "hortelano"]);
    (bridge.entities?.("npc") || []).forEach((npc) => sprites.add(npc.sprite));
    for (let index = 1; index <= 30; index += 1) {
      const current = (bridge.entities?.("npc") || []).find((npc) => String(npc.sprite).startsWith(`npc-${String(index).padStart(2, "0")}-`));
      if (current) sprites.add(current.sprite);
    }
    npcInputs.sprite.replaceChildren(...[...sprites].filter(Boolean).sort().map((sprite) => {
      const option = document.createElement("option"); option.value = sprite; option.textContent = sprite; return option;
    }));
  }

  function bindInspectorInputs() {
    const assetBindings = [["label", "label"], ["x", "x"], ["y", "y"], ["scale", "scale"], ["depthY", "depthY"], ["rotation", "rotation"]];
    assetBindings.forEach(([inputKey, property]) => assetInputs[inputKey].addEventListener("change", () => {
      if (!selectedEntity()) return; const value = property === "label" ? assetInputs[inputKey].value : Number(assetInputs[inputKey].value);
      updateSelected({ [property]: value }, `Cambiar ${property}`);
    }));
    assetInputs.solid.addEventListener("change", () => updateSelected({ solid: assetInputs.solid.checked }, "Cambiar colisión"));

    const readNpc = () => {
      const npc = selectedEntity(); if (!npc || selected?.kind !== "npc") return null;
      const next = { ...npc, col: Number(npcInputs.col.value), row: Number(npcInputs.row.value), name: npcInputs.name.value, sprite: npcInputs.sprite.value, direction: npcInputs.direction.value, lines: npcInputs.lines.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) };
      if (npcInputs.patrol.checked) next.patrol = { to: [Number(npcInputs.patrolCol.value), Number(npcInputs.patrolRow.value)], tilesPerSecond: Number(npcInputs.patrolSpeed.value) || .75 };
      else delete next.patrol;
      return next;
    };
    Object.values(npcInputs).forEach((input) => input.addEventListener("change", () => {
      $("#npcPatrolFields").classList.toggle("hidden", !npcInputs.patrol.checked);
      const next = readNpc(); if (next) upsertLocalEntity("npc", next, { historyBefore: selectedEntity(), label: "Editar NPC" });
    }));

    const readEntrance = () => {
      const entrance = selectedEntity(); if (!entrance || selected?.kind !== "entrance") return null;
      return { ...entrance, col: Number(entranceInputs.col.value), row: Number(entranceInputs.row.value), label: entranceInputs.label.value, action: entranceInputs.action.value, targetMap: entranceInputs.targetMap.value, targetX: entranceInputs.targetX.value === "" ? null : Number(entranceInputs.targetX.value), targetY: entranceInputs.targetY.value === "" ? null : Number(entranceInputs.targetY.value), targetDirection: entranceInputs.targetDirection.value, effect: entranceInputs.effect.value, linkedAssetId: entranceInputs.linkedAssetId.value || null, enabled: true };
    };
    Object.values(entranceInputs).forEach((input) => input.addEventListener("change", () => {
      const next = readEntrance(); if (next) upsertLocalEntity("entrance", next, { historyBefore: selectedEntity(), label: "Editar entrada" });
    }));

    const readEvent = () => {
      const event = selectedEntity(); if (!event || selected?.kind !== "event") return null;
      return { ...event, col: Number(eventInputs.col.value), row: Number(eventInputs.row.value), type: eventInputs.type.value, trigger: eventInputs.trigger.value, message: eventInputs.message.value, targetMap: eventInputs.targetMap.value || null, targetX: eventInputs.targetX.value === "" ? null : Number(eventInputs.targetX.value), targetY: eventInputs.targetY.value === "" ? null : Number(eventInputs.targetY.value), targetDirection: eventInputs.targetDirection.value, effect: eventInputs.effect.value, duration: Number(eventInputs.duration.value) || 440, intensity: Number(eventInputs.intensity.value) || 1, once: eventInputs.once.checked, enabled: eventInputs.enabled.checked };
    };
    Object.values(eventInputs).forEach((input) => input.addEventListener("change", () => {
      updateEventFieldVisibility(eventInputs.type.value);
      const next = readEvent(); if (next) upsertLocalEntity("event", next, { historyBefore: selectedEntity(), label: "Editar evento" });
    }));
  }

  function bindUi() {
    if (bound) return; bound = true;
    nameInput.value = editorName;
    nameInput.addEventListener("change", () => {
      editorName = nameInput.value.trim().slice(0, 32) || `Editor ${actorId.slice(-4).toUpperCase()}`;
      nameInput.value = editorName; persistentStorage?.setItem("pokemon-map-editor-name", editorName); sendPresence();
    });
    $("#copyEditorInviteButton").addEventListener("click", async () => {
      const value = inviteUrl || window.location.href;
      try { await navigator.clipboard.writeText(value); setConnection("online", "Enlace copiado"); }
      catch { window.prompt("Copia este enlace de colaboración:", value); }
    });
    $$('[data-editor-mode]').forEach((button) => button.addEventListener("click", () => setMode(button.dataset.editorMode)));
    $$('[data-tile-type]').forEach((button) => button.addEventListener("click", () => {
      terrainType = button.dataset.tileType;
      $$('[data-tile-type]').forEach((entry) => entry.classList.toggle("selected", entry === button));
    }));
    $("#addAssetButton").addEventListener("click", () => addAsset());
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
    bindInspectorInputs();
    canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer); canvas.addEventListener("pointercancel", endPointer);
    document.addEventListener("keydown", (event) => {
      if (!enabled) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); flushOperations(); return; }
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || ""); if (typing) return;
      if (event.key.toLowerCase() === "g" && !event.repeat) { event.preventDefault(); bridge.isOpen() ? bridge.close() : bridge.open(); return; }
      if (!bridge.isOpen() || !selected) return;
      if (modifier && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); return; }
      if (event.key === "Delete") { event.preventDefault(); deleteSelected(); return; }
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key]; if (!direction) return;
      event.preventDefault(); const entity = selectedEntity(); if (!entity) return;
      if (selected.kind === "asset") { const amount = event.shiftKey ? 32 : 1; updateSelected({ x: entity.x + direction[0] * amount, y: entity.y + direction[1] * amount }, "Mover objeto"); }
      else updateSelected({ col: clamp(entity.col + direction[0], 0, 78), row: clamp(entity.row + direction[1], 0, 78) }, `Mover ${selected.kind}`);
    });
    window.addEventListener("pagehide", () => {
      eventSource?.close();
      window.clearInterval(presenceHeartbeatTimer);
      window.clearTimeout(snapshotPollTimer);
      if (pendingOperations.size) void flushOperations();
    });
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
    state: () => ({ enabled, connected: eventSource?.readyState === EventSource.OPEN || pollingOnline, mode, revision, pending: pendingOperations.size, actorId, selected: clone(selected), data: clone(data), collaborators: clone(collaborators) }),
  };
  window.PokemonMapEditor = Object.freeze(publicApi);

  async function connect() {
    try {
      const result = await fetchSnapshot();
      if (!result.enabled) throw new Error("Editor desactivado");
      enabled = true;
      inviteUrl = new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)
        ? result.collaboration?.inviteUrl || window.location.href
        : window.location.href;
      setRevision(result.revision);
      bridge.enable(); populatePrototypes(); populateNpcSprites(); bindUi(); applySnapshot(result); setMode("objects"); openEventStream(); startPresenceHeartbeat(); void pollRemoteState();
      setSaveStatus("saved", `Conectado · los cambios se escriben en ${result.file}`);
    } catch (error) {
      enabled = false; bridge.disable(); setConnection("offline", "Solo disponible en desarrollo");
    }
  }

  connect();
})();
