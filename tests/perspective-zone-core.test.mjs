import assert from "node:assert/strict";
import { test } from "node:test";

await import("../perspective-zone-core.js");

const core = globalThis.PERSPECTIVE_ZONE_CORE;
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

assert.ok(core, "perspective-zone-core.js debe publicar PERSPECTIVE_ZONE_CORE");

const {
  VERSION,
  SNAPSHOT_VERSION,
  FIXED_STEP,
  MAX_PARTICLES,
  PAPER_RUSH_THRESHOLD,
  PAPER_RUSH_REARM,
  PAPER_RUSH_DURATION,
  PERSPECTIVE_FEATURES,
  FEATURES,
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
  validateLevel,
  snapshotState,
  createRuntime,
  platformPosition,
  platformVisualState,
} = core;

function adoptState(current, result) {
  return result && typeof result === "object" && result.player ? result : current;
}

function advance(state, input = EMPTY_INPUT, dt = FIXED_STEP, level = DEFAULT_LEVEL) {
  const nextInput = input === EMPTY_INPUT ? EMPTY_INPUT : { ...EMPTY_INPUT, ...input };
  return adoptState(state, advanceState(state, nextInput, dt, level));
}

function validationPassed(result) {
  return result === true || result?.valid === true;
}

function validationMessages(result) {
  if (!result || result === true || result === false) return [];
  return [result.errors, result.failures, result.warnings, result.diagnostics]
    .flatMap((items) => Array.isArray(items) ? items : [])
    .map((item) => typeof item === "string" ? item : item?.message || JSON.stringify(item));
}

function finiteNumbers(value, numbers = []) {
  if (typeof value === "number") numbers.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => finiteNumbers(entry, numbers));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => finiteNumbers(entry, numbers));
  }
  return numbers;
}

function clone(value) {
  return structuredClone(value);
}

function mockCanvasContext() {
  const noop = () => {};
  return {
    arc: noop, beginPath: noop, closePath: noop, drawImage: noop, ellipse: noop,
    fill: noop, fillRect: noop, lineTo: noop, moveTo: noop, quadraticCurveTo: noop,
    restore: noop, rotate: noop, save: noop, scale: noop, setLineDash: noop,
    stroke: noop, strokeRect: noop, transform: noop, translate: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
  };
}

function runFor(state, seconds, input, fps = 60, level = DEFAULT_LEVEL) {
  const frames = Math.round(seconds * fps);
  for (let frame = 0; frame < frames; frame += 1) {
    state = advance(state, typeof input === "function" ? input(frame, fps, state) : input, 1 / fps, level);
  }
  return state;
}

function settle(state, level = DEFAULT_LEVEL) {
  let consecutiveGroundedFrames = 0;
  for (let frame = 0; frame < 720; frame += 1) {
    state = advance(state, EMPTY_INPUT, FIXED_STEP, level);
    consecutiveGroundedFrames = state.player.grounded ? consecutiveGroundedFrames + 1 : 0;
    if (consecutiveGroundedFrames >= 4) return state;
  }
  assert.fail("el jugador no alcanzó una plataforma estable en doce segundos simulados");
}

function flipTo(state, targetMode, options = {}, level = DEFAULT_LEVEL) {
  if (state.mode === targetMode && !state.flip && state.phase !== "flipping") return state;
  state = adoptState(state, requestFlip(state, targetMode, level, options));
  for (let frame = 0; frame < 180; frame += 1) {
    state = advance(state, EMPTY_INPUT, FIXED_STEP, level);
    if (state.mode === targetMode && !state.flip && state.phase !== "flipping") return state;
  }
  assert.fail(`el giro hacia ${targetMode} no terminó en tres segundos simulados`);
}

function profileState(level = DEFAULT_LEVEL) {
  return settle(flipTo(createState(level), "perfil", { forced: true }, level), level);
}

function jumpDirection(level = DEFAULT_LEVEL) {
  let state = profileState(level);
  const groundY = state.player.y;
  state = advance(state, { jumpPressed: true, jumpHeld: true }, FIXED_STEP, level);
  for (let frame = 0; frame < 8; frame += 1) {
    if (!state.player.grounded && Math.abs(state.player.y - groundY) > 1e-6) {
      return Math.sign(state.player.y - groundY) || Math.sign(state.player.vy);
    }
    state = advance(state, { jumpHeld: true }, FIXED_STEP, level);
  }
  assert.fail("el salto no separó al jugador del suelo");
}

function findLedge(direction, level = DEFAULT_LEVEL) {
  let state = profileState(level);
  const input = direction === "right" ? { right: true, run: true } : { left: true, run: true };
  for (let frame = 0; frame < 1_200; frame += 1) {
    const wasGrounded = state.player.grounded;
    state = advance(state, input, FIXED_STEP, level);
    if (wasGrounded && !state.player.grounded) return state;
    if (state.complete) break;
  }
  return null;
}

