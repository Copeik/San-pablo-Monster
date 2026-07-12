(() => {
  "use strict";

  const SAVE_KEY = "pokemon-city-save-v3";
  const MAP_EDIT_KEY = "pokemon-city-tile-overrides-v1";
  const CITY_MAP = window.CITY_MAP_CONFIG;
  const VIEW_WIDTH = 960;
  const VIEW_HEIGHT = 624;
  const PIXELS_PER_METER = 8;
  const WORLD_WIDTH = CITY_MAP.width;
  const WORLD_HEIGHT = CITY_MAP.height;
  const PRISM_WIDTH = 2100;
  const PRISM_HEIGHT = 2200;
  const MAX_TEAM = 3;
  const LOCAL_DEX_SIZE = 18;
  const NORMAL_START = { ...CITY_MAP.spawn };
  const PORTAL_POSITION = { x: 1250, y: 1110 };
  const MAINTENANCE_ROOM = { x: 720, y: 560, w: 660, h: 520 };
  const MAINTENANCE_EXIT = { x: 1050, y: 1010, radius: 62 };
  const MAINTENANCE_TERMINAL = { x: 1050, y: 650, radius: 58 };
  const MAINTENANCE_OBSTACLES = [
    { x: 770, y: 625, w: 92, h: 280 },
    { x: 1238, y: 625, w: 92, h: 280 },
    { x: 935, y: 740, w: 230, h: 78 },
  ];

  const BUILDING_SHEET_URL = "https://www.spriters-resource.com/media/assets/4/3849.png?updated=1755472417";
  const PLAYER_SHEET_URL = "assets/sprites/ethan-hgss-sheet.png";
  const SHADOW_SPRITE_URL = "assets/images/shadow-stalker.png";
  const HORROR_AUDIO_URLS = {
    chase: "assets/audio/shadow-chase.mp3",
    breathing: "assets/audio/shadow-breathing.ogg",
    snarl: "assets/audio/shadow-snarl.ogg",
    jumpBass: "assets/audio/jumpscare-bass.mp3",
    jumpShriek: "assets/audio/jumpscare-shriek.mp3",
  };

  const TYPE_COLORS = {
    Normal: "#8c9283", Planta: "#5a9e58", Fuego: "#df7145", Agua: "#4f8fc3",
    Volador: "#7f9dc7", Bicho: "#8ba33c", Eléctrico: "#e6b93e", Veneno: "#9970ad",
    Fantasma: "#6d5a9b", Psíquico: "#d96f9c", Dragón: "#7362c5", Acero: "#79949f", Tierra: "#b58a54",
  };

  const MOVES = {
    tackle: { name: "Placaje", type: "Normal", power: 12, accuracy: 96 },
    vineWhip: { name: "Látigo Cepa", type: "Planta", power: 17, accuracy: 94 },
    scratch: { name: "Arañazo", type: "Normal", power: 13, accuracy: 97 },
    ember: { name: "Ascuas", type: "Fuego", power: 17, accuracy: 94 },
    waterGun: { name: "Pistola Agua", type: "Agua", power: 17, accuracy: 94 },
    gust: { name: "Tornado", type: "Volador", power: 14, accuracy: 95 },
    quickAttack: { name: "Ataque Rápido", type: "Normal", power: 15, accuracy: 98 },
    bugBite: { name: "Picadura", type: "Bicho", power: 14, accuracy: 95 },
    poisonSting: { name: "Picotazo Veneno", type: "Veneno", power: 13, accuracy: 95 },
    thunderShock: { name: "Impactrueno", type: "Eléctrico", power: 18, accuracy: 93 },
    absorb: { name: "Absorber", type: "Planta", power: 14, accuracy: 96, drain: true },
    lick: { name: "Lengüetazo", type: "Fantasma", power: 16, accuracy: 94 },
    confusion: { name: "Confusión", type: "Psíquico", power: 18, accuracy: 94 },
    headbutt: { name: "Cabezazo", type: "Normal", power: 17, accuracy: 92 },
    metalSound: { name: "Onda Metálica", type: "Acero", power: 17, accuracy: 94 },
    dragonRage: { name: "Furia Dragón", type: "Dragón", power: 19, accuracy: 92 },
  };

  const POKEMON = {
    1: { id: 1, name: "Bulbasaur", type: "Planta", secondaryType: "Veneno", baseHp: 25, catchRate: .34, moves: [MOVES.tackle, MOVES.vineWhip], description: "Paciente y resistente. Una elección muy equilibrada." },
    4: { id: 4, name: "Charmander", type: "Fuego", baseHp: 23, catchRate: .34, moves: [MOVES.scratch, MOVES.ember], description: "Valiente y enérgico. Sus ataques golpean con fuerza." },
    7: { id: 7, name: "Squirtle", type: "Agua", baseHp: 27, catchRate: .34, moves: [MOVES.tackle, MOVES.waterGun], description: "Sereno y tenaz. Aguanta muy bien los combates." },
    10: { id: 10, name: "Caterpie", type: "Bicho", baseHp: 20, catchRate: .68, moves: [MOVES.tackle, MOVES.bugBite] },
    13: { id: 13, name: "Weedle", type: "Bicho", secondaryType: "Veneno", baseHp: 20, catchRate: .66, moves: [MOVES.tackle, MOVES.poisonSting] },
    16: { id: 16, name: "Pidgey", type: "Volador", baseHp: 22, catchRate: .58, moves: [MOVES.tackle, MOVES.gust] },
    19: { id: 19, name: "Rattata", type: "Normal", baseHp: 21, catchRate: .60, moves: [MOVES.tackle, MOVES.quickAttack] },
    25: { id: 25, name: "Pikachu", type: "Eléctrico", baseHp: 23, catchRate: .32, moves: [MOVES.quickAttack, MOVES.thunderShock] },
    43: { id: 43, name: "Oddish", type: "Planta", secondaryType: "Veneno", baseHp: 24, catchRate: .53, moves: [MOVES.tackle, MOVES.absorb] },
    63: { id: 63, name: "Abra", type: "Psíquico", baseHp: 20, catchRate: .36, moves: [MOVES.confusion, MOVES.quickAttack] },
    81: { id: 81, name: "Magnemite", type: "Eléctrico", secondaryType: "Acero", baseHp: 25, catchRate: .42, moves: [MOVES.thunderShock, MOVES.metalSound] },
    92: { id: 92, name: "Gastly", type: "Fantasma", secondaryType: "Veneno", baseHp: 21, catchRate: .38, moves: [MOVES.lick, MOVES.confusion] },
    96: { id: 96, name: "Drowzee", type: "Psíquico", baseHp: 27, catchRate: .46, moves: [MOVES.confusion, MOVES.headbutt] },
    104: { id: 104, name: "Cubone", type: "Tierra", baseHp: 28, catchRate: .43, moves: [MOVES.headbutt, MOVES.tackle] },
    133: { id: 133, name: "Eevee", type: "Normal", baseHp: 25, catchRate: .28, moves: [MOVES.quickAttack, MOVES.headbutt] },
    147: { id: 147, name: "Dratini", type: "Dragón", baseHp: 29, catchRate: .22, moves: [MOVES.dragonRage, MOVES.tackle] },
    151: { id: 151, name: "Mew Espejo", type: "Psíquico", baseHp: 36, catchRate: 0, moves: [MOVES.confusion, MOVES.lick] },
    149: { id: 149, name: "Dragonite", type: "Dragón", secondaryType: "Volador", baseHp: 42, catchRate: 0, moves: [MOVES.dragonRage, MOVES.gust] },
    248: { id: 248, name: "Tyranitar", type: "Tierra", baseHp: 44, catchRate: 0, moves: [MOVES.headbutt, MOVES.lick] },
    373: { id: 373, name: "Salamence", type: "Dragón", secondaryType: "Volador", baseHp: 40, catchRate: 0, moves: [MOVES.dragonRage, MOVES.gust] },
    376: { id: 376, name: "Metagross", type: "Acero", secondaryType: "Psíquico", baseHp: 43, catchRate: 0, moves: [MOVES.metalSound, MOVES.confusion] },
    399: { id: 399, name: "Bidoof", type: "Normal", baseHp: 25, catchRate: 0, moves: [MOVES.tackle, MOVES.headbutt] },
    445: { id: 445, name: "Garchomp", type: "Dragón", secondaryType: "Tierra", baseHp: 41, catchRate: 0, moves: [MOVES.dragonRage, MOVES.headbutt] },
    635: { id: 635, name: "Hydreigon", type: "Dragón", baseHp: 40, catchRate: 0, moves: [MOVES.dragonRage, MOVES.lick] },
  };

  const SECRET_POWERHOUSE_IDS = [149, 248, 373, 376, 445, 635];
  const SECRET_POKEMON_IDS = [...SECRET_POWERHOUSE_IDS, 399];

  const STARTERS = [POKEMON[1], POKEMON[4], POKEMON[7]];
  const WILD_TABLE = [
    { id: 16, weight: 24 }, { id: 19, weight: 22 }, { id: 10, weight: 18 },
    { id: 13, weight: 15 }, { id: 43, weight: 14 }, { id: 25, weight: 7 },
  ];

  const PRISM_WILD_TABLE = [
    { id: 92, weight: 22 }, { id: 63, weight: 19 }, { id: 81, weight: 18 },
    { id: 96, weight: 16 }, { id: 104, weight: 13 }, { id: 133, weight: 8 }, { id: 147, weight: 4 },
  ];

  const BUILDING_SPRITES = {
    houseGreen: [24, 22, 80, 66], houseYellow: [114, 22, 82, 65], houseRed: [208, 22, 83, 71],
    houseBlue: [300, 25, 80, 63], houseTeal: [395, 24, 81, 65], houseOrange: [493, 27, 76, 62],
    housePurple: [579, 26, 80, 64], houseTall: [673, 25, 65, 74], tower: [8, 143, 109, 228],
    department: [142, 125, 144, 162], mansion: [296, 125, 128, 158], gym: [433, 132, 106, 105],
    gameCorner: [560, 136, 178, 103], mart: [454, 236, 66, 68], center: [502, 236, 92, 68],
    club: [621, 238, 81, 67], museum: [137, 340, 255, 115], daycare: [420, 339, 103, 83],
    lab: [532, 337, 131, 86], bike: [676, 337, 61, 91],
  };

  const SPRITE_CHOICES = [
    { id: "houseGreen", name: "Casa verde" }, { id: "houseYellow", name: "Casa amarilla" },
    { id: "houseRed", name: "Casa roja" }, { id: "houseBlue", name: "Casa azul" },
    { id: "houseTeal", name: "Casa turquesa" }, { id: "houseOrange", name: "Casa naranja" },
    { id: "housePurple", name: "Casa violeta" }, { id: "houseTall", name: "Edificio urbano" },
    { id: "department", name: "Grandes almacenes" }, { id: "mansion", name: "Bloque residencial" },
    { id: "gym", name: "Gimnasio Pokémon" }, { id: "gameCorner", name: "Edificio recreativo" },
    { id: "mart", name: "Poké Mart" }, { id: "center", name: "Centro Pokémon" },
    { id: "club", name: "Club Pokémon" }, { id: "museum", name: "Museo" },
    { id: "daycare", name: "Guardería" }, { id: "lab", name: "Laboratorio" },
    { id: "bike", name: "Tienda de bicis" }, { id: "tower", name: "Torre Pokémon" },
  ];

  const zones = [
    { id: "jerusalen", name: "Avenida Jerusalén", yStart: 0, yEnd: 280, pattern: 0 },
    { id: "estambul", name: "Residencial Norte", yStart: 280, yEnd: 650, pattern: 1 },
    { id: "memphis", name: "Parque San Pablo", yStart: 650, yEnd: 1120, pattern: 0 },
    { id: "persepolis", name: "Residencial Sur", yStart: 1120, yEnd: 1450, pattern: 1 },
    { id: "siracusa", name: "Avenida Tesalónica", yStart: 1450, yEnd: 1700, pattern: 2 },
  ];

  const roads = [
    { id: "jerusalen", name: "Avenida Jerusalén", x1: 0, y1: 120, x2: 2500, y2: 120, width: 126, kind: "vehicle", dashed: true },
    { id: "tesalonica", name: "Avenida Tesalónica", x1: 0, y1: 1580, x2: 2500, y2: 1580, width: 126, kind: "vehicle", dashed: true },
    { id: "paseo-oeste", name: "Paseo del Olivo", x1: 70, y1: 230, x2: 70, y2: 1500, width: 54, kind: "pedestrian", dashed: false },
    { id: "paseo-1", name: "Paseo de los Pinos", x1: 620, y1: 230, x2: 620, y2: 1500, width: 46, kind: "pedestrian", dashed: false },
    { id: "paseo-2", name: "Paseo del Centro", x1: 1220, y1: 230, x2: 1220, y2: 1500, width: 46, kind: "pedestrian", dashed: false },
    { id: "paseo-3", name: "Paseo de la Fuente", x1: 1820, y1: 230, x2: 1820, y2: 1500, width: 46, kind: "pedestrian", dashed: false },
    { id: "paseo-este", name: "Paseo de los Naranjos", x1: 2430, y1: 230, x2: 2430, y2: 1500, width: 54, kind: "pedestrian", dashed: false },
    { id: "parque-norte", name: "Sendero Norte", x1: 90, y1: 735, x2: 2410, y2: 735, width: 46, kind: "pedestrian", dashed: false },
    { id: "parque-sur", name: "Sendero Sur", x1: 90, y1: 1060, x2: 2410, y2: 1060, width: 46, kind: "pedestrian", dashed: false },
  ];

  const parkingLots = [
    { id: "jerusalen", x: 820, y: 218, w: 700, h: 48, a: 0 },
    { id: "tesalonica", x: 1680, y: 1482, w: 760, h: 48, a: 0 },
  ];

  const buildings = createMapBuildings();
  const field = { x: 1250, y: 900, w: 320, h: 210, a: 0 };
  const greenAreas = createGreenAreas();
  const encounterZones = greenAreas.map((area) => area.polygon);

  const pointsOfInterest = [
    { id: "dimension_portal", x: PORTAL_POSITION.x, y: PORTAL_POSITION.y, radius: 78 },
    { id: "health", x: 270, y: 875, radius: 64 },
    { id: "cafe", x: 2240, y: 875, radius: 62 },
    { id: "uned", x: 1250, y: 1180, radius: 72 },
    { id: "school", x: 270, y: 430, radius: 68 },
    { id: "field", x: 1250, y: 900, radius: 58 },
  ];

  const prismWalkableAreas = [
    { x: 720, y: 1500, w: 660, h: 610 },
    { x: 940, y: 780, w: 220, h: 780 },
    { x: 290, y: 210, w: 1520, h: 650 },
    { x: 110, y: 950, w: 670, h: 500 },
    { x: 740, y: 1120, w: 260, h: 150 },
    { x: 1350, y: 960, w: 640, h: 510 },
    { x: 1110, y: 1140, w: 300, h: 150 },
  ];

  const prismEncounterZones = [
    rectanglePolygon(390, 300, 1250, 400),
    rectanglePolygon(170, 1020, 520, 340),
    rectanglePolygon(1430, 1030, 480, 350),
    rectanglePolygon(790, 1590, 510, 360),
  ];

  const worldObjects = [
    { id: "balls-ada", dimension: "san_pablo", x: 430, y: 1145, kind: "balls", amount: 2, name: "2 Poké Balls", sprite: "poke-ball" },
    { id: "potion-memphis", dimension: "san_pablo", x: 1060, y: 850, kind: "potions", amount: 1, name: "Poción", sprite: "potion" },
    { id: "berry-estambul", dimension: "san_pablo", x: 1840, y: 1150, kind: "berries", amount: 2, name: "2 Bayas Aranja", sprite: "oran-berry" },
    { id: "shard-jerusalen", dimension: "san_pablo", x: 970, y: 275, kind: "prismShards", amount: 1, name: "Fragmento Prisma", crystal: true },
    { id: "shard-persepolis", dimension: "san_pablo", x: 1060, y: 1160, kind: "prismShards", amount: 1, name: "Fragmento Prisma", crystal: true },
    { id: "shard-siracusa", dimension: "san_pablo", x: 1250, y: 1435, kind: "prismShards", amount: 1, name: "Fragmento Prisma", crystal: true },
    { id: "ultra-west", dimension: "prism", x: 260, y: 1190, kind: "ultraBalls", amount: 2, name: "2 Ultra Balls", sprite: "ultra-ball" },
    { id: "max-potion-east", dimension: "prism", x: 1800, y: 1190, kind: "potions", amount: 2, name: "2 Pociones", sprite: "super-potion" },
    { id: "rare-candy-north", dimension: "prism", x: 1040, y: 360, kind: "rareCandies", amount: 1, name: "Caramelo Raro", sprite: "rare-candy" },
    { id: "berry-prism", dimension: "prism", x: 1530, y: 620, kind: "berries", amount: 3, name: "3 Bayas Aranja", sprite: "oran-berry" },
  ];

  const INVENTORY_ITEMS = [
    { key: "balls", name: "Poké Ball", sprite: "poke-ball", description: "Dispositivo estándar para capturar Pokémon." },
    { key: "ultraBalls", name: "Ultra Ball", sprite: "ultra-ball", description: "Aumenta mucho la probabilidad de captura." },
    { key: "potions", name: "Poción", sprite: "potion", description: "Restaura 20 PS al Pokémon activo." },
    { key: "berries", name: "Baya Aranja", sprite: "oran-berry", description: "Restaura 10 PS al Pokémon activo." },
    { key: "rareCandies", name: "Caramelo Raro", sprite: "rare-candy", description: "Sube inmediatamente un nivel." },
    { key: "prismShards", name: "Fragmento Prisma", sprite: "odd-keystone", description: "Tres fragmentos abren el portal dimensional." },
  ];

  const treePositions = [];
  const carPositions = [];

  const defaultState = () => ({
    version: 5, mapRevision: 7, started: false, starterChosen: false,
    worldX: NORMAL_START.x, worldY: NORMAL_START.y, direction: NORMAL_START.direction,
    distance: 0, grassDistance: 0, balls: 6, trainerLevel: 1,
    activeTeamIndex: 0, caught: [], seen: [], team: [], questStage: 0,
    clinicGiftClaimed: false, sound: true, buildingSkins: {},
    dimension: "san_pablo", dimensionVisited: false, caughtDimension: false,
    returnPosition: null, collectedObjects: [], interior: null, maintenanceReturn: null,
    maze: null, secretPokemonSaved: false, secretPokemonId: null,
    inventory: { potions: 1, berries: 1, ultraBalls: 0, rareCandies: 0, prismShards: 0 },
  });

  let state = defaultState();
  let battle = null;
  let inputLocked = false;
  let dialogQueue = [];
  let dialogCallback = null;
  let audioContext = null;
  let lastFrameTime = 0;
  let animationTime = 0;
  let animationFrame = 0;
  let playerRunning = false;
  let lastEncounterCheck = 0;
  let camera = { x: 640, y: 1140 };
  let lastArea = "";
  let lastSaveAt = 0;
  let saveStatusTimer = 0;
  let selectedBuildingId = "";
  let inventoryOpenedFromBattle = false;
  let mazeDefinition = null;
  let microphoneStream = null;
  let microphoneAnalyser = null;
  let microphoneData = null;
  let microphoneLevel = 0;
  let shadowPath = [];
  let shadowPathTimer = 0;
  let jumpScareActive = false;
  let flashlightBurst = 0;
  let sprintScare = null;
  let sprintScareCooldown = 7;
  let chaseMusicVolume = 0;
  let chasePlayPending = false;
  let breathingVolume = 0;
  let breathingPlayPending = false;
  let quietStillTime = 0;
  const mazeMotion = { forward: 0, strafe: 0, turn: 0 };
  const input = {
    up: false, down: false, left: false, right: false,
    strafeLeft: false, strafeRight: false, run: false,
  };

  const buildingSheet = new Image();
  const playerSheet = new Image();
  const cityMapImage = new Image();
  const shadowStalkerImage = new Image();
  const itemImages = new Map();
  const pokemonArtworkImages = new Map();
  const horrorAudio = Object.fromEntries(Object.entries(HORROR_AUDIO_URLS).map(([key, url]) => {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.loop = key === "chase" || key === "breathing";
    return [key, audio];
  }));
  const activeScareClips = new Set();
  let buildingSheetReady = false;
  let playerSheetReady = false;
  let cityMapReady = false;
  let shadowStalkerReady = false;
  const defaultMapTiles = new Map();
  const tileOverrides = new Map();
  const playerFrames = new Map();
  let selectedTileType = "blocked";
  let selectedMapTile = null;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const elements = {
    titleScreen: $("#titleScreen"), worldScreen: $("#worldScreen"), battleScreen: $("#battleScreen"),
    starterModal: $("#starterModal"), starterGrid: $("#starterGrid"), newGameButton: $("#newGameButton"),
    continueButton: $("#continueButton"), closeStarter: $("#closeStarter"), canvas: $("#worldCanvas"),
    assetNotice: $("#assetNotice"), runBadge: $("#runBadge"), interactPrompt: $("#interactPrompt"),
    areaToast: $("#areaToast"), flashOverlay: $("#flashOverlay"), areaName: $("#areaName"),
    trainerLevel: $("#trainerLevel"), ballCount: $("#ballCount"), caughtCount: $("#caughtCount"),
    questPill: $("#questPill"), dialogBox: $("#dialogBox"), dialogAvatar: $("#dialogAvatar"),
    dialogText: $("#dialogText"), dialogNext: $("#dialogNext"), teamDrawer: $("#teamDrawer"),
    drawerScrim: $("#drawerScrim"), teamList: $("#teamList"), drawerCaughtCount: $("#drawerCaughtCount"),
    dexProgress: $("#dexProgress"), teamButton: $("#teamButton"), closeTeamButton: $("#closeTeamButton"),
    saveButton: $("#saveButton"), resetButton: $("#resetButton"), soundButton: $("#soundButton"),
    soundIcon: $("#soundIcon"), enemyName: $("#enemyName"), enemyLevel: $("#enemyLevel"),
    enemyHpBar: $("#enemyHpBar"), enemyHpText: $("#enemyHpText"), enemySprite: $("#enemySprite"),
    activeName: $("#activeName"), activeLevel: $("#activeLevel"), activeHpBar: $("#activeHpBar"),
    activeHpText: $("#activeHpText"), activeExpBar: $("#activeExpBar"), activeSprite: $("#activeSprite"),
    battleActiveName: $("#battleActiveName"), battleMessage: $("#battleMessage"), battleMenu: $("#battleMenu"),
    battleLabel: $(".battle-label"),
    battleBallCount: $("#battleBallCount"), movesMenu: $("#movesMenu"), movesGrid: $("#movesGrid"),
    movesBack: $("#movesBack"), fightButton: $("#fightButton"), bagButton: $("#bagButton"),
    teamBattleButton: $("#teamBattleButton"), runButton: $("#runButton"),
    buildingEditorButton: $("#buildingEditorButton"), buildingEditor: $("#buildingEditor"),
    closeBuildingEditor: $("#closeBuildingEditor"), editorScrim: $("#editorScrim"),
    tileSelectionInfo: $("#tileSelectionInfo"), tilePalette: $("#tilePalette"),
    tileEditorHint: $("#tileEditorHint"), copyTileButton: $("#copyTileButton"),
    resetTileMap: $("#resetTileMap"),
    inventoryButton: $("#inventoryButton"), inventoryDrawer: $("#inventoryDrawer"),
    closeInventory: $("#closeInventory"), inventoryScrim: $("#inventoryScrim"),
    dimensionProgress: $("#dimensionProgress"), inventoryList: $("#inventoryList"),
    gameCard: $("#gameCard"), fullscreenButton: $("#fullscreenButton"),
    mazeHud: $("#mazeHud"), lightCharges: $("#lightCharges"), shadowStatus: $("#shadowStatus"),
    noiseMeter: $("#noiseMeter"), jumpScare: $("#jumpScare"), captureBadge: $("#captureBadge"),
    captureAreaName: $("#captureAreaName"), captureActivity: $("#captureActivity"),
    miniMap: $("#miniMap"), miniMapCanvas: $("#miniMapCanvas"), miniMapArea: $("#miniMapArea"),
    saveStatus: $("#saveStatus"),
  };

  async function requestGameFullscreen() {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    try { await document.documentElement.requestFullscreen(); } catch (error) { console.info("El navegador no permitió activar pantalla completa.", error); }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await requestGameFullscreen();
    } catch (error) { console.info("No se pudo cambiar el modo de pantalla.", error); }
  }

  function updateFullscreenButton() {
    const fullscreen = Boolean(document.fullscreenElement);
    elements.fullscreenButton.textContent = fullscreen ? "↙" : "⛶";
    elements.fullscreenButton.title = fullscreen ? "Salir de pantalla completa" : "Pantalla completa";
  }

  function createResidentialBand(zoneId, streetName, northY, southY, pattern) {
    const sprites = ["houseGreen", "houseYellow", "houseRed", "houseBlue", "houseTeal", "houseOrange", "housePurple"];
    const xPositions = [475, 665, 855, 1045, 1235, 1425, 1615];
    const result = [];
    [northY, southY].forEach((y, rowIndex) => {
      xPositions.forEach((x, index) => {
        const sprite = sprites[(index + pattern * 2 + rowIndex) % sprites.length];
        const suffix = `${rowIndex === 0 ? "N" : "S"}${index + 1}`;
        result.push({
          id: `${zoneId}-${suffix.toLowerCase()}`, zone: zoneId, x, y,
          w: index % 3 === 1 ? 168 : 158, h: 112, a: 0,
          sprite, defaultSprite: sprite, label: `Edificio ${streetName} ${suffix}`,
        });
      });
    });
    return result;
  }

  function createMapBuildings() {
    const mapBuildings = [
      { id: "bloque-norte-1", zone: "estambul", x: 330, y: 430, w: 500, h: 220, sprite: "mansion", renderStyle: "apartment", label: "Bloque Norte 1", doorSide: "bottom", doorOffsets: [-150, 0, 150] },
      { id: "bloque-norte-2", zone: "estambul", x: 930, y: 430, w: 500, h: 220, sprite: "mansion", renderStyle: "apartment", label: "Bloque Norte 2", doorSide: "bottom", doorOffsets: [-150, 0, 150] },
      { id: "bloque-norte-3", zone: "estambul", x: 1530, y: 430, w: 500, h: 220, sprite: "mansion", renderStyle: "apartment", label: "Bloque Norte 3", doorSide: "bottom", doorOffsets: [-150, 0, 150] },
      { id: "bloque-norte-4", zone: "estambul", x: 2130, y: 430, w: 500, h: 220, sprite: "mansion", renderStyle: "apartment", label: "Bloque Norte 4", doorSide: "bottom", doorOffsets: [-150, 0, 150] },
      { id: "bloque-sur-1", zone: "persepolis", x: 330, y: 1300, w: 500, h: 220, sprite: "mansion", renderStyle: "apartment", label: "Bloque Sur 1", doorSide: "top", doorOffsets: [-150, 0, 150] },
      { id: "bloque-sur-2", zone: "persepolis", x: 930, y: 1300, w: 500, h: 220, sprite: "mansion", renderStyle: "apartment", label: "Bloque Sur 2", doorSide: "top", doorOffsets: [-150, 0, 150] },
      { id: "bloque-sur-3", zone: "persepolis", x: 1530, y: 1300, w: 500, h: 220, sprite: "mansion", renderStyle: "apartment", label: "Bloque Sur 3", doorSide: "top", doorOffsets: [-150, 0, 150] },
      { id: "bloque-sur-4", zone: "persepolis", x: 2130, y: 1300, w: 500, h: 220, sprite: "mansion", renderStyle: "apartment", label: "Bloque Sur 4", doorSide: "top", doorOffsets: [-150, 0, 150] },
    ];
    mapBuildings.forEach((building) => {
      building.a = building.a || 0;
      building.defaultSprite = building.sprite;
      building.doorSide = building.doorSide || "bottom";
      building.doorOffsets = building.doorOffsets || [0];
    });
    return mapBuildings;
  }

  function rectanglePolygon(x, y, width, height) {
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  }

  function createGreenAreas() {
    return [
      { name: "Jardines del Parque San Pablo", polygon: rectanglePolygon(105, 680, 2290, 400) },
      { name: "Jardín Norte Oeste", polygon: rectanglePolygon(100, 275, 180, 300) },
      { name: "Jardín Norte Este", polygon: rectanglePolygon(2220, 275, 180, 300) },
      { name: "Jardín Sur Oeste", polygon: rectanglePolygon(100, 1120, 180, 300) },
      { name: "Jardín Sur Este", polygon: rectanglePolygon(2220, 1120, 180, 300) },
      { name: "Campo de fútbol de San Pablo", polygon: rectanglePolygon(field.x - field.w / 2, field.y - field.h / 2, field.w, field.h) },
    ];
  }

  function seededRandom(seed) {
    const value = Math.sin(seed * 91.733) * 43758.5453;
    return value - Math.floor(value);
  }

  function generateMaze(size = 21) {
    const grid = Array.from({ length: size }, () => Array(size).fill(1));
    const start = { x: 1, y: size - 2 };
    grid[start.y][start.x] = 0;
    const stack = [start];
    let iteration = 0;
    const baseDirections = [[2,0],[-2,0],[0,2],[0,-2]];

    while (stack.length) {
      const current = stack[stack.length - 1];
      const directions = baseDirections.slice().sort((a, b) => {
        const seedA = seededRandom(current.x * 17 + current.y * 31 + a[0] * 7 + a[1] * 11 + iteration);
        const seedB = seededRandom(current.x * 17 + current.y * 31 + b[0] * 7 + b[1] * 11 + iteration);
        return seedA - seedB;
      });
      const nextDirection = directions.find(([dx, dy]) => {
        const nx = current.x + dx; const ny = current.y + dy;
        return nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && grid[ny][nx] === 1;
      });
      if (!nextDirection) stack.pop();
      else {
        const [dx, dy] = nextDirection;
        grid[current.y + dy / 2][current.x + dx / 2] = 0;
        grid[current.y + dy][current.x + dx] = 0;
        stack.push({ x: current.x + dx, y: current.y + dy });
      }
      iteration += 1;
    }

    const distances = mazeDistances(grid, start);
    const cells = [...distances.entries()].map(([key, value]) => {
      const [x, y] = key.split(",").map(Number); return { x, y, distance: value };
    }).sort((a, b) => b.distance - a.distance);
    const goal = cells[0];
    const monster = cells.find((cell) => cell.distance > goal.distance * .58 && Math.abs(cell.x - goal.x) + Math.abs(cell.y - goal.y) > 8) || cells[Math.floor(cells.length * .18)];
    return { grid, size, start, goal: { x: goal.x, y: goal.y }, monster: { x: monster.x, y: monster.y } };
  }

  function mazeDistances(grid, start) {
    const distances = new Map([[`${start.x},${start.y}`, 0]]);
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      const currentDistance = distances.get(`${current.x},${current.y}`);
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dy]) => {
        const x = current.x + dx; const y = current.y + dy; const key = `${x},${y}`;
        if (grid[y]?.[x] === 0 && !distances.has(key)) { distances.set(key, currentDistance + 1); queue.push({ x, y }); }
      });
    }
    return distances;
  }

  function firstOpenDirection(grid, start) {
    const options = [{ dx: 1, dy: 0, angle: 0 }, { dx: 0, dy: -1, angle: -Math.PI / 2 }, { dx: -1, dy: 0, angle: Math.PI }, { dx: 0, dy: 1, angle: Math.PI / 2 }];
    return options.find((option) => grid[start.y + option.dy]?.[start.x + option.dx] === 0)?.angle ?? -Math.PI / 2;
  }

  function chooseSecretPokemonId() {
    if (Math.random() < .2) return 399;
    return SECRET_POWERHOUSE_IDS[Math.floor(Math.random() * SECRET_POWERHOUSE_IDS.length)];
  }

  function currentSecretPokemonId() {
    if (!SECRET_POKEMON_IDS.includes(state.secretPokemonId)) state.secretPokemonId = chooseSecretPokemonId();
    return state.secretPokemonId;
  }

  function ensureMazeState(reset = false) {
    if (!mazeDefinition) mazeDefinition = generateMaze();
    if (!state.maze || reset) {
      const { start, monster, grid } = mazeDefinition;
      state.maze = {
        playerX: start.x + .5, playerY: start.y + .5, angle: firstOpenDirection(grid, start),
        lightCharges: 3, monsterX: monster.x + .5, monsterY: monster.y + .5,
        monsterRepel: 0, captures: 0, steps: 0, alertTimer: 0,
      };
      shadowPath = []; shadowPathTimer = 0; sprintScare = null; sprintScareCooldown = 5;
      quietStillTime = 0;
      mazeMotion.forward = 0; mazeMotion.strafe = 0; mazeMotion.turn = 0;
    }
    if (!Number.isFinite(state.maze.alertTimer)) state.maze.alertTimer = 0;
    return state.maze;
  }

  async function requestMicrophoneAccess() {
    if (microphoneStream?.getAudioTracks().some((track) => track.readyState === "live")) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      showDialog(["Este navegador no ofrece acceso al micrófono. Abre el juego en Chrome mediante localhost o HTTPS."], "MIC");
      return false;
    }
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false,
      });
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!audioContext && AudioClass) audioContext = new AudioClass();
      if (audioContext?.state === "suspended") await audioContext.resume();
      const source = audioContext.createMediaStreamSource(microphoneStream);
      microphoneAnalyser = audioContext.createAnalyser();
      microphoneAnalyser.fftSize = 512;
      microphoneAnalyser.smoothingTimeConstant = .5;
      microphoneData = new Uint8Array(microphoneAnalyser.fftSize);
      source.connect(microphoneAnalyser);
      return true;
    } catch (error) {
      microphoneStream?.getTracks().forEach((track) => track.stop());
      microphoneStream = null; microphoneAnalyser = null; microphoneData = null;
      showDialog(["La Dimensión Invertida necesita escuchar el entorno.", "Permite el uso del micrófono en Chrome y vuelve a tocar el portal."], "MIC");
      return false;
    }
  }

  function stopChaseMusic(reset = false) {
    const music = horrorAudio.chase;
    music.pause();
    music.volume = 0;
    chaseMusicVolume = 0;
    chasePlayPending = false;
    if (reset) {
      try { music.currentTime = 0; } catch (error) { /* Metadata may not be ready yet. */ }
    }
  }

  function stopHorrorAudio() {
    stopChaseMusic(true);
    stopProximityBreathing(true);
    activeScareClips.forEach((clip) => {
      clip.pause();
      try { clip.currentTime = 0; } catch (error) { /* Ignore unloaded clips. */ }
    });
    activeScareClips.clear();
  }

  function playHorrorClip(template, volume = .55, startPan = 0, endPan = startPan, duration = 0) {
    if (!state.sound || !template) return null;
    const clip = template.cloneNode();
    clip.loop = false;
    clip.preload = "auto";
    activeScareClips.add(clip);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      activeScareClips.delete(clip);
    };
    clip.addEventListener("ended", cleanup, { once: true });

    try {
      const context = ensureAudio();
      if (context?.createStereoPanner) {
        const source = context.createMediaElementSource(clip);
        const panner = context.createStereoPanner();
        const gain = context.createGain();
        const now = context.currentTime;
        clip.volume = 1;
        panner.pan.setValueAtTime(clamp(startPan, -1, 1), now);
        panner.pan.linearRampToValueAtTime(clamp(endPan, -1, 1), now + Math.max(.45, duration || 1.5));
        gain.gain.setValueAtTime(clamp(volume, 0, .82), now);
        source.connect(panner); panner.connect(gain); gain.connect(context.destination);
      } else clip.volume = clamp(volume, 0, .82);
    } catch (error) {
      clip.volume = clamp(volume, 0, .82);
    }

    clip.play().catch(cleanup);
    if (duration > 0) window.setTimeout(() => { clip.pause(); cleanup(); }, duration * 1000);
    return clip;
  }

  function updateChaseMusic(deltaSeconds, chasing) {
    const music = horrorAudio.chase;
    const target = state.sound && chasing && !jumpScareActive ? .46 : 0;
    const smoothing = 1 - Math.pow(target > chaseMusicVolume ? .012 : .0015, deltaSeconds);
    chaseMusicVolume += (target - chaseMusicVolume) * smoothing;
    music.volume = clamp(chaseMusicVolume, 0, .46);
    if (target > 0 && music.paused && !chasePlayPending) {
      chasePlayPending = true;
      music.play().catch(() => {}).finally(() => { chasePlayPending = false; });
    }
    if (target === 0 && chaseMusicVolume < .008 && !music.paused) music.pause();
  }

  function stopProximityBreathing(reset = false) {
    const breathing = horrorAudio.breathing;
    breathing.pause();
    breathing.volume = 0;
    breathing.playbackRate = 1;
    breathingVolume = 0;
    breathingPlayPending = false;
    if (reset) {
      try { breathing.currentTime = 0; } catch (error) { /* Metadata may not be ready yet. */ }
    }
  }

  function updateProximityBreathing(deltaSeconds, shadowDistance, active = true) {
    const breathing = horrorAudio.breathing;
    const proximity = clamp((9 - shadowDistance) / 7.5, 0, 1);
    const closePressure = Math.pow(proximity, 1.35);
    const target = state.sound && active && state.dimension === "prism"
      ? Math.max(sprintScare ? .94 : 0, closePressure * .94)
      : 0;
    const smoothing = 1 - Math.pow(target > breathingVolume ? .003 : .025, deltaSeconds);
    breathingVolume += (target - breathingVolume) * smoothing;
    breathing.volume = clamp(breathingVolume, 0, .94);
    breathing.playbackRate = .92 + proximity * .26;
    if (target > .015 && breathing.paused && !breathingPlayPending) {
      breathingPlayPending = true;
      breathing.play().catch(() => {}).finally(() => { breathingPlayPending = false; });
    }
    if (target === 0 && breathingVolume < .008 && !breathing.paused) breathing.pause();
  }

  function stopMicrophone() {
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null; microphoneAnalyser = null; microphoneData = null; microphoneLevel = 0;
    sprintScare = null;
    quietStillTime = 0;
    mazeMotion.forward = 0; mazeMotion.strafe = 0; mazeMotion.turn = 0;
    stopHorrorAudio();
  }

  function updateMicrophoneLevel() {
    if (!microphoneAnalyser || !microphoneData) { microphoneLevel = 0; return 0; }
    microphoneAnalyser.getByteTimeDomainData(microphoneData);
    let sum = 0;
    for (const sample of microphoneData) { const centered = (sample - 128) / 128; sum += centered * centered; }
    const rms = Math.sqrt(sum / microphoneData.length);
    microphoneLevel = clamp((rms - .012) * 7.5, 0, 1);
    return microphoneLevel;
  }

  function prepareWorldDecorations() {
    for (let index = 0; index < 118; index += 1) {
      const zone = encounterZones[index % encounterZones.length];
      const xs = zone.map((point) => point[0]);
      const ys = zone.map((point) => point[1]);
      const x = Math.min(...xs) + seededRandom(index + 10) * (Math.max(...xs) - Math.min(...xs));
      const y = Math.min(...ys) + seededRandom(index + 120) * (Math.max(...ys) - Math.min(...ys));
      if (pointInPolygon(x, y, zone) && !collidesWithBuilding(x, y, 30)) {
        treePositions.push({ x, y, size: 24 + seededRandom(index + 300) * 12 });
      }
    }
    for (let x = 55; x < WORLD_WIDTH; x += 58) {
      treePositions.push({ x, y: 58 + seededRandom(x) * 24, size: 38 });
      treePositions.push({ x, y: WORLD_HEIGHT - 38 - seededRandom(x + 1) * 24, size: 38 });
    }
    for (let y = 135; y < WORLD_HEIGHT - 100; y += 62) {
      treePositions.push({ x: 55 + seededRandom(y) * 22, y, size: 38 });
      treePositions.push({ x: WORLD_WIDTH - 45 - seededRandom(y + 1) * 22, y, size: 38 });
    }
    const vehicleRoads = roads.filter((road) => road.kind === "vehicle");
    for (let index = 0; index < 38; index += 1) {
      const road = vehicleRoads[index % vehicleRoads.length];
      const position = .06 + seededRandom(index + 520) * .88;
      const angle = Math.atan2(road.y2 - road.y1, road.x2 - road.x1);
      const laneOffset = (index % 2 ? 1 : -1) * road.width * .25;
      carPositions.push({
        x: road.x1 + (road.x2 - road.x1) * position - Math.sin(angle) * laneOffset,
        y: road.y1 + (road.y2 - road.y1) * position + Math.cos(angle) * laneOffset,
        color: ["#d7564f", "#4b83a5", "#eee8cf", "#dea944", "#7d8790"][index % 5],
        angle,
      });
    }
  }

  function artworkUrl(id) { return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`; }
  function iconUrl(id) { return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/${id}.png`; }
  function frontSpriteUrl(id) { return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`; }
  function backSpriteUrl(id) { return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/${id}.gif`; }
  function itemSpriteUrl(name) { return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${name}.png`; }
  function currentWorldWidth() { return state.dimension === "prism" ? PRISM_WIDTH : WORLD_WIDTH; }
  function currentWorldHeight() { return state.dimension === "prism" ? PRISM_HEIGHT : WORLD_HEIGHT; }

  function attachSpriteFallback(image, id, back = false) {
    image.onerror = () => {
      image.onerror = null;
      image.src = back
        ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${id}.png`
        : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
    };
  }

  function loadAssets() {
    buildingSheet.onload = () => { buildingSheetReady = true; };
    buildingSheet.onerror = () => { buildingSheetReady = false; };
    playerSheet.onload = () => { buildPlayerFrames(); playerSheetReady = true; updateAssetNotice(); };
    playerSheet.onerror = () => { playerSheetReady = false; elements.assetNotice.textContent = "Personaje en modo alternativo"; };
    cityMapImage.onload = () => { cityMapReady = true; document.documentElement.dataset.cityMapReady = "true"; updateAssetNotice(); };
    cityMapImage.onerror = () => { cityMapReady = false; document.documentElement.dataset.cityMapReady = "false"; elements.assetNotice.textContent = "No se pudo cargar el mapa de la ciudad"; };
    shadowStalkerImage.onload = () => { shadowStalkerReady = true; };
    shadowStalkerImage.onerror = () => { shadowStalkerReady = false; };
    buildingSheet.src = BUILDING_SHEET_URL;
    playerSheet.src = PLAYER_SHEET_URL;
    cityMapImage.src = CITY_MAP.image;
    shadowStalkerImage.src = SHADOW_SPRITE_URL;
    Object.values(horrorAudio).forEach((audio) => audio.load());
  }

  function updateAssetNotice() {
    if (cityMapReady && playerSheetReady) elements.assetNotice.classList.add("hidden");
  }

  function zoneAtY(y) {
    if (y < 520) return { id: "north", name: "Parque Norte" };
    if (y < 1120) return { id: "center", name: "Centro de la ciudad" };
    return { id: "south", name: "Barrio Sur" };
  }

  function tileKey(col, row) { return `${col},${row}`; }

  function setDefaultTileRect(type, rect) {
    const [startCol, startRow, endCol, endRow] = rect;
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) defaultMapTiles.set(tileKey(col, row), type);
    }
  }

  function initializeMapTiles() {
    defaultMapTiles.clear();
    CITY_MAP.blockedRects.forEach((rect) => setDefaultTileRect("blocked", rect));
    CITY_MAP.encounterRects.forEach((rect) => setDefaultTileRect("encounter", rect));
    CITY_MAP.doors.forEach((door) => defaultMapTiles.set(tileKey(door.col, door.row), "door"));
    tileOverrides.clear();
    try {
      const saved = JSON.parse(window.localStorage.getItem(MAP_EDIT_KEY) || "[]");
      if (Array.isArray(saved)) saved.forEach(([key, type]) => {
        if (/^\d+,\d+$/.test(key) && ["walkable", "blocked", "door", "encounter", "event"].includes(type)) tileOverrides.set(key, type);
      });
    } catch (error) { console.warn("No se pudo cargar la cuadrícula editada.", error); }
  }

  function saveMapTiles() {
    try { window.localStorage.setItem(MAP_EDIT_KEY, JSON.stringify([...tileOverrides])); }
    catch (error) { console.warn("No se pudo guardar la cuadrícula.", error); }
  }

  function mapTileType(col, row) {
    if (col < 0 || row < 0 || col >= Math.ceil(WORLD_WIDTH / CITY_MAP.tileSize) || row >= Math.ceil(WORLD_HEIGHT / CITY_MAP.tileSize)) return "blocked";
    const key = tileKey(col, row);
    return tileOverrides.has(key) ? tileOverrides.get(key) : (defaultMapTiles.get(key) || "walkable");
  }

  function worldToTile(x, y) {
    return { col: Math.floor(x / CITY_MAP.tileSize), row: Math.floor(y / CITY_MAP.tileSize) };
  }

  function cityMapCanOccupy(x, y) {
    const radius = 9;
    if (x < radius || y < radius || x > WORLD_WIDTH - radius || y > WORLD_HEIGHT - radius) return false;
    return [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]].every(([offsetX, offsetY]) => {
      const tile = worldToTile(x + offsetX, y + offsetY);
      return mapTileType(tile.col, tile.row) !== "blocked";
    });
  }

  function defaultDoorAt(col, row) {
    return CITY_MAP.doors.find((door) => door.col === col && door.row === row) || null;
  }

  function nearbyMapInteraction() {
    const offsets = { up: [0, -24], down: [0, 24], left: [-24, 0], right: [24, 0] };
    const [offsetX, offsetY] = offsets[state.direction] || [0, 0];
    const candidates = [worldToTile(state.worldX + offsetX, state.worldY + offsetY), worldToTile(state.worldX, state.worldY)];
    for (const tile of candidates) {
      const type = mapTileType(tile.col, tile.row);
      if (type === "door" || type === "event") return { id: "map_tile", type, ...tile, event: defaultDoorAt(tile.col, tile.row) };
    }
    return null;
  }

  function buildPlayerFrames() {
    playerFrames.clear();
    let minimumOpaquePixels = Infinity;
    const frameSets = {
      "walk-down": [0, 0, 3], "walk-right": [0, 32, 3], "walk-up": [0, 64, 3], "walk-left": [0, 96, 3],
      "run-up": [88, 0, 3], "run-right": [88, 32, 3], "run-down": [88, 64, 3], "run-left": [88, 96, 3],
    };
    Object.entries(frameSets).forEach(([name, [startX, startY, count]]) => {
      const frames = [];
      for (let index = 0; index < count; index += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = 24; canvas.height = 32;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(playerSheet, startX + index * 24, startY, 24, 32, 0, 0, 24, 32);
        const pixels = context.getImageData(0, 0, 24, 32);
        for (let pixel = 0; pixel < pixels.data.length; pixel += 4) {
          if (pixels.data[pixel] < 24 && pixels.data[pixel + 1] > 95 && pixels.data[pixel + 2] > 205) pixels.data[pixel + 3] = 0;
        }
        let opaquePixels = 0;
        for (let pixel = 3; pixel < pixels.data.length; pixel += 4) if (pixels.data[pixel] > 0) opaquePixels += 1;
        minimumOpaquePixels = Math.min(minimumOpaquePixels, opaquePixels);
        context.putImageData(pixels, 0, 0);
        frames.push(canvas);
      }
      playerFrames.set(name, frames);
    });
    document.documentElement.dataset.playerFrames = [...playerFrames].map(([name, frames]) => `${name}:${frames.length}`).join(",");
    document.documentElement.dataset.playerOpaqueMin = String(minimumOpaquePixels);
  }

  function openBuildingEditor() {
    if (!state.started || state.dimension !== "san_pablo" || state.interior) return;
    closeTeam(); closeInventoryPanel(); clearDirectionalInput();
    elements.buildingEditor.classList.add("open");
    elements.buildingEditor.setAttribute("aria-hidden", "false");
    elements.editorScrim.classList.remove("hidden");
    updateTileEditorInfo();
  }

  function closeBuildingEditorPanel() {
    elements.buildingEditor.classList.remove("open");
    elements.buildingEditor.setAttribute("aria-hidden", "true");
    elements.editorScrim.classList.add("hidden");
  }

  function updateTileEditorInfo() {
    const labels = { walkable: "Transitable", blocked: "Bloqueada", door: "Puerta", encounter: "Hierba / encuentro", event: "Evento" };
    elements.tileEditorHint.textContent = `Modo actual: ${labels[selectedTileType]}`;
    $$('[data-tile-type]').forEach((button) => button.classList.toggle("selected", button.dataset.tileType === selectedTileType));
    if (!selectedMapTile) {
      elements.tileSelectionInfo.innerHTML = "<span>Selecciona una casilla</span><span>C— · F—</span>";
      return;
    }
    const type = mapTileType(selectedMapTile.col, selectedMapTile.row);
    elements.tileSelectionInfo.innerHTML = `<span>${labels[type]}</span><span>C${selectedMapTile.col} · F${selectedMapTile.row}</span>`;
  }

  function handleMapEditorClick(event) {
    if (!elements.buildingEditor.classList.contains("open")) return;
    const rect = elements.canvas.getBoundingClientRect();
    const worldX = camera.x + (event.clientX - rect.left) * (VIEW_WIDTH / rect.width);
    const worldY = camera.y + (event.clientY - rect.top) * (VIEW_HEIGHT / rect.height);
    selectedMapTile = worldToTile(worldX, worldY);
    tileOverrides.set(tileKey(selectedMapTile.col, selectedMapTile.row), selectedTileType);
    saveMapTiles(); updateTileEditorInfo();
  }

  function inventoryCount(key) {
    return key === "balls" ? state.balls : Math.max(0, Number(state.inventory[key]) || 0);
  }

  function openInventory(fromBattle = false) {
    if (!state.started) return;
    if (battle?.secretBattle) {
      setBattleMessage("La energía del laberinto bloquea la mochila durante el rescate.");
      return;
    }
    closeTeam(); closeBuildingEditorPanel(); clearDirectionalInput();
    inventoryOpenedFromBattle = fromBattle && Boolean(battle);
    renderInventory();
    elements.inventoryDrawer.classList.add("open");
    elements.inventoryDrawer.setAttribute("aria-hidden", "false");
    elements.inventoryScrim.classList.remove("hidden");
  }

  function closeInventoryPanel() {
    elements.inventoryDrawer.classList.remove("open");
    elements.inventoryDrawer.setAttribute("aria-hidden", "true");
    elements.inventoryScrim.classList.add("hidden");
    inventoryOpenedFromBattle = false;
  }

  function renderInventory() {
    if (!elements.inventoryList) return;
    const shards = clamp(state.inventory.prismShards, 0, 3);
    const portalLabel = shards < 3 ? `${shards} de 3 fragmentos` : state.dimensionVisited ? "Portal estabilizado" : "Portal listo para abrir";
    elements.dimensionProgress.innerHTML = `
      <div><strong>DIMENSIÓN PRISMA</strong><span>${portalLabel}</span></div>
      <div class="shard-track"><i class="${shards >= 1 ? "found" : ""}"></i><i class="${shards >= 2 ? "found" : ""}"></i><i class="${shards >= 3 ? "found" : ""}"></i></div>`;

    elements.inventoryList.innerHTML = INVENTORY_ITEMS.map((item) => {
      const count = inventoryCount(item.key);
      const active = activePokemon();
      let action = "";
      let disabled = count <= 0;
      if (["balls", "ultraBalls"].includes(item.key)) {
        action = inventoryOpenedFromBattle ? "LANZAR" : "COMBATE";
        disabled = disabled || !inventoryOpenedFromBattle;
      } else if (["potions", "berries"].includes(item.key)) {
        action = "USAR";
        disabled = disabled || !active || active.hp >= active.maxHp;
      } else if (item.key === "rareCandies") {
        action = "USAR";
        disabled = disabled || !active;
      } else {
        action = "CLAVE";
        disabled = true;
      }
      return `<article class="inventory-item ${count <= 0 ? "locked" : ""}">
        <img src="${itemSpriteUrl(item.sprite)}" alt="${item.name}" draggable="false" />
        <div class="inventory-item-info"><div><strong>${item.name}</strong><b>× ${count}</b></div><p>${item.description}</p></div>
        <button type="button" data-inventory-use="${item.key}" ${disabled ? "disabled" : ""}>${action}</button>
      </article>`;
    }).join("");
    $$('[data-inventory-use]').forEach((button) => button.addEventListener("click", () => useInventoryItem(button.dataset.inventoryUse)));
  }

  async function useInventoryItem(key) {
    if (inventoryCount(key) <= 0) return;
    if (key === "balls" || key === "ultraBalls") {
      closeInventoryPanel();
      await throwBall(key === "ultraBalls" ? "ultra" : "poke");
      return;
    }

    const active = activePokemon();
    if (!active) return;
    if (key === "potions" || key === "berries") {
      if (active.hp >= active.maxHp) return;
      const healing = key === "potions" ? 20 : 10;
      state.inventory[key] -= 1;
      active.hp = Math.min(active.maxHp, active.hp + healing);
      closeInventoryPanel();
      renderHud(); saveGame(); playJingle("success");
      if (battle) {
        setBattleBusy(true); updateBattleHealth(); setBattleMessage(`¡${speciesOf(active).name} recuperó ${healing} PS!`);
        await wait(800); await enemyTurn();
      } else showAreaToast(`${speciesOf(active).name.toUpperCase()} RECUPERA ${healing} PS`);
      return;
    }

    if (key === "rareCandies") {
      state.inventory.rareCandies -= 1;
      active.level += 1; active.maxHp += 3; active.hp = active.maxHp;
      state.trainerLevel = Math.max(1, Math.floor(state.team.reduce((sum, member) => sum + member.level, 0) / state.team.length) - 3);
      closeInventoryPanel(); renderHud(); saveGame(); playJingle("level");
      if (battle) {
        setBattleBusy(true); renderBattle(); setBattleMessage(`¡${speciesOf(active).name} subió al nivel ${active.level}!`);
        await wait(900); await enemyTurn();
      } else showDialog([`¡${speciesOf(active).name} subió al nivel ${active.level}!`], "★");
    }
  }

  function createPokemon(id, level = 3) {
    const species = POKEMON[id];
    const maxHp = species.baseHp + level * 3;
    return { id, level, exp: 0, hp: maxHp, maxHp };
  }

  function hydratePokemon(member) {
    const species = POKEMON[member.id];
    if (!species) return null;
    const level = clamp(Number(member.level) || 1, 1, 50);
    const storedMaxHp = Number(member.maxHp);
    const maxHp = Number.isFinite(storedMaxHp) && storedMaxHp > 0 ? storedMaxHp : species.baseHp + level * 3;
    const storedHp = Number(member.hp);
    return {
      id: species.id,
      level,
      exp: Math.max(0, Number(member.exp) || 0),
      maxHp,
      hp: Number.isFinite(storedHp) ? clamp(storedHp, 0, maxHp) : maxHp,
      inverted: Boolean(member.inverted),
    };
  }

  function speciesOf(member) { return POKEMON[member.id]; }
  function activePokemon() {
    if (!state.team.length) return null;
    state.activeTeamIndex = clamp(state.activeTeamIndex, 0, state.team.length - 1);
    return state.team[state.activeTeamIndex];
  }

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      const next = { ...defaultState(), ...saved };
      next.team = Array.isArray(saved.team) ? saved.team.map(hydratePokemon).filter(Boolean).slice(0, MAX_TEAM) : [];
      next.caught = Array.isArray(saved.caught) ? [...new Set(saved.caught.filter((id) => POKEMON[id]))] : [];
      next.seen = Array.isArray(saved.seen) ? [...new Set(saved.seen.filter((id) => POKEMON[id]))] : [];
      next.worldX = clamp(Number(saved.worldX) || NORMAL_START.x, 35, WORLD_WIDTH - 35);
      next.worldY = clamp(Number(saved.worldY) || NORMAL_START.y, 45, WORLD_HEIGHT - 30);
      if (saved.mapRevision !== 7) {
        next.worldX = NORMAL_START.x;
        next.worldY = NORMAL_START.y;
        next.direction = NORMAL_START.direction;
        next.mapRevision = 7;
        next.interior = null;
        next.maintenanceReturn = null;
      }
      next.buildingSkins = saved.buildingSkins && typeof saved.buildingSkins === "object" ? { ...saved.buildingSkins } : {};
      next.inventory = { ...defaultState().inventory, ...(saved.inventory || {}) };
      next.collectedObjects = Array.isArray(saved.collectedObjects) ? [...new Set(saved.collectedObjects)] : [];
      next.secretPokemonId = POKEMON[saved.secretPokemonId] ? Number(saved.secretPokemonId) : null;
      next.interior = saved.interior === "maintenance" ? "maintenance" : null;
      next.maintenanceReturn = saved.maintenanceReturn && Number.isFinite(saved.maintenanceReturn.x) && Number.isFinite(saved.maintenanceReturn.y)
        ? {
          x: clamp(saved.maintenanceReturn.x, 105, WORLD_WIDTH - 105),
          y: clamp(saved.maintenanceReturn.y, 90, WORLD_HEIGHT - 90),
          direction: saved.maintenanceReturn.direction || "down",
          buildingId: saved.maintenanceReturn.buildingId || null,
        }
        : null;
      if (saved.mapRevision !== 7) { next.interior = null; next.maintenanceReturn = null; }
      if (next.interior && !next.maintenanceReturn) next.interior = null;
      if ((Number(saved.version) || 0) < 4) {
        next.version = 4;
        next.secretPokemonSaved = false;
        next.secretPokemonId = null;
      }
      next.dimension = saved.dimension === "prism" ? "prism" : "san_pablo";
      if (next.dimension === "prism") {
        next.dimension = "san_pablo";
        next.worldX = PORTAL_POSITION.x;
        next.worldY = PORTAL_POSITION.y + field.h / 2 + 70;
        next.returnPosition = null;
        next.interior = null;
        next.maintenanceReturn = null;
      }
      next.activeTeamIndex = clamp(Number(saved.activeTeamIndex) || 0, 0, Math.max(0, next.team.length - 1));
      state = next;
      camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, currentWorldWidth() - VIEW_WIDTH);
      camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, currentWorldHeight() - VIEW_HEIGHT);
      return state.started && state.team.length > 0;
    } catch (error) {
      console.warn("No se pudo cargar la partida.", error);
      return false;
    }
  }

  function saveGame(showConfirmation = false) {
    if (!state.started) return;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      showSaveStatus();
      if (showConfirmation) showDialog(["Partida guardada en este navegador."], "✓");
    } catch (error) {
      console.warn("No se pudo guardar la partida.", error);
      if (showConfirmation) showDialog(["No ha sido posible guardar la partida."], "!");
    }
  }

  function showSaveStatus() {
    if (!elements.saveStatus || elements.worldScreen.classList.contains("hidden")) return;
    window.clearTimeout(saveStatusTimer);
    elements.saveStatus.classList.remove("hidden");
    void elements.saveStatus.offsetWidth;
    elements.saveStatus.style.animation = "none";
    void elements.saveStatus.offsetWidth;
    elements.saveStatus.style.animation = "";
    saveStatusTimer = window.setTimeout(() => elements.saveStatus.classList.add("hidden"), 1750);
  }

  function renderStarters() {
    const backgrounds = { Planta: "#dcebc5", Fuego: "#f5ddc8", Agua: "#d6e9ef" };
    elements.starterGrid.innerHTML = STARTERS.map((starter) => `
      <article class="starter-card" style="--starter-color:${TYPE_COLORS[starter.type]};--starter-bg:${backgrounds[starter.type]}">
        <img src="${artworkUrl(starter.id)}" alt="${starter.name}" draggable="false" />
        <h3>${starter.name}</h3><span class="starter-type">${starter.type}</span>
        <p>${starter.description}</p><button type="button" data-starter="${starter.id}">Elegir a ${starter.name}</button>
      </article>
    `).join("");
    $$('[data-starter]').forEach((button) => button.addEventListener("click", () => chooseStarter(Number(button.dataset.starter))));
  }

  function startNewGame() {
    requestGameFullscreen();
    state = defaultState();
    elements.starterModal.classList.remove("hidden");
    playTone(560, .08, "square", .035);
  }

  function chooseStarter(id) {
    state.started = true;
    state.starterChosen = true;
    state.team = [createPokemon(id, 5)];
    state.caught = [id];
    state.seen = [id];
    state.worldX = NORMAL_START.x;
    state.worldY = NORMAL_START.y;
    state.direction = NORMAL_START.direction;
    camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, currentWorldWidth() - VIEW_WIDTH);
    camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, currentWorldHeight() - VIEW_HEIGHT);
    elements.starterModal.classList.add("hidden");
    showWorld();
    saveGame();
    playJingle("success");
    showDialog([
      `¡${POKEMON[id].name} será tu compañero por la ciudad!`,
      "Mantén SHIFT para correr. Ethan usa animaciones distintas para caminar y correr en las cuatro direcciones.",
      "El botón # abre la cuadrícula: pulsa una casilla para marcarla como transitable, bloqueada, puerta, hierba o evento.",
      "Cuando quieras indicarme cambios puedes copiar una coordenada, por ejemplo: C65, F33 = puerta.",
    ], "P", () => showAreaToast("CIUDAD POKÉMON"));
  }

  function continueGame() {
    requestGameFullscreen();
    if (!loadGame()) return;
    showWorld();
    showAreaToast("CIUDAD POKÉMON");
  }

  function showWorld() {
    elements.titleScreen.classList.add("hidden");
    elements.battleScreen.classList.add("hidden");
    elements.worldScreen.classList.remove("hidden");
    elements.buildingEditorButton.disabled = state.dimension === "prism" || Boolean(state.interior);
    elements.worldScreen.classList.toggle("maze-mode", state.dimension === "prism");
    elements.mazeHud.classList.toggle("hidden", state.dimension !== "prism");
    renderHud();
    if (state.started) startBackgroundMusic();
  }

  function renderHud() {
    elements.trainerLevel.textContent = state.trainerLevel;
    elements.ballCount.textContent = state.balls;
    elements.caughtCount.textContent = state.caught.length;
    elements.battleBallCount.textContent = `× ${state.balls + state.inventory.ultraBalls}`;
    elements.soundIcon.textContent = state.sound ? "♪" : "×";
    const objectives = [
      "Explora Ciudad Pokémon",
      "Captura tu primer Pokémon salvaje",
      "Forma un equipo de 3 Pokémon",
      "Visita el Centro Pokémon (C65, F33)",
      "¡Objetivo cumplido! Sigue explorando",
    ];
    let objective = objectives[clamp(state.questStage, 0, 4)];
    let completed = state.questStage >= 4;
    elements.questPill.querySelector("strong").textContent = objective;
    elements.questPill.querySelector(":scope > span").textContent = completed ? "✓" : "!";
    renderTeam();
    renderInventory();
  }

  function showAreaToast(text) {
    elements.areaToast.textContent = text;
    elements.areaToast.classList.remove("hidden");
    window.setTimeout(() => elements.areaToast.classList.add("hidden"), 1850);
  }

  function showDialog(messages, avatar = "!", callback = null) {
    dialogQueue = Array.isArray(messages) ? [...messages] : [String(messages)];
    dialogCallback = callback;
    inputLocked = true;
    clearDirectionalInput();
    elements.dialogAvatar.textContent = avatar;
    elements.dialogBox.classList.remove("hidden");
    advanceDialog();
  }

  function advanceDialog() {
    if (dialogQueue.length) {
      elements.dialogText.textContent = dialogQueue.shift();
      playTone(420, .025, "square", .018);
      return;
    }
    elements.dialogBox.classList.add("hidden");
    inputLocked = false;
    const callback = dialogCallback;
    dialogCallback = null;
    if (callback) callback();
  }

  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const xi = polygon[i][0]; const yi = polygon[i][1];
      const xj = polygon[j][0]; const yj = polygon[j][1];
      const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function rotatedRectPolygon(building, padding = 0) {
    const width = building.w + padding * 2;
    const height = building.h + padding * 2;
    const cosine = Math.cos(building.a || 0);
    const sine = Math.sin(building.a || 0);
    return [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]]
      .map(([x, y]) => [building.x + x * cosine - y * sine, building.y + x * sine + y * cosine]);
  }

  function collidesWithBuilding(x, y, padding = 16) {
    return buildings.some((building) => pointInPolygon(x, y, rotatedRectPolygon(building, padding)));
  }

  function buildingDoorAt(building, offset = building.doorOffset || 0) {
    const side = building.doorSide || "bottom";
    let localX = offset; let localY = building.h / 2 + 34;
    let facadeX = offset; let facadeY = building.h / 2 - 18;
    let rotation = 0;
    if (side === "top") {
      localY = -building.h / 2 - 34; facadeY = -building.h / 2 + 18; rotation = Math.PI;
    } else if (side === "left") {
      localX = -building.w / 2 - 34; localY = offset;
      facadeX = -building.w / 2 + 18; facadeY = offset; rotation = Math.PI / 2;
    } else if (side === "right") {
      localX = building.w / 2 + 34; localY = offset;
      facadeX = building.w / 2 - 18; facadeY = offset; rotation = -Math.PI / 2;
    }
    const cosine = Math.cos(building.a || 0); const sine = Math.sin(building.a || 0);
    const worldPoint = (px, py) => ({ x: building.x + px * cosine - py * sine, y: building.y + px * sine + py * cosine });
    return {
      ...worldPoint(localX, localY), facade: worldPoint(facadeX, facadeY),
      rotation: rotation + (building.a || 0), buildingId: building.id, label: building.label,
    };
  }

  function buildingDoors(building) {
    const offsets = Array.isArray(building.doorOffsets) && building.doorOffsets.length ? building.doorOffsets : [building.doorOffset || 0];
    return offsets.map((offset, index) => ({ ...buildingDoorAt(building, offset), doorIndex: index }));
  }

  function buildingDoor(building) { return buildingDoors(building)[0]; }

  function maintenanceCanOccupy(x, y) {
    const room = MAINTENANCE_ROOM;
    if (x < room.x + 28 || x > room.x + room.w - 28 || y < room.y + 28 || y > room.y + room.h - 28) return false;
    return !MAINTENANCE_OBSTACLES.some((obstacle) => x >= obstacle.x - 18 && x <= obstacle.x + obstacle.w + 18
      && y >= obstacle.y - 18 && y <= obstacle.y + obstacle.h + 18);
  }

  function canMoveTo(x, y) {
    if (state.interior === "maintenance") return maintenanceCanOccupy(x, y);
    if (state.dimension === "prism") {
      if (x < 24 || y < 30 || x > PRISM_WIDTH - 24 || y > PRISM_HEIGHT - 22) return false;
      return prismWalkableAreas.some((area) => x >= area.x + 18 && x <= area.x + area.w - 18 && y >= area.y + 18 && y <= area.y + area.h - 18);
    }
    return cityMapCanOccupy(x, y);
  }

  function currentEncounterZone() {
    if (state.interior) return false;
    if (state.dimension === "san_pablo") {
      const tile = worldToTile(state.worldX, state.worldY);
      return mapTileType(tile.col, tile.row) === "encounter";
    }
    return prismEncounterZones.some((zone) => pointInPolygon(state.worldX, state.worldY, zone));
  }

  function currentGreenArea() {
    if (state.interior || state.dimension !== "san_pablo") return null;
    return currentEncounterZone() ? { name: "Hierba alta" } : null;
  }

  function nearestPointOfInterest() {
    if (state.interior === "maintenance") {
      const player = { x: state.worldX, y: state.worldY };
      if (distance(player, MAINTENANCE_EXIT) <= MAINTENANCE_EXIT.radius) return { id: "maintenance_exit" };
      if (distance(player, MAINTENANCE_TERMINAL) <= MAINTENANCE_TERMINAL.radius) return { id: "maintenance_terminal" };
      return null;
    }
    if (state.dimension === "prism") {
      const maze = ensureMazeState();
      const start = mazeDefinition.start;
      return Math.hypot(maze.playerX - (start.x + .5), maze.playerY - (start.y + .5)) < .85
        ? { id: "dimension_exit" }
        : null;
    }
    return nearbyMapInteraction();
    /* El mapa procedural anterior se conserva debajo para las mecánicas interiores,
       pero el exterior nuevo usa exclusivamente la cuadrícula editable. */
    /* c8 ignore next */
    const player = { x: state.worldX, y: state.worldY };
    const portal = pointsOfInterest.find((poi) => poi.id === "dimension_portal");
    if (portal && distance(player, portal) <= portal.radius) return portal;
    const nearestDoor = buildings
      .flatMap((building) => buildingDoors(building).map((door) => ({ building, door })))
      .map((entry) => ({ ...entry, distance: distance(player, entry.door) }))
      .filter((entry) => entry.distance <= 54)
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearestDoor) return { id: "building_door", buildingId: nearestDoor.building.id, doorIndex: nearestDoor.door.doorIndex };
    return pointsOfInterest.find((poi) => poi.id !== "dimension_portal" && distance(player, poi) <= poi.radius) || null;
  }

  function updateInteractPrompt() {
    const poi = nearestPointOfInterest();
    elements.interactPrompt.classList.toggle("hidden", !poi);
    if (!poi) return;
    const labels = {
      map_tile: "Interactuar",
      building_door: "Entrar al edificio", maintenance_exit: "Volver al exterior",
      maintenance_terminal: "Usar terminal", dimension_portal: "Examinar portal",
      dimension_exit: "Regresar a San Pablo", health: "Hablar", cafe: "Hablar",
      uned: "Consultar", school: "Leer", field: "Examinar",
    };
    elements.interactPrompt.innerHTML = `<kbd>E</kbd> ${labels[poi.id] || "Interactuar"}`;
  }

  function areaForPosition(x, y) {
    if (state.interior === "maintenance") return "Sala de mantenimiento";
    if (state.dimension === "prism") {
      if (y < 860) return "Dimensión Prisma · Isla Norte";
      if (x < 800) return "Dimensión Prisma · Isla Oeste";
      if (x > 1350) return "Dimensión Prisma · Isla Este";
      return "Dimensión Prisma · Umbral";
    }
    const tile = worldToTile(x, y);
    if (mapTileType(tile.col, tile.row) === "encounter") return "Hierba alta";
    return zoneAtY(y).name;
  }

  function distanceToRoad(x, y, road) {
    const dx = road.x2 - road.x1; const dy = road.y2 - road.y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    const amount = clamp(((x - road.x1) * dx + (y - road.y1) * dy) / lengthSquared, 0, 1);
    return Math.hypot(x - (road.x1 + dx * amount), y - (road.y1 + dy * amount));
  }

  function updateAreaLabel() {
    const area = areaForPosition(state.worldX, state.worldY);
    elements.areaName.textContent = area;
    if (elements.miniMapArea) elements.miniMapArea.textContent = area.toUpperCase();
    updateCaptureStatus();
    if (lastArea && area !== lastArea) showAreaToast(area.toUpperCase());
    lastArea = area;
  }

  function updateCaptureStatus() {
    if (!elements.captureBadge || !elements.captureAreaName || !elements.captureActivity) return;
    const greenArea = currentGreenArea();
    const active = Boolean(greenArea);
    elements.captureBadge.classList.toggle("hidden", !active);
    if (!active) return;
    elements.captureAreaName.textContent = greenArea.name;
    elements.captureActivity.style.width = `${clamp(state.grassDistance / 165 * 100, 8, 100)}%`;
  }

  function interact() {
    if (!state.started || battle || inputLocked) return;
    const poi = nearestPointOfInterest();
    if (!poi) return;

    if (poi.id === "map_tile") {
      if (poi.event?.action === "heal") {
        state.team.forEach((member) => { member.hp = member.maxHp; });
        const messages = ["Enfermera: Tu equipo ha recuperado todos sus PS."];
        if (!state.clinicGiftClaimed) {
          state.clinicGiftClaimed = true; state.balls += 2;
          messages.push("También te entrego 2 Poké Balls para que sigas explorando.");
        }
        renderHud(); saveGame(); showDialog(messages, "+");
      } else if (poi.event?.action === "closed") {
        showDialog([`${poi.event.label}: La puerta está cerrada por ahora.`], "!");
      } else {
        showDialog([`${poi.type === "door" ? "Puerta" : "Evento"} en C${poi.col}, F${poi.row}. Aquí podremos añadir diálogo, cambio de mapa o cualquier acción.`], "!");
      }
      return;
    }

    if (poi.id === "building_door") {
      const building = buildings.find((item) => item.id === poi.buildingId);
      if (building) enterMaintenance(building);
      return;
    }

    if (poi.id === "maintenance_exit") {
      leaveMaintenance();
      return;
    }

    if (poi.id === "maintenance_terminal") {
      useMaintenanceTerminal();
      return;
    }

    if (poi.id === "dimension_portal") {
      if (state.inventory.prismShards < 3) {
        showDialog([
          `El arco reacciona a tus Fragmentos Prisma: ${state.inventory.prismShards} / 3.`,
          "Hay uno cerca de Jerusalén y otros dos entre Persépolis y Siracusa.",
        ], "◇");
      } else {
        showDialog([
          "Los tres fragmentos encajan en el arco. El aire empieza a doblarse…",
          "Para cruzar, Chrome te pedirá permiso para usar el micrófono.",
        ], "◇", enterPrismDimension);
      }
      return;
    }

    if (poi.id === "dimension_exit") {
      showDialog(["El portal de regreso conecta con el campo de fútbol de San Pablo."], "◇", leavePrismDimension);
      return;
    }

    if (poi.id === "health") {
      state.team.forEach((member) => { member.hp = member.maxHp; });
      const messages = ["Enfermera: Tu equipo ha recuperado todos sus PS en el Centro de Salud San Pablo."];
      if (!state.clinicGiftClaimed) {
        state.clinicGiftClaimed = true;
        state.balls += 2;
        messages.push("También te entrego 2 Poké Balls para que sigas recorriendo el barrio.");
      }
      if (state.team.length >= MAX_TEAM && state.questStage >= 3) {
        state.questStage = 4;
        messages.push("¡Objetivo completado! Has formado y cuidado a tu primer equipo Pokémon.");
        playJingle("success");
      }
      renderHud(); saveGame(); showDialog(messages, "+");
    }
    if (poi.id === "cafe") showDialog(["Cafetería Jasmín: Los entrenadores dicen que se ve algún Pikachu cerca del campo de fútbol."], "☕");
    if (poi.id === "uned") showDialog([`UNED Sevilla: Has avistado ${state.seen.length} especies y capturado ${state.caught.length}.`, "Desde aquí se ven los bloques de Memphis, Persépolis y Siracusa."], "U");
    if (poi.id === "school") showDialog(["CEIP Miguel Hernández: Al otro lado de Jerusalén comienza el corazón de San Pablo."], "i");
    if (poi.id === "field") showDialog(["Campo de San Pablo: La zona verde atrae Pokémon de tipo Planta, Bicho y Volador."], "⚽");
  }

  function enterMaintenance(building) {
    state.maintenanceReturn = {
      x: state.worldX, y: state.worldY, direction: state.direction, buildingId: building.id,
    };
    state.interior = "maintenance";
    state.worldX = MAINTENANCE_EXIT.x;
    state.worldY = MAINTENANCE_EXIT.y - 48;
    state.direction = "up";
    camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH);
    camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT);
    lastArea = "";
    elements.buildingEditorButton.disabled = true;
    closeBuildingEditorPanel();
    playTone(330, .08, "square", .025);
    updateAreaLabel(); updateInteractPrompt(); saveGame();
    showAreaToast("SALA DE MANTENIMIENTO");
  }

  function leaveMaintenance() {
    const destination = state.maintenanceReturn || { ...NORMAL_START };
    state.interior = null;
    state.maintenanceReturn = null;
    state.worldX = destination.x;
    state.worldY = destination.y;
    state.direction = destination.direction || "down";
    camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH);
    camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT);
    lastArea = "";
    elements.buildingEditorButton.disabled = false;
    playTone(440, .08, "square", .025);
    updateAreaLabel(); updateInteractPrompt(); saveGame();
    showAreaToast("HAS VUELTO AL EXTERIOR");
  }

  function useMaintenanceTerminal() {
    const source = buildings.find((building) => building.id === state.maintenanceReturn?.buildingId);
    if (source?.id === "centro-salud") {
      state.team.forEach((member) => { member.hp = member.maxHp; });
      const messages = ["El terminal de mantenimiento del Centro de Salud ha restaurado todos los PS de tu equipo."];
      if (!state.clinicGiftClaimed) {
        state.clinicGiftClaimed = true;
        state.balls += 2;
        messages.push("El compartimento de suministros contiene 2 Poké Balls para tu aventura.");
      }
      if (state.team.length >= MAX_TEAM && state.questStage >= 3) {
        state.questStage = 4;
        messages.push("¡Objetivo completado! Has formado y cuidado a tu primer equipo Pokémon.");
      }
      renderHud(); saveGame(); playJingle("success");
      showDialog(messages, "+");
      return;
    }
    showDialog([
      `Mantenimiento de ${source?.label || "el edificio"}.`,
      "Cuadros eléctricos, herramientas y conductos ocupan la sala. No hay acceso al resto del edificio.",
    ], "⚙");
  }

  function primaryAction() {
    if (state.dimension === "prism" && !nearestPointOfInterest()) useFlashlight();
    else interact();
  }

  async function enterPrismDimension() {
    const microphoneReady = await requestMicrophoneAccess();
    if (!microphoneReady) return;
    state.returnPosition = { x: state.worldX, y: state.worldY };
    state.dimension = "prism";
    state.dimensionVisited = true;
    if (!state.secretPokemonSaved) state.secretPokemonId = chooseSecretPokemonId();
    ensureMazeState(true);
    state.worldX = 1050; state.worldY = 1830; state.direction = "up";
    lastArea = "";
    elements.buildingEditorButton.disabled = true;
    elements.worldScreen.classList.add("maze-mode");
    elements.mazeHud.classList.remove("hidden");
    playJingle("capture");
    renderHud(); saveGame();
    showDialog([
      "La Sombra oye el ruido de tu habitación y se mueve más rápido cuando te escucha.",
      "Apunta hacia ella y pulsa F para ahuyentarla. La linterna solo puede repelerla tres veces.",
      "Resuelve el laberinto y derrota al Pokémon invertido para liberarlo.",
    ], "MIC", () => showAreaToast("DIMENSIÓN INVERTIDA"));
  }

  function leavePrismDimension() {
    stopMicrophone();
    const destination = state.returnPosition || { x: PORTAL_POSITION.x, y: PORTAL_POSITION.y + field.h / 2 + 70 };
    state.dimension = "san_pablo";
    state.worldX = destination.x;
    state.worldY = destination.y;
    state.direction = "down";
    state.returnPosition = null;
    camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH);
    camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT);
    lastArea = "";
    elements.buildingEditorButton.disabled = false;
    elements.worldScreen.classList.remove("maze-mode");
    elements.mazeHud.classList.add("hidden");
    playJingle("success");
    renderHud(); saveGame(); showAreaToast("SAN PABLO · SEVILLA");
  }

  function clearDirectionalInput() {
    input.up = false; input.down = false; input.left = false; input.right = false;
    input.strafeLeft = false; input.strafeRight = false; input.run = false;
  }

  function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function mazeCanOccupy(x, y, radius = .18) {
    const grid = mazeDefinition.grid;
    return [[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]]
      .every(([dx, dy]) => grid[Math.floor(y + dy)]?.[Math.floor(x + dx)] === 0);
  }

  function findMazePath(fromX, fromY, toX, toY) {
    const grid = mazeDefinition.grid;
    const start = { x: Math.floor(fromX), y: Math.floor(fromY) };
    const goal = { x: Math.floor(toX), y: Math.floor(toY) };
    const startKey = `${start.x},${start.y}`; const goalKey = `${goal.x},${goal.y}`;
    const queue = [start]; const previous = new Map([[startKey, null]]);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]; const currentKey = `${current.x},${current.y}`;
      if (currentKey === goalKey) break;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dy]) => {
        const x = current.x + dx; const y = current.y + dy; const key = `${x},${y}`;
        if (grid[y]?.[x] === 0 && !previous.has(key)) { previous.set(key, currentKey); queue.push({ x, y }); }
      });
    }
    if (!previous.has(goalKey)) return [];
    const path = [];
    let key = goalKey;
    while (key) {
      const [x, y] = key.split(",").map(Number); path.push({ x, y }); key = previous.get(key);
    }
    return path.reverse();
  }

  function startSprintScare(direction = Math.random() < .5 ? -1 : 1) {
    if (sprintScare || jumpScareActive) return;
    sprintScare = {
      elapsed: 0, duration: 1.28, disturbanceTime: 0,
      warningPlayed: false, direction,
    };
    quietStillTime = 0;
    sprintScareCooldown = 16 + Math.random() * 7;
    playHorrorClip(horrorAudio.breathing, .82, direction * .98, direction * -.72, 1.38);
    playHorrorClip(horrorAudio.snarl, .58, direction, direction * -.45, .9);
    showAreaToast("NO HAGAS RUIDO");
  }

  function updateSprintScare(deltaSeconds, effectiveNoise, playerStill) {
    if (!sprintScare) return false;
    const maze = ensureMazeState();
    sprintScare.elapsed += deltaSeconds;
    const disturbed = !playerStill || effectiveNoise > .13;
    if (disturbed) sprintScare.disturbanceTime += deltaSeconds;
    else sprintScare.disturbanceTime = Math.max(0, sprintScare.disturbanceTime - deltaSeconds * 2.2);

    if (sprintScare.disturbanceTime > .12 && !sprintScare.warningPlayed) {
      sprintScare.warningPlayed = true;
      playHorrorClip(horrorAudio.snarl, .75, -.55, .05, 1.1);
      elements.shadowStatus.textContent = "TE HA OÍDO";
      elements.shadowStatus.style.color = "#ff6868";
    }
    if (sprintScare.disturbanceTime > .3 && sprintScare.elapsed > .22) {
      sprintScare = null;
      triggerJumpScare();
      return true;
    }
    if (sprintScare.elapsed >= sprintScare.duration) {
      sprintScare = null;
      maze.monsterRepel = Math.max(maze.monsterRepel, 2.2);
      shadowPath = [];
      shadowPathTimer = 0;
      showAreaToast("HA PASADO DE LARGO");
    }
    return true;
  }

  function maybeStartSilentPass() {
    if (quietStillTime < 1.35 || sprintScare || sprintScareCooldown > 0) return false;
    const maze = ensureMazeState();
    const dx = maze.monsterX - maze.playerX; const dy = maze.monsterY - maze.playerY;
    const monsterDistance = Math.hypot(dx, dy);
    if (monsterDistance > .7 && monsterDistance < 6.8) {
      const relativeAngle = normalizeAngle(Math.atan2(dy, dx) - maze.angle);
      const direction = Math.abs(Math.sin(relativeAngle)) < .18
        ? (Math.random() < .5 ? -1 : 1)
        : Math.sign(Math.sin(relativeAngle));
      startSprintScare(direction);
      return true;
    }
    return false;
  }

  function updateMazeMonster(deltaSeconds, effectiveNoise, playerStill) {
    const maze = ensureMazeState();
    maze.monsterRepel = Math.max(0, maze.monsterRepel - deltaSeconds);
    maze.alertTimer = effectiveNoise > .24
      ? Math.max(maze.alertTimer, 4.2 + effectiveNoise * 4.4)
      : Math.max(0, maze.alertTimer - deltaSeconds);
    sprintScareCooldown = Math.max(0, sprintScareCooldown - deltaSeconds);
    shadowPathTimer -= deltaSeconds;
    const repelled = maze.monsterRepel > 0;
    const chasing = !repelled && maze.alertTimer > 0;
    updateChaseMusic(deltaSeconds, chasing);
    if (updateSprintScare(deltaSeconds, effectiveNoise, playerStill)) return;
    if (maybeStartSilentPass()) return;
    if (shadowPathTimer <= 0 || shadowPath.length < 2) {
      let targetX = maze.playerX; let targetY = maze.playerY;
      if (repelled) {
        const start = mazeDefinition.start; const goal = mazeDefinition.goal;
        const startDistance = Math.hypot(maze.playerX - start.x, maze.playerY - start.y);
        const goalDistance = Math.hypot(maze.playerX - goal.x, maze.playerY - goal.y);
        const target = startDistance > goalDistance ? start : goal;
        targetX = target.x + .5; targetY = target.y + .5;
      }
      shadowPath = findMazePath(maze.monsterX, maze.monsterY, targetX, targetY);
      shadowPathTimer = repelled ? .18 : chasing ? .14 : (.72 - effectiveNoise * .54);
    }

    if (shadowPath.length > 1) {
      const target = shadowPath[1];
      const targetX = target.x + .5; const targetY = target.y + .5;
      const dx = targetX - maze.monsterX; const dy = targetY - maze.monsterY; const length = Math.hypot(dx, dy) || 1;
      const speed = repelled ? 3.25 : chasing
        ? (1.24 + effectiveNoise * 2.15 + (maze.steps > 12 ? .2 : 0))
        : (.7 + effectiveNoise * 1.25 + (maze.steps > 12 ? .12 : 0));
      const amount = Math.min(length, speed * deltaSeconds);
      maze.monsterX += dx / length * amount; maze.monsterY += dy / length * amount;
      if (length < .12) shadowPath.shift();
    }

    if (!repelled && Math.hypot(maze.monsterX - maze.playerX, maze.monsterY - maze.playerY) < .48) triggerJumpScare();
  }

  function updateMazeMovement(deltaSeconds, drawerOpen) {
    const maze = ensureMazeState();
    const micLive = microphoneStream?.getAudioTracks().some((track) => track.readyState === "live");
    if (!micLive && !inputLocked && elements.dialogBox.classList.contains("hidden")) {
      showDialog(["El micrófono se ha desconectado. El portal pierde estabilidad."], "MIC", leavePrismDimension);
      return;
    }
    const micNoise = updateMicrophoneLevel();
    const shadowDistance = Math.hypot(maze.monsterX - maze.playerX, maze.monsterY - maze.playerY);
    updateProximityBreathing(deltaSeconds, shadowDistance, !battle && !jumpScareActive);
    if (battle || inputLocked || drawerOpen || jumpScareActive || !elements.dialogBox.classList.contains("hidden")) {
      playerRunning = false;
      quietStillTime = 0;
      mazeMotion.forward = 0; mazeMotion.strafe = 0; mazeMotion.turn = 0;
      updateChaseMusic(deltaSeconds, false);
      updateMazeHud(micNoise);
      return;
    }

    const turnInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const forwardInput = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const strafeInput = (input.strafeRight ? 1 : 0) - (input.strafeLeft ? 1 : 0);
    const translating = forwardInput !== 0 || strafeInput !== 0;
    playerRunning = Boolean(input.run && translating);
    const speed = playerRunning ? 2.9 : 1.72;
    let targetForward = forwardInput * speed * (forwardInput < 0 ? .78 : 1);
    let targetStrafe = strafeInput * speed * .78;
    const targetLength = Math.hypot(targetForward, targetStrafe);
    if (targetLength > speed) {
      targetForward = targetForward / targetLength * speed;
      targetStrafe = targetStrafe / targetLength * speed;
    }
    const moveResponse = 1 - Math.pow(translating ? .0007 : .00002, deltaSeconds);
    const turnResponse = 1 - Math.pow(turnInput ? .00045 : .00001, deltaSeconds);
    mazeMotion.forward += (targetForward - mazeMotion.forward) * moveResponse;
    mazeMotion.strafe += (targetStrafe - mazeMotion.strafe) * moveResponse;
    mazeMotion.turn += (turnInput * 2.28 - mazeMotion.turn) * turnResponse;
    maze.angle = normalizeAngle(maze.angle + mazeMotion.turn * deltaSeconds);

    const velocityX = Math.cos(maze.angle) * mazeMotion.forward
      + Math.cos(maze.angle + Math.PI / 2) * mazeMotion.strafe;
    const velocityY = Math.sin(maze.angle) * mazeMotion.forward
      + Math.sin(maze.angle + Math.PI / 2) * mazeMotion.strafe;
    const movementSpeed = Math.hypot(velocityX, velocityY);
    if (movementSpeed > .025) {
      const nextX = maze.playerX + velocityX * deltaSeconds;
      const nextY = maze.playerY + velocityY * deltaSeconds;
      if (mazeCanOccupy(nextX, maze.playerY)) maze.playerX = nextX;
      if (mazeCanOccupy(maze.playerX, nextY)) maze.playerY = nextY;
      maze.steps += movementSpeed * deltaSeconds;
      animationTime += deltaSeconds * 1000;
      animationFrame = Math.floor(animationTime / (playerRunning ? 82 : 145)) % 4;
    } else { animationFrame = 0; animationTime = 0; }

    const playerStill = !translating && turnInput === 0
      && movementSpeed < .045 && Math.abs(mazeMotion.turn) < .04;
    const perfectlyQuiet = micNoise < .055;
    quietStillTime = playerStill && perfectlyQuiet ? quietStillTime + deltaSeconds : 0;
    const movementNoise = movementSpeed > .045 ? (playerRunning ? .38 : .08 + movementSpeed / speed * .06) : 0;
    const turnNoise = Math.abs(mazeMotion.turn) > .04 ? .035 : 0;
    const effectiveNoise = Math.max(micNoise, movementNoise, turnNoise);
    updateMazeMonster(deltaSeconds, effectiveNoise, playerStill && perfectlyQuiet);
    if (jumpScareActive) return;
    flashlightBurst = Math.max(0, flashlightBurst - deltaSeconds);
    updateMazeHud(effectiveNoise);
    updateInteractPrompt();

    const goal = mazeDefinition.goal;
    if (!state.secretPokemonSaved && Math.hypot(maze.playerX - (goal.x + .5), maze.playerY - (goal.y + .5)) < .58) startSecretBattle();
    if (performance.now() - lastSaveAt > 3500) { saveGame(); lastSaveAt = performance.now(); }
  }

  function rayClear(x1, y1, x2, y2) {
    const distanceToTarget = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(distanceToTarget / .08);
    for (let index = 1; index < steps; index += 1) {
      const x = x1 + (x2 - x1) * index / steps; const y = y1 + (y2 - y1) * index / steps;
      if (mazeDefinition.grid[Math.floor(y)]?.[Math.floor(x)] !== 0) return false;
    }
    return true;
  }

  function useFlashlight() {
    if (state.dimension !== "prism" || battle || inputLocked || jumpScareActive) return;
    const maze = ensureMazeState();
    if (maze.lightCharges <= 0) { playTone(80, .12, "square", .02); return; }
    const dx = maze.monsterX - maze.playerX; const dy = maze.monsterY - maze.playerY;
    const monsterDistance = Math.hypot(dx, dy);
    const angleDifference = Math.abs(normalizeAngle(Math.atan2(dy, dx) - maze.angle));
    flashlightBurst = .34;
    if (monsterDistance <= 8.5 && angleDifference < .28 && rayClear(maze.playerX, maze.playerY, maze.monsterX, maze.monsterY)) {
      maze.lightCharges -= 1;
      maze.monsterRepel = 4.5;
      shadowPath = []; shadowPathTimer = 0;
      playTone(980, .18, "sawtooth", .055); playTone(620, .25, "square", .035, .04);
      showAreaToast(`LA SOMBRA RETROCEDE · ${maze.lightCharges} USOS`);
    } else playTone(210, .06, "square", .018);
    updateMazeHud(microphoneLevel);
  }

  function updateMazeHud(noise = microphoneLevel) {
    const maze = ensureMazeState();
    [...elements.lightCharges.children].forEach((charge, index) => charge.classList.toggle("empty", index >= maze.lightCharges));
    const shadowDistance = Math.hypot(maze.monsterX - maze.playerX, maze.monsterY - maze.playerY);
    let status = "LEJOS";
    if (sprintScare) status = sprintScare.warningPlayed ? "TE HA OÍDO" : "NO HAGAS RUIDO";
    else if (maze.monsterRepel > 0) status = "HUYENDO";
    else if (shadowDistance < 2.5) status = "MUY CERCA";
    else if (maze.alertTimer > 0) status = "TE PERSIGUE";
    else if (noise > .42) status = "TE OYE";
    else if (shadowDistance < 6) status = "ACECHANDO";
    elements.shadowStatus.textContent = status;
    elements.shadowStatus.style.color = ["MUY CERCA", "TE HA OÍDO"].includes(status)
      ? "#f06d6d"
      : ["TE OYE", "TE PERSIGUE", "NO HAGAS RUIDO"].includes(status) ? "#f0bd64" : "#7fe0e8";
    elements.noiseMeter.style.width = `${Math.round(noise * 100)}%`;
    elements.noiseMeter.style.background = noise > .55 ? "#ef6666" : noise > .3 ? "#e5b75e" : "#68d19b";
  }

  function playJumpScareSound() {
    const context = ensureAudio();
    if (!context) return;
    playHorrorClip(horrorAudio.jumpBass, .52, -.18, .12, 1.7);
    playHorrorClip(horrorAudio.jumpShriek, .38, .18, -.08, 1.55);
    const start = context.currentTime;
    const duration = 1.25;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, start);
    compressor.knee.setValueAtTime(8, start);
    compressor.ratio.setValueAtTime(8, start);
    compressor.attack.setValueAtTime(.002, start);
    compressor.release.setValueAtTime(.18, start);
    compressor.connect(context.destination);

    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      const fade = 1 - index / samples.length;
      samples[index] = (Math.random() * 2 - 1) * (.35 + fade * .65);
    }
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = buffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(920, start);
    noiseFilter.frequency.exponentialRampToValueAtTime(180, start + duration);
    noiseFilter.Q.setValueAtTime(.75, start);
    noiseGain.gain.setValueAtTime(.07, start);
    noiseGain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(compressor);

    const shriek = context.createOscillator();
    const shriekGain = context.createGain();
    shriek.type = "sawtooth";
    shriek.frequency.setValueAtTime(760, start);
    shriek.frequency.exponentialRampToValueAtTime(95, start + .8);
    shriekGain.gain.setValueAtTime(.03, start);
    shriekGain.gain.exponentialRampToValueAtTime(.0001, start + 1);
    shriek.connect(shriekGain); shriekGain.connect(compressor);
    noise.start(start); noise.stop(start + duration);
    shriek.start(start); shriek.stop(start + 1);
  }

  function triggerJumpScare() {
    if (jumpScareActive || state.dimension !== "prism" || battle) return;
    jumpScareActive = true;
    sprintScare = null;
    inputLocked = true;
    clearDirectionalInput();
    stopChaseMusic();
    stopProximityBreathing();
    elements.jumpScare.classList.add("hidden");
    void elements.jumpScare.offsetWidth;
    elements.jumpScare.classList.remove("hidden");
    playJumpScareSound();
    if (navigator.vibrate) navigator.vibrate([180, 55, 260]);

    window.setTimeout(() => {
      const maze = ensureMazeState();
      const { start, monster, grid } = mazeDefinition;
      maze.playerX = start.x + .5;
      maze.playerY = start.y + .5;
      maze.angle = firstOpenDirection(grid, start);
      maze.monsterX = monster.x + .5;
      maze.monsterY = monster.y + .5;
      maze.monsterRepel = 0;
      maze.alertTimer = 0;
      maze.lightCharges = 3;
      maze.steps = 0;
      maze.captures = (maze.captures || 0) + 1;
      shadowPath = [];
      shadowPathTimer = 0;
      sprintScareCooldown = 8;
      flashlightBurst = 0;
      stopHorrorAudio();
      elements.jumpScare.classList.add("hidden");
      jumpScareActive = false;
      inputLocked = false;
      updateMazeHud(0);
      updateInteractPrompt();
      saveGame();
      showAreaToast("LA SOMBRA TE DEVUELVE AL INICIO");
    }, 1620);
  }

  function updateMovement(deltaSeconds) {
    const drawerOpen = elements.teamDrawer.classList.contains("open")
      || elements.buildingEditor.classList.contains("open")
      || elements.inventoryDrawer.classList.contains("open");
    if (state.dimension === "prism") {
      updateMazeMovement(deltaSeconds, drawerOpen);
      return;
    }
    if (!state.started || battle || inputLocked || drawerOpen || !elements.dialogBox.classList.contains("hidden")) {
      playerRunning = false;
      elements.runBadge.classList.add("hidden");
      return;
    }

    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;
    if (!moving) {
      animationFrame = 0;
      animationTime = 0;
      playerRunning = false;
      elements.runBadge.classList.add("hidden");
      return;
    }

    const length = Math.hypot(dx, dy);
    dx /= length; dy /= length;
    const running = input.run;
    playerRunning = running;
    const speed = running ? 205 : 108;
    const amount = speed * deltaSeconds;
    if (Math.abs(dx) > Math.abs(dy)) state.direction = dx < 0 ? "left" : "right";
    else state.direction = dy < 0 ? "up" : "down";

    const nextX = state.worldX + dx * amount;
    const nextY = state.worldY + dy * amount;
    let moved = 0;
    if (canMoveTo(nextX, state.worldY)) { state.worldX = nextX; moved += Math.abs(dx * amount); }
    if (canMoveTo(state.worldX, nextY)) { state.worldY = nextY; moved += Math.abs(dy * amount); }

    if (moved > 0) {
      state.distance += moved;
      animationTime += deltaSeconds * 1000;
      animationFrame = Math.floor(animationTime / (running ? 82 : 145)) % 4;
      elements.runBadge.classList.toggle("hidden", !running);
      if (checkObjectPickup()) {
        updateAreaLabel(); updateInteractPrompt(); renderHud(); saveGame();
        return;
      }
      const previousQuestStage = state.questStage;
      if (state.questStage === 0 && state.distance > 330) state.questStage = 1;
      if (currentEncounterZone()) {
        state.grassDistance += moved * (running ? 1.25 : 1);
        if (state.grassDistance - lastEncounterCheck > 85) {
          lastEncounterCheck = state.grassDistance;
        } else {
          updateAreaLabel(); updateInteractPrompt();
          if (previousQuestStage !== state.questStage) renderHud();
          return;
        }
        if (state.grassDistance > 165 && Math.random() < Math.min(.12 + state.grassDistance / 3600, .34)) {
          state.grassDistance = 0;
          lastEncounterCheck = 0;
          beginEncounter();
        }
      } else { state.grassDistance = 0; lastEncounterCheck = 0; }

      if (performance.now() - lastSaveAt > 4500) {
        saveGame(); lastSaveAt = performance.now();
      }
      updateAreaLabel(); updateInteractPrompt();
      if (previousQuestStage !== state.questStage) renderHud();
    }
  }

  function drawRoad(context, road) {
    if (road.kind === "pedestrian") {
      drawPedestrianStreet(context, road);
      return;
    }
    const angle = Math.atan2(road.y2 - road.y1, road.x2 - road.x1);
    context.save();
    context.lineCap = "butt";
    context.strokeStyle = "#ded8bd";
    context.lineWidth = road.width + 28;
    context.beginPath(); context.moveTo(road.x1, road.y1); context.lineTo(road.x2, road.y2); context.stroke();
    context.strokeStyle = "#667176";
    context.lineWidth = road.width;
    context.stroke();
    if (road.dashed) {
      context.strokeStyle = "rgba(255,244,193,.78)";
      context.lineWidth = 3;
      context.setLineDash([28, 25]);
      context.beginPath(); context.moveTo(road.x1, road.y1); context.lineTo(road.x2, road.y2); context.stroke();
      context.setLineDash([]);
    }
    context.restore();
  }

  function drawPedestrianStreet(context, street) {
    const angle = Math.atan2(street.y2 - street.y1, street.x2 - street.x1);
    const length = Math.hypot(street.x2 - street.x1, street.y2 - street.y1);
    context.save();
    context.lineCap = "butt";
    context.strokeStyle = "#ab9868";
    context.lineWidth = street.width + 24;
    context.beginPath(); context.moveTo(street.x1, street.y1); context.lineTo(street.x2, street.y2); context.stroke();
    context.strokeStyle = "#d8c792";
    context.lineWidth = street.width;
    context.stroke();

    context.translate(street.x1, street.y1); context.rotate(angle);
    context.strokeStyle = "rgba(117,94,52,.2)";
    context.lineWidth = 2;
    for (let x = 18; x < length; x += 32) {
      context.beginPath(); context.moveTo(x, -street.width / 2); context.lineTo(x, street.width / 2); context.stroke();
    }
    context.strokeStyle = "rgba(255,249,218,.45)";
    context.beginPath(); context.moveTo(0, -street.width * .28); context.lineTo(length, -street.width * .28); context.stroke();
    context.beginPath(); context.moveTo(0, street.width * .28); context.lineTo(length, street.width * .28); context.stroke();

    context.restore();
  }

  function drawGround(context) {
    const bounds = visibleBounds(80);
    const firstTileX = Math.floor(bounds.left / 32) * 32;
    const firstTileY = Math.floor(bounds.top / 32) * 32;
    context.fillStyle = "#78b566";
    context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

    for (let y = firstTileY; y < bounds.bottom; y += 32) {
      for (let x = firstTileX; x < bounds.right; x += 32) {
        context.fillStyle = ((x / 32 + y / 32) % 2 === 0) ? "#82ba6b" : "#79b164";
        context.fillRect(x, y, 32, 32);
        if ((x / 32 + y / 32) % 7 === 0) {
          context.fillStyle = "rgba(67,126,65,.27)";
          context.fillRect(x + 8, y + 19, 3, 8);
          context.fillRect(x + 12, y + 16, 3, 11);
        }
      }
    }

    drawForestBorder(context, bounds);
    drawCityBase(context, bounds);
    drawBuildingPlots(context, bounds);
    encounterZones.filter((zone) => polygonInView(zone, bounds)).forEach((zone, index) => drawGrassPatch(context, zone, index));
    roads.filter((road) => roadInView(road, bounds)).forEach((road) => drawRoad(context, road));
    drawParkFixtures(context, bounds);
    if (field.y + field.h / 2 >= bounds.top && field.y - field.h / 2 <= bounds.bottom) drawField(context);
    drawParkingAreas(context, bounds);
  }

  function drawCityBase(context, bounds) {
    context.fillStyle = "#d5c9a4";
    context.fillRect(Math.max(0, bounds.left), 232, Math.min(WORLD_WIDTH, bounds.right) - Math.max(0, bounds.left), 1270);
    context.fillStyle = "#a8c978";
    context.fillRect(105, 680, 2290, 400);
    context.fillStyle = "#c9bc91";
    context.fillRect(105, 705, 2290, 42);
    context.fillRect(105, 1038, 2290, 42);
    context.fillStyle = "rgba(255,250,218,.48)";
    for (let y = 258; y < 1495; y += 24) {
      context.fillRect(100, y, 2300, 2);
    }
    context.fillStyle = "#6fa85f";
    context.fillRect(110, 760, 2280, 255);
    context.fillStyle = "#86b96a";
    context.fillRect(132, 780, 2236, 215);
  }

  function drawParkFixtures(context, bounds) {
    const playgrounds = [
      { x: 260, y: 870, w: 250, h: 170, accent: "#da9a32" },
      { x: 2240, y: 870, w: 250, h: 170, accent: "#d9574f" },
    ];
    playgrounds.forEach((playground) => {
      if (playground.x + playground.w / 2 < bounds.left || playground.x - playground.w / 2 > bounds.right) return;
      context.save(); context.translate(playground.x, playground.y);
      context.fillStyle = "#d8c79a"; context.fillRect(-playground.w / 2, -playground.h / 2, playground.w, playground.h);
      context.strokeStyle = "#7c8069"; context.lineWidth = 5; context.strokeRect(-playground.w / 2, -playground.h / 2, playground.w, playground.h);
      context.fillStyle = playground.accent; context.fillRect(-82, -35, 26, 72); context.fillRect(-92, 28, 48, 10);
      context.fillStyle = "#4a80a6"; context.fillRect(28, -30, 78, 12); context.fillRect(93, -30, 12, 56);
      context.strokeStyle = "#3d6380"; context.lineWidth = 8; context.beginPath(); context.moveTo(30, -24); context.lineTo(95, 24); context.stroke();
      context.fillStyle = "#bd6f4a"; context.fillRect(-120, 56, 70, 14);
      context.restore();
    });

    const benches = [
      [690, 810], [690, 1010], [1820, 810], [1820, 1010], [1060, 810], [1440, 1010],
    ];
    benches.forEach(([x, y]) => drawBench(context, x, y));
    for (let x = 120; x <= 2380; x += 150) drawLamp(context, x, 690);
    for (let x = 120; x <= 2380; x += 150) drawLamp(context, x, 1100);
    for (let x = 155; x <= 2350; x += 210) drawTree(context, { x, y: 745, size: 30 });
    for (let x = 155; x <= 2350; x += 210) drawTree(context, { x, y: 1050, size: 30 });
  }

  function drawBench(context, x, y) {
    context.save(); context.translate(x, y);
    context.fillStyle = "rgba(35,54,42,.2)"; context.fillRect(-26, 7, 52, 7);
    context.fillStyle = "#925c38"; context.fillRect(-25, -7, 50, 11); context.fillRect(-21, 5, 6, 13); context.fillRect(15, 5, 6, 13);
    context.restore();
  }

  function drawLamp(context, x, y) {
    context.save(); context.translate(x, y);
    context.fillStyle = "#56605c"; context.fillRect(-3, -28, 6, 28); context.fillStyle = "#424c4c"; context.fillRect(-7, -32, 14, 5);
    context.fillStyle = "#f3de83"; context.beginPath(); context.arc(0, -35, 7, 0, Math.PI * 2); context.fill();
    context.fillStyle = "rgba(248,222,125,.2)"; context.beginPath(); context.arc(0, -35, 17, 0, Math.PI * 2); context.fill();
    context.restore();
  }

  function drawForestBorder(context, bounds) {
    const depth = 105;
    context.fillStyle = "#285d38";
    if (bounds.top <= depth) context.fillRect(0, 0, WORLD_WIDTH, depth);
    if (bounds.bottom >= WORLD_HEIGHT - depth) context.fillRect(0, WORLD_HEIGHT - depth, WORLD_WIDTH, depth);
    if (bounds.left <= depth) context.fillRect(0, 0, depth, WORLD_HEIGHT);
    if (bounds.right >= WORLD_WIDTH - depth) context.fillRect(WORLD_WIDTH - depth, 0, depth, WORLD_HEIGHT);
  }

  function drawBuildingPlots(context, bounds) {
    buildings.filter((building) => entityInView(building, bounds, 65)).forEach((building) => {
      context.save();
      context.translate(building.x, building.y);
      context.rotate(building.a || 0);
      context.fillStyle = "#d5c99d";
      context.fillRect(-building.w / 2 - 28, -building.h / 2 - 28, building.w + 56, building.h + 70);
      context.fillStyle = "#78aa5b";
      context.fillRect(-building.w / 2 - 18, -building.h / 2 - 18, building.w + 36, building.h + 50);
      context.strokeStyle = "rgba(247,239,202,.62)";
      context.lineWidth = 4;
      context.strokeRect(-building.w / 2 - 23, -building.h / 2 - 23, building.w + 46, building.h + 60);
      context.restore();
    });
  }

  function visibleBounds(margin = 0) {
    return {
      left: clamp(camera.x - margin, 0, currentWorldWidth()),
      top: clamp(camera.y - margin, 0, currentWorldHeight()),
      right: clamp(camera.x + VIEW_WIDTH + margin, 0, currentWorldWidth()),
      bottom: clamp(camera.y + VIEW_HEIGHT + margin, 0, currentWorldHeight()),
    };
  }

  function polygonInView(polygon, bounds) {
    const xs = polygon.map((point) => point[0]);
    const ys = polygon.map((point) => point[1]);
    return Math.max(...xs) >= bounds.left && Math.min(...xs) <= bounds.right && Math.max(...ys) >= bounds.top && Math.min(...ys) <= bounds.bottom;
  }

  function roadInView(road, bounds) {
    return Math.max(road.x1, road.x2) + road.width >= bounds.left
      && Math.min(road.x1, road.x2) - road.width <= bounds.right
      && Math.max(road.y1, road.y2) + road.width >= bounds.top
      && Math.min(road.y1, road.y2) - road.width <= bounds.bottom;
  }

  function entityInView(entity, bounds, margin = 100) {
    return entity.x + (entity.w || 0) / 2 + margin >= bounds.left
      && entity.x - (entity.w || 0) / 2 - margin <= bounds.right
      && entity.y + (entity.h || 0) / 2 + margin >= bounds.top
      && entity.y - (entity.h || 0) / 2 - margin <= bounds.bottom;
  }

  function drawZonePattern(context, zone) {
    const residential = ["memphis", "persepolis", "siracusa", "ada_sur"].includes(zone.id);
    if (!residential) {
      context.fillStyle = zone.id === "jerusalen" ? "rgba(220,207,161,.42)" : "rgba(211,199,153,.34)";
      context.fillRect(365, zone.yStart + 18, 1425, Math.max(0, zone.yEnd - zone.yStart - 36));
      return;
    }

    const top = zone.yStart + 28;
    const height = zone.yEnd - zone.yStart - 56;
    context.fillStyle = "#cabb88";
    context.fillRect(365, top, 1415, height);
    context.fillStyle = "#90b968";
    context.fillRect(395, top + 22, 1355, height - 44);

    context.fillStyle = "#dfd3a6";
    if (zone.pattern === 0) {
      context.fillRect(1035, top + 22, 54, height - 44);
      context.fillRect(395, top + height / 2 - 24, 1355, 48);
    } else if (zone.pattern === 1) {
      for (let x = 500; x < 1700; x += 280) context.fillRect(x, top + 22, 42, height - 44);
    } else if (zone.pattern === 2) {
      context.fillRect(395, top + height / 2 - 22, 1355, 44);
      for (let x = 565; x < 1670; x += 360) {
        context.beginPath(); context.arc(x, top + height / 2, 52, 0, Math.PI * 2); context.fill();
      }
    } else {
      for (let x = 430; x < 1710; x += 170) context.fillRect(x, top + height / 2 - 16, 115, 32);
    }

    drawZoneMarker(context, zone);
  }

  function drawZoneMarker(context, zone) {
    context.save();
    context.fillStyle = "rgba(31,77,56,.84)";
    context.fillRect(385, zone.yStart + 34, 165, 27);
    context.fillStyle = "#fffbea";
    context.font = "900 12px Trebuchet MS";
    context.textAlign = "left";
    context.fillText(zone.name.toUpperCase(), 397, zone.yStart + 52);
    context.restore();
  }

  function drawGrassPatch(context, polygon, index) {
    context.save();
    context.beginPath(); context.moveTo(polygon[0][0], polygon[0][1]);
    polygon.slice(1).forEach((point) => context.lineTo(point[0], point[1]));
    context.closePath(); context.clip();
    const xs = polygon.map((point) => point[0]); const ys = polygon.map((point) => point[1]);
    const left = Math.min(...xs); const right = Math.max(...xs); const top = Math.min(...ys); const bottom = Math.max(...ys);
    context.fillStyle = index % 2 ? "#78aa59" : "#72a354";
    context.fillRect(left, top, right - left, bottom - top);
    context.fillStyle = index % 3 === 0 ? "#397846" : "#45824a";
    const spacing = 22 + (index % 3) * 4;
    for (let y = top + 8; y < bottom; y += spacing) {
      for (let x = left + 7 + ((y / spacing) % 2) * 9; x < right; x += spacing) {
        context.fillRect(x, y + 5, 3, 10); context.fillRect(x - 3, y + 8, 3, 7); context.fillRect(x + 3, y + 6, 3, 9);
      }
    }
    context.restore();
  }

  function drawAdaDistanceMarkers(context, bounds) {
    for (let meters = 0; meters <= 350; meters += 50) {
      const y = 350 + meters * PIXELS_PER_METER;
      if (y < bounds.top - 20 || y > bounds.bottom + 20) continue;
      context.fillStyle = "#f7f2d9";
      context.fillRect(319, y - 10, 44, 20);
      context.strokeStyle = "#355346";
      context.lineWidth = 2;
      context.strokeRect(319, y - 10, 44, 20);
      context.fillStyle = "#29493b";
      context.font = "900 9px Trebuchet MS";
      context.textAlign = "center";
      context.fillText(`${meters} m`, 341, y + 3);
    }
  }

  function drawField(context) {
    context.save();
    context.translate(field.x, field.y); context.rotate(field.a);
    context.fillStyle = "#d7d0b0"; context.fillRect(-field.w / 2 - 14, -field.h / 2 - 14, field.w + 28, field.h + 28);
    context.fillStyle = "#4e9b59"; context.fillRect(-field.w / 2, -field.h / 2, field.w, field.h);
    context.strokeStyle = "rgba(241,247,218,.75)"; context.lineWidth = 4; context.strokeRect(-field.w / 2 + 12, -field.h / 2 + 12, field.w - 24, field.h - 24);
    context.beginPath(); context.arc(0, 0, 39, 0, Math.PI * 2); context.stroke();
    context.beginPath(); context.moveTo(0, -field.h / 2 + 12); context.lineTo(0, field.h / 2 - 12); context.stroke();
    context.restore();
    drawMapLabel(context, field.x, field.y + field.h / 2 + 22, "CAMPO DE SAN PABLO");
  }

  function drawMaintenanceRoom(context) {
    const room = MAINTENANCE_ROOM;
    const bounds = visibleBounds(80);
    context.fillStyle = "#171c1f";
    context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    context.fillStyle = "#8a887b";
    context.fillRect(room.x, room.y, room.w, room.h);

    for (let y = room.y + 24; y < room.y + room.h - 20; y += 36) {
      for (let x = room.x + 24; x < room.x + room.w - 20; x += 36) {
        context.fillStyle = ((x + y) / 36) % 2 < 1 ? "#9b998b" : "#908e81";
        context.fillRect(x, y, 34, 34);
      }
    }

    context.fillStyle = "#3b4141";
    context.fillRect(room.x, room.y, room.w, 28);
    context.fillRect(room.x, room.y + room.h - 28, room.w, 28);
    context.fillRect(room.x, room.y, 28, room.h);
    context.fillRect(room.x + room.w - 28, room.y, 28, room.h);
    context.strokeStyle = "#d0b75e";
    context.lineWidth = 5;
    context.strokeRect(room.x + 14, room.y + 14, room.w - 28, room.h - 28);

    MAINTENANCE_OBSTACLES.forEach((obstacle, index) => {
      context.fillStyle = index === 2 ? "#6f5538" : "#4f5a58";
      context.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      context.strokeStyle = "#282e2d";
      context.lineWidth = 4;
      context.strokeRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      context.fillStyle = index === 2 ? "#c99f56" : "#899995";
      for (let y = obstacle.y + 15; y < obstacle.y + obstacle.h - 8; y += 34) {
        context.fillRect(obstacle.x + 10, y, obstacle.w - 20, 7);
      }
    });

    context.fillStyle = "#263334";
    context.fillRect(MAINTENANCE_TERMINAL.x - 44, MAINTENANCE_TERMINAL.y - 28, 88, 52);
    context.fillStyle = "#75e2d2";
    context.fillRect(MAINTENANCE_TERMINAL.x - 30, MAINTENANCE_TERMINAL.y - 18, 60, 24);
    context.fillStyle = "rgba(117,226,210,.2)";
    context.beginPath(); context.arc(MAINTENANCE_TERMINAL.x, MAINTENANCE_TERMINAL.y, 56, 0, Math.PI * 2); context.fill();

    context.fillStyle = "#694e31";
    context.fillRect(MAINTENANCE_EXIT.x - 22, room.y + room.h - 48, 44, 48);
    context.fillStyle = "#f1d26a";
    context.fillRect(MAINTENANCE_EXIT.x + 11, room.y + room.h - 27, 4, 4);
    context.fillStyle = "rgba(244,220,119,.32)";
    context.beginPath(); context.ellipse(MAINTENANCE_EXIT.x, MAINTENANCE_EXIT.y, 42, 14, 0, 0, Math.PI * 2); context.fill();

    drawMapLabel(context, room.x + room.w / 2, room.y + 60, "SALA DE MANTENIMIENTO");
    drawMapLabel(context, MAINTENANCE_TERMINAL.x, MAINTENANCE_TERMINAL.y + 48, "TERMINAL");
    drawMapLabel(context, MAINTENANCE_EXIT.x, MAINTENANCE_EXIT.y + 34, "SALIDA");
  }

  function drawParkingAreas(context, bounds) {
    const lots = parkingLots.filter((lot) => entityInView(lot, bounds, 20));
    lots.forEach((lot) => {
      context.save(); context.translate(lot.x, lot.y); context.rotate(lot.a);
      context.fillStyle = "#c7b887"; context.fillRect(-lot.w / 2 - 8, -lot.h / 2 - 8, lot.w + 16, lot.h + 16);
      context.fillStyle = "#666f72"; context.fillRect(-lot.w / 2, -lot.h / 2, lot.w, lot.h);
      context.strokeStyle = "rgba(245,240,207,.72)"; context.lineWidth = 2;
      for (let x = -lot.w / 2 + 20; x < lot.w / 2 - 10; x += 52) {
        context.beginPath(); context.moveTo(x, -lot.h / 2); context.lineTo(x + 17, -lot.h / 2 + Math.min(34, lot.h)); context.stroke();
        if (lot.h >= 78) { context.beginPath(); context.moveTo(x, lot.h / 2); context.lineTo(x + 17, lot.h / 2 - 34); context.stroke(); }
      }
      context.restore();
      drawParkedCars(context, lot);
    });
  }

  function drawParkedCars(context, lot) {
    const colors = ["#d7564f", "#4b83a5", "#eee8cf", "#dea944", "#7d8790", "#60906e"];
    let slot = 0;
    for (let x = lot.x - lot.w / 2 + 42; x < lot.x + lot.w / 2 - 25; x += 78) {
      if (seededRandom(slot + lot.y * .01) > .24) {
        drawCar(context, { x, y: lot.y - Math.max(8, lot.h * .23), color: colors[slot % colors.length], angle: 0 });
      }
      if (lot.h >= 78 && seededRandom(slot + lot.y * .02 + 30) > .32) {
        drawCar(context, { x: x + 25, y: lot.y + lot.h * .24, color: colors[(slot + 3) % colors.length], angle: Math.PI });
      }
      slot += 1;
    }
  }

  function drawCar(context, car) {
    context.save(); context.translate(car.x, car.y); context.rotate(car.angle);
    context.fillStyle = "rgba(35,50,47,.22)"; context.fillRect(-12, -6, 30, 15);
    context.fillStyle = car.color; context.fillRect(-15, -8, 30, 16);
    context.fillStyle = "#bcd7d7"; context.fillRect(-6, -6, 12, 12);
    context.fillStyle = "#263634"; context.fillRect(-11, -11, 7, 3); context.fillRect(6, -11, 7, 3); context.fillRect(-11, 8, 7, 3); context.fillRect(6, 8, 7, 3);
    context.restore();
  }

  function drawTree(context, tree) {
    const size = tree.size;
    context.fillStyle = "rgba(30,60,39,.2)";
    context.beginPath(); context.ellipse(tree.x + 5, tree.y + size * .45, size * .58, size * .25, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#5a4930"; context.fillRect(tree.x - 3, tree.y, 6, size * .62);
    context.fillStyle = "#2f6841"; context.fillRect(tree.x - size * .45, tree.y - size * .48, size * .9, size * .72);
    context.fillStyle = "#4c8a49"; context.fillRect(tree.x - size * .32, tree.y - size * .63, size * .64, size * .66);
    context.fillStyle = "rgba(199,230,125,.46)"; context.fillRect(tree.x - size * .19, tree.y - size * .5, size * .22, size * .15);
  }

  function drawBuilding(context, building) {
    const sprite = state.buildingSkins?.[building.id] || building.defaultSprite || building.sprite;
    const selected = building.id === selectedBuildingId && elements.buildingEditor.classList.contains("open");
    context.save(); context.translate(building.x, building.y); context.rotate(building.a || 0);
    if (selected) {
      context.fillStyle = "rgba(247,199,70,.42)";
      context.fillRect(-building.w / 2 - 10, -building.h / 2 - 10, building.w + 20, building.h + 20);
      context.strokeStyle = "#f7c746"; context.lineWidth = 6;
      context.strokeRect(-building.w / 2 - 10, -building.h / 2 - 10, building.w + 20, building.h + 20);
    }
    context.fillStyle = "rgba(28,54,43,.22)";
    context.beginPath(); context.ellipse(8, building.h / 2 - 3, building.w * .42, 12, 0, 0, Math.PI * 2); context.fill();
    if (building.renderStyle === "apartment") drawApartmentBuilding(context, building.w, building.h);
    else if (buildingSheetReady && BUILDING_SPRITES[sprite]) {
      const [sx, sy, sw, sh] = BUILDING_SPRITES[sprite];
      const scale = Math.min(building.w / sw, building.h / sh);
      const drawWidth = sw * scale;
      const drawHeight = sh * scale;
      context.globalCompositeOperation = "multiply";
      context.drawImage(buildingSheet, sx, sy, sw, sh, -drawWidth / 2, building.h / 2 - drawHeight, drawWidth, drawHeight);
      context.globalCompositeOperation = "source-over";
    } else drawFallbackBuilding(context, building.w, building.h, sprite);
    context.restore();
    drawBuildingDoor(context, building);
    const notable = Boolean(building.poi) || building.id === "pabellon-san-pablo";
    if (notable || selected) drawMapLabel(context, building.x, building.y + building.h * .63, building.label);
  }

  function drawApartmentBuilding(context, width, height) {
    const left = -width / 2;
    const top = -height / 2;
    const sectionWidth = width / 3;
    context.fillStyle = "#f3efe0"; context.fillRect(left, top, width, height);
    context.fillStyle = "#d5b86b"; context.fillRect(left, height / 2 - 58, width, 58);
    context.fillStyle = "#6b7075"; context.fillRect(left - 8, top, width + 16, 30);
    context.fillStyle = "#92989d"; context.fillRect(left - 3, top + 30, width + 6, 6);
    context.strokeStyle = "#b9b8ac"; context.lineWidth = 3; context.strokeRect(left, top + 22, width, height - 22);

    for (let section = 0; section < 3; section += 1) {
      const sectionLeft = left + section * sectionWidth;
      context.fillStyle = section % 2 ? "#e9e5d6" : "#f6f0df";
      context.fillRect(sectionLeft + 6, top + 40, sectionWidth - 12, height - 105);
      context.fillStyle = "#b4785e";
      context.fillRect(sectionLeft + 18, top + 58, sectionWidth - 36, 30);
      context.fillStyle = "#7b9a9e";
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 2; column += 1) {
          const windowX = sectionLeft + 24 + column * (sectionWidth - 66);
          const windowY = top + 105 + row * 42;
          context.fillStyle = "#89adb1"; context.fillRect(windowX, windowY, 24, 25);
          context.fillStyle = "rgba(255,255,255,.55)"; context.fillRect(windowX + 3, windowY + 3, 7, 19);
          context.strokeStyle = "#5a6d70"; context.lineWidth = 2; context.strokeRect(windowX, windowY, 24, 25);
        }
      }
      context.fillStyle = "#d8d2c0"; context.fillRect(sectionLeft + 12, height / 2 - 82, sectionWidth - 24, 4);
      context.fillStyle = "#4e7b69"; context.fillRect(sectionLeft + 17, height / 2 - 51, sectionWidth - 34, 5);
    }
    context.strokeStyle = "rgba(88,91,84,.55)"; context.lineWidth = 2;
    context.beginPath(); context.moveTo(left + sectionWidth, top + 32); context.lineTo(left + sectionWidth, height / 2); context.moveTo(left + sectionWidth * 2, top + 32); context.lineTo(left + sectionWidth * 2, height / 2); context.stroke();
    context.fillStyle = "#416c5a"; context.fillRect(left + 14, height / 2 - 4, width - 28, 8);
  }

  function drawBuildingDoor(context, building) {
    const pulse = .55 + Math.sin(performance.now() / 330) * .18;
    buildingDoors(building).forEach((door) => {
      context.save();
      context.translate(door.facade.x, door.facade.y);
      context.rotate(door.rotation);
      context.fillStyle = "#523f2b";
      context.fillRect(-13, -19, 26, 38);
      context.fillStyle = "#e7c86a";
      context.fillRect(7, 0, 3, 3);
      context.strokeStyle = "#2f3028";
      context.lineWidth = 3;
      context.strokeRect(-13, -19, 26, 38);
      context.restore();

      context.save();
      context.globalAlpha = pulse;
      context.fillStyle = "#f4dc77";
      context.beginPath();
      context.ellipse(door.x, door.y, 22, 9, door.rotation, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
  }

  function drawFallbackBuilding(context, width, height, style) {
    const colors = style === "center" ? ["#e9e4cf", "#cc504a"] : style === "museum" ? ["#e7dcc7", "#a96d55"] : ["#e7e1ca", "#5c8598"];
    context.fillStyle = colors[0]; context.fillRect(-width / 2, -height / 2 + 28, width, height - 28);
    context.fillStyle = colors[1]; context.fillRect(-width / 2 - 6, -height / 2 + 10, width + 12, 34);
    context.fillStyle = "rgba(255,255,255,.28)"; context.fillRect(-width / 2, -height / 2 + 15, width, 6);
    context.fillStyle = "#406b69";
    for (let x = -width / 2 + 20; x < width / 2 - 15; x += 45) context.fillRect(x, 0, 22, 20);
    context.fillRect(-13, height / 2 - 45, 26, 45);
  }

  function drawMapLabel(context, x, y, label) {
    context.save();
    context.font = "900 11px Trebuchet MS";
    const width = context.measureText(label).width + 14;
    context.fillStyle = "rgba(253,250,229,.88)";
    context.fillRect(x - width / 2, y - 11, width, 18);
    context.strokeStyle = "rgba(40,71,55,.2)"; context.lineWidth = 1; context.strokeRect(x - width / 2, y - 11, width, 18);
    context.fillStyle = "#294e3c"; context.textAlign = "center"; context.fillText(label, x, y + 2);
    context.restore();
  }

  function playerSourceFrame() {
    const frames = playerFrames.get(`${playerRunning ? "run" : "walk"}-${state.direction}`) || [];
    if (!frames.length) return null;
    const walkOrder = [0, 1, 0, 2];
    return frames[playerRunning ? animationFrame % frames.length : walkOrder[animationFrame % walkOrder.length]];
  }

  function playerAlternateFoot() {
    return animationFrame === 1 || animationFrame === 3;
  }

  function drawPlayer(context) {
    const x = state.worldX;
    const y = state.worldY;
    context.save();
    context.fillStyle = "rgba(28,52,42,.24)";
    context.beginPath(); context.ellipse(x, y + 2, 11, 4, 0, 0, Math.PI * 2); context.fill();
    if (playerSheetReady) {
      const frame = playerSourceFrame();
      const bounce = playerRunning && playerAlternateFoot() ? -1 : 0;
      if (frame) context.drawImage(frame, x - 15, y - 37 + bounce, 30, 40);
    } else {
      context.fillStyle = "#d94e49"; context.fillRect(x - 8, y - 27, 16, 8);
      context.fillStyle = "#f0c099"; context.fillRect(x - 6, y - 19, 12, 8);
      context.fillStyle = "#3f6f9c"; context.fillRect(x - 8, y - 11, 16, 14);
    }
    context.restore();
  }

  function getItemImage(sprite) {
    if (!sprite) return null;
    if (!itemImages.has(sprite)) {
      const image = new Image();
      image.src = itemSpriteUrl(sprite);
      itemImages.set(sprite, image);
    }
    return itemImages.get(sprite);
  }

  function drawWorldObject(context, object, time) {
    const bob = Math.sin(time / 310 + object.x * .01) * 5;
    context.save(); context.translate(object.x, object.y + bob);
    context.fillStyle = "rgba(19,43,35,.2)";
    context.beginPath(); context.ellipse(0, 15, 18, 7, 0, 0, Math.PI * 2); context.fill();
    if (object.crystal) {
      context.shadowColor = "#7ce9f2"; context.shadowBlur = 16;
      context.fillStyle = "#a5f3f5";
      context.beginPath(); context.moveTo(0, -27); context.lineTo(15, -7); context.lineTo(8, 17); context.lineTo(-9, 17); context.lineTo(-15, -7); context.closePath(); context.fill();
      context.shadowBlur = 0;
      context.fillStyle = "#4bb8d0";
      context.beginPath(); context.moveTo(0, -27); context.lineTo(0, 15); context.lineTo(-9, 17); context.lineTo(-15, -7); context.closePath(); context.fill();
      context.strokeStyle = "#e6ffff"; context.lineWidth = 2; context.stroke();
    } else {
      const image = getItemImage(object.sprite);
      if (image?.complete && image.naturalWidth) context.drawImage(image, -24, -32, 48, 48);
      else {
        context.fillStyle = "#f5d75d"; context.fillRect(-12, -15, 24, 24);
        context.fillStyle = "white"; context.fillRect(-4, -7, 8, 8);
      }
    }
    context.restore();
  }

  function drawPortal(context, x, y, active, mirror = false) {
    const time = performance.now();
    const pulse = 1 + Math.sin(time / 350) * .06;
    context.save(); context.translate(x, y); context.scale(pulse, pulse);
    context.fillStyle = "rgba(25,30,54,.25)";
    context.beginPath(); context.ellipse(0, 36, 58, 18, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = active ? (mirror ? "#f0a8ff" : "#79e4ee") : "#8c8d88";
    context.lineWidth = 13; context.shadowColor = context.strokeStyle; context.shadowBlur = active ? 22 : 0;
    context.beginPath(); context.ellipse(0, -8, 43, 66, 0, 0, Math.PI * 2); context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = active ? "rgba(78,42,128,.86)" : "rgba(73,75,72,.7)";
    context.beginPath(); context.ellipse(0, -8, 33, 55, 0, 0, Math.PI * 2); context.fill();
    if (active) {
      context.strokeStyle = mirror ? "#8be5ff" : "#d0a7ff"; context.lineWidth = 3;
      for (let index = 0; index < 3; index += 1) {
        context.beginPath(); context.arc(0, -8, 10 + index * 9, time / 700 + index, time / 700 + index + Math.PI * 1.25); context.stroke();
      }
    }
    context.restore();
    drawMapLabel(context, x, y + 82, mirror ? "PORTAL DE REGRESO" : active ? "PORTAL PRISMA" : "ARCO INACTIVO");
  }

  function drawPrismGround(context) {
    const bounds = visibleBounds(100);
    context.fillStyle = "#141329";
    context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    for (let y = Math.floor(bounds.top / 64) * 64; y < bounds.bottom; y += 64) {
      for (let x = Math.floor(bounds.left / 64) * 64; x < bounds.right; x += 64) {
        const bright = seededRandom(x * .01 + y * .03) > .75;
        context.fillStyle = bright ? "rgba(190,161,255,.55)" : "rgba(112,206,221,.24)";
        context.fillRect(x + 12, y + 16, bright ? 3 : 2, bright ? 3 : 2);
      }
    }

    prismWalkableAreas.filter((area) => entityInView({ x: area.x + area.w / 2, y: area.y + area.h / 2, w: area.w, h: area.h }, bounds, 30)).forEach((area, index) => {
      context.fillStyle = "#3c3464";
      context.fillRect(area.x - 12, area.y + 13, area.w + 24, area.h + 12);
      context.fillStyle = index % 2 ? "#66528a" : "#5b4b82";
      context.fillRect(area.x, area.y, area.w, area.h);
      context.strokeStyle = "#8a72aa"; context.lineWidth = 5; context.strokeRect(area.x + 2, area.y + 2, area.w - 4, area.h - 4);
      for (let y = area.y + 16; y < area.y + area.h; y += 32) {
        for (let x = area.x + 16; x < area.x + area.w; x += 32) {
          if ((x / 32 + y / 32) % 3 === 0) {
            context.fillStyle = "rgba(153,123,186,.2)";
            context.fillRect(x, y, 16, 16);
          }
        }
      }
    });

    prismEncounterZones.filter((zone) => polygonInView(zone, bounds)).forEach((zone, index) => drawPrismGrass(context, zone, index));
    drawPrismRelics(context, bounds);
    drawPortal(context, 1050, 1830, true, true);
  }

  function drawPrismGrass(context, polygon, index) {
    context.save();
    context.beginPath(); context.moveTo(polygon[0][0], polygon[0][1]); polygon.slice(1).forEach((point) => context.lineTo(point[0], point[1])); context.closePath(); context.clip();
    const xs = polygon.map((point) => point[0]); const ys = polygon.map((point) => point[1]);
    const left = Math.min(...xs); const right = Math.max(...xs); const top = Math.min(...ys); const bottom = Math.max(...ys);
    context.fillStyle = index % 2 ? "#49376f" : "#334c6d"; context.fillRect(left, top, right - left, bottom - top);
    for (let y = top + 10; y < bottom; y += 30) {
      for (let x = left + 12; x < right; x += 30) {
        context.strokeStyle = (x + y) % 60 ? "#a77fd0" : "#6ad2df"; context.lineWidth = 3;
        context.beginPath(); context.moveTo(x, y + 14); context.lineTo(x - 5, y + 3); context.moveTo(x, y + 14); context.lineTo(x + 6, y); context.stroke();
      }
    }
    context.restore();
  }

  function drawPrismRelics(context, bounds) {
    const relics = [
      { x: 390, y: 490, sprite: "tower", w: 130, h: 220 },
      { x: 1680, y: 1180, sprite: "mansion", w: 180, h: 190 },
      { x: 360, y: 1220, sprite: "lab", w: 170, h: 130 },
    ];
    relics.filter((relic) => entityInView(relic, bounds, 40)).forEach((relic) => {
      if (!buildingSheetReady) return;
      const [sx, sy, sw, sh] = BUILDING_SPRITES[relic.sprite];
      context.save(); context.globalAlpha = .56; context.filter = "hue-rotate(65deg) saturate(1.4)";
      context.globalCompositeOperation = "multiply";
      context.drawImage(buildingSheet, sx, sy, sw, sh, relic.x - relic.w / 2, relic.y - relic.h / 2, relic.w, relic.h);
      context.restore();
    });
    drawMapLabel(context, 1050, 250, "ISLA DEL ECO");
  }

  function drawAvailableObjects(context, bounds) {
    const time = performance.now();
    worldObjects
      .filter((object) => object.dimension === state.dimension && !state.collectedObjects.includes(object.id) && entityInView(object, bounds, 45))
      .forEach((object) => drawWorldObject(context, object, time));
  }

  function checkObjectPickup() {
    if (state.interior) return false;
    const object = worldObjects.find((item) => item.dimension === state.dimension
      && !state.collectedObjects.includes(item.id)
      && Math.hypot(state.worldX - item.x, state.worldY - item.y) < 38);
    if (!object) return false;
    state.collectedObjects.push(object.id);
    if (object.kind === "balls") state.balls += object.amount;
    else state.inventory[object.kind] = (state.inventory[object.kind] || 0) + object.amount;
    playJingle(object.crystal ? "capture" : "success");
    if (object.crystal) {
      const shards = state.inventory.prismShards;
      const messages = [`Has encontrado un Fragmento Prisma (${shards} / 3).`];
      if (shards >= 3) messages.push("Los tres fragmentos vibran a la vez. El portal del campo de fútbol ya puede abrirse.");
      showDialog(messages, "◇");
    } else showAreaToast(`HAS ENCONTRADO: ${object.name.toUpperCase()}`);
    return true;
  }

  function getPokemonArtworkImage(id) {
    if (!pokemonArtworkImages.has(id)) {
      const image = new Image(); image.src = artworkUrl(id); pokemonArtworkImages.set(id, image);
    }
    return pokemonArtworkImages.get(id);
  }

  function castMazeRay(originX, originY, angle, maxDistance = 24) {
    const step = .025;
    for (let distance = step; distance < maxDistance; distance += step) {
      const x = originX + Math.cos(angle) * distance;
      const y = originY + Math.sin(angle) * distance;
      if (mazeDefinition.grid[Math.floor(y)]?.[Math.floor(x)] !== 0) return distance;
    }
    return maxDistance;
  }

  function drawMaze3D(context) {
    const maze = ensureMazeState();
    const width = VIEW_WIDTH; const height = VIEW_HEIGHT; const horizon = height * .47; const fov = Math.PI / 3;
    const ceiling = context.createLinearGradient(0, 0, 0, horizon);
    ceiling.addColorStop(0, "#090712"); ceiling.addColorStop(1, "#28213c");
    context.fillStyle = ceiling; context.fillRect(0, 0, width, horizon);
    const floor = context.createLinearGradient(0, horizon, 0, height);
    floor.addColorStop(0, "#332b4c"); floor.addColorStop(1, "#080710");
    context.fillStyle = floor; context.fillRect(0, horizon, width, height - horizon);

    const rayCount = 240;
    const sliceWidth = width / rayCount + 1;
    for (let index = 0; index < rayCount; index += 1) {
      const rayAngle = maze.angle - fov / 2 + fov * (index / (rayCount - 1));
      const rawDistance = castMazeRay(maze.playerX, maze.playerY, rayAngle);
      const correctedDistance = Math.max(.12, rawDistance * Math.cos(rayAngle - maze.angle));
      const wallHeight = Math.min(height * 1.55, height * .92 / correctedDistance);
      const brightness = clamp(1 - correctedDistance / 16, .11, .92);
      const stripe = index % 2 ? 5 : 0;
      const red = Math.round(64 * brightness + stripe);
      const green = Math.round(54 * brightness + stripe);
      const blue = Math.round(92 * brightness + stripe * 1.5);
      context.fillStyle = `rgb(${red},${green},${blue})`;
      context.fillRect(index * width / rayCount, horizon - wallHeight / 2, sliceWidth, wallHeight);
      context.fillStyle = `rgba(178,128,210,${brightness * .08})`;
      context.fillRect(index * width / rayCount, horizon - wallHeight / 2, 1, wallHeight);
    }

    drawMazeSecretPokemon(context, fov);
    drawMazeShadow(context, fov);
    drawSprintShadow(context);
    drawFlashlightCone(context);
    drawThirdPersonTrainer(context);

    context.strokeStyle = flashlightBurst > 0 ? "rgba(255,247,199,.95)" : "rgba(221,209,171,.52)";
    context.lineWidth = 2;
    context.beginPath(); context.moveTo(width / 2 - 10, horizon); context.lineTo(width / 2 + 10, horizon); context.moveTo(width / 2, horizon - 10); context.lineTo(width / 2, horizon + 10); context.stroke();
  }

  function projectedEntityData(x, y, fov) {
    const maze = ensureMazeState();
    const dx = x - maze.playerX; const dy = y - maze.playerY;
    const entityDistance = Math.hypot(dx, dy);
    const angleDifference = normalizeAngle(Math.atan2(dy, dx) - maze.angle);
    if (Math.abs(angleDifference) > fov * .62 || !rayClear(maze.playerX, maze.playerY, x, y)) return null;
    return { distance: entityDistance, screenX: VIEW_WIDTH * (.5 + angleDifference / fov) };
  }

  function drawMazeShadow(context, fov) {
    if (sprintScare) return;
    const maze = ensureMazeState();
    const projection = projectedEntityData(maze.monsterX, maze.monsterY, fov);
    if (!projection) return;
    const height = clamp(650 / Math.max(.45, projection.distance), 74, 570);
    const width = height * .67;
    const baseY = VIEW_HEIGHT * .5 + height * .49;
    context.save(); context.translate(projection.screenX, baseY);
    context.globalAlpha = maze.monsterRepel > 0 ? .38 : clamp(1.18 - projection.distance / 15, .5, 1);
    context.filter = maze.monsterRepel > 0
      ? "hue-rotate(120deg) drop-shadow(0 0 20px #82dce5)"
      : "drop-shadow(0 0 24px rgba(128,69,154,.92))";
    if (shadowStalkerReady) context.drawImage(shadowStalkerImage, -width / 2, -height, width, height);
    else {
      context.fillStyle = "#030305";
      context.beginPath();
      context.ellipse(0, -height * .52, width * .26, height * .39, 0, 0, Math.PI * 2);
      context.ellipse(-width * .3, -height * .22, width * .12, height * .39, -.25, 0, Math.PI * 2);
      context.ellipse(width * .3, -height * .22, width * .12, height * .39, .25, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawSprintShadow(context) {
    if (!sprintScare) return;
    const progress = clamp(sprintScare.elapsed / sprintScare.duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 2.4);
    const height = 850 + (125 - 850) * eased;
    const width = height * .67;
    const direction = sprintScare.direction || 1;
    const x = direction > 0
      ? VIEW_WIDTH * (-.08 + 1.18 * eased)
      : VIEW_WIDTH * (1.08 - 1.18 * eased);
    const baseY = VIEW_HEIGHT * (1.13 - .59 * eased);
    const alpha = clamp(Math.sin(progress * Math.PI) * 1.55, 0, 1);

    context.save();
    const vignette = context.createRadialGradient(VIEW_WIDTH * .4, VIEW_HEIGHT * .52, 40, VIEW_WIDTH * .4, VIEW_HEIGHT * .52, VIEW_WIDTH * .7);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, sprintScare.warningPlayed ? "rgba(118,0,15,.58)" : "rgba(24,0,35,.52)");
    context.fillStyle = vignette; context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    for (let trail = 3; trail >= 0; trail -= 1) {
      const trailOffset = trail * 19;
      const trailAlpha = alpha * (trail === 0 ? 1 : .09 * (4 - trail));
      context.save();
      context.globalAlpha = trailAlpha;
      context.translate(x - direction * trailOffset, baseY + trailOffset * .3);
      context.rotate(direction * (-.12 + progress * .17));
      context.filter = sprintScare.warningPlayed
        ? "drop-shadow(0 0 30px rgba(255,41,65,.95))"
        : "drop-shadow(0 0 24px rgba(125,72,158,.9))";
      if (shadowStalkerReady) context.drawImage(shadowStalkerImage, -width / 2, -height, width, height);
      else { context.fillStyle = "#010103"; context.fillRect(-width * .2, -height, width * .4, height); }
      context.restore();
    }
    context.restore();
  }

  function drawMazeSecretPokemon(context, fov) {
    if (state.secretPokemonSaved) return;
    const secretId = currentSecretPokemonId();
    const goal = mazeDefinition.goal;
    const projection = projectedEntityData(goal.x + .5, goal.y + .5, fov);
    if (!projection) return;
    const size = clamp(330 / Math.max(.5, projection.distance), 35, 250);
    const image = getPokemonArtworkImage(secretId);
    context.save();
    context.translate(projection.screenX, VIEW_HEIGHT * .5 + size * .15);
    context.shadowColor = "#80edf0"; context.shadowBlur = 26;
    context.filter = "invert(1) hue-rotate(180deg) saturate(1.5)";
    if (image.complete && image.naturalWidth) context.drawImage(image, -size / 2, -size, size, size);
    else { context.fillStyle = "#d5ffff"; context.beginPath(); context.arc(0, -size / 2, size / 3, 0, Math.PI * 2); context.fill(); }
    context.restore();
  }

  function drawFlashlightCone(context) {
    const gradient = context.createRadialGradient(VIEW_WIDTH / 2, VIEW_HEIGHT * .58, 20, VIEW_WIDTH / 2, VIEW_HEIGHT * .58, VIEW_WIDTH * .5);
    gradient.addColorStop(0, flashlightBurst > 0 ? "rgba(255,250,211,.5)" : "rgba(244,235,189,.18)");
    gradient.addColorStop(.48, flashlightBurst > 0 ? "rgba(243,226,168,.22)" : "rgba(222,208,159,.07)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.save();
    context.beginPath(); context.moveTo(VIEW_WIDTH * .43, VIEW_HEIGHT); context.lineTo(VIEW_WIDTH * .19, VIEW_HEIGHT * .1); context.lineTo(VIEW_WIDTH * .81, VIEW_HEIGHT * .1); context.lineTo(VIEW_WIDTH * .57, VIEW_HEIGHT); context.closePath(); context.clip();
    context.fillStyle = gradient; context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    context.restore();
  }

  function drawThirdPersonTrainer(context) {
    const isMoving = animationFrame % 2 === 1;
    const frame = playerRunning ? (isMoving ? 6 : 1) : (isMoving ? 5 : 1);
    context.save();
    context.fillStyle = "rgba(0,0,0,.45)"; context.beginPath(); context.ellipse(VIEW_WIDTH / 2, VIEW_HEIGHT - 26, 46, 13, 0, 0, Math.PI * 2); context.fill();
    if (playerSheetReady) {
      context.translate(VIEW_WIDTH / 2, VIEW_HEIGHT - 90);
      if (isMoving) context.scale(-1, 1);
      context.drawImage(playerSheet, frame * 16, 0, 16, 32, -42, -84, 84, 168);
    } else { context.fillStyle = "#bb3e43"; context.fillRect(VIEW_WIDTH / 2 - 24, VIEW_HEIGHT - 132, 48, 96); }
    context.restore();
  }

  function drawTileGrid(context) {
    if (!elements.buildingEditor.classList.contains("open")) return;
    const size = CITY_MAP.tileSize;
    const startCol = Math.max(0, Math.floor(camera.x / size));
    const endCol = Math.min(Math.ceil(WORLD_WIDTH / size) - 1, Math.ceil((camera.x + VIEW_WIDTH) / size));
    const startRow = Math.max(0, Math.floor(camera.y / size));
    const endRow = Math.min(Math.ceil(WORLD_HEIGHT / size) - 1, Math.ceil((camera.y + VIEW_HEIGHT) / size));
    const colors = { blocked: "rgba(214,59,52,.34)", door: "rgba(255,191,46,.48)", encounter: "rgba(52,183,91,.34)", event: "rgba(126,81,201,.42)" };
    context.save();
    context.lineWidth = 1;
    context.font = "8px monospace";
    context.textAlign = "left";
    context.textBaseline = "top";
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const x = col * size; const y = row * size; const type = mapTileType(col, row);
        if (colors[type]) { context.fillStyle = colors[type]; context.fillRect(x, y, size, size); }
        context.strokeStyle = "rgba(255,255,255,.48)"; context.strokeRect(x + .5, y + .5, size - 1, size - 1);
        context.fillStyle = "rgba(15,45,32,.82)"; context.fillText(`${col},${row}`, x + 2, y + 2);
      }
    }
    if (selectedMapTile) {
      context.strokeStyle = "#fff"; context.lineWidth = 3;
      context.strokeRect(selectedMapTile.col * size + 1.5, selectedMapTile.row * size + 1.5, size - 3, size - 3);
    }
    context.restore();
  }

  function drawWorld() {
    const context = elements.canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    if (state.dimension === "prism") {
      drawMaze3D(context);
      return;
    }

    if (state.interior === "maintenance") {
      context.save();
      context.translate(-Math.round(camera.x), -Math.round(camera.y));
      drawMaintenanceRoom(context);
      drawPlayer(context);
      context.restore();
      return;
    }

    context.save();
    context.translate(-Math.round(camera.x), -Math.round(camera.y));
    if (cityMapReady) context.drawImage(cityMapImage, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    else { context.fillStyle = "#8fbf72"; context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT); }
    drawTileGrid(context);
    drawPlayer(context);
    context.restore();
  }

  function drawMiniMap() {
    if (!elements.miniMap || !elements.miniMapCanvas) return;
    const hidden = !state.started || state.dimension !== "san_pablo" || Boolean(state.interior)
      || elements.worldScreen.classList.contains("hidden");
    elements.miniMap.classList.toggle("hidden", hidden);
    if (hidden) return;

    const context = elements.miniMapCanvas.getContext("2d");
    const width = elements.miniMapCanvas.width;
    const height = elements.miniMapCanvas.height;
    const scaleX = width / WORLD_WIDTH;
    const scaleY = height / WORLD_HEIGHT;
    context.clearRect(0, 0, width, height);
    if (cityMapReady) context.drawImage(cityMapImage, 0, 0, width, height);
    else { context.fillStyle = "#79a85d"; context.fillRect(0, 0, width, height); }
    context.fillStyle = "rgba(13,35,27,.12)"; context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,.58)";
    context.lineWidth = 1;
    context.strokeRect(camera.x * scaleX, camera.y * scaleY, VIEW_WIDTH * scaleX, VIEW_HEIGHT * scaleY);

    const playerX = state.worldX * scaleX;
    const playerY = state.worldY * scaleY;
    const directionAngles = { up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI };
    context.save();
    context.translate(playerX, playerY);
    context.rotate(directionAngles[state.direction] || 0);
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-5, -5);
    context.lineTo(-3, 0);
    context.lineTo(-5, 5);
    context.closePath();
    context.fillStyle = "#fff";
    context.fill();
    context.strokeStyle = "#c84444";
    context.lineWidth = 2;
    context.stroke();
    context.restore();
  }

  function updateCamera(deltaSeconds) {
    if (state.dimension === "prism") return;
    const targetX = clamp(state.worldX - VIEW_WIDTH / 2, 0, currentWorldWidth() - VIEW_WIDTH);
    const targetY = clamp(state.worldY - VIEW_HEIGHT / 2, 0, currentWorldHeight() - VIEW_HEIGHT);
    const smoothing = 1 - Math.pow(.0008, deltaSeconds);
    camera.x += (targetX - camera.x) * smoothing;
    camera.y += (targetY - camera.y) * smoothing;
  }

  function gameLoop(timestamp) {
    const deltaSeconds = lastFrameTime ? clamp((timestamp - lastFrameTime) / 1000, 0, .05) : 0;
    lastFrameTime = timestamp;
    if (!elements.worldScreen.classList.contains("hidden")) {
      updateMovement(deltaSeconds);
      updateCamera(deltaSeconds);
      drawWorld();
      drawMiniMap();
    }
    window.requestAnimationFrame(gameLoop);
  }

  function chooseWildPokemon() {
    const table = state.dimension === "prism" ? PRISM_WILD_TABLE : WILD_TABLE;
    const total = table.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of table) { roll -= entry.weight; if (roll <= 0) return entry.id; }
    return table[0].id;
  }

  function firstHealthyTeamIndex() { return state.team.findIndex((member) => member.hp > 0); }

  function beginEncounter() {
    if (battle || inputLocked) return;
    inputLocked = true; clearDirectionalInput();
    stopBackgroundMusic();
    elements.flashOverlay.classList.remove("encounter"); void elements.flashOverlay.offsetWidth;
    elements.flashOverlay.classList.add("encounter"); playJingle("encounter");
    window.setTimeout(() => {
      const active = activePokemon();
      const levelBoost = state.dimension === "prism" ? 1 : -2;
      const enemy = createPokemon(chooseWildPokemon(), clamp(active.level + levelBoost + Math.floor(Math.random() * 3), 2, 18));
      if (!state.seen.includes(enemy.id)) state.seen.push(enemy.id);
      battle = { enemy, busy: false, turns: 0 };
      elements.worldScreen.classList.add("hidden"); elements.titleScreen.classList.add("hidden"); elements.battleScreen.classList.remove("hidden");
      elements.battleScreen.classList.toggle("prism-battle", state.dimension === "prism");
      elements.battleLabel.textContent = state.dimension === "prism" ? "ENCUENTRO · DIMENSIÓN PRISMA" : "ENCUENTRO SALVAJE · SAN PABLO";
      elements.flashOverlay.classList.remove("encounter"); inputLocked = false;
      renderBattle(); setBattleMessage(`¡Un ${speciesOf(enemy).name} salvaje apareció!`); saveGame();
    }, 760);
  }

  function startSecretBattle() {
    if (battle || inputLocked || state.secretPokemonSaved || state.dimension !== "prism") return;
    inputLocked = true;
    clearDirectionalInput();
    stopHorrorAudio();
    stopBackgroundMusic();
    elements.flashOverlay.classList.remove("encounter");
    void elements.flashOverlay.offsetWidth;
    elements.flashOverlay.classList.add("encounter");
    playJingle("encounter");

    window.setTimeout(() => {
      const active = activePokemon();
      const enemy = createPokemon(currentSecretPokemonId(), clamp(active.level + 3, 6, 24));
      if (!state.seen.includes(enemy.id)) state.seen.push(enemy.id);
      battle = { enemy, busy: false, turns: 0, secretBattle: true };
      elements.worldScreen.classList.add("hidden");
      elements.titleScreen.classList.add("hidden");
      elements.battleScreen.classList.remove("hidden");
      elements.battleScreen.classList.add("prism-battle");
      elements.battleLabel.textContent = "RESCATE · POKÉMON SECRETO";
      elements.flashOverlay.classList.remove("encounter");
      inputLocked = false;
      renderBattle();
      setBattleMessage(`${speciesOf(enemy).name} invertido está atrapado por la dimensión. ¡Debilítalo para liberarlo!`);
      saveGame();
    }, 760);
  }

  function renderBattle() {
    if (!battle) return;
    const enemy = battle.enemy; const active = activePokemon();
    elements.enemyName.textContent = speciesOf(enemy).name.toUpperCase();
    elements.enemyLevel.textContent = `Nv. ${enemy.level}`;
    elements.enemySprite.src = frontSpriteUrl(enemy.id); attachSpriteFallback(elements.enemySprite, enemy.id);
    elements.enemySprite.classList.toggle("inverted-secret", Boolean(battle.secretBattle));
    elements.activeName.textContent = speciesOf(active).name.toUpperCase();
    elements.activeLevel.textContent = `Nv. ${active.level}`;
    elements.battleActiveName.textContent = speciesOf(active).name.toUpperCase();
    elements.activeSprite.src = backSpriteUrl(active.id); attachSpriteFallback(elements.activeSprite, active.id, true);
    updateBattleHealth(); renderMoves(); renderHud();
    setBattleBusy(Boolean(battle.busy));
  }

  function hpColor(percent) { return percent <= 20 ? "#d84d47" : percent <= 48 ? "#e0a735" : "#4eb16c"; }
  function expNeeded(level) { return 20 + level * 12; }

  function updateBattleHealth() {
    if (!battle) return;
    const enemy = battle.enemy; const active = activePokemon();
    const enemyPercent = clamp(enemy.hp / enemy.maxHp * 100, 0, 100);
    const activePercent = clamp(active.hp / active.maxHp * 100, 0, 100);
    elements.enemyHpBar.style.width = `${enemyPercent}%`; elements.enemyHpBar.style.background = hpColor(enemyPercent);
    elements.enemyHpText.textContent = `${enemy.hp} / ${enemy.maxHp}`;
    elements.activeHpBar.style.width = `${activePercent}%`; elements.activeHpBar.style.background = hpColor(activePercent);
    elements.activeHpText.textContent = `${active.hp} / ${active.maxHp}`;
    elements.activeExpBar.style.width = `${clamp(active.exp / expNeeded(active.level) * 100, 0, 100)}%`;
  }

  function renderMoves() {
    const species = speciesOf(activePokemon());
    elements.movesGrid.innerHTML = species.moves.map((move, index) => `
      <button class="move-button" type="button" data-move-index="${index}" ${battle?.busy ? "disabled" : ""}>
        <span class="move-dot" style="--move-color:${TYPE_COLORS[move.type] || TYPE_COLORS.Normal}"></span>
        <strong>${move.name}</strong><small>${move.type}</small>
      </button>`).join("");
    $$('[data-move-index]').forEach((button) => button.addEventListener("click", () => playerAttack(Number(button.dataset.moveIndex))));
  }

  function setBattleMessage(message) { elements.battleMessage.textContent = message; }
  function setBattleBusy(busy) {
    if (!battle) return;
    battle.busy = busy;
    [elements.fightButton, elements.bagButton, elements.teamBattleButton, elements.runButton].forEach((button) => { button.disabled = busy; });
    if (battle.secretBattle) {
      elements.bagButton.disabled = true;
      elements.runButton.disabled = true;
    }
    $$('[data-move-index]').forEach((button) => { button.disabled = busy; });
  }

  function typeMultiplier(moveType, defenderSpecies) {
    const types = [defenderSpecies.type, defenderSpecies.secondaryType].filter(Boolean);
    const strong = {
      Fuego: ["Planta", "Bicho"], Agua: ["Fuego", "Tierra"], Planta: ["Agua", "Tierra"],
      Eléctrico: ["Agua", "Volador"], Volador: ["Planta", "Bicho"], Bicho: ["Planta", "Psíquico"],
      Psíquico: ["Veneno"], Fantasma: ["Psíquico", "Fantasma"], Dragón: ["Dragón"], Tierra: ["Eléctrico", "Acero"],
    };
    const weak = {
      Fuego: ["Agua"], Agua: ["Planta"], Planta: ["Fuego", "Bicho", "Volador"],
      Eléctrico: ["Planta", "Tierra"], Psíquico: ["Psíquico", "Acero"], Fantasma: ["Normal"],
    };
    if (types.some((type) => strong[moveType]?.includes(type))) return 1.5;
    if (types.some((type) => weak[moveType]?.includes(type))) return .65;
    return 1;
  }

  function calculateDamage(attacker, defender, move) {
    const multiplier = typeMultiplier(move.type, speciesOf(defender));
    const critical = Math.random() < .08;
    const damage = Math.max(1, Math.round((3 + attacker.level * .72 + move.power * .31) * multiplier * (.86 + Math.random() * .22) * (critical ? 1.45 : 1)));
    return { damage, multiplier, critical };
  }

  function animateAttack(attacker, defender) {
    attacker.classList.remove("attacking"); defender.classList.remove("hit"); void attacker.offsetWidth;
    attacker.classList.add("attacking"); window.setTimeout(() => defender.classList.add("hit"), 180);
    window.setTimeout(() => { attacker.classList.remove("attacking"); defender.classList.remove("hit"); }, 500);
  }

  async function playerAttack(index) {
    if (!battle || battle.busy) return;
    const active = activePokemon(); const move = speciesOf(active).moves[index];
    setBattleBusy(true); elements.movesMenu.classList.add("hidden"); elements.battleMenu.classList.remove("hidden");
    setBattleMessage(`¡${speciesOf(active).name} usó ${move.name}!`); animateAttack(elements.activeSprite, elements.enemySprite);
    playTone(move.type === "Eléctrico" ? 740 : 260, .12, "square", .04); await wait(430);
    if (Math.random() * 100 > move.accuracy) { setBattleMessage("¡El ataque falló!"); await wait(700); await enemyTurn(); return; }
    const result = calculateDamage(active, battle.enemy, move);
    battle.enemy.hp = Math.max(0, battle.enemy.hp - result.damage);
    if (move.drain) active.hp = Math.min(active.maxHp, active.hp + Math.max(1, Math.floor(result.damage / 3)));
    updateBattleHealth();
    if (result.critical) setBattleMessage("¡Un golpe crítico!"); else if (result.multiplier > 1) setBattleMessage("¡Es supereficaz!"); else if (result.multiplier < 1) setBattleMessage("No es muy eficaz…");
    await wait(700);
    if (battle.enemy.hp <= 0) { await winBattle(); return; }
    await enemyTurn();
  }

  async function enemyTurn() {
    if (!battle) return;
    const enemy = battle.enemy; const move = speciesOf(enemy).moves[Math.floor(Math.random() * speciesOf(enemy).moves.length)]; const active = activePokemon();
    setBattleMessage(`¡${speciesOf(enemy).name} salvaje usó ${move.name}!`); animateAttack(elements.enemySprite, elements.activeSprite); playTone(180, .11, "sawtooth", .03); await wait(430);
    if (Math.random() * 100 <= move.accuracy) {
      const result = calculateDamage(enemy, active, move); active.hp = Math.max(0, active.hp - result.damage);
      if (move.drain) enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.max(1, Math.floor(result.damage / 3)));
      updateBattleHealth();
    } else setBattleMessage("¡El ataque enemigo falló!");
    await wait(700);
    if (active.hp <= 0) {
      setBattleMessage(`¡${speciesOf(active).name} no puede continuar!`); await wait(850);
      const next = firstHealthyTeamIndex();
      if (next === -1) { await loseBattle(); return; }
      state.activeTeamIndex = next; renderBattle(); setBattleMessage(`¡Adelante, ${speciesOf(activePokemon()).name}!`); await wait(700);
    }
    setBattleBusy(false); saveGame();
  }

  async function awardExperience(member, amount) {
    member.exp += amount; let levelUp = false;
    while (member.exp >= expNeeded(member.level)) { member.exp -= expNeeded(member.level); member.level += 1; member.maxHp += 3; member.hp = Math.min(member.maxHp, member.hp + 5); levelUp = true; }
    if (levelUp) {
      state.trainerLevel = Math.max(1, Math.floor(state.team.reduce((sum, item) => sum + item.level, 0) / state.team.length) - 3);
      renderBattle(); setBattleMessage(`¡${speciesOf(member).name} subió al nivel ${member.level}!`); playJingle("level"); await wait(1050);
    }
  }

  async function winBattle() {
    if (battle?.secretBattle) {
      await rescueSecretPokemon();
      return;
    }
    const defeated = battle.enemy; const reward = 10 + defeated.level * 4;
    setBattleMessage(`¡${speciesOf(defeated).name} salvaje fue derrotado!`); playJingle("success"); await wait(750);
    setBattleMessage(`${speciesOf(activePokemon()).name} ganó ${reward} puntos de experiencia.`); await wait(700);
    await awardExperience(activePokemon(), reward);
    if (Math.random() < .22) { state.balls += 1; setBattleMessage("Encontraste una Poké Ball junto a la acera."); await wait(800); }
    finishBattle();
  }

  async function rescueSecretPokemon() {
    if (!battle?.secretBattle) return;
    const rescued = battle.enemy;
    const reward = 28 + rescued.level * 5;
    setBattleBusy(true);
    setBattleMessage("¡El vínculo oscuro se está rompiendo!");
    playJingle("capture");
    await wait(950);
    setBattleMessage(`${speciesOf(activePokemon()).name} ganó ${reward} puntos de experiencia.`);
    await wait(700);
    await awardExperience(activePokemon(), reward);

    state.secretPokemonSaved = true;
    state.caughtDimension = true;
    if (!state.caught.includes(rescued.id)) state.caught.push(rescued.id);
    if (!state.seen.includes(rescued.id)) state.seen.push(rescued.id);
    const joinedTeam = state.team.length < MAX_TEAM;
    if (joinedTeam) state.team.push({ ...rescued, hp: rescued.maxHp, inverted: true });

    setBattleMessage(joinedTeam
      ? `¡${speciesOf(rescued).name} invertido está a salvo y ha decidido acompañarte!`
      : `¡${speciesOf(rescued).name} invertido está a salvo! Queda registrado en tu Pokédex.`);
    await wait(1250);

    stopMicrophone();
    const destination = state.returnPosition || { x: PORTAL_POSITION.x, y: PORTAL_POSITION.y + field.h / 2 + 70 };
    state.dimension = "san_pablo";
    state.worldX = destination.x;
    state.worldY = destination.y;
    state.direction = "down";
    state.returnPosition = null;
    state.maze = null;
    camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH);
    camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT);
    lastArea = "";
    elements.buildingEditorButton.disabled = false;
    finishBattle();
    showDialog([
      "El laberinto se deshace y el portal te devuelve a San Pablo.",
      `Has salvado a ${speciesOf(rescued).name}, el Pokémon secreto de colores invertidos.`,
    ], "◇", () => showAreaToast(`${speciesOf(rescued).name.toUpperCase()} RESCATADO`));
  }

  async function loseBattle() {
    setBattleMessage("Tu equipo está agotado… Os llevan al Centro de Salud San Pablo."); playJingle("lose"); await wait(1300);
    stopMicrophone();
    state.team.forEach((member) => { member.hp = member.maxHp; });
    state.dimension = "san_pablo"; state.returnPosition = null; state.interior = null; state.maintenanceReturn = null;
    state.worldX = 560; state.worldY = 765; state.direction = "down";
    camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH);
    camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT);
    elements.buildingEditorButton.disabled = false;
    finishBattle(); showDialog(["Enfermera: Ya estáis recuperados. Vigila los PS antes de cruzar las zonas verdes."], "+");
  }

  async function throwBall(ballType = "poke") {
    if (!battle || battle.busy) return;
    if (battle.secretBattle) {
      setBattleMessage("No puedes capturarlo: primero debes romper el vínculo que lo aprisiona.");
      return;
    }
    const ultra = ballType === "ultra";
    const available = ultra ? state.inventory.ultraBalls : state.balls;
    if (available <= 0) { setBattleMessage(`No te quedan ${ultra ? "Ultra Balls" : "Poké Balls"}.`); playTone(95, .15, "square", .03); return; }
    setBattleBusy(true);
    if (ultra) state.inventory.ultraBalls -= 1; else state.balls -= 1;
    renderHud();
    const enemy = battle.enemy; const species = speciesOf(enemy);
    setBattleMessage(`¡Lanzaste una ${ultra ? "Ultra Ball" : "Poké Ball"}!`); createThrownBall(ultra); playTone(520, .12, "sine", .04); await wait(800);
    const chance = clamp(species.catchRate + (1 - enemy.hp / enemy.maxHp) * .48 + (ultra ? .24 : 0), .2, .98);
    if (Math.random() < chance) {
      elements.enemySprite.classList.add("caught"); setBattleMessage("…"); await wait(650);
      setBattleMessage(`¡Genial! ${species.name} ha sido capturado.`); playJingle("capture");
      if (!state.caught.includes(enemy.id)) state.caught.push(enemy.id);
      if (state.dimension === "prism") state.caughtDimension = true;
      let message;
      if (state.team.length < MAX_TEAM) { state.team.push({ ...enemy, hp: enemy.maxHp }); message = `${species.name} se ha unido a tu equipo.`; }
      else message = "Tu equipo está completo; la captura queda registrada en la Pokédex.";
      if (state.questStage <= 1) state.questStage = 2;
      if (state.team.length >= MAX_TEAM) state.questStage = 3;
      await wait(900); setBattleMessage(message); await wait(950); finishBattle(); return;
    }
    setBattleMessage(`¡Oh, no! ${species.name} se ha escapado.`); playTone(130, .18, "sawtooth", .03); await wait(800); await enemyTurn();
  }

  function createThrownBall(ultra = false) {
    const ball = document.createElement("span"); ball.className = `thrown-ball ${ultra ? "ultra" : ""}`; ball.innerHTML = "<i></i>";
    elements.battleScreen.appendChild(ball); window.setTimeout(() => ball.remove(), 1100);
  }

  async function attemptRun() {
    if (!battle || battle.busy) return;
    if (battle.secretBattle) {
      setBattleMessage(`El laberinto ha cerrado la salida. Debes liberar a ${speciesOf(battle.enemy).name}.`);
      return;
    }
    setBattleBusy(true);
    if (Math.random() < clamp(.68 + (activePokemon().level - battle.enemy.level) * .06, .35, .96)) {
      setBattleMessage("¡Escapaste sin problemas!"); playTone(430, .1, "square", .025); await wait(700); finishBattle(); return;
    }
    setBattleMessage("¡No has podido escapar!"); await wait(650); await enemyTurn();
  }

  function finishBattle() {
    if (battle) setBattleBusy(false);
    battle = null; inputLocked = false;
    [elements.fightButton, elements.bagButton, elements.teamBattleButton, elements.runButton]
      .forEach((button) => { button.disabled = false; });
    elements.enemySprite.classList.remove("caught", "hit", "attacking", "inverted-secret"); elements.activeSprite.classList.remove("caught", "hit", "attacking");
    elements.movesMenu.classList.add("hidden"); elements.battleMenu.classList.remove("hidden"); showWorld(); saveGame();
  }

  function openTeam() {
    if (!state.started) return;
    closeBuildingEditorPanel(); closeInventoryPanel(); clearDirectionalInput(); renderTeam(); elements.teamDrawer.classList.add("open"); elements.teamDrawer.setAttribute("aria-hidden", "false"); elements.drawerScrim.classList.remove("hidden");
  }
  function closeTeam() { elements.teamDrawer.classList.remove("open"); elements.teamDrawer.setAttribute("aria-hidden", "true"); elements.drawerScrim.classList.add("hidden"); }

  function renderTeam() {
    const members = state.team.map((member, index) => {
      const species = speciesOf(member); const percent = clamp(member.hp / member.maxHp * 100, 0, 100); const active = index === state.activeTeamIndex;
      return `<article class="team-member ${active ? "active" : ""}">
        <img class="${member.inverted ? "inverted-member" : ""}" src="${iconUrl(member.id)}" alt="${species.name}" draggable="false" />
        <div class="member-info"><div><strong>${species.name}</strong><small>Nv. ${member.level}</small></div>
        <div class="member-hp"><i style="width:${percent}%;background:${hpColor(percent)}"></i></div><span class="member-status">${member.hp} / ${member.maxHp} PS · ${species.type}</span></div>
        <button type="button" data-team-index="${index}" ${(member.hp <= 0 || active || battle?.busy) ? "disabled" : ""}>${active ? "ACTIVO" : "ELEGIR"}</button></article>`;
    });
    for (let index = members.length; index < MAX_TEAM; index += 1) members.push('<div class="team-slot-empty">Espacio para un nuevo compañero</div>');
    elements.teamList.innerHTML = members.join("");
    elements.drawerCaughtCount.textContent = `${state.caught.length} / ${LOCAL_DEX_SIZE}`;
    elements.dexProgress.style.width = `${clamp(state.caught.length / LOCAL_DEX_SIZE * 100, 0, 100)}%`;
    $$('[data-team-index]').forEach((button) => button.addEventListener("click", () => selectTeamMember(Number(button.dataset.teamIndex))));
  }

  async function selectTeamMember(index) {
    if (!state.team[index] || state.team[index].hp <= 0 || index === state.activeTeamIndex) return;
    const previous = activePokemon(); state.activeTeamIndex = index; const next = activePokemon(); closeTeam();
    if (battle) { setBattleBusy(true); setBattleMessage(`¡${speciesOf(previous).name}, vuelve! ¡Adelante, ${speciesOf(next).name}!`); await wait(750); renderBattle(); await enemyTurn(); }
    else { renderHud(); saveGame(); showDialog([`${speciesOf(next).name} irá ahora al frente del equipo.`], "◇"); }
  }

  function toggleSound() {
    state.sound = !state.sound;
    if (!state.sound) {
      stopHorrorAudio();
      stopBackgroundMusic();
    }
    renderHud();
    if (state.sound) {
      playJingle("success");
      if (!elements.worldScreen.classList.contains("hidden") && state.started) startBackgroundMusic();
    }
    saveGame();
  }
  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioContext) { const AudioClass = window.AudioContext || window.webkitAudioContext; if (!AudioClass) return null; audioContext = new AudioClass(); }
    if (audioContext.state === "suspended") audioContext.resume(); return audioContext;
  }
  function playTone(frequency, duration = .08, wave = "square", volume = .025, delay = 0) {
    const context = ensureAudio(); if (!context) return;
    const oscillator = context.createOscillator(); const gain = context.createGain(); const start = context.currentTime + delay;
    oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + duration);
  }
  function playJingle(kind) {
    const jingles = { encounter: [220,330,440], success: [392,523,659], level: [440,554,659,880], capture: [523,659,784,1047], lose: [330,247,196] };
    (jingles[kind] || jingles.success).forEach((frequency, index) => playTone(frequency, .1, "square", .025, index * .09));
  }

  const MUSIC_FREQUENCIES = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51,
  };

  const POKEMON_MELODY_PATTERN = [
    ["E5", 0.25], ["G5", 0.25], ["C6", 0.5], ["B5", 0.25], ["A5", 0.25], ["G5", 0.5],
    ["E5", 0.25], ["G5", 0.25], ["C6", 0.5], ["B5", 0.25], ["A5", 0.25], ["B5", 0.25], ["C6", 0.25],
    ["D5", 0.25], ["G5", 0.25], ["B5", 0.5], ["A5", 0.25], ["G5", 0.25], ["F5", 0.5],
    ["E5", 0.25], ["G5", 0.25], ["C6", 0.5], ["B5", 0.25], ["A5", 0.25], ["G5", 0.25], ["A5", 0.25], ["B5", 0.25],
    ["C5", 0.25], ["E5", 0.25], ["G5", 0.5], ["E5", 0.25], ["G5", 0.25], ["C6", 0.5],
    ["B4", 0.25], ["D5", 0.25], ["G5", 0.5], ["D5", 0.25], ["G5", 0.25], ["B5", 0.5],
    ["A4", 0.25], ["C5", 0.25], ["E5", 0.5], ["C5", 0.25], ["E5", 0.25], ["A5", 0.5],
    ["G4", 0.25], ["A4", 0.25], ["C5", 0.5], ["F5", 0.25], ["E5", 0.25], ["D5", 0.5],
  ];

  const POKEMON_BASS_PATTERN = [
    ["C3", 3.0],
    ["G3", 3.0],
    ["A3", 3.0],
    ["F3", 3.0],
  ];

  const backgroundMusic = { enabled: false, masterGain: null, schedulerId: null, loopDuration: 12 };

  function scheduleBackgroundMusic() {
    if (!backgroundMusic.enabled || !state.sound || !audioContext) return;
    const startTime = audioContext.currentTime + 0.05;
    let t = startTime;
    POKEMON_MELODY_PATTERN.forEach(([note, duration]) => {
      const freq = MUSIC_FREQUENCIES[note];
      if (freq) playMusicTone(freq, t, duration * 0.95, "square", 0.038);
      t += duration;
    });
    t = startTime;
    POKEMON_BASS_PATTERN.forEach(([note, duration]) => {
      const freq = MUSIC_FREQUENCIES[note];
      if (freq) playMusicTone(freq * 0.5, t, duration * 0.95, "triangle", 0.055);
      t += duration;
    });
    backgroundMusic.loopDuration = POKEMON_MELODY_PATTERN.reduce((sum, [, d]) => sum + d, 0);
    backgroundMusic.schedulerId = window.setTimeout(scheduleBackgroundMusic, (backgroundMusic.loopDuration - 0.15) * 1000);
  }

  function playMusicTone(frequency, startTime, duration, waveType, volume) {
    if (!audioContext || !backgroundMusic.masterGain) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = waveType;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.linearRampToValueAtTime(volume * 0.65, startTime + duration * 0.6);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    oscillator.connect(gain);
    gain.connect(backgroundMusic.masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.05);
  }

  function startBackgroundMusic() {
    if (backgroundMusic.enabled || !state.sound) return;
    const context = ensureAudio();
    if (!context) return;
    audioContext = context;
    backgroundMusic.masterGain = context.createGain();
    backgroundMusic.masterGain.gain.value = 0.085;
    backgroundMusic.masterGain.connect(context.destination);
    backgroundMusic.enabled = true;
    scheduleBackgroundMusic();
  }

  function stopBackgroundMusic() {
    backgroundMusic.enabled = false;
    if (backgroundMusic.schedulerId) {
      window.clearTimeout(backgroundMusic.schedulerId);
      backgroundMusic.schedulerId = null;
    }
    if (backgroundMusic.masterGain) {
      try { backgroundMusic.masterGain.disconnect(); } catch (error) { /* already disconnected */ }
      backgroundMusic.masterGain = null;
    }
  }

  function keyToControl(key) {
    const normalized = key.toLowerCase();
    if (state.dimension === "prism") {
      return {
        arrowup: "up", w: "up", arrowdown: "down", s: "down",
        arrowleft: "left", arrowright: "right",
        a: "strafeLeft", d: "strafeRight", shift: "run",
      }[normalized];
    }
    return {
      arrowup: "up", w: "up", arrowdown: "down", s: "down",
      arrowleft: "left", a: "left", arrowright: "right", d: "right", shift: "run",
    }[normalized];
  }

  function handleKeyDown(event) {
    const control = keyToControl(event.key);
    if (control) { event.preventDefault(); input[control] = true; }
    if (!elements.dialogBox.classList.contains("hidden")) {
      if (["Enter", " ", "e", "E"].includes(event.key) && !event.repeat) advanceDialog();
      return;
    }
    if (state.dimension === "prism" && ["f", "F", " "].includes(event.key) && !event.repeat) {
      event.preventDefault();
      useFlashlight();
    }
    if ((event.key === "e" || event.key === "E" || event.key === "Enter") && !event.repeat) interact();
    if ((event.key === "m" || event.key === "M") && !event.repeat) elements.teamDrawer.classList.contains("open") ? closeTeam() : openTeam();
    if (event.key === "Escape") { closeTeam(); closeBuildingEditorPanel(); closeInventoryPanel(); }
  }

  function handleKeyUp(event) { const control = keyToControl(event.key); if (control) input[control] = false; }

  function bindTouchControl(button) {
    const control = button.dataset.control;
    const press = (event) => { event.preventDefault(); input[control] = true; };
    const release = (event) => { event.preventDefault(); input[control] = false; };
    button.addEventListener("pointerdown", press); button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release); button.addEventListener("pointerleave", release);
  }

  function bindEvents() {
    elements.newGameButton.addEventListener("click", startNewGame); elements.continueButton.addEventListener("click", continueGame);
    elements.closeStarter.addEventListener("click", () => elements.starterModal.classList.add("hidden")); elements.dialogNext.addEventListener("click", advanceDialog);
    elements.teamButton.addEventListener("click", openTeam); elements.closeTeamButton.addEventListener("click", closeTeam); elements.drawerScrim.addEventListener("click", closeTeam);
    elements.saveButton.addEventListener("click", () => { closeTeam(); saveGame(true); });
    elements.resetButton.addEventListener("click", () => { if (window.confirm("¿Quieres borrar la partida guardada y empezar de nuevo?")) { window.localStorage.removeItem(SAVE_KEY); window.location.reload(); } });
    elements.soundButton.addEventListener("click", toggleSound);
    elements.fullscreenButton.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    elements.inventoryButton.addEventListener("click", () => openInventory(false));
    elements.closeInventory.addEventListener("click", closeInventoryPanel);
    elements.inventoryScrim.addEventListener("click", closeInventoryPanel);
    elements.buildingEditorButton.addEventListener("click", openBuildingEditor);
    elements.closeBuildingEditor.addEventListener("click", closeBuildingEditorPanel);
    elements.editorScrim.addEventListener("click", closeBuildingEditorPanel);
    $$('[data-tile-type]').forEach((button) => button.addEventListener("click", () => {
      selectedTileType = button.dataset.tileType; updateTileEditorInfo();
    }));
    elements.copyTileButton.addEventListener("click", async () => {
      if (!selectedMapTile) return;
      const text = `C${selectedMapTile.col}, F${selectedMapTile.row}: ${mapTileType(selectedMapTile.col, selectedMapTile.row)}`;
      try { await navigator.clipboard.writeText(text); elements.tileEditorHint.textContent = `Copiado: ${text}`; }
      catch (error) { elements.tileEditorHint.textContent = text; }
    });
    elements.resetTileMap.addEventListener("click", () => {
      if (!window.confirm("¿Restaurar todas las casillas al mapa inicial?")) return;
      tileOverrides.clear(); saveMapTiles(); selectedMapTile = null; updateTileEditorInfo();
    });
    elements.canvas.addEventListener("click", handleMapEditorClick);
    elements.fightButton.addEventListener("click", () => { if (!battle || battle.busy) return; elements.battleMenu.classList.add("hidden"); elements.movesMenu.classList.remove("hidden"); renderMoves(); });
    elements.movesBack.addEventListener("click", () => { elements.movesMenu.classList.add("hidden"); elements.battleMenu.classList.remove("hidden"); });
    elements.bagButton.addEventListener("click", () => openInventory(true)); elements.runButton.addEventListener("click", attemptRun); elements.teamBattleButton.addEventListener("click", openTeam);
    document.addEventListener("keydown", handleKeyDown); document.addEventListener("keyup", handleKeyUp); window.addEventListener("blur", clearDirectionalInput);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      clearDirectionalInput();
      if (state.started) saveGame();
    });
    window.addEventListener("pagehide", () => { if (state.started) saveGame(); });
    $$('[data-control]').forEach(bindTouchControl); $$('[data-action]').forEach((button) => button.addEventListener("click", primaryAction));
  }

  function initialize() {
    mazeDefinition = generateMaze();
    initializeMapTiles(); renderStarters(); bindEvents(); loadAssets();
    document.documentElement.dataset.cityMapReady = "loading";
    const hasSave = loadGame(); elements.continueButton.classList.toggle("hidden", !hasSave);
    updateFullscreenButton(); renderHud(); updateAreaLabel(); updateInteractPrompt(); window.requestAnimationFrame(gameLoop);
    window.__pokemonCityDebug = Object.freeze({
      tileType: (col, row) => mapTileType(Number(col), Number(row)),
      canOccupy: (x, y) => cityMapCanOccupy(Number(x), Number(y)),
      grid: { cols: Math.ceil(WORLD_WIDTH / CITY_MAP.tileSize), rows: Math.ceil(WORLD_HEIGHT / CITY_MAP.tileSize), tileSize: CITY_MAP.tileSize },
    });
    document.documentElement.dataset.cityGrid = `${Math.ceil(WORLD_WIDTH / CITY_MAP.tileSize)}x${Math.ceil(WORLD_HEIGHT / CITY_MAP.tileSize)}@${CITY_MAP.tileSize}`;
    document.documentElement.dataset.spawnOpen = String(cityMapCanOccupy(NORMAL_START.x, NORMAL_START.y));
    document.documentElement.dataset.boundaryOpen = String(cityMapCanOccupy(16, 16));
    document.documentElement.dataset.centerDoor = mapTileType(65, 33);
  }

  initialize();
})();
