import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const [html, runtimeSource, coreSource, guideSource] = await Promise.all([
  readFile(path.join(ROOT, "index.html"), "utf8"),
  readFile(path.join(ROOT, "script.js"), "utf8"),
  readFile(path.join(ROOT, "perspective-zone-core.js"), "utf8"),
  readFile(path.join(ROOT, "PRADERA-BIFAZ.md"), "utf8"),
]);

function scriptSources(markup) {
  return [...markup.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)]
    .map((match) => match[1].split("?")[0]);
}

function stylesheetSources(markup) {
  return [...markup.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1].split("?")[0]);
}

const perspectiveStylesheet = stylesheetSources(html).find((source) => /perspective-zone\.css$/i.test(source));
assert.ok(perspectiveStylesheet, "index.html debe enlazar perspective-zone.css");
const styles = await readFile(path.join(ROOT, perspectiveStylesheet), "utf8");

const PERSPECTIVE_CORE_FIXTURE = {
  DEFAULT_LEVEL: {
    collectibles: [{ id: "seal-canopy" }, { id: "seal-depth" }, { id: "seal-rooftop" }],
    wildlife: [{ id: "azahin-guide" }, { id: "serranin-hopper" }],
    checkpoints: [{ id: "start" }, { id: "courtyard" }, { id: "rooftops" }],
    challenges: [{ id: "naturalista" }, { id: "acrobata" }, { id: "origamista" }, { id: "virtuoso" }],
    platforms: [{ id: "meadow-start", precision: true }, { id: "roof-west", precision: true }],
    foldAnchors: [{ id: "anchor-west" }, { id: "anchor-east" }],
  },
};

function evaluateBifazSchema(input, expression, perspectiveCore = undefined) {
  const schemaStart = runtimeSource.indexOf("const BIFAZ_PROGRESS_VERSION");
  const schemaEnd = runtimeSource.indexOf("let state = defaultState();", schemaStart);
  assert.ok(schemaStart >= 0 && schemaEnd > schemaStart, "no se pudo aislar el adaptador persistente de Bifaz");
  const sandbox = { input, PERSPECTIVE_ZONE_CORE: perspectiveCore };
  vm.runInNewContext(`
    const MAP_REVISION = 1;
    const NORMAL_START = { x: 160, y: 462, direction: "right" };
    const ACTIVE_MAP_ID = "pradera-bifaz";
    ${runtimeSource.slice(schemaStart, schemaEnd)}
    globalThis.output = ${expression};
  `, sandbox, { filename: "perspective-zone-persistence-adapter.js" });
  return JSON.parse(JSON.stringify(sandbox.output));
}

function normalizeSavedBifaz(input, perspectiveCore = undefined) {
  return evaluateBifazSchema(input, "normalizeBifazProgress(input)", perspectiveCore);
}

function bifazMissionProgress(normalized, raw, target, fallback = 0) {
  return evaluateBifazSchema(
    { normalized, raw, target, fallback },
    "bifazMissionProgress(input.normalized, input.raw, input.target, input.fallback)",
  );
}

function awardBifazRewards(initialState) {
  const start = runtimeSource.indexOf("function awardBifazRewards()");
  const end = runtimeSource.indexOf("function handlePerspectiveZoneEvent", start);
  assert.ok(start >= 0 && end > start, "no se pudo aislar el contrato de recompensas Bifaz");
  const sandbox = { state: structuredClone(initialState) };
  vm.runInNewContext(`
    const BIFAZ_CHALLENGE_IDS = Object.freeze(["naturalista", "acrobata", "origamista", "virtuoso"]);
    ${runtimeSource.slice(start, end)}
    const first = awardBifazRewards();
    const second = awardBifazRewards();
    state.perspectiveZone.completedChallenges.push("virtuoso");
    const late = awardBifazRewards();
    globalThis.output = { state, first, second, late };
  `, sandbox, { filename: "perspective-zone-rewards-adapter.js" });
  return JSON.parse(JSON.stringify(sandbox.output));
}