function levelHorizontalBounds(level) {
  const min = Number(level?.bounds?.minX ?? level?.bounds?.left ?? level?.bounds?.x ?? 0);
  const extent = Number(level?.bounds?.width);
  const max = Number(level?.bounds?.maxX
    ?? level?.bounds?.right
    ?? (Number.isFinite(extent) ? min + extent : undefined)
    ?? level?.width
    ?? level?.worldWidth);
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

function dropOntoPlatform(state, platform, { speed = 600, offsetX = 0, level = DEFAULT_LEVEL } = {}) {
  const position = platformPosition(platform, state.time);
  state.player.x = position.x + platform.w / 2 - state.player.width / 2 + offsetX;
  state.player.y = position.y - state.player.height - 2;
  state.player.previousY = state.player.y;
  state.player.vx = 0;
  state.player.vy = speed;
  state.player.grounded = false;
  state.player.platformId = null;
  return advance(state, EMPTY_INPUT, FIXED_STEP, level);
}

test("el núcleo publica una API versionada, determinista y sin dependencias del DOM", () => {
  assert.ok((Number.isInteger(VERSION) && VERSION > 0) || /^\d+\.\d+/.test(String(VERSION)));
  assert.ok(Number.isFinite(FIXED_STEP) && FIXED_STEP >= 1 / 240 && FIXED_STEP <= 1 / 30);
  assert.ok(DEFAULT_LEVEL && typeof DEFAULT_LEVEL === "object");
  for (const [name, member] of Object.entries({
    createState,
    advanceState,
    requestFlip,
    buildingTransform,
    visibleEntities,
    validateLevel,
    snapshotState,
    createRuntime,
  })) assert.equal(typeof member, "function", `falta ${name}`);

  const state = createState(DEFAULT_LEVEL);
  assert.ok(state.player && ["diorama", "perfil"].includes(state.mode));
  assert.equal(state.collected instanceof Set, true);
  assert.equal(Array.isArray(state.wildlife), true);
  assert.deepEqual(
    Object.keys(state.player).filter((key) => ["x", "y", "vx", "vy", "width", "height", "grounded"].includes(key)).sort(),
    ["grounded", "height", "vx", "vy", "width", "x", "y"],
  );
});

test("la integración de paso fijo produce el mismo estado a 30, 60 y 120 FPS", () => {
  const simulate = (fps) => runFor(profileState(), 2, { right: true, run: true }, fps);
  const at30 = simulate(30);
  const at60 = simulate(60);
  const at120 = simulate(120);

  for (const key of ["x", "y", "vx", "vy"]) {
    assert.ok(Math.abs(at30.player[key] - at60.player[key]) < 0.025, `${key}: 30 y 60 FPS divergen`);
    assert.ok(Math.abs(at120.player[key] - at60.player[key]) < 0.025, `${key}: 120 y 60 FPS divergen`);
  }
  assert.equal(at30.player.grounded, at60.player.grounded);
  assert.equal(at120.player.grounded, at60.player.grounded);
});

test("las acciones de flanco sobreviven a frames de 240 Hz hasta el siguiente paso fijo", () => {
  let jumpState = profileState();
  const jumpY = jumpState.player.y;
  jumpState = advance(jumpState, { jumpPressed: true, jumpHeld: true }, FIXED_STEP / 2);
  assert.equal(jumpState.player.y, jumpY, "medio paso no debe ejecutar física todavía");
  jumpState = advance(jumpState, { jumpHeld: true }, FIXED_STEP / 2);
  assert.ok(!jumpState.player.grounded && jumpState.player.vy < 0, "el salto enclavado debe consumirse en el paso siguiente");

  let flipState = profileState();
  flipState.player.x = 2040;
  flipState.player.y = DEFAULT_LEVEL.floorY - flipState.player.height;
  flipState.player.grounded = true;
  flipState = advance(flipState, { flipPressed: true }, FIXED_STEP / 2);
  assert.equal(flipState.flip, null);
  flipState = advance(flipState, EMPTY_INPUT, FIXED_STEP / 2);
  assert.ok(flipState.flip, "el pliegue enclavado debe iniciar la transición");

  let restartState = profileState();
  restartState.checkpointId = "courtyard";
  restartState.player.x = 2300;
  restartState = advance(restartState, { restartPressed: true }, FIXED_STEP / 2);
  assert.equal(restartState.player.x, 2300);
  restartState = advance(restartState, EMPTY_INPUT, FIXED_STEP / 2);
  assert.equal(restartState.player.x, 1855, "reiniciar debe volver al checkpoint aunque el flanco llegue entre pasos");
});

test("el salto aterriza sin atravesar la plataforma incluso tras un frame largo", () => {
  let state = profileState();
  const groundY = state.player.y;
  state = advance(state, { jumpPressed: true, jumpHeld: true });
  state = advance(state, { jumpHeld: true }, 0.18);
  let leftGround = !state.player.grounded;
  for (let frame = 0; frame < 360; frame += 1) {
    state = advance(state);
    leftGround ||= !state.player.grounded;
    finiteNumbers(state.player).forEach((value) => assert.ok(Number.isFinite(value)));
    if (leftGround && state.player.grounded) break;
  }
  assert.equal(leftGround, true, "el impulso de salto debe despegar al jugador");
  assert.equal(state.player.grounded, true, "el jugador debe volver a aterrizar");
  assert.ok(Math.abs(state.player.y - groundY) < 0.1, "el contacto debe resolverse sobre la superficie original");
});

test("el salto en Diorama hace alcanzable el Sello de la Profundidad", () => {
  let state = createState(DEFAULT_LEVEL, { introSeen: true });
  state.mode = "diorama";
  state.blend = 0;
  state.phase = "run";
  state.depth = -72;
  state.player.x = 2500;
  state.player.y = DEFAULT_LEVEL.floorY - state.player.height;
  state.player.previousY = state.player.y;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.grounded = true;
  state.player.platformId = "fold-courtyard";
  state.player.coyote = DEFAULT_LEVEL.physics.coyoteTime;

  let reachedSecretStep = false;
  for (let frame = 0; frame < 180 && !reachedSecretStep; frame += 1) {
    state = advance(state, {
      jumpPressed: frame === 0,
      jumpHeld: frame < 60,
    });
    reachedSecretStep ||= state.player.platformId === "wall-secret-step";
  }
  for (let frame = 0; frame < 120 && !state.collected.has("seal-depth"); frame += 1) {
    state = advance(state, { right: true });
  }

  assert.equal(reachedSecretStep, true, "el salto debe aterrizar en el peldaño oculto");
  assert.equal(state.collected.has("seal-depth"), true, "el sello no puede quedar fuera del recorrido jugable");
});

test("coyote time permite saltar varios pasos fijos después de abandonar un borde", () => {
  let state = findLedge("right") || findLedge("left");
  assert.ok(state, "el nivel de plataformas necesita al menos un borde alcanzable desde el inicio");
  const upward = jumpDirection();

  for (let frame = 0; frame < 4; frame += 1) state = advance(state);
  assert.equal(state.player.grounded, false);
  const beforeY = state.player.y;
  state = advance(state, { jumpPressed: true, jumpHeld: true });
  for (let frame = 0; frame < 3; frame += 1) state = advance(state, { jumpHeld: true });

  assert.equal(Math.sign(state.player.y - beforeY), upward, "el salto tardío debe impulsar en dirección ascendente");
  assert.equal(state.player.grounded, false);
});

test("el búfer conserva una pulsación realizada poco antes de aterrizar", () => {
  let state = profileState();
  const groundY = state.player.y;
  const upward = jumpDirection();
  state = advance(state, { jumpPressed: true, jumpHeld: true });
  let buffered = false;

  for (let frame = 0; frame < 360 && !buffered; frame += 1) {
    const probe = clone(state);
    let landingSteps = null;
    let predicted = probe;
    for (let lookahead = 1; lookahead <= 9; lookahead += 1) {
      predicted = advance(predicted);
      if (predicted.player.grounded) {
        landingSteps = lookahead;
        break;
      }
    }
    if (landingSteps != null && landingSteps >= 3 && landingSteps <= 7) {
      state = advance(state, { jumpPressed: true });
      let sawSecondAscent = false;
      for (let follow = 0; follow < landingSteps + 8; follow += 1) {
        const previousY = state.player.y;
        state = advance(state);
        if (!state.player.grounded && Math.sign(state.player.y - previousY) === upward) sawSecondAscent = true;
      }
      assert.equal(sawSecondAscent, true, "el aterrizaje debe consumir el salto almacenado");
      assert.ok(Math.abs(state.player.y - groundY) > 0.5 || !state.player.grounded);
      buffered = true;
      break;
    }
    state = advance(state);
  }
  assert.equal(buffered, true, "la trayectoria debe ofrecer una ventana comprobable de búfer");
});

test("el giro completa ambas direcciones y mantiene todos los valores finitos", () => {
  let state = createState(DEFAULT_LEVEL);
  const originalMode = state.mode;
  const target = originalMode === "perfil" ? "diorama" : "perfil";
  const beforePulses = state.pulses;
  state = adoptState(state, requestFlip(state, target, DEFAULT_LEVEL, { forced: true }));
  const blends = [];

  for (let frame = 0; frame < 180; frame += 1) {
    state = advance(state);
    blends.push(state.blend);
    finiteNumbers(state).forEach((value) => assert.ok(Number.isFinite(value), "el giro produjo NaN o infinito"));
    if (state.mode === target && !state.flip && state.phase !== "flipping") break;
  }
  assert.equal(state.mode, target);
  assert.equal(state.flip, null);
  assert.notEqual(state.phase, "flipping");
  assert.ok(blends.every((value) => value >= 0 && value <= 1));
  assert.ok(Math.max(...blends) - Math.min(...blends) > 0.5, "la transición debe recorrer una mezcla visible");
  if (target === "diorama") assert.ok(state.pulses >= beforePulses - 1 && state.pulses <= beforePulses);

  state = flipTo(state, originalMode, { forced: true });
  assert.equal(state.mode, originalMode);
});

test("movimiento reducido resuelve el giro sin balanceo prolongado", () => {
  let state = createState(DEFAULT_LEVEL);
  const target = state.mode === "perfil" ? "diorama" : "perfil";
  state = adoptState(state, requestFlip(state, target, DEFAULT_LEVEL, { reducedMotion: true, forced: true }));
  const sourceBlend = state.blend;
  state = advance(state, EMPTY_INPUT, 0.025);
  assert.equal(state.blend, sourceBlend, "movimiento reducido no debe interpolar geometría antes del corte");
  state = runFor(state, 0.2, EMPTY_INPUT);
  assert.equal(state.mode, target);
  assert.equal(state.flip, null);
  assert.notEqual(state.phase, "flipping");
  assert.ok(state.blend === 0 || state.blend === 1);
});

test("una plataforma móvil transporta al jugador sin expulsarlo al vacío", () => {
  const platform = DEFAULT_LEVEL.platforms.find(({ id }) => id === "moving-balcony");
  assert.ok(platform);
  let state = profileState();
  const startPosition = core.platformPosition(platform, state.time);
  const relativeX = platform.w * 0.5 - state.player.width * 0.5;
  state.player.x = startPosition.x + relativeX;
  state.player.y = startPosition.y - state.player.height;
  state.player.previousY = state.player.y;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.grounded = true;
  state.player.platformId = platform.id;
  const deaths = state.deaths;

  state = runFor(state, 2, EMPTY_INPUT, 120);
  const finalPosition = core.platformPosition(platform, state.time);
  assert.equal(state.deaths, deaths);
  assert.equal(state.player.grounded, true);
  assert.equal(state.player.platformId, platform.id);
  assert.ok(Math.abs((state.player.x - finalPosition.x) - relativeX) < 1.5, "debe conservar la posición relativa sobre la plataforma");
});

test("las piezas de edificio se transforman de forma finita sin mutar sus datos", () => {
  const building = DEFAULT_LEVEL.buildings?.[0] || {
    id: "test-building",
    x: 180,
    y: 220,
    depth: 64,
    width: 96,
    height: 128,
  };
  const original = clone(building);
  const flat = buildingTransform(building, 0, 0);
  const halfway = buildingTransform(building, 0.5, 0.5);
  const deep = buildingTransform(building, 1, 1);

  for (const result of [flat, halfway, deep]) {
    const numbers = finiteNumbers(result);
    assert.ok(numbers.length >= 2, "la transformación debe exponer coordenadas o escalas numéricas");
    assert.ok(numbers.every(Number.isFinite));
  }
  assert.notDeepEqual(flat, deep, "fachada y diorama no pueden compartir la misma transformación");
  assert.notDeepEqual(halfway, flat, "el punto medio debe interpolarse");
  assert.deepEqual(building, original, "buildingTransform debe ser pura");
});

test("el culling incluye el margen, conserva el orden y excluye entidades lejanas", () => {
  const entities = [
    { id: "far-left", x: -200, width: 16, w: 16 },
    { id: "margin-left", x: 75, width: 10, w: 10 },
    { id: "inside-a", x: 110, width: 20, w: 20 },
    { id: "inside-b", x: 275, width: 20, w: 20 },
    { id: "margin-right", x: 320, width: 5, w: 5 },
    { id: "far-right", x: 600, width: 30, w: 30 },
  ];
  const original = clone(entities);
  const visible = visibleEntities(entities, 100, 200, 25);

  assert.deepEqual(visible.map(({ id }) => id), ["margin-left", "inside-a", "inside-b", "margin-right"]);
  assert.deepEqual(entities, original);
});

test("la fauna es determinista, no se multiplica y permanece dentro de sus áreas", () => {
  let first = createState(DEFAULT_LEVEL);
  let second = createState(DEFAULT_LEVEL);
  const initialCount = first.wildlife.length;
  assert.ok(initialCount >= 3 && initialCount <= 12, "la escena debe estar viva sin saturar el render");

  for (let frame = 0; frame < 3_600; frame += 1) {
    const input = frame % 600 < 180 ? { right: true } : EMPTY_INPUT;
    first = advance(first, input);
    second = advance(second, input);
  }
  assert.equal(first.wildlife.length, initialCount);
  assert.deepEqual(snapshotState(first), snapshotState(second), "la IA ambiental debe usar un reloj/RNG determinista");

  const horizontalBounds = levelHorizontalBounds(DEFAULT_LEVEL);
  for (const creature of first.wildlife) {
    assert.ok(finiteNumbers(creature).every(Number.isFinite), `${creature.id || "fauna"} produjo un valor no finito`);
    const homeX = Number(creature.homeX);
    const range = Number(creature.range);
    const localMinimum = Number.isFinite(homeX) && Number.isFinite(range) ? homeX - range : undefined;
    const localMaximum = Number.isFinite(homeX) && Number.isFinite(range) ? homeX + range : undefined;
    const minimum = Number(creature.minX ?? creature.bounds?.minX ?? localMinimum ?? horizontalBounds?.min);
    const maximum = Number(creature.maxX ?? creature.bounds?.maxX ?? localMaximum ?? horizontalBounds?.max);
    assert.ok(Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum, `${creature.id || "fauna"} necesita límites explícitos o de nivel`);
    assert.ok(creature.x >= minimum - 1 && creature.x <= maximum + 1, `${creature.id || "fauna"} escapó de su área`);
  }
});

test("la validación audita el nivel real y rechaza spawn, meta e IDs corruptos", () => {
  const report = validateLevel(DEFAULT_LEVEL);
  assert.equal(validationPassed(report), true, validationMessages(report).join("\n"));

  const invalidSpawn = clone(DEFAULT_LEVEL);
  invalidSpawn.spawn = { ...(invalidSpawn.spawn || {}), x: Number.NaN };
  assert.equal(validationPassed(validateLevel(invalidSpawn)), false, "un spawn no finito debe invalidar el nivel");

  if (DEFAULT_LEVEL.goal) {
    const invalidGoal = clone(DEFAULT_LEVEL);
    const bounds = levelHorizontalBounds(DEFAULT_LEVEL);
    invalidGoal.goal = { ...invalidGoal.goal, x: (bounds?.max || 10_000) + 1_000_000 };
    assert.equal(validationPassed(validateLevel(invalidGoal)), false, "una meta fuera de la red no debe ser alcanzable");
  }

  const collectionName = ["platforms", "buildings", "collectibles", "checkpoints", "wildlife"]
    .find((name) => Array.isArray(DEFAULT_LEVEL[name]) && DEFAULT_LEVEL[name].length);
  assert.ok(collectionName, "el nivel debe exponer entidades validables");
  const duplicated = clone(DEFAULT_LEVEL);
  duplicated[collectionName].push(clone(duplicated[collectionName][0]));
  assert.equal(validationPassed(validateLevel(duplicated)), false, "los IDs duplicados deben rechazarse");
});

test("snapshotState es estable, serializable y restaurable sin filtrar Sets", () => {
  let state = createState(DEFAULT_LEVEL);
  const collectibleId = DEFAULT_LEVEL.collectibles[0].id;
  state.collected.add(collectibleId);
  const checkpointId = DEFAULT_LEVEL.checkpoints?.[0]?.id || state.checkpointId;
  state.checkpointId = checkpointId;
  state.pulses = Math.max(0, Number(state.pulses) - 1);
  const snapshot = snapshotState(state);
  const json = JSON.stringify(snapshot);

  assert.ok(json.includes(collectibleId));
  assert.equal(JSON.stringify(snapshotState(state)), json, "dos snapshots sin avance deben ser idénticos");
  assert.equal(Object.values(snapshot).some((value) => value instanceof Set), false);

  const restored = createState(DEFAULT_LEVEL, JSON.parse(json));
  assert.equal(restored.collected.has(collectibleId), true);
  assert.equal(restored.checkpointId, checkpointId);
  assert.equal(restored.pulses, state.pulses);
});

test("createRuntime expone un adaptador sin DOM y limita la acumulación de tiempo", () => {
  const events = [];
  const create = () => createRuntime({
    level: DEFAULT_LEVEL,
    reducedMotion: true,
    onEvent(event) {
      events.push(event);
    },
  });
  const longFrame = create();
  const cappedFrame = create();
  for (const runtime of [longFrame, cappedFrame]) {
    assert.ok(runtime && runtime.state?.player);
    for (const method of ["start", "stop", "step", "render", "destroy", "snapshot", "moveToDebug"]) {
      assert.equal(typeof runtime[method], "function", `el runtime no expone ${method}`);
    }
    assert.ok(typeof runtime.hud === "function" || (runtime.hud && typeof runtime.hud === "object"));
    runtime.start();
  }

  longFrame.step(2, { right: true });
  cappedFrame.step(0.1, { right: true });
  assert.ok(finiteNumbers(longFrame.state).every(Number.isFinite));
  for (const key of ["x", "y", "vx", "vy"]) {
    assert.ok(Math.abs(longFrame.state.player[key] - cappedFrame.state.player[key]) < 0.001, `${key}: el delta suspendido no se limitó`);
  }
  assert.doesNotThrow(() => JSON.stringify(longFrame.snapshot()));
  longFrame.stop();
  cappedFrame.stop();
  longFrame.destroy();
  cappedFrame.destroy();
});

test("la cámara sigue el mismo recorrido con render a 30, 60 y 120 Hz", () => {
  const simulate = (fps) => {
    const runtime = createRuntime({ level: DEFAULT_LEVEL });
    const context = mockCanvasContext();
    runtime.moveToDebug("checkpoint");
    runtime.state.player.x = 3940;
    runtime.state.player.y = 372;
    runtime.state.player.previousY = 372;
    runtime.state.player.grounded = true;
    runtime.state.player.platformId = "roof-west";
    runtime.state.cameraX = 0;
    for (let frame = 0; frame < fps; frame += 1) {
      runtime.step(1 / fps, EMPTY_INPUT);
      runtime.render(context, 960, 624);
    }
    return runtime.state.cameraX;
  };
  const cameras = [30, 60, 120].map(simulate);
  assert.ok(Math.max(...cameras) - Math.min(...cameras) < 0.05, `la cámara varía con los Hz: ${cameras.join(", ")}`);
});

test("v2.1 publica un manifiesto agrupado de exactamente 50 mejoras únicas", () => {
  assert.equal(VERSION, 2.1);
  assert.equal(SNAPSHOT_VERSION, 2);
  assert.equal(PERSPECTIVE_FEATURES, FEATURES, "FEATURES debe ser un alias estable");
  assert.equal(Object.isFrozen(PERSPECTIVE_FEATURES), true);
  assert.equal(PERSPECTIVE_FEATURES.length, 50);
  assert.equal(new Set(PERSPECTIVE_FEATURES).size, 50);
  assert.ok(PERSPECTIVE_FEATURES.every((feature) => typeof feature === "string" && /^[a-z]+-[a-z0-9-]+$/.test(feature)));
  const grouped = Object.values(FEATURE_GROUPS).flat();
  assert.equal(grouped.length, 50);
  assert.deepEqual(new Set(grouped), new Set(PERSPECTIVE_FEATURES));
  assert.deepEqual(Object.keys(FEATURE_GROUPS), ["giro", "mundo", "fauna", "personaje", "misiones-rendimiento"]);
  assert.ok(Object.values(FEATURE_GROUPS).every((features) => features.length === 10));
  assert.deepEqual(FLIP_STAGES, ["anticipation", "fold", "cross", "settle"]);
  assert.equal(DEFAULT_LEVEL.missions, MISSION_STEPS);
  assert.equal(DEFAULT_LEVEL.missionSteps, MISSION_STEPS);
  assert.equal(DEFAULT_LEVEL.challenges, OPTIONAL_CHALLENGES);
  assert.deepEqual(OPTIONAL_CHALLENGES.map(({ id }) => id), ["naturalista", "acrobata", "origamista", "virtuoso"]);
  assert.match(OPTIONAL_CHALLENGES.find(({ id }) => id === "acrobata").objective, /tres plataformas distintas/i);
  assert.match(OPTIONAL_CHALLENGES.find(({ id }) => id === "origamista").objective, /tres bisagras distintas/i);
});

test("el pliegue recorre cuatro fases, frena y cruza una sola vez", () => {
  let state = createState(DEFAULT_LEVEL, { version: 2 });
  state.player.vx = 260;
  assert.equal(requestFlip(state, "perfil", DEFAULT_LEVEL, { forced: true, duration: 0.4 }), true);
  const speedAfterBrakeRequest = Math.abs(state.player.vx);
  const stages = [state.flip.stage];

  for (let frame = 0; frame < 120 && state.flip; frame += 1) {
    state = advance(state);
    const stage = state.flip?.stage;
    if (stage && stages.at(-1) !== stage) stages.push(stage);
  }

  assert.deepEqual(stages, FLIP_STAGES);
  assert.equal(state.mode, "perfil");
  assert.equal(state.flip, null);
  assert.ok(Math.abs(state.player.vx) < speedAfterBrakeRequest);
  const commits = state.events.filter(({ type }) => type === "flip-commit");
  assert.equal(commits.length, 1);
  assert.equal(commits[0].commitCount, 1);
  assert.deepEqual([0.05, 0.3, 0.55, 0.9].map(flipStage), FLIP_STAGES);
  assert.equal(flipStage({ elapsed: 1, duration: 2 }), "cross");

  const transform = buildingTransform(DEFAULT_LEVEL.buildings[0], 0.5, 0.5);
  assert.ok(transform.facade.progress > transform.side.progress);
  assert.ok(transform.side.progress > transform.roof.progress);
  assert.ok(transform.facade.scaleX !== 1 && transform.side.fold > 0 && transform.roof.lift !== 0);
});

test("el giro manual se deniega sin gastar pulso cuando el destino no tiene apoyo seguro", () => {
  const state = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  state.player.x = 4370;
  state.player.y = 344 - state.player.height;
  state.player.previousY = state.player.y;
  state.player.grounded = true;
  state.player.platformId = "roof-center";
  const pulses = state.pulses;

  assert.equal(safeFlipProjection(state, "diorama", DEFAULT_LEVEL), null, "roof-center no existe en Diorama");
  assert.deepEqual(
    { target: flipPreview(state, DEFAULT_LEVEL)?.target, safe: flipPreview(state, DEFAULT_LEVEL)?.safe },
    { target: "diorama", safe: false },
  );
  assert.equal(requestFlip(state, "diorama", DEFAULT_LEVEL), false);
  assert.equal(state.mode, "perfil");
  assert.equal(state.flip, null);
  assert.equal(state.pulses, pulses, "una proyección denegada no debe consumir el Compás");
  assert.equal(state.events.at(-1)?.reason, "unsafe-projection");

  const blockedLevel = clone(DEFAULT_LEVEL);
  blockedLevel.barriers.push({
    id: "solid-at-projection", x: 2028, y: 440, w: 64, h: 70,
    profileSolid: true, dioramaSolid: true,
  });
  const blocked = createState(blockedLevel, { version: 2, introSeen: true });
  blocked.player.x = 2040;
  blocked.player.y = blockedLevel.floorY - blocked.player.height;
  blocked.player.previousY = blocked.player.y;
  blocked.player.grounded = true;
  blocked.player.platformId = "fold-courtyard";
  const blockedPulses = blocked.pulses;
  assert.equal(requestFlip(blocked, "diorama", blockedLevel), false, "un sólido en el destino invalida el giro");
  assert.equal(blocked.pulses, blockedPulses);
});

test("el commit vuelve a validar el apoyo y cancela sin cambiar modo si éste desaparece", () => {
  const level = clone(DEFAULT_LEVEL);
  let state = createState(level, { version: 2, introSeen: true });
  state.player.x = 2040;
  state.player.y = level.floorY - state.player.height;
  state.player.previousY = state.player.y;
  state.player.grounded = true;
  state.player.platformId = "fold-courtyard";
  const pulses = state.pulses;
  assert.equal(requestFlip(state, "diorama", level, { duration: 0.4 }), true);
  const courtyard = level.platforms.find(({ id }) => id === "fold-courtyard");
  courtyard.modes = "perfil";

  state = runFor(state, 0.3, EMPTY_INPUT, 120, level);
  assert.equal(state.mode, "perfil");
  assert.equal(state.flip, null);
  assert.equal(state.pulses, pulses, "el pulso reservado debe devolverse al cancelar el commit");
  assert.equal(state.events.some(({ type }) => type === "flip-commit"), false);
  assert.equal(state.events.some(({ type, reason }) => type === "flip-denied" && reason === "unsafe-commit"), true);
});

test("las cuatro fases del giro bloquean movimiento, salto, profundidad y reinicio", () => {
  let state = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  state.player.x = 2040;
  state.player.y = DEFAULT_LEVEL.floorY - state.player.height;
  state.player.previousY = state.player.y;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.grounded = true;
  state.player.platformId = "fold-courtyard";
  state.checkpointId = "courtyard";
  const origin = { x: state.player.x, y: state.player.y, depth: state.depth };
  assert.equal(requestFlip(state, "diorama", DEFAULT_LEVEL, { forced: true, duration: 0.4 }), true);
  const stages = new Set();

  for (let frame = 0; frame < 120 && state.flip; frame += 1) {
    stages.add(state.flip.stage);
    state = advance(state, {
      right: true, down: true, run: true, jumpPressed: true, jumpHeld: true, restartPressed: true,
    });
  }
  assert.deepEqual([...stages], FLIP_STAGES);
  assert.equal(state.player.x, origin.x);
  assert.equal(state.player.y, origin.y);
  assert.equal(state.depth, origin.depth);
  assert.equal(state.player.grounded, true);
  assert.equal(state.events.some(({ type }) => type === "jump" || type === "respawn"), false);
  assert.equal(state.mode, "diorama");

  let reverse = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  reverse.mode = "diorama";
  reverse.blend = 0;
  reverse.depth = 60;
  reverse.player.x = 2040;
  reverse.player.y = DEFAULT_LEVEL.floorY - reverse.player.height;
  reverse.player.previousY = reverse.player.y;
  reverse.player.grounded = true;
  reverse.player.platformId = "fold-courtyard";
  assert.equal(requestFlip(reverse, "perfil", DEFAULT_LEVEL, { forced: true, duration: 0.4 }), true);
  while (reverse.flip) reverse = advance(reverse, { up: true, left: true, jumpPressed: true, restartPressed: true });
  assert.equal(reverse.depth, 60, "ni siquiera el retorno a Perfil debe consumir input de profundidad durante el giro");
  assert.equal(reverse.player.x, 2040);
  assert.equal(reverse.mode, "perfil");
});

test("anticipation conserva blend y geometría de origen y remapea el resto del giro", () => {
  let state = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  const fromBlend = state.blend;
  assert.equal(requestFlip(state, "diorama", DEFAULT_LEVEL, { forced: true, duration: 0.4 }), true);
  state = runFor(state, 0.075, EMPTY_INPUT, 120);
  assert.equal(state.flip.stage, "anticipation");
  assert.equal(state.blend, fromBlend);
  assert.equal(state.flip.geometryProgress, 0);
  assert.equal(buildingTransform(DEFAULT_LEVEL.buildings[0], state.blend, state.flip.geometryProgress).cascade, 0);

  while (state.flip && state.flip.elapsed / state.flip.duration < 0.3) state = advance(state);
  const rawProgress = state.flip.elapsed / state.flip.duration;
  const expectedGeometry = (rawProgress - 0.2) / 0.8;
  assert.ok(Math.abs(state.flip.geometryProgress - expectedGeometry) < 1e-9);
  assert.ok(state.blend < fromBlend);
});

test("la fauna queda anclada a plataformas, separa sombra/cuerpo y comprime el perfil", () => {
  let state = createState(DEFAULT_LEVEL, { version: 2 });
  assert.equal(DEFAULT_LEVEL.wildlife.some(({ behavior }) => behavior === "float"), false);
  for (const animal of state.wildlife) {
    const expectedGround = resolveWildlifeGroundY(animal, state, DEFAULT_LEVEL, state.time);
    assert.equal(animal.groundY, expectedGround, `${animal.id} no resolvió su plataforma activa`);
    assert.equal(animal.shadowY, animal.groundY);
    assert.equal(animal.bodyY, animal.groundY);
    assert.equal(animal.grounded, true);
    assert.notEqual(animal.behavior, "float");
  }

  assert.equal(requestFlip(state, "perfil", DEFAULT_LEVEL, { forced: true, duration: 0.4 }), true);
  state = runFor(state, 0.22, EMPTY_INPUT, 120);
  assert.ok(state.flip, "la muestra debe ocurrir durante el pliegue");
  assert.ok(state.wildlife.every(({ shadowY, groundY }) => shadowY === groundY));
  assert.ok(state.wildlife.every(({ bodyY, groundY }) => bodyY <= groundY));
  assert.ok(state.wildlife.every(({ edgeScale }) => edgeScale < 0.8));
  assert.ok(state.wildlife.every(({ singing, songFrame }) => singing && Number.isInteger(songFrame)));

  state = flipTo(state, "perfil", { forced: true }, DEFAULT_LEVEL);
  state = runFor(state, 0.12, EMPTY_INPUT, 120);
  assert.ok(state.wildlife.every(({ profileScaleX, edgeScale }) => profileScaleX < 0.8 && edgeScale < 0.8));
});

test("la fauna respeta grounding fijo y conserva su platformId sin saltos de suelo", () => {
  let lodState = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  lodState = runFor(lodState, 0.09, EMPTY_INPUT, 120);
  const nearAnimal = lodState.wildlife.find(({ id }) => id === "azahin-guide");
  const farAnimal = lodState.wildlife.find(({ id }) => id === "rebehielo-roof");
  assert.equal(nearAnimal.lodStride, 1);
  assert.equal(nearAnimal.renderAnimation, nearAnimal.animation);
  assert.equal(farAnimal.lodStride, 4);
  assert.ok(farAnimal.renderAnimation < farAnimal.animation, "el LOD lejano reduce sólo la actualización visual");

  const fixedLevel = clone(DEFAULT_LEVEL);
  fixedLevel.wildlife = [{
    ...fixedLevel.wildlife[0],
    id: "fixed-ground",
    x: 360,
    minX: 300,
    maxX: 430,
    behavior: "hop",
    grounding: { mode: "fixed", y: 333, offsetY: 7 },
  }];
  let fixed = createState(fixedLevel, { version: 2, introSeen: true });
  assert.equal(fixed.wildlife[0].grounding.mode, "fixed");
  assert.equal(fixed.wildlife[0].groundY, 340);
  fixed = runFor(fixed, 2, EMPTY_INPUT, 120, fixedLevel);
  assert.equal(fixed.wildlife[0].groundY, 340);
  assert.equal(fixed.wildlife[0].shadowY, 340);
  assert.ok(fixed.wildlife[0].bodyY <= 340, "sólo el cuerpo puede separarse del suelo durante el hop");

  const platformLevel = clone(DEFAULT_LEVEL);
  platformLevel.wildlife = [{
    ...platformLevel.wildlife[0],
    id: "platform-ground",
    x: 980,
    minX: 900,
    maxX: 1120,
    speed: 180,
    grounding: { mode: "platform", platformId: "meadow-start" },
  }];
  let platformState = createState(platformLevel, { version: 2, introSeen: true });
  for (let frame = 0; frame < 720; frame += 1) {
    platformState = advance(platformState, EMPTY_INPUT, FIXED_STEP, platformLevel);
    const animal = platformState.wildlife[0];
    assert.equal(animal.platformId, "meadow-start");
    assert.equal(animal.groundY, 510);
    assert.equal(animal.shadowY, 510);
  }
  assert.ok(platformState.wildlife[0].x <= 1010, "la patrulla no debe abandonar su plataforma fijada");

  const rebehielo = DEFAULT_LEVEL.wildlife.find(({ id }) => id === "rebehielo-roof");
  const roofWest = DEFAULT_LEVEL.platforms.find(({ id }) => id === "roof-west");
  assert.equal(rebehielo.grounding.platformId, roofWest.id);
  assert.ok(rebehielo.minX >= roofWest.x && rebehielo.maxX <= roofWest.x + roofWest.w);
});

test("completar la meta congela el crono y premio, no la exploración ni los retos", () => {
  let state = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  state.complete = true;
  state.phase = "complete";
  state.runTime = 12.5;
  DEFAULT_LEVEL.platforms.filter(({ precision }) => precision).forEach(({ id }) => state.precisionLandingIds.add(id));
  state.perfectLandings = state.precisionLandingIds.size;
  const startX = state.player.x;
  state = runFor(state, 0.5, { right: true, run: true }, 120);
  assert.ok(state.player.x > startX, "el jugador debe poder seguir explorando tras abrir la meta");
  assert.equal(state.runTime, 12.5);
  assert.equal(state.completedChallenges.has("acrobata"), true);
  assert.equal(state.events.filter(({ type }) => type === "complete").length, 0);

  state.player.x = 2040;
  state.player.y = DEFAULT_LEVEL.floorY - state.player.height;
  state.player.previousY = state.player.y;
  state.player.grounded = true;
  state.player.platformId = "fold-courtyard";
  assert.equal(requestFlip(state, "diorama", DEFAULT_LEVEL, { forced: true, duration: 0.08 }), true);
  state = runFor(state, 0.2, EMPTY_INPUT, 120);
  assert.equal(state.mode, "diorama");
  assert.equal(state.phase, "complete");
  assert.equal(state.runTime, 12.5);
});

test("paperFlow premia variedad, activa Rush una vez por subida y desbloquea Virtuoso", () => {
  assert.equal(PAPER_RUSH_THRESHOLD, 85);
  assert.equal(PAPER_RUSH_REARM, 55);
  assert.ok(PAPER_RUSH_DURATION >= 4 && PAPER_RUSH_DURATION <= 6);
  assert.deepEqual(
    [24, 25, 55].map((paperFlow) => {
      const state = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true, paperFlow });
      return [state.flowTier, state.flowLabel];
    }),
    [["calm", "CALMA"], ["rhythm", "RITMO"], ["fold", "PLIEGUE"]],
  );

  const repeated = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true });
  const firstGain = awardPaperFlow(repeated, "jump", 10);
  const repeatedGain = awardPaperFlow(repeated, "jump", 10);
  assert.ok(repeatedGain < firstGain * 0.3);
  assert.equal(repeated.styleChain, 1);

  let state = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true });
  for (const [action, amount] of [["jump", 6], ["spring", 10], ["discovery", 11], ["checkpoint", 14], ["seal", 16], ["flip", 14], ["perfect-land", 14]]) {
    awardPaperFlow(state, action, amount);
  }
  assert.ok(state.paperFlow >= PAPER_RUSH_THRESHOLD);
  assert.equal(state.flowTier, "rush");
  assert.equal(state.flowLabel, "PAPER RUSH");
  assert.equal(state.paperRushes, 1);
  assert.equal(paperRushSpeedMultiplier(state), 1.08);
  assert.equal(state.events.filter(({ type }) => type === "paper-rush").length, 1);
  assert.ok(state.events.some(({ type }) => type === "flow"));
  state = advance(state);
  assert.equal(state.completedChallenges.has("virtuoso"), true);

  state = runFor(state, PAPER_RUSH_DURATION + 0.1, EMPTY_INPUT, 120);
  assert.equal(state.rushTimer, 0);
  assert.ok(state.paperFlow <= 70);
  assert.equal(state.rushArmed, false);
  for (const [action, amount] of [["seal", 30], ["flip", 30], ["spring", 30]]) awardPaperFlow(state, action, amount);
  assert.equal(state.paperRushes, 1, "el latch evita reactivar Rush manteniendo flujo alto");
  state.paperFlow = 54;
  state = advance(state);
  assert.equal(state.rushArmed, true);
  awardPaperFlow(state, "checkpoint", 40);
  assert.equal(state.paperRushes, 2);
});

