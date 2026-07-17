import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const effectAsset = path.join(
  root,
  "assets",
  "effects",
  "battle",
  "pixellab",
  "ascuas-sol-explosivo",
  "ascuas-sol-explosivo.webp",
);


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


test("Ascuas uses the transparent one-shot PixelLab animation", async () => {
  const asset = await readFile(effectAsset);
  const chunks = webpChunks(asset);
  const vp8x = chunks.get("VP8X")?.[0];
  const anim = chunks.get("ANIM")?.[0];
  const frames = chunks.get("ANMF") || [];

  assert.ok(vp8x, "VP8X metadata is required");
  assert.ok(anim, "ANIM metadata is required");
  assert.equal(asset[vp8x.offset + 8] & 0x12, 0x12, "alpha and animation flags");
  assert.equal(asset.readUIntLE(vp8x.offset + 12, 3) + 1, 128);
  assert.equal(asset.readUIntLE(vp8x.offset + 15, 3) + 1, 128);
  assert.equal(asset.readUInt16LE(anim.offset + 12), 1, "the attack must play once");
  assert.equal(frames.length, 13);
  const durations = frames.map(({ offset }) => asset.readUIntLE(offset + 20, 3));
  assert.equal(durations[0], 70);
  assert.equal(durations.at(-1), 220);
  assert.equal(durations.reduce((sum, duration) => sum + duration, 0), 1060);
});


test("Ascuas runtime timing and Braspín starter selection are wired into the game", async () => {
  const [script, styles] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);

  const starters = script.match(/const STARTERS = \[([^\n]+)\];/)?.[1] || "";
  assert.match(starters, /POKEMON\[4\]/, "Braspín must be a selectable starter");
  assert.match(script, /const MOVE_PIXEL_EFFECTS = Object\.freeze\([\s\S]*?ember:[\s\S]*?ascuas-sol-explosivo\.webp/);
  assert.match(script, /function movePixelEffect\(move\)/);
  assert.match(script, /className = "fx-move-pixel-effect"/);
  assert.match(script, /pixelEffect\?\.impactMs/);
  assert.match(script, /pixelEffect\?\.duration/);
  assert.match(script, /\.fx-move-pixel-effect,\.fx-particle/);
  assert.match(styles, /\.fx-move-pixel-effect\s*\{/);
  assert.match(styles, /@keyframes fx-move-pixel-flight/);
  assert.match(styles, /\.starter-grid \{[^}]*repeat\(auto-fit,minmax\(170px,1fr\)\)/);
});