function perspectiveLevel(record) {
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

async function execute(context, relativePath) {
  const source = await readFile(path.join(ROOT, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

async function loadRealMapData() {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    structuredClone,
    performance,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);

  for (const relativePath of [
    "map-registry.js",
    "map-geography.js",
    "map-editor-rules.js",
    "map-editor-data.js",
    "assets/generated/san-pablo-neighborhood/catalog.js",
    "map-layout.js",
    "map-data.js",
    "maps/san-pablo/register.js",
  ]) await execute(context, relativePath);

  const packageScripts = scriptSources(html)
    .filter((source) => source.startsWith("maps/pradera-bifaz/"));
  assert.ok(packageScripts.length >= 1, "index.html debe cargar el paquete pradera-bifaz");
  for (const source of packageScripts) await execute(context, source);
  await execute(context, "perspective-zone-core.js");
  return sandbox;
}

test("el descriptor puede cargarse antes del core y resuelve el nivel de forma diferida", async () => {
  const sandbox = { console };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  await execute(context, "map-registry.js");
  await execute(context, "maps/pradera-bifaz/editor-data.js");
  await execute(context, "maps/pradera-bifaz/map.js");

  const record = sandbox.GAME_MAP_REGISTRY.get("pradera-bifaz");
  assert.ok(record);
  assert.equal(record.config.runtime, "perspective-platformer-v1");
  assert.deepEqual({ width: record.config.width, height: record.config.height }, { width: 5400, height: 624 });
  assert.deepEqual(
    { x: record.config.spawn.x, y: record.config.spawn.y, direction: record.config.spawn.direction },
    { x: 160, y: 462, direction: "right" },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(record.config.perspective)),
    { returnMap: "san-pablo", returnX: 2128, returnY: 2288, returnDirection: "down", runtimeVersion: 2 },
  );
  assert.equal(record.config.perspective.level, null);
  assert.equal(Object.keys(record.config.perspective).includes("level"), false);
  assert.equal(JSON.stringify(record.config.perspective).includes("level"), false);

  const deferredLevel = Object.freeze({ id: "deferred-level" });
  sandbox.PERSPECTIVE_ZONE_CORE = { DEFAULT_LEVEL: deferredLevel };
  assert.equal(record.config.perspective.level, deferredLevel);
});

test("Pradera Bifaz se registra con su nivel real y una salida segura", async () => {
  const sandbox = await loadRealMapData();
  const record = sandbox.GAME_MAP_REGISTRY.get("pradera-bifaz");
  assert.ok(record, "GAME_MAP_REGISTRY debe publicar pradera-bifaz");
  assert.equal(record.config.id, "pradera-bifaz");
  assert.ok(["minigame", "platformer", "special"].includes(record.config.kind));

  const level = perspectiveLevel(record);
  assert.ok(level, "el paquete debe enlazar explícitamente el nivel, no recrearlo en script.js");
  const report = sandbox.PERSPECTIVE_ZONE_CORE.validateLevel(level);
  const diagnostics = report?.errors || report?.failures || [];
  assert.equal(validationPassed(report), true, diagnostics.join?.("\n") || String(diagnostics));

  assert.ok(Array.isArray(level.platforms) && level.platforms.length >= 8, "falta una ruta de plataformeo suficiente");
  assert.ok(Array.isArray(level.buildings) && level.buildings.length >= 3, "los edificios deben participar en el giro");
  assert.ok(Array.isArray(level.wildlife) && level.wildlife.length >= 3, "la pradera necesita fauna ambiental");
  assert.ok(Array.isArray(level.checkpoints) && level.checkpoints.length >= 2, "la zona necesita puntos de control");
  assert.ok(new Set(level.wildlife.map((animal) => animal.species)).size >= 3, "la fauna necesita variedad visual");
  await Promise.all(level.wildlife.map((animal) => access(path.join(ROOT, animal.sprite))));

  const perspective = record.config.perspective;
  assert.equal(perspective.returnMap, "san-pablo", "la zona debe permitir volver a San Pablo");
  assert.ok(Number.isFinite(Number(perspective.returnX)) && Number.isFinite(Number(perspective.returnY)));
  assert.ok(["up", "down", "left", "right"].includes(perspective.returnDirection));
});

test("San Pablo contiene una entrada jugable y coherente con el spawn de la zona", async () => {
  const sandbox = await loadRealMapData();
  const city = sandbox.GAME_MAP_REGISTRY.get("san-pablo");
  const zone = sandbox.GAME_MAP_REGISTRY.get("pradera-bifaz");
  const entry = [...(city.config.events || []), ...(city.config.doors || []), ...(city.config.entrances || [])]
    .find((event) => event.targetMap === "pradera-bifaz");

  assert.ok(entry, "map-data.js debe incluir una transición a pradera-bifaz");
  assert.equal(entry.id, "pradera-bifaz-gate", "la entrada necesita un ID estable para el editor");
  assert.equal(entry.type || entry.action, "transition");
  assert.ok(["interact", "step"].includes(entry.trigger || "interact"));
  assert.ok(Number.isFinite(Number(entry.col)) && Number.isFinite(Number(entry.row)));
  assert.ok(Number.isFinite(Number(entry.targetX)) && Number.isFinite(Number(entry.targetY)));
  assert.ok(Math.abs(Number(entry.targetX) - Number(zone.config.spawn.x)) <= 1);
  assert.ok(Math.abs(Number(entry.targetY) - Number(zone.config.spawn.y)) <= 1);
  assert.equal(entry.linkedAssetId, "southeast-services", "la señal debe quedar ligada a su edificio");

  const editable = city.editorData.entrances
    .find((candidate) => candidate.id === "pradera-bifaz-gate");
  assert.ok(editable, "la entrada de Pradera Bifaz debe persistirse en las puertas del modo edición");
  assert.deepEqual(
    JSON.parse(JSON.stringify(editable)),
    {
      id: "pradera-bifaz-gate",
      scene: "world",
      col: 67,
      row: 73,
      label: "Pabellón Bifaz",
      action: "transition",
      targetMap: "pradera-bifaz",
      targetX: 160,
      targetY: 462,
      targetDirection: "right",
      effect: "fade",
      linkedAssetId: "southeast-services",
    },
  );
});

test("la entrada se reconoce desde el mundo, el minimapa y el panel de puertas", () => {
  assert.match(html, /id=["']perspectiveGateGuide["']/i);
  assert.match(html, /id=["']perspectiveGateGuideDistance["']/i);
  assert.match(html, /id=["']perspectiveGateAnnouncer["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/i);
  assert.match(html, /id=["']focusPerspectiveEntranceButton["']/i);
  assert.match(html, /data-entrance-template=["']pradera-bifaz["']/i);
  assert.match(html, /<option value=["']pradera-bifaz["']/i);
  assert.match(runtimeSource, /function currentPerspectiveGate\s*\(/);
  assert.match(runtimeSource, /function drawPerspectiveGateWayfinder\s*\(/);
  assert.match(runtimeSource, /function updatePerspectiveGateGuide\s*\(/);
  assert.match(runtimeSource, /perspectiveGateWayfinder/);
  assert.match(runtimeSource, /targetMap\s*===\s*["']pradera-bifaz["']/);
  assert.match(runtimeSource, /const interaction = distanceToGate[\s\S]*?nearbyMapInteraction\(\)/);
  assert.match(runtimeSource, /interaction\?\.id === ["']map_entrance["']/);
  assert.match(runtimeSource, /fillStyle = ["']#6de0e1["'][\s\S]*?fillStyle = ["']#f4d468["']/);
  assert.match(runtimeSource, /perspectiveGateDiagnostics/);
  assert.match(styles, /\.perspective-gate-guide\b/);
  assert.match(styles, /\.perspective-gate-guide-mark\b/);
  assert.match(styles, /--gate-direction[\s\S]*?- 90deg/);
});

test("index carga paquete, núcleo y adaptador antes del juego y ofrece HUD accesible", async () => {
  const sources = scriptSources(html);
  const coreIndex = sources.indexOf("perspective-zone-core.js");
  const packageIndices = sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => source.startsWith("maps/pradera-bifaz/"));
  const adapter = sources.find((source) => /perspective-zone(?!-core).*\.js$/i.test(source));
  const gameIndex = sources.indexOf("script.js");

  assert.ok(coreIndex >= 0, "falta perspective-zone-core.js en index.html");
  assert.ok(stylesheetSources(html).includes("perspective-zone.css"));
  assert.ok(packageIndices.length >= 1, "falta el paquete de mapa pradera-bifaz");
  assert.ok(packageIndices.every(({ index }) => index < coreIndex && coreIndex < gameIndex));
  if (adapter) assert.ok(sources.indexOf(adapter) < gameIndex, "el adaptador debe inicializarse antes de script.js");

  assert.match(html, /id=["']perspectiveHud["']/i);
  assert.match(html, /id=["']perspectiveMode(?:Label)?["']/i);
  assert.match(html, /id=["']perspectivePulses["']/i);
  assert.doesNotMatch(html, /id=["']perspectiveHud["'][^>]*aria-live/i);
  assert.match(html, /id=["']perspectiveAnnouncer["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/i);
  assert.match(runtimeSource, /perspectiveA11ySignature/);
  assert.match(html, /data-(?:perspective-)?action=["'](?:flip|perspective)["']/i);
  assert.match(html, /data-(?:perspective-)?action=["']jump["']/i);

  for (const source of packageIndices.map(({ source }) => source)) await access(path.join(ROOT, source));
});

test("script.js actúa como adaptador estrecho y delega física, giro y snapshot", () => {
  assert.match(runtimeSource, /PERSPECTIVE_ZONE_CORE/);
  assert.match(runtimeSource, /createRuntime\s*\(/);
  assert.match(runtimeSource, /perspective-platformer-v1/);
  assert.match(runtimeSource, /(?:snapshotState|perspective[A-Za-z0-9_$]*\.?snapshot)\s*\(/i);
  assert.match(runtimeSource, /(?:enter|start|setup|ensure)PerspectiveZone(?:Runtime)?\s*\(/i);
  assert.match(runtimeSource, /(?:leave|stop|teardown)PerspectiveZone\s*\(/i);
  assert.match(runtimeSource, /function bindPerspectiveTouchControl\s*\(/);
  assert.match(runtimeSource, /\$\$\(["']\[data-perspective-action\]["']\)\.forEach\(bindPerspectiveTouchControl\)/);
  assert.match(runtimeSource, /perspectiveExitButton\?\.addEventListener\(["']click["']/);
  assert.match(runtimeSource, /function handlePerspectiveKeyDown\s*\(/);
  assert.match(runtimeSource, /visibilitychange[\s\S]*perspectiveZoneRuntime\?\.stop\(\)[\s\S]*syncPerspectiveProgress/);
  assert.match(runtimeSource, /pokemon-map-transfer-destination/);
  assert.match(runtimeSource, /nearestOpenCityTarget\(resumeDestination\.x,\s*resumeDestination\.y\)/);
  assert.doesNotMatch(runtimeSource, /function\s+(?:advanceState|requestFlip|buildingTransform|visibleEntities)\s*\(/);

  const featureFunctions = [...runtimeSource.matchAll(/function\s+[A-Za-z0-9_$]*perspective[A-Za-z0-9_$]*\s*\(/gi)];
  assert.ok(featureFunctions.length <= 16, "la lógica del minijuego se está filtrando al runtime general");
});

test("la presentación tiene capas propias, pistas no cromáticas y culling visual", () => {
  assert.match(styles, /\.perspective-hud\b/);
  assert.match(styles, /\.world-screen\.perspective-mode\b/);
  assert.match(styles, /\.perspective-hud\[data-mode=["']diorama["']\]/i);
  assert.match(coreSource, /modeLabel:\s*state\.mode\s*===\s*PROFILE_MODE\s*\?\s*["']PERFIL 2D["']\s*:\s*["']DIORAMA["']/);
  assert.match(coreSource, /visibleEntities\s*\(/);
  assert.doesNotMatch(coreSource, /getImageData\s*\(/);
  assert.match(styles, /\.perspective-hud small\s*\{[^}]*font-size:\s*\.68rem/i);
  assert.match(styles, /\.perspective-hud\s*>\s*p\s*\{[^}]*font-size:\s*\.72rem/i);
  assert.match(styles, /\.perspective-touch-controls button\s*>\s*small\s*\{[^}]*font-size:\s*\.6rem/i);
  assert.doesNotMatch(styles, /\.perspective-hud\s*\{[^}]*transform:\s*scale\(/i);
});

test("movimiento reducido elimina giro, sacudida y parallax sin ocultar el modo", () => {
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.perspective-/i);
  assert.match(runtimeSource, /prefersReducedMotion|prefers-reduced-motion/);
  assert.match(runtimeSource, /reducedMotion/);
  assert.match(styles, /\.perspective-[^{]+\{[^}]*(?:animation\s*:\s*none|transition-duration\s*:\s*(?:0|\.0?1)s)/i);
});

test("el HUD v2.1 presenta misión, Flujo y cuatro insignias sin mezclar el aria-live", () => {
  for (const id of [
    "perspectiveMissionTitle", "perspectiveMissionObjective", "perspectiveMissionProgress",
    "perspectiveMissionStage", "perspectiveMissionCount", "perspectiveDiscoveries",
    "perspectiveWildlifeTotal", "perspectiveFlipCombo", "perspectiveBestFlipCombo",
    "perspectivePerfectLandings", "perspectiveChallenges", "perspectiveFlowTrack",
    "perspectiveFlowBar", "perspectiveFlowTier", "perspectiveStyleChain", "perspectiveBestStyleChain",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`, "i"), `falta #${id}`);

  assert.match(html, /id=["']perspectiveMissionProgressTrack["'][^>]*role=["']progressbar["']/i);
  assert.match(html, /data-challenge-id=["']naturalista["'][\s\S]*Naturalista/i);
  assert.match(html, /data-challenge-id=["']acrobata["'][\s\S]*Acróbata/i);
  assert.match(html, /data-challenge-id=["']origamista["'][\s\S]*Origamista/i);
  assert.match(html, /data-challenge-id=["']virtuoso["'][\s\S]*Virtuoso/i);
  assert.match(html, /id=["']perspectiveFlowTrack["'][^>]*role=["']progressbar["'][^>]*aria-valuemax=["']100["']/i);
  assert.match(styles, /\.perspective-mission\b/);
  assert.match(styles, /\.perspective-mission-track\b/);
  assert.match(styles, /\.perspective-challenges\s+li\[data-complete=["']true["']\]/i);
  assert.match(styles, /\.perspective-hud\[data-flip-stage=["'](?:anticipation|fold|cross|settle)["']\]/i);
  assert.match(styles, /repeating-linear-gradient[\s\S]*perspective-paper/i);
  assert.match(styles, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.perspective-hud\s*\{[^}]*max-height:\s*45vh/i);
  assert.match(styles, /\.perspective-challenges\s*\{[^}]*grid-template-columns:\s*repeat\(4,/i);
  assert.match(html, /perspective-zone\.css\?v=13/i);
  assert.match(html, /perspective-zone-core\.js\?v=12/i);
  assert.match(html, /script\.js\?v=135/i);
});

test("la barra usa missionProgress normalizado y solo divide el fallback bruto", () => {
  assert.equal(Math.round(bifazMissionProgress(1 / 3, 1, 3) * 100), 33);
  assert.equal(Math.round(bifazMissionProgress(1, 3, 3) * 100), 100);
  assert.equal(Math.round(bifazMissionProgress(undefined, 1, 3) * 100), 33);
  assert.equal(Math.round(bifazMissionProgress(undefined, 3, 3) * 100), 100);
  const hudStart = runtimeSource.indexOf("function updatePerspectiveHud");
  const hudEnd = runtimeSource.indexOf("async function leavePerspectiveZone", hudStart);
  const hudAdapter = runtimeSource.slice(hudStart, hudEnd);
  assert.match(hudAdapter, /bifazMissionProgress\(\s*hud\.missionProgress,/);
  assert.doesNotMatch(hudAdapter, /missionProgressValue\s*\/\s*missionTarget/);
});

test("assist se materializa como control accesible, persiste y llega al runtime", () => {
  assert.match(html, /id=["']perspectiveAssistButton["'][^>]*aria-label=["'][^"']+["'][^>]*aria-pressed=["']false["']/i);
  assert.match(runtimeSource, /perspectiveAssistButton\?\.addEventListener\(["']click["'],\s*togglePerspectiveAssist\)/);
  assert.match(runtimeSource, /assist:\s*state\.perspectiveZone\.assist/);
  assert.match(runtimeSource, /perspectiveZoneRuntime\.state\.assist\s*=\s*enabled/);
  assert.equal(normalizeSavedBifaz({ version: 2, assist: true }).assist, true);
});

test("el teclado respeta origenes interactivos y los botones tactiles no duplican pointer y click", () => {
  assert.match(runtimeSource, /function isInteractiveKeyboardOrigin\s*\([^)]+\)[\s\S]*?target\?\.closest/);
  assert.match(runtimeSource, /function handleKeyDown\s*\(event\)\s*\{\s*if \(isInteractiveKeyboardOrigin\(event\)\) return;/);
  assert.match(runtimeSource, /function handlePerspectiveKeyDown\s*\(event\)[\s\S]*?isInteractiveKeyboardOrigin\(event\)/);
  const bindStart = runtimeSource.indexOf("function bindPerspectiveTouchControl");
  const bindEnd = runtimeSource.indexOf("function bindEvents", bindStart);
  const binding = runtimeSource.slice(bindStart, bindEnd);
  assert.match(binding, /button\.addEventListener\(["']click["'],\s*click\)/);
  assert.match(binding, /event\.detail !== 0 && \(heldAction \|\| suppressPointerClick\)/);
  assert.match(binding, /if \(heldAction\) activate\(\);/);
  assert.match(binding, /suppressPointerClick\s*=\s*true/);
});

test("el adaptador consume todos los hooks v2, limita feedback y escala la recompensa por retos únicos", () => {
  for (const eventType of [
    "mission", "mission-step", "wildlife-discovered", "challenge-complete", "combo", "perfect-land", "flip-end",
    "flow", "paper-rush", "spring", "land", "flip-stage", "flip-denied",
  ]) assert.match(runtimeSource, new RegExp(`event\\.type === ["']${eventType}["']`), `falta el hook ${eventType}`);

  for (const field of [
    "missionTitle", "missionObjective", "missionProgress", "missionStage", "missionCount",
    "discoveries", "wildlifeTotal", "challengesCompleted", "completedChallenges",
    "flipCombo", "bestFlipCombo", "perfectLandings", "flipStage",
    "paperFlow", "flowTier", "flowLabel", "styleChain", "bestStyleChain", "rushTimer", "paperRushes",
  ]) assert.match(runtimeSource, new RegExp(`\\b${field}\\b`), `el adaptador no consume ${field}`);

  assert.match(runtimeSource, /const presentBifazFeedback\s*=/);
  assert.match(runtimeSource, /perspectiveFeedbackHistory\.(?:get|set)\(/);
  assert.match(runtimeSource, /new Set\(state\.perspectiveZone\.completedChallenges\)\.size/);
  assert.match(runtimeSource, /450\s*\+\s*challengeCount\s*\*\s*100/);
  assert.match(runtimeSource, /450 ₱ de base \+ \$\{challengeBonus\} ₱ por insignias/);
});

test("la carga y el snapshot pasan por una normalización persistente acotada", () => {
  assert.match(runtimeSource, /next\.perspectiveZone\s*=\s*normalizeBifazProgress\(savedPerspective\)/);
  assert.match(runtimeSource, /const snapshot = perspectiveZoneRuntime\.snapshot\(\)[\s\S]*normalizeBifazProgress\(snapshot, state\.perspectiveZone\)/);

  const defaults = normalizeSavedBifaz({});
  assert.equal(defaults.bestTime, null);
  assert.deepEqual(defaults.wildlifeDiscovered, []);
  assert.deepEqual(
    {
      missionProgress: defaults.missionProgress,
      missionStage: defaults.missionStage,
      missionCount: defaults.missionCount,
      discoveries: defaults.discoveries,
      wildlifeTotal: defaults.wildlifeTotal,
      challengesCompleted: defaults.challengesCompleted,
      completedChallenges: defaults.completedChallenges,
      flipCombo: defaults.flipCombo,
      bestFlipCombo: defaults.bestFlipCombo,
      perfectLandings: defaults.perfectLandings,
      flipStage: defaults.flipStage,
      paperFlow: defaults.paperFlow,
      flowTier: defaults.flowTier,
      flowLabel: defaults.flowLabel,
      styleChain: defaults.styleChain,
      bestStyleChain: defaults.bestStyleChain,
      rushTimer: defaults.rushTimer,
      paperRushes: defaults.paperRushes,
      precisionLandingIds: defaults.precisionLandingIds,
      flipComboAnchorIds: defaults.flipComboAnchorIds,
    },
    {
      missionProgress: 0, missionStage: 0, missionCount: 5, discoveries: [], wildlifeTotal: 6,
      challengesCompleted: 0, completedChallenges: [], flipCombo: 0, bestFlipCombo: 0,
      perfectLandings: 0, flipStage: null, paperFlow: 0, flowTier: "calm", flowLabel: "CALMA",
      styleChain: 0, bestStyleChain: 0, rushTimer: 0, paperRushes: 0,
      precisionLandingIds: [], flipComboAnchorIds: [],
    },
  );

  const sanitized = normalizeSavedBifaz({
    checkpointId: "../fuera",
    missionTitle: "  Misión    trucada  ",
    missionObjective: { html: "<script>" },
    missionProgress: 8,
    missionStage: 99,
    missionCount: 5,
    discoveries: ["liebre", "liebre", "id con espacios", 9],
    wildlifeTotal: 900,
    completedChallenges: ["naturalista", "naturalista", "acrobata", "inventado"],
    challengesCompleted: 900,
    flipCombo: -4,
    bestFlipCombo: 9000,
    perfectLandings: -20,
    flipStage: "teletransporte",
    paperFlow: 999,
    flowTier: "turbo",
    flowLabel: { html: "RUSH" },
    styleChain: -7,
    bestStyleChain: 5000,
    rushTimer: -4,
    paperRushes: 5000,
    precisionLandingIds: ["meadow-start", "id con espacios"],
    flipComboAnchorIds: ["anchor-west", "anchor-west", 7],
  });
  assert.equal(sanitized.checkpointId, "start");
  assert.equal(sanitized.missionTitle, "Misión trucada");
  assert.equal(sanitized.missionObjective, defaults.missionObjective);
  assert.equal(sanitized.missionProgress, 1);
  assert.equal(sanitized.missionStage, 5);
  assert.deepEqual(sanitized.discoveries, ["liebre"]);
  assert.equal(sanitized.wildlifeTotal, 64);
  assert.deepEqual(sanitized.completedChallenges, ["naturalista", "acrobata"]);
  assert.equal(sanitized.challengesCompleted, 4);
  assert.equal(sanitized.flipCombo, 0);
  assert.equal(sanitized.bestFlipCombo, 999);
  assert.equal(sanitized.perfectLandings, 0);
  assert.equal(sanitized.flipStage, null);
  assert.equal(sanitized.paperFlow, 100);
  assert.equal(sanitized.flowTier, "calm");
  assert.equal(sanitized.flowLabel, "CALMA");
  assert.equal(sanitized.styleChain, 0);
  assert.equal(sanitized.bestStyleChain, 999);
  assert.equal(sanitized.rushTimer, 0);
  assert.equal(sanitized.paperRushes, 999);
  assert.deepEqual(sanitized.precisionLandingIds, ["meadow-start"]);
  assert.deepEqual(sanitized.flipComboAnchorIds, ["anchor-west"]);

  const restoredAliases = normalizeSavedBifaz({
    wildlifeDiscovered: ["liebre", "golondrina"],
    mission: { version: 1, completed: ["descubre-fauna"], currentIndex: 1 },
    challenges: { naturalista: { progress: 6, target: 6, complete: true } },
  });
  assert.deepEqual(restoredAliases.discoveries, ["liebre", "golondrina"]);
  assert.deepEqual(restoredAliases.wildlifeDiscovered, restoredAliases.discoveries);
  assert.deepEqual(restoredAliases.mission.completed, ["descubre-fauna"]);
  assert.deepEqual(restoredAliases.completedChallenges, ["naturalista"]);
});

test("persistencia v2 descarta versiones futuras y filtra IDs cuando el core esta disponible", () => {
  const realCoreShape = normalizeSavedBifaz({
    version: 2.1,
    snapshotVersion: 2,
    checkpointId: "rooftops",
    collected: ["seal-canopy"],
    discoveries: ["azahin-guide"],
    completedChallenges: ["naturalista"],
    paperFlow: 61,
    complete: true,
  }, PERSPECTIVE_CORE_FIXTURE);
  assert.equal(realCoreShape.version, 2);
  assert.equal(realCoreShape.snapshotVersion, 2);
  assert.equal(realCoreShape.complete, true);
  assert.equal(realCoreShape.checkpointId, "rooftops");
  assert.deepEqual(realCoreShape.collected, ["seal-canopy"]);
  assert.deepEqual(realCoreShape.discoveries, ["azahin-guide"]);
  assert.deepEqual(realCoreShape.completedChallenges, ["naturalista"]);
  assert.equal(realCoreShape.paperFlow, 61);

  const future = normalizeSavedBifaz({
    version: 3,
    checkpointId: "rooftops",
    collected: ["seal-canopy"],
    discoveries: ["azahin-guide"],
    completedChallenges: ["naturalista"],
    precisionLandingIds: ["meadow-start"],
    flipComboAnchorIds: ["anchor-west"],
    complete: true,
  }, PERSPECTIVE_CORE_FIXTURE);
  assert.equal(future.version, 2);
  assert.equal(future.complete, false);
  assert.equal(future.checkpointId, "start");
  assert.deepEqual(future.collected, []);
  assert.deepEqual(future.discoveries, []);
  assert.deepEqual(future.precisionLandingIds, []);
  assert.deepEqual(future.flipComboAnchorIds, []);

  const unknownSnapshot = normalizeSavedBifaz({ snapshotVersion: 99, complete: true }, PERSPECTIVE_CORE_FIXTURE);
  assert.equal(unknownSnapshot.complete, false);

  const filtered = normalizeSavedBifaz({
    version: 2,
    checkpointId: "checkpoint-inventado",
    collected: ["seal-canopy", "sello-inventado"],
    discoveries: ["azahin-guide", "fauna-inventada"],
    completedChallenges: ["naturalista", "reto-inventado"],
    challenges: { naturalista: { progress: 6, target: 6, complete: true }, inventado: { complete: true } },
    precisionLandingIds: ["meadow-start", "platform-inventada"],
    flipComboAnchorIds: ["anchor-west", "anchor-inventada"],
  }, PERSPECTIVE_CORE_FIXTURE);
  assert.equal(filtered.checkpointId, "start");
  assert.deepEqual(filtered.collected, ["seal-canopy"]);
  assert.deepEqual(filtered.discoveries, ["azahin-guide"]);
  assert.deepEqual(filtered.completedChallenges, ["naturalista"]);
  assert.deepEqual(Object.keys(filtered.challenges), ["naturalista", "acrobata", "origamista", "virtuoso"]);
  assert.deepEqual(filtered.precisionLandingIds, ["meadow-start"]);
  assert.deepEqual(filtered.flipComboAnchorIds, ["anchor-west"]);

  const migratedCounters = normalizeSavedBifaz({
    version: 1,
    perfectLandings: 2,
    flipCombo: 2,
    challenges: {
      acrobata: { progress: 2, target: 3, complete: false },
      origamista: { progress: 2, target: 3, complete: false },
    },
  }, PERSPECTIVE_CORE_FIXTURE);
  assert.equal(migratedCounters.perfectLandings, 2);
  assert.equal(migratedCounters.flipCombo, 2);
  assert.deepEqual(migratedCounters.precisionLandingIds, ["meadow-start", "roof-west"]);
  assert.deepEqual(migratedCounters.flipComboAnchorIds, ["anchor-west", "anchor-east"]);

  const beforeCore = normalizeSavedBifaz({
    version: 1,
    checkpointId: "checkpoint-legado",
    collected: ["sello-legado"],
    discoveries: ["fauna-legada"],
  });
  assert.equal(beforeCore.checkpointId, "checkpoint-legado");
  assert.deepEqual(beforeCore.collected, ["sello-legado"]);
  assert.deepEqual(beforeCore.discoveries, ["fauna-legada"]);
});

test("la recompensa base y los bonos tardios son idempotentes y la salida es voluntaria", () => {
  const result = awardBifazRewards({
    money: 0,
    inventory: { rareCandies: 0 },
    perspectiveZone: {
      complete: true,
      rewarded: false,
      completedChallenges: ["naturalista"],
      rewardedChallenges: [],
    },
  });
  assert.deepEqual(result.first, { changed: true, baseAwarded: true, challengeIds: ["naturalista"], amount: 550 });
  assert.deepEqual(result.second, { changed: false, baseAwarded: false, challengeIds: [], amount: 0 });
  assert.deepEqual(result.late, { changed: true, baseAwarded: false, challengeIds: ["virtuoso"], amount: 100 });
  assert.equal(result.state.money, 650);
  assert.equal(result.state.inventory.rareCandies, 1);
  assert.deepEqual(result.state.perspectiveZone.rewardedChallenges, ["naturalista", "virtuoso"]);

  const completionStart = runtimeSource.indexOf('event.type === "complete"');
  const completionEnd = runtimeSource.indexOf("updatePerspectiveHud(true)", completionStart);
  const completionBranch = runtimeSource.slice(completionStart, completionEnd);
  assert.match(completionBranch, /Puedes seguir explorando/);
  assert.doesNotMatch(completionBranch, /showDialog\([\s\S]*leavePerspectiveZone/);
});

test("feedback simultaneo se prioriza por frame y el HUD contempla altura baja y safe-area", () => {
  assert.match(runtimeSource, /perspectiveFeedbackPending/);
  assert.match(runtimeSource, /feedback\.priority\s*>\s*perspectiveFeedbackPending\.priority/);
  assert.match(runtimeSource, /requestAnimationFrame[\s\S]*flushBifazFeedback/);
  assert.match(styles, /@media\s*\(max-height:\s*560px\)\s*and\s*\(orientation:\s*landscape\)/i);
  assert.match(styles, /env\(safe-area-inset-(?:top|bottom|left|right)/i);
  assert.match(styles, /\.perspective-hud\s*\{[^}]*overflow-y:\s*auto/i);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)\s*and\s*\(min-height:\s*561px\)[\s\S]*?\.perspective-hud\s*\{[^}]*top:\s*max\(104px/i);
  assert.match(styles, /body:has\(#worldScreen\.perspective-mode:not\(\.hidden\)\)\s*\.hud-summary\s*\{\s*display:\s*none/i);
  assert.match(styles, /@media\s*\(max-height:\s*560px\)[\s\S]*?\.perspective-hud\s*\{[^}]*top:\s*max\(72px/i);
});

test("persistencia v2.1 normaliza Flujo, cadenas, Rushes y progreso único de retos", () => {
  const normalized = normalizeSavedBifaz({
    version: 2,
    paperFlow: 73.5,
    flowTier: "fold",
    flowLabel: "PLIEGUE",
    styleChain: 7,
    bestStyleChain: 4,
    rushTimer: 2.25,
    paperRushes: 3,
    precisionLandingIds: ["meadow-start", "roof-west", "platform-inventada"],
    flipComboAnchorIds: ["anchor-west", "anchor-east", "anchor-inventada"],
    completedChallenges: ["virtuoso"],
    challenges: { virtuoso: { progress: 1, target: 1, complete: true } },
  }, PERSPECTIVE_CORE_FIXTURE);

  assert.equal(normalized.paperFlow, 73.5);
  assert.equal(normalized.flowTier, "fold");
  assert.equal(normalized.flowLabel, "PLIEGUE");
  assert.equal(normalized.styleChain, 7);
  assert.equal(normalized.bestStyleChain, 7);
  assert.equal(normalized.rushTimer, 2.25);
  assert.equal(normalized.paperRushes, 3);
  assert.deepEqual(normalized.precisionLandingIds, ["meadow-start", "roof-west"]);
  assert.deepEqual(normalized.flipComboAnchorIds, ["anchor-west", "anchor-east"]);
  assert.deepEqual(normalized.completedChallenges, ["virtuoso"]);
  assert.deepEqual(normalized.challenges.virtuoso, { progress: 1, target: 1, complete: true });
});

test("eventos v2.1 tienen señales distintas y conservan la coalescencia priorizada", () => {
  const handlerStart = runtimeSource.indexOf("function handlePerspectiveZoneEvent");
  const handlerEnd = runtimeSource.indexOf("function ensurePerspectiveZoneRuntime", handlerStart);
  const handler = runtimeSource.slice(handlerStart, handlerEnd);
  for (const eventType of ["flow", "paper-rush", "spring", "land", "flip-stage", "flip-denied"]) {
    assert.match(handler, new RegExp(`event\\.type === ["']${eventType}["']`), `falta feedback para ${eventType}`);
  }
  assert.match(runtimeSource, /function playBifazFlipStageTone[\s\S]*anticipation:\s*\[330[\s\S]*fold:\s*\[466[\s\S]*cross:\s*\[659[\s\S]*settle:\s*\[831/);
  assert.match(handler, /\["firm",\s*"perfect"\]\.includes\(event\.strength\)[\s\S]*impact\s*>=\s*\.62[\s\S]*speed\s*>=\s*620/);
  assert.match(handler, /"paper-rush"[\s\S]*priority:\s*96[\s\S]*playTone\(1319/);
  assert.match(handler, /"flip-denied"[\s\S]*priority:\s*55[\s\S]*playTone\(123/);
  assert.match(handler, /"spring"[\s\S]*playTone\(523[\s\S]*playTone\(784/);
  assert.match(runtimeSource, /feedback\.priority\s*>\s*perspectiveFeedbackPending\.priority/);

  const feedbackSandbox = { output: null };
  vm.runInNewContext(`
    const PERSPECTIVE_ZONE_ACTIVE = true;
    const state = { perspectiveZone: { styleChain: 5, paperRushes: 1, completedChallenges: [] } };
    const finiteBifazNumber = (value, fallback, minimum, maximum) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
    };
    const cleanBifazIds = (ids) => ids.filter((id) => typeof id === "string");
    const cleanBifazText = (value, fallback) => typeof value === "string" ? value : fallback;
    const feedback = [];
    const syncPerspectiveProgress = () => {
      // El primer evento ya observa el snapshot final del frame.
      state.perspectiveZone.completedChallenges = ["virtuoso"];
    };
    const presentBifazFeedback = (channel, signature, message) => feedback.push({ channel, signature, message });
    const awardBifazRewards = () => ({ changed: false });
    const playTone = () => {};
    const playJingle = () => {};
    const updatePerspectiveHud = () => {};
    ${handler}
    handlePerspectiveZoneEvent({ type: "paper-rush", count: 1 });
    handlePerspectiveZoneEvent({ type: "challenge-complete", challengeId: "virtuoso", title: "Virtuoso" });
    globalThis.output = feedback;
  `, feedbackSandbox, { filename: "perspective-zone-feedback-sequence.js" });
  assert.deepEqual(
    JSON.parse(JSON.stringify(feedbackSandbox.output.map(({ channel }) => channel))),
    ["paper-rush", "challenge"],
  );
});

test("fases, Rush y Flujo respetan 360ms, responsive y movimiento reducido", () => {
  assert.match(styles, /--perspective-flip-duration:\s*360ms/);
  assert.match(styles, /data-flip-stage=["']anticipation["'][^}]*\{[^}]*72ms/i);
  assert.match(styles, /data-flip-stage=["']fold["'][^}]*\.perspective-mission\s*\{[^}]*101ms/i);
  assert.match(styles, /data-flip-stage=["']cross["'][\s\S]*50ms/i);
  assert.match(styles, /data-flip-stage=["']settle["'][\s\S]*137ms/i);
  assert.doesNotMatch(styles, /data-phase=["']flipping["']\s*\.perspective-mission/);
  assert.match(styles, /\.perspective-flow\s*\{[^}]*min-height:\s*34px/i);
  assert.match(styles, /max-height:\s*min\(62dvh,\s*250px\)/i);
  const reducedStart = styles.indexOf("@media (prefers-reduced-motion: reduce)");
  const reduced = styles.slice(reducedStart);
  assert.match(reduced, /perspective-flow\[data-rush=["']true["']\][\s\S]*animation:\s*none\s*!important/i);
  assert.match(reduced, /data-challenge-id=["']virtuoso["'][\s\S]*animation:\s*none\s*!important/i);
  assert.match(reduced, /perspective-flow-track\s*>\s*i[\s\S]*transition-duration:\s*\.01s\s*!important/i);
});

test("la guía documenta el plan v2.1 sin alterar el manifiesto exacto de 50", () => {
  const manifestStart = guideSource.indexOf("## Manifiesto verificable de 50 mejoras v2");
  const planStart = guideSource.indexOf("## Plan de diversión v2.1 aplicado", manifestStart);
  assert.ok(manifestStart >= 0 && planStart > manifestStart);
  const manifestIds = [...guideSource.slice(manifestStart, planStart).matchAll(/^\|\s*(\d+)\s*\|/gm)]
    .map((match) => Number(match[1]));
  assert.deepEqual(manifestIds, Array.from({ length: 50 }, (_, index) => index + 1));

  const nextHeading = guideSource.indexOf("\n## ", planStart + 4);
  const plan = guideSource.slice(planStart, nextHeading);
  const concreteChanges = [...plan.matchAll(/^\d+\.\s+\*\*/gm)];
  assert.ok(concreteChanges.length >= 15 && concreteChanges.length <= 20);
  assert.match(plan, /`calm`\s*\|\s*`0–24`\s*\|\s*`CALMA`/);
  assert.match(plan, /`rhythm`\s*\|\s*`25–54`\s*\|\s*`RITMO`/);
  assert.match(plan, /`fold`\s*\|\s*`55–84`\s*\|\s*`PLIEGUE`/);
  assert.match(plan, /`rush`\s*\|\s*desde `85`\s*\|\s*`PAPER RUSH`/);
  assert.match(plan, /precisionLandingIds/);
  assert.match(plan, /flipComboAnchorIds/);
  assert.match(plan, /Presupuestos v2\.1[\s\S]*62dvh[\s\S]*ARIA live/);
});
