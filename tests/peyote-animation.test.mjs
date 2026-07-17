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
  { state: "idle", view: "front", loop: 0, duration: 84 },
  { state: "idle", view: "back", loop: 0, duration: 84 },
  { state: "attack", view: "front", loop: 1, duration: 75 },
  { state: "attack", view: "back", loop: 1, duration: 75 },
];

function animationPath({ state, view }) {
  return path.join(
    root,
    "assets",
    "pokemon",
    "peyote-line",
    `peyote-${state}-${view}-pixellab.webp`,
  );
}

function webpFrameDurations(buffer, chunks) {
  return (chunks.get("ANMF") || []).map(({ offset }) => buffer.readUIntLE(offset + 20, 3));
}

for (const animation of animations) {
  test(`Peyote ${animation.state} ${animation.view} is a compact 12-frame alpha WebP`, async () => {
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
    assert.equal(frames.length, 12);
    assert.deepEqual([...new Set(webpFrameDurations(asset, chunks))], [animation.duration]);
    assert.ok(asset.length < 1_200_000, `${path.basename(animationPath(animation))} exceeds 1.2 MB`);
  });
}

test("all four Peyote combat animations stay within 4.8 MB", async () => {
  const assets = await Promise.all(animations.map((animation) => readFile(animationPath(animation))));
  assert.ok(assets.reduce((total, asset) => total + asset.length, 0) < 4_800_000);
});

test("Peyote uses frame animation only in battle views with static and reduced-motion fallbacks", async () => {
  const [script, styles] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);

  assert.match(script, /const CUSTOM_POKEMON_FRAME_ASSETS = Object\.freeze\(\{[\s\S]*?9101:[\s\S]*?peyote-idle-front\.webp[\s\S]*?peyote-idle-back\.webp/);
  assert.match(script, /function customPokemonFrameAsset[\s\S]*?if \(prefersReducedMotion\(\)\) return null;/);
  assert.match(script, /REDUCED_MOTION_QUERY\.addEventListener\("change", refreshVisiblePokemonFrameAssets\)/);
  assert.match(script, /function artworkUrl\(id\) \{ return customPokemonAsset\(id\)/);
  assert.match(script, /function frontSpriteUrl\(id\) \{ return customPokemonFrameAsset\(id\) \|\| customPokemonAsset\(id\)/);
  assert.match(script, /image\.classList\.remove\("frame-animated"\);[\s\S]*?image\.src = fallbackAsset;/);
  assert.match(styles, /\.enemy-pokemon\.frame-animated \{ animation: wild-enter 550ms ease-out both; \}/);
  assert.match(styles, /\.player-pokemon\.frame-animated \{ animation: partner-enter 550ms ease-out both; \}/);
  assert.match(styles, /\.sanpledex-sprite\.frame-animated \{ animation: none; \}/);
});
