import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const MODULE_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(MODULE_PATH), "..");

const EMPTY_INPUT = Object.freeze({
  left: false,
  right: false,
  up: false,
  down: false,
  run: false,
  jumpHeld: false,
  jumpPressed: false,
  flipPressed: false,
  restartPressed: false,
});

const EXPECTED_FEATURE_IDS = Object.freeze([
  "flip-four-phases",
  "flip-anticipation",
  "flip-fold",
  "flip-crossing",
  "flip-settle",
  "flip-cascade",
  "flip-safe-projection",
  "flip-input-lock",
  "flip-reduced-motion",
  "flip-persistent-nodes",
  "world-paper-layers",
  "world-paper-buildings",
  "world-depth-parallax",
  "world-fold-pivots",
  "world-contact-shadows",
  "world-reactive-grass",
  "world-particles-leaves",
  "world-particles-dust",
  "world-silhouette-echo",
  "world-camera-culling",
  "wildlife-grounded",
  "wildlife-side-facing",
  "wildlife-ground-y-config",
  "wildlife-grounding-config",
  "wildlife-lane-projection",
  "wildlife-stable-seed",
  "wildlife-bounded-roam",
  "wildlife-player-reaction",
  "wildlife-distance-lod",
  "wildlife-nonblocking",
  "player-coyote-time",
  "player-jump-buffer",
  "player-variable-jump",
  "player-fixed-step-input",
  "player-fall-speed-cap",
  "player-moving-platform-carry",
  "player-fast-respawn",
  "player-checkpoints",
  "player-flip-preview",
  "player-accessibility-assist",
  "mission-chain-five-steps",
  "mission-chain-progress",
  "mission-three-challenges",
  "mission-optional-objectives",
  "mission-reward-celebration",
  "persistence-versioned",
  "persistence-checkpoint",
  "performance-spatial-culling",
  "performance-pooled-particles",
  "performance-frame-budget",
]);

function scriptSources(markup) {
  return [...markup.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)]
    .map((match) => match[1].split("?")[0]);
}

function stylesheetSources(markup) {
  return [...markup.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1].split("?")[0]);
}

function levelFromRecord(record) {
  return record?.config?.perspective?.level
    || record?.config?.perspectiveLevel
    || record?.config?.minigame?.level
    || record?.layout?.perspectiveLevel
    || record?.layout?.level
    || null;
}

function validationPassed(result) {
  return result === true || result?.valid === true;
}

function validationDetails(result) {
  if (!result || typeof result !== "object") return [];
  return [result.errors, result.failures, result.diagnostics]
    .flatMap((entries) => Array.isArray(entries) ? entries : [])
    .map((entry) => typeof entry === "string" ? entry : entry?.message || JSON.stringify(entry));
}

function publicFeatureManifest(core) {
  if (Array.isArray(core?.FEATURES)) return core.FEATURES;
  if (Array.isArray(core?.PERSPECTIVE_FEATURES)) return core.PERSPECTIVE_FEATURES;
  return null;
}

function firstRecordArray(...candidates) {
  return candidates.find(Array.isArray) || [];
}