test("las springs son apoyos seguros y rebotan con land, cooldown y flujo", () => {
  const springs = DEFAULT_LEVEL.platforms.filter(({ kind }) => kind === "spring");
  assert.ok(springs.length >= 2 && springs.length <= 3);
  assert.equal(validationPassed(validateLevel(DEFAULT_LEVEL)), true);
  let state = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true });
  const spring = springs.find(({ id }) => id === "spring-canal-east") || springs[0];
  state = dropOntoPlatform(state, spring);

  const land = state.events.find(({ type, platformId }) => type === "land" && platformId === spring.id);
  assert.ok(land);
  assert.deepEqual(Object.keys(land).sort(), ["impact", "platformId", "speed", "strength", "type"]);
  assert.ok(land.impact >= 0 && land.impact <= 1);
  assert.equal(land.strength, "perfect");
  assert.ok(state.events.some(({ type, platformId }) => type === "spring" && platformId === spring.id));
  assert.equal(state.player.grounded, false);
  assert.ok(state.player.vy < -DEFAULT_LEVEL.physics.jumpVelocity);
  assert.ok(state.springCooldowns[spring.id] > 0 && state.springPulses[spring.id] > 0);
  assert.ok(state.events.filter(({ type }) => type === "flow").some(({ action }) => action === "spring"));
  assert.equal(state.events.filter(({ type }) => type === "flow").some(({ action }) => action === "perfect-land"), false);

  state.events.length = 0;
  state = runFor(state, 8, EMPTY_INPUT, 120);
  assert.equal(state.paperRushes, 0, "un rebote automático no puede farmear Paper Rush sin input");
  assert.equal(state.completedChallenges.has("virtuoso"), false);
  assert.equal(state.events.filter(({ type, action }) => type === "flow" && action === "spring").length, 0);
});

