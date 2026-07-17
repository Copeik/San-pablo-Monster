(function buildCiudadAzaharLayout(root) {
  "use strict";

  const width = 2560;
  const height = 2304;
  const tileSize = 32;

  const assetCatalog = Object.freeze({
    institutional: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/building-institutional.png",
      kind: "building", label: "Edificio institucional", w: 440, h: 354,
      colliders: Object.freeze([Object.freeze([-176, -55, 352, 50])]),
    }),
    clinic: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/building-clinic-red.png",
      kind: "building", label: "Centro de salud", w: 323, h: 252,
      colliders: Object.freeze([Object.freeze([-135, -65, 270, 55])]),
    }),
    blueHouse: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/building-house-blue.png",
      kind: "building", label: "Casa de tejado azul", w: 280, h: 300,
      colliders: Object.freeze([Object.freeze([-104, -70, 208, 48])]),
    }),
    residential: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/building-residential-tan.png",
      kind: "building", label: "Vivienda beige", w: 147, h: 195,
      colliders: Object.freeze([Object.freeze([-55, -38, 110, 34])]),
    }),
    traditional: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/building-traditional-red.png",
      kind: "building", label: "Casa tradicional", w: 224, h: 220,
      colliders: Object.freeze([Object.freeze([-88, -48, 176, 42])]),
    }),
    rowhouse: Object.freeze({
      src: "assets/generated/san-pablo-rebuilt/runtime/building-rowhouse-tan.png",
      kind: "building", label: "Hilera de viviendas", w: 400, h: 188,
      colliders: Object.freeze([Object.freeze([-176, -42, 352, 38])]),
    }),
    campus: Object.freeze({
      src: "assets/generated/san-pablo-rebuilt/runtime/building-campus-civic.png",
      kind: "building", label: "Campus cívico", w: 430, h: 314,
      colliders: Object.freeze([Object.freeze([-174, -58, 348, 52])]),
    }),
    modern: Object.freeze({
      src: "assets/generated/san-pablo-rebuilt/runtime/building-modern-southeast.png",
      kind: "building", label: "Edificio moderno", w: 380, h: 340,
      colliders: Object.freeze([Object.freeze([-142, -72, 284, 64])]),
    }),
    residentialBlockLong: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/building-residential-block-long.png",
      kind: "building", label: "Bloque residencial largo", w: 568, h: 196,
      colliders: Object.freeze([Object.freeze([-222, -24, 443, 24])]),
    }),
    shopGroceryFront: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/shop-grocery-front.png",
      kind: "building", label: "Ultramarinos", w: 211, h: 198,
      colliders: Object.freeze([Object.freeze([-83, -24, 165, 24])]),
    }),
    shopBakeryFront: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/shop-bakery-front.png",
      kind: "building", label: "Panadería", w: 201, h: 198,
      colliders: Object.freeze([Object.freeze([-79, -24, 157, 24])]),
    }),
    shopCafeFront: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/shop-cafe-front.png",
      kind: "building", label: "Café de barrio", w: 205, h: 198,
      colliders: Object.freeze([Object.freeze([-80, -24, 160, 24])]),
    }),
    shopPharmacyFront: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/shop-pharmacy-front.png",
      kind: "building", label: "Farmacia", w: 213, h: 198,
      colliders: Object.freeze([Object.freeze([-83, -24, 166, 24])]),
    }),
    evergreen: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/tree-evergreen.png",
      kind: "tree", label: "Abeto", w: 69, h: 108,
      colliders: Object.freeze([Object.freeze([-12, -17, 24, 17])]),
    }),
    deciduous: Object.freeze({
      src: "assets/generated/san-pablo-rebuilt/runtime/tree-deciduous.png",
      kind: "tree", label: "Árbol de hoja caduca", w: 88, h: 108,
      colliders: Object.freeze([Object.freeze([-14, -18, 28, 18])]),
    }),
    cherry: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/tree-cherry.png",
      kind: "tree", label: "Cerezo", w: 93, h: 105,
      colliders: Object.freeze([Object.freeze([-13, -18, 26, 18])]),
    }),
    orangeTreeMature: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/tree-orange-mature.png",
      kind: "tree", label: "Naranjo adulto", w: 120, h: 120,
      colliders: Object.freeze([Object.freeze([-21, -17, 41, 17])]),
    }),
    orangeTreeBlossom: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/tree-orange-blossom.png",
      kind: "tree", label: "Naranjo en flor", w: 120, h: 129,
      colliders: Object.freeze([Object.freeze([-21, -18, 41, 18])]),
    }),
    streetlamp: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/prop-streetlamp.png",
      kind: "prop", label: "Farola clásica", w: 28, h: 72,
      colliders: Object.freeze([Object.freeze([-5, -8, 10, 8])]),
    }),
    curvedStreetlamp: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/prop-streetlamp-curved.png",
      kind: "prop", label: "Farola curva", w: 34, h: 124,
      colliders: Object.freeze([Object.freeze([-14, -25, 28, 25])]),
    }),
    bench: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/prop-park-bench.png",
      kind: "prop", label: "Banco de parque", w: 76, h: 44,
      colliders: Object.freeze([Object.freeze([-30, -12, 60, 12])]),
    }),
    ornateBench: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/prop-bench-ornate.png",
      kind: "prop", label: "Banco de hierro", w: 91, h: 70,
      colliders: Object.freeze([Object.freeze([-38, -14, 75, 14])]),
    }),
    hedge: Object.freeze({
      src: "assets/generated/san-pablo-derived/runtime/prop-hedge-flowerbed.png",
      kind: "prop", label: "Seto con flores", w: 242, h: 44,
      colliders: Object.freeze([Object.freeze([-121, -18, 242, 18])]),
    }),
    whiteWall: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/prop-white-wall.png",
      kind: "prop", label: "Muro blanco", w: 242, h: 76,
      colliders: Object.freeze([Object.freeze([-99, -15, 198, 15])]),
    }),
    metalFence: Object.freeze({
      src: "assets/generated/san-pablo-neighborhood/runtime/prop-metal-fence.png",
      kind: "prop", label: "Valla metálica", w: 248, h: 59,
      colliders: Object.freeze([Object.freeze([-102, -12, 203, 12])]),
    }),
    fountain: Object.freeze({
      src: "assets/generated/ciudad-azahar/runtime/fountain-civic.png",
      kind: "prop", label: "Fuente de la Plaza del Azahar", w: 128, h: 128,
      colliders: Object.freeze([Object.freeze([-46, -42, 92, 42])]),
    }),
  });

  const worldAssets = [];
  function addAsset(id, sprite, x, y, options = {}) {
    const prototype = assetCatalog[sprite];
    if (!prototype) throw new Error(`Prototipo desconocido: ${sprite}`);
    const asset = {
      id, sprite, kind: options.kind || prototype.kind, placement: "layout",
      x, y, depthY: options.depthY ?? (y - (prototype.kind === "building" ? 10 : 2)),
      w: options.w || prototype.w, h: options.h || prototype.h,
      solid: options.solid ?? true,
      colliders: options.colliders || prototype.colliders,
    };
    for (const key of ["door", "approach", "interaction", "rotation", "flipX", "label", "district"]) {
      if (options[key] !== undefined) asset[key] = options[key];
    }
    worldAssets.push(asset);
    return asset;
  }

  /* Borde forestal: el límite siempre tiene una señal visual clara. */
  for (let x = 72, index = 0; x <= width - 72; x += 88, index += 1) {
    addAsset(`border-n-${index}`, index % 5 === 2 ? "deciduous" : "evergreen", x, 116);
    if (x < 1120 || x > 1440) addAsset(`border-s-${index}`, index % 6 === 3 ? "cherry" : "evergreen", x, 2290);
  }
  for (let y = 204, index = 0; y <= height - 116; y += 92, index += 1) {
    addAsset(`border-w-${index}`, index % 4 === 1 ? "orangeTreeMature" : "evergreen", 58, y);
    addAsset(`border-e-${index}`, index % 4 === 2 ? "deciduous" : "evergreen", width - 58, y);
  }
  addAsset("south-gate-cherry-west", "cherry", 1138, 2278);
  addAsset("south-gate-cherry-east", "cherry", 1422, 2278);

  /* Equipamientos del norte. */
  addAsset("north-clinic", "clinic", 350, 536, { label: "Centro de Salud Azahar", district: "northwest" });
  addAsset("north-residence", "traditional", 720, 520, { district: "northwest" });
  addAsset("north-institution", "institutional", 1280, 520, { label: "Instituto Azahar", district: "north" });
  addAsset("north-blue-house", "blueHouse", 1770, 528, { district: "northeast" });
  addAsset("north-modern", "modern", 2190, 548, { label: "Centro Cultural", district: "northeast" });

  /* Barrio de viviendas al oeste, separado por calles anchas. */
  [820, 1080, 1334, 1640].forEach((y, index) => addAsset(`west-row-${index + 1}`, "rowhouse", 384, y, {
    label: `Residencial Patio ${index + 1}`, district: "west-residential",
  }));
  addAsset("west-corner-home-a", "residential", 170, 820, { district: "west-residential" });
  addAsset("west-corner-home-b", "traditional", 176, 1646, { district: "west-residential" });

  /* Plaza peatonal central: la fuente deja más de 150 px libres por cada lado. */
  addAsset("central-campus", "campus", 1280, 934, { label: "Casa Consistorial", district: "central" });
  addAsset("central-fountain", "fountain", 1280, 1280, { district: "central" });
  addAsset("central-bench-west", "ornateBench", 1080, 1308, { district: "central" });
  addAsset("central-bench-east", "ornateBench", 1480, 1308, { district: "central", flipX: true });
  addAsset("central-bench-south-west", "bench", 1136, 1502, { district: "central" });
  addAsset("central-bench-south-east", "bench", 1424, 1502, { district: "central" });
  addAsset("central-orange-nw", "orangeTreeBlossom", 960, 1060, { district: "central" });
  addAsset("central-orange-ne", "orangeTreeBlossom", 1600, 1060, { district: "central" });
  addAsset("central-orange-sw", "orangeTreeMature", 960, 1518, { district: "central" });
  addAsset("central-orange-se", "orangeTreeMature", 1600, 1518, { district: "central" });

  /* Campo y comercios del este. La valla visible coincide con barrierSegments. */
  addAsset("field-fence-north", "metalFence", 2208, 720, { district: "sports" });
  addAsset("field-fence-west", "metalFence", 2032, 904, {
    district: "sports", rotation: 90, colliders: [[-12, -184, 24, 316]],
  });
  addAsset("field-fence-east", "metalFence", 2384, 904, {
    district: "sports", rotation: 90, colliders: [[-12, -184, 24, 316]],
  });
  addAsset("east-pharmacy", "shopPharmacyFront", 2036, 1384, { district: "east-commercial" });
  addAsset("east-grocery", "shopGroceryFront", 2310, 1384, { district: "east-commercial" });
  addAsset("east-bakery", "shopBakeryFront", 2030, 1640, { district: "east-commercial" });
  addAsset("east-cafe", "shopCafeFront", 2310, 1640, { district: "east-commercial" });

  /* Parque lineal y barrio diagonal del sur. */
  addAsset("south-rowhouse", "residentialBlockLong", 520, 2160, { district: "south-park" });
  [260, 480, 700, 920].forEach((x, index) => addAsset(`south-cherry-${index + 1}`, index % 2 ? "cherry" : "orangeTreeBlossom", x, 1900));
  addAsset("south-park-bench-a", "ornateBench", 360, 2020, { district: "south-park" });
  addAsset("south-park-bench-b", "ornateBench", 760, 2020, { district: "south-park", flipX: true });
  addAsset("southeast-shop-a", "shopGroceryFront", 1830, 1880, { district: "southeast" });
  addAsset("southeast-shop-b", "shopBakeryFront", 2070, 2000, { district: "southeast" });
  addAsset("southeast-house", "blueHouse", 2350, 2110, { district: "southeast" });

  /* Mobiliario en el borde exterior de las aceras, nunca en el centro del paso. */
  [736, 1024, 1536, 1824].forEach((x, index) => {
    addAsset(`ring-lamp-n-${index}`, "streetlamp", x, 676);
    addAsset(`ring-lamp-s-${index}`, "streetlamp", x, 1762);
  });
  [800, 1056, 1312, 1568].forEach((y, index) => {
    addAsset(`ring-lamp-w-${index}`, "curvedStreetlamp", 706, y);
    addAsset(`ring-lamp-e-${index}`, "curvedStreetlamp", 1854, y, { flipX: true });
  });
  [1880, 2060, 2240].forEach((x, index) => addAsset(`diagonal-cherry-${index}`, "cherry", x, 2160 - (x - 1600) * 0.52 - 72));

  const roads = Object.freeze([
    Object.freeze({ id: "ring-north", name: "Ronda del Azahar Norte", points: Object.freeze([[640, 608], [1920, 608]]), width: 96, sidewalkWidth: 18, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "ring-east", name: "Ronda del Azahar Este", points: Object.freeze([[1920, 608], [1920, 1696]]), width: 96, sidewalkWidth: 18, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "ring-south", name: "Ronda del Azahar Sur", points: Object.freeze([[1920, 1696], [640, 1696]]), width: 96, sidewalkWidth: 18, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "ring-west", name: "Ronda del Azahar Oeste", points: Object.freeze([[640, 1696], [640, 608]]), width: 96, sidewalkWidth: 18, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "avenue-north", name: "Avenida del Instituto", points: Object.freeze([[1280, 352], [1280, 608]]), width: 88, sidewalkWidth: 20, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "avenue-south", name: "Avenida del Parque", points: Object.freeze([[1280, 1696], [1280, 2210]]), width: 96, sidewalkWidth: 20, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "avenue-west", name: "Avenida de los Patios", points: Object.freeze([[128, 1152], [640, 1152]]), width: 80, sidewalkWidth: 18, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "avenue-east", name: "Avenida del Estadio", points: Object.freeze([[1920, 1152], [2432, 1152]]), width: 80, sidewalkWidth: 18, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "west-lane-north", name: "Calle Patio Norte", points: Object.freeze([[128, 896], [640, 896]]), width: 72, sidewalkWidth: 16, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "west-lane-south", name: "Calle Patio Sur", points: Object.freeze([[128, 1408], [640, 1408]]), width: 72, sidewalkWidth: 16, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "east-lane-south", name: "Calle del Mercado", points: Object.freeze([[1920, 1408], [2432, 1408]]), width: 72, sidewalkWidth: 16, curbWidth: 4, surface: "road", walkable: true }),
    Object.freeze({ id: "diagonal-southeast", name: "Paseo de los Cerezos", points: Object.freeze([[1600, 1696], [2320, 2160]]), width: 88, sidewalkWidth: 18, curbWidth: 4, surface: "road", walkable: true }),
  ]);

  const paths = Object.freeze([
    Object.freeze({ id: "clinic-access", points: Object.freeze([[350, 536], [350, 608]]), width: 70, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "institute-access", points: Object.freeze([[1280, 520], [1280, 608]]), width: 80, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "culture-access", points: Object.freeze([[2190, 548], [2190, 608]]), width: 70, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "plaza-north", points: Object.freeze([[1280, 676], [1280, 1060]]), width: 84, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "plaza-south", points: Object.freeze([[1280, 1400], [1280, 1628]]), width: 84, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "plaza-west", points: Object.freeze([[708, 1280], [1130, 1280]]), width: 84, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "plaza-east", points: Object.freeze([[1430, 1280], [1852, 1280]]), width: 84, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "field-access", points: Object.freeze([[2208, 1036], [2208, 1152]]), width: 72, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "south-park-walk", points: Object.freeze([[192, 1990], [1010, 1990]]), width: 80, surface: "dirt", walkable: true }),
    Object.freeze({ id: "south-park-link", points: Object.freeze([[1010, 1990], [1212, 1990]]), width: 72, surface: "dirt", walkable: true }),
  ]);

  const encounterAreas = Object.freeze([
    Object.freeze({ id: "orange-grove-west", name: "Pradera del Naranjal", x: 1940, y: 232, w: 176, h: 176, surface: "grass", walkable: true, encounter: true }),
    Object.freeze({ id: "orange-grove-east", name: "Pradera del Azahar", x: 2228, y: 232, w: 176, h: 176, surface: "grass", walkable: true, encounter: true }),
  ]);

  const surfaceRects = Object.freeze([
    Object.freeze({ id: "clinic-forecourt", x: 176, y: 470, w: 360, h: 138, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "institute-forecourt", x: 1030, y: 458, w: 500, h: 150, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "culture-forecourt", x: 1980, y: 468, w: 420, h: 140, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "central-civic-plaza", x: 720, y: 688, w: 1120, h: 920, surface: "sidewalk", walkable: true }),
    Object.freeze({ id: "football-pitch", x: 2032, y: 720, w: 352, h: 316, surface: "grass", walkable: true }),
    Object.freeze({ id: "south-linear-park", x: 144, y: 1776, w: 920, h: 410, surface: "dirt", walkable: true }),
    Object.freeze({ id: "southeast-commercial-square", x: 1740, y: 1740, w: 700, h: 430, surface: "sidewalk", walkable: true }),
    ...encounterAreas,
  ]);

  const barrierSegments = Object.freeze([
    Object.freeze({ id: "field-fence-top", kind: "fence", solid: true, width: 6, points: Object.freeze([[2032, 720], [2384, 720]]) }),
    Object.freeze({ id: "field-fence-left", kind: "fence", solid: true, width: 6, points: Object.freeze([[2032, 720], [2032, 1036]]) }),
    Object.freeze({ id: "field-fence-right", kind: "fence", solid: true, width: 6, points: Object.freeze([[2384, 720], [2384, 1036]]) }),
    Object.freeze({ id: "field-fence-bottom-left", kind: "fence", solid: true, width: 6, points: Object.freeze([[2032, 1036], [2168, 1036]]) }),
    Object.freeze({ id: "field-fence-bottom-right", kind: "fence", solid: true, width: 6, points: Object.freeze([[2248, 1036], [2384, 1036]]) }),
  ]);

  const sportsFields = Object.freeze([
    Object.freeze({ id: "azahar-football", x: 2032, y: 720, w: 352, h: 316, gate: Object.freeze({ from: 136, to: 216 }) }),
  ]);

  const layout = Object.freeze({
    revision: 1,
    width, height, tileSize, navigationCellSize: 8,
    assetCatalog,
    worldAssets: Object.freeze(worldAssets.map((asset) => Object.freeze({ ...asset, colliders: Object.freeze(asset.colliders.map((collider) => Object.freeze([...collider]))) }))),
    roads,
    paths,
    surfaceRects,
    surfacePolygons: Object.freeze([]),
    encounterAreas,
    sportsFields,
    buildingFootprints: Object.freeze([]),
    barrierSegments,
    blockedRects: Object.freeze([]),
    blockedSegments: Object.freeze([]),
    sections: Object.freeze([
      Object.freeze({ id: "northwest", name: "Barrio de la Clínica", x: 0, y: 0, w: 853, h: 768 }),
      Object.freeze({ id: "north", name: "Campus Azahar", x: 853, y: 0, w: 854, h: 768 }),
      Object.freeze({ id: "northeast", name: "Jardines del Este", x: 1707, y: 0, w: 853, h: 768 }),
      Object.freeze({ id: "west", name: "Barrio de los Patios", x: 0, y: 768, w: 720, h: 936 }),
      Object.freeze({ id: "central", name: "Plaza del Azahar", x: 720, y: 768, w: 1120, h: 936 }),
      Object.freeze({ id: "east", name: "Estadio y Mercado", x: 1840, y: 768, w: 720, h: 936 }),
      Object.freeze({ id: "south", name: "Parque Lineal", x: 0, y: 1704, w: 1280, h: 600 }),
      Object.freeze({ id: "southeast", name: "Paseo de los Cerezos", x: 1280, y: 1704, w: 1280, h: 600 }),
    ]),
  });

  root.CIUDAD_AZAHAR_MAP_LAYOUT = layout;
  /* Alias consumido únicamente por el compilador declarativo parametrizado. */
  root.MAP_LAYOUT = layout;
})(globalThis);