function recordsHaveUniqueIds(records) {
  const ids = records.map((record) => typeof record?.id === "string" ? record.id.trim() : "");
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function wildlifeBehaviorId(animal) {
  const behavior = animal?.behavior;
  if (typeof behavior === "string") return behavior.trim().toLowerCase();
  if (!behavior || typeof behavior !== "object") return "";
  const id = behavior.id ?? behavior.type ?? behavior.mode ?? behavior.name;
  return typeof id === "string" ? id.trim().toLowerCase() : "";
}

function hasWildlifeGroundingConfig(animal) {
  if (Number.isFinite(animal?.groundY)) return true;
  const grounding = animal?.grounding;
  if (Number.isFinite(grounding)) return true;
  if (typeof grounding === "string") return grounding.trim().length > 0;
  return Boolean(grounding && typeof grounding === "object");
}

function resolvedGroundY(value) {
  if (Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") return NaN;
  for (const key of ["groundY", "shadowY", "bodyY", "y"]) {
    if (Number.isFinite(value[key])) return value[key];
  }
  return NaN;
}

function finiteNumbers(value, numbers = [], seen = new Set()) {
  if (typeof value === "number") numbers.push(value);
  else if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    if (Array.isArray(value) || value instanceof Set) {
      for (const entry of value) finiteNumbers(entry, numbers, seen);
    } else {
      for (const entry of Object.values(value)) finiteNumbers(entry, numbers, seen);
    }
  }
  return numbers;
}

async function executeClassicScript(context, root, relativePath) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

async function loadRealGameData(root, core, html) {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);

  for (const relativePath of [
    "map-registry.js",
    "map-editor-rules.js",
    "map-editor-data.js",
    "assets/generated/san-pablo-neighborhood/catalog.js",
    "map-layout.js",
    "map-data.js",
    "maps/san-pablo/register.js",
  ]) await executeClassicScript(context, root, relativePath);

  const packageScripts = scriptSources(html)
    .filter((source) => source.startsWith("maps/pradera-bifaz/"));
  for (const relativePath of packageScripts) await executeClassicScript(context, root, relativePath);
  sandbox.PERSPECTIVE_ZONE_CORE = core;
  return { packageScripts, sandbox };
}

function adoptState(current, result) {
  return result && typeof result === "object" && result.player ? result : current;
}