test("la restauración del core descarta IDs ajenos al nivel", () => {
  const validCollectible = DEFAULT_LEVEL.collectibles[0].id;
  const validWildlife = DEFAULT_LEVEL.wildlife[0].id;
  const state = createState(DEFAULT_LEVEL, {
    version: VERSION,
    introSeen: true,
    collected: [validCollectible, "ghost-seal-a", "ghost-seal-b", "ghost-seal-c"],
    wildlifeDiscovered: [validWildlife, "ghost-fauna-a", "ghost-fauna-b", "ghost-fauna-c", "ghost-fauna-d", "ghost-fauna-e", "ghost-fauna-f"],
    completedChallenges: ["naturalista", "ghost-challenge"],
    mission: { completed: [MISSION_STEPS[0].id, "ghost-mission"] },
  });

  assert.deepEqual([...state.collected], [validCollectible]);
  assert.deepEqual([...state.wildlifeDiscovered], [validWildlife]);
  assert.deepEqual([...state.completedChallenges], ["naturalista"]);
  assert.deepEqual([...state.mission.completed], [MISSION_STEPS[0].id]);
  assert.equal(state.gateOpen, 0);

  state.player.x = DEFAULT_LEVEL.goal.x;
  state.player.y = DEFAULT_LEVEL.floorY - state.player.height;
  const atLockedGoal = advance(state);
  assert.equal(atLockedGoal.complete, false);
  assert.equal(atLockedGoal.goalLocked, true);
  assert.deepEqual(snapshotState(atLockedGoal).collected, [validCollectible]);
});

