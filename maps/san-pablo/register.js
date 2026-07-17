(function registerSanPablo(root) {
  "use strict";

  root.GAME_MAP_REGISTRY.register("san-pablo", {
    name: "San Pablo",
    aliases: ["city", "san_pablo"],
    config: root.CITY_MAP_CONFIG,
    layout: root.CITY_MAP_LAYOUT,
    editorData: root.CITY_MAP_EDITOR_DATA,
    editorDataPath: "map-editor-data.js",
  });
})(globalThis);
