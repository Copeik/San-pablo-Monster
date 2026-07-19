(function registerPraderaBifaz(root) {
  "use strict";

  const registry = root.GAME_MAP_REGISTRY;
  if (!registry?.register) throw new Error("Pradera Bifaz necesita GAME_MAP_REGISTRY.");

  const id = "pradera-bifaz";
  const name = "Pradera Bifaz";
  const width = 5400;
  const height = 624;
  const tileSize = 32;
  const editorData = root.CITY_MAP_EDITOR_DATA || Object.freeze({});
  const emptyArray = () => Object.freeze([]);

  /*
   * El mapa se registra antes que el runtime del minijuego. El getter permite
   * resolver el nivel cuando el core ya exista, pero no se enumera ni se
   * serializa: la configuracion persistente conserva solo datos de integracion.
   */
  const perspective = {
    returnMap: "san-pablo",
    returnX: 2128,
    returnY: 2288,
    returnDirection: "down",
    runtimeVersion: 2,
  };
  Object.defineProperty(perspective, "level", {
    configurable: false,
    enumerable: false,
    get() {
      return root.PERSPECTIVE_ZONE_CORE?.DEFAULT_LEVEL || null;
    },
  });
  Object.freeze(perspective);

  const sections = Object.freeze([
    Object.freeze({ id, name, x: 0, y: 0, w: width, h: height }),
  ]);
  const assetCatalog = Object.freeze({});
  const worldAssets = emptyArray();
  const assetDoors = emptyArray();
  const hiddenAssetDoors = emptyArray();
  const editorVacatedRects = emptyArray();
  const roads = emptyArray();
  const paths = emptyArray();
  const surfaceRects = emptyArray();
  const extensionSurfaces = emptyArray();
  const surfacePolygons = emptyArray();
  const encounterAreas = emptyArray();
  const sportsFields = emptyArray();
  const blockers = emptyArray();
  const blockedSegments = emptyArray();
  const layoutBlockedRects = emptyArray();

  const layout = Object.freeze({
    revision: 2,
    width,
    height,
    tileSize,
    navigationCellSize: 8,
    includeMapDataWalkability: false,
    assetCatalog,
    worldAssets,
    assetDoors,
    hiddenAssetDoors,
    editorVacatedRects,
    roads,
    paths,
    surfaceRects,
    extensionSurfaces,
    surfacePolygons,
    encounterAreas,
    sportsFields,
    blockers,
    blockedSegments,
    blockedRects: layoutBlockedRects,
    sections,
  });

  const tiles = Object.freeze([
    Object.freeze({
      id: "r0-c0",
      col: 0,
      row: 0,
      x: 0,
      y: 0,
      w: width,
      h: height,
      image: "maps/pradera-bifaz/base.svg",
    }),
  ]);

  const config = Object.freeze({
    id,
    name,
    kind: "minigame",
    runtime: "perspective-platformer-v1",
    revision: 2,
    music: "route-first",
    previewImage: "maps/pradera-bifaz/base.svg",
    width,
    height,
    baseWidth: width,
    baseHeight: height,
    sourceWidth: width,
    sourceHeight: height,
    textureScale: 1,
    tileColumns: 1,
    tileRows: 1,
    chunkSize: width,
    chunkGutter: 0,
    memoryBudgetMB: 24,
    prefetchLimit: 0,
    tiles,
    tileSize,
    defaultTile: "blocked",
    spawn: Object.freeze({ x: 160, y: 462, direction: "right" }),
    perspective,
    assetSprites: Object.freeze({}),
    assetRevision: 1,
    worldAssets,
    editorVacatedRects,
    sections,
    extensionSurfaces,
    buildingFootprints: emptyArray(),
    barrierSegments: emptyArray(),
    blockedRects: emptyArray(),
    blockedProbes: emptyArray(),
    openProbes: emptyArray(),
    walkableRects: emptyArray(),
    walkableSegments: emptyArray(),
    encounterAreas,
    encounterTiles: emptyArray(),
    encounterRects: emptyArray(),
    entrances: emptyArray(),
    doors: emptyArray(),
    npcs: emptyArray(),
    events: emptyArray(),
    encounters: emptyArray(),
    worldObjects: emptyArray(),
    pointsOfInterest: emptyArray(),
    streets: emptyArray(),
    streetPolish: Object.freeze({}),
  });

  root.PRADERA_BIFAZ_MAP_LAYOUT = layout;
  root.PRADERA_BIFAZ_MAP_CONFIG = config;
  root.PRADERA_BIFAZ_EDITOR_DATA = editorData;
  registry.register(id, {
    name,
    aliases: ["pradera-perspectiva", "sendero-bifaz"],
    config,
    layout,
    editorData,
    editorDataPath: "maps/pradera-bifaz/editor-data.js",
  });
})(globalThis);
