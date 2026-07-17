(function installGameMapRegistry(root) {
  "use strict";

  if (root.GAME_MAP_REGISTRY?.version === 1) return;

  const maps = new Map();
  const aliases = new Map();
  const normalizeId = (value) => String(value || "").trim().toLowerCase().replace(/_/g, "-");

  function register(id, definition) {
    const mapId = normalizeId(id);
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(mapId)) throw new Error(`ID de mapa no valido: ${id}`);
    if (!definition?.config || typeof definition.config !== "object") throw new Error(`El mapa ${mapId} no tiene config.`);
    const record = Object.freeze({
      id: mapId,
      name: definition.name || definition.config.name || mapId,
      config: definition.config,
      layout: definition.layout || {},
      editorData: definition.editorData || {},
      editorDataPath: definition.editorDataPath || "",
      aliases: Object.freeze((definition.aliases || []).map(normalizeId).filter(Boolean)),
    });
    maps.set(mapId, record);
    aliases.set(mapId, mapId);
    record.aliases.forEach((alias) => aliases.set(alias, mapId));
    return record;
  }

  function resolve(value, currentId = root.ACTIVE_GAME_MAP_ID) {
    const requested = normalizeId(value);
    if (!requested || requested === "current") return normalizeId(currentId) || "san-pablo";
    return aliases.get(requested) || requested;
  }

  function get(value, currentId) {
    return maps.get(resolve(value, currentId)) || null;
  }

  function activate(value) {
    const record = get(value) || maps.get("san-pablo") || maps.values().next().value;
    if (!record) throw new Error("No hay mapas registrados.");
    root.ACTIVE_GAME_MAP_ID = record.id;
    root.ACTIVE_GAME_MAP = record;
    root.CITY_MAP_CONFIG = record.config;
    root.CITY_MAP_LAYOUT = record.layout;
    root.CITY_MAP_EDITOR_DATA = record.editorData;
    return record;
  }

  root.GAME_MAP_REGISTRY = Object.freeze({
    version: 1,
    defaultMapId: "san-pablo",
    normalizeId,
    register,
    resolve,
    get,
    has: (value) => Boolean(get(value)),
    list: () => [...maps.values()],
    activate,
  });
})(globalThis);
