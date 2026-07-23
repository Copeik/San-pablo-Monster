import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lineRoot = path.join(root, "assets", "pokemon", "braspy-line");
const stages = [
  { id: 4, slug: "braspin" },
  { id: 5, slug: "ascuero" },
  { id: 6, slug: "volcazote" },
];
const slots = Object.freeze([
  ["idle-front.webp", 120, 0],
  ["idle-back.webp", 120, 0],
  ["attack-physical-front.webp", 90, 1],
  ["attack-physical-back.webp", 90, 1],
  ["attack-special-front.webp", 90, 1],
  ["attack-special-back.webp", 90, 1],
]);

function webpChunks(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  const chunks = new Map();
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    chunks.set(name, [...(chunks.get(name) || []), { offset, size }]);
    offset += 8 + size + (size & 1);
  }
  return chunks;
}

function assertAnimationOnlyWebp(asset, frameMs, loop) {
  const chunks = webpChunks(asset);
  const vp8x = chunks.get("VP8X")?.[0];
  const anim = chunks.get("ANIM")?.[0];
  const frames = chunks.get("ANMF") || [];
  assert.ok(vp8x, "VP8X metadata is required");
  assert.ok(anim, "ANIM metadata is required");
  assert.equal(asset[vp8x.offset + 8] & 0x12, 0x12, "alpha and animation flags");
  assert.equal(asset.readUIntLE(vp8x.offset + 12, 3) + 1, 384);
  assert.equal(asset.readUIntLE(vp8x.offset + 15, 3) + 1, 384);
  assert.equal(asset.readUInt16LE(anim.offset + 12), loop);
  assert.ok(frames.length >= 1 && frames.length <= 8);
  const durations = frames.map(({ offset }) => asset.readUIntLE(offset + 20, 3));
  assert.ok(durations.every((duration) => duration > 0 && duration % frameMs === 0));
  assert.equal(durations.reduce((sum, duration) => sum + duration, 0), frameMs * 8);
}

test("la línea Braspín contiene únicamente tres carpetas animation-only", async () => {
  const entries = await readdir(lineRoot, { withFileTypes: true });
  assert.deepEqual(entries.map((entry) => entry.name).sort(), stages.map((stage) => stage.slug).sort());
  assert.ok(entries.every((entry) => entry.isDirectory()));
});

for (const stage of stages) {
  test(`${stage.slug} contiene exactamente seis WebP animados`, async () => {
    const stageRoot = path.join(lineRoot, stage.slug);
    const entries = await readdir(stageRoot, { withFileTypes: true });
    assert.deepEqual(entries.map((entry) => entry.name).sort(), slots.map(([file]) => file).sort());
    assert.ok(entries.every((entry) => entry.isFile()));

    let totalBytes = 0;
    for (const [file, frameMs, loop] of slots) {
      const asset = await readFile(path.join(stageRoot, file));
      totalBytes += asset.length;
      assertAnimationOnlyWebp(asset, frameMs, loop);
    }
    assert.ok(totalBytes < 1_000_000, `${stage.slug} debe pesar menos de 1 MB`);
  });
}

test("la línea completa conserva solo 18 animaciones y pesa menos de 2,1 MB", async () => {
  let files = 0;
  let bytes = 0;
  for (const stage of stages) {
    for (const entry of await readdir(path.join(lineRoot, stage.slug), { withFileTypes: true })) {
      assert.ok(entry.isFile());
      files += 1;
      bytes += (await readFile(path.join(lineRoot, stage.slug, entry.name))).length;
    }
  }
  assert.equal(files, 18);
  assert.ok(bytes < 2_100_000);
});

test("el registro expone idle, physical y special sin poses ni estáticos", async () => {
  const source = await readFile(path.join(root, "sanpledex-animation-data.js"), "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);

  for (const stage of stages) {
    const record = context.globalThis.SANPLEDEX_ANIMATION_ASSETS[stage.id];
    assert.equal(record.profile, "pokemon-animation-only-v1");
    assert.equal(record.animationOnly, true);
    assert.deepEqual(Object.keys(record.attacks).sort(), ["physical", "special"]);
    assert.equal("pose" in record, false);
    assert.equal("attack" in record, false);
    assert.match(record.idle.front, new RegExp(`/braspy-line/${stage.slug}/idle-front\\.webp$`));
    assert.match(record.idle.back, new RegExp(`/braspy-line/${stage.slug}/idle-back\\.webp$`));
    assert.match(record.attacks.physical.front, new RegExp(`/braspy-line/${stage.slug}/attack-physical-front\\.webp$`));
    assert.match(record.attacks.physical.back, new RegExp(`/braspy-line/${stage.slug}/attack-physical-back\\.webp$`));
    assert.match(record.attacks.special.front, new RegExp(`/braspy-line/${stage.slug}/attack-special-front\\.webp$`));
    assert.match(record.attacks.special.back, new RegExp(`/braspy-line/${stage.slug}/attack-special-back\\.webp$`));
  }
});

test("Pokédex, selección, equipo y combate consumen el mismo estándar animado", async () => {
  const [script, index] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8"),
  ]);
  const staticBlock = script.slice(
    script.indexOf("const CUSTOM_POKEMON_ASSETS = Object.freeze({"),
    script.indexOf("const CUSTOM_POKEMON_FRAME_ASSETS"),
  );
  for (const stage of stages) {
    assert.doesNotMatch(staticBlock, new RegExp(`^\\s*${stage.id}:`, "m"));
  }
  assert.doesNotMatch(script, /assets\/pokemon\/braspy-line\/[^"']+\.png/);
  assert.match(script, /scratch: \{[^}]*category: "physical"/);
  assert.match(script, /ember: \{[^}]*category: "special"/);
  assert.match(script, /function moveAnimationKind\(move\)/);
  assert.match(script, /function pokemonIdleAsset\(id, view = "front"\)/);
  assert.match(script, /const pokemonAssetLoadability = new Map\(\)/);
  assert.match(script, /const cached = pokemonAssetLoadability\.get\(src\)/);
  assert.match(script, /function artworkUrl\(id\) \{ return pokemonIdleAsset\(id\) \|\| ""; \}/);
  assert.match(script, /function iconUrl\(id\) \{ return pokemonIdleAsset\(id\) \|\| ""; \}/);
  assert.match(script, /const attackVariant = moveAnimationKind\(safeMove\)/);
  assert.match(script, /const attackVariant = moveAnimationKind\(move\)/);
  assert.match(script, /variant === "special" \? "ESPECIAL" : "FÍSICO"/);
  assert.ok(index.indexOf("sanpledex-animation-data.js") < index.search(/script\.js\?v=\d+/));
});
