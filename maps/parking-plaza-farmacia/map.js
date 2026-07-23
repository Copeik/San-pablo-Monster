(function registerParkingPlazaFarmacia(root) {
  "use strict";

  const tileSize = 32;
  const cols = 40;
  const rows = 32;
  const width = cols * tileSize;
  const height = rows * tileSize;
  const editorData = root.CITY_MAP_EDITOR_DATA || {};
  const sharedCatalog = root.GAME_MAP_REGISTRY.get("san-pablo")?.layout?.assetCatalog || Object.freeze({});
  const localCatalog = {
    parkingWalls: {
      src: "assets/generated/plaza-farmacia-pixellab/runtime-v9/buildings/parking-walls-v9.png",
      kind: "structure", label: "Tabiques modulares del parking", tags: ["parking", "laberinto", "pixellab"],
      w: 1280, h: 1024, colliders: [], solid: false, pixelated: true,
      castShadow: false, depthSliceHeight: 32, revision: 9,
    },
    parkingPortalInterior: {
      src: "assets/generated/plaza-farmacia-pixellab/runtime-v9/props/parking-portal-interior-wide.png",
      kind: "prop", label: "Boca interior de la rampa", tags: ["parking", "rampa", "pixellab"],
      w: 224, h: 128, colliders: [], solid: false, pixelated: true,
      castShadow: false, revision: 9,
    },
    parkingLightwellBelow: {
      src: "assets/generated/plaza-farmacia-pixellab/runtime-v9/props/parking-lightwell-high.png",
      kind: "prop", label: "Luz cenital bajo la plaza", tags: ["parking", "luz", "pixellab"],
      w: 192, h: 192, colliders: [], solid: false, pixelated: true,
      castShadow: false, revision: 9,
    },
    parkingClutterA: {
      src: "assets/generated/plaza-farmacia-pixellab/runtime-v9/props/parking-clutter-a.png",
      kind: "prop", label: "Carro y cajas abandonados", tags: ["parking", "abandono", "pixellab"],
      w: 128, h: 128, colliders: [], solid: false, pixelated: true, revision: 9,
    },
    parkingClutterB: {
      src: "assets/generated/plaza-farmacia-pixellab/runtime-v9/props/parking-clutter-b.png",
      kind: "prop", label: "Restos del parking", tags: ["parking", "abandono", "pixellab"],
      w: 128, h: 128, colliders: [], solid: false, pixelated: true, revision: 9,
    },
    parkingCarWhite: {
      src: "assets/generated/ada-efeso-pixellab/props/car-white.png",
      kind: "prop", label: "Coche blanco abandonado", tags: ["parking", "coche", "pixellab"],
      w: 64, h: 64, colliders: [], solid: false, pixelated: true, revision: 9,
    },
    parkingCarBlue: {
      src: "assets/generated/ada-efeso-pixellab/props/car-blue.png",
      kind: "prop", label: "Coche azul abandonado", tags: ["parking", "coche", "pixellab"],
      w: 64, h: 64, colliders: [], solid: false, pixelated: true, revision: 9,
    },
    parkingWebRound: {
      src: "assets/generated/plaza-farmacia-pixellab/runtime-v9/props/parking-web-round.png",
      kind: "prop", label: "Telaraña redonda", tags: ["parking", "telarañas", "pixellab"],
      w: 64, h: 64, colliders: [], solid: false, pixelated: true, castShadow: false, revision: 9,
    },
    parkingWebCorner: {
      src: "assets/generated/plaza-farmacia-pixellab/runtime-v9/props/parking-web-corner.png",
      kind: "prop", label: "Telaraña de esquina", tags: ["parking", "telarañas", "pixellab"],
      w: 64, h: 64, colliders: [], solid: false, pixelated: true, castShadow: false, revision: 9,
    },
    parkingWebWide: {
      src: "assets/generated/plaza-farmacia-pixellab/runtime-v9/props/parking-web-wide.png",
      kind: "prop", label: "Telaraña ancha", tags: ["parking", "telarañas", "pixellab"],
      w: 64, h: 64, colliders: [], solid: false, pixelated: true, castShadow: false, revision: 9,
    },
  };
  const assetCatalog = Object.freeze({ ...sharedCatalog, ...localCatalog });
  const assetSprites = Object.freeze(Object.fromEntries(
    Object.entries(assetCatalog).map(([id, prototype]) => [id, prototype.src]),
  ));

  const place = (id, sprite, x, y, options = {}) => {
    const prototype = assetCatalog[sprite];
    if (!prototype) throw new Error(`Prototipo desconocido en Parking de la Plaza: ${sprite}`);
    const renderedWidth = Number(options.w) || Number(prototype.w);
    const renderedHeight = Number(options.h) || Number(prototype.h);
    return Object.freeze({
      id, sprite, kind: options.kind || prototype.kind, placement: "layout",
      x, y, depthY: options.depthY ?? y - 2,
      w: renderedWidth, h: renderedHeight,
      solid: options.solid ?? prototype.solid ?? true,
      colliders: (options.colliders || prototype.colliders || []).map((collider) => [...collider]),
      ...((options.depthSliceHeight ?? prototype.depthSliceHeight) ? {
        depthSliceHeight: options.depthSliceHeight ?? prototype.depthSliceHeight,
      } : {}),
      ...((options.castShadow ?? prototype.castShadow) === false ? { castShadow: false } : {}),
      ...(options.flipX ? { flipX: true } : {}),
    });
  };

  const worldAssets = Object.freeze([
    place("parking-walls-v9", "parkingWalls", 640, 1024, { depthSliceHeight: 32 }),
    place("parking-ramp-interior", "parkingPortalInterior", 640, 256, { depthY: 254 }),
    place("parking-lightwell-below", "parkingLightwellBelow", 640, 704, { depthY: 700 }),
    place("parking-clutter-northwest", "parkingClutterA", 256, 320),
    place("parking-clutter-southeast", "parkingClutterB", 960, 896, { flipX: true }),
    place("parking-car-white", "parkingCarWhite", 96, 224),
    place("parking-car-blue", "parkingCarBlue", 864, 192),
    place("parking-web-northwest", "parkingWebCorner", 224, 416),
    place("parking-web-west-mid", "parkingWebWide", 416, 608),
    place("parking-web-center-top", "parkingWebRound", 512, 384),
    place("parking-web-center-east", "parkingWebCorner", 800, 672, { flipX: true }),
    place("parking-web-east-mid", "parkingWebWide", 992, 640),
    place("parking-web-northeast", "parkingWebRound", 1152, 480),
    place("parking-web-southwest", "parkingWebCorner", 416, 928),
    place("parking-web-southeast", "parkingWebWide", 1184, 896, { flipX: true }),
  ]);

  const blockedRects = Object.freeze([
    Object.freeze([5, 4, 6, 12]),
    Object.freeze([5, 16, 6, 27]),
    Object.freeze([11, 8, 12, 21]),
    Object.freeze([11, 25, 12, 29]),
    Object.freeze([15, 4, 16, 10]),
    Object.freeze([23, 4, 24, 12]),
    Object.freeze([23, 20, 24, 28]),
    Object.freeze([29, 7, 30, 19]),
    Object.freeze([29, 23, 30, 29]),
    Object.freeze([35, 4, 36, 14]),
    Object.freeze([35, 18, 36, 27]),
    Object.freeze([6, 12, 11, 13]),
    Object.freeze([12, 21, 16, 22]),
    Object.freeze([24, 19, 30, 20]),
    Object.freeze([30, 14, 36, 15]),
    Object.freeze([6, 27, 12, 28]),
    Object.freeze([16, 13, 16, 18]),
    Object.freeze([25, 13, 26, 17]),
    Object.freeze([17, 24, 21, 25]),
    Object.freeze([25, 8, 28, 9]),
    Object.freeze([7, 18, 10, 19]),
    Object.freeze([31, 24, 34, 25]),
    Object.freeze([2, 8, 4, 9]),
  ]);

  const sections = Object.freeze([
    Object.freeze({ id: "parking-north", name: "Rampa del Parking", x: 0, y: 0, w: width, h: 320 }),
    Object.freeze({ id: "parking-maze", name: "Parking Subterráneo", x: 0, y: 320, w: width, h: 704 }),
  ]);
  const layout = Object.freeze({
    revision: 4,
    width, height, tileSize, navigationCellSize: 8,
    assetCatalog, worldAssets,
    roads: Object.freeze([]), paths: Object.freeze([]),
    surfaceRects: Object.freeze([
      Object.freeze({ id: "parking-floor", x: 32, y: 32, w: 1216, h: 960, surface: "concrete", walkable: true }),
    ]),
    surfacePolygons: Object.freeze([]), encounterAreas: Object.freeze([]),
    blockedRects, sections,
  });

  const config = Object.freeze({
    id: "parking-plaza-farmacia",
    name: "Parking de la Plaza",
    kind: "dungeon",
    revision: 4,
    previewImage: "maps/parking-plaza-farmacia/base-v3.png?rev=4",
    width, height, baseWidth: width, baseHeight: height,
    sourceWidth: width, sourceHeight: height, textureScale: 1,
    tileColumns: 1, tileRows: 1, chunkSize: width, chunkGutter: 0,
    memoryBudgetMB: 20, prefetchLimit: 0,
    tiles: Object.freeze([
      Object.freeze({ id: "r0-c0", col: 0, row: 0, x: 0, y: 0, w: width, h: height, image: "maps/parking-plaza-farmacia/base-v3.png?rev=4" }),
    ]),
    tileSize,
    defaultTile: "blocked",
    spawn: Object.freeze({ x: 640, y: 288, direction: "down" }),
    assetSprites,
    assetRevision: 4,
    worldAssets,
    editorVacatedRects: Object.freeze([]),
    sections,
    extensionSurfaces: Object.freeze([]),
    buildingFootprints: Object.freeze([]),
    barrierSegments: Object.freeze([]),
    blockedRects,
    walkableRects: Object.freeze([Object.freeze([1, 1, 38, 30])]),
    walkableSegments: Object.freeze([]),
    encounterAreas: Object.freeze([]), encounterTiles: Object.freeze([]), encounterRects: Object.freeze([]),
    entrances: Object.freeze([]), npcs: Object.freeze([]),
    events: Object.freeze([
      Object.freeze({
        id: "parking-return-plaza", scene: "world", col: 20, row: 8,
        label: "Subir a la plaza", type: "transition", trigger: "interact",
        message: "Subes por la rampa hasta la plazoleta.",
        targetMap: "plaza-farmacia", targetX: 640, targetY: 944,
        targetDirection: "down", effect: "fade", once: false, enabled: true,
      }),
      Object.freeze({
        id: "parking-first-web", scene: "world", col: 9, row: 15,
        label: "Parking abandonado", type: "thought", trigger: "step",
        message: "Las telarañas unen pilares, carros y tabiques. El recorrido se retuerce como un pequeño laberinto.",
        once: true, enabled: true,
      }),
      Object.freeze({
        id: "parking-lightwell", scene: "world", col: 20, row: 20,
        label: "Luz de la plaza", type: "thought", trigger: "interact",
        message: "Muy arriba se distingue el círculo abierto en el centro de la plaza.",
        once: false, enabled: true,
      }),
    ]),
    encounters: Object.freeze([]), worldObjects: Object.freeze([]), pointsOfInterest: Object.freeze([]),
  });

  root.PARKING_PLAZA_FARMACIA_MAP_LAYOUT = layout;
  root.PARKING_PLAZA_FARMACIA_MAP_CONFIG = config;
  root.GAME_MAP_REGISTRY.register("parking-plaza-farmacia", {
    name: config.name,
    aliases: ["parking-farmacia", "parking-plaza"],
    config, layout, editorData,
    editorDataPath: "maps/parking-plaza-farmacia/editor-data.js",
  });
})(globalThis);
