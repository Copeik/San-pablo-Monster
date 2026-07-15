(() => {
  "use strict";

  const SAVE_KEY = "pokemon-city-save-v3";
  const MAP_EDIT_KEY = "pokemon-city-tile-overrides-v5";
  const MAP_REVISION = 14;
  const CITY_MAP = window.CITY_MAP_CONFIG;
  const BASE_CITY_NPCS = Array.isArray(CITY_MAP.npcs) ? CITY_MAP.npcs.map((npc) => ({ ...npc })) : [];
  const BASE_CITY_ENTRANCES = Array.isArray(CITY_MAP.entrances)
    ? CITY_MAP.entrances.map((entrance) => ({ ...entrance }))
    : (Array.isArray(CITY_MAP.doors) ? CITY_MAP.doors.map((entrance) => ({ ...entrance })) : []);

  function runtimeEntityId(value, fallback = "") {
    const normalized = String(value || fallback).trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
    return normalized || fallback;
  }

  function normalizeRuntimeNpc(value, fallbackId = "") {
    if (!value || typeof value !== "object") return null;
    const id = runtimeEntityId(value.id, fallbackId);
    const col = Math.floor(Number(value.col));
    const row = Math.floor(Number(value.row));
    if (!id || !Number.isFinite(col) || !Number.isFinite(row)) return null;
    const direction = ["up", "down", "left", "right"].includes(value.direction) ? value.direction : "down";
    const npc = {
      ...value,
      id,
      col: Math.max(0, Math.min(78, col)),
      row: Math.max(0, Math.min(78, row)),
      direction,
      name: String(value.name || "NPC").slice(0, 80),
      sprite: String(value.sprite || "guide").slice(0, 80),
      lines: (Array.isArray(value.lines) ? value.lines : [value.lines])
        .filter((line) => typeof line === "string" && line.trim())
        .slice(0, 12)
        .map((line) => line.slice(0, 500)),
    };
    const destination = value.patrol?.to;
    const patrolSpeed = Number(value.patrol?.tilesPerSecond);
    const patrolDestination = Array.isArray(destination) ? destination.map(Number) : [];
    if (patrolDestination.length === 2 && patrolDestination.every(Number.isFinite) && Number.isFinite(patrolSpeed) && patrolSpeed > 0) {
      npc.patrol = {
        to: [
          Math.max(0, Math.min(78, Math.floor(patrolDestination[0]))),
          Math.max(0, Math.min(78, Math.floor(patrolDestination[1]))),
        ],
        tilesPerSecond: Math.max(.1, Math.min(6, patrolSpeed)),
      };
    } else delete npc.patrol;
    return npc;
  }

  function normalizeRuntimeEntrance(value, fallbackId = "") {
    if (!value || typeof value !== "object") return null;
    const col = Math.floor(Number(value.col));
    const row = Math.floor(Number(value.row));
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    const fallback = runtimeEntityId(
      `entrance-${value.action || "transition"}-${value.npc || value.label || `${col}-${row}`}`,
      `entrance-${col}-${row}`,
    );
    const id = runtimeEntityId(value.id, fallbackId || fallback);
    if (!id) return null;
    const targetX = Number(value.targetX);
    const targetY = Number(value.targetY);
    return {
      ...value,
      id,
      col: Math.max(0, Math.min(78, col)),
      row: Math.max(0, Math.min(78, row)),
      label: String(value.label || "Entrada").slice(0, 100),
      action: String(value.action || (value.targetMap ? "transition" : "closed")).toLowerCase(),
      targetMap: value.targetMap == null ? null : String(value.targetMap).slice(0, 80),
      targetX: Number.isFinite(targetX) ? targetX : null,
      targetY: Number.isFinite(targetY) ? targetY : null,
      targetDirection: ["up", "down", "left", "right"].includes(value.targetDirection) ? value.targetDirection : "down",
      effect: ["fade", "flash", "none"].includes(value.effect) ? value.effect : "fade",
      linkedAssetId: value.linkedAssetId == null ? null : runtimeEntityId(value.linkedAssetId),
    };
  }

  function normalizeRuntimeEvent(value, fallbackId = "") {
    if (!value || typeof value !== "object") return null;
    const col = Math.floor(Number(value.col));
    const row = Math.floor(Number(value.row));
    const id = runtimeEntityId(value.id, fallbackId);
    if (!id || !Number.isFinite(col) || !Number.isFinite(row)) return null;
    const type = ["dialogue", "thought", "vibration", "teleport", "transition"].includes(value.type)
      ? value.type
      : "thought";
    const targetX = Number(value.targetX);
    const targetY = Number(value.targetY);
    return {
      ...value,
      id,
      col: Math.max(0, Math.min(78, col)),
      row: Math.max(0, Math.min(78, row)),
      label: String(value.label || "Evento").slice(0, 100),
      type,
      trigger: value.trigger === "step" ? "step" : "interact",
      message: Array.isArray(value.message)
        ? value.message.filter((line) => typeof line === "string").slice(0, 12).map((line) => line.slice(0, 500))
        : String(value.message || "").slice(0, 1000),
      targetMap: value.targetMap == null ? null : String(value.targetMap).slice(0, 80),
      targetX: Number.isFinite(targetX) ? targetX : null,
      targetY: Number.isFinite(targetY) ? targetY : null,
      targetDirection: ["up", "down", "left", "right"].includes(value.targetDirection) ? value.targetDirection : "down",
      duration: Math.max(80, Math.min(5000, Number(value.duration) || 440)),
      intensity: Math.max(.1, Math.min(4, Number(value.intensity) || 1)),
      effect: ["fade", "flash", "none"].includes(value.effect) ? value.effect : (type === "transition" ? "fade" : "none"),
      once: Boolean(value.once),
    };
  }

  function buildRuntimeNpcs(editorData = {}) {
    const records = new Map();
    BASE_CITY_NPCS.forEach((npc, index) => {
      const normalized = normalizeRuntimeNpc(npc, `npc-base-${index + 1}`);
      if (normalized) records.set(normalized.id, normalized);
    });
    Object.entries(editorData.npcOverrides && typeof editorData.npcOverrides === "object" ? editorData.npcOverrides : {})
      .forEach(([id, patch]) => {
        const normalized = normalizeRuntimeNpc({ ...(records.get(id) || {}), ...(patch || {}), id }, id);
        if (normalized) records.set(id, normalized);
      });
    (Array.isArray(editorData.hiddenNpcs) ? editorData.hiddenNpcs : []).forEach((id) => records.delete(String(id)));
    (Array.isArray(editorData.addedNpcs) ? editorData.addedNpcs : []).forEach((npc, index) => {
      const normalized = normalizeRuntimeNpc(npc, `npc-editor-${index + 1}`);
      if (normalized) records.set(normalized.id, normalized);
    });
    return [...records.values()];
  }

  function buildRuntimeEntrances(editorData = {}) {
    const records = new Map();
    BASE_CITY_ENTRANCES.forEach((entrance, index) => {
      const normalized = normalizeRuntimeEntrance(entrance);
      if (normalized) records.set(normalized.id, normalized);
    });
    (Array.isArray(editorData.entrances) ? editorData.entrances : []).forEach((entrance, index) => {
      const fallbackId = runtimeEntityId(entrance?.id, `entrance-editor-${index + 1}`);
      if (entrance?.enabled === false) {
        records.delete(fallbackId);
        return;
      }
      const normalized = normalizeRuntimeEntrance({ ...(records.get(fallbackId) || {}), ...entrance, id: fallbackId }, fallbackId);
      if (normalized) records.set(normalized.id, normalized);
    });
    return [...records.values()];
  }

  function buildRuntimeEvents(editorData = {}) {
    const source = Array.isArray(editorData.events) ? editorData.events : [];
    return source.map((event, index) => normalizeRuntimeEvent(event, `event-${index + 1}`)).filter(Boolean);
  }

  const initialEditorData = window.CITY_MAP_EDITOR_DATA || {};
  const cityNpcs = buildRuntimeNpcs(initialEditorData);
  const cityEntrances = buildRuntimeEntrances(initialEditorData);
  const cityEvents = buildRuntimeEvents(initialEditorData);
  const BASE_VIEW_HEIGHT = 624;
  const MAX_RENDER_WIDTH = 3840;
  const MAX_RENDER_HEIGHT = 2160;
  const SPRITE_CELL_SIZE = 64;
  const PLAYER_HEAD_LOCK_HEIGHT = 36;
  const NPC_COLLISION_RADIUS = 25;
  const npcPatrolStates = new Map();
  const PLAYER_LEG_MASKS = {
    down: [{ x: 20, y: 50, width: 24, height: 10 }],
    left: [{ x: 18, y: 51, width: 28, height: 9 }],
    right: [{ x: 17, y: 51, width: 28, height: 9 }],
    up: [{ x: 20, y: 51, width: 24, height: 9 }],
  };
  const PLAYER_SUPPORT_ROW = 59;
  let VIEW_WIDTH = 960;
  let VIEW_HEIGHT = BASE_VIEW_HEIGHT;
  const PIXELS_PER_METER = 8;
  const WORLD_WIDTH = CITY_MAP.width;
  const WORLD_HEIGHT = CITY_MAP.height;
  const PRISM_WIDTH = 2100;
  const PRISM_HEIGHT = 2200;
  const MAX_TEAM = 3;
  const LOCAL_DEBUG_SPAWN = (() => {
    if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)) return null;
    const raw = new URLSearchParams(window.location.search).get("debugSpawn");
    if (!raw) return null;
    const [rawX, rawY, rawDirection = "down"] = raw.split(",");
    const x = Number(rawX); const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const direction = ["up", "down", "left", "right"].includes(rawDirection) ? rawDirection : "down";
    return {
      x: Math.max(35, Math.min(CITY_MAP.width - 35, x)),
      y: Math.max(45, Math.min(CITY_MAP.height - 30, y)),
      direction,
    };
  })();
  const LOCAL_DEBUG_BATTLE = (() => {
    if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)) return null;
    const params = new URLSearchParams(window.location.search);
    const teamId = Number(params.get("debugTeam"));
    const teamLevel = clampDebugLevel(params.get("debugLevel"));
    const wildId = Number(params.get("debugWild"));
    if (!Number.isInteger(teamId) && !Number.isInteger(wildId)) return null;
    return { teamId, teamLevel, wildId };
  })();
  const LOCAL_DEBUG_PRISM = (() => {
    if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)) return null;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("debugPrism");
    if (!target) return null;
    return {
      target: ["start", "market", "market_view", "goal"].includes(target) ? target : "start",
      money: Math.max(0, Math.floor(Number(params.get("debugMoney")) || 2500)),
    };
  })();
  const LOCAL_DEBUG_FRAGMENT_CINEMATIC = new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)
    && new URLSearchParams(window.location.search).has("debugFragmentCinematic");
  const LOCAL_DEBUG_PLAYER_ATLAS = new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)
    && new URLSearchParams(window.location.search).has("debugPlayerAtlas");
  const LOCAL_DEBUG_VOICE = new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)
    ? new URLSearchParams(window.location.search).get("debugVoice")
    : "";
  function clampDebugLevel(value) { return Math.max(1, Math.min(50, Number(value) || 5)); }
  const NORMAL_START = { ...(LOCAL_DEBUG_SPAWN || CITY_MAP.spawn) };
  const INITIAL_PORTAL_DOOR = cityEntrances.find((entrance) => entrance.action === "prism");
  const INITIAL_PORTAL_POSITION = INITIAL_PORTAL_DOOR
    ? { x: (INITIAL_PORTAL_DOOR.col + .5) * CITY_MAP.tileSize, y: (INITIAL_PORTAL_DOOR.row + .5) * CITY_MAP.tileSize }
    : { x: 1250, y: 1110 };
  const MAINTENANCE_ROOM = { x: 720, y: 560, w: 660, h: 520 };
  const MAINTENANCE_EXIT = { x: 1050, y: 1010, radius: 62 };
  const MAINTENANCE_TERMINAL = { x: 1050, y: 650, radius: 58 };
  const MAINTENANCE_OBSTACLES = [
    { x: 770, y: 625, w: 92, h: 280 },
    { x: 1238, y: 625, w: 92, h: 280 },
    { x: 935, y: 740, w: 230, h: 78 },
  ];

  /* Interiores jugables: una sola geometría de sala para edificios y una ruta
     silvestre más grande con encuentros. Las coordenadas están en el espacio
     del mundo (px) y se dibujan con la misma cámara que el mapa de la ciudad. */
  const INDOOR_ROOM = { x: 40, y: 30, w: 880, h: 560, wall: 30 };
  const INDOOR_SPAWN = { x: INDOOR_ROOM.x + INDOOR_ROOM.w / 2, y: INDOOR_ROOM.y + INDOOR_ROOM.h - 54 };
  const INDOOR_NPC = { x: INDOOR_ROOM.x + INDOOR_ROOM.w / 2, y: INDOOR_ROOM.y + 120, radius: 46 };
  const INDOOR_EXIT = { x: INDOOR_SPAWN.x, y: INDOOR_SPAWN.y, radius: 42 };

  const ROUTE_ROOM = { x: 20, y: 20, w: 920, h: 584, wall: 22 };
  const ROUTE_SPAWN = { x: 460, y: ROUTE_ROOM.y + ROUTE_ROOM.h - 54 };
  const ROUTE_EXIT = { x: ROUTE_SPAWN.x, y: ROUTE_SPAWN.y, radius: 46 };
  const ROUTE_GRASS = [
    { x: 80, y: 120, w: 280, h: 220 },
    { x: 460, y: 100, w: 280, h: 240 },
    { x: 720, y: 140, w: 180, h: 220 },
    { x: 160, y: 380, w: 260, h: 180 },
    { x: 540, y: 360, w: 300, h: 200 },
    { x: 820, y: 420, w: 90, h: 150 },
  ];
  const ROUTE_BLOCKED = [
    { x: 380, y: 90, w: 60, h: 60 }, { x: 740, y: 320, w: 70, h: 70 },
    { x: 150, y: 280, w: 50, h: 50 }, { x: 600, y: 470, w: 64, h: 64 },
    { x: 820, y: 420, w: 70, h: 90 },
  ];
  const ROUTE_POND = { x: 350, y: 410, w: 150, h: 90 };
  const ROUTE_WILD_TABLE = [
    { id: 9601, weight: 18 }, { id: 9701, weight: 18 }, { id: 9001, weight: 14 },
    { id: 9101, weight: 12 }, { id: 9501, weight: 12 }, { id: 9201, weight: 10 },
    { id: 9301, weight: 9 }, { id: 9401, weight: 7 }, { id: 9602, weight: 4 },
    { id: 9702, weight: 4 }, { id: 9202, weight: 3 }, { id: 9803, weight: 7 },
    { id: 9806, weight: 5 }, { id: 9811, weight: 7 },
  ];

  const INTERIOR_PALETTES = {
    center: { floor: "#f3d9da", floorAlt: "#ecc6c8", wall: "#cc504a", accent: "#ffe08a", label: "CENTRO POKÉMON" },
    mart: { floor: "#cfe0ea", floorAlt: "#bfd3e0", wall: "#3f6f9c", accent: "#f4d35e", label: "POKÉ MART" },
    lab: { floor: "#e4ead6", floorAlt: "#d6dec4", wall: "#5a8a52", accent: "#9ad1f0", label: "LABORATORIO POKÉMON" },
    house: { floor: "#d9c39c", floorAlt: "#cdb088", wall: "#7a5230", accent: "#e7c86a", label: "CASA" },
  };

  const NPC_DEFS = {
    nurse: { spriteIndex: 5, sprite: "npc-01-nurse", layout: "clinic", color: "#d96fae", name: "Enfermera", lines: [] },
    clerk: { spriteIndex: 3, sprite: "npc-02-shopkeeper", layout: "shop", color: "#4f8fc3", name: "Dependiente", lines: [] },
    professor: { spriteIndex: 1, sprite: "npc-03-professor", layout: "lab", color: "#8a8d8f", name: "Investigador", lines: [] },
    abuela: { spriteIndex: 0, sprite: "npc-04-grandmother", layout: "cozy", color: "#9b6ad0", name: "Abuela Lola", lines: ["Tu equipo está precioso. Come poco, combate mucho y deja pelos en el sofá.", "La Galería Jazmín está al este. Di que vas de mi parte; no servirá de nada, pero suena importante."] },
    nino: { spriteIndex: 6, sprite: "npc-05-child", layout: "playroom", color: "#e0a23a", name: "Niño Teo", lines: ["¡Mi Moskito es el más fuerte del barrio! El barrio incluye esta habitación.", "Busco monstruos raros en el Jardín Tesalónica. De momento solo encontré un calcetín raro."] },
    pescador: { spriteIndex: 3, sprite: "npc-06-fisher", layout: "coastal", color: "#3f7fae", name: "Pescador Berto", lines: ["Hoy solo ha picado una bota. Tiene buena Defensa, pero pésimo Ataque.", "Voy a Tesalónica por los Pokémon de Agua y por fingir que entiendo el viento."] },
    jubilado: { spriteIndex: 1, sprite: "npc-07-grandfather", layout: "study", color: "#8a8d8f", name: "Don Ramón", lines: ["Conozco cada calle desde antes del minimapa. Nos perdíamos con dignidad.", "En la UNED investigan señales extrañas. Yo digo que es el wifi."] },
    estudiante: { spriteIndex: 2, sprite: "npc-08-student", layout: "study", color: "#4b9b6a", name: "Estudiante Ana", lines: ["Estudio para líder de gimnasio. La asignatura más difícil es posar sin parpadear.", "Fuego gana a Planta, Agua a Fuego y el sueño gana a mis apuntes."] },
    comerciante: { spriteIndex: 4, sprite: "npc-09-merchant", layout: "cozy", color: "#c75a4b", name: "Comerciante Poli", lines: ["Mis ofertas son tan buenas que a veces intento comprármelas yo mismo.", "Los combates dan dinero. Mis discursos comerciales, por desgracia, no."] },
    artista: { spriteIndex: 5, sprite: "npc-10-artist", layout: "studio", color: "#d96fae", name: "Artista Lua", lines: ["Retrato a los monstruos salvajes. Los Sombrañol siempre salen movidos y ofendidos.", "Mi estilo es hiperrealismo pixelado. Cuantos menos píxeles, más caro."] },
    deportista: { spriteIndex: 7, sprite: "npc-11-athlete", layout: "playroom", color: "#5aa0c8", name: "Deportista Max", lines: ["Corro todas las mañanas. Algunas incluso hacia delante.", "Usa SHIFT para correr; úsalo con moderación si acabas de comer."] },
    guarderia: { spriteIndex: 8, sprite: "npc-12-caretaker", layout: "cozy", color: "#e0b34a", name: "Cuidadora Veva", lines: ["Cuido a todos los Pokémon del barrio. Ellos creen que yo soy la mascota.", "Cuando completes el equipo, vuelve. Tengo seis toallas y ninguna esperanza."] },
    jardinera: { spriteIndex: 9, sprite: "npc-13-gardener", layout: "studio", color: "#6aa84f", name: "Jardinera Sol", lines: ["Hablo con las plantas. Ellas responden con fotosíntesis pasivo-agresiva.", "La hierba alta esconde especies distintas y, en mi caso, las tijeras."] },
  };

  const BUILDING_SHEET_URL = "https://www.spriters-resource.com/media/assets/4/3849.png?updated=1755472417";
  const PLAYER_SHEET_URL = "assets/sprites/protagonist-walk.png";
  const NPC_SHEET_URL = "assets/sprites/hgss-npc-idle.png";
  const GUIDE_NPC_SHEET_URL = "assets/sprites/npc-guide-walk.png";
  const DOCTOR_POTATO_PORTRAIT_URL = "assets/portraits/doctor-potato.png";
  const DOCTOR_POTATO_THEME_URL = "assets/audio/patata-de-barrio.mp3";
  const MICROPHONE_ACCESS_ENABLED = false;
  const VOICE_NPC_ENABLED = false;
  const VOICE_NPC_SILENCE_MS = 3000;
  const VOICE_NPC_CHASE_SPEED = 142;
  const VOICE_NPC_FALLBACK_REPLIES = [
    (topic) => `Quillo, tú dices «${topic}» y esa barriga tuya ya está pidiendo turno pa responder antes que tú.`,
    (topic) => `Miarma, con «${topic}» te has lucío menos que el sol rebotando en esa calva de rotonda.`,
    (topic) => `Illo, «${topic}» suena valiente hasta que aparece tu cinturón pidiendo auxilio debajo de la barriga.`,
    (topic) => `Picha, repite «${topic}» mirando de frente, que tu papada ha llegao a la discusión cinco minutos antes.`,
    (topic) => `Arma mía, «${topic}» no impresiona ni al reflejo que llevas aparcao en la coronilla.`,
    (topic) => `Quillo, guarda «${topic}» pa cuando tu barriga deje de entrar en las conversaciones antes que tú.`,
  ];
  const VOICE_NPC_WAKE_REPLIES = [
    "¿Qué quieres ahora, quillo? Acércate, que desde tu calva me está dando el sol en los ojos.",
    "¡Otra vez tú, miarma! Ven despacio, no vaya a coger inercia esa barriga y tengamos una desgracia.",
    "¡Illo, ya te he oído! Entre tu voz y el brillo de tu coronilla no hay quien se esconda.",
    "¿Me llamas a mí, picha? Pues sujeta ese cinturón y ven a discutir como un hombre.",
    "¡Arma mía, qué pesao! Tu papada ha llegao antes que el resto de la frase.",
  ];
  const VOICE_NPC_SILENCE_REPLIES = [
    "Tres segundos callao, quillo; se te habrá quedao la respuesta atrapada debajo de la papada.",
    "¿Ya está, miarma? Mucha barriga pa tan poquita discusión.",
    "Se acabó el ruido, illo; ahora solo oigo el viento silbando por esa azotea sin pelo.",
    "Te has quedao mudo, picha; vuelve a decir Manolín cuando encuentres la réplica entre los michelines.",
    "Ea, me aburro; llámame otra vez cuando tu calva tenga algo nuevo que reflejar.",
  ];
  const NPC_IMPORTED_SPRITE_URLS = Object.freeze({
    "nino-sol": "assets/sprites/npcs/nino-sol-walk.png",
    "chica-lazo": "assets/sprites/npcs/chica-lazo-walk.png",
    "skater-verde": "assets/sprites/npcs/skater-verde-walk.png",
    mochilera: "assets/sprites/npcs/mochilera-walk.png",
    campesino: "assets/sprites/npcs/campesino-walk.png",
    "nino-polo": "assets/sprites/npcs/nino-polo-walk.png",
    "nina-turquesa": "assets/sprites/npcs/nina-turquesa-walk.png",
    "skater-capucha": "assets/sprites/npcs/skater-capucha-walk.png",
    "chica-mochila": "assets/sprites/npcs/chica-mochila-walk.png",
    hortelano: "assets/sprites/npcs/hortelano-walk.png",
    "camarera-azul": "assets/sprites/npcs/camarera-azul-walk.png",
    "camarero-bandeja": "assets/sprites/npcs/camarero-bandeja-walk.png",
    bailaora: "assets/sprites/npcs/bailaora-walk.png",
    "abuelo-cana": "assets/sprites/npcs/abuelo-cana-walk.png",
    "abuela-morada": "assets/sprites/npcs/abuela-morada-walk.png",
  });
  const NPC_ROSTER_SHEET_URLS = Object.freeze({
    ...Object.fromEntries([
    "nurse", "shopkeeper", "professor", "grandmother", "child", "fisher", "grandfather", "student", "merchant", "artist",
    "athlete", "caretaker", "gardener", "officer", "chef", "mechanic", "musician", "cyclist", "hiker", "office-worker",
    "teen-girl", "teen-boy", "baker", "builder", "doctor", "vendor", "librarian", "tourist", "dancer", "ranger",
  ].map((role, index) => {
    const id = `npc-${String(index + 1).padStart(2, "0")}-${role}`;
    return [id, `assets/sprites/npcs/${id}-walk.png`];
    })),
    ...NPC_IMPORTED_SPRITE_URLS,
    "doctor-potato": "assets/sprites/npcs/doctor-potato-walk.png",
  });
  const CUSTOM_POKEMON_ASSETS = Object.freeze({
    4: { front: "assets/pokemon/braspy-line/braspy-front.png", back: "assets/pokemon/braspy-line/braspy-back.png" },
    5: { front: "assets/pokemon/braspy-line/ascuero-front.png", back: "assets/pokemon/braspy-line/ascuero-back.png" },
    6: { front: "assets/pokemon/braspy-line/volcazote-front.png", back: "assets/pokemon/braspy-line/volcazote-back.png" },
    9001: { front: "assets/pokemon/petrillo-line/petrillo-front.png", back: "assets/pokemon/petrillo-line/petrillo-back.png" },
    9002: { front: "assets/pokemon/petrillo-line/musgolem-front.png", back: "assets/pokemon/petrillo-line/musgolem-back.png" },
    9003: { front: "assets/pokemon/petrillo-line/terravordeo-front.png", back: "assets/pokemon/petrillo-line/terravordeo-back.png" },
    9101: { front: "assets/pokemon/peyote-line/peyote-front.png", back: "assets/pokemon/peyote-line/peyote-back.png" },
    9102: { front: "assets/pokemon/peyote-line/prensalito-front.png", back: "assets/pokemon/peyote-line/prensalito-back.png" },
    9201: { front: "assets/pokemon/dracoscama-line/criascama-front.png", back: "assets/pokemon/dracoscama-line/criascama-back.png" },
    9202: { front: "assets/pokemon/dracoscama-line/aliscama-front.png", back: "assets/pokemon/dracoscama-line/aliscama-back.png" },
    9203: { front: "assets/pokemon/dracoscama-line/dracoscama-front.png", back: "assets/pokemon/dracoscama-line/dracoscama-back.png" },
    9301: { front: "assets/pokemon/luminai-line/luminio-front.png", back: "assets/pokemon/luminai-line/luminio-back.png" },
    9302: { front: "assets/pokemon/luminai-line/lunaria-front.png", back: "assets/pokemon/luminai-line/lunaria-back.png" },
    9303: { front: "assets/pokemon/luminai-line/lusdria-front.png", back: "assets/pokemon/luminai-line/lusdria-back.png" },
    9401: { front: "assets/pokemon/sombranol-line/sombranol-front.png", back: "assets/pokemon/sombranol-line/sombranol-back.png" },
    9402: { front: "assets/pokemon/sombranol-line/penumbra-front.png", back: "assets/pokemon/sombranol-line/penumbra-back.png" },
    9403: { front: "assets/pokemon/sombranol-line/tenebrantor-front.png", back: "assets/pokemon/sombranol-line/tenebrantor-back.png" },
    9501: { front: "assets/pokemon/chispin-line/chispin-front.png", back: "assets/pokemon/chispin-line/chispin-back.png" },
    9502: { front: "assets/pokemon/chispin-line/chisporc-front.png", back: "assets/pokemon/chispin-line/chisporc-back.png" },
    9601: { front: "assets/pokemon/moskito-line/moskito-front.png", back: "assets/pokemon/moskito-line/moskito-back.png" },
    9602: { front: "assets/pokemon/moskito-line/zumkito-front.png", back: "assets/pokemon/moskito-line/zumkito-back.png" },
    9603: { front: "assets/pokemon/moskito-line/sanguento-front.png", back: "assets/pokemon/moskito-line/sanguento-back.png" },
    9701: { front: "assets/pokemon/alua-line/alua-front.png", back: "assets/pokemon/alua-line/alua-back.png" },
    9702: { front: "assets/pokemon/alua-line/capulua-front.png", back: "assets/pokemon/alua-line/capulua-back.png" },
    9703: { front: "assets/pokemon/alua-line/maripulua-front.png", back: "assets/pokemon/alua-line/maripulua-back.png" },
    9801: { front: "assets/pokemon/rubrisma-line/rubrisma-front.png", back: "assets/pokemon/rubrisma-line/rubrisma-back.png" },
    9802: { front: "assets/pokemon/rubrisma-line/azuranima-front.png", back: "assets/pokemon/rubrisma-line/azuranima-back.png" },
    9803: { front: "assets/pokemon/serranin-line/serranin-front.png", back: "assets/pokemon/serranin-line/serranin-back.png" },
    9804: { front: "assets/pokemon/serranin-line/aliolomo-front.png", back: "assets/pokemon/serranin-line/aliolomo-back.png" },
    9805: { front: "assets/pokemon/cajhumo-line/cajhumo-front.png", back: "assets/pokemon/cajhumo-line/cajhumo-back.png" },
    9806: { front: "assets/pokemon/rebehielo-line/rebehielo-front.png", back: "assets/pokemon/rebehielo-line/rebehielo-back.png" },
    9807: { front: "assets/pokemon/rebehielo-line/picorneo-front.png", back: "assets/pokemon/rebehielo-line/picorneo-back.png" },
    9808: { front: "assets/pokemon/azahin-line/azahin-front.png", back: "assets/pokemon/azahin-line/azahin-back.png" },
    9809: { front: "assets/pokemon/azahin-line/naranjil-front.png", back: "assets/pokemon/azahin-line/naranjil-back.png" },
    9810: { front: "assets/pokemon/azahin-line/citrayo-front.png", back: "assets/pokemon/azahin-line/citrayo-back.png" },
    9811: { front: "assets/pokemon/barbito-line/barbito-front.png", back: "assets/pokemon/barbito-line/barbito-back.png" },
    9812: { front: "assets/pokemon/barbito-line/barbalto-front.png", back: "assets/pokemon/barbito-line/barbalto-back.png" },
    9813: { front: "assets/pokemon/ascuero-line/ascuero-front.png", back: "assets/pokemon/ascuero-line/ascuero-back.png" },
    9814: { front: "assets/pokemon/ascuero-line/tolebrasa-front.png", back: "assets/pokemon/ascuero-line/tolebrasa-back.png" },
    9815: { front: "assets/pokemon/ascuero-line/matallama-front.png", back: "assets/pokemon/ascuero-line/matallama-back.png" },
  });
  const CUSTOM_POKEMON_MOTIONS = Object.freeze({
    9001: "petrillo",
    9002: "musgolem",
    9003: "terravordeo",
    9101: "peyote",
    9102: "prensalito",
    9201: "criascama",
    9202: "aliscama",
    9203: "dracoscama",
    9301: "luminio",
    9302: "lunaria",
    9303: "lusdria",
    9401: "sombranol",
    9402: "penumbra",
    9403: "tenebrantor",
    9501: "chispin",
    9502: "chisporc",
    9601: "moskito",
    9602: "zumkito",
    9603: "sanguento",
    9701: "alua",
    9702: "capulua",
    9703: "maripulua",
    9801: "rubrisma",
    9802: "azuranima",
    9803: "serranin",
    9804: "aliolomo",
    9805: "cajhumo",
    9806: "rebehielo",
    9807: "picorneo",
    9808: "azahin",
    9809: "naranjil",
    9810: "citrayo",
    9811: "barbito",
    9812: "barbalto",
    9813: "ascuero",
    9814: "tolebrasa",
    9815: "matallama",
  });
  const CUSTOM_ATTACK_DURATION = 3000;
  const CUSTOM_POKEMON_ATTACKS = Object.freeze({
    9001: { kind: "ram", title: "Ariete brote", anatomy: "Cabezazo, boca y hojas", x: "28%", y: "-8%", turn: "-7deg", scale: 1.08 },
    9002: { kind: "slam", title: "Martillo musgoso", anatomy: "Dos puños, torso y rugido", x: "18%", y: "-5%", turn: "4deg", scale: 1.1 },
    9003: { kind: "slam", title: "Puño sísmico", anatomy: "Puño gigante, piernas y enredaderas", x: "21%", y: "-4%", turn: "6deg", scale: 1.12 },
    9101: { kind: "ram", title: "Carga de adobe", anatomy: "Cuerpo cuadrado, patas y boca", x: "27%", y: "-5%", turn: "8deg", scale: 1.07 },
    9102: { kind: "slam", title: "Prensa fortaleza", anatomy: "Antebrazos, peso y mandíbula", x: "17%", y: "-3%", turn: "3deg", scale: 1.11 },
    9201: { kind: "wing", title: "Garra de cría", anatomy: "Boca, alas pequeñas y garra", x: "30%", y: "-17%", turn: "-9deg", scale: 1.09 },
    9202: { kind: "wing", title: "Tajo de cuatro alas", anatomy: "Cuatro alas y garras cruzadas", x: "34%", y: "-21%", turn: "-12deg", scale: 1.1 },
    9203: { kind: "wing", title: "Picado guadaña", anatomy: "Cuatro alas, garras y cola", x: "38%", y: "-24%", turn: "-15deg", scale: 1.12 },
    9301: { kind: "psychic", title: "Despertar lunar", anatomy: "Ojos, boca, patas y cola", x: "11%", y: "-12%", turn: "-3deg", scale: 1.08 },
    9302: { kind: "psychic", title: "Látigo de cintas", anatomy: "Cintas, patas y mirada", x: "16%", y: "-13%", turn: "6deg", scale: 1.09 },
    9303: { kind: "psychic", title: "Zarpazo astral", anatomy: "Garra, boca y gran cola", x: "27%", y: "-16%", turn: "-8deg", scale: 1.1 },
    9401: { kind: "haunt", title: "Mueca umbría", anatomy: "Boca dentada y llamas", x: "22%", y: "-14%", turn: "-10deg", scale: 1.14 },
    9402: { kind: "haunt", title: "Barrido de farol", anatomy: "Farol, garra y cuerpo espectral", x: "19%", y: "-10%", turn: "10deg", scale: 1.12 },
    9403: { kind: "haunt", title: "Clamor de linternas", anatomy: "Boca gigante, brazos y faroles", x: "16%", y: "-8%", turn: "-5deg", scale: 1.15 },
    9501: { kind: "spark", title: "Hocico relámpago", anatomy: "Hocico, patas, orejas y cola", x: "32%", y: "-12%", turn: "-8deg", scale: 1.08 },
    9502: { kind: "spark", title: "Embestida tormenta", anatomy: "Alas, patas y boca", x: "36%", y: "-20%", turn: "-13deg", scale: 1.1 },
    9601: { kind: "sting", title: "Aguja zumbadora", anatomy: "Cuatro alas, probóscide y patas", x: "39%", y: "-16%", turn: "-11deg", scale: 1.08 },
    9602: { kind: "sting", title: "Finta de aguijón", anatomy: "Cuatro alas y probóscide", x: "42%", y: "-21%", turn: "-15deg", scale: 1.1 },
    9603: { kind: "sting", title: "Combo sanguento", anatomy: "Garras, alas y aguijón abdominal", x: "34%", y: "-17%", turn: "10deg", scale: 1.12 },
    9701: { kind: "silk", title: "Disparo de seda", anatomy: "Boca y cuerpo de oruga", x: "19%", y: "-8%", turn: "-6deg", scale: 1.09, mouth: "55% 52%" },
    9702: { kind: "silk", title: "Hilo tóxico", anatomy: "Boca, glándulas y cuerpo", x: "21%", y: "-9%", turn: "7deg", scale: 1.1, mouth: "54% 55%" },
    9703: { kind: "powder", title: "Vendaval ilusorio", anatomy: "Alas, antenas y escamas", x: "17%", y: "-18%", turn: "-9deg", scale: 1.12 },
    9801: { kind: "psychic", title: "Destello destilado", anatomy: "Mirada, brazos de vapor y gema", x: "16%", y: "-13%", turn: "-5deg", scale: 1.09 },
    9802: { kind: "haunt", title: "Licor espectral", anatomy: "Llamas, brazos etéreos y gema", x: "20%", y: "-16%", turn: "7deg", scale: 1.12 },
    9803: { kind: "ram", title: "Bocado tostado", anatomy: "Pan, patas y mandíbula", x: "30%", y: "-7%", turn: "-8deg", scale: 1.09 },
    9804: { kind: "slam", title: "Melena de alioli", anatomy: "Melena, garras y lomo", x: "22%", y: "-9%", turn: "5deg", scale: 1.11 },
    9805: { kind: "haunt", title: "Emboscada tóxica", anatomy: "Tapa, humo y garras", x: "24%", y: "-12%", turn: "-9deg", scale: 1.1 },
    9806: { kind: "slam", title: "Puño de escarcha", anatomy: "Puños de hielo, cuernos y apoyo", x: "24%", y: "-10%", turn: "-7deg", scale: 1.1 },
    9807: { kind: "slam", title: "Doble glaciar", anatomy: "Puños de hielo, torso y cuernos", x: "27%", y: "-12%", turn: "6deg", scale: 1.13 },
    9808: { kind: "ram", title: "Impulso de azahar", anatomy: "Orejas, flor y cola cítrica", x: "28%", y: "-9%", turn: "-7deg", scale: 1.08 },
    9809: { kind: "ram", title: "Carrera del huerto", anatomy: "Ramas, patas y frutos", x: "31%", y: "-11%", turn: "-9deg", scale: 1.1 },
    9810: { kind: "spark", title: "Descarga cítrica", anatomy: "Cornamenta, ramas y naranjas", x: "25%", y: "-15%", turn: "8deg", scale: 1.12 },
    9811: { kind: "ram", title: "Bigote de corriente", anatomy: "Barbillones, aletas y cola", x: "34%", y: "-12%", turn: "-8deg", scale: 1.09 },
    9812: { kind: "wing", title: "Embestida fluvial", anatomy: "Aletas, barbillones y cola", x: "39%", y: "-18%", turn: "-12deg", scale: 1.12 },
    9813: { kind: "wing", title: "Tajo de fragua", anatomy: "Filo, ojo y cinta", x: "36%", y: "-18%", turn: "-14deg", scale: 1.1 },
    9814: { kind: "wing", title: "Arco toledano", anatomy: "Filo, guarda y cinta", x: "39%", y: "-20%", turn: "-16deg", scale: 1.12 },
    9815: { kind: "slam", title: "Sentencia matallama", anatomy: "Filo, manto y llama interior", x: "25%", y: "-10%", turn: "7deg", scale: 1.15 },
  });
  const PETRILLO_ID = 9001;
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
    Fantasma: "#6d5a9b", Siniestro: "#4c4358", Psíquico: "#d96f9c", Dragón: "#7362c5", Hada: "#d985bd", Acero: "#79949f", Tierra: "#b58a54", Roca: "#9a8258", Hielo: "#78c7dc", Lucha: "#b95b4b",
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
    stoneSeal: { name: "Sello Pétreo", type: "Roca", power: 18, accuracy: 95 },
    earthPress: { name: "Prensa Telúrica", type: "Tierra", power: 23, accuracy: 90 },
    scaleRush: { name: "Carrera Escama", type: "Dragón", power: 18, accuracy: 95 },
    razorWing: { name: "Ala Cortadora", type: "Bicho", power: 20, accuracy: 93 },
    prairieDive: { name: "Picado de Pradera", type: "Volador", power: 24, accuracy: 89 },
    moonGleam: { name: "Brillo Lunar", type: "Hada", power: 18, accuracy: 96 },
    dreamWhisper: { name: "Susurro Onírico", type: "Psíquico", power: 21, accuracy: 93 },
    astralGuard: { name: "Luz Astral", type: "Hada", power: 25, accuracy: 89 },
    shadowPrank: { name: "Travesura Umbría", type: "Fantasma", power: 18, accuracy: 95 },
    lanternDrain: { name: "Farol Voraz", type: "Siniestro", power: 21, accuracy: 92, drain: true },
    eternalNight: { name: "Noche Eterna", type: "Fantasma", power: 26, accuracy: 87 },
    sparkSnout: { name: "Hocico Chispa", type: "Eléctrico", power: 18, accuracy: 95 },
    stormWing: { name: "Ala Tormenta", type: "Volador", power: 24, accuracy: 89 },
    nectarNeedle: { name: "Aguijón Néctar", type: "Bicho", power: 17, accuracy: 96, drain: true },
    bloodStinger: { name: "Aguijón Sanguíneo", type: "Bicho", power: 23, accuracy: 89, drain: true },
    wingFeint: { name: "Finta Alada", type: "Volador", power: 20, accuracy: 93 },
    silkEscape: { name: "Hilo de Fuga", type: "Bicho", power: 16, accuracy: 97 },
    toxicThread: { name: "Hilo Tóxico", type: "Veneno", power: 20, accuracy: 92 },
    hallucinationDust: { name: "Escamas Ilusorias", type: "Veneno", power: 24, accuracy: 88 },
    spiritDistill: { name: "Destilado Ánima", type: "Psíquico", power: 21, accuracy: 93, drain: true },
    aioliBlaze: { name: "Alioli Ardiente", type: "Hada", power: 22, accuracy: 91 },
    toxicFume: { name: "Humo Tóxico", type: "Veneno", power: 20, accuracy: 93 },
    darkPilfer: { name: "Hurto Sombrío", type: "Siniestro", power: 18, accuracy: 96 },
    iceFist: { name: "Puño de Escarcha", type: "Hielo", power: 19, accuracy: 94 },
    mountainJab: { name: "Jab Montañés", type: "Lucha", power: 21, accuracy: 92 },
    citrusVolt: { name: "Voltio Cítrico", type: "Eléctrico", power: 23, accuracy: 91 },
    riverWhisker: { name: "Bigote Fluvial", type: "Agua", power: 21, accuracy: 94 },
    forgeSlash: { name: "Tajo de Fragua", type: "Acero", power: 22, accuracy: 92 },
  };

  const POKEMON = {
    1: { id: 1, name: "Bulbasaur", type: "Planta", secondaryType: "Veneno", baseHp: 25, catchRate: .34, moves: [MOVES.tackle, MOVES.vineWhip], description: "Paciente y resistente. Una elección muy equilibrada." },
    4: { id: 4, name: "Braspín", type: "Fuego", baseHp: 23, catchRate: .34, moves: [MOVES.scratch, MOVES.ember], description: "Pokémon Púas Brasa. Sus púas se encienden cuando protege a quienes considera su manada.", evolvesTo: 5, evolveLevel: 16 },
    5: { id: 5, name: "Ascuero", type: "Fuego", secondaryType: "Tierra", baseHp: 33, catchRate: .17, moves: [MOVES.scratch, MOVES.ember], description: "Pokémon Coraza Ascua. Endurece el barro de su lomo al calor de sus llamas para resistir los golpes más duros.", evolvesTo: 6, evolveLevel: 37 },
    6: { id: 6, name: "Volcazote", type: "Fuego", secondaryType: "Tierra", baseHp: 44, catchRate: .07, moves: [MOVES.scratch, MOVES.ember], description: "Pokémon Volcán Férreo. Su caparazón guarda un calor profundo que hace temblar el suelo al avanzar." },
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
    9001: { id: 9001, name: "Petrillo", type: "Roca", baseHp: 25, catchRate: .34, moves: [MOVES.tackle, MOVES.vineWhip], description: "Monstruo Semilla. Robusto y capaz de absorber minerales del suelo.", evolvesTo: 9002, evolveLevel: 16 },
    9002: { id: 9002, name: "Musgólem", type: "Roca", secondaryType: "Planta", baseHp: 25, catchRate: .34, moves: [MOVES.tackle, MOVES.vineWhip], description: "Monstruo Coloso Musgo. Sus brazos de roca se afianzan al suelo mientras las enredaderas absorben humedad.", evolvesTo: 9003, evolveLevel: 32 },
    9003: { id: 9003, name: "Terravórdeo", type: "Roca", secondaryType: "Planta", baseHp: 25, catchRate: .34, moves: [MOVES.tackle, MOVES.vineWhip], description: "Monstruo Montaña Viviente. Cada paso mezcla minerales y semillas; allí donde descansa, vuelve a brotar la vida." },
    9101: { id: 9101, name: "Peyote", type: "Roca", secondaryType: "Tierra", baseHp: 30, catchRate: .52, moves: [MOVES.tackle, MOVES.stoneSeal], description: "Monstruo Adobe. Compacta capas de tierra y roca hasta convertirlas en una coraza orgullosamente sellada.", evolvesTo: 9102, evolveLevel: 18 },
    9102: { id: 9102, name: "Prensalito", type: "Roca", secondaryType: "Tierra", baseHp: 44, catchRate: .16, moves: [MOVES.stoneSeal, MOVES.earthPress, MOVES.headbutt], description: "Monstruo Bloque Prensado. Protege su territorio con un cuerpo de densidad extraordinaria." },
    9201: { id: 9201, name: "Criascama", type: "Dragón", baseHp: 23, catchRate: .42, moves: [MOVES.tackle, MOVES.scaleRush], description: "Monstruo Cría Dragón. Salta entre piedras mientras aprende a leer las corrientes de la pradera.", evolvesTo: 9202, evolveLevel: 18 },
    9202: { id: 9202, name: "Aliscama", type: "Dragón", secondaryType: "Bicho", baseHp: 31, catchRate: .18, moves: [MOVES.scaleRush, MOVES.razorWing, MOVES.gust], description: "Monstruo Ala Cortadora. Sus antenas anticipan cada cambio del viento.", evolvesTo: 9203, evolveLevel: 36 },
    9203: { id: 9203, name: "Dracoscama", type: "Dragón", secondaryType: "Bicho", baseHp: 42, catchRate: .07, moves: [MOVES.dragonRage, MOVES.razorWing, MOVES.prairieDive], description: "Monstruo Dragón Veloz. Custodia las praderas con maniobras imposibles de seguir a simple vista." },
    9301: { id: 9301, name: "Luminio", type: "Psíquico", baseHp: 21, catchRate: .50, moves: [MOVES.confusion, MOVES.moonGleam], description: "Monstruo Brillo. Baila junto a fuentes tranquilas y deja sueños de paz a su paso.", evolvesTo: 9302, evolveLevel: 17 },
    9302: { id: 9302, name: "Lunaria", type: "Psíquico", secondaryType: "Hada", baseHp: 30, catchRate: .20, moves: [MOVES.moonGleam, MOVES.dreamWhisper, MOVES.confusion], description: "Monstruo Susurro. Sus cintas luminosas guían a quien se pierde en sus propios pensamientos.", evolvesTo: 9303, evolveLevel: 34 },
    9303: { id: 9303, name: "Lusdria", type: "Psíquico", secondaryType: "Hada", baseHp: 38, catchRate: .08, moves: [MOVES.dreamWhisper, MOVES.astralGuard, MOVES.moonGleam], description: "Monstruo Luminar. Purifica las pesadillas con una luz telepática serena." },
    9401: { id: 9401, name: "Sombrañol", type: "Fantasma", baseHp: 22, catchRate: .48, moves: [MOVES.lick, MOVES.shadowPrank], description: "Monstruo Sombra. Apaga luces para jugar bromas y se esconde entre llamas violetas.", evolvesTo: 9402, evolveLevel: 20 },
    9402: { id: 9402, name: "Penumbra", type: "Fantasma", secondaryType: "Siniestro", baseHp: 32, catchRate: .19, moves: [MOVES.shadowPrank, MOVES.lanternDrain, MOVES.lick], description: "Monstruo Sombra. Su farol absorbe energía para sostener su cuerpo nebuloso.", evolvesTo: 9403, evolveLevel: 38 },
    9403: { id: 9403, name: "Tenebrantor", type: "Fantasma", secondaryType: "Siniestro", baseHp: 43, catchRate: .07, moves: [MOVES.lanternDrain, MOVES.eternalNight, MOVES.shadowPrank], description: "Monstruo Ánima Oscura. Sus faroles marcan caminos secretos entre las sombras." },
    9501: { id: 9501, name: "Chispin", type: "Eléctrico", baseHp: 24, catchRate: .46, moves: [MOVES.quickAttack, MOVES.sparkSnout], description: "Monstruo Cerdito Eléctrico. Al correr, carga sus mejillas y deja pequeñas chispas entre las briznas de hierba.", evolvesTo: 9502, evolveLevel: 24 },
    9502: { id: 9502, name: "Chisporc", type: "Eléctrico", secondaryType: "Volador", baseHp: 36, catchRate: .13, moves: [MOVES.sparkSnout, MOVES.stormWing, MOVES.gust], description: "Monstruo Cerdito Tormenta. Sus alas acumulan electricidad hasta arrastrar nubes cargadas a su paso." },
    9601: { id: 9601, name: "Moskito", type: "Bicho", baseHp: 19, catchRate: .65, moves: [MOVES.bugBite, MOVES.nectarNeedle], description: "Monstruo Mosquito. Bebe néctar y savia con un aguijón aún más curioso que peligroso.", evolvesTo: 9602, evolveLevel: 15 },
    9602: { id: 9602, name: "Zumkito", type: "Bicho", baseHp: 27, catchRate: .25, moves: [MOVES.nectarNeedle, MOVES.wingFeint, MOVES.bugBite], description: "Monstruo Zumbido. Convierte el néctar en energía y confunde a sus rivales con patrones de sus alas.", evolvesTo: 9603, evolveLevel: 30 },
    9603: { id: 9603, name: "Sanguento", type: "Bicho", secondaryType: "Volador", baseHp: 37, catchRate: .10, moves: [MOVES.bloodStinger, MOVES.wingFeint, MOVES.nectarNeedle], description: "Monstruo Aguijón. Planea desde las sombras y perfora defensas con extremidades afiladas." },
    9701: { id: 9701, name: "Alúa", type: "Bicho", baseHp: 20, catchRate: .64, moves: [MOVES.tackle, MOVES.silkEscape], description: "Monstruo Oruga Hoja. Se camufla entre el follaje y segrega un hilo pegajoso cuando peligra.", evolvesTo: 9702, evolveLevel: 14 },
    9702: { id: 9702, name: "Capulúa", type: "Bicho", secondaryType: "Veneno", baseHp: 29, catchRate: .24, moves: [MOVES.silkEscape, MOVES.toxicThread, MOVES.poisonSting], description: "Monstruo Crisálida Tóxica. Sus glándulas producen un líquido capaz de paralizar a quien lo toque.", evolvesTo: 9703, evolveLevel: 28 },
    9703: { id: 9703, name: "Maripulúa", type: "Bicho", secondaryType: "Veneno", baseHp: 38, catchRate: .09, moves: [MOVES.toxicThread, MOVES.hallucinationDust, MOVES.wingFeint], description: "Monstruo Polilla Ilusoria. Sus escamas venenosas provocan espejismos en los bosques sombríos." },
    9801: { id: 9801, name: "Rubrisma", type: "Psíquico", baseHp: 23, catchRate: .50, moves: [MOVES.confusion, MOVES.spiritDistill], description: "Monstruo Destello. Lee las emociones que reposan en recipientes antiguos y las destila en intuiciones.", evolvesTo: 9802, evolveLevel: 28 },
    9802: { id: 9802, name: "Azuránima", type: "Psíquico", secondaryType: "Fantasma", baseHp: 37, catchRate: .14, moves: [MOVES.spiritDistill, MOVES.shadowPrank, MOVES.confusion], description: "Monstruo Licor Espiritual. Su esencia etérea atraviesa la mente y revela verdades a quien está preparado." },
    9803: { id: 9803, name: "Serranín", type: "Fuego", baseHp: 25, catchRate: .54, moves: [MOVES.ember, MOVES.headbutt], description: "Monstruo Bocadillo. Tuesta las puntas de su pan en rocas calientes para marcar senderos de montaña.", evolvesTo: 9804, evolveLevel: 24 },
    9804: { id: 9804, name: "Aliolomo", type: "Fuego", secondaryType: "Hada", baseHp: 39, catchRate: .15, moves: [MOVES.ember, MOVES.aioliBlaze, MOVES.headbutt], description: "Monstruo Alioli. Su melena ardiente protege al grupo con un aroma que infunde valor y alegría." },
    9805: { id: 9805, name: "Cajhumo", type: "Veneno", secondaryType: "Siniestro", baseHp: 28, catchRate: .42, moves: [MOVES.toxicFume, MOVES.darkPilfer, MOVES.poisonSting], description: "Monstruo Caja Tóxica. Roba objetos brillantes y desaparece por callejones dentro de una nube adormecedora." },
    9806: { id: 9806, name: "Rebehielo", type: "Lucha", secondaryType: "Hielo", baseHp: 28, catchRate: .46, moves: [MOVES.iceFist, MOVES.mountainJab], description: "Monstruo Cabra Glacial. Entrena golpeando rocas heladas y nunca retrocede ante una pendiente.", evolvesTo: 9807, evolveLevel: 28 },
    9807: { id: 9807, name: "Picorneo", type: "Lucha", secondaryType: "Hielo", baseHp: 42, catchRate: .12, moves: [MOVES.iceFist, MOVES.mountainJab, MOVES.headbutt], description: "Monstruo Risco. Sus puños cristalinos quiebran piedra y se endurecen con cada combate en altura." },
    9808: { id: 9808, name: "Azahín", type: "Planta", baseHp: 21, catchRate: .60, moves: [MOVES.absorb, MOVES.vineWhip], description: "Monstruo Azahar. Convierte la luz del Mediterráneo en el aroma dulce de una pequeña naranja.", evolvesTo: 9809, evolveLevel: 16 },
    9809: { id: 9809, name: "Naranjil", type: "Planta", baseHp: 31, catchRate: .24, moves: [MOVES.vineWhip, MOVES.absorb, MOVES.quickAttack], description: "Monstruo Naranjo. Sus ramas se alargan mientras siente la energía que recorre la savia.", evolvesTo: 9810, evolveLevel: 34 },
    9810: { id: 9810, name: "Citrayo", type: "Planta", secondaryType: "Eléctrico", baseHp: 43, catchRate: .08, moves: [MOVES.citrusVolt, MOVES.vineWhip, MOVES.thunderShock], description: "Monstruo Huerto. Almacena electricidad en sus naranjas y la desata para proteger los cultivos." },
    9811: { id: 9811, name: "Barbito", type: "Agua", baseHp: 24, catchRate: .56, moves: [MOVES.waterGun, MOVES.riverWhisker], description: "Monstruo Pez Barbo. Sus sensibles barbillones detectan alimento oculto entre las piedras del río.", evolvesTo: 9812, evolveLevel: 24 },
    9812: { id: 9812, name: "Barbalto", type: "Agua", baseHp: 39, catchRate: .14, moves: [MOVES.riverWhisker, MOVES.waterGun, MOVES.quickAttack], description: "Monstruo Barbo Mayor. Domina cada corriente con grandes aletas y guía a su grupo río arriba." },
    9813: { id: 9813, name: "Ascuero", type: "Acero", secondaryType: "Fuego", baseHp: 22, catchRate: .48, moves: [MOVES.forgeSlash, MOVES.ember], description: "Monstruo Espada Poseída. Parpadea con curiosidad y juega con las chispas de la fragua.", evolvesTo: 9814, evolveLevel: 20 },
    9814: { id: 9814, name: "Tolebrasa", type: "Acero", secondaryType: "Fuego", baseHp: 33, catchRate: .19, moves: [MOVES.forgeSlash, MOVES.ember, MOVES.metalSound], description: "Monstruo Acero Toledano. Dibuja arcos elegantes mientras la llama de su hoja arde con orgullo.", evolvesTo: 9815, evolveLevel: 38 },
    9815: { id: 9815, name: "Matallama", type: "Acero", secondaryType: "Fuego", baseHp: 45, catchRate: .06, moves: [MOVES.forgeSlash, MOVES.metalSound, MOVES.ember], description: "Monstruo Filo de Honor. Su manto de fuego honra la tradición y su acero canta en cada duelo." },
  };

  const SANPLEDEX_FAMILIES = Object.freeze([
    { name: "Linaje de la Brasa", ids: [4, 5, 6] },
    { name: "Linaje del Brote", ids: [9001, 9002, 9003] },
    { name: "Linaje del Adobe", ids: [9101, 9102] },
    { name: "Linaje de las Escamas", ids: [9201, 9202, 9203] },
    { name: "Linaje Lunar", ids: [9301, 9302, 9303] },
    { name: "Linaje de la Penumbra", ids: [9401, 9402, 9403] },
    { name: "Linaje de la Tormenta", ids: [9501, 9502] },
    { name: "Linaje del Zumbido", ids: [9601, 9602, 9603] },
    { name: "Linaje de la Seda Tóxica", ids: [9701, 9702, 9703] },
    { name: "Linaje del Destilado", ids: [9801, 9802] },
    { name: "Linaje del Bocadillo", ids: [9803, 9804] },
    { name: "Linaje del Humo", ids: [9805] },
    { name: "Linaje del Glaciar", ids: [9806, 9807] },
    { name: "Linaje del Azahar", ids: [9808, 9809, 9810] },
    { name: "Linaje del Barbo", ids: [9811, 9812] },
    { name: "Linaje de la Fragua", ids: [9813, 9814, 9815] },
  ]);
  const SANPLEDEX_IDS = Object.freeze(SANPLEDEX_FAMILIES.flatMap((family) => family.ids));

  const LEGACY_MONSTER_REPLACEMENTS = Object.freeze({
    1: 9001, 4: 9501, 7: 9301, 10: 9701, 13: 9601, 16: 9201, 19: 9001,
    25: 9501, 43: 9001, 63: 9301, 81: 9501, 92: 9401, 96: 9301, 104: 9101,
    133: 9701, 147: 9201, 149: 9203, 151: 9303, 248: 9102, 373: 9203,
    376: 9502, 399: 9001, 445: 9203, 635: 9403,
  });
  const SECRET_MONSTER_IDS = Object.freeze([9003, 9102, 9203, 9303, 9403, 9502, 9603, 9703, 9802, 9804, 9805, 9807, 9810, 9812, 9815]);
  const SECRET_POKEMON_IDS = Object.freeze(Object.keys(POKEMON).map(Number).filter((id) => !SANPLEDEX_IDS.includes(id)));
  const LOCAL_DEX_SIZE = Object.keys(POKEMON).length - SECRET_POKEMON_IDS.length;

  const STARTERS = [POKEMON[9001], POKEMON[9201], POKEMON[9301], POKEMON[9501]];
  const WILD_TABLE = [
    { id: 9701, weight: 22 }, { id: 9601, weight: 20 }, { id: 9501, weight: 16 },
    { id: 9001, weight: 14 }, { id: 9101, weight: 10 }, { id: 9301, weight: 8 },
    { id: 9401, weight: 6 }, { id: 9201, weight: 4 }, { id: 9805, weight: 5 },
    { id: 9808, weight: 8 },
  ];

  const PRISM_WILD_TABLE = [
    { id: 9401, weight: 22 }, { id: 9301, weight: 18 }, { id: 9402, weight: 14 },
    { id: 9302, weight: 12 }, { id: 9201, weight: 12 }, { id: 9202, weight: 8 },
    { id: 9101, weight: 8 }, { id: 9501, weight: 8 }, { id: 9602, weight: 7 },
    { id: 9702, weight: 7 }, { id: 9102, weight: 4 }, { id: 9801, weight: 7 },
    { id: 9813, weight: 4 },
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
  const field = CITY_MAP.field || { x: 1250, y: 900, w: 320, h: 210, a: 0 };
  function currentPortalDoor() {
    return cityEntrances.find((entrance) => entrance.action === "prism") || null;
  }

  function currentPortalPosition() {
    const entrance = currentPortalDoor();
    return entrance
      ? { x: (entrance.col + .5) * CITY_MAP.tileSize, y: (entrance.row + .5) * CITY_MAP.tileSize }
      : { ...INITIAL_PORTAL_POSITION };
  }

  const INITIAL_PORTAL_RETURN = CITY_MAP.portalReturn || {
    x: INITIAL_PORTAL_POSITION.x,
    y: INITIAL_PORTAL_POSITION.y + field.h / 2 + 70,
  };

  function currentPortalReturn() {
    if (CITY_MAP.portalReturn) return { ...CITY_MAP.portalReturn };
    const position = currentPortalPosition();
    return { x: position.x, y: position.y + field.h / 2 + 70 };
  }

  function currentHealthReturn() {
    const entrance = cityEntrances.find((item) => item.action === "heal");
    return Array.isArray(entrance?.approach)
      ? { x: Number(entrance.approach[0]), y: Number(entrance.approach[1]) }
      : { ...NORMAL_START };
  }
  const greenAreas = createGreenAreas();
  const encounterZones = greenAreas.map((area) => area.polygon);

  const pointsOfInterest = CITY_MAP.pointsOfInterest || [
    { id: "dimension_portal", x: INITIAL_PORTAL_POSITION.x, y: INITIAL_PORTAL_POSITION.y, radius: 78 },
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
    ...(CITY_MAP.worldObjects || []),
    { id: "ultra-west", dimension: "prism", x: 260, y: 1190, kind: "ultraBalls", amount: 2, name: "2 Ultra Balls", sprite: "ultra-ball" },
    { id: "max-potion-east", dimension: "prism", x: 1800, y: 1190, kind: "potions", amount: 2, name: "2 Pociones", sprite: "super-potion" },
    { id: "rare-candy-north", dimension: "prism", x: 1040, y: 360, kind: "rareCandies", amount: 1, name: "Caramelo Raro", sprite: "rare-candy" },
    { id: "berry-prism", dimension: "prism", x: 1530, y: 620, kind: "berries", amount: 3, name: "3 Bayas Aranja", sprite: "oran-berry" },
  ];

  const INVENTORY_ITEMS = [
    { key: "balls", name: "Poké Ball", sprite: "poke-ball", description: "Dispositivo estándar para capturar Pokémon." },
    { key: "ultraBalls", name: "Ultra Ball", sprite: "ultra-ball", description: "Aumenta mucho la probabilidad de captura." },
    { key: "masterBalls", name: "Master Ball", sprite: "master-ball", description: "Captura sin fallar a cualquier Pokémon salvaje." },
    { key: "potions", name: "Poción", sprite: "potion", description: "Restaura 20 PS al Pokémon activo." },
    { key: "maxPotions", name: "Poción Máxima", sprite: "max-potion", description: "Restaura todos los PS del Pokémon activo." },
    { key: "berries", name: "Baya Aranja", sprite: "oran-berry", description: "Restaura 10 PS al Pokémon activo." },
    { key: "rareCandies", name: "Caramelo Raro", sprite: "rare-candy", description: "Sube inmediatamente un nivel." },
    { key: "prismBatteries", name: "Batería Prisma", sprite: "cell-battery", description: "Recupera una carga de luz dentro del laberinto." },
    { key: "prismShards", name: "Fragmento Prisma", sprite: "odd-keystone", description: "Tres fragmentos abren el portal dimensional." },
  ];

  const BLACK_MARKET_LIMITS = Object.freeze({ rareCandy: 2, masterBall: 1, prismBattery: 3 });

  const treePositions = [];
  const carPositions = [];

  const defaultState = () => ({
    version: 7, mapRevision: MAP_REVISION, started: false, starterChosen: false,
    doctorPotatoIntroPending: false, doctorPotatoIntroSeen: false,
    fragmentCinematicSeen: false,
    worldX: NORMAL_START.x, worldY: NORMAL_START.y, direction: NORMAL_START.direction,
    distance: 0, grassDistance: 0, balls: 6, trainerLevel: 1,
    activeTeamIndex: 0, caught: [], seen: [], team: [], questStage: 0,
    clinicGiftClaimed: false, sound: true, buildingSkins: {},
    dimension: "san_pablo", dimensionVisited: false, caughtDimension: false,
    returnPosition: null, collectedObjects: [], triggeredEvents: [], interior: null, interiorData: null, maintenanceReturn: null,
    maze: null, secretPokemonSaved: false, secretPokemonId: null,
    money: 500, battlesWon: 0, gifts: {},
    blackMarket: { discovered: false, purchases: { rareCandy: 0, masterBall: 0, prismBattery: 0 } },
    inventory: {
      potions: 1, maxPotions: 0, berries: 1,
      ultraBalls: 0, masterBalls: 0, rareCandies: 0, prismBatteries: 0, prismShards: 0,
    },
  });

  let state = defaultState();
  let battle = null;
  let inputLocked = false;
  let dialogQueue = [];
  let dialogCallback = null;
  let dialogPresentation = null;
  let audioContext = null;
  let lastFrameTime = 0;
  let animationTime = 0;
  let animationFrame = 0;
  let playerRunning = false;
  let lastEncounterCheck = 0;
  let lastGrassStepAt = 0;
  let lastGrassStepX = 0;
  let lastGrassStepY = 0;
  let camera = { x: 640, y: 1140 };
  let lastArea = "";
  let lastSaveAt = 0;
  let saveStatusTimer = 0;
  let selectedBuildingId = "";
  let inventoryOpenedFromBattle = false;
  let selectedSanpledexId = PETRILLO_ID;
  let lastSanpledexFocus = null;
  let sanpledexAttackTimer = 0;
  let mazeDefinition = null;
  let microphoneStream = null;
  let microphoneAnalyser = null;
  let microphoneData = null;
  let microphoneLevel = 0;
  let microphoneFallbackMode = false;
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
  let activeShopType = "mart";
  let lastShopFocus = null;
  let starterIntroActive = false;
  let fragmentCinematicActive = false;
  let doctorPotatoScene = null;
  let mapEventRunning = false;
  let lastStepEventTile = "";
  let entranceTileIndex = new Map();
  let eventTileIndex = new Map();
  let selectedEditorEntity = null;
  let collaboratorCursors = [];
  const voiceNpc = {
    x: NORMAL_START.x + 150, y: NORMAL_START.y, direction: "left",
    moving: false, animationElapsed: 0, positionReady: false,
    active: false, listening: false, shouldListen: false, speaking: false,
    permission: VOICE_NPC_ENABLED ? "idle" : "disabled", recognition: null, recognitionStarting: false,
    permissionRequest: null, restartTimer: 0, lastSpeechAt: 0,
    transcript: "", reply: "", replyAt: 0, lastFinalText: "", lastFinalAt: 0,
    requestPending: false, queuedUtterance: "", history: [], model: "MiniMax-M3",
    apiState: "idle", wakeCount: 0, chaseStartedAt: 0, chaseStartX: 0, chaseStartY: 0,
    lastChaseDurationMs: 0, lastChaseDistance: 0,
  };
  const mazeMotion = { forward: 0, strafe: 0, turn: 0 };
  const input = {
    up: false, down: false, left: false, right: false,
    strafeLeft: false, strafeRight: false, run: false,
  };

  const buildingSheet = new Image();
  const playerSheet = new Image();
  const npcSheet = new Image();
  const guideNpcSheet = new Image();
  const npcRosterSheets = new Map();
  const cityMapPreview = new Image();
  const cityNavigationMask = new Image();
  const encounterGrassSheet = new Image();
  const cityMapTileCache = new Map();
  const cityMapVisibleTileIds = new Set();
  /* El runtime usa copias mutables: el layout declarativo permanece congelado,
     mientras el editor local puede previsualizar cambios antes de guardarlos. */
  const cityWorldAssets = Array.isArray(CITY_MAP.worldAssets) ? CITY_MAP.worldAssets.map((asset) => ({
    ...asset,
    colliders: (asset.colliders || []).map((collider) => [...collider]),
  })) : [];
  const initialAddedAssetIds = new Set((Array.isArray(initialEditorData.addedAssets) ? initialEditorData.addedAssets : [])
    .map((asset) => String(asset?.id || ""))
    .filter(Boolean));
  /* El layout ya llega con el snapshot inicial aplicado. Conservamos una copia
     de sus assets base visibles para poder reconciliar snapshots posteriores
     sin convertir overrides o eliminaciones temporales en pérdida destructiva. */
  const runtimeBaseWorldAssets = new Map(cityWorldAssets
    .filter((asset) => !initialAddedAssetIds.has(asset.id))
    .map((asset) => [asset.id, cloneRuntimeRecord(asset)]));
  const baseLinkedAssetPositions = new Map(cityWorldAssets.map((asset) => [asset.id, { x: Number(asset.x), y: Number(asset.y) }]));
  const linkedAssetPositions = new Map(cityWorldAssets.map((asset) => [asset.id, { x: Number(asset.x), y: Number(asset.y) }]));
  const linkedEntrancePositions = new Map();
  const cityBuildingFootprints = Array.isArray(CITY_MAP.buildingFootprints) ? CITY_MAP.buildingFootprints : [];
  const cityBarrierSegments = Array.isArray(CITY_MAP.barrierSegments) ? CITY_MAP.barrierSegments : [];
  const cityStreetPolish = CITY_MAP.streetPolish || {};
  const cityWorldAssetImages = new Map();
  const MAP_MEMORY_BUDGET_BYTES = (Number(CITY_MAP.memoryBudgetMB) || 96) * 1024 * 1024;
  const MAP_PREFETCH_LIMIT = Number(CITY_MAP.prefetchLimit) || 2;
  const MAP_PREFETCH_SECONDS = Number(CITY_MAP.prefetchSeconds) || .65;
  const MAP_PREFETCH_MARGIN = Number(CITY_MAP.prefetchMargin) || 64;
  const MAP_UNLOAD_MARGIN = Number(CITY_MAP.unloadMargin) || 160;
  const MAP_UNLOAD_DELAY_MS = Number(CITY_MAP.unloadDelayMs) || 500;
  const shadowStalkerImage = new Image();
  const itemImages = new Map();
  const pokemonArtworkImages = new Map();
  const horrorAudio = Object.fromEntries(Object.entries(HORROR_AUDIO_URLS).map(([key, url]) => {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.loop = key === "chase" || key === "breathing";
    return [key, audio];
  }));
  const dialogMusicAudio = new Audio();
  dialogMusicAudio.preload = "auto";
  dialogMusicAudio.loop = true;
  dialogMusicAudio.volume = .72;
  let loadedDialogMusicMediaSource = null;
  let loadedDialogMusicSource = null;
  let pendingDialogMusicSource = null;
  let dialogMusicBuffer = null;
  let dialogMusicBufferPromise = null;
  let dialogMusicSourceNode = null;
  let dialogMusicGainNode = null;
  let activeDialogMusicSource = null;
  const activeScareClips = new Set();
  let buildingSheetReady = false;
  let playerSheetReady = false;
  let npcSheetReady = false;
  let guideNpcSheetReady = false;
  let cityMapPreviewReady = false;
  let cityNavigationMaskReady = false;
  let cityNavigationMaskData = null;
  let encounterGrassSheetReady = false;
  let lastMapCameraSample = { x: camera.x, y: camera.y, time: 0 };
  let shadowStalkerReady = false;
  const defaultMapTiles = new Map();
  const tileOverrides = new Map();
  const playerFrames = new Map();
  let selectedTileType = "blocked";
  let selectedMapTile = null;
  let developerEditorEnabled = false;
  let selectedEditorAssetId = null;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function fadeTransition(midAction) {
    return new Promise((resolve) => {
      const overlay = elements.flashOverlay;
      overlay.classList.remove("fade"); void overlay.offsetWidth;
      overlay.classList.add("fade");
      window.setTimeout(() => {
        try { if (typeof midAction === "function") midAction(); } catch (error) { console.warn(error); }
        window.setTimeout(() => { overlay.classList.remove("fade"); resolve(); }, 320);
      }, 300);
    });
  }

  const elements = {
    titleScreen: $("#titleScreen"), worldScreen: $("#worldScreen"), battleScreen: $("#battleScreen"),
    starterModal: $("#starterModal"), starterGrid: $("#starterGrid"), newGameButton: $("#newGameButton"),
    starterIntroScreen: $("#starterIntroScreen"), starterIntroVideo: $("#starterIntroVideo"),
    starterIntroStatus: $("#starterIntroStatus"), playStarterIntro: $("#playStarterIntro"),
    skipStarterIntro: $("#skipStarterIntro"),
    fragmentCinematicScreen: $("#fragmentCinematicScreen"), fragmentCinematicVideo: $("#fragmentCinematicVideo"),
    fragmentCinematicStatus: $("#fragmentCinematicStatus"), playFragmentCinematic: $("#playFragmentCinematic"),
    skipFragmentCinematic: $("#skipFragmentCinematic"),
    continueButton: $("#continueButton"), closeStarter: $("#closeStarter"), canvas: $("#worldCanvas"),
    assetNotice: $("#assetNotice"), runBadge: $("#runBadge"), interactPrompt: $("#interactPrompt"),
    areaToast: $("#areaToast"), flashOverlay: $("#flashOverlay"), areaName: $("#areaName"),
    trainerLevel: $("#trainerLevel"), ballCount: $("#ballCount"), caughtCount: $("#caughtCount"),
    questPill: $("#questPill"), dialogBox: $("#dialogBox"), dialogAvatar: $("#dialogAvatar"),
    dialogSpeaker: $("#dialogSpeaker"), dialogText: $("#dialogText"),
    dialogPortrait: $("#dialogPortrait"), dialogNext: $("#dialogNext"), teamDrawer: $("#teamDrawer"),
    drawerScrim: $("#drawerScrim"), teamList: $("#teamList"), drawerCaughtCount: $("#drawerCaughtCount"),
    dexProgress: $("#dexProgress"), teamButton: $("#teamButton"), closeTeamButton: $("#closeTeamButton"),
    sanpledexButton: $("#sanpledexButton"), sanpledexModal: $("#sanpledexModal"),
    closeSanpledex: $("#closeSanpledex"), sanpledexList: $("#sanpledexList"),
    sanpledexDetail: $("#sanpledexDetail"), sanpledexCaughtCount: $("#sanpledexCaughtCount"),
    sanpledexSeenCount: $("#sanpledexSeenCount"), sanpledexProgress: $("#sanpledexProgress"),
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
    tileEditorHint: $("#tileEditorHint"), copyTileButton: $("#copyTileButton"), copyNpcButton: $("#copyNpcButton"),
    resetTileMap: $("#resetTileMap"),
    inventoryButton: $("#inventoryButton"), inventoryDrawer: $("#inventoryDrawer"),
    closeInventory: $("#closeInventory"), inventoryScrim: $("#inventoryScrim"),
    dimensionProgress: $("#dimensionProgress"), inventoryList: $("#inventoryList"),
    gameCard: $("#gameCard"), fullscreenButton: $("#fullscreenButton"),
    mazeHud: $("#mazeHud"), lightCharges: $("#lightCharges"), shadowStatus: $("#shadowStatus"),
    mazeObjective: $("#mazeObjective"), noiseLabel: $("#noiseLabel"),
    noiseMeter: $("#noiseMeter"), jumpScare: $("#jumpScare"), captureBadge: $("#captureBadge"),
    captureAreaName: $("#captureAreaName"), captureActivity: $("#captureActivity"),
    miniMap: $("#miniMap"), miniMapCanvas: $("#miniMapCanvas"), miniMapArea: $("#miniMapArea"),
    saveStatus: $("#saveStatus"), coordinateHud: $("#coordinateHud"),
    battleScene: $(".battle-scene"), shopModal: $("#shopModal"), shopDialog: $("#shopDialog"),
    shopTitle: $("#shopTitle"), shopEyebrow: $("#shopEyebrow"), shopTip: $("#shopTip"),
    shopMoney: $("#shopMoney"), shopList: $("#shopList"), closeShop: $("#closeShop"), money: $("#money"),
    voiceNpcHud: $("#voiceNpcHud"), voiceNpcStatus: $("#voiceNpcStatus"),
    voiceNpcTranscript: $("#voiceNpcTranscript"), voiceNpcReply: $("#voiceNpcReply"),
    voiceNpcRetry: $("#voiceNpcRetry"),
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
    const goalPath = [{ x: goal.x, y: goal.y }];
    while (goalPath.length && (goalPath.at(-1).x !== start.x || goalPath.at(-1).y !== start.y)) {
      const current = goalPath.at(-1);
      const currentDistance = distances.get(`${current.x},${current.y}`);
      const previous = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dx, dy]) => ({ x: current.x + dx, y: current.y + dy }))
        .find((cell) => distances.get(`${cell.x},${cell.y}`) === currentDistance - 1);
      if (!previous) break;
      goalPath.push(previous);
    }
    goalPath.reverse();
    const marketIndex = clamp(Math.round((goalPath.length - 1) * .42), 1, Math.max(1, goalPath.length - 2));
    const market = goalPath[marketIndex] || start;
    return {
      grid, size, start,
      goal: { x: goal.x, y: goal.y },
      monster: { x: monster.x, y: monster.y },
      market: { x: market.x, y: market.y },
    };
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
    return SECRET_MONSTER_IDS[Math.floor(Math.random() * SECRET_MONSTER_IDS.length)];
  }

  function currentSecretPokemonId() {
    if (!SECRET_MONSTER_IDS.includes(state.secretPokemonId)) state.secretPokemonId = chooseSecretPokemonId();
    return state.secretPokemonId;
  }

  function ensureMazeState(reset = false) {
    if (!mazeDefinition) mazeDefinition = generateMaze();
    if (!state.maze || reset) {
      const { start, monster, grid } = mazeDefinition;
      state.maze = {
        playerX: start.x + .5, playerY: start.y + .5, angle: firstOpenDirection(grid, start),
        lightCharges: 3, monsterX: monster.x + .5, monsterY: monster.y + .5,
        monsterRepel: 0, captures: 0, steps: 0, alertTimer: 0, marketReached: false,
      };
      shadowPath = []; shadowPathTimer = 0; sprintScare = null; sprintScareCooldown = 5;
      quietStillTime = 0;
      mazeMotion.forward = 0; mazeMotion.strafe = 0; mazeMotion.turn = 0;
    }
    if (!Number.isFinite(state.maze.alertTimer)) state.maze.alertTimer = 0;
    return state.maze;
  }

  async function requestMicrophoneAccess() {
    if (!MICROPHONE_ACCESS_ENABLED) {
      microphoneFallbackMode = true;
      return "movement";
    }
    if (microphoneStream?.getAudioTracks().some((track) => track.readyState === "live")) {
      microphoneFallbackMode = false;
      return "microphone";
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      microphoneFallbackMode = true;
      return "movement";
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
      microphoneFallbackMode = false;
      return "microphone";
    } catch (error) {
      microphoneStream?.getTracks().forEach((track) => track.stop());
      microphoneStream = null; microphoneAnalyser = null; microphoneData = null;
      microphoneFallbackMode = true;
      console.info("Micrófono no disponible; se usará el ruido de movimiento.", error);
      return "movement";
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

  function stopMicrophone(force = false) {
    const keepSharedVoiceStream = !force && voiceNpc.shouldListen && voiceNpc.permission === "granted";
    if (!keepSharedVoiceStream) {
      microphoneStream?.getTracks().forEach((track) => track.stop());
      microphoneStream = null; microphoneAnalyser = null; microphoneData = null; microphoneLevel = 0;
      microphoneFallbackMode = false;
    }
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

  function normalizeVoiceCommand(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function localVoiceNpcReply(message) {
    const topic = String(message || "")
      .replace(/\bmanol[ií]+n\b/gi, "")
      .replace(/[«»“”"]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 46) || "esa pamplina";
    const turn = Math.floor(voiceNpc.history.length / 2);
    return VOICE_NPC_FALLBACK_REPLIES[turn % VOICE_NPC_FALLBACK_REPLIES.length](topic);
  }

  function voiceNpcTriggerDetected(text) {
    return /\bmanoli+n\b/.test(normalizeVoiceCommand(text));
  }

  function voiceNpcUiState() {
    if (voiceNpc.permission === "requesting") return "requesting";
    if (["denied", "unsupported", "error"].includes(voiceNpc.permission)) return "error";
    if (voiceNpc.requestPending) return "thinking";
    if (voiceNpc.active) return "active";
    return voiceNpc.listening ? "listening" : "idle";
  }

  function updateVoiceNpcUi() {
    if (elements.voiceNpcHud) elements.voiceNpcHud.classList.toggle("hidden", !VOICE_NPC_ENABLED);
    document.documentElement.dataset.voiceNpcEnabled = String(VOICE_NPC_ENABLED);
    if (!VOICE_NPC_ENABLED) return;
    const uiState = voiceNpcUiState();
    if (elements.voiceNpcHud) elements.voiceNpcHud.dataset.state = uiState;
    if (elements.voiceNpcStatus) {
      const labels = {
        requesting: "Pidiendo acceso al micrófono…",
        error: voiceNpc.permission === "unsupported"
          ? "Este navegador no transcribe voz"
          : "Micrófono desactivado",
        thinking: "Pensando una pulla con MiniMax…",
        active: "DISCUTIENDO · TE SIGUE 3 S",
        listening: "ESCUCHANDO · DI «MANOLÍN»",
        idle: "Micrófono preparado",
      };
      elements.voiceNpcStatus.textContent = labels[uiState];
    }
    if (elements.voiceNpcTranscript) {
      elements.voiceNpcTranscript.textContent = voiceNpc.transcript
        ? `Te ha oído: «${voiceNpc.transcript.slice(0, 110)}»`
        : "Di «Manolín» para que te oiga y venga a discutir.";
    }
    if (elements.voiceNpcReply) {
      elements.voiceNpcReply.textContent = voiceNpc.reply;
      elements.voiceNpcReply.classList.toggle("hidden", !voiceNpc.reply);
    }
    if (elements.voiceNpcRetry) {
      elements.voiceNpcRetry.classList.toggle("hidden", !["denied", "unsupported", "error"].includes(voiceNpc.permission));
    }
    document.documentElement.dataset.voiceNpcPermission = voiceNpc.permission;
    document.documentElement.dataset.voiceNpcListening = String(voiceNpc.listening);
    document.documentElement.dataset.voiceNpcActive = String(voiceNpc.active);
    document.documentElement.dataset.voiceNpcApi = voiceNpc.apiState;
    document.documentElement.dataset.voiceNpcModel = voiceNpc.model;
    document.documentElement.dataset.voiceNpcSilenceMs = String(VOICE_NPC_SILENCE_MS);
    document.documentElement.dataset.voiceNpcWakeCount = String(voiceNpc.wakeCount);
    document.documentElement.dataset.voiceNpcX = voiceNpc.x.toFixed(1);
    document.documentElement.dataset.voiceNpcY = voiceNpc.y.toFixed(1);
    document.documentElement.dataset.voiceNpcLastChaseMs = String(Math.round(voiceNpc.lastChaseDurationMs));
    document.documentElement.dataset.voiceNpcLastChaseDistance = voiceNpc.lastChaseDistance.toFixed(1);
  }

  function voiceNpcPositionOpen(x, y) {
    return cityMapCanOccupy(x, y) && !worldNpcBlocksPosition(x, y)
      && Math.hypot(x - state.worldX, y - state.worldY) >= 72;
  }

  function placeVoiceNpcNearPlayer(force = false) {
    if (!VOICE_NPC_ENABLED) { voiceNpc.positionReady = false; return false; }
    if (!state.started || state.dimension !== "san_pablo" || state.interior) return false;
    if (!force && voiceNpc.positionReady && Math.hypot(voiceNpc.x - state.worldX, voiceNpc.y - state.worldY) < 340) return true;
    const offsets = [[156, 0], [-156, 0], [0, 156], [0, -156], [112, 112], [-112, 112], [112, -112], [-112, -112]];
    const candidate = offsets
      .map(([offsetX, offsetY]) => ({ x: state.worldX + offsetX, y: state.worldY + offsetY }))
      .find((position) => voiceNpcPositionOpen(position.x, position.y));
    if (!candidate) return false;
    voiceNpc.x = candidate.x; voiceNpc.y = candidate.y;
    voiceNpc.direction = directionFromNpcToPlayer(candidate, "left");
    voiceNpc.positionReady = true;
    return true;
  }

  function speakVoiceNpcReply(reply) {
    if (!state.sound || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(reply);
    speech.lang = "es-ES";
    speech.rate = .92;
    speech.pitch = .72;
    const spanishVoices = window.speechSynthesis.getVoices().filter((voice) => voice.lang?.toLowerCase().startsWith("es"));
    speech.voice = spanishVoices.find((voice) => /jorge|antonio|enrique|pablo|male/i.test(voice.name)) || spanishVoices[0] || null;
    speech.onstart = () => { voiceNpc.speaking = true; };
    speech.onend = speech.onerror = () => { voiceNpc.speaking = false; };
    window.speechSynthesis.speak(speech);
  }

  async function askVoiceNpc(utterance) {
    const message = String(utterance || "").trim().slice(0, 320);
    if (!message) return;
    if (voiceNpc.requestPending) {
      voiceNpc.queuedUtterance = message;
      return;
    }
    voiceNpc.requestPending = true;
    voiceNpc.apiState = "loading";
    updateVoiceNpcUi();
    try {
      const response = await fetch("/api/manolin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: voiceNpc.history.slice(-12) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.reply) throw new Error(payload.error || "MiniMax no ha respondido");
      voiceNpc.reply = String(payload.reply).slice(0, 260);
      voiceNpc.model = payload.model || voiceNpc.model;
      voiceNpc.apiState = "ready";
    } catch (error) {
      voiceNpc.reply = localVoiceNpcReply(message);
      voiceNpc.apiState = "fallback";
      console.info("Manolín usa una pulla local porque MiniMax no respondió.", error);
    }
    voiceNpc.replyAt = performance.now();
    voiceNpc.history.push({ role: "user", content: message }, { role: "assistant", content: voiceNpc.reply });
    voiceNpc.history = voiceNpc.history.slice(-12);
    speakVoiceNpcReply(voiceNpc.reply);
    voiceNpc.requestPending = false;
    updateVoiceNpcUi();
    const queued = voiceNpc.queuedUtterance;
    voiceNpc.queuedUtterance = "";
    if (queued && voiceNpc.active) askVoiceNpc(queued);
  }

  function activateVoiceNpc() {
    const wasActive = voiceNpc.active;
    voiceNpc.active = true;
    voiceNpc.lastSpeechAt = performance.now();
    if (!wasActive) {
      voiceNpc.wakeCount += 1;
      placeVoiceNpcNearPlayer(true);
      voiceNpc.chaseStartedAt = performance.now();
      voiceNpc.chaseStartX = voiceNpc.x;
      voiceNpc.chaseStartY = voiceNpc.y;
      voiceNpc.reply = VOICE_NPC_WAKE_REPLIES[(voiceNpc.wakeCount - 1) % VOICE_NPC_WAKE_REPLIES.length];
      voiceNpc.replyAt = performance.now();
    }
    updateVoiceNpcUi();
  }

  function handleVoiceNpcTranscript(text, isFinal = false) {
    if (!VOICE_NPC_ENABLED) return false;
    const transcript = String(text || "").trim();
    if (!transcript || voiceNpc.speaking) return false;
    voiceNpc.transcript = transcript;
    const triggered = voiceNpcTriggerDetected(transcript);
    if (triggered && state.started && state.dimension === "san_pablo" && !state.interior) activateVoiceNpc();
    if (voiceNpc.active) voiceNpc.lastSpeechAt = performance.now();
    updateVoiceNpcUi();
    if (isFinal && voiceNpc.active) {
      const now = performance.now();
      if (transcript !== voiceNpc.lastFinalText || now - voiceNpc.lastFinalAt > 1800) {
        voiceNpc.lastFinalText = transcript;
        voiceNpc.lastFinalAt = now;
        askVoiceNpc(transcript);
      }
    }
    return triggered;
  }

  function scheduleVoiceRecognitionRestart(delay = 300) {
    window.clearTimeout(voiceNpc.restartTimer);
    if (!voiceNpc.shouldListen || document.hidden || voiceNpc.permission !== "granted") return;
    voiceNpc.restartTimer = window.setTimeout(() => startVoiceRecognition(), delay);
  }

  function startVoiceRecognition() {
    if (!voiceNpc.shouldListen || voiceNpc.recognitionStarting || voiceNpc.listening || document.hidden) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      voiceNpc.permission = "unsupported";
      updateVoiceNpcUi();
      return;
    }
    if (!voiceNpc.recognition) {
      const recognition = new Recognition();
      recognition.lang = "es-ES";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        voiceNpc.recognitionStarting = false;
        voiceNpc.listening = true;
        updateVoiceNpcUi();
      };
      recognition.onresult = (event) => {
        if (voiceNpc.speaking) return;
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const text = event.results[index][0]?.transcript || "";
          if (event.results[index].isFinal) handleVoiceNpcTranscript(text, true);
          else interim += `${text} `;
        }
        if (interim.trim()) handleVoiceNpcTranscript(interim, false);
      };
      recognition.onspeechstart = () => { if (voiceNpc.active) voiceNpc.lastSpeechAt = performance.now(); };
      recognition.onerror = (event) => {
        voiceNpc.recognitionStarting = false;
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
          voiceNpc.permission = "denied";
          voiceNpc.shouldListen = false;
        } else if (event.error !== "no-speech") voiceNpc.permission = "error";
        updateVoiceNpcUi();
      };
      recognition.onend = () => {
        voiceNpc.recognitionStarting = false;
        voiceNpc.listening = false;
        updateVoiceNpcUi();
        scheduleVoiceRecognitionRestart();
      };
      voiceNpc.recognition = recognition;
    }
    try {
      voiceNpc.recognitionStarting = true;
      voiceNpc.recognition.start();
    } catch (error) {
      voiceNpc.recognitionStarting = false;
      scheduleVoiceRecognitionRestart(500);
    }
  }

  function requestVoiceNpcAccess(force = false) {
    if (!VOICE_NPC_ENABLED) {
      voiceNpc.shouldListen = false;
      voiceNpc.active = false;
      voiceNpc.positionReady = false;
      voiceNpc.permission = "disabled";
      return Promise.resolve(false);
    }
    if (voiceNpc.permissionRequest && !force) return voiceNpc.permissionRequest;
    voiceNpc.shouldListen = true;
    voiceNpc.permission = "requesting";
    updateVoiceNpcUi();
    voiceNpc.permissionRequest = requestMicrophoneAccess().then((mode) => {
      if (mode !== "microphone") {
        voiceNpc.permission = "denied";
        voiceNpc.shouldListen = false;
        updateVoiceNpcUi();
        return false;
      }
      voiceNpc.permission = "granted";
      updateVoiceNpcUi();
      startVoiceRecognition();
      return true;
    }).catch((error) => {
      voiceNpc.permission = "error";
      voiceNpc.shouldListen = false;
      updateVoiceNpcUi();
      return false;
    }).finally(() => { voiceNpc.permissionRequest = null; });
    return voiceNpc.permissionRequest;
  }

  function updateVoiceNpc(deltaSeconds) {
    if (!VOICE_NPC_ENABLED) return;
    const now = performance.now();
    if (voiceNpc.active && now - voiceNpc.lastSpeechAt >= VOICE_NPC_SILENCE_MS) {
      voiceNpc.active = false;
      voiceNpc.moving = false;
      voiceNpc.lastChaseDurationMs = now - voiceNpc.chaseStartedAt;
      voiceNpc.lastChaseDistance = Math.hypot(voiceNpc.x - voiceNpc.chaseStartX, voiceNpc.y - voiceNpc.chaseStartY);
      voiceNpc.reply = VOICE_NPC_SILENCE_REPLIES[(voiceNpc.wakeCount - 1) % VOICE_NPC_SILENCE_REPLIES.length];
      voiceNpc.replyAt = now;
      updateVoiceNpcUi();
    }
    const available = state.started && state.dimension === "san_pablo" && !state.interior && !doctorPotatoScene;
    if (!available || !voiceNpc.active) { voiceNpc.moving = false; return; }
    placeVoiceNpcNearPlayer();
    const dx = state.worldX - voiceNpc.x;
    const dy = state.worldY - voiceNpc.y;
    const separation = Math.hypot(dx, dy);
    if (separation <= 43) {
      voiceNpc.moving = false;
      voiceNpc.direction = directionFromNpcToPlayer(voiceNpc, voiceNpc.direction);
      return;
    }
    const amount = Math.min(VOICE_NPC_CHASE_SPEED * deltaSeconds, separation - 43);
    const unitX = dx / separation;
    const unitY = dy / separation;
    const previousX = voiceNpc.x; const previousY = voiceNpc.y;
    const canNpcOccupy = (x, y) => cityMapCanOccupy(x, y) && !worldNpcBlocksPosition(x, y);
    const nextX = voiceNpc.x + unitX * amount;
    const nextY = voiceNpc.y + unitY * amount;
    if (canNpcOccupy(nextX, voiceNpc.y)) voiceNpc.x = nextX;
    if (canNpcOccupy(voiceNpc.x, nextY)) voiceNpc.y = nextY;
    if (voiceNpc.x === previousX && voiceNpc.y === previousY) {
      const slideX = voiceNpc.x - unitY * amount;
      const slideY = voiceNpc.y + unitX * amount;
      if (canNpcOccupy(slideX, voiceNpc.y)) voiceNpc.x = slideX;
      if (canNpcOccupy(voiceNpc.x, slideY)) voiceNpc.y = slideY;
    }
    voiceNpc.moving = voiceNpc.x !== previousX || voiceNpc.y !== previousY;
    voiceNpc.animationElapsed += deltaSeconds * 1000;
    if (Math.abs(dx) > Math.abs(dy)) voiceNpc.direction = dx < 0 ? "left" : "right";
    else voiceNpc.direction = dy < 0 ? "up" : "down";
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

  function customPokemonAsset(id, view = "front") { return CUSTOM_POKEMON_ASSETS[id]?.[view] || null; }
  function customPokemonAttack(id) { return CUSTOM_POKEMON_ATTACKS[Number(id)] || null; }
  function customAttackStyle(profile) {
    if (!profile) return "";
    const [mouthX = "50%", mouthY = "50%"] = String(profile.mouth || "50% 50%").split(" ");
    return `--attack-x:${profile.x};--attack-y:${profile.y};--attack-turn:${profile.turn};--attack-scale:${profile.scale};--mouth-x:${mouthX};--mouth-y:${mouthY};`;
  }
  function isCustomPokemon(id) { return Boolean(CUSTOM_POKEMON_ASSETS[id]); }
  function isPetrillo(id) { return Number(id) === PETRILLO_ID; }
  function setBattlePokemonMotion(element, id, view = "front") {
    const motion = CUSTOM_POKEMON_MOTIONS[Number(id)];
    const attack = customPokemonAttack(id);
    element.classList.toggle("custom-pokemon-motion", Boolean(motion));
    element.dataset.pokemonId = String(id);
    element.dataset.view = view;
    if (motion) element.dataset.pokemonMotion = motion; else delete element.dataset.pokemonMotion;
    if (attack) {
      element.dataset.attackKind = attack.kind;
      element.style.setProperty("--attack-x", attack.x);
      element.style.setProperty("--attack-shift-x", view === "front" ? `-${attack.x}` : attack.x);
      element.style.setProperty("--attack-y", attack.y);
      element.style.setProperty("--attack-turn", attack.turn);
      element.style.setProperty("--attack-scale", attack.scale);
    } else {
      delete element.dataset.attackKind;
      ["--attack-x", "--attack-shift-x", "--attack-y", "--attack-turn", "--attack-scale"].forEach((name) => element.style.removeProperty(name));
    }
  }
  function artworkUrl(id) { return customPokemonAsset(id) || ""; }
  function iconUrl(id) { return customPokemonAsset(id) || ""; }
  function frontSpriteUrl(id) { return customPokemonAsset(id) || ""; }
  function backSpriteUrl(id) { return customPokemonAsset(id, "back") || ""; }
  function itemSpriteUrl(name) { return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${name}.png`; }
  function currentWorldWidth() { return state.dimension === "prism" ? PRISM_WIDTH : WORLD_WIDTH; }
  function currentWorldHeight() { return state.dimension === "prism" ? PRISM_HEIGHT : WORLD_HEIGHT; }

  function attachSpriteFallback(image, id, back = false) {
    image.onerror = null;
  }

  function worldAssetSource(asset) {
    return CITY_MAP.assetSprites?.[asset.sprite] || asset.src || "";
  }

  function worldAssetUrl(source) {
    const separator = source.includes("?") ? "&" : "?";
    return `${source}${separator}v=${Number(CITY_MAP.assetRevision) || 1}`;
  }

  function buildWorldAssetDrawable(image) {
    /* Los PNG del catalogo ya pasan por el limpiador de chroma/alpha. Evitar
       un canvas duplicado por prototipo ahorra decenas de MiB con el mapa completo. */
    return image;
  }

  function buildNavigationMaskData() {
    const canvas = document.createElement("canvas");
    canvas.width = cityNavigationMask.naturalWidth;
    canvas.height = cityNavigationMask.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(cityNavigationMask, 0, 0);
    try {
      const source = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixels = new Uint8Array(canvas.width * canvas.height);
      for (let index = 0; index < pixels.length; index += 1) pixels[index] = source[index * 4];
      cityNavigationMaskData = { width: canvas.width, height: canvas.height, pixels };
      cityNavigationMaskReady = true;
      document.documentElement.dataset.navigationMask = `${canvas.width}x${canvas.height}@${CITY_MAP.navigationMask?.cellSize || 8}`;
      document.documentElement.dataset.navigationMaskReady = "true";
    } catch (error) {
      cityNavigationMaskData = null;
      cityNavigationMaskReady = false;
      document.documentElement.dataset.navigationMaskReady = "error";
      console.warn("No se pudo leer la mascara semantica de navegacion; se usa la cuadricula de respaldo.", error);
    }
  }

  function updateWorldAssetDataset() {
    const records = [...cityWorldAssetImages.values()];
    const ready = records.filter((record) => record.ready).length;
    const failed = records.filter((record) => record.failed).length;
    document.documentElement.dataset.worldAssetCount = String(cityWorldAssets.length);
    document.documentElement.dataset.worldAssetSpriteCount = String(records.length);
    document.documentElement.dataset.worldAssetsReady = failed ? "error" : (records.length && ready === records.length ? "true" : "loading");
  }

  function syncLinkedEntrancesFromAssets({ force = false, entrancesAreBaseline = false } = {}) {
    let changed = false;
    cityWorldAssets.forEach((asset) => {
      const current = { x: Number(asset.x), y: Number(asset.y) };
      const previous = linkedAssetPositions.get(asset.id);
      const baselineAsset = baseLinkedAssetPositions.get(asset.id) || previous || current;
      linkedAssetPositions.set(asset.id, current);
      if (!previous || !Number.isFinite(current.x) || !Number.isFinite(current.y)) return;
      const deltaX = current.x - previous.x;
      const deltaY = current.y - previous.y;
      if (!force && !deltaX && !deltaY) return;
      const totalDeltaX = current.x - baselineAsset.x;
      const totalDeltaY = current.y - baselineAsset.y;
      const previousTotalDeltaX = previous.x - baselineAsset.x;
      const previousTotalDeltaY = previous.y - baselineAsset.y;
      cityEntrances.filter((entrance) => entrance.linkedAssetId === asset.id).forEach((entrance) => {
        const trackingKey = `${asset.id}:${entrance.id}`;
        const entranceX = (entrance.col + .5) * CITY_MAP.tileSize;
        const entranceY = (entrance.row + .5) * CITY_MAP.tileSize;
        const tracked = linkedEntrancePositions.get(trackingKey) || {
          x: entrancesAreBaseline ? entranceX : entranceX - previousTotalDeltaX,
          y: entrancesAreBaseline ? entranceY : entranceY - previousTotalDeltaY,
          approachX: Array.isArray(entrance.approach) ? Number(entrance.approach[0]) - (entrancesAreBaseline ? 0 : previousTotalDeltaX) : null,
          approachY: Array.isArray(entrance.approach) ? Number(entrance.approach[1]) - (entrancesAreBaseline ? 0 : previousTotalDeltaY) : null,
        };
        linkedEntrancePositions.set(trackingKey, tracked);
        const centerX = tracked.x + totalDeltaX;
        const centerY = tracked.y + totalDeltaY;
        entrance.col = Math.max(0, Math.min(78, Math.round(centerX / CITY_MAP.tileSize - .5)));
        entrance.row = Math.max(0, Math.min(78, Math.round(centerY / CITY_MAP.tileSize - .5)));
        if (Number.isFinite(tracked.approachX) && Number.isFinite(tracked.approachY)) {
          entrance.approach = [
            tracked.approachX + totalDeltaX,
            tracked.approachY + totalDeltaY,
            entrance.approach[2] || "up",
          ];
        }
        asset.door = [entrance.col, entrance.row];
        changed = true;
      });
    });
    if (changed) rebuildDefaultMapTiles();
    return changed;
  }

  function ensureCityWorldAssetImage(asset) {
    const source = worldAssetSource(asset);
    if (!source || cityWorldAssetImages.has(source)) return;
    const image = new Image();
    const record = { image, drawable: null, ready: false, failed: false };
    cityWorldAssetImages.set(source, record);
    image.onload = () => {
      record.drawable = buildWorldAssetDrawable(image);
      record.ready = true;
      record.failed = false;
      updateWorldAssetDataset();
      updateAssetNotice();
    };
    image.onerror = () => {
      record.drawable = null;
      record.ready = false;
      record.failed = true;
      updateWorldAssetDataset();
      updateAssetNotice();
    };
    image.decoding = "async";
    image.src = worldAssetUrl(source);
  }

  function loadCityWorldAssets() {
    cityWorldAssets.forEach(ensureCityWorldAssetImage);
    updateWorldAssetDataset();
  }

  function worldAssetsReady() {
    const expected = new Set(cityWorldAssets.map(worldAssetSource).filter(Boolean));
    return [...expected].every((source) => cityWorldAssetImages.get(source)?.ready);
  }

  function encounterGrassReady() {
    return !CITY_MAP.encounterGrass?.image || encounterGrassSheetReady;
  }

  function deployedNpcRosterSprites() {
    const exterior = cityNpcs
      .map((npc) => npc.sprite)
      .filter((sprite) => typeof sprite === "string" && NPC_ROSTER_SHEET_URLS[sprite]);
    const interior = cityEntrances
      .map((door) => NPC_DEFS[door.npc]?.sprite)
      .filter((sprite) => typeof sprite === "string" && NPC_ROSTER_SHEET_URLS[sprite]);
    return new Set([...interior, ...exterior, "doctor-potato"]);
  }

  function updateNpcDeploymentDataset() {
    const deployed = deployedNpcRosterSprites();
    document.documentElement.dataset.npcDeployedCount = String(deployed.size);
    document.documentElement.dataset.npcDeploymentReady = String(
      [...deployed].every((sprite) => npcRosterSheets.get(sprite)?.ready),
    );
  }

  function updateNpcRosterDataset() {
    const records = [...npcRosterSheets.values()];
    const ready = records.filter((record) => record.ready).length;
    const failed = records.filter((record) => record.failed).length;
    document.documentElement.dataset.npcRosterCount = String(records.length);
    document.documentElement.dataset.npcRosterLoaded = String(ready);
    document.documentElement.dataset.npcRosterReady = failed ? "error" : (ready === records.length ? "true" : "loading");
    const doctorPotato = npcRosterSheets.get("doctor-potato");
    document.documentElement.dataset.doctorPotatoSpriteReady = doctorPotato?.failed
      ? "error"
      : String(Boolean(doctorPotato?.ready));
    updateNpcDeploymentDataset();
  }

  function loadNpcRosterSprites() {
    Object.entries(NPC_ROSTER_SHEET_URLS).forEach(([id, source]) => {
      const image = new Image();
      const record = { image, ready: false, failed: false };
      npcRosterSheets.set(id, record);
      image.onload = () => { record.ready = true; record.failed = false; updateNpcRosterDataset(); };
      image.onerror = () => { record.ready = false; record.failed = true; updateNpcRosterDataset(); };
      image.decoding = "async";
      image.src = source;
    });
    updateNpcRosterDataset();
  }

  function loadAssets() {
    buildingSheet.onload = () => { buildingSheetReady = true; };
    buildingSheet.onerror = () => { buildingSheetReady = false; };
    playerSheet.onload = () => { buildPlayerFrames(); playerSheetReady = true; updateAssetNotice(); };
    playerSheet.onerror = () => { playerSheetReady = false; elements.assetNotice.textContent = "Personaje en modo alternativo"; };
    npcSheet.onload = () => { npcSheetReady = true; };
    npcSheet.onerror = () => { npcSheetReady = false; };
    guideNpcSheet.onload = () => { guideNpcSheetReady = true; updateAssetNotice(); };
    guideNpcSheet.onerror = () => { guideNpcSheetReady = false; elements.assetNotice.textContent = "NPC en modo alternativo"; };
    cityMapPreview.onload = () => { cityMapPreviewReady = true; updateMapTileStreaming(); updateAssetNotice(); };
    cityMapPreview.onerror = () => { cityMapPreviewReady = false; elements.assetNotice.textContent = "No se pudo cargar la vista previa del mapa"; };
    cityNavigationMask.onload = () => { buildNavigationMaskData(); updateAssetNotice(); };
    cityNavigationMask.onerror = () => {
      cityNavigationMaskReady = false;
      cityNavigationMaskData = null;
      document.documentElement.dataset.navigationMaskReady = "error";
      console.warn("No se pudo cargar la mascara semantica; se mantiene la navegacion de respaldo.");
    };
    encounterGrassSheet.onload = () => {
      encounterGrassSheetReady = true;
      document.documentElement.dataset.encounterGrassReady = "true";
      updateAssetNotice();
    };
    encounterGrassSheet.onerror = () => {
      encounterGrassSheetReady = false;
      document.documentElement.dataset.encounterGrassReady = "error";
      console.warn("No se pudo cargar el sprite de hierba alta.");
      updateAssetNotice();
    };
    shadowStalkerImage.onload = () => { shadowStalkerReady = true; };
    shadowStalkerImage.onerror = () => { shadowStalkerReady = false; };
    buildingSheet.src = BUILDING_SHEET_URL;
    playerSheet.src = PLAYER_SHEET_URL;
    npcSheet.src = NPC_SHEET_URL;
    guideNpcSheet.src = GUIDE_NPC_SHEET_URL;
    loadNpcRosterSprites();
    cityMapPreview.decoding = "async";
    cityMapPreview.src = CITY_MAP.previewImage;
    if (CITY_MAP.navigationMask?.image) {
      cityNavigationMask.decoding = "async";
      cityNavigationMask.src = `${CITY_MAP.navigationMask.image}?v=${CITY_MAP.navigationMask.revision || 1}`;
    }
    if (CITY_MAP.encounterGrass?.image) {
      document.documentElement.dataset.encounterGrassReady = "loading";
      encounterGrassSheet.decoding = "async";
      encounterGrassSheet.src = `${CITY_MAP.encounterGrass.image}?v=${CITY_MAP.encounterGrass.revision || 1}`;
    } else {
      document.documentElement.dataset.encounterGrassReady = "unused";
    }
    loadCityWorldAssets();
    updateMapTileStreaming();
    shadowStalkerImage.src = SHADOW_SPRITE_URL;
    Object.values(horrorAudio).forEach((audio) => audio.load());
  }

  function updateAssetNotice() {
    const visibleIds = [...cityMapVisibleTileIds];
    const readyCount = visibleIds.filter((id) => cityMapTileCache.get(id)?.ready).length;
    const visibleReady = visibleIds.length > 0 && readyCount === visibleIds.length;
    document.documentElement.dataset.cityMapReady = visibleReady ? "true" : "loading";
    const failedAssets = [...cityWorldAssetImages.values()].filter((record) => record.failed).length;
    if (visibleReady && playerSheetReady && guideNpcSheetReady && worldAssetsReady() && encounterGrassReady()) elements.assetNotice.classList.add("hidden");
    else if (!visibleReady && state.started && state.dimension === "san_pablo" && !state.interior) {
      elements.assetNotice.textContent = `Cargando mapa HD visible… ${readyCount}/${visibleIds.length}`;
      elements.assetNotice.classList.remove("hidden");
    } else if (failedAssets && state.started && state.dimension === "san_pablo" && !state.interior) {
      elements.assetNotice.textContent = `No se pudieron cargar ${failedAssets} objetos del mapa`;
      elements.assetNotice.classList.remove("hidden");
    } else if (!worldAssetsReady() && state.started && state.dimension === "san_pablo" && !state.interior) {
      const records = [...cityWorldAssetImages.values()];
      const readyAssets = records.filter((record) => record.ready).length;
      elements.assetNotice.textContent = `Cargando objetos del mapa… ${readyAssets}/${records.length}`;
      elements.assetNotice.classList.remove("hidden");
    } else if (!encounterGrassReady() && state.started && state.dimension === "san_pablo" && !state.interior) {
      elements.assetNotice.textContent = "Cargando hierba de encuentros…";
      elements.assetNotice.classList.remove("hidden");
    }
  }

  function mapTileAtWorld(x, y) {
    return (CITY_MAP.tiles || []).find((tile) => x >= tile.x && x < tile.x + tile.w
      && y >= tile.y && y < tile.y + tile.h) || null;
  }

  function disposeMapDrawable(drawable) {
    if (typeof drawable?.close === "function") drawable.close();
    if (drawable instanceof HTMLImageElement) {
      drawable.onload = null;
      drawable.onerror = null;
      drawable.removeAttribute("src");
    }
  }

  function releaseMapTile(id) {
    const record = cityMapTileCache.get(id);
    if (!record) return;
    record.controller?.abort();
    disposeMapDrawable(record.drawable);
    if (record.objectUrl) URL.revokeObjectURL(record.objectUrl);
    cityMapTileCache.delete(id);
  }

  function releaseAllMapTiles() {
    [...cityMapTileCache.keys()].forEach(releaseMapTile);
    cityMapVisibleTileIds.clear();
    lastMapCameraSample = { x: camera.x, y: camera.y, time: 0 };
    updateMapStreamingDataset();
  }

  function decodeMapTileAsImage(tile, controller) {
    const image = new Image();
    image.decoding = "async";
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        controller.signal.removeEventListener("abort", abortLoad);
      };
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const abortLoad = () => finish(() => {
        image.removeAttribute("src");
        const error = new Error("Carga de mapa cancelada");
        error.name = "AbortError";
        reject(error);
      });

      image.onload = () => finish(() => resolve({ drawable: image, objectUrl: null }));
      image.onerror = () => finish(() => reject(new Error(`No se pudo decodificar ${tile.image}`)));
      controller.signal.addEventListener("abort", abortLoad, { once: true });
      if (controller.signal.aborted) abortLoad();
      else image.src = tile.image;
    });
  }

  async function decodeMapTile(tile, controller) {
    if (window.location.protocol === "file:") return decodeMapTileAsImage(tile, controller);

    let objectUrl = null;
    try {
      const response = await fetch(tile.image, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (typeof window.createImageBitmap === "function") return window.createImageBitmap(blob);

      objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      return { drawable: image, objectUrl };
    } catch (error) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (error?.name === "AbortError") throw error;
      return decodeMapTileAsImage(tile, controller);
    }
  }

  function ensureMapTileLoaded(tile, priority, now) {
    const existing = cityMapTileCache.get(tile.id);
    if (existing?.failedAt && now - existing.failedAt >= 2000) releaseMapTile(tile.id);
    else if (existing) {
      existing.lastNeededAt = now;
      existing.priority = Math.min(existing.priority, priority);
      return;
    }

    const controller = new AbortController();
    const record = {
      tile,
      controller,
      drawable: null,
      objectUrl: null,
      ready: false,
      bytes: 0,
      priority,
      lastNeededAt: now,
    };
    cityMapTileCache.set(tile.id, record);
    decodeMapTile(tile, controller).then((decoded) => {
      const drawable = decoded?.drawable || decoded;
      if (cityMapTileCache.get(tile.id) !== record) {
        disposeMapDrawable(drawable);
        if (decoded?.objectUrl) URL.revokeObjectURL(decoded.objectUrl);
        return;
      }
      record.drawable = drawable;
      record.objectUrl = decoded?.objectUrl || null;
      record.ready = true;
      record.bytes = (drawable.width || drawable.naturalWidth || 0) * (drawable.height || drawable.naturalHeight || 0) * 4;
      updateMapStreamingDataset();
      updateAssetNotice();
    }).catch((error) => {
      if (error?.name === "AbortError" || cityMapTileCache.get(tile.id) !== record) return;
      record.ready = false;
      record.failedAt = performance.now();
      elements.assetNotice.textContent = `No se pudo cargar el sector ${tile.id}`;
      elements.assetNotice.classList.remove("hidden");
      updateMapStreamingDataset();
    });
  }

  function mapTileIntersects(tile, bounds) {
    return tile.x < bounds.right && tile.x + tile.w > bounds.left
      && tile.y < bounds.bottom && tile.y + tile.h > bounds.top;
  }

  function mapTilesIntersecting(bounds) {
    return (CITY_MAP.tiles || []).filter((tile) => mapTileIntersects(tile, bounds));
  }

  function expandedMapBounds(bounds, margin) {
    return {
      left: clamp(bounds.left - margin, 0, WORLD_WIDTH),
      top: clamp(bounds.top - margin, 0, WORLD_HEIGHT),
      right: clamp(bounds.right + margin, 0, WORLD_WIDTH),
      bottom: clamp(bounds.bottom + margin, 0, WORLD_HEIGHT),
    };
  }

  function mapRenderCamera(renderScale = { scaleX: 1, scaleY: 1 }) {
    const scaleX = Math.max(.001, renderScale.scaleX || 1);
    const scaleY = Math.max(.001, renderScale.scaleY || 1);
    return {
      x: Math.round(camera.x * scaleX) / scaleX,
      y: Math.round(camera.y * scaleY) / scaleY,
    };
  }

  function mapViewportBounds(renderScale) {
    const renderedCamera = mapRenderCamera(renderScale);
    return {
      left: renderedCamera.x,
      top: renderedCamera.y,
      right: renderedCamera.x + VIEW_WIDTH,
      bottom: renderedCamera.y + VIEW_HEIGHT,
    };
  }

  function updateMapStreamingDataset() {
    const records = [...cityMapTileCache.values()];
    const visibleIds = [...cityMapVisibleTileIds];
    const readyVisible = visibleIds.filter((id) => cityMapTileCache.get(id)?.ready).length;
    const bytes = records.reduce((total, record) => total + (record.bytes || 0), 0);
    document.documentElement.dataset.mapTilesLoaded = records.filter((record) => record.ready).map((record) => record.tile.id).join(",");
    document.documentElement.dataset.mapTilesVisible = visibleIds.join(",");
    document.documentElement.dataset.mapTilesVisibleReady = `${readyVisible}/${visibleIds.length}`;
    document.documentElement.dataset.mapTileCacheSize = String(records.length);
    document.documentElement.dataset.mapTileCacheBytes = String(bytes);
    document.documentElement.dataset.mapTileCacheLimit = `${Math.round(MAP_MEMORY_BUDGET_BYTES / 1024 / 1024)}MiB`;
  }

  function evictMapTilesToBudget(now) {
    let bytes = [...cityMapTileCache.values()].reduce((total, record) => total + (record.bytes || 0), 0);
    const candidates = [...cityMapTileCache.values()]
      .filter((record) => !cityMapVisibleTileIds.has(record.tile.id))
      .sort((a, b) => a.lastNeededAt - b.lastNeededAt || b.priority - a.priority);
    while (bytes > MAP_MEMORY_BUDGET_BYTES && candidates.length) {
      const record = candidates.shift();
      bytes -= record.bytes || 0;
      releaseMapTile(record.tile.id);
    }

    const recordLimit = cityMapVisibleTileIds.size + MAP_PREFETCH_LIMIT + 8;
    const excess = [...cityMapTileCache.values()]
      .filter((record) => !cityMapVisibleTileIds.has(record.tile.id) && now - record.lastNeededAt > MAP_UNLOAD_DELAY_MS)
      .sort((a, b) => a.lastNeededAt - b.lastNeededAt);
    while (cityMapTileCache.size > recordLimit && excess.length) releaseMapTile(excess.shift().tile.id);
  }

  function updateMapTileStreaming(renderScale = { scaleX: 1, scaleY: 1 }, now = performance.now()) {
    const outsideCity = !state.started || state.dimension !== "san_pablo" || Boolean(state.interior)
      || elements.worldScreen.classList.contains("hidden");
    if (outsideCity) {
      releaseAllMapTiles();
      return;
    }

    const view = mapViewportBounds(renderScale);
    const elapsedSeconds = lastMapCameraSample.time ? clamp((now - lastMapCameraSample.time) / 1000, .001, .25) : 0;
    const velocityX = elapsedSeconds ? (camera.x - lastMapCameraSample.x) / elapsedSeconds : 0;
    const velocityY = elapsedSeconds ? (camera.y - lastMapCameraSample.y) / elapsedSeconds : 0;
    lastMapCameraSample = { x: camera.x, y: camera.y, time: now };

    const chunkSize = CITY_MAP.chunkSize || 512;
    const predictionX = clamp(velocityX * MAP_PREFETCH_SECONDS, -chunkSize, chunkSize);
    const predictionY = clamp(velocityY * MAP_PREFETCH_SECONDS, -chunkSize, chunkSize);
    const predicted = {
      left: clamp(view.left + predictionX, 0, WORLD_WIDTH),
      top: clamp(view.top + predictionY, 0, WORLD_HEIGHT),
      right: clamp(view.right + predictionX, 0, WORLD_WIDTH),
      bottom: clamp(view.bottom + predictionY, 0, WORLD_HEIGHT),
    };
    const swept = expandedMapBounds({
      left: Math.min(view.left, predicted.left),
      top: Math.min(view.top, predicted.top),
      right: Math.max(view.right, predicted.right),
      bottom: Math.max(view.bottom, predicted.bottom),
    }, MAP_PREFETCH_MARGIN);

    const visible = mapTilesIntersecting(view);
    cityMapVisibleTileIds.clear();
    visible.forEach((tile) => cityMapVisibleTileIds.add(tile.id));
    const predictedCenterX = (predicted.left + predicted.right) / 2;
    const predictedCenterY = (predicted.top + predicted.bottom) / 2;
    const prefetch = mapTilesIntersecting(swept)
      .filter((tile) => !cityMapVisibleTileIds.has(tile.id))
      .sort((a, b) => Math.hypot(a.x + a.w / 2 - predictedCenterX, a.y + a.h / 2 - predictedCenterY)
        - Math.hypot(b.x + b.w / 2 - predictedCenterX, b.y + b.h / 2 - predictedCenterY))
      .slice(0, MAP_PREFETCH_LIMIT);
    const desiredIds = new Set([...visible.map((tile) => tile.id), ...prefetch.map((tile) => tile.id)]);

    visible.forEach((tile) => ensureMapTileLoaded(tile, 0, now));
    prefetch.forEach((tile) => ensureMapTileLoaded(tile, 1, now));
    const unloadBounds = expandedMapBounds(view, MAP_UNLOAD_MARGIN);
    [...cityMapTileCache.values()].forEach((record) => {
      if (desiredIds.has(record.tile.id)) {
        record.lastNeededAt = now;
        return;
      }
      if (!mapTileIntersects(record.tile, unloadBounds) && now - record.lastNeededAt > MAP_UNLOAD_DELAY_MS) releaseMapTile(record.tile.id);
    });
    evictMapTilesToBudget(now);
    updateMapStreamingDataset();
    updateAssetNotice();
  }

  function drawStreamedCityMap(context) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#244c39";
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cityMapTileCache.forEach((record) => {
      if (!record.ready) return;
      const tile = record.tile;
      const gutter = Number(CITY_MAP.chunkGutter) || 0;
      const left = Math.min(gutter, tile.x);
      const top = Math.min(gutter, tile.y);
      const right = Math.min(gutter, WORLD_WIDTH - tile.x - tile.w);
      const bottom = Math.min(gutter, WORLD_HEIGHT - tile.y - tile.h);
      context.drawImage(record.drawable, tile.x - left, tile.y - top, tile.w + left + right, tile.h + top + bottom);
    });
    context.imageSmoothingEnabled = false;
  }

  function strokeWorldPolyline(context, points) {
    if (!Array.isArray(points) || points.length < 2) return;
    context.beginPath();
    context.moveTo(Number(points[0][0]), Number(points[0][1]));
    points.slice(1).forEach((point) => context.lineTo(Number(point[0]), Number(point[1])));
    context.stroke();
  }

  function drawStreetEdge(context, street) {
    const [x1, y1, x2, y2] = street.segment || [];
    const width = Number(street.width) || 0;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (!length || !width) return;
    const normalX = -(y2 - y1) / length;
    const normalY = (x2 - x1) / length;
    [-1, 1].forEach((side) => {
      const offset = side * width / 2;
      const points = [
        [x1 + normalX * offset, y1 + normalY * offset],
        [x2 + normalX * offset, y2 + normalY * offset],
      ];
      context.strokeStyle = "rgba(31, 52, 43, .22)";
      context.lineWidth = street.id === "tesalonica" ? 6 : 5;
      strokeWorldPolyline(context, points);
      context.strokeStyle = "rgba(248, 238, 209, .62)";
      context.lineWidth = street.id === "tesalonica" ? 2.5 : 2;
      strokeWorldPolyline(context, points);
    });
  }

  function drawAccessPath(context, access) {
    const points = access.points || [];
    const width = Number(access.width) || 20;
    if (points.length < 2) return;
    context.save();
    context.lineCap = "butt";
    context.strokeStyle = "rgba(36, 57, 47, .16)";
    context.lineWidth = width + 4;
    strokeWorldPolyline(context, points);
    context.strokeStyle = "rgba(182, 174, 155, .46)";
    context.lineWidth = width + 2;
    strokeWorldPolyline(context, points);
    context.strokeStyle = "rgba(224, 219, 202, .28)";
    context.lineWidth = Math.max(6, width - 4);
    strokeWorldPolyline(context, points);

    context.strokeStyle = "rgba(105, 101, 88, .18)";
    context.lineWidth = 1;
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const [x1, y1] = points[pointIndex - 1];
      const [x2, y2] = points[pointIndex];
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (!length) continue;
      const normalX = -(y2 - y1) / length;
      const normalY = (x2 - x1) / length;
      for (let along = 12; along < length - 4; along += 14) {
        const amount = along / length;
        const x = x1 + (x2 - x1) * amount;
        const y = y1 + (y2 - y1) * amount;
        context.beginPath();
        context.moveTo(x - normalX * (width / 2 - 3), y - normalY * (width / 2 - 3));
        context.lineTo(x + normalX * (width / 2 - 3), y + normalY * (width / 2 - 3));
        context.stroke();
      }
    }
    context.restore();
  }

  function drawStreetCrossing(context, crossing) {
    const stripeCount = Math.max(2, Number(crossing.stripes) || 4);
    const span = Number(crossing.width) || 56;
    const length = Number(crossing.length) || 44;
    const step = span / stripeCount;
    const stripeWidth = Math.max(4, step * .48);
    context.save();
    context.translate(Number(crossing.x), Number(crossing.y));
    context.rotate((Number(crossing.angle) || 0) * Math.PI / 180);
    context.fillStyle = "rgba(244, 238, 211, .34)";
    context.shadowColor = "rgba(39, 57, 48, .18)";
    context.shadowBlur = 1;
    for (let index = 0; index < stripeCount; index += 1) {
      const x = -span / 2 + step * (index + .5) - stripeWidth / 2;
      context.fillRect(Math.round(x), Math.round(-length / 2), Math.round(stripeWidth), Math.round(length));
    }
    context.restore();
  }

  function drawStreetPolish(context) {
    if (!Number(cityStreetPolish.revision)) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    const edgeIds = new Set(cityStreetPolish.edgeStreetIds || []);
    (CITY_MAP.streets || []).filter((street) => edgeIds.has(street.id))
      .forEach((street) => drawStreetEdge(context, street));
    (cityStreetPolish.accessPaths || []).forEach((access) => drawAccessPath(context, access));
    (cityStreetPolish.crossings || []).forEach((crossing) => drawStreetCrossing(context, crossing));
    context.restore();
    document.documentElement.dataset.streetPolishRevision = String(cityStreetPolish.revision);
  }

  function mapSectionAt(x, y) {
    return (CITY_MAP.sections || []).find((section) => x >= section.x && x < section.x + section.w
      && y >= section.y && y < section.y + section.h) || { id: "san-pablo", name: "San Pablo", x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT };
  }

  function zoneAtY(y) {
    return mapSectionAt(state.worldX, y);
  }

  function tileKey(col, row) { return `${col},${row}`; }

  function setDefaultTileRect(type, rect) {
    const [startCol, startRow, endCol, endRow] = rect;
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) defaultMapTiles.set(tileKey(col, row), type);
    }
  }

  function setDefaultTileSegment(type, segment) {
    const [x1, y1, x2, y2, width] = segment;
    const size = CITY_MAP.tileSize;
    const minCol = Math.max(0, Math.floor((Math.min(x1, x2) - width / 2) / size));
    const maxCol = Math.min(Math.ceil(WORLD_WIDTH / size) - 1, Math.ceil((Math.max(x1, x2) + width / 2) / size));
    const minRow = Math.max(0, Math.floor((Math.min(y1, y2) - width / 2) / size));
    const maxRow = Math.min(Math.ceil(WORLD_HEIGHT / size) - 1, Math.ceil((Math.max(y1, y2) + width / 2) / size));
    const dx = x2 - x1; const dy = y2 - y1; const lengthSquared = dx * dx + dy * dy || 1;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const x = (col + .5) * size; const y = (row + .5) * size;
        const amount = clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
        const distanceToSegment = Math.hypot(x - (x1 + dx * amount), y - (y1 + dy * amount));
        if (distanceToSegment <= width / 2) defaultMapTiles.set(tileKey(col, row), type);
      }
    }
  }

  function rebuildRuntimeEntityIndexes() {
    entranceTileIndex = new Map();
    cityEntrances.forEach((entrance) => entranceTileIndex.set(tileKey(entrance.col, entrance.row), entrance));
    eventTileIndex = new Map();
    cityEvents.filter((event) => event.enabled !== false).forEach((event) => {
      const key = tileKey(event.col, event.row);
      if (!eventTileIndex.has(key)) eventTileIndex.set(key, []);
      eventTileIndex.get(key).push(event);
    });
  }

  function rebuildDefaultMapTiles() {
    defaultMapTiles.clear();
    (CITY_MAP.blockedRects || []).forEach((rect) => setDefaultTileRect("blocked", rect));
    (CITY_MAP.walkableRects || []).forEach((rect) => setDefaultTileRect("walkable", rect));
    (CITY_MAP.walkableSegments || []).forEach((segment) => setDefaultTileSegment("walkable", segment));
    (CITY_MAP.encounterRects || []).forEach((rect) => setDefaultTileRect("encounter", rect));
    (CITY_MAP.encounterTiles || []).forEach(([col, row]) => defaultMapTiles.set(tileKey(col, row), "encounter"));
    cityEvents.filter((event) => event.enabled !== false)
      .forEach((event) => defaultMapTiles.set(tileKey(event.col, event.row), "event"));
    cityEntrances.forEach((entrance) => defaultMapTiles.set(tileKey(entrance.col, entrance.row), "door"));
    rebuildRuntimeEntityIndexes();
  }

  function applyRuntimeTileOverrides(overrides = {}) {
    tileOverrides.clear();
    Object.entries(overrides && typeof overrides === "object" ? overrides : {}).forEach(([key, type]) => {
      if (/^\d+,\d+$/.test(key) && ["walkable", "blocked", "door", "encounter", "event"].includes(type)) tileOverrides.set(key, type);
    });
  }

  function initializeMapTiles() {
    rebuildDefaultMapTiles();
    applyRuntimeTileOverrides(window.CITY_MAP_EDITOR_DATA?.tileOverrides || {});
  }

  function saveMapTiles() {
    window.PokemonMapEditor?.syncTileOverrides?.(Object.fromEntries(tileOverrides));
  }

  function mapTileType(col, row) {
    if (col < 0 || row < 0 || col >= Math.ceil(WORLD_WIDTH / CITY_MAP.tileSize) || row >= Math.ceil(WORLD_HEIGHT / CITY_MAP.tileSize)) return "blocked";
    const key = tileKey(col, row);
    return tileOverrides.has(key) ? tileOverrides.get(key) : (defaultMapTiles.get(key) || CITY_MAP.defaultTile || "walkable");
  }

  function worldToTile(x, y) {
    return { col: Math.floor(x / CITY_MAP.tileSize), row: Math.floor(y / CITY_MAP.tileSize) };
  }

  function mapNpcPosition(npc) {
    const patrol = npcPatrolState(npc);
    if (patrol) return { x: patrol.x, y: patrol.y };
    return {
      x: (Number(npc.col) + .5) * CITY_MAP.tileSize,
      y: (Number(npc.row) + .5) * CITY_MAP.tileSize,
    };
  }

  function npcPatrolState(npc) {
    const destination = npc?.patrol?.to;
    const speed = Number(npc?.patrol?.tilesPerSecond);
    if (!Array.isArray(destination) || destination.length !== 2 || !Number.isFinite(speed) || speed <= 0) return null;
    const start = {
      x: (Number(npc.col) + .5) * CITY_MAP.tileSize,
      y: (Number(npc.row) + .5) * CITY_MAP.tileSize,
    };
    const end = {
      x: (Number(destination[0]) + .5) * CITY_MAP.tileSize,
      y: (Number(destination[1]) + .5) * CITY_MAP.tileSize,
    };
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
    if (!npcPatrolStates.has(npc.id)) {
      npcPatrolStates.set(npc.id, {
        start, end, speed: speed * CITY_MAP.tileSize,
        x: start.x, y: start.y, forward: true, direction: npc.direction || "down", moving: false,
      });
    }
    return npcPatrolStates.get(npc.id);
  }

  function directionFromDelta(dx, dy, fallback = "down") {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    if (Math.abs(dy) > 0) return dy < 0 ? "up" : "down";
    return fallback;
  }

  function segmentHitsPlayer(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared
      ? clamp(((state.worldX - startX) * dx + (state.worldY - startY) * dy) / lengthSquared, 0, 1)
      : 0;
    const nearestX = startX + dx * progress;
    const nearestY = startY + dy * progress;
    return Math.hypot(state.worldX - nearestX, state.worldY - nearestY) < NPC_COLLISION_RADIUS;
  }

  function updateNpcPatrols(deltaSeconds) {
    if (!state.started || state.dimension !== "san_pablo" || state.interior || deltaSeconds <= 0) return;
    cityNpcs.forEach((npc) => {
      const patrol = npcPatrolState(npc);
      if (!patrol) return;
      patrol.moving = false;
      if (Math.hypot(state.worldX - patrol.x, state.worldY - patrol.y) < NPC_COLLISION_RADIUS) return;

      let distanceLeft = patrol.speed * deltaSeconds;
      while (distanceLeft > .0001) {
        const target = patrol.forward ? patrol.end : patrol.start;
        const dx = target.x - patrol.x;
        const dy = target.y - patrol.y;
        const distanceToTarget = Math.hypot(dx, dy);
        if (distanceToTarget < .0001) {
          patrol.forward = !patrol.forward;
          continue;
        }
        const travelled = Math.min(distanceLeft, distanceToTarget);
        const nextX = patrol.x + dx / distanceToTarget * travelled;
        const nextY = patrol.y + dy / distanceToTarget * travelled;
        if (segmentHitsPlayer(patrol.x, patrol.y, nextX, nextY)) return;
        const blockedByNpc = cityNpcs.some((other) => {
          if (other.id === npc.id || other.solid === false) return false;
          const position = mapNpcPosition(other);
          return Math.hypot(nextX - position.x, nextY - position.y) < NPC_COLLISION_RADIUS;
        });
        if (!cityMapCanOccupy(nextX, nextY) || blockedByNpc) {
          patrol.forward = !patrol.forward;
          return;
        }
        patrol.direction = directionFromDelta(dx, dy, patrol.direction);
        patrol.x = nextX;
        patrol.y = nextY;
        patrol.moving = true;
        distanceLeft -= travelled;
        if (travelled >= distanceToTarget) patrol.forward = !patrol.forward;
      }
    });
  }

  function nearbyWorldNpc(maxDistance = 58) {
    if (state.dimension !== "san_pablo" || state.interior) return null;
    const player = { x: state.worldX, y: state.worldY };
    return cityNpcs
      .map((npc) => ({ npc, position: mapNpcPosition(npc) }))
      .map((entry) => ({ ...entry, distance: distance(player, entry.position) }))
      .filter((entry) => entry.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }

  function nearbyVoiceNpc(maxDistance = 58) {
    if (!VOICE_NPC_ENABLED) return null;
    if (!state.started || state.dimension !== "san_pablo" || state.interior || doctorPotatoScene || !voiceNpc.positionReady) return null;
    const npcDistance = Math.hypot(state.worldX - voiceNpc.x, state.worldY - voiceNpc.y);
    return npcDistance <= maxDistance ? { position: { x: voiceNpc.x, y: voiceNpc.y }, distance: npcDistance } : null;
  }

  function distanceToRect(x, y, rect) {
    const nearestX = clamp(x, rect.x, rect.x + rect.w);
    const nearestY = clamp(y, rect.y, rect.y + rect.h);
    return Math.hypot(x - nearestX, y - nearestY);
  }

  function nearbyWorldBlocker(maxDistance = 58) {
    if (state.dimension !== "san_pablo" || state.interior) return null;
    const candidates = cityWorldAssets
      .filter((asset) => asset.kind === "blocker" && asset.interaction)
      .map((asset) => ({
        asset,
        distance: Math.min(...worldAssetColliderRects(asset)
          .map((rect) => distanceToRect(state.worldX, state.worldY, rect))),
      }))
      .filter((entry) => Number.isFinite(entry.distance) && entry.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
    return candidates[0] || null;
  }

  function worldNpcBlocksPosition(x, y) {
    return cityNpcs.some((npc) => {
      if (npc.solid === false) return false;
      const position = mapNpcPosition(npc);
      return Math.hypot(x - position.x, y - position.y) < NPC_COLLISION_RADIUS;
    });
  }

  function voiceNpcBlocksPosition(x, y) {
    if (!VOICE_NPC_ENABLED) return false;
    if (!state.started || state.dimension !== "san_pablo" || state.interior || doctorPotatoScene || !voiceNpc.positionReady) return false;
    return Math.hypot(x - voiceNpc.x, y - voiceNpc.y) < 25;
  }

  function worldAssetColliderRects(asset) {
    return (asset.colliders || []).map((collider) => ({
      x: Number(asset.x) + Number(collider[0]),
      y: Number(asset.y) + Number(collider[1]),
      w: Number(collider[2]),
      h: Number(collider[3]),
    })).filter((rect) => Number.isFinite(rect.x) && Number.isFinite(rect.y) && rect.w > 0 && rect.h > 0);
  }

  function circleIntersectsRect(x, y, radius, rect) {
    const nearestX = clamp(x, rect.x, rect.x + rect.w);
    const nearestY = clamp(y, rect.y, rect.y + rect.h);
    return ((x - nearestX) ** 2) + ((y - nearestY) ** 2) <= radius ** 2;
  }

  function distanceToGeometrySegment(x, y, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    const amount = clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
    return Math.hypot(x - (x1 + dx * amount), y - (y1 + dy * amount));
  }

  function geometryBounds(points, padding = 0) {
    const xs = points.map((point) => Number(point[0]));
    const ys = points.map((point) => Number(point[1]));
    return {
      x: Math.min(...xs) - padding,
      y: Math.min(...ys) - padding,
      w: Math.max(...xs) - Math.min(...xs) + padding * 2,
      h: Math.max(...ys) - Math.min(...ys) + padding * 2,
    };
  }

  function circleIntersectsPolygonFeature(feature, x, y, radius) {
    const outer = Array.isArray(feature.points) ? feature.points : [];
    if (outer.length < 3) return false;
    const holes = Array.isArray(feature.holes) ? feature.holes : [];
    if (pointInPolygon(x, y, outer) && !holes.some((hole) => pointInPolygon(x, y, hole))) return true;
    return [outer, ...holes].some((ring) => ring.some((point, index) => {
      const next = ring[(index + 1) % ring.length];
      return distanceToGeometrySegment(x, y, point[0], point[1], next[0], next[1]) <= radius;
    }));
  }

  function circleIntersectsBarrier(barrier, x, y, radius) {
    const points = Array.isArray(barrier.points) ? barrier.points : [];
    const allowance = radius + Math.max(1.5, Number(barrier.width) || 3) / 2;
    return points.slice(1).some((point, index) => distanceToGeometrySegment(
      x, y, points[index][0], points[index][1], point[0], point[1],
    ) <= allowance);
  }

  const CITY_STATIC_BUCKET_SIZE = 128;
  let cityStaticCollisionIndex = null;

  function ensureCityStaticCollisionIndex() {
    if (cityStaticCollisionIndex) return cityStaticCollisionIndex;
    const buckets = new Map();
    const records = [];
    const addRecord = (record) => {
      records.push(record);
      const minCol = Math.floor(record.bounds.x / CITY_STATIC_BUCKET_SIZE);
      const maxCol = Math.floor((record.bounds.x + record.bounds.w) / CITY_STATIC_BUCKET_SIZE);
      const minRow = Math.floor(record.bounds.y / CITY_STATIC_BUCKET_SIZE);
      const maxRow = Math.floor((record.bounds.y + record.bounds.h) / CITY_STATIC_BUCKET_SIZE);
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const key = `${col},${row}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(record);
        }
      }
    };
    cityBuildingFootprints.filter((feature) => feature.solid !== false && feature.points?.length >= 3)
      .forEach((feature) => addRecord({ type: "building", feature, bounds: geometryBounds(feature.points, 12) }));
    cityBarrierSegments.filter((feature) => feature.solid !== false && feature.points?.length >= 2)
      .forEach((feature) => {
        const padding = Math.max(12, Number(feature.width) || 3);
        addRecord({ type: "barrier", feature, bounds: geometryBounds(feature.points, padding) });
      });
    cityStaticCollisionIndex = { buckets, records };
    document.documentElement.dataset.staticBuildingColliders = String(cityBuildingFootprints.length);
    document.documentElement.dataset.staticBarrierColliders = String(cityBarrierSegments.length);
    return cityStaticCollisionIndex;
  }

  function staticCollisionRecordsNear(x, y, radius = 0) {
    const { buckets } = ensureCityStaticCollisionIndex();
    const records = new Set();
    const minCol = Math.floor((x - radius) / CITY_STATIC_BUCKET_SIZE);
    const maxCol = Math.floor((x + radius) / CITY_STATIC_BUCKET_SIZE);
    const minRow = Math.floor((y - radius) / CITY_STATIC_BUCKET_SIZE);
    const maxRow = Math.floor((y + radius) / CITY_STATIC_BUCKET_SIZE);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        (buckets.get(`${col},${row}`) || []).forEach((record) => records.add(record));
      }
    }
    return [...records];
  }

  function staticGeometryBlocksPosition(x, y, radius = 9) {
    return staticCollisionRecordsNear(x, y, radius).some((record) => (
      record.type === "building"
        ? circleIntersectsPolygonFeature(record.feature, x, y, radius)
        : circleIntersectsBarrier(record.feature, x, y, radius)
    ));
  }

  const WORLD_ASSET_BUCKET_SIZE = 128;
  let worldAssetColliderIndex = null;

  function ensureWorldAssetColliderIndex() {
    if (worldAssetColliderIndex) return worldAssetColliderIndex;
    const buckets = new Map();
    const records = [];
    cityWorldAssets.forEach((asset) => {
      if (asset.solid === false) return;
      worldAssetColliderRects(asset).forEach((rect) => {
        const record = { asset, rect };
        records.push(record);
        const minCol = Math.floor(rect.x / WORLD_ASSET_BUCKET_SIZE);
        const maxCol = Math.floor((rect.x + rect.w) / WORLD_ASSET_BUCKET_SIZE);
        const minRow = Math.floor(rect.y / WORLD_ASSET_BUCKET_SIZE);
        const maxRow = Math.floor((rect.y + rect.h) / WORLD_ASSET_BUCKET_SIZE);
        for (let row = minRow; row <= maxRow; row += 1) {
          for (let col = minCol; col <= maxCol; col += 1) {
            const key = `${col},${row}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(record);
          }
        }
      });
    });
    worldAssetColliderIndex = { buckets, records };
    document.documentElement.dataset.worldAssetColliders = String(records.length);
    return worldAssetColliderIndex;
  }

  function worldAssetColliderRecordsNear(x, y, radius = 0) {
    const { buckets } = ensureWorldAssetColliderIndex();
    const records = new Set();
    const minCol = Math.floor((x - radius) / WORLD_ASSET_BUCKET_SIZE);
    const maxCol = Math.floor((x + radius) / WORLD_ASSET_BUCKET_SIZE);
    const minRow = Math.floor((y - radius) / WORLD_ASSET_BUCKET_SIZE);
    const maxRow = Math.floor((y + radius) / WORLD_ASSET_BUCKET_SIZE);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        (buckets.get(`${col},${row}`) || []).forEach((record) => records.add(record));
      }
    }
    return [...records];
  }

  function worldAssetBlocksPosition(x, y, radius = 9) {
    return worldAssetColliderRecordsNear(x, y, radius)
      .some(({ rect }) => circleIntersectsRect(x, y, radius, rect));
  }

  function editorVacatedAt(x, y, radius = 0) {
    return (CITY_MAP.editorVacatedRects || []).some((rect) => (
      x + radius >= rect.x && x - radius <= rect.x + rect.w
      && y + radius >= rect.y && y - radius <= rect.y + rect.h
    ));
  }

  function navigationMaskAllowsPosition(x, y, radius = 9) {
    if (!cityNavigationMaskReady || !cityNavigationMaskData) return null;
    const cellSize = Number(CITY_MAP.navigationMask?.cellSize) || 8;
    const samples = [[0, 0]];
    for (let index = 0; index < 12; index += 1) {
      const angle = Math.PI * 2 * index / 12;
      samples.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    return samples.every(([offsetX, offsetY]) => {
      if (editorVacatedAt(x + offsetX, y + offsetY)) return true;
      const col = Math.floor((x + offsetX) / cellSize);
      const row = Math.floor((y + offsetY) / cellSize);
      if (col < 0 || row < 0 || col >= cityNavigationMaskData.width || row >= cityNavigationMaskData.height) return false;
      return cityNavigationMaskData.pixels[row * cityNavigationMaskData.width + col] >= 128;
    });
  }

  function cityMapCanOccupy(x, y) {
    const radius = 9;
    if (x < radius || y < radius || x > WORLD_WIDTH - radius || y > WORLD_HEIGHT - radius) return false;
    const tileSamples = [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]].map(([offsetX, offsetY]) => {
      const tile = worldToTile(x + offsetX, y + offsetY);
      const key = tileKey(tile.col, tile.row);
      return { ...tile, key, type: mapTileType(tile.col, tile.row), override: tileOverrides.get(key) };
    });
    if (tileSamples.some((sample) => sample.type === "door" || sample.override === "blocked")) return false;
    const forcedOpen = tileSamples.every((sample) => ["walkable", "encounter", "event"].includes(sample.override));
    const semanticOpen = navigationMaskAllowsPosition(x, y, radius);
    const tilesAreOpen = forcedOpen || (semanticOpen === null
      ? tileSamples.every((sample) => sample.type !== "blocked")
      : semanticOpen);
    const vacatedByEditor = editorVacatedAt(x, y, radius);
    return tilesAreOpen && (vacatedByEditor || !staticGeometryBlocksPosition(x, y, radius)) && !worldAssetBlocksPosition(x, y, radius);
  }

  function entranceAt(col, row) {
    return entranceTileIndex.get(tileKey(col, row)) || null;
  }

  function mapEventsAt(col, row, trigger = null) {
    const events = eventTileIndex.get(tileKey(col, row)) || [];
    return trigger ? events.filter((event) => event.trigger === trigger) : [...events];
  }

  function nearbyMapInteraction() {
    const offsets = { up: [0, -24], down: [0, 24], left: [-24, 0], right: [24, 0] };
    const [offsetX, offsetY] = offsets[state.direction] || [0, 0];
    const candidates = [worldToTile(state.worldX + offsetX, state.worldY + offsetY), worldToTile(state.worldX, state.worldY)];
    for (const tile of candidates) {
      const type = mapTileType(tile.col, tile.row);
      const entrance = entranceAt(tile.col, tile.row);
      if (entrance) return { id: "map_entrance", type: "door", ...tile, entrance };
      const configuredEvents = mapEventsAt(tile.col, tile.row);
      const event = configuredEvents
        .filter((entry) => entry.trigger === "interact")
        .find((entry) => !entry.once || !state.triggeredEvents.includes(entry.id));
      if (event) return { id: "map_event", type: "event", ...tile, event };
      if (type === "door" || (type === "event" && !configuredEvents.length)) return { id: "map_tile", type, ...tile, event: null };
    }
    return null;
  }

  function createPlayerFrameCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE_CELL_SIZE; canvas.height = SPRITE_CELL_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    return canvas;
  }

  function copyPlayerFrame(source, mirror = false) {
    const canvas = createPlayerFrameCanvas();
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (mirror) {
      context.save();
      context.translate(SPRITE_CELL_SIZE, 0);
      context.scale(-1, 1);
      context.drawImage(source, 0, 0);
      context.restore();
    } else {
      context.drawImage(source, 0, 0);
    }
    return canvas;
  }

  function lockPlayerFrameHead(frame, canonical) {
    const context = frame.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, SPRITE_CELL_SIZE, PLAYER_HEAD_LOCK_HEIGHT);
    context.drawImage(canonical, 0, 0, SPRITE_CELL_SIZE, PLAYER_HEAD_LOCK_HEIGHT,
      0, 0, SPRITE_CELL_SIZE, PLAYER_HEAD_LOCK_HEIGHT);
  }

  function replacePlayerFrameLegs(frame, oppositeStride, direction) {
    const context = frame.getContext("2d", { willReadFrequently: true });
    const masks = PLAYER_LEG_MASKS[direction];
    masks.forEach((mask) => context.clearRect(mask.x, mask.y, mask.width, mask.height));
    context.save();
    context.beginPath();
    masks.forEach((mask) => context.rect(mask.x, mask.y, mask.width, mask.height));
    context.clip();
    context.translate(SPRITE_CELL_SIZE, 0);
    context.scale(-1, 1);
    context.drawImage(oppositeStride, 0, 0);
    context.restore();
  }

  function resetPlayerAnimation() {
    animationFrame = 0;
    animationTime = 0;
    playerRunning = false;
    elements.runBadge?.classList.add("hidden");
  }

  function playerFramePixels(frame) {
    return frame.getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, SPRITE_CELL_SIZE, SPRITE_CELL_SIZE).data;
  }

  function playerFrameRegionEqual(first, second, top = 0, bottom = SPRITE_CELL_SIZE) {
    const firstPixels = playerFramePixels(first); const secondPixels = playerFramePixels(second);
    for (let y = top; y < bottom; y += 1) {
      for (let x = 0; x < SPRITE_CELL_SIZE; x += 1) {
        const start = (y * SPRITE_CELL_SIZE + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          if (firstPixels[start + channel] !== secondPixels[start + channel]) return false;
        }
      }
    }
    return true;
  }

  function playerFrameOutsideMasksEqual(first, second, masks, top = 0) {
    const firstPixels = playerFramePixels(first); const secondPixels = playerFramePixels(second);
    for (let y = top; y < SPRITE_CELL_SIZE; y += 1) {
      for (let x = 0; x < SPRITE_CELL_SIZE; x += 1) {
        const masked = masks.some((mask) => x >= mask.x && x < mask.x + mask.width
          && y >= mask.y && y < mask.y + mask.height);
        if (masked) continue;
        const start = (y * SPRITE_CELL_SIZE + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          if (firstPixels[start + channel] !== secondPixels[start + channel]) return false;
        }
      }
    }
    return true;
  }

  function playerFrameBottom(frame) {
    const pixels = playerFramePixels(frame);
    for (let y = SPRITE_CELL_SIZE - 1; y >= 0; y -= 1) {
      for (let x = 0; x < SPRITE_CELL_SIZE; x += 1) {
        if (pixels[(y * SPRITE_CELL_SIZE + x) * 4 + 3] > 0) return y;
      }
    }
    return -1;
  }

  function playerSupportIoU(first, second) {
    const firstPixels = playerFramePixels(first); const secondPixels = playerFramePixels(second);
    let intersection = 0; let union = 0;
    for (let x = 0; x < SPRITE_CELL_SIZE; x += 1) {
      const pixel = (PLAYER_SUPPORT_ROW * SPRITE_CELL_SIZE + x) * 4 + 3;
      const firstOpaque = firstPixels[pixel] > 0; const secondOpaque = secondPixels[pixel] > 0;
      if (firstOpaque && secondOpaque) intersection += 1;
      if (firstOpaque || secondOpaque) union += 1;
    }
    return union ? intersection / union : 1;
  }

  function renderPlayerAnimationDebugAtlas() {
    if (!LOCAL_DEBUG_PLAYER_ATLAS) return;
    document.querySelector("#playerAnimationDebugAtlas")?.remove();
    const canvas = document.createElement("canvas");
    canvas.id = "playerAnimationDebugAtlas";
    canvas.width = 512; canvas.height = 512;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Atlas corregido del protagonista: abajo, izquierda, derecha y arriba");
    canvas.style.cssText = "position:fixed;inset:50% auto auto 50%;width:min(512px,92vw);height:auto;transform:translate(-50%,-50%);z-index:9999;border:4px solid #fff;background:#17212b;box-shadow:0 18px 60px rgba(0,0,0,.65);image-rendering:pixelated";
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        context.fillStyle = (row + col) % 2 ? "#263442" : "#1d2934";
        context.fillRect(col * 64, row * 64, 64, 64);
      }
    }
    ["down", "left", "right", "up"].forEach((direction, row) => {
      const frames = playerFrames.get(`walk-${direction}`) || [];
      frames.forEach((frame, column) => {
        context.drawImage(frame, column * 128, row * 128, 128, 128);
        context.strokeStyle = "rgba(255,255,255,.24)";
        context.strokeRect(column * 128 + .5, row * 128 + .5, 127, 127);
      });
    });
    document.body.appendChild(canvas);
    document.documentElement.dataset.playerAtlasDebug = "true";
  }

  function buildPlayerFrames() {
    playerFrames.clear();
    const directionRows = { down: 0, left: 1, right: 2, up: 3 };
    const rawFrames = new Map();
    Object.entries(directionRows).forEach(([direction, row]) => {
      const frames = [];
      for (let index = 0; index < 4; index += 1) {
        const canvas = createPlayerFrameCanvas();
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(playerSheet, index * SPRITE_CELL_SIZE, row * SPRITE_CELL_SIZE,
          SPRITE_CELL_SIZE, SPRITE_CELL_SIZE, 0, 0, SPRITE_CELL_SIZE, SPRITE_CELL_SIZE);
        frames.push(canvas);
      }
      rawFrames.set(direction, frames);
    });

    const oppositeDirection = { left: "right", right: "left", down: "down", up: "up" };
    const metrics = {};
    let minimumOpaquePixels = Infinity;
    let pixelInspectionAvailable = true;
    Object.keys(directionRows).forEach((direction) => {
      const raw = rawFrames.get(direction);
      const canonical = raw[0];
      const frame0 = copyPlayerFrame(canonical);
      const frame1 = copyPlayerFrame(raw[1]);
      const frame2 = copyPlayerFrame(canonical);
      const oppositeStride = rawFrames.get(oppositeDirection[direction])[1];
      const frame3 = copyPlayerFrame(raw[3]);
      replacePlayerFrameLegs(frame3, oppositeStride, direction);
      lockPlayerFrameHead(frame1, canonical);
      lockPlayerFrameHead(frame3, canonical);
      const frames = [frame0, frame1, frame2, frame3];
      playerFrames.set(`walk-${direction}`, frames);
      playerFrames.set(`run-${direction}`, frames);

      if (pixelInspectionAvailable) {
        try {
          frames.forEach((frame) => {
            const pixels = playerFramePixels(frame);
            let opaquePixels = 0;
            for (let pixel = 3; pixel < pixels.length; pixel += 4) if (pixels[pixel] > 0) opaquePixels += 1;
            minimumOpaquePixels = Math.min(minimumOpaquePixels, opaquePixels);
          });
          metrics[direction] = {
            cap: frames.every((frame) => playerFrameRegionEqual(frame0, frame, 0, PLAYER_HEAD_LOCK_HEIGHT)),
            neutral: playerFrameRegionEqual(frame0, frame2),
            body: playerFrameOutsideMasksEqual(frame3, raw[3], PLAYER_LEG_MASKS[direction], PLAYER_HEAD_LOCK_HEIGHT),
            support: frames.every((frame) => playerFrameBottom(frame) === PLAYER_SUPPORT_ROW),
            strideIoU: Number(playerSupportIoU(frame1, frame3).toFixed(3)),
          };
        } catch (error) {
          /* file:// vuelve opaco el canvas por seguridad. La lectura es solo
             diagnóstica: los fotogramas reconstruidos siguen siendo válidos. */
          pixelInspectionAvailable = false;
        }
      }
    });
    const metricValues = Object.values(metrics);
    document.documentElement.dataset.playerFrames = [...playerFrames].map(([name, frames]) => `${name}:${frames.length}`).join(",");
    document.documentElement.dataset.playerOpaqueMin = pixelInspectionAvailable ? String(minimumOpaquePixels) : "unavailable-file-origin";
    document.documentElement.dataset.playerCapStable = pixelInspectionAvailable ? String(metricValues.every((metric) => metric.cap)) : "unavailable";
    document.documentElement.dataset.playerNeutralStable = pixelInspectionAvailable ? String(metricValues.every((metric) => metric.neutral)) : "unavailable";
    document.documentElement.dataset.playerBodyStable = pixelInspectionAvailable ? String(metricValues.every((metric) => metric.body)) : "unavailable";
    document.documentElement.dataset.playerSupportStable = pixelInspectionAvailable ? String(metricValues.every((metric) => metric.support)) : "unavailable";
    document.documentElement.dataset.playerStrideAlternates = pixelInspectionAvailable ? String(metricValues.every((metric) => metric.strideIoU < .8)) : "unavailable";
    document.documentElement.dataset.playerAnimationMetrics = pixelInspectionAvailable
      ? Object.entries(metrics).map(([direction, metric]) => `${direction}:cap=${Number(metric.cap)},neutral=${Number(metric.neutral)},body=${Number(metric.body)},support=${Number(metric.support)},stride=${metric.strideIoU}`).join(";")
      : "unavailable";
    renderPlayerAnimationDebugAtlas();
  }

  function enterWorldForBuildingEditor() {
    const titleVisible = !elements.titleScreen.classList.contains("hidden");
    const starterIntroVisible = !elements.starterIntroScreen.classList.contains("hidden");
    if (!titleVisible && !starterIntroVisible) return;

    /* El editor vive dentro de worldScreen. Si se abre desde la portada, primero
       hay que mostrar el mundo; de lo contrario el panel recibe la clase `open`
       pero permanece dentro de una pantalla oculta. */
    if (!state.started) {
      if (!state.team.length) {
        state = defaultState();
        state.starterChosen = true;
        state.team = [createPokemon(PETRILLO_ID, 5)];
        state.caught = [PETRILLO_ID];
        state.seen = [PETRILLO_ID];
      }
      state.started = true;
    }
    starterIntroActive = false;
    elements.starterIntroVideo.pause();
    elements.playStarterIntro.classList.add("hidden");
    elements.starterModal.classList.add("hidden");
    showWorld();
  }

  function openBuildingEditor() {
    if (!developerEditorEnabled) return;
    enterWorldForBuildingEditor();
    if (!elements.battleScreen.classList.contains("hidden")) {
      setBattleMessage("Termina el combate para abrir el modo dios.");
      return;
    }
    if (!state.started || state.dimension !== "san_pablo" || state.interior) {
      if (!elements.worldScreen.classList.contains("hidden")) showAreaToast("MODO DIOS · SOLO EN EL EXTERIOR");
      return;
    }
    if (elements.worldScreen.classList.contains("hidden")) return;
    closeSanpledex(false); closeTeam(); closeInventoryPanel();
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
    const labels = { inherit: "Valor original", walkable: "Transitable", blocked: "Bloqueada", door: "Puerta", encounter: "Hierba / encuentro", event: "Evento" };
    elements.tileEditorHint.textContent = `Modo actual: ${labels[selectedTileType]}`;
    $$('[data-tile-type]').forEach((button) => button.classList.toggle("selected", button.dataset.tileType === selectedTileType));
    if (!selectedMapTile) {
      elements.tileSelectionInfo.innerHTML = "<span>Selecciona una casilla</span><span>C— · F—</span>";
      return;
    }
    const type = mapTileType(selectedMapTile.col, selectedMapTile.row);
    const centerX = selectedMapTile.col * CITY_MAP.tileSize + CITY_MAP.tileSize / 2;
    const centerY = selectedMapTile.row * CITY_MAP.tileSize + CITY_MAP.tileSize / 2;
    elements.tileSelectionInfo.innerHTML = `<span>${labels[type]}</span><span>C${selectedMapTile.col} · F${selectedMapTile.row}<br>X${centerX} · Y${centerY}</span>`;
  }

  function handleMapEditorClick(event) {
    if (!elements.buildingEditor.classList.contains("open")) return;
    if (window.PokemonMapEditor?.consumeLegacyClick?.(event)) return;
    const rect = elements.canvas.getBoundingClientRect();
    const worldX = camera.x + (event.clientX - rect.left) * (VIEW_WIDTH / rect.width);
    const worldY = camera.y + (event.clientY - rect.top) * (VIEW_HEIGHT / rect.height);
    selectedMapTile = worldToTile(worldX, worldY);
    if (selectedTileType === "inherit") tileOverrides.delete(tileKey(selectedMapTile.col, selectedMapTile.row));
    else tileOverrides.set(tileKey(selectedMapTile.col, selectedMapTile.row), selectedTileType);
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
    closeSanpledex(false); closeTeam(); closeBuildingEditorPanel(); clearDirectionalInput();
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
      if (["balls", "ultraBalls", "masterBalls"].includes(item.key)) {
        action = inventoryOpenedFromBattle ? "LANZAR" : "COMBATE";
        disabled = disabled || !inventoryOpenedFromBattle;
      } else if (["potions", "maxPotions", "berries"].includes(item.key)) {
        action = "USAR";
        disabled = disabled || !active || active.hp >= active.maxHp;
      } else if (item.key === "rareCandies") {
        action = "USAR";
        disabled = disabled || !active || active.level >= 50;
      } else if (item.key === "prismBatteries") {
        action = "USAR";
        disabled = disabled || state.dimension !== "prism" || ensureMazeState().lightCharges >= 3;
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
    if (["balls", "ultraBalls", "masterBalls"].includes(key)) {
      closeInventoryPanel();
      await throwBall(key === "masterBalls" ? "master" : key === "ultraBalls" ? "ultra" : "poke");
      return;
    }

    if (key === "prismBatteries") {
      if (state.dimension !== "prism") return;
      const maze = ensureMazeState();
      if (maze.lightCharges >= 3) return;
      state.inventory.prismBatteries -= 1;
      maze.lightCharges = Math.min(3, maze.lightCharges + 1);
      closeInventoryPanel(); renderHud(); updateMazeHud(); saveGame();
      playTone(980, .14, "sine", .04);
      showAreaToast(`LUZ RECARGADA · ${maze.lightCharges} USOS`);
      return;
    }

    const active = activePokemon();
    if (!active) return;
    if (["potions", "maxPotions", "berries"].includes(key)) {
      if (active.hp >= active.maxHp) return;
      const healing = key === "maxPotions" ? active.maxHp : key === "potions" ? 20 : 10;
      const recovered = Math.min(healing, active.maxHp - active.hp);
      state.inventory[key] -= 1;
      active.hp = Math.min(active.maxHp, active.hp + healing);
      closeInventoryPanel();
      renderHud(); saveGame(); playJingle("success");
      if (battle) {
        setBattleBusy(true); updateBattleHealth(); setBattleMessage(`¡${speciesOf(active).name} recuperó ${recovered} PS!`);
        await wait(800); await enemyTurn();
      } else showAreaToast(`${speciesOf(active).name.toUpperCase()} RECUPERA ${recovered} PS`);
      return;
    }

    if (key === "rareCandies") {
      if (active.level >= 50) return;
      state.inventory.rareCandies -= 1;
      const previousName = speciesOf(active).name;
      active.level += 1; active.maxHp += 3; active.hp = active.maxHp;
      const evolutions = evolvePokemonIfReady(active);
      state.trainerLevel = Math.max(1, Math.floor(state.team.reduce((sum, member) => sum + member.level, 0) / state.team.length) - 3);
      closeInventoryPanel(); renderHud(); saveGame(); playJingle("level");
      if (battle) {
        setBattleBusy(true); renderBattle(); setBattleMessage(`¡${previousName} subió al nivel ${active.level}!`);
        await wait(900);
        for (const evolution of evolutions) { renderBattle(); setBattleMessage(`¡${evolution.from} evolucionó a ${evolution.to}!`); playJingle("success"); await wait(1200); }
        await enemyTurn();
      } else {
        const messages = [`¡${previousName} subió al nivel ${active.level}!`, ...evolutions.map((evolution) => `¡${evolution.from} evolucionó a ${evolution.to}!`)];
        showDialog(messages, "★");
      }
    }
  }

  function createPokemon(id, level = 3) {
    const species = POKEMON[id];
    const maxHp = species.baseHp + level * 3;
    return { id, level, exp: 0, hp: maxHp, maxHp };
  }

  function evolvePokemonIfReady(member) {
    const evolutions = [];
    let species = speciesOf(member);
    while (species?.evolvesTo && member.level >= species.evolveLevel && POKEMON[species.evolvesTo]) {
      const nextSpecies = POKEMON[species.evolvesTo];
      evolutions.push({ from: species.name, to: nextSpecies.name, fromId: species.id, toId: nextSpecies.id });
      const hpDelta = nextSpecies.baseHp - species.baseHp;
      member.maxHp = Math.max(1, member.maxHp + hpDelta);
      member.hp = clamp(member.hp + hpDelta, 0, member.maxHp);
      member.id = nextSpecies.id;
      if (!state.seen.includes(nextSpecies.id)) state.seen.push(nextSpecies.id);
      if (!state.caught.includes(nextSpecies.id)) state.caught.push(nextSpecies.id);
      species = nextSpecies;
    }
    return evolutions;
  }

  function normalizeMonsterId(id) {
    const numericId = Number(id);
    if (POKEMON[numericId]) return numericId;
    return LEGACY_MONSTER_REPLACEMENTS[numericId] || null;
  }

  function hydratePokemon(member) {
    if (!member || typeof member !== "object") return null;
    const species = POKEMON[normalizeMonsterId(member.id)];
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
      next.caught = Array.isArray(saved.caught) ? [...new Set(saved.caught.map(normalizeMonsterId).filter(Boolean))] : [];
      next.seen = Array.isArray(saved.seen) ? [...new Set(saved.seen.map(normalizeMonsterId).filter(Boolean))] : [];
      next.worldX = clamp(Number(saved.worldX) || NORMAL_START.x, 35, WORLD_WIDTH - 35);
      next.worldY = clamp(Number(saved.worldY) || NORMAL_START.y, 45, WORLD_HEIGHT - 30);
      if (saved.mapRevision !== MAP_REVISION) {
        next.worldX = NORMAL_START.x;
        next.worldY = NORMAL_START.y;
        next.direction = NORMAL_START.direction;
        next.mapRevision = MAP_REVISION;
        next.interior = null;
        next.maintenanceReturn = null;
      }
      next.buildingSkins = saved.buildingSkins && typeof saved.buildingSkins === "object" ? { ...saved.buildingSkins } : {};
      next.gifts = saved.gifts && typeof saved.gifts === "object" ? { ...saved.gifts } : {};
      next.doctorPotatoIntroSeen = Boolean(saved.doctorPotatoIntroSeen || next.gifts.doctorPotato);
      next.doctorPotatoIntroPending = Boolean(saved.doctorPotatoIntroPending) && !next.doctorPotatoIntroSeen;
      next.fragmentCinematicSeen = Boolean(saved.fragmentCinematicSeen);
      next.inventory = { ...defaultState().inventory, ...(saved.inventory || {}) };
      const defaultBlackMarket = defaultState().blackMarket;
      const savedBlackMarket = saved.blackMarket && typeof saved.blackMarket === "object" ? saved.blackMarket : {};
      const savedBlackMarketPurchases = savedBlackMarket.purchases && typeof savedBlackMarket.purchases === "object"
        ? savedBlackMarket.purchases
        : {};
      next.blackMarket = {
        ...defaultBlackMarket,
        ...savedBlackMarket,
        discovered: Boolean(savedBlackMarket.discovered),
        purchases: { ...defaultBlackMarket.purchases },
      };
      Object.entries(BLACK_MARKET_LIMITS).forEach(([key, limit]) => {
        next.blackMarket.purchases[key] = clamp(Math.floor(Number(savedBlackMarketPurchases[key]) || 0), 0, limit);
      });
      next.collectedObjects = Array.isArray(saved.collectedObjects) ? [...new Set(saved.collectedObjects)] : [];
      next.triggeredEvents = Array.isArray(saved.triggeredEvents)
        ? [...new Set(saved.triggeredEvents.filter((id) => typeof id === "string").slice(0, 500))]
        : [];
      next.secretPokemonId = normalizeMonsterId(saved.secretPokemonId);
      next.interior = saved.interior === "maintenance" ? "maintenance" : null;
      next.interiorData = null;
      next.maintenanceReturn = saved.maintenanceReturn && Number.isFinite(saved.maintenanceReturn.x) && Number.isFinite(saved.maintenanceReturn.y)
        ? {
          x: clamp(saved.maintenanceReturn.x, 105, WORLD_WIDTH - 105),
          y: clamp(saved.maintenanceReturn.y, 90, WORLD_HEIGHT - 90),
          direction: saved.maintenanceReturn.direction || "down",
          buildingId: saved.maintenanceReturn.buildingId || null,
        }
        : null;
      if (saved.mapRevision !== MAP_REVISION) { next.interior = null; next.maintenanceReturn = null; }
      if (next.interior && !next.maintenanceReturn) next.interior = null;
      if ((Number(saved.version) || 0) < 4) {
        next.secretPokemonSaved = false;
        next.secretPokemonId = null;
      }
      next.version = defaultState().version;
      next.dimension = saved.dimension === "prism" ? "prism" : "san_pablo";
      if (next.dimension === "prism") {
        next.dimension = "san_pablo";
        const portalReturn = currentPortalReturn();
        next.worldX = portalReturn.x;
        next.worldY = portalReturn.y;
        next.returnPosition = null;
        next.interior = null;
        next.maintenanceReturn = null;
      }
      if (LOCAL_DEBUG_SPAWN && !next.interior) {
        next.worldX = LOCAL_DEBUG_SPAWN.x;
        next.worldY = LOCAL_DEBUG_SPAWN.y;
        next.direction = LOCAL_DEBUG_SPAWN.direction;
      }
      if (next.dimension === "san_pablo" && !next.interior && !cityMapCanOccupy(next.worldX, next.worldY)) {
        next.worldX = NORMAL_START.x;
        next.worldY = NORMAL_START.y;
        next.direction = NORMAL_START.direction;
        next.mapRevision = MAP_REVISION;
      }
      next.activeTeamIndex = clamp(Number(saved.activeTeamIndex) || 0, 0, Math.max(0, next.team.length - 1));
      state = next;
      state.team.forEach((member) => evolvePokemonIfReady(member));
      updateMapTileStreaming();
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
    const backgrounds = { Planta: "#dcebc5", Fuego: "#f5ddc8", Agua: "#d6e9ef", Roca: "#e8dfc8" };
    elements.starterGrid.innerHTML = STARTERS.map((starter) => `
      <article class="starter-card" style="--starter-color:${TYPE_COLORS[starter.type]};--starter-bg:${backgrounds[starter.type]}">
        <img class="${isPetrillo(starter.id) ? "custom-pokemon-sprite petrillo-sprite petrillo-starter-sprite" : ""}" src="${artworkUrl(starter.id)}" alt="${starter.name}" draggable="false" />
        <h3>${starter.name}</h3><span class="starter-type">${starter.type}</span>
        <p>${starter.description}</p><button type="button" data-starter="${starter.id}">Elegir a ${starter.name}</button>
      </article>
    `).join("");
    $$('[data-starter]').forEach((button) => button.addEventListener("click", () => chooseStarter(Number(button.dataset.starter))));
  }

  function startNewGame() {
    primeDialogMusic(DOCTOR_POTATO_THEME_URL);
    if (VOICE_NPC_ENABLED) requestVoiceNpcAccess();
    requestGameFullscreen();
    fragmentCinematicActive = false;
    elements.fragmentCinematicVideo.pause();
    elements.fragmentCinematicScreen.classList.add("hidden");
    doctorPotatoScene = null;
    document.documentElement.dataset.doctorPotatoScene = "idle";
    elements.worldScreen.classList.remove("cinematic-dialog");
    state = defaultState();
    elements.starterModal.classList.remove("hidden");
    playTone(560, .08, "square", .035);
  }

  function chooseStarter(id) {
    state.started = false;
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
    showStarterIntro(id);
  }

  function showStarterIntro(id) {
    starterIntroActive = true;
    stopBackgroundMusic();
    elements.titleScreen.classList.add("hidden");
    elements.worldScreen.classList.add("hidden");
    elements.battleScreen.classList.add("hidden");
    elements.starterIntroScreen.classList.remove("hidden");
    elements.playStarterIntro.classList.add("hidden");
    elements.starterIntroStatus.textContent = `${POKEMON[id].name} te acompañará por las calles de San Pablo.`;
    elements.starterIntroVideo.muted = !state.sound;
    try { elements.starterIntroVideo.currentTime = 0; } catch (error) { /* metadata is not ready yet */ }
    const playback = elements.starterIntroVideo.play();
    if (playback?.catch) {
      playback.catch(() => {
        if (!starterIntroActive) return;
        elements.playStarterIntro.classList.remove("hidden");
        elements.starterIntroStatus.textContent = "Pulsa reproducir para ver la introducción antes de entrar al juego.";
      });
    }
  }

  function resumeStarterIntro() {
    if (!starterIntroActive) return;
    elements.starterIntroVideo.muted = !state.sound;
    const playback = elements.starterIntroVideo.play();
    if (playback?.then) playback.then(() => elements.playStarterIntro.classList.add("hidden")).catch(() => {});
  }

  function startFragmentCinematic() {
    if (fragmentCinematicActive || state.fragmentCinematicSeen || state.inventory.prismShards < 3 || !state.started) return false;
    fragmentCinematicActive = true;
    inputLocked = true;
    clearDirectionalInput();
    closeSanpledex(false); closeTeam(); closeBuildingEditorPanel(); closeInventoryPanel(); closeShop();
    stopBackgroundMusic();
    elements.fragmentCinematicScreen.classList.remove("hidden");
    elements.playFragmentCinematic.classList.add("hidden");
    elements.fragmentCinematicStatus.textContent = "Una presencia desconocida despierta al otro lado del portal.";
    elements.fragmentCinematicVideo.muted = !state.sound;
    try { elements.fragmentCinematicVideo.currentTime = 0; } catch (error) { /* metadata is not ready yet */ }
    document.documentElement.dataset.fragmentCinematic = "playing";
    const playback = elements.fragmentCinematicVideo.play();
    if (playback?.catch) {
      playback.catch(() => {
        if (!fragmentCinematicActive) return;
        document.documentElement.dataset.fragmentCinematic = "waiting";
        elements.playFragmentCinematic.classList.remove("hidden");
        elements.fragmentCinematicStatus.textContent = "Pulsa reproducir para contemplar la visión de los fragmentos.";
      });
    }
    return true;
  }

  function resumeFragmentCinematic() {
    if (!fragmentCinematicActive) return;
    elements.fragmentCinematicVideo.muted = !state.sound;
    const playback = elements.fragmentCinematicVideo.play();
    if (playback?.then) {
      playback.then(() => {
        document.documentElement.dataset.fragmentCinematic = "playing";
        elements.playFragmentCinematic.classList.add("hidden");
        elements.fragmentCinematicStatus.textContent = "Una presencia desconocida despierta al otro lado del portal.";
      }).catch(() => {});
    }
  }

  function finishFragmentCinematic() {
    if (!fragmentCinematicActive) return;
    fragmentCinematicActive = false;
    elements.fragmentCinematicVideo.pause();
    elements.fragmentCinematicScreen.classList.add("hidden");
    elements.playFragmentCinematic.classList.add("hidden");
    state.fragmentCinematicSeen = true;
    inputLocked = false;
    document.documentElement.dataset.fragmentCinematic = "complete";
    saveGame();
    if (state.sound) startBackgroundMusic();
    showDialog([
      "La visión se desvanece, pero su llamada permanece dentro de los fragmentos.",
      "El portal del campo de fútbol ya puede abrirse.",
    ], "◇", () => showAreaToast("PORTAL PRISMA DESBLOQUEADO"));
  }

  function beginWorldEvents(onComplete) {
    const afterDoctorPotato = () => {
      if (!startFragmentCinematic() && typeof onComplete === "function") onComplete();
    };
    if (!startDoctorPotatoIntro(afterDoctorPotato)) afterDoctorPotato();
  }

  function finishStarterIntro() {
    if (!starterIntroActive) return;
    primeDialogMusic(DOCTOR_POTATO_THEME_URL);
    starterIntroActive = false;
    elements.starterIntroVideo.pause();
    elements.starterIntroScreen.classList.add("hidden");
    state.started = true;
    state.doctorPotatoIntroPending = true;
    state.doctorPotatoIntroSeen = false;
    showWorld();
    saveGame();
    playJingle("success");
    beginWorldEvents(showOpeningTutorial);
  }

  function continueGame() {
    primeDialogMusic(DOCTOR_POTATO_THEME_URL);
    if (VOICE_NPC_ENABLED) requestVoiceNpcAccess();
    requestGameFullscreen();
    if (!loadGame()) return;
    showWorld();
    beginWorldEvents(() => showAreaToast("CIUDAD POKÉMON"));
  }

  function showWorld() {
    elements.titleScreen.classList.add("hidden");
    elements.starterIntroScreen.classList.add("hidden");
    elements.battleScreen.classList.add("hidden");
    elements.worldScreen.classList.remove("hidden");
    elements.buildingEditorButton.disabled = state.dimension === "prism" || Boolean(state.interior);
    elements.worldScreen.classList.toggle("maze-mode", state.dimension === "prism");
    elements.mazeHud.classList.toggle("hidden", state.dimension !== "prism");
    if (VOICE_NPC_ENABLED && state.dimension === "san_pablo" && !state.interior) placeVoiceNpcNearPlayer();
    renderHud();
    if (state.started) startBackgroundMusic();
  }

  function renderHud() {
    elements.trainerLevel.textContent = state.trainerLevel;
    elements.ballCount.textContent = state.balls;
    elements.caughtCount.textContent = state.caught.length;
    if (elements.money) elements.money.textContent = `${state.money} ₽`;
    elements.battleBallCount.textContent = `× ${state.balls + state.inventory.ultraBalls + state.inventory.masterBalls}`;
    elements.soundIcon.textContent = state.sound ? "♪" : "×";
    document.documentElement.dataset.blackMarketMasterRemaining = String(Math.max(
      0,
      BLACK_MARKET_LIMITS.masterBall - (Number(state.blackMarket.purchases.masterBall) || 0),
    ));
    const objectives = [
      "Explora Ciudad Pokémon",
      "Captura tu primer Pokémon salvaje",
      "Forma un equipo de 3 Pokémon",
      "Visita el Centro de Salud (C18, F21)",
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

  function prepareDialogMusic(source) {
    if (loadedDialogMusicSource === source && dialogMusicBuffer) return Promise.resolve(dialogMusicBuffer);
    if (pendingDialogMusicSource === source && dialogMusicBufferPromise) return dialogMusicBufferPromise;
    const context = ensureAudio();
    if (!context) return Promise.resolve(null);
    pendingDialogMusicSource = source;
    dialogMusicBufferPromise = fetch(source)
      .then((response) => {
        if (!response.ok) throw new Error(`No se pudo cargar el tema de diálogo: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((encodedAudio) => context.decodeAudioData(encodedAudio))
      .then((decodedAudio) => {
        if (pendingDialogMusicSource !== source) return null;
        loadedDialogMusicSource = source;
        dialogMusicBuffer = decodedAudio;
        const samples = decodedAudio.getChannelData(0);
        const sampleCount = Math.min(samples.length, Math.floor(decodedAudio.sampleRate * 5));
        let peak = 0;
        let squareSum = 0;
        for (let index = 0; index < sampleCount; index += 1) {
          const amplitude = Math.abs(samples[index]);
          peak = Math.max(peak, amplitude);
          squareSum += amplitude * amplitude;
        }
        document.documentElement.dataset.dialogMusicDuration = decodedAudio.duration.toFixed(1);
        document.documentElement.dataset.dialogMusicPeak = peak.toFixed(3);
        document.documentElement.dataset.dialogMusicRms = Math.sqrt(squareSum / Math.max(1, sampleCount)).toFixed(3);
        document.documentElement.dataset.dialogMusic = activeDialogMusicSource ? "ready" : "primed";
        return decodedAudio;
      })
      .catch((error) => {
        if (pendingDialogMusicSource === source) {
          document.documentElement.dataset.dialogMusic = "error";
          document.documentElement.dataset.dialogMusicError = error?.name || "DecodeError";
        }
        return null;
      });
    return dialogMusicBufferPromise;
  }

  function playDialogMusicBuffer(source) {
    prepareDialogMusic(source).then((buffer) => {
      if (!buffer || activeDialogMusicSource !== source || !state.sound) return;
      const context = ensureAudio();
      if (!context) return;
      const startBuffer = () => {
        if (activeDialogMusicSource !== source || !state.sound) return;
        if (dialogMusicSourceNode) {
          try { dialogMusicSourceNode.stop(); } catch (error) { /* already stopped */ }
          dialogMusicSourceNode.disconnect();
        }
        if (dialogMusicGainNode) dialogMusicGainNode.disconnect();
        dialogMusicGainNode = context.createGain();
        dialogMusicGainNode.gain.value = 3.2;
        dialogMusicGainNode.connect(context.destination);
        dialogMusicSourceNode = context.createBufferSource();
        dialogMusicSourceNode.buffer = buffer;
        dialogMusicSourceNode.loop = true;
        dialogMusicSourceNode.connect(dialogMusicGainNode);
        dialogMusicSourceNode.start(0);
        dialogMusicAudio.pause();
        try { dialogMusicAudio.currentTime = 0; } catch (error) { /* metadata is not ready yet */ }
        document.documentElement.dataset.dialogMusic = "playing-buffer";
        document.documentElement.dataset.dialogAudioContext = context.state;
        delete document.documentElement.dataset.dialogMusicError;
      };
      if (context.state === "suspended") context.resume().then(startBuffer).catch(() => {});
      else startBuffer();
    });
  }

  function playDialogMusic(source) {
    if (typeof source !== "string" || !source) return;
    stopBackgroundMusic();
    activeDialogMusicSource = source;
    if (!state.sound) {
      document.documentElement.dataset.dialogMusic = "muted";
      return;
    }
    if (loadedDialogMusicMediaSource !== source) {
      dialogMusicAudio.src = source;
      dialogMusicAudio.load();
      loadedDialogMusicMediaSource = source;
    }
    dialogMusicAudio.muted = false;
    dialogMusicAudio.volume = .72;
    try { dialogMusicAudio.currentTime = 0; } catch (error) { /* metadata is not ready yet */ }
    document.documentElement.dataset.dialogMusic = "starting";
    playDialogMusicBuffer(source);
    const playback = dialogMusicAudio.play();
    if (playback?.then) {
      playback.then(() => {
        if (activeDialogMusicSource !== source || dialogMusicAudio.paused) return;
        document.documentElement.dataset.dialogMusic = "playing-media";
        delete document.documentElement.dataset.dialogMusicError;
      }).catch((error) => {
        if (activeDialogMusicSource !== source) return;
        document.documentElement.dataset.dialogMusic = "fallback-buffer";
        document.documentElement.dataset.dialogMusicError = error?.name || "MediaPlaybackError";
      });
    } else playDialogMusicBuffer(source);
  }

  function primeDialogMusic(source) {
    if (typeof source !== "string" || !source) return;
    if (loadedDialogMusicMediaSource !== source) {
      dialogMusicAudio.src = source;
      dialogMusicAudio.load();
      loadedDialogMusicMediaSource = source;
    }
    dialogMusicAudio.muted = false;
    dialogMusicAudio.volume = 0;
    try { dialogMusicAudio.currentTime = 0; } catch (error) { /* metadata is not ready yet */ }
    const playback = dialogMusicAudio.play();
    if (playback?.then) {
      playback.then(() => {
        if (!activeDialogMusicSource) document.documentElement.dataset.dialogMusic = "primed-media";
      }).catch(() => {});
    }
    prepareDialogMusic(source);
  }

  function stopDialogMusic(resumeBackground = true) {
    const hadDialogMusic = Boolean(activeDialogMusicSource);
    activeDialogMusicSource = null;
    dialogMusicAudio.pause();
    dialogMusicAudio.muted = false;
    dialogMusicAudio.volume = .72;
    try { dialogMusicAudio.currentTime = 0; } catch (error) { /* metadata is not ready yet */ }
    if (dialogMusicSourceNode) {
      try { dialogMusicSourceNode.stop(); } catch (error) { /* already stopped */ }
      dialogMusicSourceNode.disconnect();
      dialogMusicSourceNode = null;
    }
    if (dialogMusicGainNode) {
      dialogMusicGainNode.disconnect();
      dialogMusicGainNode = null;
    }
    if (hadDialogMusic) document.documentElement.dataset.dialogMusic = "stopped";
    if (hadDialogMusic && resumeBackground && state.sound && state.started && !elements.worldScreen.classList.contains("hidden")) {
      startBackgroundMusic();
    }
  }

  function applyDialogPresentation(options = {}) {
    const hasPortrait = typeof options.portrait === "string" && options.portrait.length > 0;
    const hasSpeaker = typeof options.speaker === "string" && options.speaker.length > 0;
    dialogPresentation = options;
    elements.dialogBox.classList.toggle("has-portrait", hasPortrait);
    elements.worldScreen.classList.toggle("cinematic-dialog", Boolean(options.cinematic));
    elements.dialogSpeaker.textContent = hasSpeaker ? options.speaker : "";
    elements.dialogSpeaker.classList.toggle("hidden", !hasSpeaker);
    elements.dialogPortrait.classList.toggle("hidden", !hasPortrait);
    if (options.music) playDialogMusic(options.music);
    if (hasPortrait) {
      elements.dialogPortrait.alt = options.portraitAlt || `Retrato de ${options.speaker || "personaje"}`;
      elements.dialogPortrait.onload = () => { document.documentElement.dataset.dialogPortraitReady = "true"; };
      elements.dialogPortrait.onerror = () => { document.documentElement.dataset.dialogPortraitReady = "error"; };
      document.documentElement.dataset.dialogPortraitReady = "loading";
      elements.dialogPortrait.src = options.portrait;
    } else {
      elements.dialogPortrait.removeAttribute("src");
      elements.dialogPortrait.alt = "";
      delete document.documentElement.dataset.dialogPortraitReady;
    }
  }

  function clearDialogPresentation() {
    stopDialogMusic();
    dialogPresentation = null;
    elements.dialogBox.classList.remove("has-portrait");
    elements.worldScreen.classList.remove("cinematic-dialog");
    elements.dialogSpeaker.textContent = "";
    elements.dialogSpeaker.classList.add("hidden");
    elements.dialogPortrait.classList.add("hidden");
    elements.dialogPortrait.removeAttribute("src");
    elements.dialogPortrait.alt = "";
  }

  function showDialog(messages, avatar = "!", callback = null, options = {}) {
    dialogQueue = Array.isArray(messages) ? [...messages] : [String(messages)];
    dialogCallback = callback;
    inputLocked = true;
    clearDirectionalInput();
    elements.dialogAvatar.textContent = avatar;
    applyDialogPresentation(options);
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
    clearDialogPresentation();
    inputLocked = false;
    const callback = dialogCallback;
    dialogCallback = null;
    if (callback) callback();
  }

  function mapEventMessages(event) {
    const source = event?.message;
    const messages = (Array.isArray(source) ? source : [source])
      .filter((line) => typeof line === "string" && line.trim())
      .map((line) => line.trim());
    return messages.length ? messages : [event?.label || "Algo llama tu atención."];
  }

  function mapEventHasMessage(event) {
    return Array.isArray(event?.message)
      ? event.message.some((line) => typeof line === "string" && line.trim())
      : typeof event?.message === "string" && Boolean(event.message.trim());
  }

  function showDialogAsync(messages, avatar = "!", options = {}) {
    return new Promise((resolve) => showDialog(messages, avatar, resolve, options));
  }

  function playWorldVibration(duration = 440, intensity = 1) {
    const safeDuration = Math.max(80, Math.min(5000, Number(duration) || 440));
    const safeIntensity = Math.max(.1, Math.min(4, Number(intensity) || 1));
    if (typeof navigator.vibrate === "function") {
      const pulse = Math.max(20, Math.min(180, Math.round(45 * safeIntensity)));
      const pause = Math.max(15, Math.round(pulse * .55));
      const pattern = [];
      let elapsed = 0;
      while (elapsed < safeDuration && pattern.length < 15) {
        pattern.push(pulse);
        elapsed += pulse;
        if (elapsed < safeDuration) { pattern.push(pause); elapsed += pause; }
      }
      try { navigator.vibrate(pattern); } catch (error) { /* La vibración física es opcional. */ }
    }
    if (typeof elements.canvas?.animate === "function") {
      const amount = Math.max(1, Math.round(4 * safeIntensity));
      elements.canvas.animate([
        { transform: "translate(0,0)" },
        { transform: `translate(${-amount}px,${Math.round(amount * .45)}px)` },
        { transform: `translate(${amount}px,${-Math.round(amount * .35)}px)` },
        { transform: `translate(${-Math.round(amount * .65)}px,${-Math.round(amount * .25)}px)` },
        { transform: "translate(0,0)" },
      ], { duration: safeDuration, iterations: 1, easing: "linear" });
    }
    return wait(safeDuration);
  }

  async function applyWorldTransitionEffect(effect, action) {
    if (effect === "none") {
      action();
      return;
    }
    if (effect === "flash") {
      const overlay = elements.flashOverlay;
      overlay.classList.remove("encounter"); void overlay.offsetWidth;
      overlay.classList.add("encounter");
      await wait(180);
      action();
      await wait(620);
      overlay.classList.remove("encounter");
      return;
    }
    await fadeTransition(action);
  }

  function nearestOpenCityTarget(targetX, targetY) {
    const x = clamp(Number(targetX), 16, WORLD_WIDTH - 16);
    const y = clamp(Number(targetY), 16, WORLD_HEIGHT - 16);
    if (cityMapCanOccupy(x, y) && !worldNpcBlocksPosition(x, y)) return { x, y };
    const origin = worldToTile(x, y);
    for (let radius = 1; radius <= 8; radius += 1) {
      const candidates = [];
      for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
        for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
          if (Math.max(Math.abs(colOffset), Math.abs(rowOffset)) !== radius) continue;
          const candidateX = (origin.col + colOffset + .5) * CITY_MAP.tileSize;
          const candidateY = (origin.row + rowOffset + .5) * CITY_MAP.tileSize;
          if (cityMapCanOccupy(candidateX, candidateY) && !worldNpcBlocksPosition(candidateX, candidateY)) {
            candidates.push({ x: candidateX, y: candidateY, distance: Math.hypot(candidateX - x, candidateY - y) });
          }
        }
      }
      if (candidates.length) return candidates.sort((a, b) => a.distance - b.distance)[0];
    }
    return null;
  }

  function normalizedTargetMap(value) {
    return String(value || "san-pablo").trim().toLowerCase().replace(/_/g, "-");
  }

  async function executeMapTransfer(event, { persist = true } = {}) {
    const targetMap = normalizedTargetMap(event.targetMap);
    if (!["san-pablo", "city", "current"].includes(targetMap)) {
      const detail = { ...event, targetMap, handled: false };
      window.dispatchEvent(new CustomEvent("pokemon-map-transition", { detail }));
      if (detail.handled) return true;
      await showDialogAsync([
        `El destino «${event.targetMap || targetMap}» todavía no está registrado.`,
        "La entrada conserva el destino para conectarlo cuando ese mapa exista.",
      ], "◇");
      return false;
    }
    const requestedX = Number.isFinite(Number(event.targetX)) ? Number(event.targetX) : NORMAL_START.x;
    const requestedY = Number.isFinite(Number(event.targetY)) ? Number(event.targetY) : NORMAL_START.y;
    const destination = nearestOpenCityTarget(requestedX, requestedY);
    if (!destination) {
      await showDialogAsync(["El destino está bloqueado y no hay una casilla segura cerca."], "!");
      return false;
    }
    const direction = ["up", "down", "left", "right"].includes(event.targetDirection)
      ? event.targetDirection
      : "down";
    await applyWorldTransitionEffect(event.effect || (event.type === "transition" ? "fade" : "none"), () => {
      state.dimension = "san_pablo";
      state.interior = null;
      state.interiorData = null;
      state.worldX = destination.x;
      state.worldY = destination.y;
      state.direction = direction;
      camera.x = clamp(destination.x - VIEW_WIDTH / 2, 0, Math.max(0, WORLD_WIDTH - VIEW_WIDTH));
      camera.y = clamp(destination.y - VIEW_HEIGHT / 2, 0, Math.max(0, WORLD_HEIGHT - VIEW_HEIGHT));
      lastArea = "";
      lastStepEventTile = tileKey(worldToTile(destination.x, destination.y).col, worldToTile(destination.x, destination.y).row);
    });
    updateAreaLabel();
    updateInteractPrompt();
    if (persist) saveGame();
    return true;
  }

  async function runMapEvent(value, { preview = false } = {}) {
    const event = normalizeRuntimeEvent(value, value?.id || "event-preview");
    if (!event || mapEventRunning) return false;
    if (!preview && event.once && state.triggeredEvents.includes(event.id)) return false;
    mapEventRunning = true;
    const previousInputLock = inputLocked;
    const previewPosition = preview ? {
      dimension: state.dimension,
      interior: state.interior,
      interiorData: state.interiorData ? cloneRuntimeRecord(state.interiorData) : null,
      worldX: state.worldX,
      worldY: state.worldY,
      direction: state.direction,
      cameraX: camera.x,
      cameraY: camera.y,
      lastArea,
      lastStepEventTile,
    } : null;
    inputLocked = true;
    clearDirectionalInput();
    let completed = true;
    try {
      if (event.type === "thought" || event.type === "dialogue") {
        const thought = event.type === "thought";
        await showDialogAsync(mapEventMessages(event), thought ? "…" : (event.label || "N").charAt(0), thought ? {} : { speaker: event.label });
      } else if (event.type === "vibration") {
        await playWorldVibration(event.duration, event.intensity);
        if (mapEventHasMessage(event)) {
          await showDialogAsync(mapEventMessages(event), "!");
        }
      } else if (event.type === "teleport" || event.type === "transition") {
        if (mapEventHasMessage(event)) {
          await showDialogAsync(mapEventMessages(event), event.type === "transition" ? "◇" : "…");
        }
        inputLocked = true;
        completed = await executeMapTransfer(event, { persist: !preview });
        if (completed && previewPosition) {
          await wait(420);
          await applyWorldTransitionEffect(event.effect || (event.type === "transition" ? "fade" : "none"), () => {
            state.dimension = previewPosition.dimension;
            state.interior = previewPosition.interior;
            state.interiorData = previewPosition.interiorData;
            state.worldX = previewPosition.worldX;
            state.worldY = previewPosition.worldY;
            state.direction = previewPosition.direction;
            camera.x = previewPosition.cameraX;
            camera.y = previewPosition.cameraY;
            lastArea = previewPosition.lastArea;
            lastStepEventTile = previewPosition.lastStepEventTile;
          });
          updateAreaLabel();
          updateInteractPrompt();
        }
      }
      if (completed && !preview && event.once && !state.triggeredEvents.includes(event.id)) {
        state.triggeredEvents.push(event.id);
        saveGame();
      }
      return completed;
    } finally {
      mapEventRunning = false;
      inputLocked = previousInputLock;
      updateInteractPrompt();
    }
  }

  function triggerStepMapEvent() {
    if (state.dimension !== "san_pablo" || state.interior || mapEventRunning) return false;
    const tile = worldToTile(state.worldX, state.worldY);
    const key = tileKey(tile.col, tile.row);
    if (key === lastStepEventTile) return false;
    lastStepEventTile = key;
    const event = mapEventsAt(tile.col, tile.row, "step")
      .find((candidate) => !candidate.once || !state.triggeredEvents.includes(candidate.id));
    if (!event) return false;
    void runMapEvent(event);
    return true;
  }

  function showOpeningTutorial() {
    const starterName = speciesOf(state.team[0])?.name || "Tu Pokémon";
    showDialog([
      `¡${starterName} será tu compañero por la ciudad!`,
      "Mantén SHIFT para correr. Ethan usa animaciones distintas para caminar y correr en las cuatro direcciones.",
      "El botón # abre la cuadrícula: pulsa una casilla para marcarla como transitable, bloqueada, puerta, hierba o evento.",
      "Cuando quieras indicarme cambios puedes copiar una coordenada, por ejemplo: C18, F21 = puerta.",
    ], "P", () => showAreaToast("CIUDAD POKÉMON"));
  }

  function setDoctorPotatoScenePhase(phase) {
    if (!doctorPotatoScene) return;
    doctorPotatoScene.phase = phase;
    doctorPotatoScene.phaseElapsed = 0;
    document.documentElement.dataset.doctorPotatoScene = phase;
    document.documentElement.dataset.doctorPotatoSlowMotion = String(phase === "exiting");
  }

  function startDoctorPotatoIntro(onComplete = showOpeningTutorial) {
    if (!state.doctorPotatoIntroPending || doctorPotatoScene) return false;
    clearDirectionalInput();
    inputLocked = true;
    state.direction = "right";
    camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, Math.max(0, WORLD_WIDTH - VIEW_WIDTH));
    camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, Math.max(0, WORLD_HEIGHT - VIEW_HEIGHT));
    const viewRight = camera.x + VIEW_WIDTH;
    doctorPotatoScene = {
      x: viewRight + 58,
      y: state.worldY,
      targetX: state.worldX + 70,
      exitX: viewRight + 58,
      direction: "left",
      phase: "entering",
      phaseElapsed: 0,
      animationElapsed: 0,
      onComplete,
    };
    document.documentElement.dataset.doctorPotatoScene = "entering";
    document.documentElement.dataset.doctorPotatoSlowMotion = "false";
    return true;
  }

  function beginDoctorPotatoExit() {
    if (!doctorPotatoScene) return;
    inputLocked = true;
    clearDirectionalInput();
    doctorPotatoScene.direction = "right";
    setDoctorPotatoScenePhase("exiting");
  }

  function completeDoctorPotatoIntro() {
    if (!doctorPotatoScene) return;
    const onComplete = doctorPotatoScene.onComplete;
    doctorPotatoScene = null;
    state.doctorPotatoIntroPending = false;
    state.doctorPotatoIntroSeen = true;
    state.gifts.doctorPotato = true;
    inputLocked = false;
    document.documentElement.dataset.doctorPotatoScene = "complete";
    document.documentElement.dataset.doctorPotatoSlowMotion = "false";
    delete document.documentElement.dataset.doctorPotatoX;
    saveGame();
    if (typeof onComplete === "function") onComplete();
  }

  function updateDoctorPotatoCutscene(deltaSeconds) {
    if (!doctorPotatoScene) return;
    const scene = doctorPotatoScene;
    scene.phaseElapsed += deltaSeconds;
    scene.animationElapsed += deltaSeconds * 1000;
    if (scene.phase === "entering") {
      scene.x = Math.max(scene.targetX, scene.x - 185 * deltaSeconds);
      if (scene.x <= scene.targetX) setDoctorPotatoScenePhase("pausing");
    } else if (scene.phase === "pausing" && scene.phaseElapsed >= .42) {
      setDoctorPotatoScenePhase("dialog");
      showDialog([
        "¿QUÉ MIERDAS HACES AQUÍ, NIÑATO?!! ¡DAME UN POCO DE PELLOTE Y VETE!",
      ], "D", beginDoctorPotatoExit, {
        speaker: "Manolín · Doctor Potato",
        portrait: DOCTOR_POTATO_PORTRAIT_URL,
        portraitAlt: "Retrato del Doctor Potato",
        cinematic: true,
        music: DOCTOR_POTATO_THEME_URL,
      });
    } else if (scene.phase === "exiting") {
      scene.x += 72 * deltaSeconds;
      if (scene.x >= scene.exitX) completeDoctorPotatoIntro();
    }
    if (doctorPotatoScene) document.documentElement.dataset.doctorPotatoX = doctorPotatoScene.x.toFixed(1);
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
    if (state.interior === "building" || state.interior === "route") return interiorCanOccupy(x, y);
    if (state.dimension === "prism") {
      if (x < 24 || y < 30 || x > PRISM_WIDTH - 24 || y > PRISM_HEIGHT - 22) return false;
      return prismWalkableAreas.some((area) => x >= area.x + 18 && x <= area.x + area.w - 18 && y >= area.y + 18 && y <= area.y + area.h - 18);
    }
    return cityMapCanOccupy(x, y) && !worldNpcBlocksPosition(x, y) && !voiceNpcBlocksPosition(x, y);
  }

  function encounterAreaContains(area, x, y) {
    if (area?.shape === "polygon") return pointInPolygon(x, y, area.points || []);
    return Boolean(area) && x >= Number(area.x) && x <= Number(area.x) + Number(area.w)
      && y >= Number(area.y) && y <= Number(area.y) + Number(area.h);
  }

  function encounterAreaAt(x, y) {
    return (CITY_MAP.encounterAreas || []).find((area) => encounterAreaContains(area, x, y)) || null;
  }

  function currentEncounterZone() {
    if (state.interior === "route") {
      return ROUTE_GRASS.some((g) => state.worldX >= g.x && state.worldX <= g.x + g.w
        && state.worldY >= g.y && state.worldY <= g.y + g.h);
    }
    if (state.interior) return false;
    if (state.dimension === "san_pablo") {
      if (encounterAreaAt(state.worldX, state.worldY)) return true;
      const tile = worldToTile(state.worldX, state.worldY);
      return mapTileType(tile.col, tile.row) === "encounter";
    }
    return prismEncounterZones.some((zone) => pointInPolygon(state.worldX, state.worldY, zone));
  }

  function currentGreenArea() {
    if (state.interior === "route") return currentEncounterZone() ? { name: "Hierba de la ruta" } : null;
    if (state.interior || state.dimension !== "san_pablo") return null;
    const area = encounterAreaAt(state.worldX, state.worldY);
    if (area) return { id: area.id, name: area.name || "Hierba alta" };
    return currentEncounterZone() ? { name: "Hierba alta" } : null;
  }

  function nearestPointOfInterest() {
    if (state.interior === "maintenance") {
      const player = { x: state.worldX, y: state.worldY };
      if (distance(player, MAINTENANCE_EXIT) <= MAINTENANCE_EXIT.radius) return { id: "maintenance_exit" };
      if (distance(player, MAINTENANCE_TERMINAL) <= MAINTENANCE_TERMINAL.radius) return { id: "maintenance_terminal" };
      return null;
    }
    if (state.interior === "building") {
      const player = { x: state.worldX, y: state.worldY };
      if (distance(player, INDOOR_NPC) <= INDOOR_NPC.radius) return { id: "interior_npc" };
      if (distance(player, INDOOR_EXIT) <= INDOOR_EXIT.radius) return { id: "interior_exit" };
      return null;
    }
    if (state.interior === "route") {
      const player = { x: state.worldX, y: state.worldY };
      if (distance(player, ROUTE_EXIT) <= ROUTE_EXIT.radius) return { id: "interior_exit" };
      return null;
    }
    if (state.dimension === "prism") {
      const maze = ensureMazeState();
      const start = mazeDefinition.start;
      const market = mazeDefinition.market;
      if (market && Math.hypot(maze.playerX - (market.x + .5), maze.playerY - (market.y + .5)) < .9) {
        return { id: "black_market" };
      }
      return Math.hypot(maze.playerX - (start.x + .5), maze.playerY - (start.y + .5)) < .85
        ? { id: "dimension_exit" }
        : null;
    }
    const voiceManolin = nearbyVoiceNpc();
    if (voiceManolin) return { id: "voice_npc" };
    const worldNpc = nearbyWorldNpc();
    if (worldNpc) return { id: "world_npc", npc: worldNpc.npc };
    const worldBlocker = nearbyWorldBlocker();
    if (worldBlocker) return { id: "world_blocker", asset: worldBlocker.asset };
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
      map_entrance: "Entrar",
      map_event: "Interactuar",
      building_door: "Entrar al edificio", maintenance_exit: "Volver al exterior",
      maintenance_terminal: "Usar terminal", dimension_portal: "Examinar portal",
      dimension_exit: "Regresar a San Pablo", black_market: "Entrar al mercado negro", health: "Hablar", cafe: "Hablar",
      uned: "Consultar", school: "Leer", field: "Examinar",
      interior_npc: "Hablar", world_npc: "Hablar", voice_npc: "Hablar con Manolín", interior_exit: "Salir",
      world_blocker: "Examinar obstáculo",
    };
    const entranceAction = poi.entrance?.action;
    const label = poi.entrance?.prompt
      || (entranceAction === "prism" ? "Examinar portal" : null)
      || (entranceAction === "closed" ? "Examinar entrada" : null)
      || labels[poi.id]
      || "Interactuar";
    elements.interactPrompt.innerHTML = "<kbd>E</kbd> ";
    elements.interactPrompt.append(document.createTextNode(String(label)));
  }

  function areaForPosition(x, y) {
    if (state.interior === "maintenance") return "Sala de mantenimiento";
    if (state.interior === "building") return state.interiorData?.label || "Interior";
    if (state.interior === "route") return currentEncounterZone() ? "Ruta Silvestre · Hierba" : "Ruta Silvestre";
    if (state.dimension === "prism") {
      if (y < 860) return "Dimensión Prisma · Isla Norte";
      if (x < 800) return "Dimensión Prisma · Isla Oeste";
      if (x > 1350) return "Dimensión Prisma · Isla Este";
      return "Dimensión Prisma · Umbral";
    }
    const tile = worldToTile(x, y);
    if (currentEncounterZone()) return currentGreenArea()?.name || "Hierba alta";
    const street = (CITY_MAP.streets || [])
      .map((entry) => {
        const [x1, y1, x2, y2] = entry.segment;
        return { ...entry, distance: distanceToRoad(x, y, { x1, y1, x2, y2 }) };
      })
      .filter((entry) => entry.distance <= entry.width / 2)
      .sort((a, b) => (a.distance / a.width) - (b.distance / b.width))[0];
    return street?.name || mapSectionAt(x, y).name;
  }

  function distanceToRoad(x, y, road) {
    const dx = road.x2 - road.x1; const dy = road.y2 - road.y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    const amount = clamp(((x - road.x1) * dx + (y - road.y1) * dy) / lengthSquared, 0, 1);
    return Math.hypot(x - (road.x1 + dx * amount), y - (road.y1 + dy * amount));
  }

  function updateAreaLabel() {
    const area = areaForPosition(state.worldX, state.worldY);
    const tile = worldToTile(state.worldX, state.worldY);
    document.documentElement.dataset.playerPosition = `${Math.round(state.worldX)},${Math.round(state.worldY)}`;
    document.documentElement.dataset.playerTile = `C${tile.col},F${tile.row}`;
    document.documentElement.dataset.playerDirection = state.direction;
    elements.areaName.textContent = area;
    if (elements.coordinateHud) {
      const inCity = state.dimension === "san_pablo" && !state.interior;
      elements.coordinateHud.classList.toggle("hidden", !inCity);
      if (inCity) {
        elements.coordinateHud.querySelector("strong").textContent = `C${tile.col} · F${tile.row}`;
        elements.coordinateHud.querySelector("span").textContent = `X${Math.round(state.worldX)} · Y${Math.round(state.worldY)} px`;
      }
    }
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

    if (poi.id === "map_event") {
      void runMapEvent(poi.event);
      return;
    }

    if (poi.id === "map_tile" || poi.id === "map_entrance") {
      const door = poi.entrance || poi.event;
      if (!door) { showDialog([`Evento en C${poi.col}, F${poi.row}.`], "!"); return; }
      if (door.action === "closed") {
        showDialog([`${door.label}: La puerta está cerrada por ahora.`], "!");
      } else if (door.action === "prism") {
        if (state.inventory.prismShards < 3) {
          showDialog([`El umbral reacciona a tus Fragmentos Prisma: ${state.inventory.prismShards} / 3.`, "Busca los tres destellos en Jerusalén, Persépolis y Siracusa."], "◇");
        } else {
          showDialog(["Los tres fragmentos encajan en el umbral. El aire empieza a doblarse…", "La dimensión reacciona al ruido y puede pedir acceso al micrófono."], "◇", enterPrismDimension);
        }
      } else if (door.action === "transition" || door.action === "teleport") {
        void runMapEvent({
          id: `entrance-${door.id}`,
          col: door.col,
          row: door.row,
          label: door.label,
          type: door.action,
          trigger: "interact",
          message: door.message || "",
          targetMap: door.targetMap,
          targetX: door.targetX,
          targetY: door.targetY,
          targetDirection: door.targetDirection,
          effect: door.effect,
        });
      } else {
        const typeMap = { heal: "center", shop: "mart", lab: "lab", house: "house", route: "route" };
        const type = typeMap[door.action];
        if (type) enterInterior(type, door);
        else showDialog([`${door.label}: aún no hay nada que hacer aquí.`], "!");
      }
      return;
    }

    if (poi.id === "world_npc") {
      const npc = poi.npc || {};
      const lines = Array.isArray(npc.lines) && npc.lines.length ? npc.lines : ["Hola, entrenador."];
      showDialog(lines.map((line) => `${npc.name || "NPC"}: ${line}`), (npc.name || "N").charAt(0));
      return;
    }

    if (poi.id === "voice_npc") {
      showDialog([
        "Manolín: ¿Qué miras, figura? Si quieres discutir, di mi nombre en voz alta.",
        "Cuando te oiga decir «Manolín», te seguirá mientras hables. Si callas tres segundos, perderá el interés.",
      ], "M", null, { speaker: "Manolín · Doctor Potato", portrait: DOCTOR_POTATO_PORTRAIT_URL, portraitAlt: "Retrato de Manolín" });
      return;
    }

    if (poi.id === "world_blocker") {
      const interaction = poi.asset?.interaction || {};
      const lines = Array.isArray(interaction.lines) && interaction.lines.length
        ? interaction.lines
        : ["Parece que necesito algo para avanzar"];
      showDialog(lines, "!");
      return;
    }
    if (poi.id === "interior_npc") { useInteriorNpc(); return; }
    if (poi.id === "interior_exit") { leaveInterior(); return; }

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

    if (poi.id === "black_market") {
      openBlackMarket();
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
    if (poi.id === "cafe") showDialog(["Cafetería Jasmín: Los entrenadores dicen que se ve algún Chispin cerca del campo de fútbol."], "☕");
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

  function interiorCanOccupy(x, y) {
    if (state.interior === "route") {
      const r = ROUTE_ROOM;
      if (x < r.x + r.wall || x > r.x + r.w - r.wall || y < r.y + r.wall || y > r.y + r.h - r.wall) return false;
      if (x >= ROUTE_POND.x - 8 && x <= ROUTE_POND.x + ROUTE_POND.w + 8 && y >= ROUTE_POND.y - 8 && y <= ROUTE_POND.y + ROUTE_POND.h + 8) return false;
      return !ROUTE_BLOCKED.some((b) => x >= b.x - 14 && x <= b.x + b.w + 14 && y >= b.y - 14 && y <= b.y + b.h + 14);
    }
    const r = INDOOR_ROOM;
    return x > r.x + r.wall && x < r.x + r.w - r.wall && y > r.y + r.wall && y < r.y + r.h - r.wall;
  }

  async function enterInterior(type, door) {
    if (inputLocked) return;
    inputLocked = true; clearDirectionalInput();
    await fadeTransition(() => {
      state.interior = type === "route" ? "route" : "building";
      state.interiorData = {
        type, label: door?.label || INTERIOR_PALETTES[type]?.label || "Interior",
        npc: door?.npc || null, returnX: state.worldX, returnY: state.worldY, returnDir: state.direction,
      };
      if (type === "route") { state.worldX = ROUTE_SPAWN.x; state.worldY = ROUTE_SPAWN.y; }
      else { state.worldX = INDOOR_SPAWN.x; state.worldY = INDOOR_SPAWN.y; }
      state.direction = "up";
      /* Las salas están diseñadas exactamente para el viewport 960×624. */
      camera.x = 0;
      camera.y = 0;
      lastArea = "";
      elements.buildingEditorButton.disabled = true;
      closeBuildingEditorPanel();
    });
    inputLocked = false;
    playTone(330, .08, "square", .025);
    updateAreaLabel(); updateInteractPrompt(); saveGame();
    showAreaToast((state.interiorData?.label || "Interior").toUpperCase());
  }

  async function leaveInterior() {
    if (inputLocked) return;
    inputLocked = true; clearDirectionalInput();
    const dest = state.interiorData || {};
    await fadeTransition(() => {
      state.interior = null;
      state.worldX = dest.returnX ?? NORMAL_START.x;
      state.worldY = dest.returnY ?? NORMAL_START.y;
      state.direction = dest.returnDir || "down";
      state.interiorData = null;
      camera.x = clamp(state.worldX - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH);
      camera.y = clamp(state.worldY - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT);
      lastArea = "";
      elements.buildingEditorButton.disabled = false;
    });
    inputLocked = false;
    playTone(440, .08, "square", .025);
    updateAreaLabel(); updateInteractPrompt(); saveGame();
    showAreaToast("CIUDAD POKÉMON");
  }

  function useInteriorNpc() {
    const type = state.interiorData?.type;
    if (type === "center") clinicHeal();
    else if (type === "mart") showDialog([
      "Dependiente: ¡Bienvenido! Las Poké Balls están de oferta: cuestan exactamente lo que pone en la etiqueta.",
      "Si rompes algo, no pasa nada... mientras lo compres.",
    ], "$", () => openShop());
    else if (type === "lab") labDialog();
    else if (type === "house") houseDialog(state.interiorData?.npc);
    else showDialog(["Alguien está aquí…"], "?");
  }

  function clinicHeal() {
    state.team.forEach((member) => { member.hp = member.maxHp; });
    const messages = ["Enfermera: Tu equipo está como nuevo. Yo, en cambio, necesito una Poción y vacaciones."];
    if (!state.clinicGiftClaimed) { state.clinicGiftClaimed = true; state.balls += 2; messages.push("Toma 2 Poké Balls. No son caramelos; lo aclaro por lo ocurrido el martes."); }
    if (state.team.length >= MAX_TEAM && state.questStage >= 3) {
      state.questStage = 4; messages.push("¡Objetivo completado! Has formado y cuidado a tu equipo."); playJingle("success");
    }
    renderHud(); saveGame(); showDialog(messages, "+");
  }

  function labDialog() {
    const lines = [
      "Profesora Encina: ¡Bienvenida! He ordenado el laboratorio, así que ahora no encuentro nada.",
      `Llevas ${state.caught.length} Pokémon capturados de ${LOCAL_DEX_SIZE} de la región.`,
      "Mi hipótesis: la Ruta Silvestre esconde Pokémon raros. Mi otra hipótesis: necesito café.",
    ];
    if (!state.gifts.lab) {
      state.gifts.lab = true; state.inventory.potions += 1;
      lines.push("Toma esta Poción extra. La ciencia funciona mejor cuando nadie se desmaya.");
      playJingle("success");
    }
    renderHud(); saveGame(); showDialog(lines, "🔬");
  }

  function houseDialog(npcId) {
    const def = NPC_DEFS[npcId] || { name: "Vecino", lines: ["¡Hola! Buen tiempo hoy."] };
    const lines = [`${def.name}: ${def.lines[0]}`];
    if (def.lines[1]) lines.push(def.lines[1]);
    if (npcId === "comerciante" && !state.gifts.comerciante) {
      state.gifts.comerciante = true; state.money += 150;
      lines.push("Toma 150 Pokédólares de cortesía para gastar en el Poké Mart.");
      renderHud();
    }
    saveGame(); showDialog(lines, def.name.charAt(0));
  }

  function shopCatalog(type = activeShopType) {
    if (type === "black_market") {
      return [
        {
          id: "maxPotion", name: "Poción Máxima", price: 300, sprite: "max-potion",
          description: "Restaura todos los PS del Pokémon activo.",
          buy: () => { state.inventory.maxPotions += 1; },
        },
        {
          id: "prismBattery", name: "Batería Prisma", price: 200, sprite: "cell-battery", stockKey: "prismBattery",
          description: "Recupera una carga de la linterna del laberinto.",
          buy: () => { state.inventory.prismBatteries += 1; },
        },
        {
          id: "rareCandy", name: "Caramelo Raro", price: 900, sprite: "rare-candy", stockKey: "rareCandy",
          description: "Sube un nivel al Pokémon activo. Solo quedan dos.",
          buy: () => { state.inventory.rareCandies += 1; },
        },
        {
          id: "masterBall", name: "Master Ball", price: 1800, sprite: "master-ball", stockKey: "masterBall",
          description: "Garantiza una captura. Pieza única.",
          buy: () => { state.inventory.masterBalls += 1; },
        },
      ];
    }
    return [
      { id: "pokeBall", name: "Poké Ball", price: 100, sprite: "poke-ball", description: "Una captura estándar.", buy: () => { state.balls += 1; } },
      { id: "potion", name: "Poción", price: 80, sprite: "potion", description: "Restaura 20 PS.", buy: () => { state.inventory.potions += 1; } },
      { id: "oranBerry", name: "Baya Aranja", price: 50, sprite: "oran-berry", description: "Restaura 10 PS.", buy: () => { state.inventory.berries += 1; } },
      { id: "ultraBall", name: "Ultra Ball", price: 600, sprite: "ultra-ball", description: "Mejora mucho la captura.", buy: () => { state.inventory.ultraBalls += 1; } },
    ];
  }

  function blackMarketStock(item) {
    if (!item?.stockKey) return Infinity;
    const limit = BLACK_MARKET_LIMITS[item.stockKey] ?? 0;
    return Math.max(0, limit - (Number(state.blackMarket.purchases[item.stockKey]) || 0));
  }

  function openShop(type = "mart") {
    if (!elements.shopModal) { showDialog(["Dependiente: ¡Bienvenido al Poké Mart! Vuelve pronto."], "$"); return; }
    closeSanpledex(false);
    activeShopType = type;
    lastShopFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    clearDirectionalInput();
    renderShop();
    elements.shopModal.classList.remove("hidden");
    elements.closeShop?.focus({ preventScroll: true });
  }

  function openBlackMarket() {
    const maze = ensureMazeState();
    maze.marketReached = true;
    maze.monsterRepel = Math.max(maze.monsterRepel, 5);
    maze.alertTimer = 0;
    shadowPath = []; shadowPathTimer = 0;
    const firstVisit = !state.blackMarket.discovered;
    state.blackMarket.discovered = true;
    saveGame();
    if (firstVisit) {
      showDialog([
        "Traficante Umbral: La Sombra no cruza la luz roja. Desde ahora este puesto es tu refugio.",
        "Lo que vendo no aparece en ningún Poké Mart. El género limitado no vuelve a entrar.",
      ], "₽", () => openShop("black_market"));
    } else openShop("black_market");
  }

  function closeShop() {
    if (!elements.shopModal || elements.shopModal.classList.contains("hidden")) return;
    elements.shopModal.classList.add("hidden");
    const focusTarget = lastShopFocus?.isConnected && lastShopFocus.offsetParent !== null
      ? lastShopFocus
      : elements.canvas;
    focusTarget?.focus({ preventScroll: true });
    lastShopFocus = null;
  }

  function renderShop() {
    const items = shopCatalog();
    const blackMarket = activeShopType === "black_market";
    elements.shopDialog?.classList.toggle("black-market", blackMarket);
    if (elements.shopEyebrow) elements.shopEyebrow.textContent = blackMarket ? "TRATOS DEL UMBRAL" : "POKÉ MART";
    if (elements.shopTitle) elements.shopTitle.textContent = blackMarket ? "Mercado Negro" : "Tienda Pokémon";
    if (elements.shopTip) elements.shopTip.textContent = blackMarket
      ? "La luz roja es un refugio. Los objetos limitados no se reponen al recargar la partida."
      : "Gana dinero ganando combates salvajes.";
    elements.shopMoney.textContent = `${state.money} ₽`;
    elements.shopList.innerHTML = items.map((item, index) => {
      const remaining = blackMarketStock(item);
      const soldOut = remaining <= 0;
      const stockLabel = Number.isFinite(remaining) ? ` · ${remaining} disponibles` : "";
      return `<div class="shop-item ${soldOut ? "sold-out" : ""}">
        <img src="${itemSpriteUrl(item.sprite)}" alt="" draggable="false" />
        <div class="shop-item-info"><strong>${item.name}</strong><small>${item.price} ₽${stockLabel}</small><p>${item.description}</p></div>
        <button type="button" data-shop="${index}" ${soldOut || state.money < item.price ? "disabled" : ""}>${soldOut ? "Agotado" : "Comprar"}</button>
      </div>`;
    }).join("");
    $$('[data-shop]').forEach((button) => button.addEventListener("click", () => buyShopItem(items[Number(button.dataset.shop)])));
  }

  function buyShopItem(item) {
    if (!item || blackMarketStock(item) <= 0 || state.money < item.price) {
      playTone(95, .15, "square", .03);
      return;
    }
    state.money -= item.price;
    item.buy();
    if (item.stockKey) state.blackMarket.purchases[item.stockKey] += 1;
    playJingle("success"); renderShop(); renderHud(); saveGame();
  }

  function primaryAction() {
    if (state.dimension === "prism" && !nearestPointOfInterest()) useFlashlight();
    else interact();
  }

  async function enterPrismDimension() {
    const noiseMode = await requestMicrophoneAccess();
    state.returnPosition = { x: state.worldX, y: state.worldY };
    state.dimension = "prism";
    state.dimensionVisited = true;
    if (!state.secretPokemonSaved) state.secretPokemonId = chooseSecretPokemonId();
    const maze = ensureMazeState(true);
    if (state.blackMarket.discovered && mazeDefinition.market) {
      const market = mazeDefinition.market;
      maze.playerX = market.x + .5; maze.playerY = market.y + .5;
      maze.angle = firstOpenDirection(mazeDefinition.grid, market);
      maze.marketReached = true;
      maze.monsterRepel = 3.5;
    }
    state.worldX = 1050; state.worldY = 1830; state.direction = "up";
    lastArea = "";
    elements.buildingEditorButton.disabled = true;
    elements.worldScreen.classList.add("maze-mode");
    elements.mazeHud.classList.remove("hidden");
    if (elements.noiseLabel) elements.noiseLabel.textContent = noiseMode === "microphone" ? "MICRÓFONO" : "MOVIMIENTO";
    playJingle("capture");
    renderHud(); saveGame();
    const objective = state.secretPokemonSaved
      ? "El monstruo ya está a salvo, pero el Mercado Negro sigue abierto entre los muros."
      : "Resuelve el laberinto y derrota al monstruo invertido para liberarlo.";
    const noiseRule = noiseMode === "microphone"
      ? "La Sombra oye el ruido de tu habitación y se mueve más rápido cuando te escucha."
      : "Modo sin micrófono activo: la Sombra reaccionará a tus pasos, giros y carreras.";
    showDialog([
      noiseRule,
      "Apunta hacia ella y pulsa F para ahuyentarla. La linterna solo puede repelerla tres veces.",
      "Busca la luz roja: el Mercado Negro funciona como refugio y punto de control.",
      objective,
    ], "MIC", () => showAreaToast("DIMENSIÓN INVERTIDA"));
  }

  function leavePrismDimension() {
    closeShop();
    stopMicrophone();
    const destination = state.returnPosition || currentPortalReturn();
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
    const market = mazeDefinition.market;
    const insideMarketRefuge = Boolean(maze.marketReached && market
      && Math.hypot(maze.playerX - (market.x + .5), maze.playerY - (market.y + .5)) < 1.25);
    maze.monsterRepel = insideMarketRefuge
      ? Math.max(2.2, maze.monsterRepel - deltaSeconds)
      : Math.max(0, maze.monsterRepel - deltaSeconds);
    maze.alertTimer = insideMarketRefuge
      ? 0
      : effectiveNoise > .24
        ? Math.max(maze.alertTimer, 4.2 + effectiveNoise * 4.4)
        : Math.max(0, maze.alertTimer - deltaSeconds);
    sprintScareCooldown = Math.max(0, sprintScareCooldown - deltaSeconds);
    shadowPathTimer -= deltaSeconds;
    const repelled = maze.monsterRepel > 0;
    const chasing = !repelled && maze.alertTimer > 0;
    updateChaseMusic(deltaSeconds, chasing);
    if (insideMarketRefuge) { sprintScare = null; quietStillTime = 0; }
    else {
      if (updateSprintScare(deltaSeconds, effectiveNoise, playerStill)) return;
      if (maybeStartSilentPass()) return;
    }
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
    if (!micLive && !microphoneFallbackMode) {
      microphoneStream?.getTracks().forEach((track) => track.stop());
      microphoneStream = null; microphoneAnalyser = null; microphoneData = null; microphoneLevel = 0;
      microphoneFallbackMode = true;
      if (elements.noiseLabel) elements.noiseLabel.textContent = "MOVIMIENTO";
      showAreaToast("MICRÓFONO DESCONECTADO · MODO MOVIMIENTO");
    }
    const micNoise = micLive ? updateMicrophoneLevel() : 0;
    const shadowDistance = Math.hypot(maze.monsterX - maze.playerX, maze.monsterY - maze.playerY);
    updateProximityBreathing(deltaSeconds, shadowDistance, !battle && !jumpScareActive);
    if (battle || inputLocked || drawerOpen || jumpScareActive || !elements.dialogBox.classList.contains("hidden")) {
      resetPlayerAnimation();
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
    let actualMovementSpeed = 0;
    if (movementSpeed > .025) {
      const previousX = maze.playerX; const previousY = maze.playerY;
      const nextX = maze.playerX + velocityX * deltaSeconds;
      const nextY = maze.playerY + velocityY * deltaSeconds;
      if (mazeCanOccupy(nextX, maze.playerY)) maze.playerX = nextX;
      if (mazeCanOccupy(maze.playerX, nextY)) maze.playerY = nextY;
      const actualMovement = Math.hypot(maze.playerX - previousX, maze.playerY - previousY);
      actualMovementSpeed = deltaSeconds > 0 ? actualMovement / deltaSeconds : 0;
      if (actualMovement > .0001) {
        maze.steps += actualMovement;
        animationTime += deltaSeconds * 1000;
        animationFrame = Math.floor(animationTime / (playerRunning ? 82 : 145)) % 4;
      } else resetPlayerAnimation();
    } else resetPlayerAnimation();

    const playerStill = !translating && turnInput === 0
      && actualMovementSpeed < .045 && Math.abs(mazeMotion.turn) < .04;
    const perfectlyQuiet = micNoise < .055;
    quietStillTime = playerStill && perfectlyQuiet ? quietStillTime + deltaSeconds : 0;
    const movementNoise = actualMovementSpeed > .045 ? (playerRunning ? .38 : .08 + actualMovementSpeed / speed * .06) : 0;
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
    const objectiveTarget = state.secretPokemonSaved ? mazeDefinition.market : mazeDefinition.goal;
    const objectiveDistance = objectiveTarget
      ? Math.hypot(maze.playerX - (objectiveTarget.x + .5), maze.playerY - (objectiveTarget.y + .5))
      : Infinity;
    const signal = objectiveDistance < 2.2 ? "AQUÍ" : objectiveDistance < 5 ? "INTENSA" : objectiveDistance < 9 ? "FUERTE" : objectiveDistance < 14 ? "MEDIA" : "DÉBIL";
    if (elements.mazeObjective) elements.mazeObjective.textContent = `${state.secretPokemonSaved ? "MERCADO" : "MONSTRUO"} · ${signal}`;
    if (elements.noiseLabel) elements.noiseLabel.textContent = microphoneFallbackMode ? "MOVIMIENTO" : "MICRÓFONO";
    document.documentElement.dataset.prismNoiseMode = microphoneFallbackMode ? "movement" : "microphone";
    document.documentElement.dataset.prismMarketCheckpoint = String(Boolean(maze.marketReached));
    document.documentElement.dataset.prismPlayer = `${maze.playerX.toFixed(3)},${maze.playerY.toFixed(3)}`;
    document.documentElement.dataset.prismShadow = `${maze.monsterX.toFixed(3)},${maze.monsterY.toFixed(3)}`;
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
      const { start, market, monster, grid } = mazeDefinition;
      const checkpointReached = Boolean(maze.marketReached && market);
      const respawn = checkpointReached ? market : start;
      const remainingLightCharges = maze.lightCharges;
      maze.playerX = respawn.x + .5;
      maze.playerY = respawn.y + .5;
      maze.angle = firstOpenDirection(grid, respawn);
      maze.monsterX = monster.x + .5;
      maze.monsterY = monster.y + .5;
      maze.monsterRepel = checkpointReached ? 3.5 : 0;
      maze.alertTimer = 0;
      maze.lightCharges = checkpointReached ? Math.max(1, remainingLightCharges) : 3;
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
      showAreaToast(checkpointReached ? "EL REFUGIO ROJO TE HA SALVADO" : "LA SOMBRA TE DEVUELVE AL INICIO");
    }, 1620);
  }

  function updateMovement(deltaSeconds) {
    const drawerOpen = elements.teamDrawer.classList.contains("open")
      || elements.inventoryDrawer.classList.contains("open")
      || (elements.shopModal && !elements.shopModal.classList.contains("hidden"));
    if (state.dimension === "prism") {
      updateMazeMovement(deltaSeconds, drawerOpen);
      return;
    }
    if (!state.started || battle || inputLocked || drawerOpen || !elements.dialogBox.classList.contains("hidden")) {
      resetPlayerAnimation();
      return;
    }

    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;
    if (!moving) {
      resetPlayerAnimation();
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
      if (triggerStepMapEvent()) {
        updateAreaLabel(); updateInteractPrompt();
        return;
      }
      if (checkObjectPickup()) {
        updateAreaLabel(); updateInteractPrompt(); renderHud(); saveGame();
        return;
      }
      const previousQuestStage = state.questStage;
      if (state.questStage === 0 && state.distance > 330) state.questStage = 1;
      if (currentEncounterZone()) {
        lastGrassStepAt = performance.now();
        lastGrassStepX = state.worldX;
        lastGrassStepY = state.worldY;
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
    } else resetPlayerAnimation();
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

  function drawInterior(context) {
    if (state.interior === "route") { drawRouteInterior(context); return; }
    const palette = INTERIOR_PALETTES[state.interiorData?.type] || INTERIOR_PALETTES.house;
    const r = INDOOR_ROOM;
    const type = state.interiorData?.type;
    const tile = type === "house" ? 24 : 32;
    for (let y = r.y; y < r.y + r.h; y += tile) {
      for (let x = r.x; x < r.x + r.w; x += tile) {
        const checker = (Math.floor((x - r.x) / tile) + Math.floor((y - r.y) / tile)) % 2;
        context.fillStyle = checker ? palette.floorAlt : palette.floor;
        context.fillRect(x, y, tile, tile);
        context.fillStyle = "rgba(255,255,255,.08)";
        if (type === "house") context.fillRect(x, y, tile - 1, 2);
        else context.fillRect(x + 2, y + 2, tile - 4, 2);
      }
    }
    context.fillStyle = "rgba(38,28,24,.18)";
    context.fillRect(r.x + r.wall, r.y + r.wall, r.w - r.wall * 2, 12);
    context.fillStyle = palette.wall;
    context.fillRect(r.x, r.y, r.w, r.wall); context.fillRect(r.x, r.y + r.h - r.wall, r.w, r.wall);
    context.fillRect(r.x, r.y, r.wall, r.h); context.fillRect(r.x + r.w - r.wall, r.y, r.wall, r.h);
    context.fillStyle = "rgba(255,255,255,.17)";
    context.fillRect(r.x + 8, r.y + 8, r.w - 16, 6);
    context.strokeStyle = palette.accent; context.lineWidth = 3;
    context.strokeRect(r.x + 9.5, r.y + 9.5, r.w - 19, r.h - 19);
    drawInteriorFurniture(context, palette);
    drawInteriorNpc(context, palette);
    const ex = INDOOR_EXIT;
    context.fillStyle = "rgba(244,220,119,.32)"; context.beginPath(); context.ellipse(ex.x, ex.y, 44, 16, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = "rgba(244,220,119,.5)"; context.beginPath(); context.ellipse(ex.x, ex.y, 22, 8, 0, 0, Math.PI * 2); context.fill();
    drawMapLabel(context, ex.x, ex.y + 30, "SALIDA");
    drawMapLabel(context, r.x + r.w / 2, r.y + 48, palette.label);
  }

  function drawPixelFurniture(context, kind, x, y, color = "#8a6440") {
    context.save(); context.translate(Math.round(x), Math.round(y));
    if (kind === "rug") {
      context.fillStyle = "rgba(80,42,55,.18)"; context.fillRect(-74, -42, 148, 84);
      context.fillStyle = color; context.fillRect(-70, -38, 140, 76);
      context.fillStyle = "rgba(255,236,182,.42)"; context.strokeStyle = "rgba(255,236,182,.55)"; context.lineWidth = 4;
      context.strokeRect(-60, -28, 120, 56); context.fillRect(-4, -38, 8, 76);
    } else if (kind === "table") {
      context.fillStyle = "rgba(30,22,18,.2)"; context.fillRect(-34, 24, 76, 12);
      context.fillStyle = "#5b3825"; context.fillRect(-33, 12, 10, 24); context.fillRect(23, 12, 10, 24);
      context.fillStyle = color; context.fillRect(-42, -18, 84, 36);
      context.fillStyle = "rgba(255,255,255,.18)"; context.fillRect(-38, -14, 76, 5);
    } else if (kind === "bed") {
      context.fillStyle = "#5a3d2d"; context.fillRect(-38, -54, 76, 108);
      context.fillStyle = color; context.fillRect(-33, -49, 66, 98);
      context.fillStyle = "#f3ead2"; context.fillRect(-29, -45, 58, 27);
      context.fillStyle = "rgba(255,255,255,.25)"; context.fillRect(-28, -12, 56, 5);
    } else if (kind === "shelf") {
      context.fillStyle = "#4c3122"; context.fillRect(-44, -55, 88, 110);
      context.fillStyle = color; context.fillRect(-38, -49, 76, 98);
      const books = ["#c9544f", "#4d86a6", "#e2b34e", "#6a9a58", "#906baa"];
      for (let row = 0; row < 3; row += 1) {
        context.fillStyle = "#4c3122"; context.fillRect(-38, -20 + row * 31, 76, 5);
        for (let book = 0; book < 6; book += 1) {
          context.fillStyle = books[(book + row) % books.length]; context.fillRect(-31 + book * 11, -43 + row * 31, 7, 22);
        }
      }
    } else if (kind === "sofa") {
      context.fillStyle = "#4a382d"; context.fillRect(-56, 22, 112, 16);
      context.fillStyle = color; context.fillRect(-62, -20, 124, 47); context.fillRect(-68, -18, 18, 55); context.fillRect(50, -18, 18, 55);
      context.fillStyle = "rgba(255,255,255,.14)"; context.fillRect(-44, -13, 40, 32); context.fillRect(4, -13, 40, 32);
    } else if (kind === "plant") {
      context.fillStyle = "#b06f45"; context.fillRect(-14, 4, 28, 25); context.fillStyle = "#754329"; context.fillRect(-10, 24, 20, 7);
      context.fillStyle = color; context.fillRect(-6, -35, 12, 42); context.fillRect(-27, -25, 23, 13); context.fillRect(4, -18, 27, 14); context.fillRect(-21, -43, 20, 17);
    } else if (kind === "screen") {
      context.fillStyle = "#343b43"; context.fillRect(-32, -34, 64, 54); context.fillStyle = color; context.fillRect(-25, -27, 50, 35);
      context.fillStyle = "rgba(255,255,255,.48)"; context.fillRect(-20, -21, 30, 4); context.fillStyle = "#4b4b47"; context.fillRect(-8, 20, 16, 17); context.fillRect(-22, 34, 44, 5);
    } else if (kind === "counter") {
      context.fillStyle = "#4b3b31"; context.fillRect(-110, -8, 220, 50); context.fillStyle = color; context.fillRect(-116, -24, 232, 32);
      context.fillStyle = "rgba(255,255,255,.22)"; context.fillRect(-108, -18, 216, 6);
    }
    context.restore();
  }

  function drawInteriorFurniture(context, palette) {
    const type = state.interiorData?.type;
    const r = INDOOR_ROOM;
    if (type === "center" || type === "mart") {
      drawPixelFurniture(context, "counter", INDOOR_NPC.x, INDOOR_NPC.y + 72, palette.accent);
      drawPixelFurniture(context, "shelf", r.x + 92, r.y + 120, type === "center" ? "#d98483" : "#6d9cc2");
      drawPixelFurniture(context, "shelf", r.x + r.w - 92, r.y + 120, type === "center" ? "#d98483" : "#6d9cc2");
      if (type === "center") {
        drawPixelFurniture(context, "sofa", r.x + 180, r.y + 395, "#d56568");
        drawPixelFurniture(context, "screen", r.x + r.w - 125, r.y + 375, "#70d8dc");
      } else {
        drawPixelFurniture(context, "shelf", r.x + 110, r.y + 350, "#6d9cc2");
        drawPixelFurniture(context, "shelf", r.x + r.w - 110, r.y + 350, "#6d9cc2");
      }
    } else if (type === "lab") {
      drawPixelFurniture(context, "counter", INDOOR_NPC.x, INDOOR_NPC.y + 72, "#63865d");
      drawPixelFurniture(context, "screen", r.x + 115, r.y + 115, "#75e2e8");
      drawPixelFurniture(context, "screen", r.x + r.w - 115, r.y + 115, "#75e2e8");
      drawPixelFurniture(context, "table", r.x + 200, r.y + 375, "#7c9d6e");
      drawPixelFurniture(context, "table", r.x + r.w - 200, r.y + 375, "#7c9d6e");
    } else {
      const npc = NPC_DEFS[state.interiorData?.npc] || {};
      const layout = npc.layout || "cozy";
      const colors = { cozy: "#bd6c5b", playroom: "#4d83b0", coastal: "#4f91a3", study: "#7c5b96", studio: "#b56b83" };
      drawPixelFurniture(context, "rug", INDOOR_NPC.x, r.y + 350, colors[layout]);
      drawPixelFurniture(context, "bed", r.x + 100, r.y + 145, colors[layout]);
      if (layout === "study") {
        drawPixelFurniture(context, "shelf", r.x + r.w - 100, r.y + 130, "#79563c");
        drawPixelFurniture(context, "screen", r.x + r.w - 120, r.y + 360, "#80d8da");
        drawPixelFurniture(context, "table", INDOOR_NPC.x, r.y + 350, "#8a6440");
      } else if (layout === "playroom") {
        drawPixelFurniture(context, "sofa", r.x + r.w - 140, r.y + 125, colors[layout]);
        drawPixelFurniture(context, "table", INDOOR_NPC.x, r.y + 350, "#d19b54");
        drawPixelFurniture(context, "plant", r.x + r.w - 95, r.y + 390, "#4e9a55");
      } else if (layout === "coastal") {
        drawPixelFurniture(context, "shelf", r.x + r.w - 100, r.y + 130, "#517c8f");
        drawPixelFurniture(context, "sofa", r.x + r.w - 150, r.y + 370, "#4f91a3");
        drawPixelFurniture(context, "plant", r.x + 120, r.y + 390, "#3e8b61");
      } else if (layout === "studio") {
        drawPixelFurniture(context, "screen", r.x + r.w - 115, r.y + 125, "#e3c36a");
        drawPixelFurniture(context, "shelf", r.x + r.w - 105, r.y + 370, "#9b5f74");
        drawPixelFurniture(context, "table", INDOOR_NPC.x, r.y + 350, "#b47b4b");
      } else {
        drawPixelFurniture(context, "sofa", r.x + r.w - 140, r.y + 130, colors[layout]);
        drawPixelFurniture(context, "table", INDOOR_NPC.x, r.y + 350, "#8a6440");
        drawPixelFurniture(context, "plant", r.x + r.w - 95, r.y + 390, "#4e9a55");
      }
    }
  }

  function drawInteriorNpc(context, palette) {
    const npc = NPC_DEFS[state.interiorData?.npc] || {};
    const color = npc.color || palette.accent;
    const t = performance.now();
    const bob = Math.round(Math.sin(t / 420));
    const x = INDOOR_NPC.x; const y = INDOOR_NPC.y + bob;
    context.fillStyle = "rgba(20,40,30,.22)";
    context.beginPath(); context.ellipse(x, INDOOR_NPC.y + 27, 21, 7, 0, 0, Math.PI * 2); context.fill();
    const rosterRecord = npcRosterSheets.get(npc.sprite);
    if (rosterRecord?.ready) {
      context.drawImage(rosterRecord.image, 0, 0, SPRITE_CELL_SIZE, SPRITE_CELL_SIZE,
        Math.round(x) - 32, Math.round(y) - 40, 64, 64);
    } else if (npcSheetReady && Number.isInteger(npc.spriteIndex)) {
      context.drawImage(npcSheet, npc.spriteIndex * 32, 0, 32, 32, Math.round(x) - 32, Math.round(y) - 40, 64, 64);
    } else {
      context.fillStyle = color; context.fillRect(x - 12, y - 6, 24, 26);
      context.fillStyle = "#f0c099"; context.beginPath(); context.arc(x, y - 16, 12, 0, Math.PI * 2); context.fill();
    }
    const near = distance({ x: state.worldX, y: state.worldY }, INDOOR_NPC) <= INDOOR_NPC.radius + 36;
    if (near) {
      context.fillStyle = "#ffe24a"; context.beginPath(); context.arc(x + 18, y - 26, 9, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#3a2a00"; context.font = "900 12px Trebuchet MS"; context.textAlign = "center";
      context.fillText("!", x + 18, y - 22);
    }
  }

  function drawRouteInterior(context) {
    const r = ROUTE_ROOM;
    context.fillStyle = "#7fbf5a"; context.fillRect(r.x, r.y, r.w, r.h);
    for (let y = r.y; y < r.y + r.h; y += 16) {
      context.fillStyle = `rgba(255,255,255,${(Math.floor((y - r.y) / 16)) % 2 ? .04 : 0})`;
      context.fillRect(r.x, y, r.w, 8);
    }
    context.fillStyle = "#c9b27a";
    context.fillRect(ROUTE_SPAWN.x - 30, r.y + r.wall, 60, r.h - r.wall * 2);
    context.fillRect(r.x + r.wall, ROUTE_SPAWN.y - 24, r.w - r.wall * 2, 48);
    context.fillStyle = "#4f8fc3"; context.fillRect(ROUTE_POND.x, ROUTE_POND.y, ROUTE_POND.w, ROUTE_POND.h);
    context.fillStyle = "rgba(255,255,255,.2)"; context.fillRect(ROUTE_POND.x + 6, ROUTE_POND.y + 6, ROUTE_POND.w - 12, 8);
    ROUTE_BLOCKED.forEach((b) => {
      context.fillStyle = "rgba(30,60,39,.25)";
      context.beginPath(); context.ellipse(b.x + b.w / 2 + 4, b.y + b.h, b.w * .6, b.h * .25, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#5a4930"; context.fillRect(b.x + b.w / 2 - 4, b.y + b.h * .4, 8, b.h * .6);
      context.fillStyle = "#2f6841"; context.beginPath(); context.arc(b.x + b.w / 2, b.y + b.h * .4, b.w * .55, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#4c8a49"; context.beginPath(); context.arc(b.x + b.w / 2 - 6, b.y + b.h * .4 - 6, b.w * .35, 0, Math.PI * 2); context.fill();
    });
    ROUTE_GRASS.forEach((g) => {
      context.fillStyle = "rgba(46,120,60,.55)"; context.fillRect(g.x, g.y, g.w, g.h);
      context.fillStyle = "#2e6e3a";
      for (let y = g.y + 6; y < g.y + g.h - 4; y += 12) {
        for (let x = g.x + 6; x < g.x + g.w - 4; x += 12) {
          context.fillRect(x, y, 3, 6); context.fillRect(x + 4, y + 2, 3, 5);
        }
      }
    });
    context.fillStyle = "#2a5e36";
    context.fillRect(r.x, r.y, r.w, r.wall); context.fillRect(r.x, r.y + r.h - r.wall, r.w, r.wall);
    context.fillRect(r.x, r.y, r.wall, r.h); context.fillRect(r.x + r.w - r.wall, r.y, r.wall, r.h);
    const ex = ROUTE_EXIT;
    context.fillStyle = "rgba(244,220,119,.42)"; context.beginPath(); context.ellipse(ex.x, ex.y, 46, 18, 0, 0, Math.PI * 2); context.fill();
    drawMapLabel(context, ex.x, ex.y + 32, "VOLVER A LA CIUDAD");
    drawMapLabel(context, r.x + r.w / 2, r.y + 44, "RUTA SILVESTRE");
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

  function directionFromNpcToPlayer(position, fallback = "down") {
    const dx = state.worldX - position.x;
    const dy = state.worldY - position.y;
    if (Math.hypot(dx, dy) > 90) return fallback;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }

  function drawWorldNpc(context, npc) {
    const position = mapNpcPosition(npc);
    const patrol = npcPatrolState(npc);
    const direction = patrol?.direction || directionFromNpcToPlayer(position, npc.direction || "down");
    const rows = { down: 0, left: 1, right: 2, up: 3 };
    const frame = (patrol?.moving || npc.walking) ? Math.floor(performance.now() / 170) % 4 : 0;
    context.save();
    context.fillStyle = "rgba(22,43,34,.23)";
    context.beginPath(); context.ellipse(Math.round(position.x), Math.round(position.y + 1), 16, 5, 0, 0, Math.PI * 2); context.fill();
    const rosterRecord = npcRosterSheets.get(npc.sprite);
    const spriteSheet = npc.sprite === "guide" && guideNpcSheetReady ? guideNpcSheet : (rosterRecord?.ready ? rosterRecord.image : null);
    if (spriteSheet) {
      context.drawImage(spriteSheet, frame * SPRITE_CELL_SIZE, (rows[direction] || 0) * SPRITE_CELL_SIZE,
        SPRITE_CELL_SIZE, SPRITE_CELL_SIZE, Math.round(position.x) - 32, Math.round(position.y) - 60, 64, 64);
    } else {
      context.fillStyle = "#416448"; context.fillRect(position.x - 13, position.y - 30, 26, 30);
      context.fillStyle = "#d5a079"; context.fillRect(position.x - 10, position.y - 48, 20, 18);
    }
    if (distance({ x: state.worldX, y: state.worldY }, position) <= 70) {
      context.fillStyle = "#ffe24a"; context.beginPath(); context.arc(position.x + 20, position.y - 48, 9, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#352900"; context.font = "900 12px Trebuchet MS"; context.textAlign = "center"; context.fillText("!", position.x + 20, position.y - 44);
    }
    context.restore();
  }

  function drawDoctorPotato(context) {
    if (!doctorPotatoScene) return;
    const scene = doctorPotatoScene;
    const doctorPotatoSprite = npcRosterSheets.get("doctor-potato");
    const doctorPotatoSheet = doctorPotatoSprite?.ready ? doctorPotatoSprite.image : null;
    const rows = { down: 0, left: 1, right: 2, up: 3 };
    const moving = scene.phase === "entering" || scene.phase === "exiting";
    const frameDuration = scene.phase === "exiting" ? 520 : 155;
    const frame = moving ? Math.floor(scene.animationElapsed / frameDuration) % 4 : 0;
    const row = rows[scene.direction] || 0;
    const drawSprite = (x, alpha = 1) => {
      context.save();
      context.globalAlpha = alpha;
      if (doctorPotatoSheet) {
        context.drawImage(doctorPotatoSheet, frame * SPRITE_CELL_SIZE, row * SPRITE_CELL_SIZE,
          SPRITE_CELL_SIZE, SPRITE_CELL_SIZE, Math.round(x) - 34, Math.round(scene.y) - 64, 68, 68);
      } else {
        context.fillStyle = "#f1f4ed";
        context.fillRect(x - 18, scene.y - 36, 36, 34);
        context.fillStyle = "#9b633c";
        context.beginPath(); context.arc(x, scene.y - 44, 21, 0, Math.PI * 2); context.fill();
        context.fillStyle = "#2f5135";
        context.beginPath(); context.moveTo(x, scene.y - 66); context.lineTo(x - 12, scene.y - 73);
        context.lineTo(x - 4, scene.y - 60); context.lineTo(x + 12, scene.y - 73); context.closePath(); context.fill();
      }
      context.restore();
    };
    context.save();
    context.fillStyle = "rgba(22,43,34,.25)";
    context.beginPath(); context.ellipse(Math.round(scene.x), Math.round(scene.y + 1), 19, 6, 0, 0, Math.PI * 2); context.fill();
    if (scene.phase === "exiting") {
      drawSprite(scene.x - 13, .08);
      drawSprite(scene.x - 7, .14);
    }
    drawSprite(scene.x);
    context.restore();
  }

  function drawVoiceNpc(context) {
    if (!VOICE_NPC_ENABLED) return;
    if (!state.started || state.dimension !== "san_pablo" || state.interior || doctorPotatoScene || !voiceNpc.positionReady) return;
    const record = npcRosterSheets.get("doctor-potato");
    const sheet = record?.ready ? record.image : null;
    const rows = { down: 0, left: 1, right: 2, up: 3 };
    const frame = voiceNpc.moving ? Math.floor(voiceNpc.animationElapsed / 150) % 4 : 0;
    context.save();
    context.fillStyle = voiceNpc.active ? "rgba(142,31,45,.34)" : "rgba(22,43,34,.25)";
    context.beginPath(); context.ellipse(Math.round(voiceNpc.x), Math.round(voiceNpc.y + 1), 19, 6, 0, 0, Math.PI * 2); context.fill();
    if (voiceNpc.active) {
      context.strokeStyle = "rgba(255,88,74,.8)";
      context.lineWidth = 2;
      context.beginPath(); context.arc(voiceNpc.x, voiceNpc.y - 28, 29 + Math.sin(performance.now() / 110) * 2, 0, Math.PI * 2); context.stroke();
    }
    if (sheet) {
      context.drawImage(sheet, frame * SPRITE_CELL_SIZE, (rows[voiceNpc.direction] || 0) * SPRITE_CELL_SIZE,
        SPRITE_CELL_SIZE, SPRITE_CELL_SIZE, Math.round(voiceNpc.x) - 34, Math.round(voiceNpc.y) - 64, 68, 68);
    } else {
      context.fillStyle = "#f1f4ed"; context.fillRect(voiceNpc.x - 18, voiceNpc.y - 36, 36, 34);
      context.fillStyle = "#9b633c"; context.beginPath(); context.arc(voiceNpc.x, voiceNpc.y - 44, 21, 0, Math.PI * 2); context.fill();
    }
    context.font = "900 10px Trebuchet MS";
    context.textAlign = "center";
    const nameWidth = 72;
    context.fillStyle = voiceNpc.active ? "#7c1725" : "#173c2f";
    context.fillRect(voiceNpc.x - nameWidth / 2, voiceNpc.y + 7, nameWidth, 16);
    context.fillStyle = "white";
    context.fillText("MANOLÍN", voiceNpc.x, voiceNpc.y + 19);

    if (voiceNpc.reply && performance.now() - voiceNpc.replyAt < 9000) {
      const words = voiceNpc.reply.split(/\s+/);
      const lines = [];
      let line = "";
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > 35 && line) { lines.push(line); line = word; }
        else line = candidate;
      });
      if (line) lines.push(line);
      const visibleLines = lines.slice(0, 3);
      const bubbleWidth = 252;
      const bubbleHeight = 22 + visibleLines.length * 15;
      const bubbleX = voiceNpc.x - bubbleWidth / 2;
      const bubbleY = voiceNpc.y - 76 - bubbleHeight;
      context.fillStyle = "rgba(255,252,235,.97)";
      context.strokeStyle = "#481d21";
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 10);
      context.fill(); context.stroke();
      context.beginPath();
      context.moveTo(voiceNpc.x - 9, bubbleY + bubbleHeight);
      context.lineTo(voiceNpc.x + 7, bubbleY + bubbleHeight);
      context.lineTo(voiceNpc.x, bubbleY + bubbleHeight + 10);
      context.closePath(); context.fill(); context.stroke();
      context.fillStyle = "#31191b";
      context.font = "800 11px Trebuchet MS";
      visibleLines.forEach((text, index) => context.fillText(text, voiceNpc.x, bubbleY + 19 + index * 15));
    }
    context.restore();
  }

  function worldAssetInView(asset, bounds, margin = 48) {
    if (Number(asset.rotation)) {
      const radius = Math.max(Number(asset.w), Number(asset.h)) / 2;
      return Number(asset.x) + radius >= bounds.left - margin && Number(asset.x) - radius <= bounds.right + margin
        && Number(asset.y) + radius >= bounds.top - margin && Number(asset.y) - radius <= bounds.bottom + margin;
    }
    const left = Number(asset.x) - Number(asset.w) / 2;
    const right = left + Number(asset.w);
    const top = Number(asset.y) - Number(asset.h);
    const bottom = Number(asset.y);
    return right >= bounds.left - margin && left <= bounds.right + margin
      && bottom >= bounds.top - margin && top <= bounds.bottom + margin;
  }

  function drawWorldAsset(context, asset) {
    const record = cityWorldAssetImages.get(worldAssetSource(asset));
    if (!record?.ready) return;
    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (asset.kind === "building") context.filter = "drop-shadow(0 3px 2px rgba(24, 45, 34, .28))";
    const width = Number(asset.w); const height = Number(asset.h);
    const rotation = Number(asset.rotation) || 0;
    if (rotation || asset.flipX) {
      context.translate(Math.round(Number(asset.x)), Math.round(Number(asset.y) - height / 2));
      context.rotate(rotation * Math.PI / 180);
      context.scale(asset.flipX ? -1 : 1, 1);
      context.drawImage(record.drawable || record.image, -width / 2, -height / 2, width, height);
    } else {
      context.drawImage(
        record.drawable || record.image,
        Math.round(Number(asset.x) - width / 2),
        Math.round(Number(asset.y) - height),
        width,
        height,
      );
    }
    context.restore();
  }

  function drawWorldAssetColliders(context, assets) {
    if (!elements.buildingEditor.classList.contains("open")) return;
    context.save();
    context.fillStyle = "rgba(234, 42, 127, .28)";
    context.strokeStyle = "rgba(255, 255, 255, .92)";
    context.lineWidth = 2;
    context.font = "700 12px monospace";
    context.textBaseline = "bottom";
    assets.forEach((asset) => {
      worldAssetColliderRects(asset).forEach((rect) => {
        context.fillRect(rect.x, rect.y, rect.w, rect.h);
        context.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
      });
      context.fillStyle = "rgba(12, 31, 24, .88)";
      context.fillText(`${asset.id} · depth ${asset.depthY ?? asset.y}`, asset.x - asset.w / 2, asset.y - asset.h - 4);
      context.fillStyle = "rgba(234, 42, 127, .28)";
    });
    const selectedAsset = assets.find((asset) => asset.id === selectedEditorAssetId);
    if (selectedAsset) {
      context.strokeStyle = "#ffe56a";
      context.lineWidth = 4;
      context.setLineDash([10, 6]);
      context.strokeRect(
        selectedAsset.x - selectedAsset.w / 2 - 5,
        selectedAsset.y - selectedAsset.h - 5,
        selectedAsset.w + 10,
        selectedAsset.h + 10,
      );
      context.setLineDash([]);
    }
    context.restore();
  }

  function visibleEncounterGrassTiles(bounds) {
    const size = CITY_MAP.tileSize;
    const startCol = Math.max(0, Math.floor((bounds.left - size) / size));
    const endCol = Math.min(Math.ceil(WORLD_WIDTH / size) - 1, Math.ceil((bounds.right + size) / size));
    const startRow = Math.max(0, Math.floor((bounds.top - size) / size));
    const endRow = Math.min(Math.ceil(WORLD_HEIGHT / size) - 1, Math.ceil((bounds.bottom + size) / size));
    const frameCount = Math.max(1, Number(CITY_MAP.encounterGrass?.frames) || 1);
    const tiles = [];
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        if (mapTileType(col, row) !== "encounter") continue;
        const hash = ((col * 73856093) ^ (row * 19349663)) >>> 0;
        tiles.push({
          col,
          row,
          x: (col + .5) * size,
          y: (row + 1) * size + 2,
          frame: hash % frameCount,
          phase: (hash % 628) / 100,
        });
      }
    }
    return tiles;
  }

  function encounterGrassMotion(tile, now) {
    const age = now - lastGrassStepAt;
    const distanceFromStep = Math.hypot(tile.x - lastGrassStepX, tile.y - 12 - lastGrassStepY);
    const active = age >= 0 && age < 360 && distanceFromStep < 76;
    const strength = active ? (1 - age / 360) * (1 - distanceFromStep / 76) : 0;
    return {
      angle: Math.sin(now / 780 + tile.phase) * .012 + Math.sin(now / 54 + tile.phase) * .115 * strength,
      scaleY: 1 - .09 * strength,
      offsetX: Math.sin(now / 48 + tile.phase) * 3.2 * strength,
      active,
    };
  }

  function drawEncounterGrassTile(context, tile, now, foreground = false) {
    if (!encounterGrassSheetReady) return;
    const config = CITY_MAP.encounterGrass || {};
    const frameSize = Number(config.frameSize) || 64;
    const width = Number(config.drawWidth) || 44;
    const height = Number(config.drawHeight) || 48;
    const sourceY = foreground ? Math.max(0, Math.min(frameSize - 1, Number(config.frontCropY) || 31)) : 0;
    const sourceHeight = frameSize - sourceY;
    const targetHeight = height * sourceHeight / frameSize;
    const motion = encounterGrassMotion(tile, now);
    const size = CITY_MAP.tileSize;
    context.save();
    context.beginPath();
    context.rect(tile.col * size, tile.row * size - 18, size, size + 20);
    context.clip();
    context.translate(Math.round(tile.x + motion.offsetX), Math.round(tile.y));
    context.rotate(motion.angle);
    context.scale(1, motion.scaleY);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      encounterGrassSheet,
      tile.frame * frameSize,
      sourceY,
      frameSize,
      sourceHeight,
      -width / 2,
      -targetHeight,
      width,
      targetHeight,
    );
    context.restore();
  }

  function drawEncounterGrassBack(context) {
    const bounds = visibleBounds(72);
    const tiles = visibleEncounterGrassTiles(bounds);
    const now = performance.now();
    if (encounterGrassSheetReady) tiles.forEach((tile) => drawEncounterGrassTile(context, tile, now, false));
    document.documentElement.dataset.encounterGrassVisible = String(tiles.length);
    document.documentElement.dataset.encounterGrassAnimated = String(
      currentEncounterZone() && now - lastGrassStepAt < 360,
    );
    return { tiles, now };
  }

  function drawWorldEntities(context, encounterGrass = { tiles: [], now: performance.now() }) {
    const bounds = visibleBounds(96);
    const visibleAssets = cityWorldAssets.filter((asset) => worldAssetInView(asset, bounds));
    const entities = visibleAssets.map((asset) => ({
      y: Number(asset.depthY ?? asset.y),
      priority: 0,
      draw: () => drawWorldAsset(context, asset),
    }));
    const portalPosition = currentPortalPosition();
    if (entityInView(portalPosition, bounds, 110)) {
      entities.push({
        y: portalPosition.y,
        priority: 1,
        draw: () => drawPortal(context, portalPosition.x, portalPosition.y, state.inventory.prismShards >= 3),
      });
    }
    cityNpcs.forEach((npc) => entities.push({
      y: mapNpcPosition(npc).y,
      priority: 1,
      draw: () => drawWorldNpc(context, npc),
    }));
    if (doctorPotatoScene) {
      entities.push({
        y: doctorPotatoScene.y,
        priority: 1,
        draw: () => drawDoctorPotato(context),
      });
    }
    if (VOICE_NPC_ENABLED && !doctorPotatoScene && voiceNpc.positionReady) {
      entities.push({
        y: voiceNpc.y,
        priority: 1,
        draw: () => drawVoiceNpc(context),
      });
    }
    worldObjects
      .filter((object) => object.dimension === state.dimension
        && !state.collectedObjects.includes(object.id)
        && entityInView(object, bounds, 45))
      .forEach((object) => entities.push({
        y: object.y,
        priority: 1,
        draw: () => drawWorldObject(context, object, performance.now()),
      }));
    encounterGrass.tiles.forEach((tile) => entities.push({
      y: tile.y,
      priority: 3,
      draw: () => drawEncounterGrassTile(context, tile, encounterGrass.now, true),
    }));
    const visibleCollaboratorPlayers = collaboratorCursors
      .filter((collaborator) => collaborator.player
        && collaborator.player.dimension === state.dimension
        && (collaborator.player.interior || null) === (state.interior || null)
        && entityInView(collaborator.player, bounds, 70));
    document.documentElement.dataset.collaboratorPlayerVisibleCount = String(visibleCollaboratorPlayers.length);
    visibleCollaboratorPlayers.forEach((collaborator) => entities.push({
      y: collaborator.player.y,
      priority: 2,
      draw: () => drawRemotePlayer(context, collaborator),
    }));
    entities.push({ y: state.worldY, priority: 2, draw: () => drawPlayer(context) });
    entities.sort((a, b) => (a.y - b.y) || (a.priority - b.priority)).forEach((entity) => entity.draw());
    return visibleAssets;
  }

  function playerSourceFrame() {
    const gait = playerRunning ? "run" : "walk";
    const frames = playerFrames.get(`${gait}-${state.direction}`) || [];
    if (!frames.length) return null;
    const frameIndex = animationFrame % frames.length;
    document.documentElement.dataset.playerAnimationFrame = String(frameIndex);
    document.documentElement.dataset.playerAnimationDirection = state.direction;
    document.documentElement.dataset.playerAnimationGait = gait;
    return frames[frameIndex];
  }

  function drawPlayer(context) {
    const x = state.worldX;
    const y = state.worldY;
    const moving = animationTime > 0;
    context.save();
    context.fillStyle = "rgba(28,52,42,.24)";
    context.beginPath(); context.ellipse(Math.round(x), Math.round(y + 1), 15, 5, 0, 0, Math.PI * 2); context.fill();
    if (playerRunning && moving) {
      const back = { up: [0, 6], down: [0, 6], left: [10, 4], right: [-10, 4] }[state.direction] || [0, 6];
      const puff = 0.5 + Math.abs(Math.sin(performance.now() / 90));
      context.fillStyle = "rgba(220,210,180,.5)";
      context.beginPath(); context.ellipse(x + back[0], y + back[1], 8 * puff, 3 * puff, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = "rgba(220,210,180,.3)";
      context.beginPath(); context.ellipse(x + back[0] * 1.6, y + back[1] + 2, 6 * puff, 2.5 * puff, 0, 0, Math.PI * 2); context.fill();
    }
    if (playerSheetReady) {
      const frame = playerSourceFrame();
      /* Celda 64×64 con punto de apoyo fijo en y=60: no hay fondo ni temblor. */
      if (frame) context.drawImage(frame, Math.round(x) - 32, Math.round(y) - 60, 64, 64);
    } else {
      context.fillStyle = "#d94e49"; context.fillRect(Math.round(x) - 12, Math.round(y) - 54, 24, 12);
      context.fillStyle = "#f0c099"; context.fillRect(Math.round(x) - 9, Math.round(y) - 42, 18, 14);
      context.fillStyle = "#3f6f9c"; context.fillRect(Math.round(x) - 12, Math.round(y) - 28, 24, 28);
    }
    context.restore();
  }

  function drawRemotePlayer(context, collaborator) {
    const player = collaborator.player;
    if (!player) return;
    const targetX = Number(player.x); const targetY = Number(player.y);
    const distance = Math.hypot(targetX - player.displayX, targetY - player.displayY);
    const smoothing = distance > 220 ? 1 : .32;
    player.displayX += (targetX - player.displayX) * smoothing;
    player.displayY += (targetY - player.displayY) * smoothing;
    const x = player.displayX; const y = player.displayY;

    context.save();
    context.fillStyle = "rgba(28,52,42,.24)";
    context.beginPath(); context.ellipse(Math.round(x), Math.round(y + 1), 15, 5, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = collaborator.color;
    context.lineWidth = 2;
    context.beginPath(); context.ellipse(Math.round(x), Math.round(y + 1), 18, 8, 0, 0, Math.PI * 2); context.stroke();
    if (playerSheetReady) {
      const gait = player.running ? "run" : "walk";
      const direction = ["up", "down", "left", "right"].includes(player.direction) ? player.direction : "down";
      const frames = playerFrames.get(`${gait}-${direction}`) || [];
      const frame = frames[player.moving ? Number(player.frame) % Math.max(1, frames.length) : 0];
      if (frame) context.drawImage(frame, Math.round(x) - 32, Math.round(y) - 60, 64, 64);
    } else {
      context.fillStyle = collaborator.color; context.fillRect(Math.round(x) - 12, Math.round(y) - 54, 24, 12);
      context.fillStyle = "#f0c099"; context.fillRect(Math.round(x) - 9, Math.round(y) - 42, 18, 14);
      context.fillStyle = "#3f6f9c"; context.fillRect(Math.round(x) - 12, Math.round(y) - 28, 24, 28);
    }
    context.font = "700 11px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const labelWidth = context.measureText(collaborator.name).width + 12;
    context.fillStyle = "rgba(10,28,22,.88)";
    context.fillRect(Math.round(x - labelWidth / 2), Math.round(y - 76), labelWidth, 18);
    context.fillStyle = "#fff";
    context.fillText(collaborator.name, Math.round(x), Math.round(y - 67));
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
      if (shards >= 3) messages.push("Los tres fragmentos vibran a la vez. Una visión atraviesa el umbral…");
      showDialog(messages, "◇", shards >= 3 ? startFragmentCinematic : null);
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

    /* Rejilla de perspectiva, neblina y pulsos ambientales para que la sala no
       sea un plano vacío. Se dibujan antes de las paredes para conservar profundidad. */
    context.save();
    context.strokeStyle = "rgba(151,112,190,.13)"; context.lineWidth = 1;
    for (let band = 1; band <= 11; band += 1) {
      const amount = band / 11; const y = horizon + Math.pow(amount, 2.15) * (height - horizon);
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
    for (let spoke = -8; spoke <= 8; spoke += 1) {
      context.beginPath(); context.moveTo(width / 2, horizon); context.lineTo(width / 2 + spoke * 118, height); context.stroke();
    }
    const pulse = .06 + (Math.sin(performance.now() / 700) + 1) * .025;
    const haze = context.createRadialGradient(width / 2, horizon, 20, width / 2, horizon, width * .72);
    haze.addColorStop(0, `rgba(174,115,218,${pulse})`); haze.addColorStop(1, "rgba(3,2,9,.28)");
    context.fillStyle = haze; context.fillRect(0, 0, width, height);
    context.restore();

    const rayCount = 240;
    const sliceWidth = width / rayCount + 1;
    const wallDepths = new Array(rayCount);
    for (let index = 0; index < rayCount; index += 1) {
      const rayAngle = maze.angle - fov / 2 + fov * (index / (rayCount - 1));
      const rawDistance = castMazeRay(maze.playerX, maze.playerY, rayAngle);
      const correctedDistance = Math.max(.12, rawDistance * Math.cos(rayAngle - maze.angle));
      wallDepths[index] = correctedDistance;
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

    drawMazeBlackMarket(context, fov, wallDepths);
    drawMazeSecretPokemon(context, fov, wallDepths);
    drawMazeShadow(context, fov, wallDepths);
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
    return { distance: entityDistance, angleDifference, screenX: VIEW_WIDTH * (.5 + angleDifference / fov) };
  }

  function clipEntityByWallDepth(context, projection, entityWidth, wallDepths) {
    if (!wallDepths?.length) return;
    const rayWidth = VIEW_WIDTH / wallDepths.length;
    const left = Math.max(0, Math.floor((projection.screenX - entityWidth / 2) / rayWidth));
    const right = Math.min(wallDepths.length - 1, Math.ceil((projection.screenX + entityWidth / 2) / rayWidth));
    const correctedEntityDistance = projection.distance * Math.cos(projection.angleDifference);
    context.beginPath();
    for (let ray = left; ray <= right; ray += 1) {
      if (wallDepths[ray] > correctedEntityDistance - .16) context.rect(ray * rayWidth - 1, 0, rayWidth + 2, VIEW_HEIGHT);
    }
    context.clip();
  }

  function drawMazeBlackMarket(context, fov, wallDepths) {
    const market = mazeDefinition.market;
    if (!market) return;
    const projection = projectedEntityData(market.x + .5, market.y + .5, fov);
    if (!projection || projection.distance < .24) return;
    const height = clamp(470 / Math.max(.55, projection.distance), 54, 350);
    const width = height * .9;
    const baseY = VIEW_HEIGHT * .5 + height * .5;
    const pulse = .78 + Math.sin(performance.now() / 230) * .16;
    context.save();
    clipEntityByWallDepth(context, projection, width * 1.35, wallDepths);
    context.translate(projection.screenX, baseY);
    context.globalAlpha = clamp(1.25 - projection.distance / 22, .62, 1);
    context.shadowColor = `rgba(255,48,116,${pulse})`;
    context.shadowBlur = Math.max(10, height * .18);

    context.fillStyle = "#170b1b";
    context.fillRect(-width * .47, -height * .74, width * .94, height * .7);
    context.fillStyle = "#8c173f";
    context.fillRect(-width * .54, -height * .79, width * 1.08, height * .12);
    context.fillStyle = "#f24d7d";
    for (let stripe = -2; stripe <= 2; stripe += 1) {
      context.fillRect(stripe * width * .19 - width * .045, -height * .79, width * .09, height * .12);
    }

    context.shadowBlur = Math.max(6, height * .08);
    context.fillStyle = "#060509";
    context.beginPath();
    context.arc(0, -height * .49, height * .095, 0, Math.PI * 2);
    context.fill();
    context.fillRect(-height * .11, -height * .41, height * .22, height * .28);
    context.fillStyle = "#ff315f";
    context.fillRect(-height * .052, -height * .51, height * .026, height * .018);
    context.fillRect(height * .026, -height * .51, height * .026, height * .018);

    context.fillStyle = "#2a1027";
    context.fillRect(-width * .58, -height * .18, width * 1.16, height * .2);
    context.strokeStyle = "#ff4778";
    context.lineWidth = Math.max(1, height * .012);
    context.strokeRect(-width * .58, -height * .18, width * 1.16, height * .2);

    context.fillStyle = "#ff315f";
    context.beginPath();
    context.arc(width * .39, -height * .57, height * .04, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255,90,130,.8)";
    context.beginPath(); context.moveTo(width * .39, -height * .78); context.lineTo(width * .39, -height * .61); context.stroke();

    if (height > 86) {
      context.shadowBlur = height * .06;
      context.fillStyle = "#ffd7e2";
      context.font = `900 ${Math.max(8, height * .07)}px monospace`;
      context.textAlign = "center";
      context.fillText(height > 145 ? "MERCADO NEGRO" : "₽", 0, -height * .7);
    }
    context.restore();
  }

  function drawMazeShadow(context, fov, wallDepths) {
    if (sprintScare) return;
    const maze = ensureMazeState();
    const projection = projectedEntityData(maze.monsterX, maze.monsterY, fov);
    if (!projection) return;
    const height = clamp(650 / Math.max(.45, projection.distance), 74, 570);
    const width = height * .67;
    const time = performance.now() / 1000;
    const stride = Math.min(1, Math.hypot(maze.monsterX - maze.playerX, maze.monsterY - maze.playerY) / 8);
    const sway = Math.sin(time * (2.4 + stride * 2)) * Math.min(13, width * .055);
    const bob = Math.sin(time * (3.1 + stride)) * Math.min(7, height * .018);
    const breathe = 1 + Math.sin(time * 2.1) * .025;
    const baseY = VIEW_HEIGHT * .5 + height * .49 + bob;
    context.save();
    clipEntityByWallDepth(context, projection, width, wallDepths);
    context.translate(projection.screenX + sway, baseY);
    context.rotate(Math.sin(time * 1.7) * .018);
    context.scale(1 / breathe, breathe);
    const flicker = .91 + Math.sin(time * 13.7) * .045;
    context.globalAlpha = (maze.monsterRepel > 0 ? .38 : clamp(1.18 - projection.distance / 15, .5, 1)) * flicker;
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

  function drawMazeSecretPokemon(context, fov, wallDepths) {
    if (state.secretPokemonSaved) return;
    const secretId = currentSecretPokemonId();
    const goal = mazeDefinition.goal;
    const projection = projectedEntityData(goal.x + .5, goal.y + .5, fov);
    if (!projection) return;
    const size = clamp(330 / Math.max(.5, projection.distance), 35, 250);
    const image = getPokemonArtworkImage(secretId);
    context.save();
    clipEntityByWallDepth(context, projection, size, wallDepths);
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
    context.save();
    context.fillStyle = "rgba(0,0,0,.45)"; context.beginPath(); context.ellipse(VIEW_WIDTH / 2, VIEW_HEIGHT - 26, 46, 13, 0, 0, Math.PI * 2); context.fill();
    if (playerSheetReady) {
      const gait = playerRunning ? "run" : "walk";
      const frames = playerFrames.get(`${gait}-up`) || [];
      const order = animationFrame % Math.max(1, frames.length);
      const frame = frames[order] || frames[0];
      document.documentElement.dataset.playerAnimationFrame = String(order);
      document.documentElement.dataset.playerAnimationDirection = "up";
      document.documentElement.dataset.playerAnimationGait = gait;
      context.translate(VIEW_WIDTH / 2, VIEW_HEIGHT - 28);
      if (frame) context.drawImage(frame, -64, -120, 128, 128);
    } else { context.fillStyle = "#bb3e43"; context.fillRect(VIEW_WIDTH / 2 - 24, VIEW_HEIGHT - 132, 48, 96); }
    context.restore();
  }

  function editorEntityWorldPosition(selection) {
    if (!selection) return null;
    if (selection.kind === "npc") {
      const npc = cityNpcs.find((entry) => entry.id === selection.id);
      return npc ? mapNpcPosition(npc) : null;
    }
    if (selection.kind === "entrance") {
      const entrance = cityEntrances.find((entry) => entry.id === selection.id);
      return entrance ? { x: (entrance.col + .5) * CITY_MAP.tileSize, y: (entrance.row + .5) * CITY_MAP.tileSize } : null;
    }
    if (selection.kind === "event") {
      const event = cityEvents.find((entry) => entry.id === selection.id);
      return event ? { x: (event.col + .5) * CITY_MAP.tileSize, y: (event.row + .5) * CITY_MAP.tileSize } : null;
    }
    if (selection.kind === "asset") {
      const asset = cityWorldAssets.find((entry) => entry.id === selection.id);
      return asset ? { x: Number(asset.x), y: Number(asset.y) } : null;
    }
    return null;
  }

  function drawEditorPresence(context) {
    const selection = editorEntityWorldPosition(selectedEditorEntity);
    if (selection) {
      context.save();
      context.strokeStyle = "#ffe56a";
      context.fillStyle = "rgba(255,229,106,.2)";
      context.lineWidth = 3;
      context.beginPath(); context.arc(selection.x, selection.y, 23, 0, Math.PI * 2); context.fill(); context.stroke();
      context.restore();
    }
    collaboratorCursors.forEach((collaborator) => {
      if (!Number.isFinite(collaborator.x) || !Number.isFinite(collaborator.y)) return;
      context.save();
      context.translate(collaborator.x, collaborator.y);
      context.fillStyle = collaborator.color;
      context.strokeStyle = "rgba(10,28,22,.85)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, 0); context.lineTo(5, 18); context.lineTo(10, 11); context.lineTo(19, 9); context.closePath();
      context.fill(); context.stroke();
      context.font = "700 11px monospace";
      const width = context.measureText(collaborator.name).width + 10;
      context.fillStyle = "rgba(10,28,22,.88)"; context.fillRect(12, 13, width, 18);
      context.fillStyle = "#fff"; context.textBaseline = "top"; context.fillText(collaborator.name, 17, 16);
      context.restore();
    });
  }

  function drawTileGrid(context) {
    if (!elements.buildingEditor.classList.contains("open")) return;
    const size = CITY_MAP.tileSize;
    const startCol = Math.max(0, Math.floor(camera.x / size));
    const endCol = Math.min(Math.ceil(WORLD_WIDTH / size) - 1, Math.ceil((camera.x + VIEW_WIDTH) / size));
    const startRow = Math.max(0, Math.floor(camera.y / size));
    const endRow = Math.min(Math.ceil(WORLD_HEIGHT / size) - 1, Math.ceil((camera.y + VIEW_HEIGHT) / size));
    const colors = { blocked: "rgba(214,59,52,.34)", door: "rgba(255,191,46,.48)", encounter: "rgba(52,183,91,.34)", event: "rgba(126,81,201,.42)" };
    const npcTiles = new Set(cityNpcs.map((npc) => tileKey(npc.col, npc.row)));
    context.save();
    context.lineWidth = 1;
    context.font = "8px monospace";
    context.textAlign = "left";
    context.textBaseline = "top";
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const x = col * size; const y = row * size; const type = mapTileType(col, row);
        if (colors[type]) { context.fillStyle = colors[type]; context.fillRect(x, y, size, size); }
        const npcHere = npcTiles.has(tileKey(col, row));
        if (npcHere) { context.fillStyle = "rgba(48,174,214,.5)"; context.fillRect(x, y, size, size); }
        context.strokeStyle = "rgba(255,255,255,.48)"; context.strokeRect(x + .5, y + .5, size - 1, size - 1);
        context.fillStyle = "rgba(15,45,32,.82)"; context.fillText(npcHere ? "NPC" : `${col},${row}`, x + 2, y + 2);
      }
    }
    if (selectedMapTile) {
      context.strokeStyle = "#fff"; context.lineWidth = 3;
      context.strokeRect(selectedMapTile.col * size + 1.5, selectedMapTile.row * size + 1.5, size - 3, size - 3);
    }
    drawEditorPresence(context);
    context.restore();
  }

  function syncWorldCanvasResolution() {
    const rect = elements.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return { scaleX: 1, scaleY: 1 };
    VIEW_HEIGHT = BASE_VIEW_HEIGHT;
    VIEW_WIDTH = Math.max(1, Math.round(BASE_VIEW_HEIGHT * rect.width / rect.height));
    const deviceRatio = Math.max(1, Number(window.devicePixelRatio) || 1);
    const fourKCap = Math.min(MAX_RENDER_WIDTH / rect.width, MAX_RENDER_HEIGHT / rect.height);
    const renderRatio = Math.max(.5, Math.min(deviceRatio, fourKCap));
    const width = Math.max(1, Math.round(rect.width * renderRatio));
    const height = Math.max(1, Math.round(rect.height * renderRatio));
    if (elements.canvas.width !== width) elements.canvas.width = width;
    if (elements.canvas.height !== height) elements.canvas.height = height;
    document.documentElement.dataset.canvasResolution = `${width}x${height}`;
    document.documentElement.dataset.logicalViewport = `${VIEW_WIDTH}x${VIEW_HEIGHT}`;
    return { scaleX: width / VIEW_WIDTH, scaleY: height / VIEW_HEIGHT };
  }

  function drawWorld() {
    const context = elements.canvas.getContext("2d");
    const renderScale = syncWorldCanvasResolution();
    context.setTransform(renderScale.scaleX, 0, 0, renderScale.scaleY, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    updateMapTileStreaming(renderScale);
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

    if (state.interior === "building" || state.interior === "route") {
      context.fillStyle = "#0e1a16"; context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      context.save();
      context.translate(-Math.round(camera.x), -Math.round(camera.y));
      drawInterior(context);
      drawPlayer(context);
      context.restore();
      return;
    }

    context.save();
    const renderedCamera = mapRenderCamera(renderScale);
    context.translate(-renderedCamera.x, -renderedCamera.y);
    drawStreamedCityMap(context);
    drawStreetPolish(context);
    const encounterGrass = drawEncounterGrassBack(context);
    const visibleAssets = drawWorldEntities(context, encounterGrass);
    drawTileGrid(context);
    drawWorldAssetColliders(context, visibleAssets);
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
    if (cityMapPreviewReady) context.drawImage(cityMapPreview, 0, 0, width, height);
    else { context.fillStyle = "#79a85d"; context.fillRect(0, 0, width, height); }
    /* La miniatura compilada ya contiene edificios y arbolado. Dibujar de
       nuevo los assets aquí oscurecía y duplicaba la cartografía. */
    context.fillStyle = "rgba(13,35,27,.12)"; context.fillRect(0, 0, width, height);
    const size = CITY_MAP.tileSize;
    context.fillStyle = "rgba(52,183,91,.5)";
    (CITY_MAP.encounterAreas || []).forEach((area) => {
      if (area.shape === "polygon" && Array.isArray(area.points) && area.points.length >= 3) {
        context.beginPath();
        area.points.forEach(([x, y], index) => {
          if (index === 0) context.moveTo(x * scaleX, y * scaleY);
          else context.lineTo(x * scaleX, y * scaleY);
        });
        context.closePath();
        context.fill();
      } else {
        context.fillRect(area.x * scaleX, area.y * scaleY, area.w * scaleX, area.h * scaleY);
      }
    });
    CITY_MAP.encounterRects.forEach((rect) => {
      context.fillRect(rect[0] * size * scaleX, rect[1] * size * scaleY,
        (rect[2] - rect[0] + 1) * size * scaleX, (rect[3] - rect[1] + 1) * size * scaleY);
    });
    cityEntrances.forEach((door) => {
      context.fillStyle = door.action === "closed" ? "rgba(150,150,150,.8)" : "rgba(255,191,46,.95)";
      context.beginPath();
      context.arc(door.col * size * scaleX + size * scaleX / 2, door.row * size * scaleY + size * scaleY / 2, 2.4, 0, Math.PI * 2);
      context.fill();
    });
    context.fillStyle = "rgba(48,174,214,.98)";
    cityNpcs.forEach((npc) => {
      const position = mapNpcPosition(npc);
      context.beginPath(); context.arc(position.x * scaleX, position.y * scaleY, 2.7, 0, Math.PI * 2); context.fill();
    });
    if (VOICE_NPC_ENABLED && voiceNpc.positionReady && !doctorPotatoScene) {
      context.fillStyle = voiceNpc.active ? "#ff554e" : "#b74eb2";
      context.beginPath(); context.arc(voiceNpc.x * scaleX, voiceNpc.y * scaleY, voiceNpc.active ? 4 : 3, 0, Math.PI * 2); context.fill();
    }
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
    if (state.dimension === "prism" || state.interior) return;
    const targetX = clamp(state.worldX - VIEW_WIDTH / 2, 0, Math.max(0, currentWorldWidth() - VIEW_WIDTH));
    const targetY = clamp(state.worldY - VIEW_HEIGHT / 2, 0, Math.max(0, currentWorldHeight() - VIEW_HEIGHT));
    const smoothing = 1 - Math.pow(.0008, deltaSeconds);
    camera.x += (targetX - camera.x) * smoothing;
    camera.y += (targetY - camera.y) * smoothing;
  }

  function gameLoop(timestamp) {
    const deltaSeconds = lastFrameTime ? clamp((timestamp - lastFrameTime) / 1000, 0, .05) : 0;
    lastFrameTime = timestamp;
    if (!elements.worldScreen.classList.contains("hidden")) {
      updateDoctorPotatoCutscene(deltaSeconds);
      updateVoiceNpc(deltaSeconds);
      updateMovement(deltaSeconds);
      updateNpcPatrols(deltaSeconds);
      updateCamera(deltaSeconds);
      drawWorld();
      drawMiniMap();
    }
    window.requestAnimationFrame(gameLoop);
  }

  function chooseWildPokemon() {
    if (LOCAL_DEBUG_BATTLE?.wildId && POKEMON[LOCAL_DEBUG_BATTLE.wildId]) return LOCAL_DEBUG_BATTLE.wildId;
    let table = WILD_TABLE;
    if (state.dimension === "prism") table = PRISM_WILD_TABLE;
    else if (state.interior === "route") table = ROUTE_WILD_TABLE;
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
      const levelBoost = state.dimension === "prism" ? 1 : state.interior === "route" ? 0 : -2;
      const enemy = createPokemon(chooseWildPokemon(), clamp(active.level + levelBoost + Math.floor(Math.random() * 3), 2, 18));
      if (!state.seen.includes(enemy.id)) state.seen.push(enemy.id);
      battle = { enemy, busy: false, turns: 0 };
      elements.worldScreen.classList.add("hidden"); elements.titleScreen.classList.add("hidden"); elements.battleScreen.classList.remove("hidden");
      elements.battleScreen.classList.toggle("prism-battle", state.dimension === "prism");
      const label = state.dimension === "prism" ? "ENCUENTRO · DIMENSIÓN PRISMA" : state.interior === "route" ? "ENCUENTRO SALVAJE · RUTA SILVESTRE" : "ENCUENTRO SALVAJE · SAN PABLO";
      elements.battleLabel.textContent = label;
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
      elements.battleLabel.textContent = "RESCATE · MONSTRUO SECRETO";
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
    elements.enemySprite.classList.remove("fainting");
    elements.activeSprite.classList.remove("fainting");
    elements.enemyName.textContent = speciesOf(enemy).name.toUpperCase();
    elements.enemyLevel.textContent = `Nv. ${enemy.level}`;
    elements.enemySprite.src = frontSpriteUrl(enemy.id); attachSpriteFallback(elements.enemySprite, enemy.id);
    elements.enemySprite.classList.toggle("custom-pokemon-sprite", isCustomPokemon(enemy.id));
    setBattlePokemonMotion(elements.enemySprite, enemy.id, "front");
    elements.enemySprite.classList.toggle("inverted-secret", Boolean(battle.secretBattle));
    elements.activeName.textContent = speciesOf(active).name.toUpperCase();
    elements.activeLevel.textContent = `Nv. ${active.level}`;
    elements.battleActiveName.textContent = speciesOf(active).name.toUpperCase();
    elements.activeSprite.src = backSpriteUrl(active.id); attachSpriteFallback(elements.activeSprite, active.id, true);
    elements.activeSprite.classList.toggle("custom-pokemon-sprite", isCustomPokemon(active.id));
    setBattlePokemonMotion(elements.activeSprite, active.id, "back");
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
      Fuego: ["Planta", "Bicho", "Hielo"], Agua: ["Fuego", "Tierra", "Roca"], Planta: ["Agua", "Tierra", "Roca"],
      Eléctrico: ["Agua", "Volador"], Volador: ["Planta", "Bicho", "Lucha"], Bicho: ["Planta", "Psíquico"],
      Psíquico: ["Veneno", "Lucha"], Fantasma: ["Psíquico", "Fantasma"], Dragón: ["Dragón"], Tierra: ["Eléctrico", "Acero", "Roca"],
      Roca: ["Fuego", "Volador", "Bicho", "Hielo"], Hada: ["Dragón", "Siniestro", "Lucha"], Siniestro: ["Psíquico", "Fantasma"],
      Hielo: ["Planta", "Tierra", "Volador", "Dragón"], Lucha: ["Normal", "Hielo", "Roca", "Siniestro", "Acero"], Acero: ["Hielo", "Roca", "Hada"],
    };
    const weak = {
      Fuego: ["Agua", "Roca"], Agua: ["Planta"], Planta: ["Fuego", "Bicho", "Volador", "Hielo"],
      Eléctrico: ["Planta", "Tierra"], Psíquico: ["Psíquico", "Acero"], Fantasma: ["Normal"], Roca: ["Tierra", "Acero"], Hada: ["Veneno", "Acero"], Siniestro: ["Hada", "Bicho", "Lucha"],
      Hielo: ["Fuego", "Agua", "Hielo", "Acero"], Lucha: ["Volador", "Psíquico", "Hada"], Acero: ["Fuego", "Agua", "Eléctrico"],
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

  function moveFxClass(moveType) {
    const classes = {
      Fuego: "fire", Agua: "water", Planta: "grass", Eléctrico: "electric",
      Psíquico: "psychic", Fantasma: "ghost", Siniestro: "ghost", Dragón: "dragon", Hada: "psychic", Volador: "wind",
      Bicho: "bug", Veneno: "poison", Acero: "steel", Tierra: "ground", Roca: "ground", Hielo: "water", Lucha: "normal", Normal: "normal",
    };
    return classes[moveType] || "normal";
  }

  function spawnMoveVisual(attacker, defender, moveType) {
    const scene = elements.battleScene; if (!scene) return [];
    const sceneRect = scene.getBoundingClientRect();
    const a = attacker.getBoundingClientRect(); const d = defender.getBoundingClientRect();
    const startX = a.left + a.width / 2 - sceneRect.left; const startY = a.top + a.height * .48 - sceneRect.top;
    const endX = d.left + d.width / 2 - sceneRect.left; const endY = d.top + d.height * .48 - sceneRect.top;
    const dx = endX - startX; const dy = endY - startY;
    const distancePx = Math.hypot(dx, dy); const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const fxClass = moveFxClass(moveType); const nodes = [];

    const trail = document.createElement("span");
    trail.className = `fx-move-trail fx-${fxClass}`;
    trail.style.left = `${startX}px`; trail.style.top = `${startY}px`;
    trail.style.width = `${distancePx}px`; trail.style.setProperty("--angle", `${angle}deg`);
    scene.appendChild(trail); nodes.push(trail);

    const count = ["electric", "psychic", "ghost", "dragon"].includes(fxClass) ? 3 : 6;
    for (let index = 0; index < count; index += 1) {
      const projectile = document.createElement("span");
      projectile.className = `fx-move-projectile fx-${fxClass}`;
      projectile.style.left = `${startX}px`; projectile.style.top = `${startY}px`;
      projectile.style.setProperty("--tx", `${dx}px`); projectile.style.setProperty("--ty", `${dy}px`);
      projectile.style.setProperty("--mx", `${dx * .56}px`); projectile.style.setProperty("--my", `${dy * .56}px`);
      projectile.style.setProperty("--curve", `${(index - (count - 1) / 2) * 13}px`);
      projectile.style.setProperty("--delay", `${index * 35}ms`);
      projectile.textContent = fxClass === "grass" ? "◆" : fxClass === "wind" ? "◌" : "";
      scene.appendChild(projectile); nodes.push(projectile);
    }

    if (["electric", "psychic", "ghost", "dragon"].includes(fxClass)) {
      for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
        const ring = document.createElement("span");
        ring.className = `fx-move-ring fx-${fxClass}`;
        ring.style.left = `${endX}px`; ring.style.top = `${endY}px`;
        ring.style.setProperty("--delay", `${180 + ringIndex * 80}ms`);
        scene.appendChild(ring); nodes.push(ring);
      }
    }
    return nodes;
  }

  function spawnAnatomyCue(attacker, profile) {
    const origin = fxOrigin(attacker);
    if (!origin || !profile) return null;
    const cue = document.createElement("span");
    cue.className = `fx-anatomy fx-anatomy-${profile.kind}`;
    cue.style.left = `${origin.x}px`;
    cue.style.top = `${origin.y}px`;
    cue.style.setProperty("--cue-direction", attacker.dataset.view === "front" ? -1 : 1);
    cue.setAttribute("aria-hidden", "true");
    origin.scene.appendChild(cue);
    return cue;
  }

  async function animateMove(attacker, defender, moveType, intensity = 1) {
    const pokemonId = Number(attacker.dataset.pokemonId);
    const profile = customPokemonAttack(pokemonId);
    const isFront = attacker.dataset.view === "front";
    const attackPose = isFront ? customPokemonAsset(pokemonId, "attackFront") : null;
    const originalSrc = attacker.getAttribute("src");
    const nodes = [];
    const timers = [];
    let anatomyCue = null;
    const later = (callback, delay) => {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
      return timer;
    };

    attacker.classList.remove("attacking", "anatomy-attacking", "attack-pose-active");
    defender.classList.remove("hit");
    void attacker.offsetWidth;

    if (!profile) {
      attacker.classList.add("attacking");
      nodes.push(...spawnMoveVisual(attacker, defender, moveType));
      later(() => {
        defender.classList.add("hit");
        spawnHitParticles(defender, moveType, intensity);
        if (["Eléctrico", "Dragón", "Tierra", "Acero", "Hielo", "Lucha"].includes(moveType)) shakeBattle(.65 * intensity);
      }, 260);
      await wait(560);
    } else {
      attacker.classList.add("anatomy-attacking");
      anatomyCue = spawnAnatomyCue(attacker, profile);
      if (attackPose) later(() => {
        attacker.classList.add("attack-pose-active");
        attacker.src = attackPose;
      }, 690);
      later(() => nodes.push(...spawnMoveVisual(attacker, defender, moveType)), 880);
      later(() => {
        defender.classList.add("hit");
        spawnHitParticles(defender, moveType, intensity);
        if (["Eléctrico", "Dragón", "Tierra", "Acero", "Roca", "Hielo", "Lucha"].includes(moveType)) shakeBattle(.8 * intensity);
      }, 1260);
      if (attackPose) later(() => {
        attacker.classList.remove("attack-pose-active");
        if (originalSrc) attacker.src = originalSrc;
      }, 1810);
      await wait(CUSTOM_ATTACK_DURATION);
    }

    timers.forEach((timer) => window.clearTimeout(timer));
    if (originalSrc && attacker.getAttribute("src") !== originalSrc) attacker.src = originalSrc;
    attacker.classList.remove("attacking", "anatomy-attacking", "attack-pose-active");
    defender.classList.remove("hit");
    anatomyCue?.remove();
    nodes.forEach((node) => node.remove());
  }

  function fxOrigin(defender) {
    const scene = elements.battleScene; if (!scene) return null;
    const sceneRect = scene.getBoundingClientRect();
    const r = defender.getBoundingClientRect();
    return { scene, x: r.left + r.width / 2 - sceneRect.left, y: r.top + r.height / 2 - sceneRect.top, top: r.top - sceneRect.top };
  }

  function spawnHitParticles(defender, moveType, intensity = 1) {
    const origin = fxOrigin(defender); if (!origin) return;
    const { scene, x, y } = origin;
    const color = TYPE_COLORS[moveType] || "#ffffff";
    const count = Math.round(9 * intensity);
    for (let i = 0; i < count; i += 1) {
      const p = document.createElement("span");
      p.className = "fx-particle";
      const angle = (Math.PI * 2 * i) / count + Math.random() * .5;
      const dist = 36 + Math.random() * 58 * intensity;
      p.style.left = x + "px"; p.style.top = y + "px"; p.style.background = color;
      p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      const size = 5 + Math.random() * 7;
      p.style.width = size + "px"; p.style.height = size + "px";
      scene.appendChild(p);
      window.setTimeout(() => p.remove(), 640);
    }
  }

  function spawnDamageNumber(defender, amount, color) {
    const origin = fxOrigin(defender); if (!origin) return;
    const { scene, x, top } = origin;
    const el = document.createElement("span");
    el.className = "fx-damage";
    el.textContent = "-" + amount;
    el.style.left = x + "px"; el.style.top = top + "px";
    if (color) el.style.color = color;
    scene.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }

  function shakeBattle(intensity = 1) {
    const scene = elements.battleScene; if (!scene) return;
    scene.style.setProperty("--shake", String(Math.round(6 * intensity)));
    scene.classList.remove("shake"); void scene.offsetWidth;
    scene.classList.add("shake");
    window.setTimeout(() => { scene.classList.remove("shake"); scene.style.removeProperty("--shake"); }, 440);
  }

  function spawnCaptureStars() {
    const origin = fxOrigin(elements.enemySprite); if (!origin) return;
    const { scene, x, y } = origin;
    for (let i = 0; i < 14; i += 1) {
      const s = document.createElement("span");
      s.className = "fx-star";
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 90;
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      s.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      scene.appendChild(s);
      window.setTimeout(() => s.remove(), 900);
    }
  }

  async function playerAttack(index) {
    if (!battle || battle.busy) return;
    const active = activePokemon(); const move = speciesOf(active).moves[index];
    setBattleBusy(true); elements.movesMenu.classList.add("hidden"); elements.battleMenu.classList.remove("hidden");
    setBattleMessage(`¡${speciesOf(active).name} usó ${move.name}!`);
    playTone(move.type === "Eléctrico" ? 740 : 260, .12, "square", .04); await animateMove(elements.activeSprite, elements.enemySprite, move.type);
    if (Math.random() * 100 > move.accuracy) { setBattleMessage("¡El ataque falló!"); await wait(700); await enemyTurn(); return; }
    const result = calculateDamage(active, battle.enemy, move);
    battle.enemy.hp = Math.max(0, battle.enemy.hp - result.damage);
    if (move.drain) active.hp = Math.min(active.maxHp, active.hp + Math.max(1, Math.floor(result.damage / 3)));
    updateBattleHealth();
    spawnDamageNumber(elements.enemySprite, result.damage, result.critical ? "#ffd24a" : "#ffffff");
    if (result.critical) { setBattleMessage("¡Un golpe crítico!"); shakeBattle(1.5); spawnHitParticles(elements.enemySprite, move.type, 1.7); }
    else if (result.multiplier > 1) { setBattleMessage("¡Es supereficaz!"); shakeBattle(1); spawnHitParticles(elements.enemySprite, move.type, 1.3); }
    else if (result.multiplier < 1) setBattleMessage("No es muy eficaz…");
    await wait(700);
    if (battle.enemy.hp <= 0) { elements.enemySprite.classList.add("fainting"); await wait(640); await winBattle(); return; }
    await enemyTurn();
  }

  async function enemyTurn() {
    if (!battle) return;
    const enemy = battle.enemy; const move = speciesOf(enemy).moves[Math.floor(Math.random() * speciesOf(enemy).moves.length)]; const active = activePokemon();
    setBattleMessage(`¡${speciesOf(enemy).name} salvaje usó ${move.name}!`); playTone(180, .11, "sawtooth", .03);
    await animateMove(elements.enemySprite, elements.activeSprite, move.type);
    if (Math.random() * 100 <= move.accuracy) {
      const result = calculateDamage(enemy, active, move); active.hp = Math.max(0, active.hp - result.damage);
      if (move.drain) enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.max(1, Math.floor(result.damage / 3)));
      updateBattleHealth();
      spawnDamageNumber(elements.activeSprite, result.damage, result.critical ? "#ffd24a" : "#ffe3e3");
      if (result.critical) { shakeBattle(1.4); spawnHitParticles(elements.activeSprite, move.type, 1.5); }
      else if (result.multiplier > 1) { shakeBattle(.8); spawnHitParticles(elements.activeSprite, move.type, 1.2); }
    } else setBattleMessage("¡El ataque enemigo falló!");
    await wait(700);
    if (active.hp <= 0) {
      setBattleMessage(`¡${speciesOf(active).name} no puede continuar!`); elements.activeSprite.classList.add("fainting"); await wait(640);
      const next = firstHealthyTeamIndex();
      if (next === -1) { await loseBattle(); return; }
      state.activeTeamIndex = next; renderBattle(); setBattleMessage(`¡Adelante, ${speciesOf(activePokemon()).name}!`); await wait(700);
    }
    setBattleBusy(false); saveGame();
  }

  async function awardExperience(member, amount) {
    const previousName = speciesOf(member).name;
    member.exp += amount; let levelUp = false;
    while (member.level < 50 && member.exp >= expNeeded(member.level)) { member.exp -= expNeeded(member.level); member.level += 1; member.maxHp += 3; member.hp = Math.min(member.maxHp, member.hp + 5); levelUp = true; }
    if (member.level >= 50) member.exp = 0;
    if (levelUp) {
      const evolutions = evolvePokemonIfReady(member);
      state.trainerLevel = Math.max(1, Math.floor(state.team.reduce((sum, item) => sum + item.level, 0) / state.team.length) - 3);
      renderBattle(); setBattleMessage(`¡${previousName} subió al nivel ${member.level}!`); playJingle("level"); await wait(1050);
      for (const evolution of evolutions) {
        renderBattle();
        setBattleMessage(`¡${evolution.from} evolucionó a ${evolution.to}!`);
        playJingle("success");
        await wait(1200);
      }
    }
  }

  async function winBattle() {
    if (battle?.secretBattle) {
      await rescueSecretPokemon();
      return;
    }
    const defeated = battle.enemy; const reward = 10 + defeated.level * 4;
    const moneyReward = 12 + defeated.level * 4;
    state.battlesWon += 1; state.money += moneyReward;
    setBattleMessage(`¡${speciesOf(defeated).name} salvaje fue derrotado!`); playJingle("success"); await wait(750);
    setBattleMessage(`${speciesOf(activePokemon()).name} ganó ${reward} puntos de experiencia (+${moneyReward} ₽).`); await wait(700);
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
      : `¡${speciesOf(rescued).name} invertido está a salvo! Queda registrado en tu Sanpledex.`);
    await wait(1250);

    stopMicrophone();
    const destination = state.returnPosition || currentPortalReturn();
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
      `Has salvado a ${speciesOf(rescued).name}, el monstruo secreto de colores invertidos.`,
    ], "◇", () => showAreaToast(`${speciesOf(rescued).name.toUpperCase()} RESCATADO`));
  }

  async function loseBattle() {
    setBattleMessage("Tu equipo está agotado… Os llevan al Centro de Salud San Pablo."); playJingle("lose"); await wait(1300);
    stopMicrophone();
    state.team.forEach((member) => { member.hp = member.maxHp; });
    state.dimension = "san_pablo"; state.returnPosition = null; state.interior = null; state.interiorData = null; state.maintenanceReturn = null;
    const healthReturn = currentHealthReturn();
    state.worldX = healthReturn.x; state.worldY = healthReturn.y; state.direction = "down";
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
    const master = ballType === "master";
    const available = master ? state.inventory.masterBalls : ultra ? state.inventory.ultraBalls : state.balls;
    const ballName = master ? "Master Ball" : ultra ? "Ultra Ball" : "Poké Ball";
    if (available <= 0) { setBattleMessage(`No te quedan ${ballName}s.`); playTone(95, .15, "square", .03); return; }
    setBattleBusy(true);
    if (master) state.inventory.masterBalls -= 1;
    else if (ultra) state.inventory.ultraBalls -= 1;
    else state.balls -= 1;
    renderHud();
    const enemy = battle.enemy; const species = speciesOf(enemy);
    setBattleMessage(`¡Lanzaste una ${ballName}!`); createThrownBall(ballType); playTone(520, .12, "sine", .04); await wait(800);
    const chance = master ? 1 : clamp(species.catchRate + (1 - enemy.hp / enemy.maxHp) * .48 + (ultra ? .24 : 0), .2, .98);
    if (Math.random() < chance) {
      elements.enemySprite.classList.add("caught"); setBattleMessage("…"); await wait(650);
      setBattleMessage(`¡Genial! ${species.name} ha sido capturado.`); playJingle("capture"); spawnCaptureStars();
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

  function createThrownBall(type = "poke") {
    const ball = document.createElement("span"); ball.className = `thrown-ball ${type === "poke" ? "" : type}`; ball.innerHTML = "<i></i>";
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
    elements.enemySprite.classList.remove("caught", "hit", "attacking", "anatomy-attacking", "attack-pose-active", "inverted-secret", "fainting"); elements.activeSprite.classList.remove("caught", "hit", "attacking", "anatomy-attacking", "attack-pose-active", "fainting");
    elements.movesMenu.classList.add("hidden"); elements.battleMenu.classList.remove("hidden"); showWorld(); saveGame();
  }

  function sanpledexFamilyOf(id) {
    return SANPLEDEX_FAMILIES.find((family) => family.ids.includes(Number(id))) || SANPLEDEX_FAMILIES[0];
  }

  function sanpledexStatus(id) {
    const numericId = Number(id);
    const captured = state.caught.some((caughtId) => Number(caughtId) === numericId);
    const seen = captured || state.seen.some((seenId) => Number(seenId) === numericId);
    if (captured) return { label: "Capturada", className: "captured" };
    if (seen) return { label: "Avistada", className: "seen" };
    return { label: "Sin avistar", className: "unknown" };
  }

  function sanpledexTypeBadges(species, compact = false) {
    return [species.type, species.secondaryType].filter(Boolean).map((type) =>
      `<span class="sanpledex-type ${compact ? "compact" : ""}" style="--type-color:${TYPE_COLORS[type] || "#718078"}">${type}</span>`
    ).join("");
  }

  function renderSanpledex() {
    if (!elements.sanpledexList || !elements.sanpledexDetail) return;
    if (!SANPLEDEX_IDS.includes(selectedSanpledexId)) selectedSanpledexId = SANPLEDEX_IDS[0];

    const customCaught = SANPLEDEX_IDS.filter((id) => state.caught.some((caughtId) => Number(caughtId) === id)).length;
    const customSeen = SANPLEDEX_IDS.filter((id) => state.seen.some((seenId) => Number(seenId) === id) || state.caught.some((caughtId) => Number(caughtId) === id)).length;
    elements.sanpledexCaughtCount.textContent = `${customCaught} / ${SANPLEDEX_IDS.length}`;
    elements.sanpledexSeenCount.textContent = `${customSeen} / ${SANPLEDEX_IDS.length}`;
    elements.sanpledexProgress.style.width = `${clamp(customCaught / SANPLEDEX_IDS.length * 100, 0, 100)}%`;

    elements.sanpledexList.innerHTML = SANPLEDEX_IDS.map((id, index) => {
      const species = POKEMON[id];
      const status = sanpledexStatus(id);
      const selected = id === selectedSanpledexId;
      return `<button type="button" class="sanpledex-entry ${selected ? "selected" : ""}" data-sanpledex-id="${id}" role="option" aria-selected="${selected}">
        <img src="${iconUrl(id)}" alt="" draggable="false" />
        <span><small>S-${String(index + 1).padStart(3, "0")}</small><strong>${species.name}</strong><span class="sanpledex-entry-types">${sanpledexTypeBadges(species, true)}</span></span>
        <i class="sanpledex-state ${status.className}" aria-label="${status.label}" title="${status.label}"></i>
      </button>`;
    }).join("");

    const species = POKEMON[selectedSanpledexId];
    const family = sanpledexFamilyOf(selectedSanpledexId);
    const status = sanpledexStatus(selectedSanpledexId);
    const motion = CUSTOM_POKEMON_MOTIONS[selectedSanpledexId];
    const attack = customPokemonAttack(selectedSanpledexId);
    const attackFront = customPokemonAsset(selectedSanpledexId, "attackFront");
    const attackStyle = customAttackStyle(attack);
    const entryNumber = SANPLEDEX_IDS.indexOf(selectedSanpledexId) + 1;
    const evolutionHtml = family.ids.map((id, index) => {
      const stage = POKEMON[id];
      const previous = index > 0 ? POKEMON[family.ids[index - 1]] : null;
      return `<button type="button" class="sanpledex-evolution ${id === selectedSanpledexId ? "selected" : ""}" data-sanpledex-id="${id}" aria-label="Ver ficha de ${stage.name}">
        <img src="${iconUrl(id)}" alt="" draggable="false" />
        <span><strong>${stage.name}</strong><small>${previous?.evolveLevel ? `Nv. ${previous.evolveLevel}` : "Origen"}</small></span>
      </button>`;
    }).join('<span class="sanpledex-evolution-arrow" aria-hidden="true">→</span>');

    elements.sanpledexDetail.innerHTML = `<div class="sanpledex-detail-heading">
        <div><small>S-${String(entryNumber).padStart(3, "0")} · ${family.name}</small><h3>${species.name}</h3></div>
        <span class="sanpledex-status ${status.className}">${status.label}</span>
      </div>
      <div class="sanpledex-types" aria-label="Tipos de ${species.name}">${sanpledexTypeBadges(species)}</div>
      <div class="sanpledex-sprites sanpledex-combat-preview ${attackFront ? "has-attack-pose" : ""}" data-attack-kind="${attack.kind}" style="${attackStyle}" aria-label="Animación frontal y trasera de ${species.name}">
        <figure><div class="sanpledex-platform" data-view="front">
          <img class="sanpledex-sprite sanpledex-base-sprite custom-pokemon-sprite" data-pokemon-motion="${motion}" data-view="front" src="${frontSpriteUrl(selectedSanpledexId)}" alt="${species.name} de frente" draggable="false" />
          ${attackFront ? `<img class="sanpledex-sprite sanpledex-attack-pose custom-pokemon-sprite" src="${attackFront}" alt="" aria-hidden="true" draggable="false" />` : ""}
          <span class="sanpledex-anatomy-cue" aria-hidden="true"></span>
        </div><figcaption>Frontal · rival</figcaption></figure>
        <figure><div class="sanpledex-platform" data-view="back">
          <img class="sanpledex-sprite sanpledex-base-sprite custom-pokemon-sprite" data-pokemon-motion="${motion}" data-view="back" src="${backSpriteUrl(selectedSanpledexId)}" alt="${species.name} de espaldas" draggable="false" />
          <span class="sanpledex-anatomy-cue" aria-hidden="true"></span>
        </div><figcaption>Espalda · compañero</figcaption></figure>
      </div>
      <div class="sanpledex-attack-panel">
        <button type="button" class="sanpledex-attack-button" data-sanpledex-attack aria-pressed="false">▶ Ver ataque · 3 s</button>
        <p><strong>${attack.title}</strong><span>${attack.anatomy}</span></p>
      </div>
      <p class="sanpledex-description">${species.description}</p>
      <div class="sanpledex-evolution-title"><strong>CADENA EVOLUTIVA</strong><span>${family.name}</span></div>
      <div class="sanpledex-evolutions">${evolutionHtml}</div>`;
  }

  function previewSanpledexAttack() {
    const preview = elements.sanpledexDetail?.querySelector(".sanpledex-combat-preview");
    const button = elements.sanpledexDetail?.querySelector("[data-sanpledex-attack]");
    if (!preview || !button) return;
    window.clearTimeout(sanpledexAttackTimer);
    preview.classList.remove("previewing-attack");
    void preview.offsetWidth;
    preview.classList.add("previewing-attack");
    button.setAttribute("aria-pressed", "true");
    button.textContent = "Reproduciendo ataque…";
    sanpledexAttackTimer = window.setTimeout(() => {
      preview.classList.remove("previewing-attack");
      button.setAttribute("aria-pressed", "false");
      button.textContent = "▶ Ver ataque · 3 s";
      sanpledexAttackTimer = 0;
    }, CUSTOM_ATTACK_DURATION);
  }

  function selectSanpledexEntry(id, focusSelected = false) {
    const numericId = Number(id);
    if (!SANPLEDEX_IDS.includes(numericId)) return;
    window.clearTimeout(sanpledexAttackTimer);
    sanpledexAttackTimer = 0;
    selectedSanpledexId = numericId;
    renderSanpledex();
    if (focusSelected) elements.sanpledexList.querySelector(`[data-sanpledex-id="${numericId}"]`)?.focus({ preventScroll: true });
  }

  function openSanpledex() {
    if (!elements.sanpledexModal) return;
    lastSanpledexFocus = document.activeElement instanceof HTMLElement ? document.activeElement : elements.sanpledexButton;
    closeTeam(); closeBuildingEditorPanel(); closeInventoryPanel(); closeShop(); clearDirectionalInput();
    renderSanpledex();
    elements.sanpledexModal.classList.remove("hidden");
    elements.sanpledexModal.setAttribute("aria-hidden", "false");
    elements.closeSanpledex?.focus({ preventScroll: true });
  }

  function closeSanpledex(restoreFocus = true) {
    if (!elements.sanpledexModal || elements.sanpledexModal.classList.contains("hidden")) return;
    window.clearTimeout(sanpledexAttackTimer);
    sanpledexAttackTimer = 0;
    elements.sanpledexModal.classList.add("hidden");
    elements.sanpledexModal.setAttribute("aria-hidden", "true");
    if (restoreFocus) (lastSanpledexFocus?.isConnected ? lastSanpledexFocus : elements.sanpledexButton)?.focus({ preventScroll: true });
    lastSanpledexFocus = null;
  }

  function openTeam() {
    if (!state.started) return;
    closeSanpledex(false); closeBuildingEditorPanel(); closeInventoryPanel(); clearDirectionalInput(); renderTeam(); elements.teamDrawer.classList.add("open"); elements.teamDrawer.setAttribute("aria-hidden", "false"); elements.drawerScrim.classList.remove("hidden");
  }
  function closeTeam() { elements.teamDrawer.classList.remove("open"); elements.teamDrawer.setAttribute("aria-hidden", "true"); elements.drawerScrim.classList.add("hidden"); }

  function renderTeam() {
    const members = state.team.map((member, index) => {
      const species = speciesOf(member); const percent = clamp(member.hp / member.maxHp * 100, 0, 100); const active = index === state.activeTeamIndex;
      return `<article class="team-member ${active ? "active" : ""}">
        <img class="${member.inverted ? "inverted-member" : ""} ${isCustomPokemon(member.id) ? "custom-pokemon-sprite" : ""} ${isPetrillo(member.id) ? "petrillo-sprite petrillo-team-sprite" : ""}" src="${iconUrl(member.id)}" alt="${species.name}" draggable="false" />
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
    elements.starterIntroVideo.muted = !state.sound;
    elements.fragmentCinematicVideo.muted = !state.sound;
    if (!state.sound) {
      stopHorrorAudio();
      stopBackgroundMusic();
      stopDialogMusic(false);
      if (dialogPresentation?.music) document.documentElement.dataset.dialogMusic = "muted";
    }
    renderHud();
    if (state.sound) {
      playJingle("success");
      if (dialogPresentation?.music) playDialogMusic(dialogPresentation.music);
      else if (!elements.worldScreen.classList.contains("hidden") && state.started) startBackgroundMusic();
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

  const backgroundMusic = new Audio("assets/audio/Nylon_and_Cartridge.mp3");
  backgroundMusic.loop = true;
  backgroundMusic.preload = "auto";
  backgroundMusic.volume = 0.05;

  function startBackgroundMusic() {
    if (!state.sound || starterIntroActive) return;
    backgroundMusic.loop = true;
    backgroundMusic.volume = 0.05;
    const playRequest = backgroundMusic.play();
    if (playRequest?.catch) playRequest.catch(() => {});
  }

  function stopBackgroundMusic() {
    backgroundMusic.pause();
    try { backgroundMusic.currentTime = 0; } catch (error) { /* Metadata may not be ready yet. */ }
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
    if (starterIntroActive) {
      if (event.key === "Escape") {
        event.preventDefault();
        finishStarterIntro();
      }
      return;
    }
    if (fragmentCinematicActive) {
      if (event.key === "Escape") {
        event.preventDefault();
        finishFragmentCinematic();
      } else if ((event.key === " " || event.key === "Enter") && elements.fragmentCinematicVideo.paused) {
        event.preventDefault();
        resumeFragmentCinematic();
      }
      return;
    }
    if (elements.buildingEditor.classList.contains("open")) {
      if (event.key === "Escape") {
        closeBuildingEditorPanel();
        return;
      }
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "")
        || document.activeElement?.isContentEditable;
      const movementKey = ["w", "a", "s", "d", "shift"].includes(event.key.toLowerCase());
      if (!typing && movementKey) {
        const control = keyToControl(event.key);
        if (control) {
          event.preventDefault(); input[control] = true;
          document.documentElement.dataset.editorMovementKey = event.key.toLowerCase();
          document.documentElement.dataset.editorMovementAccepted = "true";
        }
      }
      return;
    }
    if (elements.sanpledexModal && !elements.sanpledexModal.classList.contains("hidden")) {
      if (event.key === "Escape") closeSanpledex();
      else if (event.key === "Tab") {
        const focusable = [...elements.sanpledexModal.querySelectorAll("button:not([disabled]), select:not([disabled]), input:not([disabled])")]
          .filter((element) => element.offsetParent !== null);
        if (!focusable.length) event.preventDefault();
        else {
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (!elements.sanpledexModal.contains(document.activeElement)) {
            event.preventDefault(); first.focus();
          } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }
      }
      return;
    }
    if (elements.shopModal && !elements.shopModal.classList.contains("hidden")) {
      if (event.key === "Escape") closeShop();
      else if (event.key === "Tab") {
        const focusable = [...elements.shopModal.querySelectorAll("button:not([disabled])")]
          .filter((button) => button.offsetParent !== null);
        if (!focusable.length) event.preventDefault();
        else {
          const first = focusable[0]; const last = focusable[focusable.length - 1];
          if (!elements.shopModal.contains(document.activeElement)) {
            event.preventDefault(); first.focus();
          } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }
      }
      return;
    }
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
    if ((event.key === "p" || event.key === "P") && !event.repeat) { event.preventDefault(); openSanpledex(); }
    if ((event.key === "m" || event.key === "M") && !event.repeat) elements.teamDrawer.classList.contains("open") ? closeTeam() : openTeam();
    if (event.key === "Escape") { closeSanpledex(); closeTeam(); closeBuildingEditorPanel(); closeInventoryPanel(); closeShop(); }
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
    elements.starterIntroVideo.addEventListener("ended", finishStarterIntro);
    elements.starterIntroVideo.addEventListener("error", finishStarterIntro);
    elements.playStarterIntro.addEventListener("click", resumeStarterIntro);
    elements.skipStarterIntro.addEventListener("click", finishStarterIntro);
    elements.fragmentCinematicVideo.addEventListener("ended", finishFragmentCinematic);
    elements.fragmentCinematicVideo.addEventListener("error", finishFragmentCinematic);
    elements.playFragmentCinematic.addEventListener("click", resumeFragmentCinematic);
    elements.skipFragmentCinematic.addEventListener("click", finishFragmentCinematic);
    elements.teamButton.addEventListener("click", openTeam); elements.closeTeamButton.addEventListener("click", closeTeam); elements.drawerScrim.addEventListener("click", closeTeam);
    elements.sanpledexButton.addEventListener("click", openSanpledex);
    elements.closeSanpledex.addEventListener("click", () => closeSanpledex());
    elements.sanpledexModal.addEventListener("click", (event) => {
      if (event.target === elements.sanpledexModal) { closeSanpledex(); return; }
      const attackTrigger = event.target instanceof Element ? event.target.closest("[data-sanpledex-attack]") : null;
      if (attackTrigger) { previewSanpledexAttack(); return; }
      const trigger = event.target instanceof Element ? event.target.closest("[data-sanpledex-id]") : null;
      if (trigger) selectSanpledexEntry(trigger.dataset.sanpledexId, true);
    });
    elements.saveButton.addEventListener("click", () => { closeTeam(); saveGame(true); });
    elements.resetButton.addEventListener("click", () => { if (window.confirm("¿Quieres borrar la partida guardada y empezar de nuevo?")) { window.localStorage.removeItem(SAVE_KEY); window.location.reload(); } });
    elements.soundButton.addEventListener("click", toggleSound);
    elements.fullscreenButton.addEventListener("click", toggleFullscreen);
    if (VOICE_NPC_ENABLED) elements.voiceNpcRetry?.addEventListener("click", () => requestVoiceNpcAccess(true));
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
      const centerX = selectedMapTile.col * CITY_MAP.tileSize + CITY_MAP.tileSize / 2;
      const centerY = selectedMapTile.row * CITY_MAP.tileSize + CITY_MAP.tileSize / 2;
      const text = `C${selectedMapTile.col}, F${selectedMapTile.row} (centro X${centerX}, Y${centerY}): ${mapTileType(selectedMapTile.col, selectedMapTile.row)}`;
      try { await navigator.clipboard.writeText(text); elements.tileEditorHint.textContent = `Copiado: ${text}`; }
      catch (error) { elements.tileEditorHint.textContent = text; }
    });
    elements.copyNpcButton.addEventListener("click", async () => {
      if (!selectedMapTile) return;
      const text = `{ id: "nuevo-npc", col: ${selectedMapTile.col}, row: ${selectedMapTile.row}, direction: "down", name: "Nombre", sprite: "nino-sol", lines: ["Diálogo"] }`;
      try { await navigator.clipboard.writeText(text); elements.tileEditorHint.textContent = `NPC copiado para C${selectedMapTile.col}, F${selectedMapTile.row}`; }
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
    if (elements.closeShop) elements.closeShop.addEventListener("click", closeShop);
    document.addEventListener("keydown", handleKeyDown); document.addEventListener("keyup", handleKeyUp); window.addEventListener("blur", clearDirectionalInput);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { scheduleVoiceRecognitionRestart(100); return; }
      clearDirectionalInput();
      releaseAllMapTiles();
      if (state.started) saveGame();
    });
    window.addEventListener("pagehide", () => {
      if (state.started) saveGame();
      voiceNpc.shouldListen = false;
      window.clearTimeout(voiceNpc.restartTimer);
      try { voiceNpc.recognition?.stop(); } catch (error) { /* Recognition may already be stopped. */ }
      stopMicrophone(true);
    });
    $$('[data-control]').forEach(bindTouchControl); $$('[data-action]').forEach((button) => button.addEventListener("click", primaryAction));
  }

  function startFragmentCinematicDebugSession() {
    if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)) return false;
    state = defaultState();
    state.started = true; state.starterChosen = true;
    state.sound = false;
    state.team = [createPokemon(PETRILLO_ID, 8)]; state.caught = [PETRILLO_ID]; state.seen = [PETRILLO_ID];
    state.inventory.prismShards = 3;
    showWorld();
    return startFragmentCinematic();
  }

  function startPrismDebugSession(money = 2500, target = "start") {
    if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)) return false;
    closeShop(); stopMicrophone();
    state = defaultState();
    state.started = true; state.starterChosen = true;
    state.team = [createPokemon(PETRILLO_ID, 12)]; state.caught = [PETRILLO_ID]; state.seen = [PETRILLO_ID];
    state.money = Math.max(0, Math.floor(Number(money) || 0));
    state.inventory.prismShards = 3;
    state.returnPosition = currentPortalReturn();
    state.dimension = "prism"; state.dimensionVisited = true; state.secretPokemonId = chooseSecretPokemonId();
    const maze = ensureMazeState(true);
    const marketViewPath = target === "market_view"
      ? findMazePath(mazeDefinition.start.x + .5, mazeDefinition.start.y + .5, mazeDefinition.market.x + .5, mazeDefinition.market.y + .5)
      : [];
    const point = target === "market_view"
      ? marketViewPath[Math.max(0, marketViewPath.length - 3)] || mazeDefinition.start
      : mazeDefinition[target] || mazeDefinition.start;
    maze.playerX = point.x + .5; maze.playerY = point.y + .5;
    maze.angle = target === "market_view"
      ? Math.atan2(mazeDefinition.market.y + .5 - maze.playerY, mazeDefinition.market.x + .5 - maze.playerX)
      : firstOpenDirection(mazeDefinition.grid, point);
    microphoneFallbackMode = true;
    state.worldX = 1050; state.worldY = 1830; state.direction = "up";
    if (elements.noiseLabel) elements.noiseLabel.textContent = "MOVIMIENTO";
    showWorld(); updateMazeHud(0); updateInteractPrompt(); saveGame();
    return true;
  }

  function normalizedEditorEntityKind(kind) {
    const value = String(kind || "").toLowerCase();
    if (value === "npc" || value === "npcs") return "npc";
    if (value === "entrance" || value === "entrances" || value === "door" || value === "doors") return "entrance";
    if (value === "event" || value === "events") return "event";
    if (value === "asset" || value === "assets" || value === "object" || value === "objects") return "asset";
    return "";
  }

  function cloneRuntimeRecord(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function runtimeEntities(kind) {
    const normalized = normalizedEditorEntityKind(kind);
    const source = normalized === "npc" ? cityNpcs
      : normalized === "entrance" ? cityEntrances
        : normalized === "event" ? cityEvents
          : normalized === "asset" ? cityWorldAssets
            : [];
    return source.map(cloneRuntimeRecord);
  }

  function runtimeAssetPrototype(sprite) {
    const catalog = window.CITY_MAP_LAYOUT?.assetCatalog || {};
    const prototype = catalog[String(sprite || "")];
    return prototype && typeof prototype === "object" ? prototype : null;
  }

  function normalizeRuntimeAsset(existing, id, value = {}) {
    const nextSprite = String(value.sprite || existing?.sprite || "");
    const prototype = runtimeAssetPrototype(nextSprite);
    const spriteChanged = Boolean(existing && nextSprite !== existing.sprite);
    if (!nextSprite || (!existing && !prototype) || (spriteChanged && !prototype)) return null;

    const previousScale = Math.max(.25, Math.min(4, Number(existing?.scale) || 1));
    const source = spriteChanged || !existing ? prototype : existing;
    const sourceScale = spriteChanged || !existing ? 1 : previousScale;
    const baseWidth = Number(source?.w) / sourceScale;
    const baseHeight = Number(source?.h) / sourceScale;
    if (!Number.isFinite(baseWidth) || baseWidth <= 0 || !Number.isFinite(baseHeight) || baseHeight <= 0) return null;
    const sourceColliders = Array.isArray(source?.colliders) ? source.colliders : (prototype?.colliders || []);
    const baseColliders = sourceColliders.map((collider) => [
      Number(collider[0]) / sourceScale,
      Number(collider[1]) / sourceScale,
      Number(collider[2]) / sourceScale,
      Number(collider[3]) / sourceScale,
    ]).filter((collider) => collider.every(Number.isFinite) && collider[2] > 0 && collider[3] > 0);

    const hasScale = value.scale !== undefined && value.scale !== null && Number.isFinite(Number(value.scale));
    const scale = hasScale ? Math.max(.25, Math.min(4, Number(value.scale))) : previousScale;
    const x = Number(value.x ?? existing?.x);
    const y = Number(value.y ?? existing?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const safeX = clamp(x, 0, WORLD_WIDTH);
    const safeY = clamp(y, 0, WORLD_HEIGHT);
    const kind = String((spriteChanged || !existing ? prototype?.kind : existing?.kind) || prototype?.kind || "prop");
    const hasExplicitDepth = value.depthY !== undefined && value.depthY !== null && Number.isFinite(Number(value.depthY));
    const explicitDepth = Number(value.depthY);
    const previousDepth = Number(existing?.depthY);
    const previousY = Number(existing?.y);
    const yWasPatched = value.y !== undefined && value.y !== null && Number.isFinite(Number(value.y));
    const depthY = hasExplicitDepth
      ? explicitDepth
      : (existing && yWasPatched && Number.isFinite(previousDepth) && Number.isFinite(previousY)
        ? previousDepth + safeY - previousY
        : (Number.isFinite(previousDepth) ? previousDepth : safeY - (kind === "building" ? 10 : 2)));
    const rotationValue = Number(value.rotation ?? existing?.rotation ?? 0);
    const rotation = Number.isFinite(rotationValue) ? Math.max(-360, Math.min(360, rotationValue)) : 0;
    const label = value.label !== undefined
      ? String(value.label || "").slice(0, 120)
      : String(existing?.label || `Objeto ${nextSprite}`).slice(0, 120);

    return {
      ...(existing || {}),
      ...cloneRuntimeRecord(value),
      id,
      sprite: nextSprite,
      src: prototype?.src || existing?.src,
      kind,
      placement: value.placement || existing?.placement || "editor",
      x: safeX,
      y: safeY,
      depthY,
      w: Math.round(baseWidth * scale * 100) / 100,
      h: Math.round(baseHeight * scale * 100) / 100,
      scale,
      rotation,
      solid: typeof value.solid === "boolean" ? value.solid : existing?.solid !== false,
      flipX: typeof value.flipX === "boolean" ? value.flipX : Boolean(existing?.flipX),
      label,
      colliders: baseColliders.map(([colliderX, colliderY, width, height]) => [
        colliderX * scale, colliderY * scale, width * scale, height * scale,
      ]),
    };
  }

  function applyRuntimeAssetSnapshot(value = {}) {
    const hasSnapshot = value.assetOverrides && typeof value.assetOverrides === "object"
      || Array.isArray(value.addedAssets)
      || Array.isArray(value.hiddenAssets);
    if (!hasSnapshot) return null;
    const overrides = value.assetOverrides && typeof value.assetOverrides === "object" ? value.assetOverrides : {};
    const hidden = new Set((Array.isArray(value.hiddenAssets) ? value.hiddenAssets : []).map(String));
    const nextAssets = new Map();

    runtimeBaseWorldAssets.forEach((baseAsset, assetId) => {
      if (hidden.has(assetId)) return;
      const record = normalizeRuntimeAsset(cloneRuntimeRecord(baseAsset), assetId, overrides[assetId] || {});
      if (record) nextAssets.set(assetId, record);
    });
    (Array.isArray(value.addedAssets) ? value.addedAssets : []).forEach((asset) => {
      const assetId = runtimeEntityId(asset?.id);
      if (!assetId || hidden.has(assetId)) return;
      const record = normalizeRuntimeAsset(null, assetId, asset);
      if (record) nextAssets.set(assetId, record);
    });

    const currentAssets = new Map(cityWorldAssets.map((asset) => [asset.id, asset]));
    const liveAssets = [...nextAssets.values()].map((record) => {
      const current = currentAssets.get(record.id);
      if (!current) return record;
      Object.assign(current, record);
      current.colliders = record.colliders.map((collider) => [...collider]);
      return current;
    });
    cityWorldAssets.splice(0, cityWorldAssets.length, ...liveAssets);
    const nextIds = new Set(nextAssets.keys());
    [...linkedAssetPositions.keys()].filter((assetId) => !nextIds.has(assetId))
      .forEach((assetId) => linkedAssetPositions.delete(assetId));
    cityWorldAssets.forEach((asset) => {
      if (!linkedAssetPositions.has(asset.id)) linkedAssetPositions.set(asset.id, { x: Number(asset.x), y: Number(asset.y) });
      ensureCityWorldAssetImage(asset);
    });
    worldAssetColliderIndex = null;
    if (selectedEditorAssetId && !nextIds.has(selectedEditorAssetId)) selectedEditorAssetId = null;
    if (selectedEditorEntity?.kind === "asset" && !nextIds.has(selectedEditorEntity.id)) selectedEditorEntity = null;
    updateWorldAssetDataset();
    return cityWorldAssets.length;
  }

  function setRuntimeEntity(kind, id, value) {
    const normalizedKind = normalizedEditorEntityKind(kind);
    const normalizedId = runtimeEntityId(id || value?.id);
    if (!normalizedKind || !normalizedId || !value || typeof value !== "object") return false;
    if (normalizedKind === "asset") {
      const index = cityWorldAssets.findIndex((asset) => asset.id === normalizedId);
      const record = normalizeRuntimeAsset(index >= 0 ? cityWorldAssets[index] : null, normalizedId, value);
      if (!record) return false;
      let liveRecord = record;
      if (index >= 0) {
        liveRecord = cityWorldAssets[index];
        Object.assign(liveRecord, record);
        liveRecord.colliders = record.colliders.map((collider) => [...collider]);
      } else {
        cityWorldAssets.push(liveRecord);
        linkedAssetPositions.set(liveRecord.id, { x: Number(liveRecord.x), y: Number(liveRecord.y) });
      }
      ensureCityWorldAssetImage(liveRecord);
      worldAssetColliderIndex = null;
      syncLinkedEntrancesFromAssets();
      updateWorldAssetDataset();
      return cloneRuntimeRecord(liveRecord);
    }
    if (normalizedKind === "npc") {
      const existing = cityNpcs.find((npc) => npc.id === normalizedId);
      const record = normalizeRuntimeNpc({ ...(existing || {}), ...value, id: normalizedId }, normalizedId);
      if (!record) return false;
      const index = cityNpcs.findIndex((npc) => npc.id === normalizedId);
      if (index >= 0) cityNpcs[index] = record;
      else cityNpcs.push(record);
      npcPatrolStates.delete(normalizedId);
      updateNpcDeploymentDataset();
      return cloneRuntimeRecord(record);
    }
    if (normalizedKind === "entrance") {
      if (value.enabled === false) {
        deleteRuntimeEntity("entrance", normalizedId);
        return { id: normalizedId, enabled: false };
      }
      const existing = cityEntrances.find((entrance) => entrance.id === normalizedId);
      const record = normalizeRuntimeEntrance({ ...(existing || {}), ...value, id: normalizedId }, normalizedId);
      if (!record) return false;
      const index = cityEntrances.findIndex((entrance) => entrance.id === normalizedId);
      if (index >= 0) cityEntrances[index] = record;
      else cityEntrances.push(record);
      [...linkedEntrancePositions.keys()].filter((key) => key.endsWith(`:${normalizedId}`))
        .forEach((key) => linkedEntrancePositions.delete(key));
      rebuildDefaultMapTiles();
      return cloneRuntimeRecord(record);
    }
    const existing = cityEvents.find((event) => event.id === normalizedId);
    const record = normalizeRuntimeEvent({ ...(existing || {}), ...value, id: normalizedId }, normalizedId);
    if (!record) return false;
    const index = cityEvents.findIndex((event) => event.id === normalizedId);
    if (index >= 0) cityEvents[index] = record;
    else cityEvents.push(record);
    rebuildDefaultMapTiles();
    return cloneRuntimeRecord(record);
  }

  function deleteRuntimeEntity(kind, id) {
    const normalizedKind = normalizedEditorEntityKind(kind);
    const normalizedId = runtimeEntityId(id);
    const collection = normalizedKind === "npc" ? cityNpcs
      : normalizedKind === "entrance" ? cityEntrances
        : normalizedKind === "event" ? cityEvents
          : normalizedKind === "asset" ? cityWorldAssets
            : null;
    if (!collection || !normalizedId) return false;
    const index = collection.findIndex((entry) => entry.id === normalizedId);
    if (index < 0) return false;
    collection.splice(index, 1);
    if (normalizedKind === "npc") {
      npcPatrolStates.delete(normalizedId);
      updateNpcDeploymentDataset();
    } else if (normalizedKind === "entrance" || normalizedKind === "event") {
      if (normalizedKind === "entrance") {
        [...linkedEntrancePositions.keys()].filter((key) => key.endsWith(`:${normalizedId}`))
          .forEach((key) => linkedEntrancePositions.delete(key));
      }
      rebuildDefaultMapTiles();
    }
    else {
      linkedAssetPositions.delete(normalizedId);
      [...linkedEntrancePositions.keys()].filter((key) => key.startsWith(`${normalizedId}:`))
        .forEach((key) => linkedEntrancePositions.delete(key));
      worldAssetColliderIndex = null;
      updateWorldAssetDataset();
    }
    if (selectedEditorEntity?.kind === normalizedKind && selectedEditorEntity.id === normalizedId) selectedEditorEntity = null;
    if (normalizedKind === "asset" && selectedEditorAssetId === normalizedId) selectedEditorAssetId = null;
    return true;
  }

  function applyRuntimeEditorData(value = {}) {
    if (!value || typeof value !== "object") return false;
    const nextNpcs = buildRuntimeNpcs(value);
    const hiddenAssetIds = new Set((Array.isArray(value.hiddenAssets) ? value.hiddenAssets : []).map(String));
    const nextEntrances = buildRuntimeEntrances(value)
      .filter((entrance) => !entrance.linkedAssetId || !hiddenAssetIds.has(entrance.linkedAssetId));
    const nextEvents = buildRuntimeEvents(value);
    cityNpcs.splice(0, cityNpcs.length, ...nextNpcs);
    cityEntrances.splice(0, cityEntrances.length, ...nextEntrances);
    cityEvents.splice(0, cityEvents.length, ...nextEvents);
    const assetCount = applyRuntimeAssetSnapshot(value);
    npcPatrolStates.clear();
    linkedEntrancePositions.clear();
    applyRuntimeTileOverrides(value.tileOverrides || {});
    rebuildDefaultMapTiles();
    syncLinkedEntrancesFromAssets({ force: true, entrancesAreBaseline: true });
    updateNpcDeploymentDataset();
    updateAreaLabel();
    updateInteractPrompt();
    return {
      npcs: cityNpcs.length,
      entrances: cityEntrances.length,
      events: cityEvents.length,
      assets: assetCount ?? cityWorldAssets.length,
      tiles: tileOverrides.size,
    };
  }

  function setRuntimeCollaborators(users) {
    const previousById = new Map(collaboratorCursors.map((collaborator) => [collaborator.id, collaborator]));
    collaboratorCursors = (Array.isArray(users) ? users : [])
      .map((user, index) => {
        const id = runtimeEntityId(user?.id, `collaborator-${index + 1}`);
        const previous = previousById.get(id);
        const cursor = user?.cursor || user || {};
        const cursorX = Number(cursor.worldX ?? cursor.x);
        const cursorY = Number(cursor.worldY ?? cursor.y);
        const hasCursor = Number.isFinite(cursorX) && Number.isFinite(cursorY);
        const playerSource = user?.player || {};
        const playerX = Number(playerSource.x);
        const playerY = Number(playerSource.y);
        const hasPlayer = Number.isFinite(playerX) && Number.isFinite(playerY);
        if (!hasCursor && !hasPlayer) return null;
        return {
          id,
          name: String(user?.name || user?.displayName || `Editor ${index + 1}`).slice(0, 40),
          color: /^#[0-9a-f]{6}$/i.test(user?.color || "") ? user.color : "#52d7ff",
          x: hasCursor ? clamp(cursorX, 0, WORLD_WIDTH) : null,
          y: hasCursor ? clamp(cursorY, 0, WORLD_HEIGHT) : null,
          player: hasPlayer ? {
            x: clamp(playerX, 0, WORLD_WIDTH),
            y: clamp(playerY, 0, WORLD_HEIGHT),
            displayX: Number(previous?.player?.displayX ?? playerX),
            displayY: Number(previous?.player?.displayY ?? playerY),
            direction: ["up", "down", "left", "right"].includes(playerSource.direction) ? playerSource.direction : "down",
            dimension: String(playerSource.dimension || "san_pablo"),
            interior: playerSource.interior || null,
            moving: Boolean(playerSource.moving),
            running: Boolean(playerSource.running),
            frame: Math.max(0, Math.min(3, Math.floor(Number(playerSource.frame) || 0))),
          } : null,
        };
      })
      .filter(Boolean);
    const remotePlayers = collaboratorCursors.filter((collaborator) => collaborator.player);
    document.documentElement.dataset.collaboratorPlayerCount = String(remotePlayers.length);
    document.documentElement.dataset.collaboratorPlayers = remotePlayers
      .map((collaborator) => `${collaborator.id}@${Math.round(collaborator.player.x)},${Math.round(collaborator.player.y)}`)
      .join(";");
    return collaboratorCursors.length;
  }

  window.__pokemonMapEditorBridge = Object.freeze({
    enable() {
      developerEditorEnabled = true;
      elements.buildingEditorButton.hidden = false;
      document.documentElement.dataset.mapEditor = "available";
    },
    disable() {
      developerEditorEnabled = false;
      elements.buildingEditorButton.hidden = true;
      selectedEditorEntity = null;
      collaboratorCursors = [];
      closeBuildingEditorPanel();
      document.documentElement.dataset.mapEditor = "disabled";
    },
    open: openBuildingEditor,
    close: closeBuildingEditorPanel,
    isOpen: () => elements.buildingEditor.classList.contains("open"),
    assets: () => cityWorldAssets,
    entities: runtimeEntities,
    playerPresence: () => ({
      x: Math.round(state.worldX * 100) / 100,
      y: Math.round(state.worldY * 100) / 100,
      direction: state.direction,
      dimension: state.dimension,
      interior: state.interior || null,
      moving: animationTime > 0,
      running: playerRunning,
      frame: animationFrame,
    }),
    assetCatalog: () => window.CITY_MAP_LAYOUT?.assetCatalog || {},
    canvasToWorld(clientX, clientY) {
      const rect = elements.canvas.getBoundingClientRect();
      return {
        x: clamp(camera.x + (clientX - rect.left) * (VIEW_WIDTH / rect.width), 0, WORLD_WIDTH),
        y: clamp(camera.y + (clientY - rect.top) * (VIEW_HEIGHT / rect.height), 0, WORLD_HEIGHT),
      };
    },
    worldToCanvas(worldX, worldY) {
      const rect = elements.canvas.getBoundingClientRect();
      const x = (Number(worldX) - camera.x) * (rect.width / VIEW_WIDTH);
      const y = (Number(worldY) - camera.y) * (rect.height / VIEW_HEIGHT);
      return {
        x,
        y,
        clientX: rect.left + x,
        clientY: rect.top + y,
        visible: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
      };
    },
    viewportCenter: () => ({
      x: clamp(camera.x + VIEW_WIDTH / 2, 0, WORLD_WIDTH),
      y: clamp(camera.y + VIEW_HEIGHT / 2, 0, WORLD_HEIGHT),
    }),
    grid: () => ({ tileSize: CITY_MAP.tileSize, cols: Math.ceil(WORLD_WIDTH / CITY_MAP.tileSize), rows: Math.ceil(WORLD_HEIGHT / CITY_MAP.tileSize) }),
    tileType: (col, row) => mapTileType(Number(col), Number(row)),
    tileOverrides: () => Object.fromEntries(tileOverrides),
    setTile(col, row, type) {
      const normalizedCol = Math.floor(Number(col)); const normalizedRow = Math.floor(Number(row));
      if (!Number.isInteger(normalizedCol) || !Number.isInteger(normalizedRow)) return false;
      if (normalizedCol < 0 || normalizedRow < 0 || normalizedCol >= Math.ceil(WORLD_WIDTH / CITY_MAP.tileSize) || normalizedRow >= Math.ceil(WORLD_HEIGHT / CITY_MAP.tileSize)) return false;
      const key = tileKey(normalizedCol, normalizedRow);
      if (type === "inherit") tileOverrides.delete(key);
      else if (["walkable", "blocked", "door", "encounter", "event"].includes(type)) tileOverrides.set(key, type);
      else return false;
      selectedMapTile = { col: normalizedCol, row: normalizedRow };
      selectedTileType = type;
      updateTileEditorInfo();
      return true;
    },
    clearTiles() {
      tileOverrides.clear();
      selectedMapTile = null;
      updateTileEditorInfo();
    },
    setEntity: setRuntimeEntity,
    deleteEntity: deleteRuntimeEntity,
    selectEntity(kind, id) {
      const normalizedKind = normalizedEditorEntityKind(kind);
      selectedEditorEntity = normalizedKind && id ? { kind: normalizedKind, id: String(id) } : null;
      if (normalizedKind === "asset") selectedEditorAssetId = id || null;
      else selectedEditorAssetId = null;
      return Boolean(selectedEditorEntity);
    },
    previewEvent(event) { return runMapEvent(event, { preview: true }); },
    applyEditorData: applyRuntimeEditorData,
    applyAssetSnapshot: applyRuntimeAssetSnapshot,
    setCollaborators: setRuntimeCollaborators,
    upsertEntity: setRuntimeEntity,
    removeEntity: deleteRuntimeEntity,
    applySnapshot: applyRuntimeEditorData,
    addAsset(asset) {
      const assetId = runtimeEntityId(asset?.id);
      const record = assetId ? normalizeRuntimeAsset(null, assetId, asset) : null;
      if (!record || cityWorldAssets.some((entry) => entry.id === assetId)) return false;
      Object.assign(asset, record);
      asset.colliders = record.colliders.map((collider) => [...collider]);
      cityWorldAssets.push(asset);
      linkedAssetPositions.set(asset.id, { x: Number(asset.x), y: Number(asset.y) });
      ensureCityWorldAssetImage(asset);
      worldAssetColliderIndex = null;
      updateWorldAssetDataset();
      return asset;
    },
    removeAsset(id) {
      return deleteRuntimeEntity("asset", id);
    },
    selectAsset(id) {
      selectedEditorAssetId = id || null;
      selectedEditorEntity = id ? { kind: "asset", id: String(id) } : null;
    },
    invalidateAssets() {
      worldAssetColliderIndex = null;
      syncLinkedEntrancesFromAssets();
      updateWorldAssetDataset();
    },
  });

  function initialize() {
    mazeDefinition = generateMaze();
    initializeMapTiles(); renderStarters(); bindEvents(); loadAssets();
    document.documentElement.dataset.doctorPotatoScene = "idle";
    document.documentElement.dataset.fragmentCinematic = "idle";
    document.documentElement.dataset.cityMapReady = "loading";
    const hasSave = loadGame(); elements.continueButton.classList.toggle("hidden", !hasSave);
    updateFullscreenButton(); renderHud(); updateAreaLabel(); updateInteractPrompt(); updateVoiceNpcUi(); window.requestAnimationFrame(gameLoop);
    if (VOICE_NPC_ENABLED) window.setTimeout(() => requestVoiceNpcAccess(), 0);
    if (VOICE_NPC_ENABLED && LOCAL_DEBUG_VOICE) {
      if (!hasSave) {
        state = defaultState();
        state.started = true; state.starterChosen = true;
        state.team = [createPokemon(PETRILLO_ID, 5)]; state.caught = [PETRILLO_ID]; state.seen = [PETRILLO_ID];
      }
      showWorld();
      window.setTimeout(() => handleVoiceNpcTranscript(LOCAL_DEBUG_VOICE, true), 120);
    } else if (LOCAL_DEBUG_FRAGMENT_CINEMATIC) {
      startFragmentCinematicDebugSession();
    } else if (LOCAL_DEBUG_PRISM) {
      startPrismDebugSession(LOCAL_DEBUG_PRISM.money, LOCAL_DEBUG_PRISM.target);
    } else if (LOCAL_DEBUG_BATTLE?.teamId && POKEMON[LOCAL_DEBUG_BATTLE.teamId]) {
      state = defaultState();
      state.started = true; state.starterChosen = true;
      state.team = [createPokemon(LOCAL_DEBUG_BATTLE.teamId, LOCAL_DEBUG_BATTLE.teamLevel)];
      evolvePokemonIfReady(state.team[0]);
      state.caught = [state.team[0].id]; state.seen = [state.team[0].id];
      showWorld();
      if (LOCAL_DEBUG_BATTLE.wildId && POKEMON[LOCAL_DEBUG_BATTLE.wildId]) window.setTimeout(beginEncounter, 120);
    }
    window.__pokemonCityDebug = Object.freeze({
      tileType: (col, row) => mapTileType(Number(col), Number(row)),
      canOccupy: (x, y) => cityMapCanOccupy(Number(x), Number(y)),
      worldAssets: () => cityWorldAssets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        x: asset.x,
        y: asset.y,
        depthY: asset.depthY ?? asset.y,
        w: asset.w,
        h: asset.h,
        door: asset.door || null,
        approach: asset.approach || null,
        ready: Boolean(cityWorldAssetImages.get(worldAssetSource(asset))?.ready),
        colliders: worldAssetColliderRects(asset),
      })),
      moveTo: (x, y) => {
        const nextX = Number(x); const nextY = Number(y);
        if (!cityMapCanOccupy(nextX, nextY)) return false;
        state.worldX = nextX; state.worldY = nextY;
        camera.x = clamp(nextX - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH);
        camera.y = clamp(nextY - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT);
        return true;
      },
      pos: () => ({ x: state.worldX, y: state.worldY, dir: state.direction, interior: state.interior, interiorData: state.interiorData, poi: nearestPointOfInterest() }),
      captureArea: () => currentGreenArea(),
      grassState: () => ({
        ready: encounterGrassSheetReady,
        active: currentEncounterZone(),
        lastStepAgeMs: lastGrassStepAt ? Math.max(0, performance.now() - lastGrassStepAt) : null,
        lastStep: lastGrassStepAt ? { x: lastGrassStepX, y: lastGrassStepY } : null,
        visibleTiles: Number(document.documentElement.dataset.encounterGrassVisible || 0),
      }),
      encounter: () => beginEncounter(),
      gameState: () => ({
        dimension: state.dimension,
        money: state.money,
        inventory: { ...state.inventory },
        fragmentCinematicSeen: Boolean(state.fragmentCinematicSeen),
        blackMarket: { ...state.blackMarket, purchases: { ...state.blackMarket.purchases } },
        maze: state.maze ? { ...state.maze } : null,
        shop: activeShopType,
      }),
      monsterRoster: () => ({
        ids: Object.keys(POKEMON).map(Number),
        starters: STARTERS.map((monster) => monster.id),
        cityWild: WILD_TABLE.map((entry) => entry.id),
        routeWild: ROUTE_WILD_TABLE.map((entry) => entry.id),
        prismWild: PRISM_WILD_TABLE.map((entry) => entry.id),
        prismSecrets: [...SECRET_MONSTER_IDS],
      }),
      fragmentCinematic: () => ({
        active: fragmentCinematicActive,
        seen: Boolean(state.fragmentCinematicSeen),
        shards: state.inventory.prismShards,
        playback: document.documentElement.dataset.fragmentCinematic,
        currentTime: elements.fragmentCinematicVideo.currentTime,
        duration: elements.fragmentCinematicVideo.duration,
      }),
      startFragmentCinematicDebug: () => {
        return startFragmentCinematicDebugSession();
      },
      doctorPotato: () => ({
        pending: Boolean(state.doctorPotatoIntroPending),
        seen: Boolean(state.doctorPotatoIntroSeen),
        spriteReady: Boolean(npcRosterSheets.get("doctor-potato")?.ready),
        portraitReady: document.documentElement.dataset.dialogPortraitReady || null,
        scene: doctorPotatoScene ? {
          phase: doctorPotatoScene.phase,
          x: doctorPotatoScene.x,
          y: doctorPotatoScene.y,
          direction: doctorPotatoScene.direction,
        } : null,
      }),
      voiceManolin: () => ({
        permission: voiceNpc.permission,
        listening: voiceNpc.listening,
        active: voiceNpc.active,
        silenceMs: VOICE_NPC_SILENCE_MS,
        lastSpeechAgeMs: voiceNpc.lastSpeechAt ? Math.max(0, performance.now() - voiceNpc.lastSpeechAt) : null,
        position: { x: voiceNpc.x, y: voiceNpc.y, direction: voiceNpc.direction, moving: voiceNpc.moving },
        transcript: voiceNpc.transcript,
        reply: voiceNpc.reply,
        apiState: voiceNpc.apiState,
        model: voiceNpc.model,
        wakeCount: voiceNpc.wakeCount,
      }),
      simulateVoiceManolin: (text, isFinal = true) => handleVoiceNpcTranscript(String(text), Boolean(isFinal)),
      voiceManolinTrigger: (text) => voiceNpcTriggerDetected(String(text)),
      prismLayout: () => {
        const { start, goal, monster, market } = mazeDefinition;
        const marketPath = findMazePath(start.x + .5, start.y + .5, market.x + .5, market.y + .5);
        const goalPath = findMazePath(start.x + .5, start.y + .5, goal.x + .5, goal.y + .5);
        return {
          start: { ...start }, goal: { ...goal }, monster: { ...monster }, market: { ...market },
          marketReachable: marketPath.length > 0,
          marketDistance: Math.max(0, marketPath.length - 1),
          goalDistance: Math.max(0, goalPath.length - 1),
        };
      },
      startPrismDebug: (money = 2500) => {
        return startPrismDebugSession(money);
      },
      movePrismDebug: (target = "market") => {
        if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname) || state.dimension !== "prism") return false;
        const point = mazeDefinition[target];
        if (!point || mazeDefinition.grid[point.y]?.[point.x] !== 0) return false;
        const maze = ensureMazeState();
        maze.playerX = point.x + .5; maze.playerY = point.y + .5;
        maze.angle = firstOpenDirection(mazeDefinition.grid, point);
        updateMazeHud(0); updateInteractPrompt();
        return true;
      },
      setMoneyDebug: (money) => {
        if (!new Set(["localhost", "127.0.0.1"]).has(window.location.hostname)) return false;
        state.money = Math.max(0, Math.floor(Number(money) || 0)); renderHud(); saveGame(); return true;
      },
      mapStreaming: () => ({
        current: mapTileAtWorld(state.worldX, state.worldY)?.id || null,
        visible: [...cityMapVisibleTileIds],
        cached: [...cityMapTileCache.values()].map((record) => ({ id: record.tile.id, ready: record.ready, bytes: record.bytes })),
        bytes: [...cityMapTileCache.values()].reduce((total, record) => total + (record.bytes || 0), 0),
        budgetBytes: MAP_MEMORY_BUDGET_BYTES,
        preview: cityMapPreviewReady,
      }),
      grid: { cols: Math.ceil(WORLD_WIDTH / CITY_MAP.tileSize), rows: Math.ceil(WORLD_HEIGHT / CITY_MAP.tileSize), tileSize: CITY_MAP.tileSize },
    });
    document.documentElement.dataset.cityGrid = `${Math.ceil(WORLD_WIDTH / CITY_MAP.tileSize)}x${Math.ceil(WORLD_HEIGHT / CITY_MAP.tileSize)}@${CITY_MAP.tileSize}`;
    document.documentElement.dataset.encounterAreaCount = String((CITY_MAP.encounterAreas || []).length);
    document.documentElement.dataset.encounterTileCount = String((CITY_MAP.encounterTiles || []).length);
    document.documentElement.dataset.spawnOpen = String(cityMapCanOccupy(NORMAL_START.x, NORMAL_START.y));
    document.documentElement.dataset.boundaryOpen = String(cityMapCanOccupy(16, 16));
    document.documentElement.dataset.backgroundCollisionProbesSolid = String((CITY_MAP.blockedProbes || [])
      .every(([x, y]) => !cityMapCanOccupy(Number(x), Number(y))));
    const firstDoor = cityEntrances[0];
    document.documentElement.dataset.centerDoor = firstDoor ? mapTileType(firstDoor.col, firstDoor.row) : "missing";
    const prismDoor = cityEntrances.find((door) => door.action === "prism");
    document.documentElement.dataset.prismDoor = prismDoor ? mapTileType(prismDoor.col, prismDoor.row) : "missing";
    const prismMarketPath = findMazePath(
      mazeDefinition.start.x + .5, mazeDefinition.start.y + .5,
      mazeDefinition.market.x + .5, mazeDefinition.market.y + .5,
    );
    document.documentElement.dataset.prismMarketReachable = String(prismMarketPath.length > 0);
    document.documentElement.dataset.prismMarketDistinct = String(
      ![mazeDefinition.start, mazeDefinition.goal, mazeDefinition.monster]
        .some((point) => point.x === mazeDefinition.market.x && point.y === mazeDefinition.market.y),
    );
    const configuredAssetColliders = cityWorldAssets.flatMap((asset) => worldAssetColliderRects(asset));
    document.documentElement.dataset.worldAssetCollidersSolid = String(configuredAssetColliders.every((rect) => (
      worldAssetBlocksPosition(rect.x + rect.w / 2, rect.y + rect.h / 2, 0)
    )));
    document.documentElement.dataset.worldAssetDoorsSolid = String(cityWorldAssets
      .filter((asset) => Array.isArray(asset.door))
      .every((asset) => {
        const [col, row] = asset.door;
        return !cityMapCanOccupy((col + .5) * CITY_MAP.tileSize, (row + .5) * CITY_MAP.tileSize);
      }));
    document.documentElement.dataset.worldAssetApproachesOpen = String(cityWorldAssets
      .filter((asset) => Array.isArray(asset.approach))
      .every((asset) => cityMapCanOccupy(Number(asset.approach[0]), Number(asset.approach[1]))));
    const configuredNpcs = cityNpcs;
    document.documentElement.dataset.mapNpcCount = String(configuredNpcs.length);
    document.documentElement.dataset.mapNpcIdsUnique = String(new Set(configuredNpcs.map((npc) => npc.id)).size === configuredNpcs.length);
    document.documentElement.dataset.mapNpcPositionsOpen = String(configuredNpcs.every((npc) => {
      const position = mapNpcPosition(npc);
      return cityMapCanOccupy(position.x, position.y);
    }));
    document.documentElement.dataset.mapNpcDialogReady = String(configuredNpcs.every((npc) => (
      typeof npc.name === "string" && npc.name.length > 0 && Array.isArray(npc.lines) && npc.lines.length >= 2
    )));
    updateNpcDeploymentDataset();
    if (configuredNpcs[0]) {
      const npc = configuredNpcs[0];
      const position = mapNpcPosition(npc);
      document.documentElement.dataset.guideNpc = `${npc.id}@C${npc.col},F${npc.row}`;
      document.documentElement.dataset.guideNpcTile = mapTileType(npc.col, npc.row);
      document.documentElement.dataset.guideNpcBlocks = String(worldNpcBlocksPosition(position.x, position.y));
    }
  }

  initialize();
})();
