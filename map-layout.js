/*
 * Fuente de verdad declarativa del exterior de San Pablo.
 *
 * El compilador de `tools/compile-san-pablo-map.py` consume las superficies
 * y el runtime consume el mismo catalogo de sprites/placements. Asi, un suelo
 * gris o marron dibujado como transitable no puede divergir de la navegacion.
 * Todas las coordenadas estan en pixeles logicos del mundo (2508 x 2508).
 */
(function buildSanPabloLayout() {
  "use strict";

  const editorData = window.CITY_MAP_EDITOR_DATA || {};

  const assetCatalog = Object.freeze({
    institutional: {
      src: "assets/generated/san-pablo-derived/runtime/building-institutional.png",
      kind: "building", w: 440, h: 354, colliders: [[-176, -55, 352, 50]],
    },
    clinic: {
      src: "assets/generated/san-pablo-derived/runtime/building-clinic-red.png",
      kind: "building", w: 323, h: 252, colliders: [[-135, -65, 270, 55]],
    },
    blueHouse: {
      src: "assets/generated/san-pablo-derived/runtime/building-house-blue.png",
      kind: "building", w: 280, h: 300, colliders: [[-104, -70, 208, 48]],
    },
    residential: {
      src: "assets/generated/san-pablo-derived/runtime/building-residential-tan.png",
      kind: "building", w: 147, h: 195, colliders: [[-55, -38, 110, 34]],
    },
    traditional: {
      src: "assets/generated/san-pablo-derived/runtime/building-traditional-red.png",
      kind: "building", w: 224, h: 220, colliders: [[-88, -48, 176, 42]],
    },
    rowhouse: {
      src: "assets/generated/san-pablo-rebuilt/runtime/building-rowhouse-tan.png",
      kind: "building", w: 400, h: 188, colliders: [[-176, -42, 352, 38]],
    },
    campus: {
      src: "assets/generated/san-pablo-rebuilt/runtime/building-campus-civic.png",
      kind: "building", w: 430, h: 314, colliders: [[-174, -58, 348, 52]],
    },
    bank: {
      src: "assets/generated/san-pablo-rebuilt/runtime/building-bank-civic.png",
      kind: "building", w: 320, h: 320, colliders: [[-126, -70, 252, 62]],
    },
    modern: {
      src: "assets/generated/san-pablo-rebuilt/runtime/building-modern-southeast.png",
      kind: "building", w: 380, h: 340, colliders: [[-142, -72, 284, 64]],
    },
    evergreen: {
      src: "assets/generated/san-pablo-derived/runtime/tree-evergreen.png",
      kind: "tree", w: 69, h: 108, colliders: [[-12, -17, 24, 17]],
    },
    deciduous: {
      src: "assets/generated/san-pablo-rebuilt/runtime/tree-deciduous.png",
      kind: "tree", w: 88, h: 108, colliders: [[-14, -18, 28, 18]],
    },
    cherry: {
      src: "assets/generated/san-pablo-derived/runtime/tree-cherry.png",
      kind: "tree", w: 93, h: 105, colliders: [[-13, -18, 26, 18]],
    },
    streetlamp: {
      src: "assets/generated/san-pablo-derived/runtime/prop-streetlamp.png",
      kind: "prop", w: 28, h: 72, colliders: [[-5, -8, 10, 8]],
    },
    bench: {
      src: "assets/generated/san-pablo-derived/runtime/prop-park-bench.png",
      kind: "prop", w: 76, h: 44, colliders: [[-30, -12, 60, 12]],
    },
    hedge: {
      src: "assets/generated/san-pablo-derived/runtime/prop-hedge-flowerbed.png",
      kind: "prop", w: 242, h: 44, colliders: [[-121, -18, 242, 18]],
    },
    thornBarrier: {
      src: "assets/generated/san-pablo-rebuilt/runtime/prop-thorn-barrier.png",
      kind: "blocker", w: 112, h: 32, colliders: [[-56, -17, 112, 17]],
    },
  });

  const worldAssets = [];
  const addAsset = (id, sprite, x, y, options = {}) => {
    const prototype = assetCatalog[sprite];
    if (!prototype) throw new Error(`Prototipo desconocido: ${sprite}`);
    const asset = {
      id,
      sprite,
      kind: options.kind || prototype.kind,
      placement: "layout",
      x,
      y,
      depthY: options.depthY ?? (y - (prototype.kind === "building" ? 10 : 2)),
      w: options.w || prototype.w,
      h: options.h || prototype.h,
      solid: options.solid ?? true,
      colliders: options.colliders || prototype.colliders,
    };
    for (const key of ["door", "approach", "interaction", "rotation", "flipX", "label", "district"]) {
      if (options[key] !== undefined) asset[key] = options[key];
    }
    worldAssets.push(asset);
    return asset;
  };

  /* Edificios singulares: conservan los hitos y puertas del mapa de partida. */
  addAsset("north-institution", "institutional", 1464, 430, {
    door: [45, 13], approach: [1456, 464, "up"], label: "UNED Sevilla", district: "north-center",
  });
  addAsset("west-clinic", "clinic", 588, 700, {
    door: [18, 21], approach: [592, 722, "up"], label: "Centro de Salud San Pablo", district: "north-west",
  });
  addAsset("jasmine-gallery", "blueHouse", 1490, 860, {
    door: [46, 25], approach: [1488, 854, "up"], label: "Galeria Jazmin", district: "north-center",
  });
  addAsset("central-civic-campus", "campus", 1360, 1740, {
    door: [42, 54], approach: [1360, 1776, "up"], label: "Campus Civico", district: "central-center",
  });
  addAsset("southeast-bank", "bank", 2224, 1932, {
    door: [69, 60], approach: [2224, 1968, "up"], label: "Banco San Pablo", district: "central-east",
  });
  addAsset("southeast-services", "modern", 2144, 2380, {
    door: [67, 73], approach: [2160, 2390, "up"], label: "Servicios del Sureste", district: "south-east",
  });
  addAsset("south-campus-annex", "modern", 1620, 2478, {
    depthY: 2452, label: "Anexo Sur", district: "south-center",
  });

  /* Viviendas tan: las hileras solo se repiten donde la referencia comparte modulo. */
  const rowhouses = [
    ["west-row-01a", 540, 970], ["west-row-01b", 930, 970],
    ["west-row-02a", 540, 1228], ["west-row-02b", 930, 1292],
    ["west-row-03a", 540, 1510], ["west-row-03b", 930, 1510],
    ["west-row-04a", 540, 1708], ["west-row-04b", 930, 1765],
    ["west-row-05a", 540, 1990], ["west-row-05b", 930, 1996],
    ["east-row-01", 2100, 704], ["east-row-02", 2100, 908], ["east-row-03", 2080, 1240],
  ];
  rowhouses.forEach(([id, x, y]) => addAsset(id, "rowhouse", x, y, { district: x < 1254 ? "west" : "east" }));

  /* Las puertas historicas se fijan al modulo o casa mas cercano. */
  Object.assign(worldAssets.find((asset) => asset.id === "west-row-01a"), {
    door: [21, 30], approach: [688, 1008, "up"],
  });
  Object.assign(worldAssets.find((asset) => asset.id === "west-row-02b"), {
    door: [30, 40], approach: [976, 1328, "up"],
  });
  Object.assign(worldAssets.find((asset) => asset.id === "west-row-04a"), {
    door: [21, 53], approach: [688, 1744, "up"],
  });
  Object.assign(worldAssets.find((asset) => asset.id === "west-row-05b"), {
    door: [30, 62], approach: [976, 2032, "up"],
  });
  Object.assign(worldAssets.find((asset) => asset.id === "east-row-02"), {
    door: [61, 28], approach: [1968, 944, "up"],
  });
  addAsset("east-house-hebron", "residential", 2288, 1292, {
    door: [71, 40], approach: [2288, 1328, "up"], district: "central-east",
  });
  addAsset("red-quarter-home", "traditional", 1968, 1644, {
    door: [61, 51], approach: [1968, 1680, "up"], colliders: [[-48, -42, 96, 36]], district: "central-east",
  });
  addAsset("south-park-house", "blueHouse", 1320, 2220, {
    door: [39, 69], approach: [1264, 2256, "up"], colliders: [[-100, -70, 80, 48]], district: "south-center",
  });

  /* Aldea norte y barrio tradicional: siluetas distintas, sin clonacion indiscriminada. */
  [
    ["north-home-01", 520, 330], ["north-home-02", 690, 420], ["north-home-03", 875, 430],
    ["east-small-01", 1890, 952], ["east-small-02", 2320, 968],
  ].forEach(([id, x, y]) => addAsset(id, "residential", x, y));
  [
    ["red-home-01", 2250, 1500], ["red-home-02", 2110, 1710],
    ["red-home-03", 1810, 1880], ["red-home-04", 1990, 2010],
  ].forEach(([id, x, y]) => addAsset(id, "traditional", x, y, { district: "red-quarter" }));

  /* Bosque perimetral: una sola familia reusable, con ritmo irregular controlado. */
  let borderIndex = 0;
  for (let x = 48; x <= 2460; x += 72) {
    if (x < 130 || x > 300) addAsset(`border-top-${borderIndex++}`, "evergreen", x, 112 + (borderIndex % 3) * 4);
  }
  for (let x = 48; x <= 2460; x += 76) {
    if (x < 520 || x > 780) addAsset(`border-bottom-${borderIndex++}`, "evergreen", x, 2502 - (borderIndex % 2) * 4);
  }
  for (let y = 190; y <= 2400; y += 86) {
    addAsset(`border-left-${borderIndex++}`, "evergreen", 54 + (borderIndex % 2) * 5, y);
    addAsset(`border-right-${borderIndex++}`, "evergreen", 2454 - (borderIndex % 2) * 5, y);
  }

  /* Arbolado interior por distrito. */
  [
    [390, 390], [770, 310], [1030, 380], [1850, 260], [1980, 220], [2240, 270],
    [410, 760], [820, 720], [1110, 760], [1840, 690], [2360, 690],
    [410, 1160], [1080, 1180], [1830, 1160], [2380, 1140],
    [400, 1450], [1080, 1450], [410, 1730], [1080, 1740],
    [380, 2010], [1080, 2020], [470, 2180], [560, 2310], [820, 2240], [950, 2410],
    [1510, 1420], [1700, 1860], [2320, 2140],
  ].forEach(([x, y], index) => addAsset(`deciduous-${index + 1}`, "deciduous", x, y));
  [
    [1740, 1570], [1700, 1660], [1880, 1760], [1750, 1880], [1650, 1990],
    [1580, 2070], [1500, 2080], [1500, 2240], [2180, 1510], [2160, 1600],
  ].forEach(([x, y], index) => addAsset(`cherry-diagonal-${index + 1}`, "cherry", x, y));

  /* Farolas siempre al borde de la acera; no estrechan el centro util. */
  const lamps = [
    [330, 470], [620, 470], [910, 470], [1210, 440], [1510, 470], [1810, 470], [2110, 470], [2380, 470],
    [315, 760], [315, 1020], [315, 1280], [315, 1550], [315, 1810], [315, 2070],
    [1110, 740], [1110, 1010], [1110, 1280], [1110, 1560], [1110, 1795], [1110, 2070],
    [1818, 720], [1818, 990], [1818, 1280], [2325, 720], [2325, 990],
    [1460, 2110], [1690, 1935], [1915, 1755], [2140, 1565],
  ];
  lamps.forEach(([x, y], index) => addAsset(`lamp-${index + 1}`, "streetlamp", x, y));

  /* Mobiliario y setos: agrupados en parques/plazas, no dispersos sobre la calzada. */
  [
    [1940, 330], [2140, 330], [720, 2260], [850, 2320], [1540, 1420], [1700, 1420], [2160, 2050],
  ].forEach(([x, y], index) => addAsset(`bench-${index + 1}`, "bench", x, y));
  [
    [400, 740], [850, 740], [540, 1010], [930, 1010], [540, 1270], [930, 1270],
    [540, 1540], [930, 1540], [540, 1810], [930, 1810], [540, 2070], [830, 2070],
    [1350, 440], [1900, 440], [2200, 440], [1370, 1810], [2050, 2010],
    [2020, 1050], [2210, 1050], [2020, 1340], [2350, 1360],
  ].forEach(([x, y], index) => addAsset(`hedge-${index + 1}`, "hedge", x, y));

  const blockerMessage = "Parece que necesito algo para avanzar";
  const addBlocker = (id, x, y, rotation, colliders, label) => addAsset(id, "thornBarrier", x, y, {
    rotation,
    colliders,
    label,
    interaction: {
      prompt: "Examinar obstaculo",
      lines: [blockerMessage],
    },
  });
  addBlocker("blocker-north-exit", 208, 158, 0, [[-56, -18, 112, 18]], "Salida norte");
  addBlocker("blocker-east-jerusalen", 2410, 505, 90, [[-18, -60, 36, 120]], "Salida este");
  addBlocker("blocker-southwest-road", 690, 2465, -24, [[-68, -28, 136, 44]], "Prolongacion suroeste");
  addBlocker("blocker-south-complex", 2050, 2460, 0, [[-56, -22, 112, 22]], "Acceso al complejo sur");
  addBlocker("blocker-north-farm", 2320, 430, 0, [[-56, -18, 112, 18]], "Huerto comunitario");

  const roads = Object.freeze([
    { id: "ada-north", name: "Avenida de la Ada · Entrada Norte", points: [[208, 42], [210, 286]], width: 118, surface: "road", sidewalkWidth: 14, curbWidth: 4, roundCaps: false },
    { id: "northwest-link", name: "Enlace Noroeste", points: [[210, 286], [760, 505]], width: 126, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "jerusalen", name: "Calle Jerusalen", points: [[290, 505], [2410, 505]], width: 126, surface: "road", sidewalkWidth: 16, curbWidth: 4 },
    { id: "ada", name: "Avenida de la Ada", points: [[252, 500], [252, 2215]], width: 112, surface: "road", sidewalkWidth: 16, curbWidth: 4 },
    { id: "jaffa", name: "Calle Jaffa", points: [[1158, 500], [1158, 2225]], width: 82, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "miletos", name: "Calle Miletos", points: [[1772, 500], [1772, 1715]], width: 82, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "estambul", name: "Calle Estambul", points: [[250, 790], [1128, 790]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "memphis", name: "Calle Memphis", points: [[250, 1042], [1128, 1042]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "persepolis", name: "Calle Persepolis", points: [[250, 1300], [1128, 1300]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "siracusa", name: "Calle Siracusa", points: [[250, 1572], [1128, 1572]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "residencial-sur-1", name: "Paseo de Tiro", points: [[250, 1835], [1128, 1835]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "residencial-sur-2", name: "Paseo de Sidon", points: [[250, 2092], [1128, 2092]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "ninive", name: "Calle Ninive", points: [[1770, 742], [2380, 742]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "hebron", name: "Calle Hebron", points: [[1770, 1016], [2380, 1016]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "east-access", name: "Acceso de Miletos", points: [[1770, 1300], [2320, 1300]], width: 78, surface: "road", sidewalkWidth: 14, curbWidth: 4 },
    { id: "tesalonica", name: "Calle Tesalonica", points: [[1138, 2205], [2240, 1320]], width: 134, surface: "road", sidewalkWidth: 16, curbWidth: 4 },
    { id: "southwest-extension", name: "Prolongacion Suroeste", points: [[610, 2510], [1470, 2150]], width: 112, surface: "road", sidewalkWidth: 14, curbWidth: 4, roundCaps: false },
  ]);

  const paths = Object.freeze([
    { id: "path-uned-west", points: [[1120, 180], [1120, 430], [1240, 464], [1456, 464]], width: 32, surface: "dirt" },
    { id: "path-north-park", points: [[1840, 300], [2050, 300], [2240, 300]], width: 34, surface: "dirt" },
    { id: "path-north-park-branch", points: [[2050, 150], [2050, 410]], width: 30, surface: "dirt" },
    { id: "access-clinic", points: [[592, 722], [592, 790]], width: 30, surface: "sidewalk" },
    { id: "access-gallery", points: [[1488, 854], [1488, 910], [1158, 910]], width: 28, surface: "dirt" },
    { id: "access-house-estambul", points: [[688, 1008], [688, 1042]], width: 30, surface: "sidewalk" },
    { id: "access-house-persepolis", points: [[976, 1328], [976, 1300]], width: 30, surface: "sidewalk" },
    { id: "access-house-siracusa", points: [[688, 1744], [688, 1835]], width: 30, surface: "dirt" },
    { id: "access-house-sidon", points: [[976, 2032], [976, 2092]], width: 30, surface: "sidewalk" },
    { id: "access-house-ninive", points: [[1968, 944], [1968, 1016]], width: 30, surface: "sidewalk" },
    { id: "access-house-hebron", points: [[2288, 1328], [2288, 1300]], width: 30, surface: "sidewalk" },
    { id: "access-red-home", points: [[1968, 1680], [1968, 1740]], width: 34, surface: "dirt" },
    { id: "access-campus", points: [[1360, 1776], [1260, 1776], [1158, 1776]], width: 42, surface: "sidewalk" },
    { id: "access-park-house", points: [[1264, 2256], [1264, 2300], [1140, 2300]], width: 34, surface: "dirt" },
    { id: "access-route", points: [[1712, 2288], [1640, 2205], [1530, 2145]], width: 42, surface: "dirt" },
    { id: "access-bank", points: [[2224, 1968], [2224, 2030]], width: 38, surface: "sidewalk" },
    { id: "access-modern", points: [[2160, 2390], [2160, 2435]], width: 42, surface: "sidewalk" },
    { id: "south-park-main", points: [[420, 2210], [720, 2290], [1030, 2210], [1190, 2130]], width: 38, surface: "dirt" },
    { id: "south-park-loop", points: [[620, 2160], [620, 2370], [900, 2370], [900, 2160]], width: 30, surface: "dirt" },
  ]);

  const surfaceRects = Object.freeze([
    { id: "northwest-paved-entry", x: 94, y: 58, w: 330, h: 220, surface: "sidewalk", walkable: true },
    { id: "uned-front-plaza", x: 1180, y: 360, w: 560, h: 125, surface: "sidewalk", walkable: true },
    { id: "north-park", x: 1810, y: 105, w: 520, h: 330, surface: "dirt", walkable: true },
    { id: "north-farm-soil", x: 2290, y: 90, w: 175, h: 325, surface: "dirt", walkable: false },
    { id: "clinic-precinct", x: 330, y: 610, w: 520, h: 165, surface: "sidewalk", walkable: true },
    { id: "gallery-courtyard", x: 1190, y: 620, w: 500, h: 290, surface: "dirt", walkable: true },
    { id: "football-pitch", x: 1500, y: 930, w: 235, h: 330, surface: "grass", walkable: true },
    { id: "field-south-plaza", x: 1430, y: 1260, w: 360, h: 260, surface: "sidewalk", walkable: true },
    { id: "central-civic-plaza", x: 1180, y: 1030, w: 500, h: 800, surface: "sidewalk", walkable: true },
    { id: "red-quarter-courtyard", x: 1740, y: 1430, w: 610, h: 520, surface: "dirt", walkable: true },
    { id: "bank-plaza", x: 1990, y: 1770, w: 470, h: 310, surface: "sidewalk", walkable: true },
    { id: "south-services-plaza", x: 1450, y: 2070, w: 970, h: 430, surface: "sidewalk", walkable: true },
    { id: "grass-uned-west", name: "Pradera de la UNED", x: 944, y: 176, w: 160, h: 128, surface: "grass", walkable: true, encounter: true },
    { id: "grass-north-park-west", name: "Hierba del Parque Norte", x: 1888, y: 128, w: 64, h: 128, surface: "grass", walkable: true, encounter: true },
    { id: "grass-north-park-east", name: "Hierba del Parque Norte", x: 2080, y: 128, w: 128, h: 128, surface: "grass", walkable: true, encounter: true },
    { id: "grass-south-park-west", name: "Hierba del Parque Sur", x: 368, y: 2312, w: 238, h: 112, surface: "grass", walkable: true, encounter: true },
    { id: "grass-tesalonica-garden", name: "Jardín de Tesalónica", x: 1648, y: 1992, w: 80, h: 64, surface: "grass", walkable: true, encounter: true },
  ]);

  const surfacePolygons = Object.freeze([
    { id: "south-park-lawn", points: [[330, 2110], [1110, 2110], [1260, 2240], [1030, 2470], [370, 2470]], surface: "grass", walkable: false },
    { id: "tesalonica-garden", points: [[1390, 2060], [1660, 1900], [1820, 2100], [1570, 2260]], surface: "dirt", walkable: true },
    { id: "grass-south-park-east", name: "Hierba del Parque Sur", points: [[916, 2152], [1024, 2152], [1024, 2192], [960, 2208], [916, 2208]], surface: "grass", walkable: true, encounter: true },
  ]);

  const encounterAreas = Object.freeze([
    ...surfaceRects.filter((surface) => surface.encounter).map((surface) => Object.freeze({
      id: surface.id,
      name: surface.name,
      shape: "rect",
      x: surface.x,
      y: surface.y,
      w: surface.w,
      h: surface.h,
    })),
    ...surfacePolygons.filter((surface) => surface.encounter).map((surface) => Object.freeze({
      id: surface.id,
      name: surface.name,
      shape: "polygon",
      points: surface.points,
    })),
  ]);

  const blockers = Object.freeze([
    { id: "blocker-north-exit", x: 148, y: 140, w: 120, h: 28 },
    { id: "blocker-east-jerusalen", x: 2392, y: 445, w: 36, h: 120 },
    { id: "blocker-southwest-road", x: 622, y: 2437, w: 136, h: 44 },
    { id: "blocker-south-complex", x: 1988, y: 2438, w: 124, h: 30 },
    { id: "blocker-north-farm", x: 2260, y: 412, w: 120, h: 24 },
  ]);

  const sections = Object.freeze([
    { id: "north-west", name: "San Pablo · Noroeste", x: 0, y: 0, w: 836, h: 836 },
    { id: "north-center", name: "San Pablo · Norte Centro", x: 836, y: 0, w: 836, h: 836 },
    { id: "north-east", name: "San Pablo · Nordeste", x: 1672, y: 0, w: 836, h: 836 },
    { id: "central-west", name: "San Pablo · Oeste", x: 0, y: 836, w: 836, h: 836 },
    { id: "central-center", name: "San Pablo · Centro Civico", x: 836, y: 836, w: 836, h: 836 },
    { id: "central-east", name: "San Pablo · Barrio Este", x: 1672, y: 836, w: 836, h: 836 },
    { id: "south-west", name: "San Pablo · Parque Sur", x: 0, y: 1672, w: 836, h: 836 },
    { id: "south-center", name: "San Pablo · Tesalonica", x: 836, y: 1672, w: 836, h: 836 },
    { id: "south-east", name: "San Pablo · Distrito Moderno", x: 1672, y: 1672, w: 836, h: 836 },
  ]);

  /* Los cambios del editor se aplican antes de congelar el layout. El archivo
     map-editor-data.js queda asi como parte de la fuente de verdad del juego,
     aunque las herramientas para modificarlo solo existan en desarrollo. */
  const applyEditorTransform = (asset, transform = {}) => {
    const previousX = Number(asset.x) || 0;
    const previousY = Number(asset.y) || 0;
    const scale = Math.max(.25, Math.min(4, Number(transform.scale) || 1));
    const baseWidth = Number(asset.w) || 1;
    const baseHeight = Number(asset.h) || 1;
    const baseColliders = (asset.colliders || []).map((collider) => [...collider]);
    if (Number.isFinite(Number(transform.x))) asset.x = Number(transform.x);
    if (Number.isFinite(Number(transform.y))) asset.y = Number(transform.y);
    if (Number.isFinite(Number(transform.depthY))) asset.depthY = Number(transform.depthY);
    else if (transform.y !== undefined) asset.depthY = asset.y - (asset.kind === "building" ? 10 : 2);
    if (Number.isFinite(Number(transform.rotation))) asset.rotation = Number(transform.rotation);
    if (typeof transform.flipX === "boolean") asset.flipX = transform.flipX;
    if (typeof transform.solid === "boolean") asset.solid = transform.solid;
    if (typeof transform.label === "string" && transform.label.trim()) asset.label = transform.label.trim().slice(0, 80);
    const deltaX = (Number(asset.x) || 0) - previousX;
    const deltaY = (Number(asset.y) || 0) - previousY;
    if (Array.isArray(asset.door) && asset.door.length >= 2 && (deltaX || deltaY)) {
      asset.sourceDoor = asset.sourceDoor || [...asset.door];
      asset.door = [
        Math.max(0, Math.min(78, Math.round(Number(asset.door[0]) + deltaX / 32))),
        Math.max(0, Math.min(78, Math.round(Number(asset.door[1]) + deltaY / 32))),
      ];
    }
    if (Array.isArray(asset.approach) && asset.approach.length >= 2 && (deltaX || deltaY)) {
      asset.approach = [
        Number(asset.approach[0]) + deltaX,
        Number(asset.approach[1]) + deltaY,
        asset.approach[2] || "up",
      ];
    }
    asset.scale = scale;
    asset.w = Math.round(baseWidth * scale * 100) / 100;
    asset.h = Math.round(baseHeight * scale * 100) / 100;
    asset.colliders = baseColliders.map(([x, y, w, h]) => [x * scale, y * scale, w * scale, h * scale]);
    return asset;
  };

  const assetOverrides = editorData.assetOverrides && typeof editorData.assetOverrides === "object"
    ? editorData.assetOverrides
    : {};
  const hiddenAssetIds = new Set(Array.isArray(editorData.hiddenAssets) ? editorData.hiddenAssets : []);
  const editedBaseIds = new Set([...Object.keys(assetOverrides), ...hiddenAssetIds]);
  const editorVacatedRects = worldAssets
    .filter((asset) => editedBaseIds.has(asset.id))
    .flatMap((asset) => (asset.colliders || []).map(([x, y, w, h]) => ({
      x: Number(asset.x) + Number(x), y: Number(asset.y) + Number(y),
      w: Number(w), h: Number(h), sourceAssetId: asset.id,
    })));
  worldAssets.forEach((asset) => {
    if (assetOverrides[asset.id]) applyEditorTransform(asset, assetOverrides[asset.id]);
  });
  const knownIds = new Set(worldAssets.map((asset) => asset.id));
  (Array.isArray(editorData.addedAssets) ? editorData.addedAssets : []).forEach((entry) => {
    if (!entry || typeof entry.id !== "string" || knownIds.has(entry.id) || !assetCatalog[entry.sprite]) return;
    const asset = addAsset(entry.id, entry.sprite, Number(entry.x), Number(entry.y), {
      label: entry.label || `Objeto ${entry.sprite}`,
      solid: entry.solid !== false,
    });
    asset.placement = "editor";
    applyEditorTransform(asset, entry);
    knownIds.add(asset.id);
  });
  const visibleWorldAssets = worldAssets.filter((asset) => !hiddenAssetIds.has(asset.id));
  const assetDoors = visibleWorldAssets
    .filter((asset) => Array.isArray(asset.door) && asset.door.length >= 2)
    .map((asset) => Object.freeze({
      assetId: asset.id,
      sourceCol: Number(asset.sourceDoor?.[0] ?? asset.door[0]),
      sourceRow: Number(asset.sourceDoor?.[1] ?? asset.door[1]),
      col: Number(asset.door[0]),
      row: Number(asset.door[1]),
      approach: Array.isArray(asset.approach) ? [...asset.approach] : null,
      label: asset.label || asset.id,
    }));
  const hiddenAssetDoors = worldAssets
    .filter((asset) => hiddenAssetIds.has(asset.id) && Array.isArray(asset.door) && asset.door.length >= 2)
    .map((asset) => Object.freeze({
      col: Number(asset.sourceDoor?.[0] ?? asset.door[0]),
      row: Number(asset.sourceDoor?.[1] ?? asset.door[1]),
      assetId: asset.id,
    }));

  const layout = Object.freeze({
    revision: 3,
    width: 2508,
    height: 2508,
    tileSize: 32,
    navigationCellSize: 8,
    includeMapDataWalkability: false,
    assetCatalog,
    worldAssets: Object.freeze(visibleWorldAssets.map((asset) => Object.freeze(asset))),
    assetDoors: Object.freeze(assetDoors),
    hiddenAssetDoors: Object.freeze(hiddenAssetDoors),
    editorVacatedRects: Object.freeze(editorVacatedRects.map((rect) => Object.freeze(rect))),
    roads,
    paths,
    surfaceRects,
    surfacePolygons,
    encounterAreas,
    sportsFields: Object.freeze([
      { id: "football-field", x: 1500, y: 930, w: 235, h: 330, gate: { side: "bottom", from: 160, to: 215 } },
    ]),
    blockers,
    blockedSegments: Object.freeze([
      { id: "field-fence-top", points: [[1500, 930], [1735, 930]], width: 10 },
      { id: "field-fence-left", points: [[1500, 930], [1500, 1260]], width: 10 },
      { id: "field-fence-right", points: [[1735, 930], [1735, 1260]], width: 10 },
      { id: "field-fence-bottom-left", points: [[1500, 1260], [1660, 1260]], width: 10 },
      { id: "field-fence-bottom-right", points: [[1715, 1260], [1735, 1260]], width: 10 },
    ]),
    blockedRects: Object.freeze([
      { id: "edge-top", x: 0, y: 0, w: 2508, h: 28 },
      { id: "edge-bottom", x: 0, y: 2480, w: 2508, h: 28 },
      { id: "edge-left", x: 0, y: 0, w: 28, h: 2508 },
      { id: "edge-right", x: 2480, y: 0, w: 28, h: 2508 },
    ]),
    sections,
    blockerMessage,
  });

  window.CITY_MAP_LAYOUT = layout;
  if (typeof module !== "undefined" && module.exports) module.exports = { CITY_MAP_LAYOUT: layout };
}());
