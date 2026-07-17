(function exposeCiudadAzaharCompileConfig(root) {
  "use strict";
  const layout = root.CIUDAD_AZAHAR_MAP_LAYOUT || root.MAP_LAYOUT;
  root.MAP_CONFIG = {
    id: "ciudad-azahar",
    width: 2560,
    height: 2304,
    tileSize: 32,
    entrances: [],
    worldAssets: layout?.worldAssets || [],
    blockedProbes: [
      [350, 496, "fachada del Centro de Salud"],
      [1280, 892, "fachada de la Casa Consistorial"],
      [1280, 1258, "vaso de la fuente"],
      [384, 798, "zócalo residencial oeste norte"],
      [384, 1618, "zócalo residencial oeste sur"],
      [2032, 880, "valla oeste del campo"],
      [2208, 720, "valla norte del campo"],
      [1080, 1300, "banco occidental de la plaza"],
      [72, 104, "tronco del borde norte"],
      [706, 1038, "farola de la ronda"],
    ],
  };
})(globalThis);

