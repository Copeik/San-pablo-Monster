/*
 * Mapa de San Pablo basado en la referencia visual facilitada.
 *
 * La cuadrícula lógica usa casillas de 32 px. Las coordenadas del editor
 * empiezan en cero: C0, F0 es la esquina superior izquierda.
 * Los rectángulos usan [colInicial, filaInicial, colFinal, filaFinal].
 * Los segmentos usan píxeles del mundo: [x1, y1, x2, y2, anchura].
 */
const CITY_MAP_SIZE = 2508;
const CITY_MAP_CHUNK_SIZE = 512;
const CITY_LAYOUT = window.CITY_MAP_LAYOUT || {};
const CITY_LAYOUT_TILE_SIZE = Number(CITY_LAYOUT.tileSize) || 32;
const CITY_LAYOUT_ASSET_SPRITES = Object.freeze(Object.fromEntries(
  Object.entries(CITY_LAYOUT.assetCatalog || {}).map(([id, prototype]) => [id, prototype.src]),
));
const CITY_LAYOUT_WALKABLE_SEGMENTS = Object.freeze([
  ...(CITY_LAYOUT.roads || []).flatMap((road) => {
    const points = road.points || [];
    if (road.walkable === false) return [];
    const width = Number(road.width) + 2 * (Number(road.sidewalkWidth || 0) + Number(road.curbWidth || 0));
    return points.slice(1).map((point, index) => [
      points[index][0], points[index][1], point[0], point[1], width,
    ]);
  }),
  ...(CITY_LAYOUT.paths || []).flatMap((path) => {
    const points = path.points || [];
    if (path.walkable === false) return [];
    return points.slice(1).map((point, index) => [
      points[index][0], points[index][1], point[0], point[1], Number(path.width),
    ]);
  }),
]);
const CITY_LAYOUT_WALKABLE_RECTS = Object.freeze((CITY_LAYOUT.surfaceRects || [])
  .filter((surface) => surface.walkable === true)
  .map((surface) => [
    Math.floor(surface.x / CITY_LAYOUT_TILE_SIZE),
    Math.floor(surface.y / CITY_LAYOUT_TILE_SIZE),
    Math.floor((surface.x + surface.w - 1) / CITY_LAYOUT_TILE_SIZE),
    Math.floor((surface.y + surface.h - 1) / CITY_LAYOUT_TILE_SIZE),
  ]));
const CITY_LAYOUT_BLOCKED_RECTS = Object.freeze((CITY_LAYOUT.blockedRects || []).map((surface) => [
  Math.floor(surface.x / CITY_LAYOUT_TILE_SIZE),
  Math.floor(surface.y / CITY_LAYOUT_TILE_SIZE),
  Math.floor((surface.x + surface.w - 1) / CITY_LAYOUT_TILE_SIZE),
  Math.floor((surface.y + surface.h - 1) / CITY_LAYOUT_TILE_SIZE),
]));
const CITY_LAYOUT_ENCOUNTER_AREAS = Object.freeze((CITY_LAYOUT.encounterAreas || []).map((area) => Object.freeze({ ...area })));

function cityLayoutPointInPolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[previous];
    const crosses = ((y1 > y) !== (y2 > y))
      && x < ((x2 - x1) * (y - y1)) / ((y2 - y1) || Number.EPSILON) + x1;
    if (crosses) inside = !inside;
  }
  return inside;
}

function cityLayoutEncounterContains(area, x, y) {
  if (area.shape === "polygon") return cityLayoutPointInPolygon(x, y, area.points || []);
  return x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h;
}

