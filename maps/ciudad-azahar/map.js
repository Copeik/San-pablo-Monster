(function registerCiudadAzahar(root) {
  "use strict";

  const layout = root.CIUDAD_AZAHAR_MAP_LAYOUT;
  if (!layout) throw new Error("Ciudad Azahar necesita maps/ciudad-azahar/layout.js.");
  const editorData = root.CITY_MAP_EDITOR_DATA;
  const { width, height, tileSize } = layout;
  const textureScale = 2;
  const chunkSize = 512;
  const tileColumns = Math.ceil(width / chunkSize);
  const tileRows = Math.ceil(height / chunkSize);
  const tiles = [];
  for (let row = 0; row < tileRows; row += 1) {
    for (let col = 0; col < tileColumns; col += 1) {
      const x = col * chunkSize;
      const y = row * chunkSize;
      tiles.push(Object.freeze({
        id: `r${row}-c${col}`,
        col, row, x, y,
        w: Math.min(chunkSize, width - x),
        h: Math.min(chunkSize, height - y),
        image: `assets/maps/ciudad-azahar-chunks-2x/ciudad-azahar-r${row}-c${col}.webp`,
      }));
    }
  }

  const assetSprites = Object.freeze(Object.fromEntries(
    Object.entries(layout.assetCatalog).map(([id, prototype]) => [id, prototype.src]),
  ));
  const segmentFromFeature = (feature) => {
    const points = feature.points || [];
    const first = points[0];
    const last = points[points.length - 1];
    const widthWithEdges = Number(feature.width)
      + (Number(feature.sidewalkWidth) || 0) * 2
      + (Number(feature.curbWidth) || 0) * 2;
    return Object.freeze([first[0], first[1], last[0], last[1], widthWithEdges]);
  };
  const walkableSegments = Object.freeze([
    ...layout.roads.filter((road) => road.walkable !== false).map(segmentFromFeature),
    ...layout.paths.filter((path) => path.walkable !== false).map(segmentFromFeature),
  ]);

  const encounterTiles = [];
  layout.encounterAreas.forEach((area) => {
    const minCol = Math.ceil(area.x / tileSize);
    const maxCol = Math.floor((area.x + area.w) / tileSize) - 1;
    const minRow = Math.ceil(area.y / tileSize);
    const maxRow = Math.floor((area.y + area.h) / tileSize) - 1;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) encounterTiles.push(Object.freeze([col, row]));
    }
  });

  const blockedProbes = Object.freeze([
    Object.freeze([350, 496, "fachada del Centro de Salud"]),
    Object.freeze([1280, 892, "fachada de la Casa Consistorial"]),
    Object.freeze([1280, 1258, "vaso de la fuente"]),
    Object.freeze([384, 798, "zócalo residencial oeste norte"]),
    Object.freeze([384, 1618, "zócalo residencial oeste sur"]),
    Object.freeze([2032, 880, "valla oeste del campo"]),
    Object.freeze([2208, 720, "valla norte del campo"]),
    Object.freeze([1080, 1300, "banco occidental de la plaza"]),
    Object.freeze([72, 104, "tronco del borde norte"]),
    Object.freeze([706, 1038, "farola de la ronda"]),
  ]);
  const openProbes = Object.freeze([
    Object.freeze([1280, 2128, "aparición del protagonista"]),
    Object.freeze([1280, 608, "ronda norte"]),
    Object.freeze([640, 1152, "ronda oeste"]),
    Object.freeze([1920, 1152, "ronda este"]),
    Object.freeze([1120, 1280, "lado oeste de la fuente"]),
    Object.freeze([1440, 1280, "lado este de la fuente"]),
    Object.freeze([2208, 1072, "puerta del campo"]),
    Object.freeze([2208, 900, "interior del campo"]),
    Object.freeze([600, 1990, "paseo del parque sur"]),
    Object.freeze([1900, 2050, "plaza comercial sureste"]),
  ]);

  const config = Object.freeze({
    id: "ciudad-azahar",
    name: "Ciudad Azahar",
    kind: "city",
    revision: 1,
    previewImage: "assets/maps/ciudad-azahar-preview.webp",
    navigationMask: Object.freeze({
      image: "assets/maps/ciudad-azahar-navigation.png",
      cellSize: layout.navigationCellSize,
      revision: layout.revision,
    }),
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    sourceWidth: width * textureScale,
    sourceHeight: height * textureScale,
    textureScale,
    tileColumns,
    tileRows,
    chunkSize,
    chunkGutter: 2,
    memoryBudgetMB: 80,
    prefetchLimit: 2,
    prefetchSeconds: 0.65,
    prefetchMargin: 64,
    unloadMargin: 160,
    unloadDelayMs: 500,
    tiles: Object.freeze(tiles),
    tileSize,
    defaultTile: "blocked",
    spawn: Object.freeze({ x: 1280, y: 2128, direction: "up" }),
    assetSprites,
    assetRevision: 1,
    worldAssets: layout.worldAssets,
    editorVacatedRects: Object.freeze([]),
    sections: layout.sections,
    extensionSurfaces: Object.freeze([]),
    buildingFootprints: layout.buildingFootprints,
    barrierSegments: layout.barrierSegments,
    blockedRects: Object.freeze([]),
    walkableRects: Object.freeze([
      Object.freeze([22, 21, 57, 50]),
      Object.freeze([5, 14, 16, 19]),
      Object.freeze([32, 14, 47, 19]),
      Object.freeze([61, 7, 75, 19]),
      Object.freeze([63, 22, 74, 33]),
      Object.freeze([4, 55, 33, 68]),
      Object.freeze([54, 54, 76, 68]),
    ]),
    walkableSegments,
    encounterAreas: layout.encounterAreas,
    encounterTiles: Object.freeze(encounterTiles),
    encounterRects: Object.freeze([]),
    encounterGrass: Object.freeze({
      image: "assets/generated/san-pablo-rebuilt/runtime/grass-tall-spritesheet.png",
      frameSize: 64,
      frames: 4,
      drawWidth: 44,
      drawHeight: 48,
      frontCropY: 31,
      revision: 2,
    }),
    entrances: Object.freeze([]),
    npcs: Object.freeze([
      Object.freeze({
        id: "jardinera-azahar", col: 66, row: 14, direction: "down", solid: false,
        name: "Jardinera Alba", sprite: "npc-13-gardener",
        lines: Object.freeze(["Los dos claros del naranjal están separados por un paseo ancho.", "Hasta las farolas están fuera de la zona de paso."]),
      }),
      Object.freeze({
        id: "deportista-azahar", col: 69, row: 30, direction: "up", solid: false,
        name: "Leo", sprite: "npc-11-athlete",
        lines: Object.freeze(["La puerta sur del campo queda siempre libre.", "Puedes cruzar de la ronda al césped sin rozar la valla."]),
      }),
      Object.freeze({
        id: "vecina-plaza", col: 47, row: 44, direction: "left", solid: false,
        name: "Mara", sprite: "npc-04-grandmother",
        lines: Object.freeze(["La fuente es el corazón de Ciudad Azahar.", "La ronda conecta todos los barrios sin callejones estrechos."]),
      }),
    ]),
    events: Object.freeze([
      Object.freeze({
        id: "ciudad-azahar-welcome", col: 40, row: 66, type: "thought", trigger: "step",
        message: "Ciudad Azahar se abre ante mí: la ronda, la plaza y el paseo de los cerezos.",
        once: true, enabled: true,
      }),
    ]),
    encounters: Object.freeze([
      Object.freeze({ id: 9808, weight: 30 }),
      Object.freeze({ id: 9701, weight: 24 }),
      Object.freeze({ id: 9601, weight: 20 }),
      Object.freeze({ id: 9001, weight: 16 }),
      Object.freeze({ id: 9809, weight: 10 }),
    ]),
    worldObjects: Object.freeze([]),
    pointsOfInterest: Object.freeze([]),
    field: Object.freeze({ x: 2208, y: 878, w: 352, h: 316, a: 0 }),
    blockedProbes,
    openProbes,
  });

  root.CIUDAD_AZAHAR_MAP_CONFIG = config;
  root.GAME_MAP_REGISTRY.register("ciudad-azahar", {
    name: config.name,
    aliases: ["azahar", "ciudad_azahar"],
    config,
    layout,
    editorData,
    editorDataPath: "maps/ciudad-azahar/editor-data.js",
  });
})(globalThis);
