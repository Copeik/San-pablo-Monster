import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildStandardCompliance,
  serializeCompliance,
} from "../tools/assets/check-standard-assets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("el gate standard registra los 93 Pokémon como animation-only", async () => {
  const report = await buildStandardCompliance(projectRoot);

  assert.equal(report.valid, false);
  assert.equal(report.summary.pokemon.total, 93);
  assert.equal(report.summary.pokemon.compliant, 93);
  assert.equal(report.summary.pokemon.missingOrInvalid, 0);
  assert.equal(report.summary.pokemon.animationOnlyPacks, 93);
  assert.equal(report.summary.pokemon.completeLegacyAnimationPacks, 0);
  assert.equal(report.contracts.pokemon, "pokemon-animation-only-v1");
  assert.equal(report.summary.moves.total, 44);
  assert.equal(report.summary.moves.dedicatedLegacyEffects, 1);
  assert.equal(report.summary.npcs.total, 48);
  assert.equal(report.summary.npcs.geometryReadyLegacySheets, 48);
  assert.equal(report.summary.npcs.compliant, 48);
  assert.equal(report.summary.npcs.missingOrInvalid, 0);
  assert.equal(report.summary.world.total, 110);
  assert.equal(report.summary.world.legacyMediaReady, 110);
  assert.equal(report.summary.world.compliant, 0);
  assert.equal(report.summary.runtimeSourceLeaks, 0);

  assert.deepEqual(
    report.pokemon.filter((entry) => entry.status === "compliant").map((entry) => entry.speciesId),
    report.pokemon.map((entry) => entry.speciesId),
  );
  const animationOnlySlots = [
    "idle-front.webp",
    "idle-back.webp",
    "attack-physical-front.webp",
    "attack-physical-back.webp",
    "attack-special-front.webp",
    "attack-special-back.webp",
  ];
  for (const [speciesId, slug] of [[4, "braspin"], [5, "ascuero"], [6, "volcazote"]]) {
    const pokemon = report.pokemon.find((entry) => entry.speciesId === speciesId);
    assert.equal(pokemon.profile, "pokemon-animation-only-v1");
    assert.equal(pokemon.animationOnly, true);
    assert.equal(pokemon.hasStaticAssets, false);
    assert.ok(pokemon.standardBytes > 0 && pokemon.standardBytes < 1_000_000);
    assert.deepEqual(pokemon.issues, []);
    assert.deepEqual(Object.keys(pokemon.standardSlots), animationOnlySlots);
    assert.deepEqual(
      Object.values(pokemon.standardSlots),
      animationOnlySlots.map((slot) => `assets/pokemon/braspy-line/${slug}/${slot}`),
    );
  }

  const ember = report.moves.find((move) => move.moveId === "ember");
  assert.equal(ember.entitySlug, "ascuas");
  assert.match(ember.legacyEffect, /ascuas-sol-explosivo\.webp$/);

  const petrillo = report.pokemon.find((entry) => entry.speciesId === 9001);
  assert.equal(petrillo.profile, "pokemon-animation-only-v1");
  assert.equal(petrillo.animationOnly, true);
  assert.equal(petrillo.hasStaticAssets, false);
  assert.equal(petrillo.currentAnimationFiles, 6);
  assert.deepEqual(petrillo.issues, []);
  assert.equal(petrillo.standardFolder, "assets/pokemon/petrillo-line/petrillo");

  const bench = report.world.find((entry) => entry.assetId === "bench");
  assert.equal(bench.entitySlug, "bench");
  assert.equal(bench.legacyPath, "assets/generated/san-pablo-derived/runtime/prop-park-bench.png");
  assert.ok(bench.issues.includes("standard-folder-missing"));
});

test("el informe de conformidad es determinista", async () => {
  const first = serializeCompliance(await buildStandardCompliance(projectRoot));
  const second = serializeCompliance(await buildStandardCompliance(projectRoot));
  assert.equal(first, second);
  assert.equal(first.includes(projectRoot.replaceAll("\\", "/")), false);
});