test("Acróbata cuenta precisión central una sola vez por plataforma", () => {
  const precisionPlatforms = DEFAULT_LEVEL.platforms.filter(({ precision }) => precision);
  assert.equal(precisionPlatforms.length, 3);
  let state = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true });
  for (const platform of precisionPlatforms) state = dropOntoPlatform(state, platform);
  assert.equal(state.precisionLandingIds.size, 3);
  assert.equal(state.perfectLandings, 3);
  assert.equal(state.completedChallenges.has("acrobata"), true);

  state = dropOntoPlatform(state, precisionPlatforms[0]);
  assert.equal(state.precisionLandingIds.size, 3, "repetir plataforma no incrementa Acróbata");
  const ordinary = DEFAULT_LEVEL.platforms.find(({ id }) => id === "fold-courtyard");
  state = dropOntoPlatform(state, ordinary);
  assert.equal(state.precisionLandingIds.size, 3, "un aterrizaje perfecto fuera de plataforma precision no cuenta");

  const roof = DEFAULT_LEVEL.platforms.find(({ id }) => id === "roof-center");
  let normal = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true });
  normal = dropOntoPlatform(normal, roof, { offsetX: roof.w * 0.27 });
  assert.equal(normal.precisionLandingIds.has(roof.id), false);
  let assisted = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true, assist: true });
  assisted = dropOntoPlatform(assisted, roof, { offsetX: roof.w * 0.27 });
  assert.equal(assisted.precisionLandingIds.has(roof.id), true, "assist amplía la franja central");
  assert.ok(assisted.events.some(({ type, precision, newPrecision }) => type === "perfect-land" && precision && newPrecision));
});

