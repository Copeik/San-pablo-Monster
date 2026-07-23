import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MOVE_IDS = [
  "tackle", "vineWhip", "scratch", "ember", "waterGun", "gust", "quickAttack",
  "bugBite", "poisonSting", "thunderShock", "absorb", "lick", "confusion",
  "headbutt", "metalSound", "dragonRage", "stoneSeal", "earthPress", "scaleRush",
  "razorWing", "prairieDive", "moonGleam", "dreamWhisper", "astralGuard",
  "shadowPrank", "lanternDrain", "eternalNight", "sparkSnout", "stormWing",
  "nectarNeedle", "bloodStinger", "wingFeint", "silkEscape", "toxicThread",
  "hallucinationDust", "spiritDistill", "aioliBlaze", "toxicFume", "darkPilfer",
  "iceFist", "mountainJab", "citrusVolt", "riverWhisker", "forgeSlash",
];

async function loadAttackEffects() {
  const source = await readFile(path.join(root, "attack-effects.js"), "utf8");
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "attack-effects.js" });
  return sandbox.AttackEffects;
}

test("all 44 lowerCamelCase move IDs survive serialize/parse round trips", async () => {
  const attackEffects = await loadAttackEffects();
  const moveTypes = Object.fromEntries(MOVE_IDS.map((moveId) => [moveId, "Normal"]));
  const profiles = Object.fromEntries(MOVE_IDS.map((moveId) => [moveId, {
    preset: moveId === "ember" ? "fire" : "normal",
  }]));

  const serialized = attackEffects.serializePack(profiles, moveTypes);
  const envelope = JSON.parse(serialized);
  const imported = attackEffects.parsePack(serialized, moveTypes);

  assert.equal(envelope.kind, "pokemon-city-attack-effects");
  assert.equal(envelope.schemaVersion, 1);
  assert.deepEqual(Object.keys(envelope.effects), MOVE_IDS);
  assert.deepEqual(Object.keys(imported.effects), MOVE_IDS);
  assert.deepEqual([...imported.ignored], []);
});

test("pack parser requires the exact kind and numeric supported schema version", async () => {
  const attackEffects = await loadAttackEffects();
  const valid = {
    kind: "pokemon-city-attack-effects",
    schemaVersion: 1,
    effects: {},
  };

  assert.doesNotThrow(() => attackEffects.parsePack(JSON.stringify(valid)));

  for (const invalid of [
    { ...valid, kind: "another-kind" },
    { schemaVersion: 1, effects: {} },
  ]) {
    assert.throws(() => attackEffects.parsePack(JSON.stringify(invalid)), /kind|tipo/i);
  }

  for (const invalid of [
    { ...valid, schemaVersion: "1" },
    { ...valid, schemaVersion: "banana" },
    { ...valid, schemaVersion: 0 },
    { kind: valid.kind, effects: {} },
  ]) {
    assert.throws(() => attackEffects.parsePack(JSON.stringify(invalid)), /schemaVersion|versi/i);
  }

  assert.throws(
    () => attackEffects.parsePack(JSON.stringify({ ...valid, schemaVersion: 2 })),
    /versi.*n m.*s nueva/i,
  );
  assert.throws(
    () => attackEffects.parsePack(JSON.stringify({ ...valid, effects: [] })),
    /effects|efectos/i,
  );
});

test("unknown safe move entries are quarantined losslessly while unsafe IDs stay ignored", async () => {
  const attackEffects = await loadAttackEffects();
  const moveTypes = { ember: "Fuego" };
  const imported = attackEffects.parsePack(JSON.stringify({
    kind: "pokemon-city-attack-effects",
    schemaVersion: 1,
    effects: {
      ember: { preset: "fire" },
      futureMove: {
        preset: "psychic",
        futureConfig: { stages: [1, 2, 3], label: "preserve-me" },
      },
      "../unsafe": { preset: "fire" },
    },
  }), moveTypes);

  assert.deepEqual(Object.keys(imported.effects), ["ember"]);
  assert.deepEqual([...imported.ignored].sort(), ["../unsafe", "futureMove"]);
  assert.equal(Object.getPrototypeOf(imported.unknownEffects), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(imported.unknownEffects.futureMove)),
    {
      preset: "psychic",
      futureConfig: { stages: [1, 2, 3], label: "preserve-me" },
    },
  );
  assert.equal(imported.unknownEffects["../unsafe"], undefined);

  const reserialized = JSON.parse(attackEffects.serializePack(imported, moveTypes));
  assert.deepEqual(reserialized.effects.futureMove, {
    preset: "psychic",
    futureConfig: { stages: [1, 2, 3], label: "preserve-me" },
  });
  assert.equal(reserialized.effects["../unsafe"], undefined);

  const reserializedWithoutRegistry = JSON.parse(attackEffects.serializePack(imported));
  assert.deepEqual(reserializedWithoutRegistry.effects.futureMove, {
    preset: "psychic",
    futureConfig: { stages: [1, 2, 3], label: "preserve-me" },
  });
});
