import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadAttackEffects() {
  const source = await readFile(path.join(root, "attack-effects.js"), "utf8");
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "attack-effects.js" });
  return sandbox.AttackEffects;
}

test("attack effect defaults follow the move type and selected preset", async () => {
  const effects = await loadAttackEffects();
  assert.equal(effects.defaultProfile("Fuego").preset, "fire");
  assert.equal(effects.defaultProfile("Agua").preset, "water");

  const waterOverride = effects.normalizeProfile({ preset: "water" }, "Fuego");
  assert.equal(waterOverride.preset, "water");
  assert.equal(waterOverride.color, effects.PRESETS.water.color);
  assert.equal(waterOverride.width, effects.PRESETS.water.width);
  assert.equal(waterOverride.height, effects.PRESETS.water.height);
});

test("attack effect profiles sanitize editable dimensions, offsets, color and timing", async () => {
  const effects = await loadAttackEffects();
  const profile = effects.normalizeProfile({
    color: "#ABC",
    width: 999,
    height: -20,
    offsetX: 900,
    offsetY: -900,
    duration: 25,
    particles: 99,
    rings: -2,
    shake: 9,
    impactScale: 0,
  }, "Normal");

  assert.equal(profile.color, "#aabbcc");
  assert.equal(profile.width, effects.LIMITS.width[1]);
  assert.equal(profile.height, effects.LIMITS.height[0]);
  assert.equal(profile.offsetX, effects.LIMITS.offsetX[1]);
  assert.equal(profile.offsetY, effects.LIMITS.offsetY[0]);
  assert.equal(profile.duration, effects.LIMITS.duration[0]);
  assert.equal(profile.particles, effects.LIMITS.particles[1]);
  assert.equal(profile.rings, effects.LIMITS.rings[0]);
  assert.equal(profile.shake, effects.LIMITS.shake[1]);
  assert.equal(profile.impactScale, effects.LIMITS.impactScale[0]);
});

test("long effects keep their last configured ring inside the playback window", async () => {
  const effects = await loadAttackEffects();
  assert.equal(effects.travelTail({ preset: "electric", duration: 1600, rings: 6 }), 2180);
  assert.equal(effects.travelTail({ preset: "fire", duration: 470, rings: 0 }), 645);
});

test("effect pack import accepts known moves, ignores unknown entries and rejects future schemas", async () => {
  const effects = await loadAttackEffects();
  const moveTypes = { ember: "Fuego", waterGun: "Agua" };
  const imported = effects.parsePack(JSON.stringify({
    kind: "pokemon-city-attack-effects",
    schemaVersion: 1,
    effects: {
      ember: { preset: "electric", color: "#123456", width: 44 },
      unknownMove: { preset: "ghost" },
      "../unsafe": { preset: "fire" },
    },
  }), moveTypes);

  assert.deepEqual(Object.keys(imported.effects), ["ember"]);
  assert.equal(imported.effects.ember.preset, "electric");
  assert.equal(imported.effects.ember.color, "#123456");
  assert.equal(imported.effects.ember.width, 44);
  assert.deepEqual([...imported.ignored].sort(), ["../unsafe", "unknownMove"]);
  assert.throws(
    () => effects.parsePack('{"kind":"pokemon-city-attack-effects","schemaVersion":2,"effects":{}}', moveTypes),
    /versión más nueva/,
  );
});

test("Ataquedex is loaded before the game and battle playback resolves complete move profiles", async () => {
  const [html, script, styles] = await Promise.all([
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);

  assert.match(html, /id="attackDexModal"/);
  assert.ok(html.indexOf("attack-effects.js") < html.indexOf("script.js"));
  assert.match(script, /await animateMove\(elements\.activeSprite, elements\.enemySprite, move\)/);
  assert.match(script, /await animateMove\(elements\.enemySprite, elements\.activeSprite, move\)/);
  assert.match(script, /ATTACK_EFFECTS\.serializePack/);
  assert.match(styles, /\.fx-custom-color\.fx-move-projectile/);
});