test("Origamista exige tres bisagras distintas y se reinicia al caer o vencer la ventana", () => {
  const roofAnchors = ["anchor-roofs-west", "anchor-roofs", "anchor-roofs-east"]
    .map((id) => DEFAULT_LEVEL.foldAnchors.find((anchor) => anchor.id === id));
  assert.ok(roofAnchors.every(Boolean));
  const supports = ["roof-west", "hinge-step-east", "roof-east"]
    .map((id) => DEFAULT_LEVEL.platforms.find((platform) => platform.id === id));
  let state = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true });
  for (let index = 0; index < roofAnchors.length; index += 1) {
    const anchor = roofAnchors[index];
    const support = supports[index];
    const position = platformPosition(support, state.time);
    state.player.x = anchor.x;
    state.player.y = position.y - state.player.height;
    state.player.previousY = state.player.y;
    state.player.grounded = true;
    state.player.platformId = support.id;
    state = flipTo(state, state.mode === "perfil" ? "diorama" : "perfil", { duration: 0.08 });
  }
  assert.deepEqual([...state.flipComboAnchorIds].sort(), roofAnchors.map(({ id }) => id).sort());
  assert.equal(state.bestFlipCombo, 3);
  assert.equal(state.completedChallenges.has("origamista"), true);

  let repeated = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true });
  const westPosition = platformPosition(supports[0], repeated.time);
  repeated.player.x = roofAnchors[0].x;
  repeated.player.y = westPosition.y - repeated.player.height;
  repeated.player.previousY = repeated.player.y;
  repeated.player.grounded = true;
  repeated.player.platformId = supports[0].id;
  repeated = flipTo(repeated, "diorama", { duration: 0.08 });
  repeated = flipTo(repeated, "perfil", { duration: 0.08 });
  assert.equal(repeated.flipCombo, 1, "dos giros en la misma bisagra sólo cuentan una vez");
  repeated = runFor(repeated, 8.1, EMPTY_INPUT, 120);
  assert.equal(repeated.flipComboAnchorIds.size, 0);

  state.player.y = DEFAULT_LEVEL.height + 100;
  state.player.grounded = false;
  state = advance(state);
  assert.equal(state.flipComboAnchorIds.size, 0, "caer reinicia la cadena de bisagras");
});

