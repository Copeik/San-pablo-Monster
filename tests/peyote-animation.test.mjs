import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function webpChunks(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  const chunks = new Map();
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const records = chunks.get(name) || [];
    records.push({ offset, size });
    chunks.set(name, records);
    offset += 8 + size + (size & 1);
  }
  return chunks;
}

const animations = [
  { state: "idle", view: "front", loop: 0, duration: 120 },
  { state: "idle", view: "back", loop: 0, duration: 120 },
  { state: "attack", variant: "melee", view: "front", loop: 1, duration: 90 },
  { state: "attack", variant: "melee", view: "back", loop: 1, duration: 90 },
  { state: "attack", variant: "ranged", view: "front", loop: 1, duration: 90 },
  { state: "attack", variant: "ranged", view: "back", loop: 1, duration: 90 },
];

function animationPath({ state, variant, view }) {
  const action = variant ? `${state}-${variant}` : state;
  return path.join(
    root,
    "assets",
    "pokemon",
    "peyote-line",
    `peyote-${action}-${view}-pixellab.webp`,
  );
}

function webpFrameDurations(buffer, chunks) {
  return (chunks.get("ANMF") || []).map(({ offset }) => buffer.readUIntLE(offset + 20, 3));
}

for (const animation of animations) {
  test(`Peyote ${animation.variant || animation.state} ${animation.view} is an eight-cell alpha WebP`, async () => {
    const asset = await readFile(animationPath(animation));
    const chunks = webpChunks(asset);
    const vp8x = chunks.get("VP8X")?.[0];
    const anim = chunks.get("ANIM")?.[0];
    const frames = chunks.get("ANMF") || [];

    assert.ok(vp8x, "VP8X metadata is required for animation and alpha");
    assert.ok(anim, "ANIM loop metadata is required");
    assert.equal(asset[vp8x.offset + 8] & 0x12, 0x12, "alpha and animation flags");
    assert.equal(asset.readUIntLE(vp8x.offset + 12, 3) + 1, 384);
    assert.equal(asset.readUIntLE(vp8x.offset + 15, 3) + 1, 384);
    assert.equal(asset.readUInt16LE(anim.offset + 12), animation.loop);
    const durations = webpFrameDurations(asset, chunks);
    assert.ok(frames.length >= 1 && frames.length <= 8);
    assert.ok(durations.every((duration) => duration > 0 && duration % animation.duration === 0));
    assert.equal(durations.reduce((total, duration) => total + duration, 0), animation.duration * 8);
    assert.ok(asset.length < 1_200_000, `${path.basename(animationPath(animation))} exceeds 1.2 MB`);
  });
}

test("all six Peyote combat animations stay within 7.2 MB", async () => {
  const assets = await Promise.all(animations.map((animation) => readFile(animationPath(animation))));
  assert.ok(assets.reduce((total, asset) => total + asset.length, 0) < 7_200_000);
});

test("Peyote uses frame animation only in battle views with static and reduced-motion fallbacks", async () => {
  const [script, styles, registry] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
    readFile(path.join(root, "sanpledex-animation-data.js"), "utf8"),
  ]);

  assert.match(registry, /9101: combatPack\("peyote-line", "peyote"\)/);
  assert.match(script, /const SANPLEDEX_ANIMATION_ASSETS = globalThis\.SANPLEDEX_ANIMATION_ASSETS/);
  assert.match(script, /function customPokemonAttackAnimation\(id, variant = "melee"\)/);
  assert.match(script, /function customPokemonFrameAsset[\s\S]*?if \(prefersReducedMotion\(\)\) return null;/);
  assert.match(script, /REDUCED_MOTION_QUERY\.addEventListener\("change", refreshVisiblePokemonFrameAssets\)/);
  assert.match(script, /function artworkUrl\(id\) \{ return customPokemonAsset\(id\)/);
  assert.match(script, /function frontSpriteUrl\(id\) \{ return customPokemonFrameAsset\(id\) \|\| customPokemonAsset\(id\)/);
  assert.match(script, /image\.classList\.remove\("frame-animated"\);[\s\S]*?image\.src = fallbackAsset;/);
  assert.match(styles, /\.enemy-pokemon\.frame-animated \{ animation: wild-enter 550ms ease-out both; \}/);
  assert.match(styles, /\.player-pokemon\.frame-animated \{ animation: partner-enter 550ms ease-out both; \}/);
  assert.match(styles, /\.sanpledex-sprite\.frame-animated \{ animation: none; \}/);
});
