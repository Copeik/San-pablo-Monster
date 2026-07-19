import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePlayerDirectionalSprite } from "../tools/validate-player-directional-sprite.mjs";

await import("../player-movement.js");

const {
  WALK_FRAME_COUNT,
  advanceAnimationPhase,
  movementIntent,
  smoothVelocity,
} = globalThis.PLAYER_MOVEMENT_CORE;

test("diagonal movement is normalized and uses the most recently pressed facing direction", () => {
  const intent = movementIntent({ up: true, right: true }, "right");

  assert.equal(intent.active, true);
  assert.equal(intent.diagonal, true);
  assert.equal(intent.direction, "right");
  assert.equal(intent.animationDirection, "up-right");
  assert.ok(Math.abs(Math.hypot(intent.x, intent.y) - 1) < 1e-12);
  assert.ok(intent.x > 0);
  assert.ok(intent.y < 0);
});

test("diagonal facing can follow either active axis without losing animation direction", () => {
  const facingLeft = movementIntent({ down: true, left: true }, "left");
  const facingDown = movementIntent({ down: true, left: true }, "down");
  assert.equal(facingLeft.direction, "left");
  assert.equal(facingDown.direction, "down");
  assert.equal(facingLeft.animationDirection, "down-left");
  assert.equal(facingDown.animationDirection, "down-left");
});

test("all four diagonal input combinations select their own sprite rows", () => {
  assert.equal(movementIntent({ up: true, left: true }, "up").animationDirection, "up-left");
  assert.equal(movementIntent({ up: true, right: true }, "up").animationDirection, "up-right");
  assert.equal(movementIntent({ down: true, left: true }, "down").animationDirection, "down-left");
  assert.equal(movementIntent({ down: true, right: true }, "down").animationDirection, "down-right");
});

test("opposing keys cancel cleanly", () => {
  const intent = movementIntent({ up: true, down: true, left: true, right: true }, "up");

  assert.equal(intent.active, false);
  assert.deepEqual([intent.x, intent.y], [0, 0]);
});

test("velocity easing is stable across different frame sizes", () => {
  let sixtyFps = { x: 0, y: 0 };
  for (let frame = 0; frame < 60; frame += 1) {
    sixtyFps = smoothVelocity(sixtyFps, { x: 108, y: 0 }, 1 / 60, 18);
  }
  const oneStep = smoothVelocity({ x: 0, y: 0 }, { x: 108, y: 0 }, 1, 18);

  assert.ok(Math.abs(sixtyFps.x - oneStep.x) < .02);
  assert.ok(sixtyFps.x > 107.9 && sixtyFps.x <= 108);
  assert.equal(sixtyFps.y, 0);
});

test("the six-frame PixelLab walk cycle advances by distance without a run-toggle phase jump", () => {
  assert.equal(WALK_FRAME_COUNT, 6);
  let phase = advanceAnimationPhase(0, 11.9, false);
  assert.equal(Math.floor(phase), 0);
  phase = advanceAnimationPhase(phase, .1, false);
  assert.equal(Math.floor(phase), 1);
  assert.equal(advanceAnimationPhase(phase, 0, true), phase);
  phase = advanceAnimationPhase(phase, 16, true);
  assert.equal(Math.floor(phase), 2);
  phase = advanceAnimationPhase(phase, 32, true);
  assert.equal(Math.floor(phase), 4);
  phase = advanceAnimationPhase(phase, 32, true);
  assert.equal(Math.floor(phase), 0);
});

test("the eight-direction PixelLab walk atlas is present and wired into the renderer", () => {
  const sprite = readFileSync(new URL("../assets/sprites/protagonist-walk-pixellab.png", import.meta.url));
  const runtime = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const standard = JSON.parse(readFileSync(new URL("../assets/sprites/player-directional-sprite-standard.json", import.meta.url), "utf8"));
  const report = validatePlayerDirectionalSprite(new URL("../assets/sprites/protagonist-walk-pixellab.png", import.meta.url));

  assert.deepEqual([...sprite.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(sprite.readUInt32BE(16), 384);
  assert.equal(sprite.readUInt32BE(20), 512);
  assert.equal(sprite[25], 6);
  assert.equal(report.valid, true, report.failures.join("\n"));
  assert.equal(report.frameCount, 6);
  assert.equal(standard.source, "PixelLab MCP");
  assert.equal(standard.characterId, "b96197cb-8527-4fdf-bd6d-d48c01c41804");
  assert.equal(standard.cycle.length, 6);
  assert.equal(standard.rowOrder.length, 8);
  assert.match(runtime, /protagonist-walk-pixellab\.png/);
  assert.match(runtime, /const PLAYER_WALK_FRAME_COUNT = 6/);
  assert.match(runtime, /const PLAYER_DIRECTION_ROWS = Object\.freeze/);
  assert.match(runtime, /Array\.from\(\{ length: PLAYER_WALK_FRAME_COUNT \}/);
  assert.match(runtime, /dataset\.playerAnimationSource = "pixellab:b96197cb-8527-4fdf-bd6d-d48c01c41804:walk"/);
  assert.match(runtime, /playerAnimationDirection = intent\.animationDirection/);
  assert.match(runtime, /const requestedDirection = playerAnimationDirection \|\| state\.direction/);
  assert.match(runtime, /animationFrame = Math\.floor\(animationPhase\) % PLAYER_WALK_FRAME_COUNT/);
});
