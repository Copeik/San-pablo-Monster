import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const script = await readFile(path.join(ROOT, "script.js"), "utf8");
const editor = await readFile(path.join(ROOT, "map-editor.js"), "utf8");
const layout = await readFile(path.join(ROOT, "map-layout.js"), "utf8");

test("el modo dios reconoce una escena estable y separada para cada interior", () => {
  assert.match(script, /function stableInteriorSceneId\(type, door\)/);
  assert.match(script, /const interiorAssetsByScene = new Map\(\)/);
  assert.match(script, /sceneInfo: \(\) => currentInteriorSceneId\(\)/);
  assert.match(script, /assets: \(\) => activeEditorAssets\(\)/);
  assert.match(editor, /scene\.kind === "interior" \? "objects"/);
  assert.match(editor, /record\.scene = String\(asset\.scene/);
});

test("los muebles interiores participan en renderizado y colision", () => {
  assert.match(script, /activeInteriorAssets\(\)\.some\(\(asset\) => asset\.solid !== false/);
  assert.match(script, /sceneAssets\.filter\(\(asset\) => asset\.layer === "floor"\)/);
  assert.match(script, /entities\.sort\(\(first, second\) => first\.y - second\.y/);
  assert.match(script, /asset\.kind === "furniture"/);
});

test("los 20 PNG de PixelLab existen y estan registrados como interiores", async () => {
  const sources = [...layout.matchAll(/src: "(assets\/interiors\/pixellab-house\/[^"]+\.png)"/g)].map((match) => match[1]);
  assert.equal(sources.length, 20);
  await Promise.all(sources.map((source) => access(path.join(ROOT, source))));
  assert.equal((layout.match(/interior: true/g) || []).length, 20);
});
