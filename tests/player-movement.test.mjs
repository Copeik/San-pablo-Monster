import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePlayerDirectionalSprite } from "../tools/validate-player-directional-sprite.mjs";

await import("../player-movement.js");

const { advanceAnimationPhase, movementIntent, smoothVelocity } = globalThis.PLAYER_MOVEMENT_CORE;

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

test("walk animation starts at neutral and advances by distance without a run-toggle phase jump", () => {
  let phase = advanceAnimationPhase(0, 11.9, false);
  assert.equal(Math.floor(phase), 0);
  phase = advanceAnimationPhase(phase, .1, false);
  assert.equal(Math.floor(phase), 1);
  assert.equal(advanceAnimationPhase(phase, 0, true), phase);
  phase = advanceAnimationPhase(phase, 16, true);
  assert.equal(Math.floor(phase), 2);
  phase = advanceAnimationPhase(phase, 32, true);
  assert.equal(Math.floor(phase), 0);
});

test("the transparent diagonal sprite sheet is present and wired into the renderer", () => {
  const sprite = readFileSync(new URL("../assets/sprites/protagonist-walk-diagonal.png", import.meta.url));
  const runtime = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const standard = JSON.parse(readFileSync(new URL("../assets/sprites/player-directional-sprite-standard.json", import.meta.url), "utf8"));
  const report = validatePlayerDirectionalSprite(new URL("../assets/sprites/protagonist-walk-diagonal.png", import.meta.url));

  assert.deepEqual([...sprite.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(sprite.readUInt32BE(16), 256);
  assert.equal(sprite.readUInt32BE(20), 256);
  assert.equal(sprite[25], 6);
  assert.equal(report.valid, true, report.failures.join("\n"));
  assert.equal(report.scaleDriftPercent, 0);
  assert.deepEqual(standard.cycle, ["neutral", "stride-a", "neutral", "stride-b"]);
  assert.equal(standard.anchors.feetRow, 59);
  assert.equal(standard.oppositeDirectionPolicy, "exact-horizontal-pixel-mirror");
  assert.match(runtime, /PLAYER_DIAGONAL_SHEET_URL/);
  assert.match(runtime, /0, 0, SPRITE_CELL_SIZE, SPRITE_CELL_SIZE/);
  assert.match(runtime, /"down-left": 0[\s\S]*"down-right": 1[\s\S]*"up-left": 2[\s\S]*"up-right": 3/);
  assert.match(runtime, /playerAnimationDirection = intent\.animationDirection/);
  assert.match(runtime, /const requestedDirection = playerAnimationDirection \|\| state\.direction/);
  assert.doesNotMatch(runtime, /animationTime < frameDuration/);
});