const CITY_LAYOUT_ENCOUNTER_TILES = Object.freeze((() => {
  const tiles = new Map();
  CITY_LAYOUT_ENCOUNTER_AREAS.forEach((area) => {
    const xs = area.shape === "polygon" ? (area.points || []).map((point) => point[0]) : [area.x, area.x + area.w];
    const ys = area.shape === "polygon" ? (area.points || []).map((point) => point[1]) : [area.y, area.y + area.h];
    if (!xs.length || !ys.length) return;
    const minCol = Math.max(0, Math.floor(Math.min(...xs) / CITY_LAYOUT_TILE_SIZE));
    const maxCol = Math.min(Math.ceil(CITY_MAP_SIZE / CITY_LAYOUT_TILE_SIZE) - 1, Math.floor(Math.max(...xs) / CITY_LAYOUT_TILE_SIZE));
    const minRow = Math.max(0, Math.floor(Math.min(...ys) / CITY_LAYOUT_TILE_SIZE));
    const maxRow = Math.min(Math.ceil(CITY_MAP_SIZE / CITY_LAYOUT_TILE_SIZE) - 1, Math.floor(Math.max(...ys) / CITY_LAYOUT_TILE_SIZE));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const x = (col + .5) * CITY_LAYOUT_TILE_SIZE;
        const y = (row + .5) * CITY_LAYOUT_TILE_SIZE;
        if (cityLayoutEncounterContains(area, x, y)) tiles.set(`${col},${row}`, Object.freeze([col, row]));
      }
    }
  });
  return [...tiles.values()];
})());
const CITY_MAP_TILE_COLUMNS = Math.ceil(CITY_MAP_SIZE / CITY_MAP_CHUNK_SIZE);
const CITY_MAP_TILE_ROWS = Math.ceil(CITY_MAP_SIZE / CITY_MAP_CHUNK_SIZE);
const CITY_MAP_TILES = Object.freeze(Array.from(
  { length: CITY_MAP_TILE_COLUMNS * CITY_MAP_TILE_ROWS },
  (_, index) => {
    const col = index % CITY_MAP_TILE_COLUMNS;
    const row = Math.floor(index / CITY_MAP_TILE_COLUMNS);
    const x = col * CITY_MAP_CHUNK_SIZE;
    const y = row * CITY_MAP_CHUNK_SIZE;
    return Object.freeze({
      id: `r${row}-c${col}`,
      col,
      row,
      x,
      y,
      w: Math.min(CITY_MAP_CHUNK_SIZE, CITY_MAP_SIZE - x),
      h: Math.min(CITY_MAP_CHUNK_SIZE, CITY_MAP_SIZE - y),
      image: `assets/maps/san-pablo-rebuilt-chunks-2x/san-pablo-r${row}-c${col}.webp`,
    });
  },
));

