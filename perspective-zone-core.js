(function installPerspectiveZoneCore(root) {
  "use strict";

  if (root.PERSPECTIVE_ZONE_CORE?.VERSION === 2.1) return;

  const VERSION = 2.1;
  const SNAPSHOT_VERSION = 2;
  const FIXED_STEP = 1 / 120;
  const MAX_FRAME_DELTA = 0.05;
  const MAX_SUBSTEPS = 8;
  const PROFILE_MODE = "perfil";
  const DIORAMA_MODE = "diorama";
  const PLAYER_WIDTH = 28;
  const PLAYER_HEIGHT = 48;
  const MAX_PARTICLES = 96;
  const PARTICLE_LIMITS = Object.freeze({ dust: 28, leaves: 24, sparks: 24, confetti: 32, ring: 12 });
  const FLIP_COMBO_WINDOW = 8;
  const FLIP_ANTICIPATION_END = 0.2;
  const PAPER_RUSH_THRESHOLD = 85;
  const PAPER_RUSH_REARM = 55;
  const PAPER_RUSH_DURATION = 4.8;
  const STYLE_WINDOW = 2.4;

  const PERSPECTIVE_FEATURES = Object.freeze([
    "flip-four-phases", "flip-anticipation", "flip-fold", "flip-crossing", "flip-settle",
    "flip-cascade", "flip-safe-projection", "flip-input-lock", "flip-reduced-motion", "flip-persistent-nodes",
    "world-paper-layers", "world-paper-buildings", "world-depth-parallax", "world-fold-pivots", "world-contact-shadows",
    "world-reactive-grass", "world-particles-leaves", "world-particles-dust", "world-silhouette-echo", "world-camera-culling",
    "wildlife-grounded", "wildlife-side-facing", "wildlife-ground-y-config", "wildlife-grounding-config", "wildlife-lane-projection",
    "wildlife-stable-seed", "wildlife-bounded-roam", "wildlife-player-reaction", "wildlife-distance-lod", "wildlife-nonblocking",
    "player-coyote-time", "player-jump-buffer", "player-variable-jump", "player-fixed-step-input", "player-fall-speed-cap",
    "player-moving-platform-carry", "player-fast-respawn", "player-checkpoints", "player-flip-preview", "player-accessibility-assist",
    "mission-chain-five-steps", "mission-chain-progress", "mission-three-challenges", "mission-optional-objectives", "mission-reward-celebration",
    "persistence-versioned", "persistence-checkpoint", "performance-spatial-culling", "performance-pooled-particles", "performance-frame-budget",
  ]);
  const FEATURE_GROUPS = Object.freeze({
    giro: Object.freeze(PERSPECTIVE_FEATURES.slice(0, 10)),
    mundo: Object.freeze(PERSPECTIVE_FEATURES.slice(10, 20)),
    fauna: Object.freeze(PERSPECTIVE_FEATURES.slice(20, 30)),
    personaje: Object.freeze(PERSPECTIVE_FEATURES.slice(30, 40)),
    "misiones-rendimiento": Object.freeze(PERSPECTIVE_FEATURES.slice(40, 50)),
  });
  const FLIP_STAGES = Object.freeze(["anticipation", "fold", "cross", "settle"]);
  const MISSION_STEPS = Object.freeze([
    { id: "seguir-al-guia", title: "El guía de la pradera", objective: "Acércate a la primera criatura.", target: 1 },
    { id: "dominar-el-pliegue", title: "Dos caras del camino", objective: "Completa tu primer cambio de perspectiva.", target: 1 },
    { id: "reunir-los-sellos", title: "Sellos bifaces", objective: "Reúne los tres sellos del recorrido.", target: 3 },
    { id: "alcanzar-los-tejados", title: "Ruta de tejados", objective: "Alcanza el checkpoint de los tejados.", target: 1 },
    { id: "abrir-la-puerta", title: "La Puerta del Pliegue", objective: "Cruza la puerta con los tres sellos.", target: 1 },
  ].map((record) => Object.freeze(record)));
  const OPTIONAL_CHALLENGES = Object.freeze([
    { id: "naturalista", title: "Naturalista", objective: "Descubre las seis criaturas.", target: 6 },
    { id: "acrobata", title: "Acróbata", objective: "Aterriza con precisión en tres plataformas distintas.", target: 3 },
    { id: "origamista", title: "Origamista", objective: "Encadena pliegues en tres bisagras distintas.", target: 3 },
    { id: "virtuoso", title: "Virtuoso", objective: "Activa Paper Rush una vez.", target: 1 },
  ].map((record) => Object.freeze(record)));

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const easeInOutCubic = (value) => {
    const amount = clamp(value, 0, 1);
    return amount < 0.5 ? 4 * amount * amount * amount : 1 - Math.pow(-2 * amount + 2, 3) / 2;
  };
  const approach = (current, target, sharpness, deltaSeconds) => (
    lerp(current, target, 1 - Math.exp(-sharpness * deltaSeconds))
  );
  const rangesOverlap = (a0, a1, b0, b1) => a1 > b0 && a0 < b1;
  const freezeRecords = (records) => Object.freeze(records.map((record) => Object.freeze({ ...record })));

  const DEFAULT_LEVEL = Object.freeze({
    id: "pradera-bifaz",
    name: "Pradera Bifaz",
    width: 5400,
    height: 624,
    floorY: 510,
    introFlipX: 735,
    spawn: Object.freeze({ x: 150, y: 462, depth: 18 }),
    missions: MISSION_STEPS,
    missionSteps: MISSION_STEPS,
    challenges: OPTIONAL_CHALLENGES,
    physics: Object.freeze({
      walkSpeed: 205,
      runSpeed: 285,
      acceleration: 19,
      braking: 25,
      gravity: 1900,
      terminalVelocity: 1120,
      jumpVelocity: 700,
      coyoteTime: 0.12,
      jumpBufferTime: 0.14,
      shortHopGravity: 1750,
      maximumDepth: 92,
      depthSpeed: 185,
    }),
    platforms: freezeRecords([
      { id: "meadow-start", x: 0, y: 510, w: 1010, h: 114, kind: "ground", grass: true, modes: "both" },
      { id: "spring-ditch-west", x: 1084, y: 500, w: 42, h: 20, kind: "spring", modes: "both", springVelocity: 770 },
      { id: "awning-one", x: 940, y: 444, w: 142, h: 24, kind: "awning", grass: true, modes: "perfil" },
      { id: "brick-one", x: 1128, y: 389, w: 166, h: 28, kind: "brick", grass: true, modes: "both" },
      { id: "awning-two", x: 1348, y: 430, w: 172, h: 24, kind: "awning", grass: true, modes: "perfil" },
      { id: "spring-ditch-mid", x: 1522, y: 500, w: 46, h: 20, kind: "spring", modes: "both", springVelocity: 745 },
      { id: "roof-low", x: 1570, y: 472, w: 196, h: 38, kind: "roof", grass: true, modes: "both" },
      { id: "fold-courtyard", x: 1740, y: 510, w: 1125, h: 114, kind: "ground", grass: true, modes: "both" },
      { id: "wall-secret-step", x: 2490, y: 420, w: 148, h: 24, kind: "secret", grass: true, modes: "diorama", depthMin: -92, depthMax: -38 },
      { id: "post-wall", x: 2865, y: 510, w: 300, h: 114, kind: "ground", grass: true, modes: "both" },
      { id: "moving-balcony", x: 3180, y: 436, w: 154, h: 26, kind: "moving", grass: true, modes: "both", motionAxis: "x", motionRange: 118, motionPeriod: 2.9, motionPhase: 0.15, precision: true },
      { id: "balcony-two", x: 3455, y: 385, w: 165, h: 26, kind: "balcony", grass: true, modes: "both" },
      { id: "spring-canal-east", x: 3626, y: 500, w: 62, h: 20, kind: "spring", modes: "both", springVelocity: 785, precision: true },
      { id: "balcony-three", x: 3692, y: 455, w: 170, h: 30, kind: "balcony", grass: true, modes: "both" },
      { id: "roof-west", x: 3895, y: 420, w: 276, h: 38, kind: "roof", grass: true, modes: "both" },
      { id: "hinge-step-west", x: 4178, y: 392, w: 150, h: 20, kind: "balcony", grass: true, modes: "both" },
      { id: "roof-center", x: 4245, y: 344, w: 238, h: 34, kind: "roof", grass: true, modes: "perfil", precision: true },
      { id: "hinge-step-east", x: 4412, y: 392, w: 132, h: 20, kind: "balcony", grass: true, modes: "both" },
      { id: "roof-east", x: 4550, y: 416, w: 218, h: 36, kind: "roof", grass: true, modes: "both" },
      { id: "finish-meadow", x: 4745, y: 510, w: 655, h: 114, kind: "ground", grass: true, modes: "both" },
    ]),
    barriers: freezeRecords([
      { id: "folded-facade", x: 2418, y: 245, w: 72, h: 265, profileSolid: true, dioramaSolid: true, openDepthMax: -44 },
      { id: "goal-gate", x: 5190, y: 330, w: 36, h: 180, profileSolid: true, dioramaSolid: true, goalGate: true },
    ]),
    hazards: freezeRecords([
      { id: "ditch-one", x: 1008, y: 530, w: 704, h: 94, kind: "bramble" },
      { id: "ditch-two", x: 3158, y: 530, w: 720, h: 94, kind: "bramble" },
    ]),
    foldAnchors: freezeRecords([
      { id: "anchor-west", x: 2040, radius: 315, label: "Bisagra del patio" },
      { id: "anchor-east", x: 2750, radius: 300, label: "Bisagra de la fachada" },
      { id: "anchor-roofs-west", x: 4025, radius: 120, label: "Bisagra del tejado oeste" },
      { id: "anchor-roofs", x: 4450, radius: 120, label: "Bisagra de los tejados" },
      { id: "anchor-roofs-east", x: 4700, radius: 120, label: "Bisagra del tejado este" },
    ]),
    collectibles: freezeRecords([
      { id: "seal-canopy", x: 1210, y: 326, depth: 0, label: "Sello del Toldo" },
      { id: "seal-depth", x: 2625, y: 363, depth: -72, label: "Sello de la Profundidad", mode: "diorama" },
      { id: "seal-rooftop", x: 4364, y: 282, depth: 0, label: "Sello del Tejado" },
    ]),
    checkpoints: freezeRecords([
      { id: "start", x: 150, y: 462, depth: 18 },
      { id: "courtyard", x: 1855, y: 462, depth: 0 },
      { id: "post-wall", x: 2980, y: 462, depth: 0 },
      { id: "rooftops", x: 3940, y: 372, depth: 0 },
    ]),
    goal: Object.freeze({ id: "fold-gate", x: 5170, y: 430, requiredCollectibles: 3 }),
    buildings: freezeRecords([
      { id: "house-mint", x: 120, y: 292, w: 300, h: 218, depth: 82, roof: 34, color: "#6fae91", side: "#3f796a", accent: "#f2cc67", windows: 4 },
      { id: "house-coral", x: 480, y: 322, w: 250, h: 188, depth: -58, roof: 28, color: "#cf765f", side: "#8e493e", accent: "#f6df9b", windows: 3 },
      { id: "granary", x: 905, y: 270, w: 360, h: 240, depth: 92, roof: 46, color: "#d2964f", side: "#89572e", accent: "#f4de98", windows: 4 },
      { id: "book-house", x: 1390, y: 305, w: 310, h: 205, depth: -76, roof: 34, color: "#6d8cb4", side: "#415b7d", accent: "#ffcf73", windows: 4 },
      { id: "folded-facade-building", x: 2220, y: 230, w: 470, h: 280, depth: 116, roof: 48, color: "#9b6ab0", side: "#624277", accent: "#f1d66f", windows: 6 },
      { id: "orange-workshop", x: 2800, y: 300, w: 335, h: 210, depth: -88, roof: 32, color: "#cf8052", side: "#884d34", accent: "#bde0a7", windows: 4 },
      { id: "clock-house", x: 3475, y: 244, w: 380, h: 266, depth: 104, roof: 48, color: "#648ca0", side: "#3c5d6a", accent: "#f0cf64", windows: 5 },
      { id: "roof-villas", x: 4000, y: 275, w: 430, h: 235, depth: -94, roof: 42, color: "#bc6d73", side: "#75444c", accent: "#f7df91", windows: 6 },
      { id: "gate-house", x: 4770, y: 262, w: 420, h: 248, depth: 68, roof: 40, color: "#768c64", side: "#475b3a", accent: "#f2cf6d", windows: 5 },
    ]),
    wildlife: freezeRecords([
      { id: "azahin-guide", species: "Azahín", sprite: "assets/pokemon/azahin-line/azahin-front.png", x: 330, y: 454, minX: 245, maxX: 700, speed: 36, depth: -18, behavior: "graze", scale: 0.9 },
      { id: "serranin-hopper", species: "Serranín", sprite: "assets/pokemon/serranin-line/serranin-front.png", x: 1870, y: 454, minX: 1800, maxX: 2180, speed: 28, depth: 34, behavior: "hop", scale: 0.86 },
      { id: "rubrisma-fold", species: "Rubrisma", sprite: "assets/pokemon/rubrisma-line/rubrisma-front.png", x: 2670, y: 390, minX: 2550, maxX: 2810, speed: 22, depth: -68, behavior: "shy", scale: 0.82 },
      { id: "barbito-canal", species: "Barbito", sprite: "assets/pokemon/barbito-line/barbito-front.png", x: 3005, y: 463, minX: 2910, maxX: 3110, speed: 18, depth: 12, behavior: "graze", scale: 0.8 },
      { id: "rebehielo-roof", species: "Rebehielo", sprite: "assets/pokemon/rebehielo-line/rebehielo-front.png", x: 4100, y: 365, minX: 3970, maxX: 4140, speed: 24, depth: 24, behavior: "hop", scale: 0.84, grounding: { mode: "platform", platformId: "roof-west" } },
      { id: "azuranima-gate", species: "Azuránima", sprite: "assets/pokemon/rubrisma-line/azuranima-front.png", x: 4940, y: 452, minX: 4820, maxX: 5120, speed: 20, depth: -26, behavior: "sing", scale: 0.82 },
    ]),
  });

  function platformPosition(platform, timeSeconds = 0) {
    let x = platform.x;
    let y = platform.y;
    if (platform.motionAxis && platform.motionRange && platform.motionPeriod) {
      const phase = ((timeSeconds / platform.motionPeriod) + Number(platform.motionPhase || 0)) * Math.PI * 2;
      const offset = Math.sin(phase) * platform.motionRange;
      if (platform.motionAxis === "y") y += offset;
      else x += offset;
    }
    return { x, y };
  }

  function platformIsActive(platform, state) {
    if (platform.modes === "perfil" && state.mode !== PROFILE_MODE) return false;
    if (platform.modes === "diorama" && state.mode !== DIORAMA_MODE) return false;
    if (state.mode === DIORAMA_MODE) {
      if (Number.isFinite(platform.depthMin) && state.depth < platform.depthMin) return false;
      if (Number.isFinite(platform.depthMax) && state.depth > platform.depthMax) return false;
    }
    return true;
  }

  function platformVisualState(platform, state) {
    const inactiveVisibility = 0.18;
    if (!state.flip) {
      const active = platformIsActive(platform, state);
      return { active, visibility: active ? 1 : inactiveVisibility, scaleY: active ? 1 : 0.88 };
    }
    const fromActive = platformIsActive(platform, { mode: state.flip.from, depth: state.depth });
    const toActive = platformIsActive(platform, { mode: state.flip.to, depth: state.depth });
    const amount = easeInOutCubic(Number(state.flip.geometryProgress || 0));
    return {
      active: platformIsActive(platform, state),
      visibility: lerp(fromActive ? 1 : inactiveVisibility, toActive ? 1 : inactiveVisibility, amount),
      scaleY: state.reducedMotion ? 1 : lerp(fromActive ? 1 : 0.88, toActive ? 1 : 0.88, amount),
    };
  }

  function flipStage(value) {
    if (value == null) return null;
    const progress = typeof value === "number"
      ? clamp(value, 0, 1)
      : clamp(Number(value.progress ?? (Number(value.duration) > 0 ? Number(value.elapsed) / Number(value.duration) : 0)) || 0, 0, 1);
    if (progress < 0.2) return "anticipation";
    if (progress < 0.48) return "fold";
    if (progress < 0.62) return "cross";
    return "settle";
  }

  function flipGeometryProgress(value) {
    const progress = clamp(Number(value) || 0, 0, 1);
    return clamp((progress - FLIP_ANTICIPATION_END) / (1 - FLIP_ANTICIPATION_END), 0, 1);
  }

  function normalizedWildlifeGrounding(animal) {
    const configured = animal?.grounding;
    if (typeof configured === "number" && Number.isFinite(configured)) return { mode: "fixed", groundY: configured, offsetY: 0 };
    if (configured && typeof configured === "object") {
      const mode = String(configured.mode || configured.type || (configured.platformId ? "platform" : "fixed")).toLowerCase();
      return { ...configured, mode: mode === "fixed" ? "fixed" : "platform" };
    }
    if (typeof configured === "string" && configured.trim()) {
      return { mode: configured.trim().toLowerCase() === "fixed" ? "fixed" : "platform" };
    }
    if (Number.isFinite(Number(animal?.groundY))) return { mode: "fixed", groundY: Number(animal.groundY), offsetY: 0 };
    return { mode: "platform" };
  }

  function resolveWildlifeGround(animal, state = {}, level = DEFAULT_LEVEL, timeSeconds = 0) {
    const x = Number(animal?.x);
    const grounding = normalizedWildlifeGrounding(animal);
    const offsetY = Number.isFinite(Number(grounding.offsetY)) ? Number(grounding.offsetY) : 0;
    if (grounding.mode === "fixed") {
      const fixedY = [grounding.groundY, grounding.y, animal?.spawnY, animal?.y]
        .map(Number)
        .find(Number.isFinite);
      return {
        groundY: Number.isFinite(fixedY) ? fixedY + offsetY : Number(level.floorY ?? level.height ?? 0) + offsetY,
        platformId: null,
        mode: "fixed",
      };
    }
    const probe = {
      mode: state?.mode === DIORAMA_MODE ? DIORAMA_MODE : PROFILE_MODE,
      depth: Number.isFinite(Number(animal?.depth)) ? Number(animal.depth) : Number(state?.depth) || 0,
    };
    const activePlatforms = (level.platforms || [])
      .filter((platform) => platformIsActive(platform, probe))
      .map((platform) => ({ platform, position: platformPosition(platform, timeSeconds) }));
    const pinnedPlatformId = grounding.platformId || animal?.platformId;
    const pinned = pinnedPlatformId
      ? activePlatforms.find(({ platform }) => platform.id === pinnedPlatformId)
      : null;
    if (pinned) {
      return { groundY: pinned.position.y + offsetY, platformId: pinned.platform.id, mode: "platform" };
    }
    const candidates = activePlatforms
      .filter(({ platform, position }) => Number.isFinite(x) && x >= position.x && x <= position.x + Number(platform.w || 0))
      .sort((first, second) => first.position.y - second.position.y);
    const support = candidates[0];
    return {
      groundY: Number(support?.position.y ?? animal?.groundY ?? level.floorY ?? level.height ?? 0) + offsetY,
      platformId: support?.platform.id || pinnedPlatformId || null,
      mode: "platform",
    };
  }

  function resolveWildlifeGroundY(animal, state = {}, level = DEFAULT_LEVEL, timeSeconds = 0) {
    return resolveWildlifeGround(animal, state, level, timeSeconds).groundY;
  }

  function checkpointById(level, id) {
    return level.checkpoints.find((checkpoint) => checkpoint.id === id) || level.checkpoints[0] || {
      id: "start", x: level.spawn.x, y: level.spawn.y, depth: level.spawn.depth || 0,
    };
  }

  function createWildlife(level, mode = DIORAMA_MODE, depth = 0) {
    return level.wildlife.map((source, index) => {
      const animal = {
        ...source,
        x: Number(source.x),
        spawnY: Number(source.y),
        behavior: source.behavior === "float" ? "sing" : source.behavior,
        direction: index % 2 ? -1 : 1,
        animation: index * 0.37,
        renderAnimation: index * 0.37,
        lod: "near",
        lodStride: 1,
        lodAccumulator: 0,
        startled: 0,
        reaction: "calm",
        reactionIcon: null,
        discoveryTimer: 0,
        recoil: 0,
        grazeTilt: 0,
        hopAnticipation: 0,
        pauseTimer: 0,
        patrolClock: 0,
        nextPause: 1.35 + (index % 4) * 0.41,
        stableSeed: (index + 1) * 0.61803398875,
        grounded: true,
        groundY: 0,
        shadowY: 0,
        bodyY: 0,
        bodyOffsetY: 0,
        platformId: source.grounding?.platformId || null,
        profileScaleX: mode === PROFILE_MODE ? 0.72 : 1,
        edgeScale: mode === PROFILE_MODE ? 0.72 : 1,
        singing: false,
        song: 0,
        songFrame: 0,
        grounding: normalizedWildlifeGrounding(source),
      };
      const support = resolveWildlifeGround(animal, { mode, depth }, level, 0);
      animal.platformId = support.platformId;
      animal.groundY = support.groundY;
      animal.shadowY = support.groundY;
      animal.bodyY = support.groundY;
      animal.y = support.groundY;
      return animal;
    });
  }

  function createState(level = DEFAULT_LEVEL, progress = {}) {
    const checkpoint = checkpointById(level, progress.checkpointId);
    const introSeen = Boolean(progress.introSeen || checkpoint.id !== "start");
    const collectibleIds = new Set((level.collectibles || []).map(({ id }) => id));
    const wildlifeIds = new Set((level.wildlife || []).map(({ id }) => id));
    const challengeIds = new Set(OPTIONAL_CHALLENGES.map(({ id }) => id));
    const missionIds = new Set(MISSION_STEPS.map(({ id }) => id));
    const collected = new Set((Array.isArray(progress.collected) ? progress.collected : [])
      .filter((id) => collectibleIds.has(id)));
    const bestTime = progress.bestTime != null && Number.isFinite(Number(progress.bestTime))
      ? Math.max(0, Number(progress.bestTime))
      : null;
    const completed = Boolean(progress.complete);
    const restoredPulses = Number(progress.pulses);
    const initialMode = introSeen ? PROFILE_MODE : DIORAMA_MODE;
    const initialDepth = clamp(Number(checkpoint.depth) || 0, -level.physics.maximumDepth, level.physics.maximumDepth);
    const restoredDiscoveries = Array.isArray(progress.wildlifeDiscovered)
      ? progress.wildlifeDiscovered
      : Array.isArray(progress.discoveries) ? progress.discoveries : [];
    const wildlifeDiscovered = new Set(restoredDiscoveries.filter((id) => wildlifeIds.has(id)));
    const completedChallenges = new Set((Array.isArray(progress.completedChallenges) ? progress.completedChallenges : [])
      .filter((id) => challengeIds.has(id)));
    const restoredChallenges = progress.challenges && typeof progress.challenges === "object" ? progress.challenges : {};
    const precisionPlatformIds = (level.platforms || []).filter(({ precision }) => precision).map(({ id }) => id);
    const restoredPrecisionIds = Array.isArray(progress.precisionLandingIds)
      ? progress.precisionLandingIds.filter((id) => precisionPlatformIds.includes(id))
      : precisionPlatformIds.slice(0, Math.max(0, Math.floor(Number(progress.perfectLandings ?? restoredChallenges.acrobata?.progress) || 0)));
    const precisionLandingIds = new Set(restoredPrecisionIds);
    const restoredFlipAnchorIds = Array.isArray(progress.flipComboAnchorIds)
      ? progress.flipComboAnchorIds.filter((id) => (level.foldAnchors || []).some((anchor) => anchor.id === id))
      : (level.foldAnchors || []).slice(0, Math.max(0, Math.floor(Number(progress.flipCombo) || 0))).map(({ id }) => id);
    const flipComboAnchorIds = new Set(restoredFlipAnchorIds);
    OPTIONAL_CHALLENGES.forEach(({ id }) => {
      if (restoredChallenges[id]?.complete) completedChallenges.add(id);
    });
    const restoredMission = progress.mission && typeof progress.mission === "object" ? progress.mission : {};
    const missionCompleted = new Set((Array.isArray(restoredMission.completed) ? restoredMission.completed : [])
      .filter((id) => missionIds.has(id)));
    if (!missionCompleted.size && Number.isFinite(Number(progress.missionStage))) {
      const restoredStage = clamp(Math.floor(Number(progress.missionStage)), 1, MISSION_STEPS.length);
      const completedCount = progress.missionComplete || restoredMission.complete ? MISSION_STEPS.length : restoredStage - 1;
      MISSION_STEPS.slice(0, completedCount).forEach(({ id }) => missionCompleted.add(id));
    }
    if (restoredMission.complete) MISSION_STEPS.forEach(({ id }) => missionCompleted.add(id));
    if (Number(progress.version || 1) < SNAPSHOT_VERSION) {
      if (introSeen) {
        missionCompleted.add(MISSION_STEPS[0].id);
        missionCompleted.add(MISSION_STEPS[1].id);
      }
      if (collected.size >= 3) missionCompleted.add(MISSION_STEPS[2].id);
      if (checkpoint.id === "rooftops") missionCompleted.add(MISSION_STEPS[3].id);
    }
    if (completed) MISSION_STEPS.forEach(({ id }) => missionCompleted.add(id));
    const nextMissionIndex = MISSION_STEPS.findIndex(({ id }) => !missionCompleted.has(id));
    const state = {
      version: VERSION,
      phase: completed ? "complete" : (introSeen ? "run" : "intro"),
      mode: initialMode,
      blend: introSeen ? 1 : 0,
      flip: null,
      accumulator: 0,
      pendingInputEdges: {
        jumpPressed: false,
        flipPressed: false,
        restartPressed: false,
      },
      time: 0,
      runTime: 0,
      animationTime: 0,
      depth: initialDepth,
      depthVelocity: 0,
      pulses: Number.isFinite(restoredPulses) ? clamp(Math.floor(restoredPulses), 0, 3) : 3,
      collected,
      checkpointId: checkpoint.id,
      checkpointChanged: false,
      complete: completed,
      completionNotified: false,
      bestTime,
      deaths: Math.max(0, Math.floor(Number(progress.deaths) || 0)),
      respawnTimer: 0,
      goalLocked: false,
      introSeen,
      tutorial: introSeen ? "Salta con Espacio y pliega con Q junto a una bisagra." : "Sigue al Azahín por el diorama.",
      player: {
        x: Number(checkpoint.x),
        y: Number(checkpoint.y),
        previousY: Number(checkpoint.y),
        vx: 0,
        vy: 0,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
        grounded: true,
        platformId: null,
        facing: 1,
        coyote: level.physics.coyoteTime,
        jumpBuffer: 0,
        squashX: 1,
        squashY: 1,
      },
      wildlife: createWildlife(level, initialMode, initialDepth),
      wildlifeDiscovered,
      wildlifeAccumulator: 0,
      mission: {
        version: 1,
        completed: missionCompleted,
        currentIndex: nextMissionIndex < 0 ? MISSION_STEPS.length : nextMissionIndex,
      },
      completedChallenges,
      precisionLandingIds,
      perfectLandings: precisionLandingIds.size,
      flipsCompleted: Math.max(0, Math.floor(Number(progress.flipsCompleted) || 0)),
      flipComboAnchorIds,
      flipCombo: flipComboAnchorIds.size,
      bestFlipCombo: Math.max(flipComboAnchorIds.size, Math.floor(Number(progress.bestFlipCombo ?? restoredChallenges.origamista?.progress) || 0)),
      flipComboTimer: Math.max(0, Number(progress.flipComboTimer) || 0),
      paperFlow: clamp(Number(progress.paperFlow) || 0, 0, 100),
      flowTier: "calm",
      flowLabel: "CALMA",
      styleChain: Math.max(0, Math.floor(Number(progress.styleChain) || 0)),
      bestStyleChain: Math.max(0, Math.floor(Number(progress.bestStyleChain) || 0)),
      styleLastAction: typeof progress.styleLastAction === "string" ? progress.styleLastAction : null,
      styleTimer: Math.max(0, Number(progress.styleTimer) || 0),
      flowIdleTimer: Math.max(0, Number(progress.flowIdleTimer) || 0),
      rushTimer: clamp(Number(progress.rushTimer) || 0, 0, PAPER_RUSH_DURATION),
      paperRushes: Math.max(0, Math.floor(Number(progress.paperRushes ?? restoredChallenges.virtuoso?.progress) || 0)),
      rushArmed: progress.rushArmed == null ? false : Boolean(progress.rushArmed),
      events: [],
      particles: [],
      particleSerial: 0,
      springCooldowns: Object.create(null),
      springPulses: Object.create(null),
      springFlowId: null,
      cameraX: clamp(Number(progress.cameraX) || 0, 0, Math.max(0, level.width - 960)),
      cameraLookAhead: 0,
      cameraImpulseX: 0,
      cameraImpulseY: 0,
      checkpointPulse: 0,
      gateOpen: completed || collected.size >= level.goal.requiredCollectibles ? 1 : 0,
      goalCelebration: completed ? 1 : 0,
      reducedMotion: Boolean(progress.reducedMotion),
      assist: Boolean(progress.assist),
    };
    state.bestStyleChain = Math.max(state.bestStyleChain, state.styleChain);
    state.rushArmed = progress.rushArmed == null
      ? state.rushTimer <= 0 && state.paperFlow < PAPER_RUSH_REARM
      : Boolean(progress.rushArmed);
    refreshFlowPresentation(state);
    return state;
  }

  function queueEvent(state, type, detail = {}) {
    state.events.push({ type, ...detail });
  }

  function refreshFlowPresentation(state) {
    if (state.rushTimer > 0) {
      state.flowTier = "rush";
      state.flowLabel = "PAPER RUSH";
    } else if (state.paperFlow < 25) {
      state.flowTier = "calm";
      state.flowLabel = "CALMA";
    } else if (state.paperFlow < 55) {
      state.flowTier = "rhythm";
      state.flowLabel = "RITMO";
    } else {
      state.flowTier = "fold";
      state.flowLabel = "PLIEGUE";
    }
    return { flowTier: state.flowTier, flowLabel: state.flowLabel };
  }

  function addCameraImpulse(state, x = 0, y = 0) {
    if (state.reducedMotion) return false;
    state.cameraImpulseX = clamp(Number(state.cameraImpulseX || 0) + Number(x || 0), -14, 14);
    state.cameraImpulseY = clamp(Number(state.cameraImpulseY || 0) + Number(y || 0), -10, 10);
    return true;
  }

  function activatePaperRush(state) {
    if (!state.rushArmed || state.rushTimer > 0 || state.paperFlow < PAPER_RUSH_THRESHOLD) return false;
    state.rushArmed = false;
    state.rushTimer = PAPER_RUSH_DURATION;
    state.paperRushes += 1;
    refreshFlowPresentation(state);
    spawnParticles(state, "confetti", 18);
    spawnParticles(state, "sparks", 10);
    addCameraImpulse(state, state.player.facing * 5, -3);
    queueEvent(state, "paper-rush", {
      paperFlow: state.paperFlow,
      paperRushes: state.paperRushes,
      duration: PAPER_RUSH_DURATION,
    });
    return true;
  }

  function awardPaperFlow(state, action, baseAmount) {
    const actionId = String(action || "style");
    const repeated = state.styleLastAction === actionId;
    const chainOpen = state.styleTimer > 0 && state.styleChain > 0;
    if (!repeated) {
      state.styleChain = chainOpen ? state.styleChain + 1 : 1;
      state.styleLastAction = actionId;
      state.styleTimer = STYLE_WINDOW;
    } else {
      state.styleChain = Math.max(1, state.styleChain);
      state.styleTimer = Math.max(state.styleTimer, 0.5);
    }
    state.bestStyleChain = Math.max(state.bestStyleChain, state.styleChain);
    state.flowIdleTimer = 0;
    const varietyBonus = repeated ? 0.22 : 1 + Math.min(5, Math.max(0, state.styleChain - 1)) * 0.04;
    const gained = Math.max(0, Number(baseAmount) || 0) * varietyBonus;
    state.paperFlow = clamp(state.paperFlow + gained, 0, 100);
    refreshFlowPresentation(state);
    queueEvent(state, "flow", {
      action: actionId,
      gained,
      repeated,
      paperFlow: state.paperFlow,
      styleChain: state.styleChain,
    });
    activatePaperRush(state);
    return gained;
  }

  function breakPaperFlow(state, reason = "fall") {
    if (state.rushTimer > 0) {
      state.rushTimer = 0;
      state.paperFlow = Math.min(state.paperFlow, 70);
      queueEvent(state, "paper-rush-end", { paperFlow: state.paperFlow, paperRushes: state.paperRushes, reason });
    }
    state.paperFlow = clamp(state.paperFlow - 30, 0, 100);
    state.styleChain = 0;
    state.styleLastAction = null;
    state.styleTimer = 0;
    state.flowIdleTimer = 0;
    if (state.paperFlow < PAPER_RUSH_REARM && state.rushTimer <= 0) state.rushArmed = true;
    refreshFlowPresentation(state);
    queueEvent(state, "flow-break", { reason, paperFlow: state.paperFlow });
  }

  function updatePaperFlow(state, deltaSeconds) {
    const hadRush = state.rushTimer > 0;
    state.rushTimer = Math.max(0, state.rushTimer - deltaSeconds);
    if (hadRush && state.rushTimer <= 0) {
      state.paperFlow = Math.min(state.paperFlow, 70);
      queueEvent(state, "paper-rush-end", { paperFlow: state.paperFlow, paperRushes: state.paperRushes });
    }
    state.styleTimer = Math.max(0, state.styleTimer - deltaSeconds);
    if (state.styleTimer <= 0 && state.styleChain > 0) {
      state.styleChain = 0;
      state.styleLastAction = null;
    }
    state.flowIdleTimer += deltaSeconds;
    if (state.flowIdleTimer > 1.6 && state.paperFlow > 0) {
      const decay = state.phase === "respawning" ? 18 : state.rushTimer > 0 ? 1.5 : 4;
      state.paperFlow = Math.max(0, state.paperFlow - decay * deltaSeconds);
    }
    if (state.paperFlow < PAPER_RUSH_REARM && state.rushTimer <= 0) state.rushArmed = true;
    refreshFlowPresentation(state);
  }

  function paperRushSpeedMultiplier(state) {
    return state.rushTimer > 0 ? 1.08 : 1;
  }

  function spawnParticles(state, kind, count, origin = {}) {
    const particleKind = Object.hasOwn(PARTICLE_LIMITS, kind) ? kind : "dust";
    const requested = Math.max(0, Math.floor(Number(count) || 0));
    const amount = state.reducedMotion ? Math.min(requested, particleKind === "confetti" ? 8 : 4) : requested;
    const x = Number(origin.x ?? (state.player.x + state.player.width / 2));
    const y = Number(origin.y ?? (state.player.y + state.player.height));
    const kindLimit = PARTICLE_LIMITS[particleKind];
    const retainedAmount = Math.min(amount, kindLimit);
    const retainedExisting = Math.max(0, kindLimit - retainedAmount);
    const existingCount = state.particles.reduce((total, particle) => total + (particle.kind === particleKind ? 1 : 0), 0);
    let removals = Math.max(0, existingCount - retainedExisting);
    if (removals > 0) {
      state.particles = state.particles.filter((particle) => {
        if (particle.kind !== particleKind || removals <= 0) return true;
        removals -= 1;
        return false;
      });
    }
    const skippedAmount = amount - retainedAmount;
    state.particleSerial += skippedAmount;
    for (let retainedIndex = 0; retainedIndex < retainedAmount; retainedIndex += 1) {
      const index = skippedAmount + retainedIndex;
      const serial = state.particleSerial += 1;
      const angle = ((serial * 137.507764 + index * 29) % 360) * Math.PI / 180;
      const baseSpeed = particleKind === "ring" ? 0 : particleKind === "sparks" ? 105 : particleKind === "confetti" ? 82 : particleKind === "leaves" ? 48 : 34;
      const speed = baseSpeed * (state.reducedMotion ? 0.18 : 1);
      const life = state.reducedMotion ? 0.48 : particleKind === "ring" ? 0.52 : particleKind === "confetti" ? 1.35 : particleKind === "leaves" ? 1.1 : 0.62;
      const palettes = {
        dust: ["#d5bd83", "#b99562", "#ead7a2"],
        leaves: ["#80a84d", "#d2a247", "#5f8e55"],
        sparks: ["#fff1a3", "#f5c95f", "#9fe3e8"],
        confetti: ["#f06c69", "#f7d45b", "#77b8d4"],
        ring: ["#fff1a3", "#9fe3e8", "#f7d45b"],
      };
      state.particles.push({
        id: serial,
        kind: particleKind,
        shape: particleKind === "ring" ? "ring" : particleKind === "sparks" ? "streak" : particleKind === "leaves" ? "diamond" : particleKind === "confetti" ? "paper" : "puff",
        color: palettes[particleKind][serial % palettes[particleKind].length],
        x,
        y,
        vx: particleKind === "ring" ? 0 : Math.cos(angle) * speed,
        vy: particleKind === "ring" ? 0 : -Math.abs(Math.sin(angle) * speed) - (particleKind === "confetti" ? 45 * (state.reducedMotion ? 0.18 : 1) : 8 * (state.reducedMotion ? 0.18 : 1)),
        life,
        maximumLife: life,
        radius: particleKind === "ring" ? 8 : 0,
        rotation: angle,
        spin: state.reducedMotion ? 0 : ((serial % 5) - 2) * 2.1,
        reducedMotion: state.reducedMotion,
      });
      if (state.particles.length > MAX_PARTICLES) state.particles.shift();
    }
    return amount;
  }

  function updateParticles(state, deltaSeconds) {
    for (const particle of state.particles) {
      particle.life -= deltaSeconds;
      if (particle.kind === "ring") {
        particle.radius += (particle.reducedMotion ? 12 : 52) * deltaSeconds;
        continue;
      }
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.vy += (particle.kind === "leaves" ? 18 : 185) * (particle.reducedMotion ? 0.15 : 1) * deltaSeconds;
      particle.vx *= Math.exp(-1.7 * deltaSeconds);
      particle.rotation += particle.spin * deltaSeconds;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0).slice(-MAX_PARTICLES);
  }

  function missionStepProgress(state, stepIndex, level = DEFAULT_LEVEL) {
    switch (stepIndex) {
      case 0: return state.wildlifeDiscovered.has(level.wildlife?.[0]?.id) ? 1 : 0;
      case 1: return Math.min(1, state.flipsCompleted);
      case 2: return Math.min(MISSION_STEPS[2].target, state.collected.size);
      case 3: return state.checkpointId === "rooftops" || state.complete ? 1 : 0;
      case 4: return state.complete ? 1 : 0;
      default: return 0;
    }
  }

  function missionData(state, level = DEFAULT_LEVEL) {
    const complete = state.mission.currentIndex >= MISSION_STEPS.length;
    const stepIndex = complete ? MISSION_STEPS.length - 1 : state.mission.currentIndex;
    const step = MISSION_STEPS[stepIndex];
    return {
      id: step.id,
      title: complete ? "Pradera Bifaz completada" : step.title,
      objective: complete ? "Todos los pliegues principales están resueltos." : step.objective,
      progress: complete ? step.target : missionStepProgress(state, stepIndex, level),
      target: step.target,
      stage: complete ? MISSION_STEPS.length : stepIndex + 1,
      count: MISSION_STEPS.length,
      complete,
    };
  }

  function challengeData(state) {
    const progressById = {
      naturalista: state.wildlifeDiscovered.size,
      acrobata: state.precisionLandingIds.size,
      origamista: state.bestFlipCombo,
      virtuoso: state.paperRushes,
    };
    return OPTIONAL_CHALLENGES.map((challenge) => ({
      ...challenge,
      progress: Math.min(challenge.target, progressById[challenge.id] || 0),
      complete: state.completedChallenges.has(challenge.id),
    }));
  }

  function updateProgression(state, level = DEFAULT_LEVEL) {
    while (state.mission.currentIndex < MISSION_STEPS.length) {
      const index = state.mission.currentIndex;
      const step = MISSION_STEPS[index];
      if (missionStepProgress(state, index, level) < step.target) break;
      state.mission.completed.add(step.id);
      state.mission.currentIndex += 1;
      queueEvent(state, "mission-step", {
        stepId: step.id,
        stage: index + 1,
        count: MISSION_STEPS.length,
        title: step.title,
      });
      if (state.mission.currentIndex === MISSION_STEPS.length) queueEvent(state, "mission-complete", { count: MISSION_STEPS.length });
    }
    for (const challenge of challengeData(state)) {
      if (!challenge.complete && challenge.progress >= challenge.target) {
        state.completedChallenges.add(challenge.id);
        spawnParticles(state, "confetti", 18);
        queueEvent(state, "challenge-complete", {
          challengeId: challenge.id,
          title: challenge.title,
          progress: challenge.progress,
          target: challenge.target,
        });
      }
    }
  }

  function anchorNearPlayer(state, level) {
    return level.foldAnchors
      .filter((anchor) => Math.abs(anchor.x - state.player.x) <= anchor.radius)
      .sort((first, second) => Math.abs(first.x - state.player.x) - Math.abs(second.x - state.player.x))[0] || null;
  }

  function safeFlipProjection(state, targetMode, level = DEFAULT_LEVEL, maximumDrop = 210) {
    const player = state.player;
    const target = targetMode === DIORAMA_MODE ? DIORAMA_MODE : PROFILE_MODE;
    const projectedState = { ...state, mode: target };
    const centerX = player.x + player.width / 2;
    const candidates = level.platforms
      .filter((platform) => platformIsActive(platform, projectedState))
      .map((platform) => ({ platform, position: platformPosition(platform, state.time) }))
      .filter(({ platform, position }) => centerX >= position.x - 8 && centerX <= position.x + platform.w + 8)
      .filter(({ position }) => position.y >= player.y + player.height - 64 && position.y <= player.y + player.height + maximumDrop)
      .sort((first, second) => first.position.y - second.position.y);
    for (const candidate of candidates) {
      const projectedPlayer = { ...player, y: candidate.position.y - player.height };
      const overlapsSolid = level.barriers.some((barrier) => (
        barrierBlocks(barrier, projectedState, level) && playerOverlaps(barrier, projectedPlayer)
      ));
      if (overlapsSolid) continue;
      return {
        mode: target,
        platformId: candidate.platform.id,
        x: player.x,
        y: projectedPlayer.y,
        groundY: candidate.position.y,
      };
    }
    return null;
  }

  function snapPlayerToSafeSurface(state, projection) {
    if (!projection) return false;
    state.player.x = projection.x;
    state.player.y = projection.y;
    state.player.previousY = state.player.y;
    state.player.vy = 0;
    state.player.grounded = true;
    state.player.platformId = projection.platformId;
    return true;
  }

  function flipPreview(state, level = DEFAULT_LEVEL) {
    const anchor = anchorNearPlayer(state, level);
    if (!anchor || state.flip || !state.player.grounded) return null;
    const target = state.mode === PROFILE_MODE ? DIORAMA_MODE : PROFILE_MODE;
    const projection = safeFlipProjection(state, target, level);
    return {
      anchorId: anchor.id,
      target,
      safe: Boolean(projection),
      platformId: projection?.platformId || null,
      x: projection?.x ?? state.player.x,
      y: projection?.y ?? state.player.y,
      groundY: projection?.groundY ?? null,
    };
  }

  function requestFlip(state, targetMode, level = DEFAULT_LEVEL, options = {}) {
    const target = targetMode === DIORAMA_MODE ? DIORAMA_MODE : PROFILE_MODE;
    if (state.flip || state.mode === target) return false;
    const forced = Boolean(options.forced);
    const anchor = anchorNearPlayer(state, level);
    if (!forced && !state.assist && (!anchor || !state.player.grounded)) {
      state.tutorial = "Busca una bisagra luminosa y aterriza antes de plegar.";
      queueEvent(state, "flip-denied", { reason: anchor ? "airborne" : "anchor" });
      return false;
    }
    if (!forced && target === DIORAMA_MODE && state.pulses <= 0) {
      state.tutorial = "El Compás está vacío: aterriza o recoge un sello para recargarlo.";
      queueEvent(state, "flip-denied", { reason: "pulses" });
      return false;
    }
    const projection = safeFlipProjection(state, target, level);
    if (!forced && !projection) {
      state.tutorial = "No hay una superficie segura alineada en la otra cara.";
      queueEvent(state, "flip-denied", { reason: "unsafe-projection", target });
      return false;
    }
    const pulseSpent = target === DIORAMA_MODE && !forced;
    if (pulseSpent) state.pulses = Math.max(0, state.pulses - 1);
    const reducedMotion = Boolean(options.reducedMotion ?? state.reducedMotion);
    const duration = Math.max(0.08, Number(options.duration) || (reducedMotion ? 0.1 : forced && !state.introSeen ? 0.84 : 0.36));
    state.flip = {
      from: state.mode,
      to: target,
      elapsed: 0,
      duration,
      committed: false,
      forced,
      anchorId: anchor?.id || null,
      fromBlend: state.blend,
      toBlend: target === PROFILE_MODE ? 1 : 0,
      reducedMotion,
      stage: "anticipation",
      previousStage: null,
      commitCount: 0,
      geometryProgress: 0,
      pulseSpent,
      projection,
    };
    state.phase = "flipping";
    state.player.vx *= 0.35;
    state.player.vy = Math.min(0, state.player.vy);
    state.player.squashX = reducedMotion ? 1 : 1.08;
    state.player.squashY = reducedMotion ? 1 : 0.92;
    spawnParticles(state, "sparks", 10, { x: state.player.x + state.player.width / 2, y: state.player.y + state.player.height / 2 });
    queueEvent(state, "flip-start", { target, duration, anchorId: anchor?.id || null, stage: "anticipation" });
    return true;
  }

  function updateFlip(state, deltaSeconds, level) {
    const flip = state.flip;
    if (!flip) return false;
    flip.elapsed = Math.min(flip.duration, flip.elapsed + deltaSeconds);
    const progress = clamp(flip.elapsed / flip.duration, 0, 1);
    const stage = flipStage(progress);
    if (stage !== flip.stage) {
      const previousStage = flip.stage;
      flip.previousStage = previousStage;
      flip.stage = stage;
      queueEvent(state, "flip-stage", { stage, previousStage, progress });
    }
    const geometryProgress = flipGeometryProgress(progress);
    flip.geometryProgress = geometryProgress;
    const eased = easeInOutCubic(geometryProgress);
    state.blend = flip.reducedMotion
      ? (geometryProgress < 0.5 ? flip.fromBlend : flip.toBlend)
      : lerp(flip.fromBlend, flip.toBlend, eased);
    const braking = stage === "anticipation" ? 22 : stage === "fold" ? 30 : 38;
    state.player.vx = approach(state.player.vx, 0, braking, deltaSeconds);
    if (!flip.committed && progress >= 0.48) {
      const projection = safeFlipProjection(state, flip.to, level);
      if (!projection) {
        if (flip.pulseSpent) state.pulses = Math.min(3, state.pulses + 1);
        state.blend = flip.fromBlend;
        state.phase = state.complete ? "complete" : (state.introSeen ? "run" : "intro");
        state.tutorial = "El apoyo de la otra cara dejó de ser seguro; giro cancelado.";
        state.flip = null;
        queueEvent(state, "flip-denied", { reason: "unsafe-commit", target: flip.to });
        return false;
      }
      flip.committed = true;
      flip.commitCount += 1;
      state.mode = flip.to;
      snapPlayerToSafeSurface(state, projection);
      state.player.squashX = flip.reducedMotion ? 1 : 0.88;
      state.player.squashY = flip.reducedMotion ? 1 : 1.14;
      spawnParticles(state, "sparks", 8, {
        x: state.player.x + state.player.width / 2,
        y: state.player.y + state.player.height / 2,
      });
      addCameraImpulse(state, flip.to === PROFILE_MODE ? -5 : 5, -2.5);
      queueEvent(state, "flip-commit", { mode: state.mode, stage: "cross", commitCount: flip.commitCount });
    }
    if (progress < 1) return true;
    state.blend = flip.toBlend;
    state.flipsCompleted += 1;
    if (state.flipComboTimer <= 0) state.flipComboAnchorIds.clear();
    const newComboAnchor = Boolean(flip.anchorId && !state.flipComboAnchorIds.has(flip.anchorId));
    if (newComboAnchor) {
      state.flipComboAnchorIds.add(flip.anchorId);
      state.flipComboTimer = FLIP_COMBO_WINDOW;
    }
    state.flipCombo = state.flipComboAnchorIds.size;
    state.bestFlipCombo = Math.max(state.bestFlipCombo, state.flipCombo);
    const combo = state.flipCombo;
    const bestCombo = state.bestFlipCombo;
    spawnParticles(state, "leaves", 8);
    spawnParticles(state, "dust", 5);
    state.player.squashX = flip.reducedMotion ? 1 : 1.12;
    state.player.squashY = flip.reducedMotion ? 1 : 0.9;
    addCameraImpulse(state, flip.to === PROFILE_MODE ? 2.5 : -2.5, 1.5);
    awardPaperFlow(state, "flip", 14);
    queueEvent(state, "combo", {
      combo,
      best: bestCombo,
      window: FLIP_COMBO_WINDOW,
      anchorId: flip.anchorId,
      newAnchor: newComboAnchor,
      anchorIds: [...state.flipComboAnchorIds],
    });
    queueEvent(state, "flip-settle", { mode: state.mode, stage: "settle", anchorId: flip.anchorId });
    state.flip = null;
    if (!state.introSeen && state.mode === PROFILE_MODE) {
      state.introSeen = true;
      state.tutorial = "Perfil desbloqueado · Espacio salta · Q pliega en las bisagras.";
    } else {
      state.tutorial = state.mode === PROFILE_MODE
        ? "PERFIL · Las siluetas se alinean y vuelven las plataformas."
        : "DIORAMA · W/S cambia la profundidad; rodea la fachada.";
    }
    state.phase = state.complete ? "complete" : "run";
    queueEvent(state, "flip-end", { mode: state.mode, stage: "settle", combo, bestCombo });
    return false;
  }

  function barrierBlocks(barrier, state, level = DEFAULT_LEVEL) {
    if (barrier.goalGate) return state.collected.size < level.goal.requiredCollectibles;
    if (state.mode === PROFILE_MODE) return barrier.profileSolid !== false;
    if (barrier.dioramaSolid === false) return false;
    if (Number.isFinite(barrier.openDepthMax) && state.depth <= barrier.openDepthMax) return false;
    if (Number.isFinite(barrier.openDepthMin) && state.depth >= barrier.openDepthMin) return false;
    return true;
  }

  function resolveHorizontal(state, nextX, level) {
    const player = state.player;
    let resolvedX = clamp(nextX, 8, level.width - player.width - 8);
    for (const barrier of level.barriers) {
      if (!barrierBlocks(barrier, state, level)) continue;
      if (!rangesOverlap(player.y, player.y + player.height, barrier.y, barrier.y + barrier.h)) continue;
      const previousLeft = player.x;
      const previousRight = player.x + player.width;
      const nextLeft = resolvedX;
      const nextRight = resolvedX + player.width;
      if (player.vx > 0 && previousRight <= barrier.x + 2 && nextRight >= barrier.x) {
        resolvedX = barrier.x - player.width;
        player.vx = 0;
      } else if (player.vx < 0 && previousLeft >= barrier.x + barrier.w - 2 && nextLeft <= barrier.x + barrier.w) {
        resolvedX = barrier.x + barrier.w;
        player.vx = 0;
      }
    }
    return resolvedX;
  }

  function resolveVertical(state, previousY, nextY, level) {
    const player = state.player;
    const wasGrounded = player.grounded;
    const previousBottom = previousY + player.height;
    const nextBottom = nextY + player.height;
    let landing = null;
    if (player.vy >= 0) {
      for (const platform of level.platforms) {
        if (!platformIsActive(platform, state)) continue;
        const position = platformPosition(platform, state.time);
        if (!rangesOverlap(player.x + 4, player.x + player.width - 4, position.x, position.x + platform.w)) continue;
        if (previousBottom <= position.y + 3 && nextBottom >= position.y) {
          if (!landing || position.y < landing.position.y) landing = { platform, position };
        }
      }
    }
    if (!landing) {
      player.y = nextY;
      player.grounded = false;
      player.platformId = null;
      return false;
    }
    const impactVelocity = player.vy;
    player.y = landing.position.y - player.height;
    player.vy = 0;
    player.grounded = true;
    player.platformId = landing.platform.id;
    if (!wasGrounded) {
      const isSpringLanding = landing.platform.kind === "spring";
      const impact = clamp(impactVelocity / 700, 0, 1);
      const strength = impactVelocity >= 520 ? "perfect" : impactVelocity >= 230 ? "firm" : "soft";
      player.squashX = state.reducedMotion ? 1 : 1 + impact * 0.22;
      player.squashY = state.reducedMotion ? 1 : 1 - impact * 0.18;
      spawnParticles(state, "dust", Math.max(2, Math.min(12, Math.round(2 + impact * 10))), {
        x: player.x + player.width / 2,
        y: landing.position.y,
      });
      if (strength !== "soft") {
        spawnParticles(state, "ring", 1, { x: player.x + player.width / 2, y: landing.position.y });
        addCameraImpulse(state, 0, impact * 5);
      }
      queueEvent(state, "land", { impact, speed: impactVelocity, strength, platformId: landing.platform.id });
      if (!isSpringLanding) {
        state.springFlowId = null;
        awardPaperFlow(state, strength === "perfect" ? "perfect-land" : strength === "firm" ? "strong-land" : "land", strength === "perfect" ? 14 : strength === "firm" ? 9 : 4);
      }

      if (strength === "perfect") {
        state.pulses = Math.min(3, state.pulses + 1);
        const platformCenter = landing.position.x + Number(landing.platform.w || 0) / 2;
        const playerCenter = player.x + player.width / 2;
        const centerDistance = Math.abs(playerCenter - platformCenter);
        const centerTolerance = Number(landing.platform.w || 0) * (state.assist ? 0.32 : 0.2);
        const centered = centerDistance <= centerTolerance;
        const alreadyCounted = state.precisionLandingIds.has(landing.platform.id);
        const precision = Boolean(landing.platform.precision && centered);
        if (precision && !alreadyCounted) state.precisionLandingIds.add(landing.platform.id);
        state.perfectLandings = state.precisionLandingIds.size;
        queueEvent(state, "perfect-land", {
          speed: impactVelocity,
          platformId: landing.platform.id,
          count: state.perfectLandings,
          precision,
          newPrecision: precision && !alreadyCounted,
          centered,
          centerDistance,
          centerTolerance,
        });
      }

      if (isSpringLanding && Number(state.springCooldowns[landing.platform.id] || 0) <= 0) {
        const springVelocity = Math.max(level.physics.jumpVelocity, Number(landing.platform.springVelocity) || level.physics.jumpVelocity * 1.08);
        state.springCooldowns[landing.platform.id] = 0.3;
        state.springPulses[landing.platform.id] = 0.55;
        player.vy = -springVelocity;
        player.grounded = false;
        player.platformId = null;
        player.coyote = 0;
        player.squashX = state.reducedMotion ? 1 : 0.82;
        player.squashY = state.reducedMotion ? 1 : 1.18;
        spawnParticles(state, "sparks", 7, { x: player.x + player.width / 2, y: landing.position.y });
        spawnParticles(state, "ring", 1, { x: player.x + player.width / 2, y: landing.position.y });
        addCameraImpulse(state, player.facing * 1.5, -4);
        if (state.springFlowId !== landing.platform.id) {
          state.springFlowId = landing.platform.id;
          awardPaperFlow(state, "spring", 10);
        }
        queueEvent(state, "spring", { platformId: landing.platform.id, velocity: springVelocity, cooldown: 0.3 });
      }
    }
    return true;
  }

  function playerOverlaps(record, player) {
    return rangesOverlap(player.x, player.x + player.width, record.x, record.x + record.w)
      && rangesOverlap(player.y, player.y + player.height, record.y, record.y + record.h);
  }

  function respawnAtCheckpoint(state, level, immediate = false) {
    if (!immediate) {
      if (state.phase === "respawning") return;
      breakPaperFlow(state, "fall");
      state.flipComboAnchorIds.clear();
      state.flipCombo = 0;
      state.flipComboTimer = 0;
      state.phase = "respawning";
      state.respawnTimer = state.reducedMotion ? 0.08 : 0.42;
      state.deaths += 1;
      state.player.vx = 0;
      state.player.vy = 0;
      queueEvent(state, "fall", { deaths: state.deaths });
      return;
    }
    if (state.phase !== "respawning") breakPaperFlow(state, "restart");
    state.flipComboAnchorIds.clear();
    state.flipCombo = 0;
    state.flipComboTimer = 0;
    state.springFlowId = null;
    const checkpoint = checkpointById(level, state.checkpointId);
    state.player.x = checkpoint.x;
    state.player.y = checkpoint.y;
    state.player.previousY = checkpoint.y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.grounded = true;
    state.player.platformId = null;
    state.depth = checkpoint.depth || 0;
    state.mode = PROFILE_MODE;
    state.blend = 1;
    state.flip = null;
    state.pulses = Math.max(1, state.pulses);
    state.phase = state.complete ? "complete" : "run";
    state.respawnTimer = 0;
    state.goalLocked = false;
    state.tutorial = "Checkpoint recuperado · el Compás conserva al menos un pulso.";
    queueEvent(state, "respawn", { checkpointId: checkpoint.id });
  }

  function updateCheckpointAndCollectibles(state, level) {
    const playerCenterX = state.player.x + state.player.width / 2;
    const currentCheckpointIndex = Math.max(0, level.checkpoints.findIndex((checkpoint) => checkpoint.id === state.checkpointId));
    for (let index = currentCheckpointIndex + 1; index < level.checkpoints.length; index += 1) {
      const checkpoint = level.checkpoints[index];
      if (playerCenterX < checkpoint.x || !state.player.grounded) break;
      state.checkpointId = checkpoint.id;
      state.checkpointChanged = true;
      state.checkpointPulse = 1.6;
      state.pulses = 3;
      awardPaperFlow(state, "checkpoint", 14);
      queueEvent(state, "checkpoint", { checkpointId: checkpoint.id });
    }
    for (const collectible of level.collectibles) {
      if (state.collected.has(collectible.id)) continue;
      if (collectible.mode && collectible.mode !== state.mode) continue;
      const projectedDepthDistance = state.mode === DIORAMA_MODE ? Math.abs(state.depth - Number(collectible.depth || 0)) : 0;
      const distance = Math.hypot(
        playerCenterX - collectible.x,
        (state.player.y + state.player.height / 2) - collectible.y,
      );
      if (distance > 56 || projectedDepthDistance > 54) continue;
      state.collected.add(collectible.id);
      state.pulses = Math.min(3, state.pulses + 1);
      awardPaperFlow(state, "seal", 16);
      state.tutorial = `${collectible.label} · ${state.collected.size}/${level.goal.requiredCollectibles}`;
      queueEvent(state, "collect", { collectibleId: collectible.id, count: state.collected.size });
    }
  }

  function updateGoal(state, level) {
    if (state.complete) return;
    const playerRight = state.player.x + state.player.width;
    if (playerRight < level.goal.x) {
      state.goalLocked = false;
      return;
    }
    if (state.collected.size < level.goal.requiredCollectibles) {
      state.goalLocked = true;
      state.player.x = Math.min(state.player.x, level.goal.x - state.player.width - 4);
      state.player.vx = Math.min(0, state.player.vx);
      state.tutorial = `La Puerta del Pliegue pide ${level.goal.requiredCollectibles - state.collected.size} sello(s) más.`;
      return;
    }
    state.complete = true;
    state.phase = "complete";
    state.player.vx = 0;
    state.player.vy = 0;
    state.bestTime = state.bestTime == null ? state.runTime : Math.min(state.bestTime, state.runTime);
    spawnParticles(state, "confetti", 28, { x: state.player.x + state.player.width / 2, y: state.player.y });
    spawnParticles(state, "ring", 2, { x: level.goal.x, y: level.goal.y });
    addCameraImpulse(state, 0, -5);
    queueEvent(state, "complete", { time: state.runTime, deaths: state.deaths, collected: state.collected.size });
  }

  function updateWildlife(state, deltaSeconds, level) {
    state.wildlifeAccumulator += deltaSeconds;
    const tick = 1 / 12;
    if (state.wildlifeAccumulator < tick) return;
    const elapsed = Math.min(0.25, state.wildlifeAccumulator);
    state.wildlifeAccumulator = 0;
    const playerCenter = state.player.x + state.player.width / 2;
    state.wildlife.forEach((animal, index) => {
      animal.animation += elapsed;
      animal.startled = Math.max(0, animal.startled - elapsed);
      animal.discoveryTimer = Math.max(0, Number(animal.discoveryTimer || 0) - elapsed);
      const distance = Math.abs(animal.x - playerCenter);
      const cameraDistance = Math.abs(animal.x - (Number(state.cameraX) + 480));
      const lodDistance = Math.min(distance, cameraDistance);
      animal.lodStride = lodDistance > 1600 ? 4 : lodDistance > 800 ? 2 : 1;
      animal.lod = animal.lodStride === 4 ? "far" : animal.lodStride === 2 ? "mid" : "near";
      animal.lodAccumulator += 1;
      if (animal.lodAccumulator >= animal.lodStride) {
        animal.renderAnimation = animal.animation;
        animal.lodAccumulator = 0;
      }
      const depthDistance = state.mode === DIORAMA_MODE ? Math.abs(Number(animal.depth || 0) - state.depth) : 0;
      if (distance <= 132 && depthDistance <= 78 && !state.wildlifeDiscovered.has(animal.id)) {
        state.wildlifeDiscovered.add(animal.id);
        animal.discoveryTimer = 1.25;
        animal.reactionIcon = "discover";
        awardPaperFlow(state, "discovery", 11);
        queueEvent(state, "wildlife-discovered", {
          wildlifeId: animal.id,
          species: animal.species,
          count: state.wildlifeDiscovered.size,
          total: state.wildlife.length,
        });
      }
      if (distance < 105) {
        animal.direction = animal.x < playerCenter ? -1 : 1;
        animal.startled = 0.7;
        animal.pauseTimer = 0;
        animal.reaction = "startled";
      } else if (animal.startled <= 0) {
        animal.reaction = animal.pauseTimer > 0 ? "observe" : "calm";
      }
      animal.reactionIcon = animal.discoveryTimer > 0
        ? "discover"
        : animal.reaction === "startled" ? "alert" : animal.reaction === "observe" ? "observe" : null;
      animal.patrolClock += elapsed;
      if (animal.startled <= 0 && animal.pauseTimer <= 0 && animal.patrolClock >= animal.nextPause) {
        animal.patrolClock = 0;
        animal.pauseTimer = 0.28 + ((index * 17 + Math.floor(animal.animation)) % 5) * 0.08;
        animal.nextPause = 1.25 + ((index * 11 + Math.floor(animal.animation * 2)) % 7) * 0.16;
      }
      if (animal.pauseTimer > 0) {
        animal.pauseTimer = Math.max(0, animal.pauseTimer - elapsed);
      } else {
        const speed = animal.speed * (animal.startled > 0 ? 1.8 : 1);
        animal.x += animal.direction * speed * elapsed;
      }
      if (animal.x <= animal.minX) {
        animal.x = animal.minX;
        animal.direction = 1;
        animal.pauseTimer = Math.max(animal.pauseTimer, 0.22);
      }
      if (animal.x >= animal.maxX) {
        animal.x = animal.maxX;
        animal.direction = -1;
        animal.pauseTimer = Math.max(animal.pauseTimer, 0.22);
      }
      let support = resolveWildlifeGround(animal, state, level, state.time);
      if (support.mode === "platform" && support.platformId) {
        const platform = level.platforms.find(({ id }) => id === support.platformId);
        if (platform && platformIsActive(platform, { mode: state.mode, depth: Number(animal.depth || state.depth) })) {
          const position = platformPosition(platform, state.time);
          const supportMinX = Math.max(Number(animal.minX), position.x);
          const supportMaxX = Math.min(Number(animal.maxX), position.x + Number(platform.w || 0));
          if (supportMaxX >= supportMinX && animal.x < supportMinX) {
            animal.x = supportMinX;
            animal.direction = 1;
          } else if (supportMaxX >= supportMinX && animal.x > supportMaxX) {
            animal.x = supportMaxX;
            animal.direction = -1;
          }
          support = resolveWildlifeGround(animal, state, level, state.time);
        }
      }
      animal.platformId = support.platformId;
      animal.groundY = support.groundY;
      animal.shadowY = animal.groundY;
      const behaviorPhase = (animal.renderAnimation * 1.45 + animal.stableSeed) % 1;
      const hopping = animal.behavior === "hop" && behaviorPhase >= 0.2 && behaviorPhase <= 0.62;
      animal.hopAnticipation = state.reducedMotion || animal.behavior !== "hop" || behaviorPhase >= 0.2
        ? 0
        : 1 - behaviorPhase / 0.2;
      animal.bodyOffsetY = state.reducedMotion || !hopping
        ? 0
        : -Math.sin(((behaviorPhase - 0.2) / 0.42) * Math.PI) * 10;
      animal.grazeTilt = state.reducedMotion || animal.behavior !== "graze"
        ? 0
        : 0.08 + Math.sin(animal.renderAnimation * 2.1) * 0.025;
      animal.recoil = state.reducedMotion || animal.behavior !== "shy"
        ? 0
        : clamp(animal.startled / 0.7, 0, 1) * 7;
      animal.bodyY = animal.groundY + animal.bodyOffsetY;
      animal.y = animal.groundY;
      animal.grounded = true;
      const flipProgress = state.flip ? Number(state.flip.geometryProgress || 0) : 0;
      animal.profileScaleX = lerp(1, 0.72, state.blend);
      const foldEdgeScale = state.flip && !state.reducedMotion ? Math.max(0.18, 1 - Math.sin(flipProgress * Math.PI) * 0.82) : 1;
      animal.edgeScale = animal.profileScaleX * foldEdgeScale;
      const celebration = Boolean(state.flip || state.rushTimer > 0 || state.complete);
      animal.singing = animal.behavior === "sing" || celebration;
      animal.song = animal.singing && !state.reducedMotion ? (1 + Math.sin(animal.renderAnimation * 14 + index)) * 0.5 : 0;
      animal.songFrame = animal.singing ? Math.floor(animal.renderAnimation * 12) % 4 : 0;
    });
  }

  function updateDioramaIntro(state, input, deltaSeconds, level) {
    const physics = level.physics;
    const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const depthIntent = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const speed = (input.run ? physics.runSpeed : physics.walkSpeed) * paperRushSpeedMultiplier(state);
    state.player.vx = approach(state.player.vx, horizontal * speed, horizontal ? physics.acceleration : physics.braking, deltaSeconds);
    state.depthVelocity = approach(state.depthVelocity, depthIntent * physics.depthSpeed, depthIntent ? 15 : 22, deltaSeconds);
    state.player.x = clamp(state.player.x + state.player.vx * deltaSeconds, 16, level.introFlipX + 12);
    state.depth = clamp(state.depth + state.depthVelocity * deltaSeconds, -physics.maximumDepth, physics.maximumDepth);
    state.player.y = level.floorY - state.player.height;
    state.player.previousY = state.player.y;
    state.player.grounded = true;
    if (horizontal) state.player.facing = horizontal;
    if (state.player.x >= level.introFlipX) {
      requestFlip(state, PROFILE_MODE, level, { forced: true, reducedMotion: state.reducedMotion });
    }
  }

  function carryPlayerOnPlatform(state, deltaSeconds, level) {
    const player = state.player;
    if (!player.grounded || !player.platformId) return;
    const platform = level.platforms.find(({ id }) => id === player.platformId);
    if (!platform || !platform.motionAxis || !platformIsActive(platform, state)) return;
    const currentPosition = platformPosition(platform, state.time);
    const previousPosition = platformPosition(platform, Math.max(0, state.time - deltaSeconds));
    player.x = clamp(player.x + currentPosition.x - previousPosition.x, 8, level.width - player.width - 8);
    player.y += currentPosition.y - previousPosition.y;
    player.previousY = player.y;
  }

  function updatePlatforming(state, input, deltaSeconds, level) {
    const player = state.player;
    const physics = level.physics;
    carryPlayerOnPlatform(state, deltaSeconds, level);
    if (input.flipPressed && requestFlip(state, state.mode === PROFILE_MODE ? DIORAMA_MODE : PROFILE_MODE, level, {
      reducedMotion: state.reducedMotion,
    })) return;

    if (state.mode === DIORAMA_MODE && player.grounded) {
      const depthIntent = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      state.depthVelocity = approach(state.depthVelocity, depthIntent * physics.depthSpeed, depthIntent ? 15 : 22, deltaSeconds);
      state.depth = clamp(state.depth + state.depthVelocity * deltaSeconds, -physics.maximumDepth, physics.maximumDepth);
    } else {
      state.depthVelocity = approach(state.depthVelocity, 0, 20, deltaSeconds);
      if (state.mode === PROFILE_MODE) state.depth = approach(state.depth, 0, 12, deltaSeconds);
    }

    const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const speed = (input.run ? physics.runSpeed : physics.walkSpeed)
      * (state.mode === DIORAMA_MODE ? 0.88 : 1)
      * paperRushSpeedMultiplier(state);
    player.vx = approach(player.vx, horizontal * speed, horizontal ? physics.acceleration : physics.braking, deltaSeconds);
    if (horizontal) player.facing = horizontal;

    if (input.jumpPressed) player.jumpBuffer = physics.jumpBufferTime;
    else player.jumpBuffer = Math.max(0, player.jumpBuffer - deltaSeconds);
    if (player.grounded) player.coyote = physics.coyoteTime;
    else player.coyote = Math.max(0, player.coyote - deltaSeconds);

    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.vy = -physics.jumpVelocity * (state.mode === DIORAMA_MODE ? 0.9 : 1);
      player.grounded = false;
      player.platformId = null;
      player.coyote = 0;
      player.jumpBuffer = 0;
      player.squashX = state.reducedMotion ? 1 : 0.82;
      player.squashY = state.reducedMotion ? 1 : 1.18;
      spawnParticles(state, "dust", 5);
      awardPaperFlow(state, "jump", 6);
      queueEvent(state, "jump");
    }
    if (!input.jumpHeld && player.vy < -225) player.vy += physics.shortHopGravity * deltaSeconds;
    player.vy = Math.min(physics.terminalVelocity, player.vy + physics.gravity * deltaSeconds);

    const previousY = player.y;
    player.previousY = previousY;
    player.x = resolveHorizontal(state, player.x + player.vx * deltaSeconds, level);
    resolveVertical(state, previousY, player.y + player.vy * deltaSeconds, level);
    if (player.grounded) player.coyote = physics.coyoteTime;

    for (const hazard of level.hazards) {
      if (playerOverlaps(hazard, player)) {
        respawnAtCheckpoint(state, level);
        return;
      }
    }
    if (player.y > level.height + 90) {
      respawnAtCheckpoint(state, level);
      return;
    }
    updateCheckpointAndCollectibles(state, level);
    updateGoal(state, level);
  }

  function stepFixed(state, input, deltaSeconds, level) {
    state.time += deltaSeconds;
    if (!state.complete) state.runTime += deltaSeconds;
    state.animationTime += Math.abs(state.player.vx) * deltaSeconds;
    state.flipComboTimer = Math.max(0, state.flipComboTimer - deltaSeconds);
    if (state.flipComboTimer <= 0 && state.flipComboAnchorIds.size) {
      state.flipComboAnchorIds.clear();
      state.flipCombo = 0;
    }
    for (const id of Object.keys(state.springCooldowns)) {
      state.springCooldowns[id] = Math.max(0, state.springCooldowns[id] - deltaSeconds);
      if (state.springCooldowns[id] <= 0) delete state.springCooldowns[id];
    }
    for (const id of Object.keys(state.springPulses)) {
      state.springPulses[id] = Math.max(0, state.springPulses[id] - deltaSeconds);
      if (state.springPulses[id] <= 0) delete state.springPulses[id];
    }
    state.checkpointPulse = Math.max(0, state.checkpointPulse - deltaSeconds);
    const gateTarget = state.complete || state.collected.size >= level.goal.requiredCollectibles ? 1 : 0;
    state.gateOpen = state.reducedMotion ? gateTarget : approach(state.gateOpen, gateTarget, 3.8, deltaSeconds);
    state.goalCelebration = state.reducedMotion
      ? (state.complete ? 1 : 0)
      : approach(state.goalCelebration, state.complete ? 1 : 0, 2.4, deltaSeconds);
    state.cameraImpulseX = state.reducedMotion ? 0 : approach(state.cameraImpulseX, 0, 11, deltaSeconds);
    state.cameraImpulseY = state.reducedMotion ? 0 : approach(state.cameraImpulseY, 0, 13, deltaSeconds);
    state.player.squashX = approach(state.player.squashX, 1, 13, deltaSeconds);
    state.player.squashY = approach(state.player.squashY, 1, 13, deltaSeconds);
    const lookAheadTarget = state.player.facing * clamp(Math.abs(state.player.vx) * 0.22, 0, 62);
    state.cameraLookAhead = state.reducedMotion ? 0 : approach(state.cameraLookAhead, lookAheadTarget, 5.5, deltaSeconds);
    updatePaperFlow(state, deltaSeconds);
    updateParticles(state, deltaSeconds);

    if (input.restartPressed && !state.flip && state.phase !== "intro") {
      respawnAtCheckpoint(state, level, true);
      return;
    }
    if (state.phase === "respawning") {
      state.respawnTimer = Math.max(0, state.respawnTimer - deltaSeconds);
      if (state.respawnTimer <= 0) respawnAtCheckpoint(state, level, true);
      updateWildlife(state, deltaSeconds, level);
      updateProgression(state, level);
      return;
    }
    const hadFlip = Boolean(state.flip);
    if (hadFlip) updateFlip(state, deltaSeconds, level);
    else if (!state.introSeen && state.mode === DIORAMA_MODE) updateDioramaIntro(state, input, deltaSeconds, level);
    else updatePlatforming(state, input, deltaSeconds, level);
    updateWildlife(state, deltaSeconds, level);
    updateProgression(state, level);
  }

  function advanceState(state, input = {}, deltaSeconds = FIXED_STEP, level = DEFAULT_LEVEL) {
    const safeDelta = clamp(Number(deltaSeconds) || 0, 0, MAX_FRAME_DELTA);
    const pendingEdges = state.pendingInputEdges || (state.pendingInputEdges = {
      jumpPressed: false,
      flipPressed: false,
      restartPressed: false,
    });
    pendingEdges.jumpPressed ||= Boolean(input.jumpPressed);
    pendingEdges.flipPressed ||= Boolean(input.flipPressed);
    pendingEdges.restartPressed ||= Boolean(input.restartPressed);
    state.accumulator = Math.min(state.accumulator + safeDelta, FIXED_STEP * MAX_SUBSTEPS);
    let substeps = 0;
    while (state.accumulator + 1e-10 >= FIXED_STEP && substeps < MAX_SUBSTEPS) {
      stepFixed(state, {
        left: Boolean(input.left), right: Boolean(input.right), up: Boolean(input.up), down: Boolean(input.down),
        run: Boolean(input.run), jumpHeld: Boolean(input.jumpHeld),
        jumpPressed: pendingEdges.jumpPressed && substeps === 0,
        flipPressed: pendingEdges.flipPressed && substeps === 0,
        restartPressed: pendingEdges.restartPressed && substeps === 0,
      }, FIXED_STEP, level);
      if (substeps === 0) {
        pendingEdges.jumpPressed = false;
        pendingEdges.flipPressed = false;
        pendingEdges.restartPressed = false;
      }
      state.accumulator -= FIXED_STEP;
      substeps += 1;
    }
    return state;
  }

  function buildingTransform(building, blend, flipProgress = 0, options = {}) {
    const profile = clamp(Number(blend) || 0, 0, 1);
    const progress = clamp(Number(flipProgress) || 0, 0, 1);
    const depth = Number(building.depth) || 0;
    const hash = String(building.id || "building").split("").reduce((total, letter) => total + letter.charCodeAt(0), 0);
    const buildingDelay = (hash % 7) * 0.018;
    const reducedMotion = Boolean(options.reducedMotion);
    const partProgress = (delay) => reducedMotion ? (progress >= 0.5 ? 1 : 0) : clamp((progress - buildingDelay - delay) * 1.55, 0, 1);
    const facadeProgress = partProgress(0);
    const sideProgress = partProgress(0.055);
    const roofProgress = partProgress(0.11);
    const cascade = (facadeProgress + sideProgress + roofProgress) / 3;
    const hinge = reducedMotion ? 0 : Math.sin(cascade * Math.PI);
    const remainingDepth = 1 - profile;
    return {
      x: Number(building.x) + depth * 0.62 * remainingDepth + Math.sign(depth || 1) * hinge * 13,
      y: Number(building.y) - depth * 0.24 * remainingDepth - hinge * 7,
      scaleX: 1 - hinge * 0.075,
      scaleY: 1 + hinge * 0.025,
      sideWidth: Math.abs(depth) * 0.44 * remainingDepth,
      sideDirection: depth < 0 ? -1 : 1,
      roofDepth: Math.max(0, Number(building.roof) || 0) * remainingDepth,
      shadowSkew: depth * 0.18 * remainingDepth,
      facadeLift: hinge * Math.min(18, Math.abs(depth) * 0.13),
      opacity: 0.82 + profile * 0.18,
      cascade,
      cascadeDelay: buildingDelay,
      facade: {
        progress: facadeProgress,
        lift: (reducedMotion ? 0 : Math.sin(facadeProgress * Math.PI)) * -7,
        scaleX: 1 - (reducedMotion ? 0 : Math.sin(facadeProgress * Math.PI)) * 0.075,
      },
      side: {
        progress: sideProgress,
        width: Math.abs(depth) * 0.44 * remainingDepth,
        fold: reducedMotion ? sideProgress : easeInOutCubic(sideProgress),
      },
      roof: {
        progress: roofProgress,
        depth: Math.max(0, Number(building.roof) || 0) * remainingDepth,
        lift: (reducedMotion ? 0 : Math.sin(roofProgress * Math.PI)) * Math.min(12, Math.abs(depth) * 0.09),
      },
    };
  }

  function visibleEntities(items, cameraX, viewportWidth, margin = 120) {
    const left = Number(cameraX) - margin;
    const right = Number(cameraX) + Number(viewportWidth) + margin;
    return items.filter((item) => {
      const x = Number(item.x) || 0;
      const width = Number(item.w || item.width || 72);
      return x + width >= left && x <= right;
    });
  }

  function validateLevel(level = DEFAULT_LEVEL) {
    const errors = [];
    if (!level || typeof level !== "object") return { valid: false, errors: ["Nivel ausente."], stats: {} };
    if (!(Number(level.width) > 960) || !(Number(level.height) >= 480)) errors.push("Dimensiones de nivel no válidas.");
    if (!level.spawn || !Number.isFinite(level.spawn.x) || !Number.isFinite(level.spawn.y)) errors.push("Spawn no válido.");
    const ids = new Set();
    for (const collectionName of ["platforms", "buildings", "wildlife", "checkpoints", "collectibles"]) {
      const collection = Array.isArray(level[collectionName]) ? level[collectionName] : [];
      if (!collection.length) errors.push(`${collectionName} está vacío.`);
      collection.forEach((record) => {
        if (!record.id || ids.has(`${collectionName}:${record.id}`)) errors.push(`ID repetido o ausente en ${collectionName}.`);
        ids.add(`${collectionName}:${record.id}`);
        if (!Number.isFinite(Number(record.x))) errors.push(`Coordenada X inválida en ${record.id || collectionName}.`);
      });
    }
    level.platforms?.forEach((platform) => {
      if (!(platform.w > 0) || !(platform.h > 0) || !Number.isFinite(platform.y)) errors.push(`Plataforma inválida: ${platform.id}.`);
    });
    level.wildlife?.forEach((animal) => {
      if (!(animal.minX <= animal.x && animal.x <= animal.maxX) || !(animal.speed >= 0)) errors.push(`Patrulla inválida: ${animal.id}.`);
    });
    const profilePlatforms = (level.platforms || []).filter((platform) => platform.modes !== "diorama")
      .map((platform) => ({ ...platform, position: platformPosition(platform, 0) }))
      .sort((first, second) => first.position.x - second.position.x);
    const reachable = new Set();
    const queue = [];
    profilePlatforms.forEach((platform, index) => {
      const { x, y } = platform.position;
      if (level.spawn.x >= x - 20 && level.spawn.x <= x + platform.w + 20 && level.spawn.y + PLAYER_HEIGHT <= y + 10) {
        reachable.add(index); queue.push(index);
      }
    });
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const currentIndex = queue[cursor];
      const current = profilePlatforms[currentIndex];
      for (let index = 0; index < profilePlatforms.length; index += 1) {
        if (reachable.has(index)) continue;
        const candidate = profilePlatforms[index];
        const horizontalGap = Math.max(0,
          candidate.position.x - (current.position.x + current.w),
          current.position.x - (candidate.position.x + candidate.w),
        );
        const verticalRise = current.position.y - candidate.position.y;
        const verticalDrop = candidate.position.y - current.position.y;
        if (horizontalGap <= 225 && verticalRise <= 154 && verticalDrop <= 235) {
          reachable.add(index); queue.push(index);
        }
      }
    }
    const goalReachable = profilePlatforms.some((platform, index) => reachable.has(index)
      && level.goal.x >= platform.position.x - 240
      && level.goal.x <= platform.position.x + platform.w + 240);
    if (!goalReachable) errors.push("La meta no es alcanzable por el grafo de saltos de Perfil.");
    return {
      valid: errors.length === 0,
      errors,
      stats: {
        platforms: level.platforms?.length || 0,
        buildings: level.buildings?.length || 0,
        wildlife: level.wildlife?.length || 0,
        checkpoints: level.checkpoints?.length || 0,
        collectibles: level.collectibles?.length || 0,
        profilePlatformsReachable: reachable.size,
        goalReachable,
      },
    };
  }

  function snapshotState(state) {
    const mission = missionData(state);
    const challenges = Object.fromEntries(challengeData(state).map((challenge) => [challenge.id, {
      progress: challenge.progress,
      target: challenge.target,
      complete: challenge.complete,
    }]));
    return {
      version: VERSION,
      snapshotVersion: SNAPSHOT_VERSION,
      checkpointId: state.checkpointId,
      collected: [...state.collected].sort(),
      pulses: state.pulses,
      introSeen: state.introSeen,
      complete: state.complete,
      bestTime: state.bestTime,
      deaths: state.deaths,
      cameraX: state.cameraX,
      mission: {
        version: state.mission.version,
        completed: MISSION_STEPS.filter(({ id }) => state.mission.completed.has(id)).map(({ id }) => id),
        currentIndex: state.mission.currentIndex,
        complete: state.mission.currentIndex >= MISSION_STEPS.length,
      },
      wildlifeDiscovered: [...state.wildlifeDiscovered].sort(),
      discoveries: [...state.wildlifeDiscovered].sort(),
      missionTitle: mission.title,
      missionObjective: mission.objective,
      missionProgress: mission.target > 0 ? clamp(mission.progress / mission.target, 0, 1) : 1,
      missionStage: mission.stage,
      missionCount: mission.count,
      missionComplete: mission.complete,
      completedChallenges: OPTIONAL_CHALLENGES.filter(({ id }) => state.completedChallenges.has(id)).map(({ id }) => id),
      challenges,
      precisionLandingIds: [...state.precisionLandingIds].sort(),
      perfectLandings: state.precisionLandingIds.size,
      flipsCompleted: state.flipsCompleted,
      flipComboAnchorIds: [...state.flipComboAnchorIds].sort(),
      flipCombo: state.flipComboAnchorIds.size,
      bestFlipCombo: state.bestFlipCombo,
      flipComboTimer: state.flipComboTimer,
      paperFlow: state.paperFlow,
      flowTier: state.flowTier,
      flowLabel: state.flowLabel,
      styleChain: state.styleChain,
      bestStyleChain: state.bestStyleChain,
      styleLastAction: state.styleLastAction,
      styleTimer: state.styleTimer,
      flowIdleTimer: state.flowIdleTimer,
      rushTimer: state.rushTimer,
      paperRushes: state.paperRushes,
      rushArmed: state.rushArmed,
    };
  }

  function createRuntime(options = {}) {
    const level = options.level || DEFAULT_LEVEL;
    const progress = options.progress || {};
    const state = createState(level, { ...progress, reducedMotion: options.reducedMotion, assist: options.assist });
    const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    const imageCache = new Map();
    let running = options.autoStart !== false;
    let destroyed = false;
    let lastHudSignature = "";
    let lastCameraTime = state.time;

    function imageFor(source) {
      if (!source || typeof root.Image !== "function") return null;
      if (imageCache.has(source)) return imageCache.get(source);
      const image = new root.Image();
      const record = { image, ready: false, failed: false };
      image.decoding = "async";
      image.onload = () => { record.ready = true; };
      image.onerror = () => { record.failed = true; };
      image.src = source;
      imageCache.set(source, record);
      return record;
    }

    const playerImage = imageFor("assets/sprites/protagonist-walk-pixellab.png");
    const grassImage = imageFor("assets/generated/san-pablo-rebuilt/runtime/grass-tall-spritesheet.png");

    function drainEvents() {
      if (!state.events.length) return;
      const queued = state.events.splice(0, state.events.length);
      queued.forEach((event) => onEvent(event, snapshotState(state)));
    }

    function step(deltaSeconds, input = {}) {
      if (!running || destroyed) return state;
      advanceState(state, input, deltaSeconds, level);
      drainEvents();
      return state;
    }

    function drawSky(context, viewportWidth, viewportHeight, cameraX) {
      const gradient = context.createLinearGradient(0, 0, 0, viewportHeight);
      gradient.addColorStop(0, "#8bc8d8");
      gradient.addColorStop(0.58, "#d6e8c4");
      gradient.addColorStop(1, "#f4d594");
      context.fillStyle = gradient;
      context.fillRect(0, 0, viewportWidth, viewportHeight);

      context.fillStyle = "rgba(255,247,194,.88)";
      context.beginPath(); context.arc(viewportWidth - 115, 92, 42, 0, Math.PI * 2); context.fill();
      const cloudOffset = -(cameraX * 0.08) % 520;
      context.fillStyle = "rgba(255,255,246,.76)";
      for (let x = cloudOffset - 140; x < viewportWidth + 180; x += 520) {
        context.fillRect(Math.round(x), 116, 118, 18);
        context.fillRect(Math.round(x + 24), 98, 58, 22);
        context.fillRect(Math.round(x + 54), 106, 92, 26);
      }
      const hillOffset = -(cameraX * 0.19) % 640;
      context.fillStyle = "#739f7d";
      for (let x = hillOffset - 260; x < viewportWidth + 300; x += 640) {
        context.beginPath();
        context.moveTo(x, viewportHeight);
        context.quadraticCurveTo(x + 170, 265, x + 355, viewportHeight);
        context.closePath(); context.fill();
      }
      context.fillStyle = "#5b876e";
      for (let x = hillOffset - 430; x < viewportWidth + 300; x += 760) {
        context.beginPath();
        context.moveTo(x, viewportHeight);
        context.quadraticCurveTo(x + 190, 318, x + 420, viewportHeight);
        context.closePath(); context.fill();
      }
    }

    function drawBuilding(context, building, cameraX, blend, flipProgress) {
      const transform = buildingTransform(building, blend, flipProgress, { reducedMotion: state.reducedMotion });
      const projectedX = Math.round(transform.x - cameraX);
      const width = Math.round(building.w * transform.scaleX * transform.facade.scaleX);
      const height = Math.round(building.h * transform.scaleY);
      const baseY = Math.round(transform.y + building.h);
      const x = Math.round(projectedX + (building.w - width) / 2);
      const y = Math.round(baseY - height - transform.facadeLift + transform.facade.lift);
      const cascadeDirection = state.flip?.to === PROFILE_MODE ? -1 : 1;
      const sideCascade = state.flip ? (cascadeDirection < 0 ? 1 - transform.side.fold : transform.side.fold) : 1;
      const roofCascade = state.flip ? (cascadeDirection < 0 ? 1 - transform.roof.progress : transform.roof.progress) : 1;
      const sideWidth = Math.round(transform.sideWidth * sideCascade) * transform.sideDirection;
      const roofDepth = Math.round(transform.roofDepth * roofCascade);
      const roofLift = state.flip ? transform.roof.lift : 0;
      context.save();
      context.globalAlpha = transform.opacity;
      context.fillStyle = "rgba(39,59,48,.25)";
      context.beginPath();
      context.moveTo(projectedX - 15 + transform.shadowSkew, baseY + 5);
      context.lineTo(projectedX + building.w + 18 + transform.shadowSkew, baseY + 5);
      context.lineTo(projectedX + building.w + sideWidth + 34, baseY + 25);
      context.lineTo(projectedX + sideWidth - 24, baseY + 25);
      context.closePath(); context.fill();

      if (sideWidth) {
        context.fillStyle = building.side;
        context.beginPath();
        if (sideWidth > 0) {
          context.moveTo(x + width, y); context.lineTo(x + width + sideWidth, y - roofDepth);
          context.lineTo(x + width + sideWidth, y + height - roofDepth); context.lineTo(x + width, y + height);
        } else {
          context.moveTo(x, y); context.lineTo(x + sideWidth, y - roofDepth);
          context.lineTo(x + sideWidth, y + height - roofDepth); context.lineTo(x, y + height);
        }
        context.closePath(); context.fill();
      }

      context.fillStyle = building.color;
      context.fillRect(x, y, width, height);
      context.fillStyle = "rgba(255,255,255,.12)";
      context.fillRect(x + 7, y + 8, Math.max(0, width - 14), 7);
      context.fillStyle = building.side;
      context.fillRect(x, y + height - 20, width, 20);
      context.fillStyle = building.accent;
      const windowCount = Math.max(2, Number(building.windows) || 3);
      const spacing = width / (windowCount + 1);
      for (let index = 0; index < windowCount; index += 1) {
        const windowX = x + Math.round(spacing * (index + 1) - 13);
        context.fillRect(windowX, y + 46 + (index % 2) * 4, 26, 32);
        context.fillStyle = "rgba(48,72,75,.68)";
        context.fillRect(windowX + 4, y + 50 + (index % 2) * 4, 8, 24);
        context.fillRect(windowX + 15, y + 50 + (index % 2) * 4, 7, 24);
        context.fillStyle = building.accent;
      }
      context.fillStyle = "#384e45";
      context.fillRect(x + Math.round(width / 2 - 22), y + height - 70, 44, 70);
      context.fillStyle = building.accent;
      context.fillRect(x + Math.round(width / 2 - 14), y + height - 60, 8, 8);

      const roof = Math.max(18, Number(building.roof) || 28);
      context.fillStyle = building.side;
      context.beginPath();
      context.moveTo(x - 14, y + 4 + roofLift);
      context.lineTo(x + Math.round(width / 2), y - roof + roofLift);
      context.lineTo(x + width + 14, y + 4 + roofLift);
      if (roofDepth) context.lineTo(x + width + 14 + sideWidth, y + 4 - roofDepth + roofLift);
      context.lineTo(x - 14 + sideWidth, y + 4 - roofDepth + roofLift);
      context.closePath(); context.fill();
      context.fillStyle = "rgba(255,255,255,.14)";
      context.fillRect(x - 8, y + 1, width + 16, 5);
      context.restore();
    }

    function drawGrassStrip(context, x, y, width, cameraX, viewportWidth) {
      const playerCenter = state.player.x + state.player.width / 2;
      const runFactor = state.reducedMotion ? 0 : clamp((Math.abs(state.player.vx) - 70) / 210, 0, 1);
      const bendFor = (worldX) => {
        const proximity = clamp(1 - Math.abs(worldX - playerCenter) / 105, 0, 1);
        return Math.sin(state.time * 8 + worldX * 0.17) * proximity * runFactor * 7;
      };
      if (!grassImage?.ready) {
        context.fillStyle = "#5c973f";
        const start = Math.max(0, Math.floor((cameraX - x - 12) / 12) * 12);
        const end = Math.min(width, cameraX + viewportWidth - x + 12);
        for (let offset = start; offset < end; offset += 12) {
          const bend = bendFor(x + offset);
          context.fillRect(Math.round(x + offset - cameraX + bend), Math.round(y - 8 - (offset % 3)), 4, 10);
        }
        return;
      }
      const start = Math.floor((cameraX - x - 36) / 34) * 34;
      const end = Math.min(width + 36, cameraX + viewportWidth - x + 60);
      for (let offset = Math.max(-34, start); offset < end; offset += 34) {
        const frame = Math.abs(Math.floor((offset + x) / 34)) % 4;
        const bend = bendFor(x + offset);
        context.drawImage(grassImage.image, frame * 64, 0, 64, 64, Math.round(x + offset - cameraX + bend), Math.round(y - 29), 38, 38);
      }
    }

    function drawPlatform(context, platform, cameraX, viewportWidth) {
      const position = platformPosition(platform, state.time);
      const x = Math.round(position.x - cameraX);
      const y = Math.round(position.y);
      const visual = platformVisualState(platform, state);
      const springPulse = clamp(Number(state.springPulses[platform.id] || 0) / 0.55, 0, 1);
      let motionExtreme = 0;
      if (platform.motionAxis && platform.motionRange && platform.motionPeriod) {
        const phase = ((state.time / platform.motionPeriod) + Number(platform.motionPhase || 0)) * Math.PI * 2;
        motionExtreme = Math.abs(Math.sin(phase));
        context.save();
        context.globalAlpha = 0.28;
        context.strokeStyle = "#fff1ac";
        context.lineWidth = 2;
        context.setLineDash([7, 6]);
        context.beginPath();
        if (platform.motionAxis === "y") {
          context.moveTo(platform.x + platform.w / 2 - cameraX, platform.y - platform.motionRange);
          context.lineTo(platform.x + platform.w / 2 - cameraX, platform.y + platform.motionRange);
        } else {
          context.moveTo(platform.x - platform.motionRange - cameraX, platform.y + platform.h / 2);
          context.lineTo(platform.x + platform.motionRange + platform.w - cameraX, platform.y + platform.h / 2);
        }
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = "#fff1ac";
        if (platform.motionAxis === "y") {
          const guideX = platform.x + platform.w / 2 - cameraX;
          for (const [guideY, direction] of [[platform.y - platform.motionRange, -1], [platform.y + platform.motionRange, 1]]) {
            context.beginPath(); context.moveTo(guideX, guideY + direction * 7); context.lineTo(guideX - 5, guideY); context.lineTo(guideX + 5, guideY); context.closePath(); context.fill();
          }
        } else {
          const guideY = platform.y + platform.h / 2;
          for (const [guideX, direction] of [[platform.x - platform.motionRange - cameraX, -1], [platform.x + platform.motionRange + platform.w - cameraX, 1]]) {
            context.beginPath(); context.moveTo(guideX + direction * 7, guideY); context.lineTo(guideX, guideY - 5); context.lineTo(guideX, guideY + 5); context.closePath(); context.fill();
          }
        }
        context.restore();
      }
      const motionScaleX = state.reducedMotion ? 1 : 1 + motionExtreme * 0.045;
      const motionScaleY = state.reducedMotion ? 1 : 1 - motionExtreme * 0.065;
      context.save();
      context.globalAlpha = visual.visibility;
      if (!visual.active) context.setLineDash([8, 6]);
      context.translate(x + platform.w / 2, y + platform.h / 2);
      context.scale(motionScaleX * (1 + springPulse * (state.reducedMotion ? 0 : 0.08)), visual.scaleY * motionScaleY * (1 - springPulse * (state.reducedMotion ? 0 : 0.08)));
      context.translate(-platform.w / 2, -platform.h / 2);
      const topColor = platform.kind === "spring" ? "#f3cf66" : platform.kind === "roof" ? "#b65f56" : platform.kind === "awning" ? "#e4b75f" : "#67a64c";
      const bodyColor = platform.kind === "spring" ? "#557b73" : platform.kind === "roof" ? "#754342" : platform.kind === "brick" ? "#8e6953" : "#8d673f";
      context.fillStyle = bodyColor;
      context.fillRect(0, 0, platform.w, Math.max(12, platform.h));
      context.fillStyle = topColor;
      context.fillRect(0, 0, platform.w, Math.min(10, platform.h));
      context.fillStyle = "rgba(255,255,255,.17)";
      context.fillRect(3, 2, Math.max(0, platform.w - 6), 3);
      if (platform.kind === "spring") {
        context.strokeStyle = "#fff4b4";
        context.lineWidth = 2;
        for (let offset = 9; offset < platform.w - 5; offset += 13) {
          context.beginPath();
          context.moveTo(offset - 4, platform.h - 5);
          context.lineTo(offset, 8);
          context.lineTo(offset + 4, platform.h - 5);
          context.stroke();
        }
      }
      if (!visual.active) {
        context.strokeStyle = state.mode === PROFILE_MODE ? "#f3cf66" : "#96d8e5";
        context.lineWidth = 2; context.strokeRect(1, 1, platform.w - 2, Math.max(10, platform.h - 2));
      }
      context.restore();
      if (platform.grass && visual.visibility > 0.2) {
        context.save();
        context.globalAlpha = visual.visibility;
        drawGrassStrip(context, position.x, position.y, platform.w, cameraX, viewportWidth);
        context.restore();
      }
    }

    function drawHazard(context, hazard, cameraX) {
      const x = Math.round(hazard.x - cameraX);
      context.fillStyle = "#3d4c2d";
      context.fillRect(x, hazard.y, hazard.w, hazard.h);
      context.fillStyle = "#6d3348";
      for (let offset = 0; offset < hazard.w; offset += 20) {
        context.beginPath();
        context.moveTo(x + offset, hazard.y + 18);
        context.lineTo(x + offset + 10, hazard.y - 6 - (offset % 3) * 3);
        context.lineTo(x + offset + 20, hazard.y + 18);
        context.closePath(); context.fill();
      }
    }

    function drawCollectible(context, collectible, cameraX) {
      if (state.collected.has(collectible.id)) return;
      const modeMismatch = collectible.mode && collectible.mode !== state.mode;
      const x = Math.round(collectible.x - cameraX + (1 - state.blend) * Number(collectible.depth || 0) * 0.62);
      const y = Math.round(collectible.y - (1 - state.blend) * Number(collectible.depth || 0) * 0.24);
      const pulse = state.reducedMotion ? 0 : Math.sin(state.time * 4 + collectible.x) * 3;
      context.save();
      context.globalAlpha = modeMismatch ? 0.2 : 1;
      context.translate(x, y + pulse);
      context.rotate(Math.PI / 4);
      context.fillStyle = "#f7d45b";
      context.fillRect(-12, -12, 24, 24);
      context.fillStyle = "#fff5ae";
      context.fillRect(-7, -7, 8, 8);
      context.strokeStyle = "#6d4b2a";
      context.lineWidth = 3; context.strokeRect(-12, -12, 24, 24);
      context.restore();
    }

    function drawWildlife(context, animal, cameraX) {
      const projectionX = animal.x - cameraX + (1 - state.blend) * Number(animal.depth || 0) * 0.62;
      const depthY = -(1 - state.blend) * Number(animal.depth || 0) * 0.24;
      const projectionGroundY = Number(animal.shadowY ?? animal.groundY ?? animal.y) + depthY;
      const projectionBodyY = Number(animal.bodyY ?? animal.groundY ?? animal.y) + depthY;
      const size = 58 * Number(animal.scale || 1);
      const edgeScale = Number(animal.edgeScale || 1);
      const squashY = state.reducedMotion ? 1 : animal.hopAnticipation > 0 ? 1 - animal.hopAnticipation * 0.08 : 1;
      const squashX = state.reducedMotion ? 1 : 1 + Number(animal.hopAnticipation || 0) * 0.08;
      const record = imageFor(animal.sprite);
      context.save();
      context.fillStyle = "rgba(40,58,43,.28)";
      context.beginPath(); context.ellipse(Math.round(projectionX), Math.round(projectionGroundY + 3), size * 0.34, 7, 0, 0, Math.PI * 2); context.fill();
      context.translate(Math.round(projectionX + animal.direction * Number(animal.recoil || 0)), Math.round(projectionBodyY));
      context.rotate(Number(animal.grazeTilt || 0) * (animal.direction < 0 ? -1 : 1));
      context.scale((animal.direction < 0 ? -1 : 1) * edgeScale * squashX, squashY);
      if (record?.ready) {
        if (state.blend > 0.55) {
          const paperEcho = clamp((state.blend - 0.55) / 0.45, 0, 1);
          context.save();
          context.globalAlpha = paperEcho * 0.18;
          context.translate(animal.direction * -3, -1);
          context.scale(1.04, 1.02);
          context.drawImage(record.image, -size / 2, -size + 7, size, size);
          context.restore();
        }
        context.drawImage(record.image, -size / 2, -size + 7, size, size);
      } else {
        context.fillStyle = "#f0ca58";
        context.fillRect(-14, -29, 28, 26);
        context.fillStyle = "#405e46";
        context.fillRect(-9, -23, 5, 5); context.fillRect(5, -23, 5, 5);
      }
      if (animal.singing && animal.song > 0.18) {
        context.fillStyle = "rgba(255,247,173,.9)";
        context.fillRect(size * 0.24, -size * 0.92 - animal.song * 6, 3, 11);
        context.beginPath(); context.arc(size * 0.2, -size * 0.72 - animal.song * 6, 5, 0, Math.PI * 2); context.fill();
      }
      context.restore();
      if (animal.reactionIcon) {
        context.save();
        context.translate(Math.round(projectionX), Math.round(projectionBodyY - size - 7));
        context.globalAlpha = animal.reactionIcon === "discover" ? 1 : 0.82;
        context.fillStyle = animal.reactionIcon === "discover" ? "#f7d45b" : animal.reactionIcon === "alert" ? "#f18a69" : "#9fe3e8";
        if (animal.reactionIcon === "alert") {
          context.beginPath();
          context.moveTo(0, -9); context.lineTo(8, 7); context.lineTo(-8, 7); context.closePath(); context.fill();
          context.fillStyle = "#fff8d2"; context.fillRect(-1, -3, 2, 6);
        } else {
          context.rotate(Math.PI / 4);
          const iconSize = animal.reactionIcon === "discover" ? 10 : 7;
          context.fillRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize);
        }
        context.restore();
      }
    }

    function drawParticle(context, particle, cameraX) {
      context.save();
      const fade = clamp(particle.life / particle.maximumLife, 0, 1);
      context.globalAlpha = particle.reducedMotion ? fade * 0.72 : fade;
      context.translate(Math.round(particle.x - cameraX), Math.round(particle.y));
      context.rotate(particle.rotation);
      context.fillStyle = particle.color || "#d7b67a";
      if (particle.shape === "ring") {
        context.strokeStyle = particle.color || "#fff1a3";
        context.lineWidth = particle.reducedMotion ? 1 : 2;
        context.beginPath(); context.ellipse(0, 0, particle.radius, particle.radius * 0.3, 0, 0, Math.PI * 2); context.stroke();
      } else if (particle.shape === "puff") {
        context.beginPath(); context.arc(0, 0, 3.5, 0, Math.PI * 2); context.fill();
      } else if (particle.shape === "streak") {
        context.fillRect(-5, -1, 10, 2);
      } else {
        const size = particle.shape === "paper" ? 7 : 6;
        context.fillRect(-size / 2, -size / 2, size, particle.shape === "paper" ? 4 : size);
      }
      context.restore();
    }

    function drawCheckpoint(context, checkpoint, cameraX) {
      const x = Math.round(checkpoint.x - cameraX);
      const groundY = Math.round(checkpoint.y + PLAYER_HEIGHT);
      const activeIndex = level.checkpoints.findIndex(({ id }) => id === state.checkpointId);
      const checkpointIndex = level.checkpoints.findIndex(({ id }) => id === checkpoint.id);
      const reached = checkpointIndex <= activeIndex;
      const pulse = state.reducedMotion || checkpoint.id !== state.checkpointId
        ? 0
        : Math.sin((1.6 - state.checkpointPulse) * 8) * clamp(state.checkpointPulse / 1.6, 0, 1);
      context.save();
      context.globalAlpha = reached ? 0.95 : 0.42;
      context.fillStyle = "#5b4a55";
      context.fillRect(x - 2, groundY - 58, 4, 58);
      context.fillStyle = reached ? "#f7d45b" : "#9c8d83";
      context.beginPath();
      context.moveTo(x + 2, groundY - 57);
      context.lineTo(x + 25 + pulse * 3, groundY - 48);
      context.lineTo(x + 2, groundY - 39);
      context.closePath(); context.fill();
      context.globalAlpha *= 0.35;
      context.beginPath(); context.ellipse(x, groundY + 2, 18 + Math.abs(pulse) * 4, 5, 0, 0, Math.PI * 2); context.fill();
      context.restore();
    }

    function drawBarrier(context, barrier, cameraX) {
      if (barrier.goalGate) {
        const x = Math.round(barrier.x - cameraX);
        const openAmount = clamp(Number(state.gateOpen || 0), 0, 1);
        const halfWidth = barrier.w / 2;
        const slide = openAmount * (halfWidth + 8);
        context.save();
        context.globalAlpha = 1 - openAmount * 0.52;
        context.fillStyle = "#503f69";
        context.fillRect(x - slide, barrier.y, halfWidth, barrier.h);
        context.fillRect(x + halfWidth + slide, barrier.y, halfWidth, barrier.h);
        context.fillStyle = "#f2ce64";
        for (let y = barrier.y + 12; y < barrier.y + barrier.h; y += 32) {
          context.fillRect(x + 4 - slide, y, Math.max(3, halfWidth - 7), 7);
          context.fillRect(x + halfWidth + 3 + slide, y, Math.max(3, halfWidth - 7), 7);
        }
        if (state.goalCelebration > 0.02) {
          context.globalAlpha = state.goalCelebration * (state.reducedMotion ? 0.18 : 0.35);
          context.strokeStyle = "#fff1a3";
          context.lineWidth = 3 + state.goalCelebration * 3;
          context.strokeRect(x - 12, barrier.y - 12, barrier.w + 24, barrier.h + 24);
        }
        context.restore();
        return;
      }
      const x = Math.round(barrier.x - cameraX + (1 - state.blend) * 46);
      const visibleWidth = Math.max(12, Math.round(barrier.w + (1 - state.blend) * 78));
      context.save();
      context.globalAlpha = barrierBlocks(barrier, state, level) ? 0.95 : 0.32;
      context.fillStyle = "#704c80";
      context.fillRect(x, barrier.y, visibleWidth, barrier.h);
      context.fillStyle = "#b589c3";
      context.fillRect(x + 7, barrier.y + 7, Math.max(0, visibleWidth - 14), 8);
      context.restore();
    }

    function drawFlipPreview(context, cameraX) {
      const preview = flipPreview(state, level);
      if (!preview?.safe) return;
      const targetBlend = preview.target === PROFILE_MODE ? 1 : 0;
      const depthX = (1 - targetBlend) * state.depth * 0.62;
      const depthY = -(1 - targetBlend) * state.depth * 0.24;
      const centerX = Math.round(preview.x + state.player.width / 2 - cameraX + depthX);
      const groundY = Math.round(preview.groundY + depthY);
      context.save();
      context.globalAlpha = 0.2;
      context.fillStyle = preview.target === PROFILE_MODE ? "#fff1ac" : "#9bd9e4";
      context.fillRect(centerX - 11, groundY - state.player.height, 22, state.player.height - 4);
      context.beginPath();
      context.ellipse(centerX, groundY + 1, 24, 6, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    function drawPlayer(context, cameraX) {
      const player = state.player;
      const depthX = (1 - state.blend) * state.depth * 0.62;
      const depthY = -(1 - state.blend) * state.depth * 0.24;
      const x = Math.round(player.x + player.width / 2 - cameraX + depthX);
      const y = Math.round(player.y + player.height + depthY);
      const edgeScale = state.flip && !state.reducedMotion
        ? 1 - Math.sin(Number(state.flip.geometryProgress || 0) * Math.PI) * 0.78
        : 1;
      context.save();
      context.fillStyle = "rgba(35,54,41,.3)";
      context.beginPath(); context.ellipse(x, y + 1, 18 * Math.max(0.22, edgeScale), 6, 0, 0, Math.PI * 2); context.fill();
      context.translate(x, y);
      const airborne = !player.grounded;
      const airAmount = state.reducedMotion || !airborne ? 0 : clamp(player.vy / level.physics.terminalVelocity, -1, 1);
      const airScaleX = airAmount < 0 ? 0.94 : airAmount > 0 ? 1.06 : 1;
      const airScaleY = airAmount < 0 ? 1.06 : airAmount > 0 ? 0.94 : 1;
      context.rotate(airAmount * 0.13 * player.facing);
      context.scale(Math.max(0.16, edgeScale) * player.facing * player.squashX * airScaleX, player.squashY * airScaleY);
      if (playerImage?.ready) {
        const moving = Math.abs(player.vx) > 8;
        const frame = airborne && !state.reducedMotion
          ? player.vy < -80 ? 1 : player.vy > 220 ? 4 : 2
          : moving ? Math.floor(state.animationTime / 15) % 6 : 0;
        const row = player.facing < 0 ? 6 : 2;
        context.drawImage(playerImage.image, frame * 64, row * 64, 64, 64, -32, -61, 64, 64);
      } else {
        context.fillStyle = "#e85c57"; context.fillRect(-13, -43, 26, 38);
        context.fillStyle = "#f5d8b0"; context.fillRect(-9, -50, 18, 15);
        context.fillStyle = "#263e64"; context.fillRect(-13, -18, 26, 13);
      }
      context.restore();
    }

    function drawFlipOverlay(context, viewportWidth, viewportHeight) {
      if (!state.flip) return;
      const progress = clamp(state.flip.elapsed / state.flip.duration, 0, 1);
      const pulse = Math.sin(progress * Math.PI);
      context.save();
      if (state.reducedMotion) {
        context.globalAlpha = 0.055;
        context.fillStyle = state.flip.to === PROFILE_MODE ? "#fff1ac" : "#9bd9e4";
        context.fillRect(0, 0, viewportWidth, viewportHeight);
        context.globalAlpha = 0.08;
        context.strokeStyle = state.flip.to === PROFILE_MODE ? "#fff1ac" : "#9bd9e4";
        context.lineWidth = 2;
        context.strokeRect(1, 1, viewportWidth - 2, viewportHeight - 2);
        context.restore();
        return;
      }
      context.globalAlpha = pulse * 0.24;
      context.fillStyle = state.flip.to === PROFILE_MODE ? "#fff1ac" : "#9bd9e4";
      context.fillRect(0, 0, viewportWidth, viewportHeight);
      context.globalAlpha = pulse * 0.7;
      context.strokeStyle = "#fff8d2";
      context.lineWidth = 4;
      for (let offset = -viewportHeight; offset < viewportWidth + viewportHeight; offset += 52) {
        context.beginPath(); context.moveTo(offset + progress * 120, 0); context.lineTo(offset - viewportHeight + progress * 120, viewportHeight); context.stroke();
      }
      context.restore();
    }

    function render(context, viewportWidth = 960, viewportHeight = 624) {
      if (destroyed || !context) return;
      const cameraTarget = clamp(state.player.x + state.cameraLookAhead - viewportWidth * 0.38, 0, Math.max(0, level.width - viewportWidth));
      const cameraDelta = clamp(state.time - lastCameraTime, 0, MAX_FRAME_DELTA);
      lastCameraTime = state.time;
      state.cameraX = state.reducedMotion ? cameraTarget : approach(state.cameraX, cameraTarget, 7.5, cameraDelta);
      const cameraX = Math.round(state.cameraX);
      const impulseX = state.reducedMotion ? 0 : Number(state.cameraImpulseX || 0);
      const impulseY = state.reducedMotion ? 0 : Number(state.cameraImpulseY || 0);
      const flipProgress = state.flip && !state.reducedMotion
        ? Number(state.flip.geometryProgress || 0)
        : 0;
      const squeeze = state.reducedMotion || !state.flip ? 1 : 1 - Math.sin(flipProgress * Math.PI) * 0.08;
      const skew = state.reducedMotion || !state.flip ? 0 : Math.sin(flipProgress * Math.PI) * 0.025 * (state.flip.to === PROFILE_MODE ? -1 : 1);

      context.save();
      context.translate(viewportWidth / 2 + impulseX, impulseY);
      context.transform(squeeze, 0, skew, 1, 0, 0);
      context.translate(-viewportWidth / 2, 0);
      drawSky(context, viewportWidth, viewportHeight, cameraX);
      let drawCalls = 7;
      const isVisible = (x, width, margin) => x + width >= cameraX - margin
        && x <= cameraX + viewportWidth + margin;
      for (const building of level.buildings) {
        if (!isVisible(Number(building.x), Number(building.w || 72), 420)) continue;
        drawBuilding(context, building, cameraX, state.blend, flipProgress);
        drawCalls += 1;
      }
      for (const hazard of level.hazards) {
        if (!isVisible(Number(hazard.x), Number(hazard.w || 72), 80)) continue;
        drawHazard(context, hazard, cameraX);
        drawCalls += 1;
      }
      for (const platform of level.platforms) {
        const position = platformPosition(platform, state.time);
        if (!isVisible(position.x, Number(platform.w || 72), 100)) continue;
        drawPlatform(context, platform, cameraX, viewportWidth);
        drawCalls += 1;
      }
      for (const checkpoint of level.checkpoints) {
        if (!isVisible(Number(checkpoint.x), 30, 80)) continue;
        drawCheckpoint(context, checkpoint, cameraX);
        drawCalls += 1;
      }
      for (const barrier of level.barriers) {
        if (!isVisible(Number(barrier.x), Number(barrier.w || 72), 80)) continue;
        drawBarrier(context, barrier, cameraX);
        drawCalls += 1;
      }
      level.foldAnchors.forEach((anchor) => {
        if (anchor.x < cameraX - 80 || anchor.x > cameraX + viewportWidth + 80) return;
        const active = Math.abs(anchor.x - state.player.x) <= anchor.radius;
        context.save();
        context.globalAlpha = active ? 0.9 : 0.34;
        context.strokeStyle = state.mode === PROFILE_MODE ? "#f3d66b" : "#8fdae7";
        context.lineWidth = active ? 4 : 2;
        context.setLineDash([8, 7]);
        context.beginPath(); context.ellipse(anchor.x - cameraX, level.floorY - 5, 42, 12, 0, 0, Math.PI * 2); context.stroke();
        context.restore();
      });
      level.collectibles.forEach((collectible) => drawCollectible(context, collectible, cameraX));
      for (const animal of state.wildlife) {
        if (!isVisible(Number(animal.x), Number(animal.w || 72), 120)) continue;
        drawWildlife(context, animal, cameraX);
        drawCalls += 1;
      }
      for (const particle of visibleEntities(state.particles, cameraX, viewportWidth, 40)) {
        drawParticle(context, particle, cameraX);
        drawCalls += 1;
      }
      drawFlipPreview(context, cameraX);
      drawPlayer(context, cameraX);
      drawFlipOverlay(context, viewportWidth, viewportHeight);
      context.restore();
      if (root.document?.documentElement) {
        root.document.documentElement.dataset.perspectiveDrawCalls = String(drawCalls);
      }
    }

    function hud() {
      const anchor = anchorNearPlayer(state, level);
      const mission = missionData(state, level);
      const challenges = challengeData(state);
      const currentFlipStage = flipStage(state.flip);
      const preview = flipPreview(state, level);
      const signature = [state.mode, state.phase, state.pulses, state.collected.size, state.checkpointId,
        state.complete, state.goalLocked, anchor?.id || "", Math.floor(state.runTime * 10), state.tutorial,
        mission.id, mission.progress, state.wildlifeDiscovered.size, state.completedChallenges.size,
        state.flipCombo, state.bestFlipCombo, state.perfectLandings, currentFlipStage || "",
        preview?.safe ? preview.platformId : preview ? "unsafe" : "", Math.floor(state.paperFlow),
        state.flowTier, state.styleChain, Math.ceil(state.rushTimer * 10), state.paperRushes].join("|");
      lastHudSignature = signature;
      return {
        signature,
        mode: state.mode,
        modeLabel: state.mode === PROFILE_MODE ? "PERFIL 2D" : "DIORAMA",
        phase: state.phase,
        pulses: state.pulses,
        collected: state.collected.size,
        required: level.goal.requiredCollectibles,
        checkpointId: state.checkpointId,
        time: state.runTime,
        bestTime: state.bestTime,
        complete: state.complete,
        goalLocked: state.goalLocked,
        anchor: anchor?.label || "",
        tutorial: state.tutorial,
        visiblePokemon: visibleEntities(state.wildlife, state.cameraX, 960, 100).length,
        missionTitle: mission.title,
        objective: mission.objective,
        progress: mission.progress,
        stage: mission.stage,
        count: mission.count,
        missionObjective: mission.objective,
        missionProgress: mission.target > 0 ? clamp(mission.progress / mission.target, 0, 1) : 1,
        missionStage: mission.stage,
        missionCount: mission.count,
        mission,
        discoveries: state.wildlifeDiscovered.size,
        wildlifeTotal: state.wildlife.length,
        completedChallenges: OPTIONAL_CHALLENGES.filter(({ id }) => state.completedChallenges.has(id)).map(({ id }) => id),
        challengesCompleted: state.completedChallenges.size,
        challenges,
        flipCombo: state.flipCombo,
        bestFlipCombo: state.bestFlipCombo,
        perfectLandings: state.precisionLandingIds.size,
        paperFlow: state.paperFlow,
        flowTier: state.flowTier,
        flowLabel: state.flowLabel,
        styleChain: state.styleChain,
        bestStyleChain: state.bestStyleChain,
        rushTimer: state.rushTimer,
        paperRushes: state.paperRushes,
        flipStage: currentFlipStage,
        flipPreview: preview,
        particles: state.particles.length,
        maxParticles: MAX_PARTICLES,
      };
    }

    function moveToDebug(target = "start") {
      const points = {
        start: { x: level.spawn.x, y: level.spawn.y, checkpointId: "start", mode: DIORAMA_MODE, blend: 0, introSeen: false },
        flip: { x: level.introFlipX + 1, y: level.floorY - PLAYER_HEIGHT, checkpointId: "start", mode: DIORAMA_MODE, blend: 0, introSeen: false },
        checkpoint: { x: level.checkpoints[1]?.x || 1855, y: level.checkpoints[1]?.y || 462, checkpointId: level.checkpoints[1]?.id || "courtyard", mode: PROFILE_MODE, blend: 1, introSeen: true },
        goal: { x: level.goal.x - 145, y: level.floorY - PLAYER_HEIGHT, checkpointId: level.checkpoints.at(-1)?.id || "rooftops", mode: PROFILE_MODE, blend: 1, introSeen: true },
      };
      const point = points[target] || points.start;
      state.player.x = point.x; state.player.y = point.y; state.player.previousY = point.y;
      state.player.vx = 0; state.player.vy = 0; state.player.grounded = true;
      state.checkpointId = point.checkpointId; state.mode = point.mode; state.blend = point.blend;
      state.introSeen = point.introSeen; state.phase = point.introSeen ? "run" : "intro"; state.flip = null;
      state.collected.clear(); state.pulses = 3; state.complete = false; state.completionNotified = false;
      state.goalLocked = false; state.runTime = 0;
      state.wildlifeDiscovered.clear(); state.mission.completed.clear(); state.mission.currentIndex = 0;
      state.completedChallenges.clear(); state.precisionLandingIds.clear(); state.perfectLandings = 0; state.flipsCompleted = 0;
      state.flipComboAnchorIds.clear(); state.flipCombo = 0; state.bestFlipCombo = 0; state.flipComboTimer = 0;
      state.paperFlow = 0; state.styleChain = 0; state.bestStyleChain = 0; state.styleLastAction = null;
      state.styleTimer = 0; state.flowIdleTimer = 0; state.rushTimer = 0; state.paperRushes = 0; state.rushArmed = true;
      state.particles = []; state.springCooldowns = Object.create(null); state.springPulses = Object.create(null);
      state.springFlowId = null;
      state.cameraImpulseX = 0; state.cameraImpulseY = 0; state.checkpointPulse = 0;
      state.gateOpen = target === "goal" ? 1 : 0; state.goalCelebration = 0; refreshFlowPresentation(state);
      state.tutorial = point.introSeen
        ? "Salta con Espacio y pliega con Q junto a una bisagra."
        : "Sigue al Azahín por el diorama.";
      if (target === "goal") level.collectibles.forEach((collectible) => state.collected.add(collectible.id));
      return hud();
    }

    return Object.freeze({
      state,
      start() { running = true; return state; },
      stop() { running = false; return state; },
      step,
      render,
      resize() { return true; },
      destroy() { destroyed = true; running = false; imageCache.clear(); },
      snapshot() { return snapshotState(state); },
      hud,
      moveToDebug,
      get running() { return running; },
      get destroyed() { return destroyed; },
      get hudSignature() { return lastHudSignature; },
    });
  }

  root.PERSPECTIVE_ZONE_CORE = Object.freeze({
    VERSION,
    SNAPSHOT_VERSION,
    FIXED_STEP,
    MAX_FRAME_DELTA,
    MAX_PARTICLES,
    PARTICLE_LIMITS,
    PAPER_RUSH_THRESHOLD,
    PAPER_RUSH_REARM,
    PAPER_RUSH_DURATION,
    PROFILE_MODE,
    DIORAMA_MODE,
    PERSPECTIVE_FEATURES,
    FEATURES: PERSPECTIVE_FEATURES,
    FEATURE_GROUPS,
    FLIP_STAGES,
    MISSION_STEPS,
    OPTIONAL_CHALLENGES,
    DEFAULT_LEVEL,
    createState,
    advanceState,
    requestFlip,
    awardPaperFlow,
    paperRushSpeedMultiplier,
    safeFlipProjection,
    flipPreview,
    flipStage,
    buildingTransform,
    visibleEntities,
    resolveWildlifeGroundY,
    spawnParticles,
    missionData,
    challengeData,
    validateLevel,
    snapshotState,
    createRuntime,
    platformPosition,
    platformIsActive,
    platformVisualState,
  });
})(globalThis);
