(function selectInitialGameMap(root) {
  "use strict";

  const registry = root.GAME_MAP_REGISTRY;
  const params = new URLSearchParams(root.location?.search || "");
  let savedMapId = "";
  try {
    const saved = JSON.parse(root.localStorage?.getItem("pokemon-city-save-v3") || "null");
    savedMapId = saved?.mapId || "";
  } catch { /* Una partida corrupta se trata como si no existiera. */ }
  const requested = params.get("map") || savedMapId || registry.defaultMapId;
  const active = registry.activate(requested);
  document.documentElement.dataset.activeMap = active.id;
  document.documentElement.dataset.registeredMaps = registry.list().map((map) => map.id).join(",");
  const options = document.querySelector("#mapEditorMapOptions");
  if (options) {
    options.replaceChildren(...registry.list().map((map) => {
      const option = document.createElement("option");
      option.value = map.id;
      option.label = map.name;
      return option;
    }), ...["current", "city"].map((id) => {
      const option = document.createElement("option"); option.value = id; return option;
    }));
  }
  const mapSelect = document.querySelector("#mapEditorMapSelect");
  if (mapSelect) {
    mapSelect.replaceChildren(...registry.list().map((map) => {
      const option = document.createElement("option");
      option.value = map.id;
      option.textContent = map.name;
      option.selected = map.id === active.id;
      return option;
    }));
  }
})(globalThis);
