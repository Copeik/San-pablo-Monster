(function registerAdaEfeso(root) {
  "use strict";

  const tileSize = 32;
  const cols = 72;
  const rows = 96;
  const width = cols * tileSize;
  const height = rows * tileSize;
  const editorData = root.CITY_MAP_EDITOR_DATA || {};
  const localCatalog = {
    adaApartmentSouth: {
      src: "assets/generated/ada-efeso-pixellab/building-apartment-south.png",
      kind: "building", label: "Bloque residencial blanco y amarillo (sur)",
      tags: ["residencial", "blanco", "amarillo", "ada"],
      w: 151, h: 151, colliders: [[-61, -29, 122, 33]], pixelated: true,
    },
    adaApartmentNorth: {
      src: "assets/generated/ada-efeso-pixellab/building-apartment-parking-rear.png",
      kind: "building", label: "Bloque con acceso norte y trasera sin puertas",
      tags: ["residencial", "blanco", "amarillo", "entrada-plaza", "trasera-sin-puertas", "ada"],
      w: 151, h: 151, colliders: [[-61, -29, 122, 33]], pixelated: true,
    },
    efesoUniversity: {
      src: "assets/generated/ada-efeso-pixellab/building-university-south.png",
      kind: "building", label: "Edificio universitario blanco",
      tags: ["universidad", "blanco", "campus", "efeso"],
      w: 151, h: 151, colliders: [[-62, -31, 124, 37]], pixelated: true,
    },
    adaPlayground: {
      src: "assets/generated/ada-efeso-pixellab/prop-playground.png",
      kind: "prop", label: "Parque infantil",
      tags: ["parque", "infantil", "juegos", "ada"],
      w: 256, h: 256, colliders: [[-82, -50, 164, 92]], pixelated: true,
    },
    adaTree: {
      src: "assets/generated/ada-efeso-pixellab/props/tree.png",
      kind: "prop", label: "Árbol mediterráneo PixelLab",
      tags: ["arbol", "plaza", "pixellab"],
      w: 64, h: 64, colliders: [[-9, -10, 18, 16]], pixelated: true,
    },
    adaBench: {
      src: "assets/generated/ada-efeso-pixellab/props/bench.png",
      kind: "furniture", label: "Banco PixelLab",
      tags: ["banco", "peatonal", "pixellab"],
      w: 64, h: 64, colliders: [[-25, -12, 50, 16]], pixelated: true,
    },
    adaStreetlamp: {
      src: "assets/generated/ada-efeso-pixellab/props/streetlamp.png",
      kind: "furniture", label: "Farola PixelLab",
      tags: ["farola", "peatonal", "pixellab"],
      w: 64, h: 64, colliders: [[-6, -7, 12, 12]], pixelated: true,
    },
    adaCarRed: {
      src: "assets/generated/ada-efeso-pixellab/props/car-red.png",
      kind: "prop", label: "Coche rojo PixelLab",
      tags: ["coche", "aparcamiento", "pixellab"],
      w: 64, h: 64, colliders: [[-16, -48, 32, 48]], pixelated: true,
    },
    adaCarBlue: {
      src: "assets/generated/ada-efeso-pixellab/props/car-blue.png",
      kind: "prop", label: "Coche azul PixelLab",
      tags: ["coche", "aparcamiento", "pixellab"],
      w: 64, h: 64, colliders: [[-16, -48, 32, 48]], pixelated: true,
    },
    adaCarWhite: {
      src: "assets/generated/ada-efeso-pixellab/props/car-white.png",
      kind: "prop", label: "Coche blanco PixelLab",
      tags: ["coche", "aparcamiento", "pixellab"],
      w: 64, h: 64, colliders: [[-16, -48, 32, 48]], pixelated: true,
    },
    adaCarYellow: {
      src: "assets/generated/ada-efeso-pixellab/props/car-yellow.png",
      kind: "prop", label: "Coche amarillo PixelLab",
      tags: ["coche", "aparcamiento", "pixellab"],
      w: 64, h: 64, colliders: [[-16, -48, 32, 48]], pixelated: true,
    },
    adaFenceHorizontal: {
      src: "assets/generated/ada-efeso-pixellab/props/fence-topdown-horizontal.png",
      kind: "furniture", label: "Valla universitaria cenital horizontal PixelLab",
      tags: ["valla", "campus", "pixellab"],
      w: 64, h: 64, colliders: [], solid: false, pixelated: true,
    },
    adaFenceVertical: {
      src: "assets/generated/ada-efeso-pixellab/props/fence-topdown-vertical.png",
      kind: "furniture", label: "Valla universitaria cenital vertical PixelLab",
      tags: ["valla", "campus", "cenital", "pixellab"],
      w: 64, h: 64, colliders: [], solid: false, pixelated: true,
    },
    adaPlanter: {
      src: "assets/generated/ada-efeso-pixellab/props/planter.png",
      kind: "furniture", label: "Jardinera PixelLab",
      tags: ["jardinera", "plaza", "pixellab"],
      w: 64, h: 64, colliders: [[-25, -12, 50, 18]], pixelated: true,
    },
    adaBollard: {
      src: "assets/generated/ada-efeso-pixellab/props/bollard.png",
      kind: "furniture", label: "Bolardo PixelLab",
      tags: ["bolardo", "peatonal", "pixellab"],
      w: 64, h: 64, colliders: [[-6, -7, 12, 12]], pixelated: true,
    },
    adaCampusSign: {
      src: "assets/generated/ada-efeso-pixellab/props/campus-sign.png",
      kind: "furniture", label: "Señal del campus PixelLab",
      tags: ["senal", "campus", "pixellab"],
      w: 64, h: 64, colliders: [[-18, -8, 36, 12]], pixelated: true,
    },
    adaFlowerBed: {
      src: "assets/generated/ada-efeso-pixellab/props/flower-bed.png",
      kind: "furniture", label: "Parterre PixelLab",
      tags: ["flores", "plaza", "pixellab"],
      w: 64, h: 64, colliders: [[-20, -12, 40, 20]], pixelated: true,
    },
    adaWasteBin: {
      src: "assets/generated/ada-efeso-pixellab/props/waste-bin.png",
      kind: "furniture", label: "Papelera PixelLab",
      tags: ["papelera", "peatonal", "pixellab"],
      w: 64, h: 64, colliders: [[-8, -8, 16, 12]], pixelated: true,
    },
    adaFountain: {
      src: "assets/generated/ada-efeso-pixellab/props/fountain.png",
      kind: "furniture", label: "Fuente PixelLab",
      tags: ["fuente", "plaza", "pixellab"],
      w: 64, h: 64, colliders: [[-24, -20, 48, 40]], pixelated: true,
    },
  };
  const assetCatalog = Object.freeze({ ...localCatalog });
  const assetSprites = Object.freeze(Object.fromEntries(
    Object.entries(assetCatalog).map(([id, prototype]) => [id, prototype.src]),
  ));

  const place = (id, sprite, x, y, options = {}) => {
    const prototype = assetCatalog[sprite];
    if (!prototype) throw new Error(`Prototipo desconocido en Ada-Efeso: ${sprite}`);
    const scale = Number(options.scale) || 1;
    const renderedWidth = Number(options.w) || Number(prototype.w) * scale;
    const renderedHeight = Number(options.h) || Number(prototype.h) * scale;
    const customColliders = Array.isArray(options.colliders);
    const colliderScaleX = customColliders ? 1 : renderedWidth / Number(prototype.w);
    const colliderScaleY = customColliders ? 1 : renderedHeight / Number(prototype.h);
    return Object.freeze({
      id, sprite, kind: options.kind || prototype.kind, placement: "layout",
      x, y, depthY: options.depthY ?? y - (prototype.kind === "building" ? 12 : 2),
      w: renderedWidth, h: renderedHeight,
      solid: options.solid ?? prototype.solid ?? true,
      colliders: (options.colliders || prototype.colliders || []).map(([offsetX, offsetY, colliderWidth, colliderHeight]) => [
        offsetX * colliderScaleX,
        offsetY * colliderScaleY,
        colliderWidth * colliderScaleX,
        colliderHeight * colliderScaleY,
      ]),
      ...(options.flipX ? { flipX: true } : {}),
      ...(Number(options.rotation) ? { rotation: Number(options.rotation) } : {}),
      ...(options.label ? { label: options.label } : {}),
      ...(options.entranceFacing ? { entranceFacing: options.entranceFacing } : {}),
      ...(options.accessSide ? { accessSide: options.accessSide } : {}),
      ...(options.parkingFacingFacade ? { parkingFacingFacade: options.parkingFacingFacade } : {}),
    });
  };

  const worldAssets = [];
  const apartmentXs = [552, 824, 1096, 1368];
  const plazaBands = [
    { id: "norte", topY: 284, bottomY: 680 },
    { id: "centro", topY: 1260, bottomY: 1656 },
    { id: "sur", topY: 2236, bottomY: 2632 },
  ];
  plazaBands.forEach((band) => {
    apartmentXs.forEach((x, index) => {
      const common = { w: 248, h: 248, colliders: [[-112, -48, 224, 52]] };
      worldAssets.push(place(`ada-${band.id}-bloque-n-${index + 1}`, "adaApartmentSouth", x, band.topY, {
        ...common,
        entranceFacing: "south",
        accessSide: "plaza",
      }));
      worldAssets.push(place(`ada-${band.id}-bloque-s-${index + 1}`, "adaApartmentNorth", x, band.bottomY, {
        ...common,
        flipX: index % 2 === 1,
        entranceFacing: "north",
        accessSide: "plaza",
        parkingFacingFacade: "doorless",
      }));
    });
  });

  worldAssets.push(
    place("campus-universidad-norte", "efesoUniversity", 1968, 752, {
      w: 420, h: 420, colliders: [[-184, -78, 368, 98]], label: "Facultad Norte",
    }),
    place("campus-universidad-sur", "efesoUniversity", 1968, 1392, {
      w: 420, h: 420, colliders: [[-184, -78, 368, 98]], flipX: true, label: "Facultad Sur",
    }),
    place("parque-infantil-ada", "adaPlayground", 1280, 2940, {
      w: 224, h: 224, colliders: [[-70, -44, 140, 84]],
    }),
  );

  const treePlacements = [
    [520, 434], [810, 434], [1100, 434], [1390, 434],
    [520, 1410], [810, 1410], [1100, 1410], [1390, 1410],
    [520, 2386], [810, 2386], [1100, 2386], [1390, 2386],
    [1576, 310], [1576, 824], [1576, 1338], [1576, 1852], [1576, 2366],
    [1768, 420], [2168, 420], [1768, 1560], [2168, 1560],
  ];
  treePlacements.forEach(([x, y], index) => worldAssets.push(place(`ada-tree-${index + 1}`, "adaTree", x, y, {
    w: 84, h: 84, colliders: [[-12, -13, 24, 20]],
  })));

  const benchPlacements = [
    [664, 480], [1240, 480], [664, 1456], [1240, 1456], [664, 2432], [1240, 2432],
    [1576, 570], [1576, 1090], [1576, 1605], [1576, 2120],
  ];
  benchPlacements.forEach(([x, y], index) => worldAssets.push(place(`ada-bench-${index + 1}`, "adaBench", x, y, {
    w: 64, h: 64, colliders: [[-25, -12, 50, 16]], flipX: index % 2 === 1,
  })));

  const lampPlacements = [
    [412, 338], [412, 860], [412, 1348], [412, 1836], [412, 2324], [412, 2820],
    [1518, 338], [1634, 860], [1518, 1348], [1634, 1836], [1518, 2324], [1634, 2820],
  ];
  lampPlacements.forEach(([x, y], index) => worldAssets.push(place(`ada-lamp-${index + 1}`, "adaStreetlamp", x, y, {
    w: 64, h: 64, colliders: [[-6, -7, 12, 12]],
  })));

  const carSprites = ["adaCarRed", "adaCarBlue", "adaCarWhite", "adaCarYellow"];
  const carPlacements = [
    [560, 900], [752, 900], [944, 900], [1136, 900], [656, 1060], [848, 1060], [1040, 1060], [1232, 1060],
    [560, 1860], [752, 1860], [944, 1860], [1136, 1860], [656, 2028], [848, 2028], [1040, 2028], [1232, 2028],
    [1760, 1950], [1888, 1950], [2080, 1950], [2200, 1950], [1824, 2140], [2016, 2140], [2144, 2140],
    [528, 2852], [720, 2852], [944, 2852], [624, 3016], [816, 3016], [1008, 3016],
    [1504, 2852], [1696, 2852], [1888, 2852], [2080, 2852], [1600, 3016], [1792, 3016], [1984, 3016], [2176, 3016],
  ];
  carPlacements.forEach(([x, y], index) => worldAssets.push(place(
    `ada-car-${index + 1}`,
    carSprites[index % carSprites.length],
    x,
    y,
  )));

  const fountainPlacements = [[960, 512], [960, 1488], [960, 2448]];
  fountainPlacements.forEach(([x, y], index) => worldAssets.push(place(`ada-fountain-${index + 1}`, "adaFountain", x, y, {
    w: 80, h: 80, colliders: [[-30, -25, 60, 50]],
  })));

  const planterPlacements = [
    [520, 544], [1392, 544], [520, 1520], [1392, 1520], [520, 2496], [1392, 2496],
    [1576, 736], [1576, 1248], [1576, 1760], [1576, 2272],
  ];
  planterPlacements.forEach(([x, y], index) => worldAssets.push(place(`ada-planter-${index + 1}`, "adaPlanter", x, y)));

  const bollardPlacements = [
    [416, 448], [416, 512], [416, 1424], [416, 1488], [416, 2400], [416, 2464],
  ];
  bollardPlacements.forEach(([x, y], index) => worldAssets.push(place(`ada-bollard-${index + 1}`, "adaBollard", x, y)));

  const flowerPlacements = [[736, 512], [1184, 512], [736, 1488], [1184, 1488], [736, 2448], [1184, 2448]];
  flowerPlacements.forEach(([x, y], index) => worldAssets.push(place(`ada-flower-${index + 1}`, "adaFlowerBed", x, y)));

  const wasteBinPlacements = [[1536, 512], [1616, 1000], [1536, 1488], [1616, 1960], [1536, 2448]];
  wasteBinPlacements.forEach(([x, y], index) => worldAssets.push(place(`ada-bin-${index + 1}`, "adaWasteBin", x, y)));

  // The fence artwork is a transparent PixelLab sprite. Rotation is applied at
  // runtime for the vertical sides; the base terrain remains completely clean.
  for (let x = 1728, index = 0; x <= 2208; x += 56, index += 1) {
    worldAssets.push(place(`campus-fence-top-${index + 1}`, "adaFenceHorizontal", x, 160, { solid: false }));
  }
  for (let x = 1728, index = 0; x <= 1896; x += 56, index += 1) {
    worldAssets.push(place(`campus-fence-bottom-left-${index + 1}`, "adaFenceHorizontal", x, 1696, { solid: false }));
  }
  for (let x = 2032, index = 0; x <= 2200; x += 56, index += 1) {
    worldAssets.push(place(`campus-fence-bottom-right-${index + 1}`, "adaFenceHorizontal", x, 1696, { solid: false }));
  }
  for (let y = 192, index = 0; y <= 1704; y += 56, index += 1) {
    worldAssets.push(
      place(`campus-fence-left-${index + 1}`, "adaFenceVertical", 1696, y, { solid: false }),
      place(`campus-fence-right-${index + 1}`, "adaFenceVertical", 2240, y, { solid: false }),
    );
  }
  worldAssets.push(place("campus-efeso-sign", "adaCampusSign", 1968, 1712));

  const frozenWorldAssets = Object.freeze(worldAssets);
  const sections = Object.freeze([
    Object.freeze({ id: "avenida-ada", name: "Avenida Ada", x: 32, y: 0, w: 352, h: height }),
    Object.freeze({ id: "plazoletas-norte", name: "Plazoletas Ada Norte", x: 416, y: 64, w: 1088, h: 656 }),
    Object.freeze({ id: "aparcamiento-norte", name: "Aparcamiento Norte", x: 448, y: 760, w: 896, h: 328 }),
    Object.freeze({ id: "plazoletas-centro", name: "Plazoletas Ada Centro", x: 416, y: 1040, w: 1088, h: 656 }),
    Object.freeze({ id: "aparcamiento-centro", name: "Aparcamiento Centro", x: 448, y: 1736, w: 896, h: 328 }),
    Object.freeze({ id: "plazoletas-sur", name: "Plazoletas Ada Sur", x: 416, y: 2016, w: 1088, h: 656 }),
    Object.freeze({ id: "paseo-efeso", name: "Paseo Efeso", x: 1504, y: 64, w: 144, h: 2640 }),
    Object.freeze({ id: "campus-efeso", name: "Campus Efeso", x: 1696, y: 96, w: 544, h: 1568 }),
    Object.freeze({ id: "servicios-sur", name: "Aparcamientos y parque infantil", x: 448, y: 2736, w: 1792, h: 304 }),
  ]);

  const layout = Object.freeze({
    revision: 5,
    width, height, tileSize, navigationCellSize: 8,
    assetCatalog,
    worldAssets: frozenWorldAssets,
    roads: Object.freeze([
      Object.freeze({
        id: "avenida-ada", name: "Avenida Ada", points: Object.freeze([[208, 0], [208, height]]),
        width: 288, surface: "asphalt", sidewalkWidth: 32, curbWidth: 5,
      }),
    ]),
    paths: Object.freeze([
      Object.freeze({ id: "paseo-efeso", name: "Paseo Efeso", points: Object.freeze([[1576, 64], [1576, 2704]]), width: 112, surface: "plaza", walkable: true }),
      Object.freeze({ id: "acceso-plazas-norte", points: Object.freeze([[352, 480], [1576, 480]]), width: 72, surface: "sidewalk", walkable: true }),
      Object.freeze({ id: "acceso-plazas-centro", points: Object.freeze([[352, 1456], [1576, 1456]]), width: 72, surface: "sidewalk", walkable: true }),
      Object.freeze({ id: "acceso-plazas-sur", points: Object.freeze([[352, 2432], [1576, 2432]]), width: 72, surface: "sidewalk", walkable: true }),
    ]),
    surfaceRects: Object.freeze([
      Object.freeze({ id: "plazas-norte", x: 448, y: 288, w: 1056, h: 288, surface: "plaza", walkable: true }),
      Object.freeze({ id: "parking-norte", x: 480, y: 768, w: 864, h: 320, surface: "asphalt", walkable: true }),
      Object.freeze({ id: "plazas-centro", x: 448, y: 1264, w: 1056, h: 288, surface: "plaza", walkable: true }),
      Object.freeze({ id: "parking-centro", x: 480, y: 1744, w: 864, h: 320, surface: "asphalt", walkable: true }),
      Object.freeze({ id: "plazas-sur", x: 448, y: 2240, w: 1056, h: 288, surface: "plaza", walkable: true }),
      Object.freeze({ id: "parking-sur-oeste", x: 448, y: 2768, w: 672, h: 272, surface: "asphalt", walkable: true }),
      Object.freeze({ id: "playground", x: 1168, y: 2768, w: 224, h: 272, surface: "park", walkable: true }),
      Object.freeze({ id: "parking-sur-este", x: 1440, y: 2768, w: 800, h: 272, surface: "asphalt", walkable: true }),
      Object.freeze({ id: "campus-courtyard", x: 1696, y: 128, w: 544, h: 1536, surface: "sidewalk", walkable: true }),
      Object.freeze({ id: "campus-parking", x: 1696, y: 1792, w: 544, h: 352, surface: "asphalt", walkable: true }),
    ]),
    surfacePolygons: Object.freeze([]),
    encounterAreas: Object.freeze([]),
    blockedRects: Object.freeze([]),
    sections,
  });

  const barrierSegments = Object.freeze([
    Object.freeze({ id: "campus-fence-top", points: Object.freeze([[1696, 128], [2240, 128]]), width: 12 }),
    Object.freeze({ id: "campus-fence-left", points: Object.freeze([[1696, 128], [1696, 1664]]), width: 12 }),
    Object.freeze({ id: "campus-fence-right", points: Object.freeze([[2240, 128], [2240, 1664]]), width: 12 }),
    Object.freeze({ id: "campus-fence-bottom-left", points: Object.freeze([[1696, 1664], [1932, 1664]]), width: 12 }),
    Object.freeze({ id: "campus-fence-bottom-right", points: Object.freeze([[2004, 1664], [2240, 1664]]), width: 12 }),
  ]);

  /* Los escondites son provisionales: se sustituyen aquí cuando el usuario
     facilite las tres posiciones definitivas, sin tocar la lógica de la escena. */
  const openingSequence = Object.freeze({
    id: "ada-efeso-robbery-intro",
    type: "roadside-robbery",
    startNewGameHere: true,
    startAreaId: "avenida-ada",
    skipStarterVideo: true,
    skipDoctorPotato: true,
    player: Object.freeze({ x: 208, y: 2832, faintedDirection: "south-west", standingDirection: "down-left" }),
    timing: Object.freeze({ fadeMs: 2400, faintedMs: 2300, gettingUpMs: 1600, startledMs: 560, fleeMs: 2100 }),
    thieves: Object.freeze([
      Object.freeze({
        id: "ada-thief-wallet", name: "Ladrón de la cartera", item: "CARTERA", sprite: "skater-capucha",
        start: Object.freeze([144, 2798]), provisionalHide: Object.freeze([72, 2704]), fleeDirection: "left",
      }),
      Object.freeze({
        id: "ada-thief-phone", name: "Ladrón del móvil", item: "MÓVIL", sprite: "npc-22-teen-boy",
        start: Object.freeze([272, 2798]), provisionalHide: Object.freeze([400, 2704]), fleeDirection: "right",
      }),
      Object.freeze({
        id: "ada-thief-keys", name: "Ladrona de las llaves", item: "LLAVES", sprite: "rival",
        start: Object.freeze([208, 2896]), provisionalHide: Object.freeze([208, 3040]), fleeDirection: "down",
      }),
    ]),
  });

  const config = Object.freeze({
    id: "ada-efeso",
    name: "Distrito Ada-Efeso",
    kind: "district",
    revision: 7,
    previewImage: "maps/ada-efeso/base-pixellab-borderless.png",
    width, height,
    baseWidth: width, baseHeight: height,
    sourceWidth: width, sourceHeight: height,
    textureScale: 1,
    tileColumns: 1, tileRows: 1,
    chunkSize: Math.max(width, height), chunkGutter: 0,
    memoryBudgetMB: 24, prefetchLimit: 0,
    tiles: Object.freeze([
      Object.freeze({ id: "r0-c0", col: 0, row: 0, x: 0, y: 0, w: width, h: height, image: "maps/ada-efeso/base-pixellab-borderless.png" }),
    ]),
    tileSize,
    defaultTile: "blocked",
    spawn: Object.freeze({ x: openingSequence.player.x, y: openingSequence.player.y, direction: "down" }),
    openingSequence,
    assetSprites,
    assetRevision: 5,
    worldAssets: frozenWorldAssets,
    editorVacatedRects: Object.freeze([]),
    sections,
    extensionSurfaces: Object.freeze([]),
    buildingFootprints: Object.freeze([]),
    barrierSegments,
    blockedRects: Object.freeze([]),
    walkableRects: Object.freeze([
      Object.freeze([2, 1, 11, 94]),
      Object.freeze([11, 1, 51, 94]),
      Object.freeze([52, 4, 69, 52]),
      Object.freeze([52, 56, 69, 67]),
      Object.freeze([44, 85, 69, 94]),
    ]),
    walkableSegments: Object.freeze([]),
    encounterAreas: Object.freeze([]), encounterTiles: Object.freeze([]), encounterRects: Object.freeze([]),
    entrances: Object.freeze([]),
    npcs: Object.freeze([]),
    events: Object.freeze([
      Object.freeze({
        id: "ada-efeso-welcome", scene: "world", col: 6, row: 89,
        label: "Avenida Ada", type: "thought", trigger: "step",
        message: "Avenida Ada avanza con dos carriles por sentido. Al este, tres calles de plazoletas desembocan en el Paseo Efeso.",
        once: true, enabled: true,
      }),
      Object.freeze({
        id: "ada-plazas-norte", scene: "world", col: 30, row: 15,
        label: "Plazoletas Norte", type: "thought", trigger: "step",
        message: "Tres plazoletas cuadradas se encadenan entre bloques residenciales blancos de cuatro plantas.",
        once: true, enabled: true,
      }),
      Object.freeze({
        id: "efeso-sign", scene: "world", col: 49, row: 46,
        label: "Paseo Efeso", type: "thought", trigger: "interact",
        message: "PASEO EFESO · Eje peatonal de las tres calles residenciales y acceso al campus.",
        once: false, enabled: true,
      }),
      Object.freeze({
        id: "campus-sign", scene: "world", col: 61, row: 53,
        label: "Campus Efeso", type: "thought", trigger: "interact",
        message: "CAMPUS EFESO · Dos edificios universitarios blancos dentro de una valla perimetral.",
        once: false, enabled: true,
      }),
      Object.freeze({
        id: "playground-sign", scene: "world", col: 40, row: 92,
        label: "Parque infantil", type: "thought", trigger: "interact",
        message: "Un pequeño parque infantil separa los dos aparcamientos del extremo sur.",
        once: false, enabled: true,
      }),
    ]),
    encounters: Object.freeze([]),
    worldObjects: Object.freeze([]),
    pointsOfInterest: Object.freeze([
      Object.freeze({ id: "avenida-ada", name: "Avenida Ada", x: 208, y: 1536 }),
      Object.freeze({ id: "paseo-efeso", name: "Paseo Efeso", x: 1576, y: 1456 }),
      Object.freeze({ id: "campus-efeso", name: "Campus Efeso", x: 1968, y: 1000 }),
      Object.freeze({ id: "parque-infantil", name: "Parque infantil", x: 1280, y: 2940 }),
    ]),
  });

  root.ADA_EFESO_MAP_LAYOUT = layout;
  root.ADA_EFESO_MAP_CONFIG = config;
  root.GAME_MAP_REGISTRY.register("ada-efeso", {
    name: config.name,
    aliases: ["avenida-ada", "paseo-efeso"],
    config,
    layout,
    editorData,
    editorDataPath: "maps/ada-efeso/editor-data.js",
  });
})(globalThis);