window.CITY_MAP_CONFIG = Object.freeze({
  previewImage: "assets/maps/san-pablo-rebuilt-preview.webp",
  navigationMask: Object.freeze({
    image: "assets/maps/san-pablo-rebuilt-navigation-v2.png",
    cellSize: Number(CITY_LAYOUT.navigationCellSize) || 8,
    revision: Number(CITY_LAYOUT.revision) || 1,
  }),
  width: CITY_MAP_SIZE,
  height: CITY_MAP_SIZE,
  sourceWidth: 5016,
  sourceHeight: 5016,
  textureScale: 2,
  tileColumns: CITY_MAP_TILE_COLUMNS,
  tileRows: CITY_MAP_TILE_ROWS,
  chunkSize: CITY_MAP_CHUNK_SIZE,
  chunkGutter: 2,
  memoryBudgetMB: 96,
  prefetchLimit: 2,
  prefetchSeconds: 0.65,
  prefetchMargin: 64,
  unloadMargin: 160,
  unloadDelayMs: 500,
  tiles: CITY_MAP_TILES,
  tileSize: CITY_LAYOUT_TILE_SIZE,
  defaultTile: "blocked",
  spawn: { x: 620, y: 2092, direction: "right" },

  /* El fondo contiene solo suelos. Edificios, arboles y props proceden del
     layout para conservar profundidad, reutilizacion y colisiones precisas. */
  assetSprites: CITY_LAYOUT_ASSET_SPRITES,
  assetRevision: 3,
  worldAssets: CITY_LAYOUT.worldAssets || [],
  sections: CITY_LAYOUT.sections || [],
  blockedRects: CITY_LAYOUT_BLOCKED_RECTS,
  walkableRects: CITY_LAYOUT_WALKABLE_RECTS,
  encounterAreas: CITY_LAYOUT_ENCOUNTER_AREAS,
  encounterTiles: CITY_LAYOUT_ENCOUNTER_TILES,
  encounterGrass: Object.freeze({
    image: "assets/generated/san-pablo-rebuilt/runtime/grass-tall-spritesheet.png",
    frameSize: 64,
    frames: 4,
    drawWidth: 44,
    drawHeight: 48,
    frontCropY: 31,
    revision: Number(CITY_LAYOUT.revision) || 2,
  }),

  /* Fallback de 32 px para el editor. El juego usa normalmente la mascara
     semantica de 8 px compilada desde exactamente las mismas superficies. */
  walkableSegments: CITY_LAYOUT_WALKABLE_SEGMENTS,

  /* Regresiones visuales: centros de huellas y obstaculos que nunca deben
     abrirse al ampliar una plaza o un sendero. */
  blockedProbes: [
    [1464, 400, "huella de la UNED"],
    [588, 665, "fachada del Centro de Salud"],
    [1490, 825, "fachada de Galeria Jazmin"],
    [1360, 1710, "fachada del Campus Civico"],
    [2224, 1900, "fachada del Banco San Pablo"],
    [2144, 2350, "fachada de Servicios del Sureste"],
    [720, 2260, "banco del parque sur"],
    [560, 2310, "tronco del parque sur"],
    [208, 158, "barrera de la salida norte"],
    [2410, 505, "barrera de la salida este"],
  ],

  /* Hierba alta accesible y con encuentros. */
  encounterRects: [],

  /* Puertas iniciales. El editor permite corregir o ampliar cualquiera. */
  doors: [
    { col: 18, row: 21, label: "Centro de Salud San Pablo", action: "heal", npc: "nurse" },
    { col: 46, row: 25, label: "Galería Jazmín", action: "shop", npc: "clerk" },
    { col: 50, row: 34, label: "Umbral Prisma", action: "prism" },
    { col: 21, row: 30, label: "Casa", action: "house", npc: "abuela" },
    { col: 30, row: 40, label: "Casa", action: "house", npc: "nino" },
    { col: 21, row: 53, label: "Casa", action: "house", npc: "pescador" },
    { col: 30, row: 62, label: "Casa", action: "house", npc: "jubilado" },
    { col: 61, row: 28, label: "Casa", action: "house", npc: "estudiante" },
    { col: 71, row: 40, label: "Casa", action: "house", npc: "comerciante" },
    { col: 61, row: 51, label: "Casa", action: "house", npc: "artista" },
    { col: 39, row: 69, label: "Habitación del Entrenador", action: "bedroom" },
    { col: 53, row: 71, label: "Jardín Tesalónica", action: "route" },
    { col: 45, row: 13, label: "UNED Sevilla", action: "lab", npc: "professor" },
    { col: 42, row: 54, label: "Campus Cívico", action: "lab", npc: "professor" },
    { col: 69, row: 60, label: "Banco San Pablo", action: "closed" },
    { col: 67, row: 73, label: "Servicios del Sureste", action: "closed" },
  ],

  /* NPC exteriores. col/row indican la casilla; direction: down/left/right/up. */
  npcs: [
    {
      id: "guia-san-pablo",
      col: 25,
      row: 65,
      direction: "left",
      name: "Guía de San Pablo",
      sprite: "guide",
      lines: [
        "Bienvenido a San Pablo. Estoy en C25, F65; estas dos cifras sirven para colocar cualquier elemento del mapa.",
        "Pulsa # para ver la cuadrícula: rojo bloquea, amarillo marca puertas, verde son encuentros y azul señala NPC.",
      ],
    },
    {
      id: "deportista-max",
      col: 56,
      row: 37,
      direction: "left",
      name: "Deportista Max",
      sprite: "npc-11-athlete",
      lines: [
        "Corro todas las mañanas. Algunas incluso hacia delante.",
        "Usa SHIFT para correr; úsalo con moderación si acabas de comer.",
      ],
    },
    {
      id: "skater-verde",
      col: 37,
      row: 25,
      direction: "up",
      name: "Niño del polo",
      sprite: "nino-polo",
      patrol: { to: [37, 18], tilesPerSecond: 0.75 },
      lines: [
        "Voy de C37,F25 a C37,F18 sin perder el ritmo.",
        "Si nos cruzamos, freno. Cuando te apartes, sigo corriendo.",
      ],
    },
    {
      id: "jardinera-sol",
      col: 66,
      row: 11,
      direction: "down",
      name: "Jardinera Sol",
      sprite: "npc-13-gardener",
      lines: [
        "Hablo con las plantas. Ellas responden con fotosíntesis pasivo-agresiva.",
        "La hierba alta esconde especies distintas y, en mi caso, las tijeras.",
      ],
    },
    {
      id: "agente-emilia",
      col: 40,
      row: 16,
      direction: "right",
      name: "Agente Emilia",
      sprite: "npc-14-officer",
      lines: [
        "¡Quieto ahí!... Ah, no. Ese silbato era para mi Growlithe. Tú puedes seguir.",
        "Patrullo desde las siete. El crimen duerme; yo no, porque el café tampoco.",
      ],
    },
    {
      id: "chef-paco",
      col: 50,
      row: 26,
      direction: "up",
      name: "Chef Paco",
      sprite: "npc-15-chef",
      lines: [
        "Mi especialidad es la tortilla de Baya Aranja. Nadie la pidió, pero nadie la olvida.",
        "Si ves humo, no es un ataque de tipo Fuego. Probablemente.",
      ],
    },
    {
      id: "mecanica-reme",
      col: 70,
      row: 48,
      direction: "left",
      name: "Mecánica Reme",
      sprite: "npc-16-mechanic",
      lines: [
        "He arreglado bicicletas, Poké Balls y una tostadora poseída. La tostadora ganó.",
        "Si algo hace «clonc», dale una vuelta. Si hace «BOOM», llama a la agente Emilia.",
      ],
    },
    {
      id: "musico-lolo",
      col: 22,
      row: 71,
      direction: "right",
      name: "Músico Lolo",
      sprite: "npc-17-musician",
      lines: [
        "Mi Jigglypuff canta afinado. El público se duerme antes del estribillo.",
        "Estoy ensayando un solo en Re menor... Re menor que Chispin.",
      ],
    },
    {
      id: "ciclista-toni",
      col: 52,
      row: 37,
      direction: "right",
      name: "Ciclista Toni",
      sprite: "npc-18-cyclist",
      lines: [
        "Mi bici tiene dieciocho marchas. Uso una: la que no me hace sudar.",
        "El casco despeina, pero el suelo despeina muchísimo más.",
      ],
    },
    {
      id: "senderista-paca",
      col: 10,
      row: 10,
      direction: "down",
      name: "Senderista Paca",
      sprite: "npc-19-hiker",
      lines: [
        "Traía botas, mapa y siete bocadillos. Ya no quedan bocadillos.",
        "Si me pierdo, no me busques. Estaré fingiendo que era una ruta alternativa.",
      ],
    },
    {
      id: "oficinista-julian",
      col: 47,
      row: 55,
      direction: "down",
      name: "Oficinista Julián",
      sprite: "npc-20-office-worker",
      lines: [
        "Mi jefe dijo «trabajo remoto». Llevo una hora buscando el mando.",
        "Tengo una reunión sobre reducir reuniones. Dura tres horas.",
      ],
    },
    {
      id: "entrenadora-nerea",
      col: 25,
      row: 41,
      direction: "right",
      name: "Entrenadora Nerea",
      sprite: "npc-21-teen-girl",
      lines: [
        "Entrené a mi Luminio para posar. Combatir ya si eso mañana.",
        "Mi estrategia secreta es gritar «¡crítico!». Funciona estadísticamente alguna vez.",
      ],
    },
    {
      id: "entrenador-dani",
      col: 66,
      row: 31,
      direction: "left",
      name: "Entrenador Dani",
      sprite: "npc-22-teen-boy",
      lines: [
        "Mi Alúa sabe revolcarse en las hojas. Yo también, pero solo los domingos.",
        "Quise ser líder de gimnasio, pero había que madrugar.",
      ],
    },
    {
      id: "panadera-ines",
      col: 23,
      row: 57,
      direction: "down",
      name: "Panadera Inés",
      sprite: "npc-23-baker",
      lines: [
        "Mis bollos están recién hechos. El de forma de Voltorb no explota... casi nunca.",
        "Uso Levadura Máxima. Sube la masa, no los PS.",
      ],
    },
    {
      id: "albanil-manolo",
      col: 37,
      row: 58,
      direction: "right",
      name: "Albañil Manolo",
      sprite: "npc-24-builder",
      lines: [
        "Esta obra termina el martes. No he dicho de qué año.",
        "Mi Machoke pidió vacaciones. Ahora levanto yo los carteles de «Cuidado».",
      ],
    },
    {
      id: "doctor-mateo",
      col: 13,
      row: 24,
      direction: "right",
      name: "Doctor Mateo",
      sprite: "npc-25-doctor",
      lines: [
        "Receto descanso, agua y no luchar contra seis Moskito antes del desayuno.",
        "Tu pulso está bien. El mío sube cuando alguien dice «será un combate rápido».",
      ],
    },
    {
      id: "vendedora-chari",
      col: 55,
      row: 22,
      direction: "left",
      name: "Vendedora Chari",
      sprite: "npc-26-vendor",
      lines: [
        "¡Oferta! Dos Bayas por el precio exacto de dos Bayas.",
        "No regateo. Bueno, sí, pero solo conmigo misma y siempre pierdo.",
      ],
    },
    {
      id: "bibliotecaria-maribel",
      col: 50,
      row: 15,
      direction: "left",
      name: "Bibliotecaria Maribel",
      sprite: "npc-27-librarian",
      lines: [
        "Shhh... hasta mi Exploud usa voz interior aquí.",
        "Presté un libro sobre Luminio. Cuando fui a buscarlo, ya no estaba.",
      ],
    },
    {
      id: "turista-tino",
      col: 53,
      row: 46,
      direction: "down",
      name: "Turista Tino",
      sprite: "npc-28-tourist",
      lines: [
        "Mi mapa dice «usted está aquí», pero no sé quién es usted.",
        "He hecho ochenta fotos. En setenta y nueve sale mi dedo.",
      ],
    },
    {
      id: "bailarina-lola",
      col: 50,
      row: 40,
      direction: "right",
      name: "Bailarina Lola",
      sprite: "npc-29-dancer",
      lines: [
        "Mi coreografía se llama Danza Espada. Seguridad insiste en que quite las espadas.",
        "Un paso a la izquierda, otro a la derecha... y piso una Poké Ball.",
      ],
    },
    {
      id: "guardabosques-roque",
      col: 29,
      row: 73,
      direction: "left",
      name: "Guardabosques Roque",
      sprite: "npc-30-ranger",
      lines: [
        "Protejo la hierba alta. Ella se defiende llenándome los calcetines de semillas.",
        "Si ves un Pokémon raro, no grites. Se asusta él, me asusto yo y gritamos todos.",
      ],
    },
  ],

  /* El HUD usa las mismas lineas maestras que el compilador de calles. */
  streets: (CITY_LAYOUT.roads || []).map((road) => ({
    id: road.id,
    name: road.name || road.id,
    segment: [
      road.points[0][0], road.points[0][1],
      road.points[road.points.length - 1][0], road.points[road.points.length - 1][1],
    ],
    width: Number(road.width) + 2 * (Number(road.sidewalkWidth || 0) + Number(road.curbWidth || 0)),
  })),

  /* Acabado visual no colisionable. Refuerza la jerarquía de las calles y
     hace legibles los accesos sin alterar el bitmap, las puertas ni la red
     transitable. Los puntos están en píxeles del mundo. */
  streetPolish: {
    revision: 1,
    edgeStreetIds: [],
    accessPaths: [
      { id: "access-clinic", door: [18, 21], width: 14, points: [[592, 688], [592, 724], [592, 750]] },
      { id: "access-gallery", door: [46, 25], width: 12, points: [[1488, 816], [1488, 850], [1488, 882]] },
    ],
    crossings: [
      { id: "cross-ada-jerusalen", x: 252, y: 505, angle: 0, length: 54, width: 74, stripes: 5 },
      { id: "cross-jaffa-jerusalen", x: 1158, y: 505, angle: 0, length: 48, width: 70, stripes: 5 },
      { id: "cross-miletos-jerusalen", x: 1772, y: 505, angle: 0, length: 48, width: 70, stripes: 5 },
      { id: "cross-jaffa-persepolis", x: 1158, y: 1300, angle: 90, length: 42, width: 58, stripes: 4 },
      { id: "cross-miletos-tesalonica", x: 1772, y: 1300, angle: 90, length: 42, width: 58, stripes: 4 },
    ],
  },
});