test("el checkpoint post-wall acorta el retorno tras la fachada", () => {
  const checkpoint = DEFAULT_LEVEL.checkpoints.find(({ id }) => id === "post-wall");
  const support = DEFAULT_LEVEL.platforms.find(({ id }) => id === "post-wall");
  assert.ok(checkpoint && support);
  assert.ok(checkpoint.x >= support.x && checkpoint.x <= support.x + support.w);
  let state = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true, checkpointId: "courtyard" });
  state.player.x = checkpoint.x;
  state.player.y = checkpoint.y;
  state.player.previousY = checkpoint.y;
  state.player.grounded = true;
  state.player.platformId = support.id;
  state = advance(state);
  assert.equal(state.checkpointId, "post-wall");
  state.player.x += 120;
  state = advance(state, { restartPressed: true });
  assert.equal(state.player.x, checkpoint.x);
  assert.equal(state.player.y, checkpoint.y);
});

test("reduced-motion neutraliza impulsos y bob sin alterar la física", () => {
  const normal = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true });
  const reduced = createState(DEFAULT_LEVEL, { version: VERSION, introSeen: true, reducedMotion: true });
  spawnParticles(normal, "sparks", 1);
  spawnParticles(reduced, "sparks", 1);
  assert.ok(Math.hypot(reduced.particles[0].vx, reduced.particles[0].vy) < Math.hypot(normal.particles[0].vx, normal.particles[0].vy) * 0.25);

  let state = runFor(reduced, 0.1, EMPTY_INPUT, 120);
  assert.ok(state.wildlife.every(({ bodyOffsetY, grazeTilt, recoil, song }) => bodyOffsetY === 0 && grazeTilt === 0 && recoil === 0 && song === 0));
  for (const [action, amount] of [["jump", 20], ["seal", 30], ["flip", 40]]) awardPaperFlow(state, action, amount);
  assert.ok(state.rushTimer > 0);
  assert.equal(state.cameraImpulseX, 0);
  assert.equal(state.cameraImpulseY, 0);
  assert.equal(state.player.squashX, 1);
  assert.equal(state.player.squashY, 1);

  const spring = DEFAULT_LEVEL.platforms.find(({ id }) => id === "spring-canal-east");
  state = dropOntoPlatform(state, spring);
  assert.ok(state.events.some(({ type, platformId }) => type === "spring" && platformId === spring.id));
  assert.ok(state.player.vy < -DEFAULT_LEVEL.physics.jumpVelocity, "reduced-motion conserva el rebote jugable");
  assert.equal(state.cameraImpulseX, 0);
  assert.equal(state.cameraImpulseY, 0);
  assert.equal(state.player.squashX, 1);
  assert.equal(state.player.squashY, 1);

  const profileOnly = DEFAULT_LEVEL.platforms.find(({ id }) => id === "roof-center");
  const visualState = { ...state, mode: "perfil", flip: { from: "perfil", to: "diorama", geometryProgress: 0.5 } };
  const halfway = platformVisualState(profileOnly, visualState);
  assert.ok(halfway.visibility > 0.18 && halfway.visibility < 1, "la visibilidad de cara interpola sin pop");
  assert.equal(halfway.scaleY, 1, "movimiento reducido evita squash visual de plataforma");
});