export async function validatePerspectiveMinigame({ root = DEFAULT_ROOT } = {}) {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const [html, runtimeSource, coreSource] = await Promise.all([
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "perspective-zone-core.js"), "utf8"),
  ]);
  const perspectiveStylesheet = stylesheetSources(html).find((source) => /perspective-zone\.css$/i.test(source));
  check(Boolean(perspectiveStylesheet), "index.html no enlaza perspective-zone.css.");
  const styles = perspectiveStylesheet
    ? await readFile(path.join(root, perspectiveStylesheet), "utf8")
    : "";

  await import(pathToFileURL(path.join(root, "perspective-zone-core.js")).href);
  const core = globalThis.PERSPECTIVE_ZONE_CORE;
  check(Boolean(core), "perspective-zone-core.js no publicó PERSPECTIVE_ZONE_CORE.");
  if (!core) return { valid: false, failures, summary: null };

  check(Number.isFinite(Number(core.VERSION)) && Number(core.VERSION) >= 2, "PERSPECTIVE_ZONE_CORE.VERSION debe ser 2 o superior.");
  const featureManifest = publicFeatureManifest(core);
  check(Boolean(featureManifest), "El core debe publicar FEATURES o PERSPECTIVE_FEATURES como array.");
  const featureIds = (featureManifest || []).filter((id) => typeof id === "string" && id.trim());
  const uniqueFeatureIds = new Set(featureIds);
  if (featureManifest) {
    check(featureManifest.length === EXPECTED_FEATURE_IDS.length, `El manifiesto v2 debe contener exactamente ${EXPECTED_FEATURE_IDS.length} entradas.`);
    check(featureIds.length === featureManifest.length, "Todas las entradas del manifiesto v2 deben ser IDs de texto no vacíos.");
    check(uniqueFeatureIds.size === EXPECTED_FEATURE_IDS.length, `El manifiesto v2 debe contener exactamente ${EXPECTED_FEATURE_IDS.length} IDs únicos.`);
    const missingFeatureIds = EXPECTED_FEATURE_IDS.filter((id) => !uniqueFeatureIds.has(id));
    const unexpectedFeatureIds = featureIds.filter((id) => !EXPECTED_FEATURE_IDS.includes(id));
    check(missingFeatureIds.length === 0, `Faltan mejoras v2: ${missingFeatureIds.join(", ")}.`);
    check(unexpectedFeatureIds.length === 0, `Hay IDs de mejora no documentados: ${unexpectedFeatureIds.join(", ")}.`);
  }

  const requiredFunctions = [
    "createState",
    "advanceState",
    "requestFlip",
    "buildingTransform",
    "visibleEntities",
    "validateLevel",
    "snapshotState",
    "createRuntime",
  ];
  for (const name of requiredFunctions) check(typeof core[name] === "function", `Falta la función pública ${name}.`);
  check(Number.isFinite(core.FIXED_STEP) && core.FIXED_STEP > 0, "FIXED_STEP debe ser finito y positivo.");

  const { packageScripts, sandbox } = await loadRealGameData(root, core, html);
  const registry = sandbox.GAME_MAP_REGISTRY;
  const city = registry?.get("san-pablo");
  const record = registry?.get("pradera-bifaz");
  check(packageScripts.length >= 1, "index.html no enlaza ningún script del paquete maps/pradera-bifaz/.");
  check(Boolean(record), "pradera-bifaz no está registrada en GAME_MAP_REGISTRY.");
  check(Boolean(city), "San Pablo no se pudo cargar desde sus datos reales.");
  if (!record) return { valid: false, failures, summary: null };

  check(record.config?.perspective?.runtimeVersion === 2, "config.perspective.runtimeVersion debe ser 2.");
  check(record.config?.revision === 2, "config.revision debe ser 2.");
  check(record.layout?.revision === 2, "layout.revision debe ser 2.");
  check(Number(core.VERSION) >= Number(record.config?.perspective?.runtimeVersion), "El core no satisface la versión de runtime solicitada por el mapa.");

  const level = levelFromRecord(record);
  check(Boolean(level), "El mapa no enlaza un nivel de perspectiva explícito.");
  if (!level) return { valid: false, failures, summary: null };

  const levelReport = core.validateLevel(level);
  check(validationPassed(levelReport), `El nivel no supera validateLevel: ${validationDetails(levelReport).join(" | ")}`);
  const unreachable = levelReport?.unreachable
    || levelReport?.reachability?.unreachable
    || levelReport?.reachability?.missing;
  if (Array.isArray(unreachable)) check(unreachable.length === 0, `Hay objetivos no alcanzables: ${unreachable.join(", ")}.`);
  const goalReachable = levelReport?.goalReachable
    ?? levelReport?.reachability?.goalReachable
    ?? levelReport?.stats?.goalReachable;
  if (goalReachable != null) check(goalReachable === true, "La meta final no es alcanzable según validateLevel.");

  const missions = firstRecordArray(
    level.missions,
    level.missionSteps,
    level.missionChain?.steps,
    core.MISSION_STEPS,
    core.MISSIONS,
  );
  const challenges = firstRecordArray(
    level.challenges,
    level.optionalChallenges,
    core.OPTIONAL_CHALLENGES,
    core.CHALLENGES,
  );
  check(missions.length >= 5, "El contrato v2 necesita al menos cinco misiones definidas como datos.");
  check(recordsHaveUniqueIds(missions), "Las misiones necesitan IDs de texto únicos.");
  check(challenges.length >= 3, "El contrato v2 necesita al menos tres retos definidos como datos.");
  check(recordsHaveUniqueIds(challenges), "Los retos necesitan IDs de texto únicos.");

  check(Array.isArray(level.platforms) && level.platforms.length >= 8, "El nivel necesita al menos ocho plataformas.");
  check(Array.isArray(level.buildings) && level.buildings.length >= 3, "El nivel necesita tres edificios transformables.");
  check(Array.isArray(level.wildlife) && level.wildlife.length >= 3 && level.wildlife.length <= 12, "La fauna inicial debe contener entre 3 y 12 criaturas.");
  check(Array.isArray(level.checkpoints) && level.checkpoints.length >= 2, "El nivel necesita al menos dos checkpoints.");
  const floatingWildlife = (level.wildlife || []).filter((animal) => wildlifeBehaviorId(animal) === "float");
  check(floatingWildlife.length === 0, `La fauna no puede usar behavior "float": ${floatingWildlife.map((animal) => animal.id).join(", ")}.`);
  const groundingHelper = typeof core.resolveWildlifeGroundY === "function" ? core.resolveWildlifeGroundY : null;
  const configuredWildlife = (level.wildlife || []).every(hasWildlifeGroundingConfig);
  check(configuredWildlife || Boolean(groundingHelper), "Cada criatura necesita groundY/grounding configurable o el helper público resolveWildlifeGroundY.");
  if (groundingHelper && typeof core.createState === "function") {
    try {
      const groundingState = core.createState(level);
      const runtimeWildlife = Array.isArray(groundingState?.wildlife) ? groundingState.wildlife : level.wildlife;
      for (const animal of runtimeWildlife || []) {
        const groundY = resolvedGroundY(groundingHelper(animal, groundingState, level, 0));
        check(Number.isFinite(groundY), `resolveWildlifeGroundY no resolvió un apoyo finito para ${animal.id || animal.species || "fauna"}.`);
      }
      check((runtimeWildlife || []).every((animal) => animal.grounded === true), "La fauna creada por el runtime debe permanecer aterrizada.");
    } catch (error) {
      failures.push(`No se pudo comprobar el apoyo de la fauna: ${error?.message || error}.`);
    }
  }
  for (const animal of level.wildlife || []) {
    try {
      await access(path.join(root, animal.sprite));
    } catch {
      failures.push(`No existe el sprite de ${animal.id || animal.species || "fauna"}: ${animal.sprite || "ruta ausente"}.`);
    }
  }

  const cityEntry = [
    ...(city?.config?.events || []),
    ...(city?.config?.doors || []),
    ...(city?.config?.entrances || []),
  ].find((event) => event.targetMap === "pradera-bifaz");
  check(Boolean(cityEntry), "map-data.js no contiene una entrada desde San Pablo.");
  check(record.config.perspective?.returnMap === "san-pablo", "Pradera Bifaz no ofrece una salida de regreso a San Pablo.");
  check(Number.isFinite(Number(record.config.perspective?.returnX)) && Number.isFinite(Number(record.config.perspective?.returnY)), "El regreso no tiene coordenadas válidas.");

  const sources = scriptSources(html);
  const coreIndex = sources.indexOf("perspective-zone-core.js");
  const gameIndex = sources.indexOf("script.js");
  check(coreIndex >= 0 && coreIndex < gameIndex, "El núcleo debe cargarse antes de script.js.");
  check(packageScripts.every((source) => {
    const index = sources.indexOf(source);
    return index >= 0 && index < coreIndex && coreIndex < gameIndex;
  }), "Los datos de Pradera Bifaz deben cargarse antes del núcleo y de script.js.");
  check(/id=["']perspectiveHud["']/i.test(html), "Falta perspectiveHud.");
  check(/id=["']perspectiveMode(?:Label)?["']/i.test(html), "Falta la etiqueta accesible de modo.");
  check(/id=["']perspectivePulses["']/i.test(html), "Falta el contador de pulsos.");
  check(/data-(?:perspective-)?action=["'](?:flip|perspective)["']/i.test(html), "Falta el control táctil de giro.");
  check(/data-(?:perspective-)?action=["']jump["']/i.test(html), "Falta el control táctil de salto.");
  check(/\.perspective-hud\b/.test(styles), "Faltan los estilos del HUD de perspectiva.");
  check(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.perspective-/i.test(styles), "Movimiento reducido no cubre la zona de perspectiva.");
  check(/PERSPECTIVE_ZONE_CORE/.test(runtimeSource) && /createRuntime\s*\(/.test(runtimeSource), "script.js no delega en createRuntime.");
  check(/bindPerspectiveTouchControl/.test(runtimeSource) && /\[data-perspective-action\]/.test(runtimeSource), "Los controles táctiles no están enlazados al runtime.");
  check(/perspectiveExitButton\?\.addEventListener\(["']click["']/.test(runtimeSource), "El botón de salida no está enlazado.");
  check(/visibilitychange[\s\S]*perspectiveZoneRuntime\?\.stop\(\)/.test(runtimeSource), "El runtime no se suspende al ocultar la pestaña.");
  check(!/function\s+(?:advanceState|requestFlip|buildingTransform|visibleEntities)\s*\(/.test(runtimeSource), "script.js duplica responsabilidades del núcleo.");
  check(!/getImageData\s*\(/.test(coreSource), "El núcleo usa getImageData durante el juego.");

  if (requiredFunctions.every((name) => typeof core[name] === "function")) {
    let first = core.createState(level);
    let second = core.createState(level);
    const advance = (state, input, dt = core.FIXED_STEP) => adoptState(
      state,
      core.advanceState(state, { ...EMPTY_INPUT, ...input }, dt, level),
    );

    for (let frame = 0; frame < 1_800; frame += 1) {
      const input = frame % 360 < 180
        ? { right: true, run: frame % 120 < 60, jumpPressed: frame % 150 === 0, jumpHeld: frame % 150 < 12 }
        : { left: true };
      first = advance(first, input);
      second = advance(second, input);
    }
    check(finiteNumbers(first).every(Number.isFinite), "La simulación de 30 segundos produjo NaN o infinito.");
    check(JSON.stringify(core.snapshotState(first)) === JSON.stringify(core.snapshotState(second)), "Dos simulaciones idénticas divergen.");
    check(first.wildlife.length === level.wildlife.length, "La fauna se multiplicó o desapareció durante la simulación.");

    const initialMode = first.mode;
    const targetMode = initialMode === "perfil" ? "diorama" : "perfil";
    first = adoptState(first, core.requestFlip(first, targetMode, level, { forced: true }));
    for (let frame = 0; frame < 180 && (first.mode !== targetMode || first.flip || first.phase === "flipping"); frame += 1) {
      first = advance(first, EMPTY_INPUT);
    }
    check(first.mode === targetMode && !first.flip && first.phase !== "flipping", "El giro no termina en tres segundos simulados.");
    check(finiteNumbers(first).every(Number.isFinite), "El giro produjo NaN o infinito.");

    for (const building of level.buildings) {
      for (const blend of [0, 0.25, 0.5, 0.75, 1]) {
        const transform = core.buildingTransform(building, blend, blend);
        const numbers = finiteNumbers(transform);
        check(numbers.length >= 2 && numbers.every(Number.isFinite), `Transformación inválida en ${building.id || "edificio"} @ ${blend}.`);
      }
    }

    const culled = core.visibleEntities([
      { id: "izquierda", x: -1_000, width: 20, w: 20 },
      { id: "visible", x: 100, width: 20, w: 20 },
      { id: "derecha", x: 2_000, width: 20, w: 20 },
    ], 0, 320, 32);
    check(culled.length === 1 && culled[0].id === "visible", "visibleEntities no recorta correctamente el viewport.");

    const serialized = JSON.stringify(core.snapshotState(first));
    check(serialized.length > 2 && !serialized.includes("null,null"), "El snapshot no es serializable o contiene valores no finitos.");
  }

  return {
    valid: failures.length === 0,
    failures,
    summary: {
      buildings: level.buildings?.length || 0,
      challenges: challenges.length,
      checkpoints: level.checkpoints?.length || 0,
      features: uniqueFeatureIds.size,
      mapId: record.id,
      missions: missions.length,
      platforms: level.platforms?.length || 0,
      version: core.VERSION,
      wildlife: level.wildlife?.length || 0,
    },
  };
}

if (path.resolve(process.argv[1] || "") === path.resolve(MODULE_PATH)) {
  try {
    const report = await validatePerspectiveMinigame();
    if (!report.valid) {
      for (const failure of report.failures) console.error(`ERROR: ${failure}`);
      process.exitCode = 1;
    } else {
      const { platforms, buildings, wildlife, checkpoints, missions, challenges, features, version } = report.summary;
      console.log(`OK: Pradera Bifaz v${version}; ${features} mejoras, ${missions} misiones, ${challenges} retos, ${platforms} plataformas, ${buildings} edificios, ${wildlife} criaturas y ${checkpoints} checkpoints validados con datos reales.`);
    }
  } catch (error) {
    console.error(`ERROR: ${error?.stack || error}`);
    process.exitCode = 1;
  }
}
