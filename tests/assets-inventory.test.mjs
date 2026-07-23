import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  classifyAsset,
  globToRegExp,
  normalizeRepoPath,
  readMediaMetadata,
  runAssetAudit,
  serializeManifest,
} from "../tools/assets/lib/asset-inventory.mjs";

const execFileAsync = promisify(execFile);
const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xb7Z1QAAAABJRU5ErkJggg==",
  "base64",
);

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pokemon-assets-audit-"));
  await fs.mkdir(path.join(root, "assets", "dynamic"), { recursive: true });
  await fs.mkdir(path.join(root, "assets", "sources"), { recursive: true });
  await fs.mkdir(path.join(root, "maps", "demo"), { recursive: true });
  await fs.writeFile(path.join(root, "index.html"), [
    '<link rel="stylesheet" href="style.css">',
    '<script src="app.js"></script>',
    '<img src="assets/runtime.png?v=2">',
  ].join("\n"));
  await fs.writeFile(path.join(root, "style.css"), ".hero { background: url('assets/runtime.png'); }\n");
  await fs.writeFile(path.join(root, "app.js"), [
    'const missing = "assets/missing.png";',
    'const nestedRoot = "assets/maps/not-a-top-level-map.png";',
    '// "assets/comment-only.png" no es una referencia.',
    'const chunks = `maps/demo/chunk-${row}.png`;',
  ].join("\n"));
  await fs.writeFile(path.join(root, "assets", "runtime.png"), transparentPng);
  await fs.writeFile(path.join(root, "assets", "dynamic", "effect.webp"), Buffer.from("fixture-webp"));
  await fs.writeFile(path.join(root, "assets", "sources", "raw.png"), transparentPng);
  await fs.writeFile(path.join(root, "assets", "screen-preview.png"), transparentPng);
  await fs.writeFile(path.join(root, "assets", "bundle.zip"), Buffer.from("fixture-zip"));
  await fs.writeFile(path.join(root, "assets", "orphan.bin"), Buffer.from("fixture-candidate"));
  await fs.writeFile(path.join(root, "maps", "demo", "chunk-0.png"), transparentPng);
  const config = {
    schemaVersion: 0,
    assetRoots: ["assets", "maps"],
    entrypoints: ["index.html"],
    dynamicIncludes: [{
      pattern: "assets/dynamic/*.webp",
      reason: "fixture dynamic path",
      referencedBy: "app.js",
    }],
  };
  await fs.mkdir(path.join(root, "tools", "assets"), { recursive: true });
  await fs.writeFile(path.join(root, "tools", "assets", "rules.json"), `${JSON.stringify(config, null, 2)}\n`);
  return { root, config };
}

test("normaliza rutas y convierte globs sin depender del sistema operativo", () => {
  assert.equal(normalizeRepoPath("./assets\\pokemon%20uno/front.png?v=3#x"), "assets/pokemon uno/front.png");
  assert.equal(normalizeRepoPath("assets/../secret.txt"), "");
  const matcher = globToRegExp("assets/**/attack-*.webp");
  assert.equal(matcher.test("assets/pokemon/a/attack-front.webp"), true);
  assert.equal(matcher.test("assets/pokemon/a/idle-front.webp"), false);
});

test("clasifica con prioridad para las rutas runtime", () => {
  const runtime = new Set(["assets/sources/live.png"]);
  assert.equal(classifyAsset("assets/sources/live.png", runtime).classification, "runtime");
  assert.equal(classifyAsset("assets/sources/raw.png", runtime).classification, "source");
  assert.equal(classifyAsset("assets/screen-preview.png", runtime).classification, "derived");
  assert.equal(classifyAsset("assets/archive.zip", runtime).classification, "archive");
  assert.equal(classifyAsset("assets/unreferenced.png", runtime).classification, "candidate");
});

test("extrae dimensiones y transparencia PNG sin decodificar pixeles", () => {
  const metadata = readMediaMetadata("assets/one.png", transparentPng);
  assert.deepEqual(metadata, {
    kind: "image", format: "png", width: 1, height: 1, hasAlpha: true,
    frameCount: 1, animated: false, durationMs: 0,
  });
});

test("el inventario es determinista, conserva procedencia y detecta faltantes", async (t) => {
  const { root, config } = await makeFixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = await runAssetAudit(root, config);
  const second = await runAssetAudit(root, config);
  assert.equal(serializeManifest(first.inventory), serializeManifest(second.inventory));
  assert.deepEqual(first.runtime.integrity.missingReferences, [
    { path: "assets/maps/not-a-top-level-map.png", referencedBy: ["app.js"] },
    { path: "assets/missing.png", referencedBy: ["app.js"] },
  ]);
  assert.equal(first.runtime.integrity.unmatchedPatterns.length, 0);
  const paths = new Set(first.runtime.files.map((record) => record.path));
  assert.equal(paths.has("assets/runtime.png"), true);
  assert.equal(paths.has("assets/dynamic/effect.webp"), true);
  assert.equal(paths.has("maps/demo/chunk-0.png"), true);
  assert.equal(paths.has("assets/comment-only.png"), false);
  const raw = first.inventory.files.find((record) => record.path === "assets/sources/raw.png");
  assert.equal(raw.classification, "source");
  assert.equal(first.inventory.summary.exactDuplicateGroups, 1);
});

test("el CLI --check detecta deriva de forma reproducible", async (t) => {
  const { root } = await makeFixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const tool = path.resolve("tools/assets/audit-assets.mjs");
  const common = [tool, "--root", root, "--config", "tools/assets/rules.json", "--quiet"];
  await assert.rejects(execFileAsync(process.execPath, common), (error) => error.code === 1);
  await fs.writeFile(path.join(root, "app.js"), 'const runtime = "assets/runtime.png";\nconst chunks = `maps/demo/chunk-${row}.png`;\n');
  await execFileAsync(process.execPath, common);
  await execFileAsync(process.execPath, [...common, "--check"]);
  await fs.appendFile(path.join(root, "tools", "assets", "runtime-files-v0.json"), " ");
  await assert.rejects(execFileAsync(process.execPath, [...common, "--check"]), (error) => error.code === 1);
});