test("las patrullas con pausas, reacciones y descubrimientos son deterministas", () => {
  const simulate = () => {
    let state = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
    for (let frame = 0; frame < 1_800; frame += 1) {
      state = advance(state, frame % 480 < 150 ? { right: true } : EMPTY_INPUT);
    }
    return state;
  };
  const first = simulate();
  const second = simulate();
  assert.deepEqual(first.wildlife, second.wildlife);
  assert.deepEqual([...first.wildlifeDiscovered], [...second.wildlifeDiscovered]);
  assert.ok(first.wildlife.some(({ pauseTimer, reaction }) => pauseTimer > 0 || reaction !== "calm"));
  assert.ok(first.wildlifeDiscovered.size > 0, "la proximidad debe producir descubrimientos discretos");
  const discoveryEvents = first.events.filter(({ type }) => type === "wildlife-discovered");
  assert.equal(new Set(discoveryEvents.map(({ wildlifeId }) => wildlifeId)).size, discoveryEvents.length);
});

test("la cadena principal completa cinco pasos una sola vez", () => {
  let state = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  const guide = state.wildlife[0];
  state.player.x = guide.x - state.player.width / 2;
  state = runFor(state, 0.12, EMPTY_INPUT, 120);
  assert.equal(state.mission.currentIndex, 1);

  state = flipTo(state, "diorama", { forced: true, duration: 0.08 });
  assert.equal(state.mission.currentIndex, 2);
  DEFAULT_LEVEL.collectibles.forEach(({ id }) => state.collected.add(id));
  state = advance(state);
  assert.equal(state.mission.currentIndex, 3);
  state.checkpointId = "rooftops";
  state = advance(state);
  assert.equal(state.mission.currentIndex, 4);
  state.complete = true;
  state.phase = "complete";
  state = advance(state);
  assert.equal(state.mission.currentIndex, 5);

  const stepEvents = state.events.filter(({ type }) => type === "mission-step");
  assert.equal(stepEvents.length, 5);
  assert.deepEqual(stepEvents.map(({ stepId }) => stepId), MISSION_STEPS.map(({ id }) => id));
  state = runFor(state, 1, EMPTY_INPUT, 120);
  assert.equal(state.events.filter(({ type }) => type === "mission-step").length, 5);
});

test("los cuatro retos y el progreso v2.1 sobreviven snapshot/restauración", () => {
  let state = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  for (const animal of state.wildlife) {
    state.player.x = animal.x - state.player.width / 2;
    state = runFor(state, 0.1, EMPTY_INPUT, 120);
  }
  assert.equal(state.wildlifeDiscovered.size, state.wildlife.length);
  assert.equal(state.completedChallenges.has("naturalista"), true);

  DEFAULT_LEVEL.platforms.filter(({ precision }) => precision).forEach(({ id }) => state.precisionLandingIds.add(id));
  state.perfectLandings = state.precisionLandingIds.size;
  state = advance(state);
  assert.equal(state.completedChallenges.has("acrobata"), true);
  DEFAULT_LEVEL.foldAnchors.slice(-3).forEach(({ id }) => state.flipComboAnchorIds.add(id));
  state.flipCombo = state.flipComboAnchorIds.size;
  state.bestFlipCombo = state.flipCombo;
  state.flipComboTimer = 8;
  for (const [action, amount] of [["jump", 6], ["spring", 10], ["discovery", 11], ["checkpoint", 14], ["seal", 16], ["flip", 14], ["perfect-land", 14]]) {
    awardPaperFlow(state, action, amount);
  }
  state = advance(state);
  assert.equal(state.bestFlipCombo, 3);
  assert.equal(state.completedChallenges.has("origamista"), true);
  assert.equal(state.completedChallenges.has("virtuoso"), true);
  assert.deepEqual(
    OPTIONAL_CHALLENGES.map(({ id }) => state.completedChallenges.has(id)),
    [true, true, true, true],
  );

  const snapshot = snapshotState(state);
  const restored = createState(DEFAULT_LEVEL, JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual([...restored.wildlifeDiscovered].sort(), [...state.wildlifeDiscovered].sort());
  assert.deepEqual([...restored.completedChallenges].sort(), [...state.completedChallenges].sort());
  assert.deepEqual([...restored.mission.completed], [...state.mission.completed]);
  assert.equal(restored.perfectLandings, 3);
  assert.deepEqual([...restored.precisionLandingIds].sort(), [...state.precisionLandingIds].sort());
  assert.deepEqual([...restored.flipComboAnchorIds].sort(), [...state.flipComboAnchorIds].sort());
  assert.equal(restored.flipCombo, state.flipCombo);
  assert.equal(restored.bestFlipCombo, state.bestFlipCombo);
  assert.equal(restored.paperRushes, state.paperRushes);
  assert.equal(restored.paperFlow, state.paperFlow);
  assert.deepEqual(snapshotState(restored), snapshot);
});

test("las partículas permanecen acotadas y el HUD expone el contrato v2.1", () => {
  const state = createState(DEFAULT_LEVEL, { version: 2, introSeen: true });
  for (const kind of ["dust", "leaves", "sparks", "confetti", "ring"]) spawnParticles(state, kind, 500);
  assert.ok(state.particles.length <= MAX_PARTICLES);
  assert.ok(state.particles.every(({ kind }) => ["dust", "leaves", "sparks", "confetti", "ring"].includes(kind)));
  assert.ok(state.particles.every(({ shape, color }) => typeof shape === "string" && typeof color === "string"));

  const runtime = createRuntime({ progress: snapshotState(state) });
  const hud = runtime.hud();
  for (const key of [
    "missionTitle", "objective", "progress", "stage", "count", "missionObjective", "missionProgress",
    "missionStage", "missionCount", "discoveries", "wildlifeTotal", "completedChallenges",
    "challengesCompleted", "flipCombo", "bestFlipCombo", "perfectLandings", "flipStage",
    "paperFlow", "flowTier", "flowLabel", "styleChain", "bestStyleChain", "rushTimer", "paperRushes",
  ]) assert.ok(Object.hasOwn(hud, key), `HUD v2 no expone ${key}`);
  assert.equal(hud.count, 5);
  assert.equal(hud.missionCount, 5);
  assert.equal(hud.wildlifeTotal, DEFAULT_LEVEL.wildlife.length);
  runtime.destroy();
});
