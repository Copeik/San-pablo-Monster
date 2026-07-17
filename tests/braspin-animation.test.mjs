import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lineRoot = path.join(root, "assets", "pokemon", "braspy-line");
const animations = [
  { label: "idle front", file: "braspin-idle-front-pixellab.webp", loop: 0, frameMs: 120 },
  { label: "idle back", file: "braspin-idle-back-pixellab.webp", loop: 0, frameMs: 120 },
  { label: "melee front", file: "braspin-attack-melee-front-pixellab.webp", loop: 1, frameMs: 90 },
  { label: "melee back", file: "braspin-attack-melee-back-pixellab.webp", loop: 1, frameMs: 90 },
  { label: "ranged front", file: "braspin-attack-ranged-front-pixellab.webp", loop: 1, frameMs: 90 },
  { label: "ranged back", file: "braspin-attack-ranged-back-pixellab.webp", loop: 1, frameMs: 90 },
];


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


for (const animation of animations) {
  test(`Braspín ${animation.label} is an 8-frame alpha WebP`, async () => {
    const file = path.join(lineRoot, animation.file);
    const asset = await readFile(file);
    const chunks = webpChunks(asset);
    const vp8x = chunks.get("VP8X")?.[0];
    const anim = chunks.get("ANIM")?.[0];
    const frames = chunks.get("ANMF") || [];

    assert.ok(vp8x, "VP8X metadata is required");
    assert.ok(anim, "ANIM metadata is required");
    assert.equal(asset[vp8x.offset + 8] & 0x12, 0x12, "alpha and animation flags");
    assert.equal(asset.readUIntLE(vp8x.offset + 12, 3) + 1, 384);
    assert.equal(asset.readUIntLE(vp8x.offset + 15, 3) + 1, 384);
    assert.equal(asset.readUInt16LE(anim.offset + 12), animation.loop);
    assert.equal(frames.length, 8);
    assert.deepEqual(
      [...new Set(frames.map(({ offset }) => asset.readUIntLE(offset + 20, 3)))],
      [animation.frameMs],
    );
    assert.ok(asset.length < 1_200_000);
  });
}


test("Braspín keeps transparent final attack poses and PixelLab provenance", async () => {
  const [meleeFront, meleeBack, rangedFront, rangedBack, jobs] = await Promise.all([
    readFile(path.join(lineRoot, "braspin-attack-melee-front-pixellab.png")),
    readFile(path.join(lineRoot, "braspin-attack-melee-back-pixellab.png")),
    readFile(path.join(lineRoot, "braspin-attack-ranged-front-pixellab.png")),
    readFile(path.join(lineRoot, "braspin-attack-ranged-back-pixellab.png")),
    readFile(path.join(lineRoot, "pixellab-hq", "braspin", "pixellab-jobs.json"), "utf8"),
  ]);
  for (const pose of [meleeFront, meleeBack, rangedFront, rangedBack]) {
    assert.deepEqual([...pose.subarray(1, 4)], [...Buffer.from("PNG")]);
    assert.equal(pose.readUInt32BE(16), 384);
    assert.equal(pose.readUInt32BE(20), 384);
    assert.equal(pose[25], 6, "pose must be RGBA");
  }
  const metadata = JSON.parse(jobs);
  assert.equal(metadata.provider, "PixelLab MCP");
  assert.equal(metadata.status, "completed");
  assert.equal(metadata.frame_count, 8);
  for (const id of [
    metadata.character_id,
    metadata.animation_jobs.idle.front,
    metadata.animation_jobs.idle.back,
    metadata.animation_jobs.attack.melee.front,
    metadata.animation_jobs.attack.melee.back,
    metadata.animation_jobs.attack.ranged.front,
    metadata.animation_jobs.attack.ranged.back,
  ]) assert.match(id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
});


test("Braspín registry is loaded and drives Sanpledex plus both battle views", async () => {
  const [registrySource, index, script, styles] = await Promise.all([
    readFile(path.join(root, "sanpledex-animation-data.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);
  const context = { globalThis: {} };
  vm.runInNewContext(registrySource, context);
  const record = context.globalThis.SANPLEDEX_ANIMATION_ASSETS[4];
  assert.equal(record.frameCount, 8);
  assert.equal(record.durationMs, 840);
  assert.equal(record.impactMs, 620);
  assert.match(record.idle.front, /braspin-idle-front-pixellab\.webp$/);
  assert.match(record.idle.back, /braspin-idle-back-pixellab\.webp$/);
  assert.match(record.attacks.melee.front, /braspin-attack-melee-front-pixellab\.webp$/);
  assert.match(record.attacks.melee.back, /braspin-attack-melee-back-pixellab\.webp$/);
  assert.match(record.attacks.ranged.front, /braspin-attack-ranged-front-pixellab\.webp$/);
  assert.match(record.attacks.ranged.back, /braspin-attack-ranged-back-pixellab\.webp$/);
  assert.notEqual(record.attacks.melee.front, record.attacks.ranged.front);
  assert.ok(index.indexOf("sanpledex-animation-data.js?v=5") < index.search(/script\.js\?v=\d+/));
  assert.match(script, /scratch: \{[^}]*delivery: "melee"/);
  assert.match(script, /ember: \{[^}]*delivery: "ranged"/);
  assert.match(script, /function customPokemonFrameAsset\(id, state = "idle", view = "front", variant = null\)/);
  assert.match(script, /const attackVariant = moveDelivery\(safeMove\)/);
  assert.match(script, /const customAttackAsset = customPokemonFrameAsset\(pokemonId, "attack", view, attackVariant\)/);
  assert.match(script, /isBraspinQuillVolley[\s\S]*?safeMove\.id === "ember"/);
  assert.match(script, /isBraspinQuillVolley \|\| \["electric", "psychic", "ghost", "dragon"\]\.includes\(fxClass\) \? 3 : 6/);
  assert.match(script, /const visualDuration = isBraspinQuillVolley \? Math\.min\(effect\.duration, 230\) : effect\.duration/);
  assert.match(script, /const visualLead = isBraspinQuillVolley[\s\S]*?Math\.min\(effect\.duration, 230\) \+ 70/);
  assert.match(styles, /\.fx-custom-color\.fx-move-projectile\.fx-fire-quill/);
  assert.match(script, /canPlayCustomAttack[\s\S]*?attacker\.src = customAttackAsset[\s\S]*?finally \{[\s\S]*?attacker\.src = idleAsset \|\| originalSrc/);
  assert.match(script, /attacker\.classList\.remove\("frame-animated"\);[\s\S]*?attacker\.classList\.add\("frame-attacking"\)/);
  assert.match(script, /data-sanpledex-attack="\$\{move\.id\}"/);
  assert.match(script, /previewSanpledexAttack\(attackTrigger\.dataset\.sanpledexAttack\)/);
  assert.match(script, /previewing-frame-attack/);
  assert.match(styles, /\.battle-pokemon\.frame-attacking/);
  assert.match(styles, /\.sanpledex-combat-preview\.previewing-frame-attack/);
  assert.match(styles, /\.battle-pokemon\.frame-attacking \{[^}]*animation:\s*none\s*!important;[^}]*transform:\s*none;/);
  assert.doesNotMatch(styles, /@keyframes braspin-frame-ram/);
  assert.doesNotMatch(styles, /\.battle-pokemon\.frame-attacking\[data-pokemon-id="4"\]/);
  assert.doesNotMatch(styles, /\.sanpledex-combat-preview\[data-pokemon-id="4"\]\.previewing-frame-attack/);
});
