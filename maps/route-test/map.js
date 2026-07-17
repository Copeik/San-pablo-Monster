(function registerRouteTest(root) {
  "use strict";

  const tileSize = 32;
  const width = 640;
  const height = 640;
  const sharedCatalog = root.GAME_MAP_REGISTRY.get("san-pablo")?.layout?.assetCatalog || Object.freeze({});
  const sharedSprites = Object.freeze(Object.fromEntries(
    Object.entries(sharedCatalog).map(([id, prototype]) => [id, prototype.src]),
  ));
  const encounterTiles = [];
  for (let row = 4; row <= 8; row += 1) {
    for (let col = 2; col <= 7; col += 1) encounterTiles.push(Object.freeze([col, row]));
  }

  const layout = Object.freeze({
    revision: 1,
    width,
    height,
    tileSize,
    navigationCellSize: 8,
    assetCatalog: sharedCatalog,
    worldAssets: Object.freeze([]),
    roads: Object.freeze([]),
    paths: Object.freeze([]),
    surfaceRects: Object.freeze([]),
    surfacePolygons: Object.freeze([]),
    encounterAreas: Object.freeze([
      Object.freeze({ id: "orange-grove-grass", name: "Hierba del naranjal", x: 64, y: 128, w: 192, h: 160, surface: "grass", walkable: true, encounter: true }),
    ]),
    blockedRects: Object.freeze([]),
    sections: Object.freeze([
      Object.freeze({ id: "route-test", name: "Senda de los Naranjos", x: 0, y: 0, w: width, h: height }),
    ]),
  });

  const config = Object.freeze({
    id: "route-test",
    name: "Senda de los Naranjos",
    kind: "route",
    revision: 1,
    previewImage: "maps/route-test/base.svg",
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    sourceWidth: width,
    sourceHeight: height,
    textureScale: 1,
    tileColumns: 1,
    tileRows: 1,
    chunkSize: 640,
    chunkGutter: 0,
    memoryBudgetMB: 16,
    prefetchLimit: 0,
    tiles: Object.freeze([
      Object.freeze({ id: "r0-c0", col: 0, row: 0, x: 0, y: 0, w: width, h: height, image: "maps/route-test/base.svg" }),
    ]),
    tileSize,
    defaultTile: "blocked",
    spawn: Object.freeze({ x: 336, y: 560, direction: "down" }),
    assetSprites: sharedSprites,
    assetRevision: 1,
    worldAssets: Object.freeze([]),
    editorVacatedRects: Object.freeze([]),
    sections: layout.sections,
    extensionSurfaces: Object.freeze([]),
    blockedRects: Object.freeze([
      Object.freeze([8, 6, 11, 8]),
      Object.freeze([14, 3, 16, 5]),
    ]),
    walkableRects: Object.freeze([Object.freeze([1, 1, 18, 18])]),
    walkableSegments: Object.freeze([]),
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
    entrances: Object.freeze([
      Object.freeze({
        id: "route-test-return",
        col: 10,
        row: 18,
        label: "Volver a San Pablo",
        action: "transition",
        targetMap: "san-pablo",
        targetX: 620,
        targetY: 2092,
        targetDirection: "right",
        effect: "fade",
      }),
    ]),
    npcs: Object.freeze([
      Object.freeze({
        id: "exploradora-iris",
        col: 15,
        row: 11,
        direction: "left",
        name: "Exploradora Iris",
        sprite: "npc-30-ranger",
        lines: Object.freeze([
          "Esta senda es peque\u00f1a a prop\u00f3sito: demuestra que cada mapa puede vivir por separado.",
          "La hierba del naranjal tiene encuentros propios. La salida sur te devuelve a San Pablo.",
        ]),
      }),
    ]),
    events: Object.freeze([
      Object.freeze({
        id: "route-test-welcome",
        col: 10,
        row: 2,
        type: "thought",
        trigger: "step",
        message: "El aire huele a azahar. Este lugar ya es un mapa independiente.",
        once: false,
        enabled: true,
      }),
    ]),
    encounters: Object.freeze([
      Object.freeze({ id: 9808, weight: 32 }),
      Object.freeze({ id: 9701, weight: 24 }),
      Object.freeze({ id: 9601, weight: 20 }),
      Object.freeze({ id: 9001, weight: 14 }),
      Object.freeze({ id: 9809, weight: 10 }),
    ]),
    worldObjects: Object.freeze([
      Object.freeze({ id: "route-test-potion", dimension: "san_pablo", x: 512, y: 320, kind: "potions", amount: 1, name: "Poci\u00f3n", sprite: "potion" }),
    ]),
  });

  root.ROUTE_TEST_MAP_LAYOUT = layout;
  root.ROUTE_TEST_MAP_CONFIG = config;
  root.ROUTE_TEST_EDITOR_DATA = root.CITY_MAP_EDITOR_DATA;
  root.GAME_MAP_REGISTRY.register("route-test", {
    name: config.name,
    aliases: ["senda-naranjos"],
    config,
    layout,
    editorData: root.ROUTE_TEST_EDITOR_DATA,
    editorDataPath: "maps/route-test/editor-data.js",
  });
})(globalThis);
