(function registerPlazaFarmacia(root) {
  "use strict";

  const tileSize = 32;
  const cols = 40;
  const rows = 30;
  const width = cols * tileSize;
  const height = rows * tileSize;
  const editorData = root.CITY_MAP_EDITOR_DATA || {};
  const sharedCatalog = root.GAME_MAP_REGISTRY.get("san-pablo")?.layout?.assetCatalog || Object.freeze({});

  const localCatalog = {
    plazaPharmacy: {
      src: "assets/generated/plaza-farmacia-pixellab/building-pharmacy-san-pablo.png",
      kind: "building", label: "Farmacia de San Pablo", tags: ["farmacia", "comercio", "san-pablo"],
      w: 283, h: 132, colliders: [[-136, -38, 272, 38]], pixelated: true,
    },
    plazaBank: {
      src: "assets/generated/plaza-farmacia-pixellab/building-bank-neighborhood.png",
      kind: "building", label: "Banco de barrio", tags: ["banco", "comercio", "san-pablo"],
      w: 230, h: 140, colliders: [[-109, -38, 218, 38]], pixelated: true,
    },
    plazaShop: {
      src: "assets/generated/plaza-farmacia-pixellab/building-shop-neighborhood.png",
      kind: "building", label: "Tienda de barrio", tags: ["tienda", "comercio", "san-pablo"],
      w: 202, h: 156, colliders: [[-94, -38, 188, 38]], pixelated: true,
    },
    plazaBars: {
      src: "assets/generated/plaza-farmacia-pixellab/building-bars-strip.png",
      kind: "building", label: "Hilera de bares", tags: ["bar", "bares", "comercio", "san-pablo"],
      w: 358, h: 109, colliders: [[-175, -38, 350, 38]], pixelated: true,
    },
    plazaTerrace: {
      src: "assets/generated/plaza-farmacia-pixellab/prop-cafe-terrace.png",
      kind: "prop", label: "Mesas y sillas de terraza", tags: ["bar", "terraza", "mesa", "sillas"],
      w: 161, h: 107, colliders: [[-72, -34, 144, 34]], pixelated: true,
    },
  };
  const assetCatalog = Object.freeze({ ...sharedCatalog, ...localCatalog });
  const assetSprites = Object.freeze(Object.fromEntries(
    Object.entries(assetCatalog).map(([id, prototype]) => [id, prototype.src]),
  ));

  const place = (id, sprite, x, y, options = {}) => {
    const prototype = assetCatalog[sprite];
    if (!prototype) throw new Error(`Prototipo desconocido en Plaza de la Farmacia: ${sprite}`);
    const scale = Number(options.scale) || 1;
    const renderedWidth = Number(options.w) || Number(prototype.w) * scale;
    const renderedHeight = Number(options.h) || Number(prototype.h) * scale;
    const customColliders = Array.isArray(options.colliders);
    const colliderScaleX = customColliders ? 1 : renderedWidth / Number(prototype.w);
    const colliderScaleY = customColliders ? 1 : renderedHeight / Number(prototype.h);
    return Object.freeze({
      id, sprite, kind: options.kind || prototype.kind, placement: "layout",
      x, y, depthY: options.depthY ?? y - (prototype.kind === "building" ? 10 : 2),
      w: renderedWidth,
      h: renderedHeight,
      solid: options.solid ?? prototype.solid ?? true,
      colliders: (options.colliders || prototype.colliders || []).map(([offsetX, offsetY, colliderWidth, colliderHeight]) => [
        offsetX * colliderScaleX,
        offsetY * colliderScaleY,
        colliderWidth * colliderScaleX,
        colliderHeight * colliderScaleY,
      ]),
      ...(options.flipX ? { flipX: true } : {}),
      ...(options.label ? { label: options.label } : {}),
    });
  };

  /* La profundidad reproduce la entrada real desde la carretera: los bloques
     residenciales quedan al fondo, luego la franja comercial y finalmente la
     plaza peatonal con terrazas y arbolado. */
  const worldAssets = Object.freeze([
    place("plaza-apartments-west", "rowhouse", 252, 176, { w: 400, h: 188, solid: false }),
    place("plaza-apartments-east", "rowhouse", 1018, 176, { w: 400, h: 188, solid: false, flipX: true }),
    place("plaza-bars-northwest", "plazaBars", 224, 330),
    place("plaza-pharmacy-north", "plazaPharmacy", 592, 330),
    place("plaza-bank-northeast", "plazaBank", 890, 330),
    place("plaza-shop-east", "plazaShop", 1144, 330),

    place("plaza-tree-main", "deciduous", 438, 478, { w: 116, h: 142, colliders: [[-64, -66, 128, 104]] }),
    place("plaza-tree-east", "deciduous", 1058, 502, { w: 96, h: 118, colliders: [[-56, -56, 112, 96]] }),
    place("plaza-terrace-west", "plazaTerrace", 190, 535),
    place("plaza-terrace-center", "plazaTerrace", 715, 530, { flipX: true }),
    place("plaza-terrace-east", "plazaTerrace", 930, 565, { w: 144, h: 96, colliders: [[-62, -30, 124, 30]] }),
    place("plaza-bench-west", "bench", 390, 636, { solid: true }),
    place("plaza-bench-east", "bench", 890, 650, { solid: true, flipX: true }),
    place("plaza-lamp-west", "streetlamp", 315, 690),
    place("plaza-lamp-east", "streetlamp", 965, 690),
  ]);

  const layout = Object.freeze({
    revision: 3,
    width,
    height,
    tileSize,
    navigationCellSize: 8,
    assetCatalog,
    worldAssets,
    roads: Object.freeze([
      Object.freeze({ id: "jerusalen-access", name: "Acceso desde Calle Jerusalen", points: Object.freeze([[0, 850], [1280, 850]]), width: 192, surface: "asphalt", sidewalkWidth: 12, curbWidth: 4 }),
    ]),
    paths: Object.freeze([
      Object.freeze({ id: "pharmacy-crosswalk", points: Object.freeze([[640, 920], [640, 690]]), width: 112, surface: "sidewalk", walkable: true }),
    ]),
    surfaceRects: Object.freeze([
      Object.freeze({ id: "commercial-plaza", x: 32, y: 288, w: 1216, h: 480, surface: "plaza", walkable: true }),
      Object.freeze({ id: "road-approach", x: 32, y: 768, w: 1216, h: 160, surface: "asphalt", walkable: true }),
    ]),
    surfacePolygons: Object.freeze([]),
    encounterAreas: Object.freeze([]),
    blockedRects: Object.freeze([]),
    sections: Object.freeze([
      Object.freeze({ id: "plaza-farmacia", name: "Plaza de la Farmacia", x: 0, y: 0, w: width, h: height }),
    ]),
  });

  const config = Object.freeze({
    id: "plaza-farmacia",
    name: "Plaza de la Farmacia",
    kind: "district",
    revision: 3,
    previewImage: "maps/plaza-farmacia/base.svg",
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    sourceWidth: width,
    sourceHeight: height,
    textureScale: 1,
    tileColumns: 1,
    tileRows: 1,
    chunkSize: Math.max(width, height),
    chunkGutter: 0,
    memoryBudgetMB: 20,
    prefetchLimit: 0,
    tiles: Object.freeze([
      Object.freeze({ id: "r0-c0", col: 0, row: 0, x: 0, y: 0, w: width, h: height, image: "maps/plaza-farmacia/base.svg" }),
    ]),
    tileSize,
    defaultTile: "blocked",
    spawn: Object.freeze({ x: 640, y: 848, direction: "up" }),
    assetSprites,
    assetRevision: 3,
    worldAssets,
    editorVacatedRects: Object.freeze([]),
    sections: layout.sections,
    extensionSurfaces: Object.freeze([]),
    buildingFootprints: Object.freeze([]),
    barrierSegments: Object.freeze([]),
    blockedRects: Object.freeze([]),
    walkableRects: Object.freeze([
      Object.freeze([1, 9, 38, 28]),
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
        col: 20,
        row: 24,
        label: "Plaza de la Farmacia",
        type: "thought",
        trigger: "step",
        message: "Desde la carretera, la farmacia y los bares cierran el fondo de la plaza.",
        once: true,
        enabled: true,
      }),
      Object.freeze({
        id: "plaza-farmacia-return-san-pablo",
        scene: "world",
        col: 20,
        row: 28,
        label: "Volver a Calle Jerusalen",
        type: "transition",
        trigger: "step",
        message: "Regresas a Calle Jerusalen.",
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
