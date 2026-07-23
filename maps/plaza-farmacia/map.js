(function registerPlazaFarmacia(root) {
  "use strict";

  const tileSize = 32;
  const cols = 40;
  const rows = 56;
  const width = cols * tileSize;
  const height = rows * tileSize;
  const editorData = root.CITY_MAP_EDITOR_DATA || {};
  const assetCatalog = root.GAME_MAP_REGISTRY.get("san-pablo")?.layout?.assetCatalog || Object.freeze({});
  const assetSprites = Object.freeze(Object.fromEntries(
    Object.entries(assetCatalog).map(([id, prototype]) => [id, prototype.src]),
  ));

  /*
   * La revisión 14 utiliza como base única la composición final aprobada por
   * el usuario. Todo el arte arquitectónico está ya horneado en base-v14.png;
   * worldAssets permanece vacío para impedir fachadas, mobiliario o ruinas
   * duplicadas sobre la referencia.
   */
  const worldAssets = Object.freeze([]);

  const blockedRects = Object.freeze([
    // Edificio comercial continuo en U.
    Object.freeze([5, 2, 34, 8]),
    Object.freeze([5, 9, 9, 27]),
    Object.freeze([30, 9, 34, 27]),

    // Hueco de luz circular.
    Object.freeze([18, 11, 21, 14]),

    // Mesas, bancos, farolas y laterales de la rampa.
    Object.freeze([11, 11, 15, 12]),
    Object.freeze([12, 13, 15, 14]),
    Object.freeze([24, 11, 28, 12]),
    Object.freeze([24, 13, 28, 14]),
    Object.freeze([12, 20, 13, 21]),
    Object.freeze([26, 20, 27, 21]),
    Object.freeze([11, 23, 13, 24]),
    Object.freeze([26, 23, 28, 24]),
    Object.freeze([11, 25, 14, 26]),
    Object.freeze([25, 25, 28, 26]),
    Object.freeze([10, 26, 10, 27]),
    Object.freeze([29, 26, 29, 27]),
    Object.freeze([14, 21, 15, 29]),
    Object.freeze([24, 21, 25, 29]),

    // Dos alas del centro comercial derruido y el vestíbulo quebrado.
    Object.freeze([2, 40, 16, 54]),
    Object.freeze([24, 40, 37, 54]),
    Object.freeze([17, 42, 18, 45]),
    Object.freeze([21, 42, 23, 45]),
  ]);

  const rectanglePoints = (left, top, right, bottom) => Object.freeze([
    Object.freeze([left, top]),
    Object.freeze([right, top]),
    Object.freeze([right, bottom]),
    Object.freeze([left, bottom]),
  ]);

  const buildingFootprints = Object.freeze([
    Object.freeze({
      id: "plaza-u-north-footprint",
      name: "Tramo norte · KEBAB → LOCAL CERRADO → BAR · puertas al sur",
      kind: "commercial-building",
      wing: "north",
      orderDirection: "west-to-east",
      storefrontOrder: Object.freeze(["KEBAB", "LOCAL CERRADO", "BAR"]),
      storefrontFaces: "south-courtyard",
      facadeBand: Object.freeze([320, 224, 960, 288]),
      storefrontIntervals: Object.freeze([
        Object.freeze({ name: "KEBAB", from: 320, to: 544 }),
        Object.freeze({ name: "LOCAL CERRADO", from: 544, to: 768 }),
        Object.freeze({ name: "BAR", from: 768, to: 960 }),
      ]),
      solid: true,
      points: rectanglePoints(144, 64, 1136, 288),
    }),
    Object.freeze({
      id: "plaza-u-west-footprint",
      name: "Ala oeste · CHINO → LOCAL CERRADO → MAR DE GAMBAS · puertas al este",
      kind: "commercial-building",
      wing: "west",
      orderDirection: "north-to-road",
      storefrontOrder: Object.freeze(["CHINO", "LOCAL CERRADO", "MAR DE GAMBAS"]),
      storefrontFaces: "east-courtyard",
      facadeBand: Object.freeze([288, 288, 320, 896]),
      storefrontIntervals: Object.freeze([
        Object.freeze({ name: "CHINO", from: 288, to: 480 }),
        Object.freeze({ name: "LOCAL CERRADO", from: 480, to: 672 }),
        Object.freeze({ name: "MAR DE GAMBAS", from: 672, to: 896 }),
      ]),
      solid: true,
      points: rectanglePoints(144, 288, 320, 896),
    }),
    Object.freeze({
      id: "plaza-u-east-footprint",
      name: "Ala este · FRUTERÍA → LOCAL CERRADO → FARMACIA · puertas al oeste",
      kind: "commercial-building",
      wing: "east",
      orderDirection: "north-to-road",
      storefrontOrder: Object.freeze(["FRUTERÍA", "LOCAL CERRADO", "FARMACIA"]),
      storefrontFaces: "west-courtyard",
      facadeBand: Object.freeze([960, 288, 992, 896]),
      storefrontIntervals: Object.freeze([
        Object.freeze({ name: "FRUTERÍA", from: 288, to: 480 }),
        Object.freeze({ name: "LOCAL CERRADO", from: 480, to: 672 }),
        Object.freeze({ name: "FARMACIA", from: 672, to: 896 }),
      ]),
      pharmacyGlassFacadeFaces: "south-road",
      solid: true,
      points: rectanglePoints(960, 288, 1136, 896),
    }),
    Object.freeze({
      id: "abandoned-mall-west-footprint",
      name: "Ala oeste del centro comercial derruido",
      kind: "abandoned-building",
      wing: "west",
      solid: true,
      points: rectanglePoints(64, 1280, 544, 1760),
    }),
    Object.freeze({
      id: "abandoned-mall-east-footprint",
      name: "Ala este del centro comercial derruido",
      kind: "abandoned-building",
      wing: "east",
      solid: true,
      points: rectanglePoints(768, 1280, 1216, 1760),
    }),
  ]);

  const sections = Object.freeze([
    Object.freeze({
      id: "commercial-plaza",
      name: "Plazoleta de la Farmacia",
      x: 0,
      y: 0,
      w: width,
      h: 1008,
    }),
    Object.freeze({
      id: "two-way-road",
      name: "Carretera de la Plaza",
      x: 0,
      y: 1008,
      w: width,
      h: 208,
    }),
    Object.freeze({
      id: "abandoned-site",
      name: "Centro Comercial Abandonado",
      x: 0,
      y: 1216,
      w: width,
      h: 576,
    }),
  ]);

  const layout = Object.freeze({
    revision: 14,
    width,
    height,
    tileSize,
    navigationCellSize: 8,
    assetCatalog,
    worldAssets,
    roads: Object.freeze([
      Object.freeze({
        id: "plaza-two-way-road",
        name: "Carretera de la Plaza",
        points: Object.freeze([[0, 1112], [1280, 1112]]),
        width: 208,
        surface: "asphalt",
        sidewalkWidth: 32,
        curbWidth: 4,
      }),
    ]),
    paths: Object.freeze([
      Object.freeze({
        id: "plaza-left-sidewalk",
        points: Object.freeze([[64, 96], [64, 992]]),
        width: 64,
        surface: "sidewalk",
        walkable: true,
      }),
      Object.freeze({
        id: "plaza-right-sidewalk",
        points: Object.freeze([[1216, 96], [1216, 992]]),
        width: 64,
        surface: "sidewalk",
        walkable: true,
      }),
      Object.freeze({
        id: "plaza-crosswalk",
        points: Object.freeze([[640, 1008], [640, 1216]]),
        width: 128,
        surface: "sidewalk",
        walkable: true,
      }),
      Object.freeze({
        id: "plaza-garage-driveway",
        points: Object.freeze([[640, 672], [640, 1008]]),
        width: 256,
        surface: "asphalt",
        walkable: true,
      }),
      Object.freeze({
        id: "abandoned-entrance-axis",
        points: Object.freeze([[640, 1216], [640, 1792]]),
        width: 128,
        surface: "sidewalk",
        walkable: true,
      }),
    ]),
    surfaceRects: Object.freeze([
      Object.freeze({
        id: "gray-commercial-plaza",
        x: 0,
        y: 0,
        w: 1280,
        h: 1008,
        surface: "plaza",
        walkable: true,
      }),
      Object.freeze({
        id: "abandoned-concrete",
        x: 0,
        y: 1216,
        w: 1280,
        h: 576,
        surface: "plaza",
        walkable: true,
      }),
    ]),
    surfacePolygons: Object.freeze([]),
    encounterAreas: Object.freeze([]),
    buildingFootprints,
    blockedRects,
    sections,
  });

  const config = Object.freeze({
    id: "plaza-farmacia",
    name: "Plaza de la Farmacia",
    kind: "district",
    revision: 14,
    previewImage: "maps/plaza-farmacia/base-v14.png?rev=14",
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    sourceWidth: width,
    sourceHeight: height,
    textureScale: 1,
    tileColumns: 1,
    tileRows: 1,
    chunkSize: height,
    chunkGutter: 0,
    memoryBudgetMB: 28,
    prefetchLimit: 0,
    tiles: Object.freeze([
      Object.freeze({
        id: "r0-c0",
        col: 0,
        row: 0,
        x: 0,
        y: 0,
        w: width,
        h: height,
        image: "maps/plaza-farmacia/base-v14.png?rev=14",
      }),
    ]),
    tileSize,
    defaultTile: "blocked",
    spawn: Object.freeze({ x: 80, y: 848, direction: "right" }),
    assetSprites,
    assetRevision: 14,
    worldAssets,
    editorVacatedRects: Object.freeze([]),
    sections,
    extensionSurfaces: Object.freeze([]),
    buildingFootprints,
    barrierSegments: Object.freeze([]),
    blockedRects,
    walkableRects: Object.freeze([
      Object.freeze([1, 2, 38, 54]),
    ]),
    walkableSegments: Object.freeze([]),
    encounterAreas: Object.freeze([]),
    encounterTiles: Object.freeze([]),
    encounterRects: Object.freeze([]),
    entrances: Object.freeze([]),
    npcs: Object.freeze([]),
    events: Object.freeze([
      Object.freeze({
        id: "plaza-farmacia-welcome",
        scene: "world",
        col: 4,
        row: 30,
        label: "Plaza de la Farmacia",
        type: "thought",
        trigger: "step",
        message: "Los comercios forman una sola U invertida abierta hacia la carretera.",
        once: true,
        enabled: true,
      }),
      Object.freeze({
        id: "plaza-parking-ramp",
        scene: "world",
        col: 20,
        row: 29,
        label: "Rampa del parking",
        type: "transition",
        trigger: "interact",
        message: "La rampa de dos carriles nace en la carretera y baja al parking bajo la plaza.",
        targetMap: "parking-plaza-farmacia",
        targetX: 640,
        targetY: 288,
        targetDirection: "down",
        effect: "fade",
        once: false,
        enabled: true,
      }),
      Object.freeze({
        id: "plaza-lightwell",
        scene: "world",
        col: 20,
        row: 13,
        label: "Hueco circular",
        type: "thought",
        trigger: "interact",
        message: "El hueco circular deja mirar y permite que entre luz al parking subterráneo.",
        once: false,
        enabled: true,
      }),
      Object.freeze({
        id: "abandoned-mall-warning",
        scene: "world",
        col: 20,
        row: 42,
        label: "Centro comercial en ruinas",
        type: "thought",
        trigger: "interact",
        message: "Tras los cristales rotos se alzan dos alas enormes, hundidas y cubiertas de escombros.",
        once: false,
        enabled: true,
      }),
      Object.freeze({
        id: "plaza-farmacia-return-san-pablo-west",
        scene: "world",
        col: 1,
        row: 26,
        label: "Volver a Calle Jerusalén",
        type: "transition",
        trigger: "step",
        message: "Regresas a Calle Jerusalén por la acera oeste.",
        targetMap: "san-pablo",
        targetX: 1008,
        targetY: 576,
        targetDirection: "down",
        effect: "fade",
        once: false,
        enabled: true,
      }),
      Object.freeze({
        id: "plaza-farmacia-return-san-pablo-east",
        scene: "world",
        col: 38,
        row: 26,
        label: "Volver a Calle Jerusalén",
        type: "transition",
        trigger: "step",
        message: "Regresas a Calle Jerusalén por la acera este.",
        targetMap: "san-pablo",
        targetX: 1008,
        targetY: 576,
        targetDirection: "down",
        effect: "fade",
        once: false,
        enabled: true,
      }),
    ]),
    encounters: Object.freeze([]),
    worldObjects: Object.freeze([]),
    pointsOfInterest: Object.freeze([]),
  });

  root.PLAZA_FARMACIA_MAP_LAYOUT = layout;
  root.PLAZA_FARMACIA_MAP_CONFIG = config;
  root.GAME_MAP_REGISTRY.register("plaza-farmacia", {
    name: config.name,
    aliases: ["farmacia", "plaza-jerusalen"],
    config,
    layout,
    editorData,
    editorDataPath: "maps/plaza-farmacia/editor-data.js",
  });
})(globalThis);
