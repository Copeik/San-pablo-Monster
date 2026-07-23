import assert from "node:assert/strict";
import { test } from "node:test";

await import("../perspective-zone-core.js");

const {
  DEFAULT_LEVEL,
  DIORAMA_MODE,
  HUD_REFRESH_INTERVAL,
  createRuntime,
  requestFlip,
} = globalThis.PERSPECTIVE_ZONE_CORE;

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

test("el HUD estable se reutiliza y se refresca como m\u00e1ximo a 10 Hz", () => {
  assert.equal(HUD_REFRESH_INTERVAL, 0.1);
  const runtime = createRuntime({ level: DEFAULT_LEVEL });
  const context = mockCanvasContext();
  runtime.moveToDebug("checkpoint");
  runtime.state.player.x = 4370;
  runtime.state.player.y = 344 - runtime.state.player.height;
  runtime.state.player.previousY = runtime.state.player.y;
  runtime.state.player.grounded = true;
  runtime.state.player.platformId = "roof-center";

  const initial = runtime.hud();
  assert.ok(initial.flipPreview, "el punto de depuraci\u00f3n debe exponer una previsualizaci\u00f3n");
  runtime.render(context, 960, 624);
  assert.strictEqual(runtime.hud(), initial, "render y HUD deben compartir el snapshot y la previsualizaci\u00f3n");

  runtime.destroy();
  const tickingRuntime = createRuntime({ level: DEFAULT_LEVEL });
  const tickingInitial = tickingRuntime.hud();

  tickingRuntime.step(0.05, {});
  assert.strictEqual(tickingRuntime.hud(), tickingInitial, "un frame estable no debe reconstruir el HUD");
  tickingRuntime.step(0.05, {});
  assert.notStrictEqual(tickingRuntime.hud(), tickingInitial, "el HUD continuo debe publicar un valor nuevo a los 100 ms");
  tickingRuntime.destroy();
});

test("misi\u00f3n, giro, Rush y ayuda invalidan la cach\u00e9 sin esperar al intervalo", () => {
  const runtime = createRuntime({ level: DEFAULT_LEVEL });
  runtime.moveToDebug("flip");

  let previous = runtime.hud();
  runtime.state.assist = !runtime.state.assist;
  let current = runtime.hud();
  assert.notStrictEqual(current, previous);
  assert.equal(current.assist, runtime.state.assist);

  previous = current;
  runtime.state.mission.currentIndex = Math.min(1, runtime.state.mission.currentIndex + 1);
  current = runtime.hud();
  assert.notStrictEqual(current, previous);

  previous = current;
  runtime.state.rushTimer = 4.8;
  runtime.state.flowTier = "rush";
  runtime.state.flowLabel = "PAPER RUSH";
  current = runtime.hud();
  assert.notStrictEqual(current, previous);
  assert.equal(current.flowTier, "rush");

  previous = current;
  assert.equal(requestFlip(runtime.state, DIORAMA_MODE, DEFAULT_LEVEL, { forced: true }), false);
  assert.equal(requestFlip(runtime.state, "perfil", DEFAULT_LEVEL, { forced: true }), true);
  current = runtime.hud();
  assert.notStrictEqual(current, previous);
  assert.equal(current.flipStage, "anticipation");
  assert.equal(current.flipPreview, null);
  runtime.destroy();
});
