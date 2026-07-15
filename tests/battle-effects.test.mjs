import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const effects = [
  { type: "Normal", file: "normal-impact.png", width: 160 },
  { type: "Fuego", file: "fire-ring.png", width: 160 },
  { type: "Agua", file: "water-swirl.png", width: 192 },
  { type: "Eléctrico", file: "electric-bolt.png", width: 192 },
];

function pngSize(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", "asset must be a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("battle effect spritesheets keep their 32px frame contract", async () => {
  const script = await readFile(path.join(root, "script.js"), "utf8");
  const styles = await readFile(path.join(root, "styles.css"), "utf8");

  for (const effect of effects) {
    const assetPath = path.join(
      root,
      "assets",
      "effects",
      "battle",
      "superpowers",
      effect.file,
    );
    const size = pngSize(await readFile(assetPath));
    assert.deepEqual(size, { width: effect.width, height: 32 });
    assert.match(script, new RegExp(`${effect.type}: \\{ className:`));
    assert.match(styles, new RegExp(effect.file.replace(".", "\\.")));
  }
});
