import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const species = [
  { id: 5, slug: "ascuero", line: "braspy-line" },
  { id: 6, slug: "volcazote", line: "braspy-line" },
  { id: 9001, slug: "petrillo", line: "petrillo-line" },
  { id: 9002, slug: "musgolem", line: "petrillo-line" },
  { id: 9003, slug: "terravordeo", line: "petrillo-line" },
  { id: 9101, slug: "peyote", line: "peyote-line" },
  { id: 9102, slug: "prensalito", line: "peyote-line" },
  { id: 9201, slug: "criascama", line: "dracoscama-line" },
  { id: 9202, slug: "aliscama", line: "dracoscama-line" },
  { id: 9203, slug: "dracoscama", line: "dracoscama-line" },
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

function assertAnimatedWebp(asset, frameMs, loop) {
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
  const durations = frames.map(({ offset }) => asset.readUIntLE(offset + 20, 3));
  assert.ok(frames.length >= 1 && frames.length <= 8);
  assert.ok(durations.every((duration) => duration > 0 && duration % frameMs === 0));
  assert.equal(durations.reduce((total, duration) => total + duration, 0), frameMs * 8);
  assert.ok(asset.length < 1_200_000);
}

for (const entry of species) {
  test(`${entry.slug} has only the six required PixelLab combat animations and four attack poses`, async () => {
    const lineRoot = path.join(root, "assets", "pokemon", entry.line);
    const animationFiles = [
      [`${entry.slug}-idle-front-pixellab.webp`, 120, 0],
      [`${entry.slug}-idle-back-pixellab.webp`, 120, 0],
      [`${entry.slug}-attack-melee-front-pixellab.webp`, 90, 1],
      [`${entry.slug}-attack-melee-back-pixellab.webp`, 90, 1],
      [`${entry.slug}-attack-ranged-front-pixellab.webp`, 90, 1],
      [`${entry.slug}-attack-ranged-back-pixellab.webp`, 90, 1],
    ];
    const animations = await Promise.all(animationFiles.map(([file]) => readFile(path.join(lineRoot, file))));
    animations.forEach((asset, index) => assertAnimatedWebp(asset, animationFiles[index][1], animationFiles[index][2]));

    const poses = await Promise.all(["melee-front", "melee-back", "ranged-front", "ranged-back"].map((variant) => (
      readFile(path.join(lineRoot, `${entry.slug}-attack-${variant}-pixellab.png`))
    )));
    for (const pose of poses) {
      assert.deepEqual([...pose.subarray(1, 4)], [...Buffer.from("PNG")]);
      assert.equal(pose.readUInt32BE(16), 384);
      assert.equal(pose.readUInt32BE(20), 384);
      assert.equal(pose[25], 6, "pose must be RGBA");
    }

    const acceptedRoot = path.join(lineRoot, "pixellab-hq", entry.slug, "accepted-frames");
    const sourceSequences = [
      ["idle", "front"], ["idle", "back"],
      ["attack", "melee", "front"], ["attack", "melee", "back"],
      ["attack", "ranged", "front"], ["attack", "ranged", "back"],
    ];
    for (const sequence of sourceSequences) {
      const files = await readdir(path.join(acceptedRoot, ...sequence));
      assert.equal(files.filter((file) => /^frame-\d\d\.png$/.test(file)).length, 8);
    }
  });
}

test("the first ten combat packs are registered with distinct melee and ranged assets", async () => {
  const source = await readFile(path.join(root, "sanpledex-animation-data.js"), "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  for (const entry of species) {
    const record = context.globalThis.SANPLEDEX_ANIMATION_ASSETS[entry.id];
    assert.equal(record.frameCount, 8);
    assert.equal(record.idleFrameMs, 120);
    assert.equal(record.attackFrameMs, 90);
    assert.match(record.idle.front, new RegExp(`${entry.slug}-idle-front-pixellab\\.webp$`));
    assert.match(record.attacks.melee.front, new RegExp(`${entry.slug}-attack-melee-front-pixellab\\.webp$`));
    assert.match(record.attacks.ranged.front, new RegExp(`${entry.slug}-attack-ranged-front-pixellab\\.webp$`));
    assert.notEqual(record.attacks.melee.front, record.attacks.ranged.front);
    assert.equal(record.attack.front, record.attacks.melee.front);
  }
});

test("combat moves select anatomically appropriate melee and ranged packs", async () => {
  const script = await readFile(path.join(root, "script.js"), "utf8");
  for (const move of ["tackle", "scratch", "headbutt", "scaleRush", "razorWing", "prairieDive"]) {
    assert.match(script, new RegExp(`${move}: \\{[^}]*delivery: "melee"`));
  }
  for (const move of ["vineWhip", "ember", "gust", "dragonRage", "stoneSeal", "earthPress"]) {
    assert.match(script, new RegExp(`${move}: \\{[^}]*delivery: "ranged"`));
  }
  assert.match(script, /9201: \{[^}]*moves: \[MOVES\.tackle, MOVES\.scaleRush, MOVES\.dragonRage\]/);
});

test("the PixelLab manifest keeps one biological brief and a character id per species", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "tools", "pixellab-first10-combat-manifest.json"), "utf8"));
  assert.equal(manifest.frameCount, 8);
  assert.equal(manifest.species.length, 10);
  for (const entry of manifest.species) {
    assert.match(entry.characterId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    for (const field of ["idle", "melee", "ranged"]) {
      assert.ok(entry[field].length > 180, `${entry.slug}.${field} must preserve its biological direction`);
      assert.match(entry[field], /fixed|planted|anchor|brace|root/i);
    }
  }
});
