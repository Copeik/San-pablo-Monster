import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProduction } from "../tools/build-production.mjs";

const temporaryRoots = [];

test.after(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function writeFixtureFile(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "pokemon-production-build-"));
  temporaryRoots.push(root);

  const uniqueJs = Array.from({ length: 90 }, (_, index) => (
    `window.fixtureValues.push("valor-${index}-${"x".repeat(24)}");`
  )).join("\n");
  const uniqueCss = Array.from({ length: 90 }, (_, index) => (
    `.fixture-${index}{background-color:rgb(${index % 255},${(index * 2) % 255},${(index * 3) % 255});padding:${index}px}`
  )).join("\n");
  const keepJson = `${JSON.stringify({ values: Array.from({ length: 300 }, (_, index) => `asset-${index}`) }, null, 2)}\n`;

  const indexHtml = `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="first.css?v=2">
    <link href="second.css" rel="stylesheet">
  </head>
  <body>
    <button id="buildingEditorButton">editor</button>
    <div id="mapEditorGlobalStatus">status</div>
    <div id="mapEditorCursorLayer">cursor</div>
    <aside class="tool" id="buildingEditor"><section><p>editor body</p></section></aside>
    <div id="editorScrim">scrim</div>
    <main id="game">game</main>
    <script src="first.js?v=3"></script>
    <script defer src="second.js"></script>
    <script data-role="map-editor-loader">window.fixtureLoaderAfterBundle = true;</script>
  </body>
</html>\n`;

  await writeFixtureFile(root, "index.html", indexHtml);
  await writeFixtureFile(root, "first.js", `window.fixtureValues = [];\n${uniqueJs}\n`);
  await writeFixtureFile(root, "second.js", "window.fixtureBuildOrder = window.fixtureValues.length;\n");
  await writeFixtureFile(root, "first.css", `${uniqueCss}\n`);
  await writeFixtureFile(root, "second.css", "#game { color: rgb(1, 2, 3); }\n");
  await writeFixtureFile(root, "map-editor-standalone.js", "window.fixtureMapEditor = true;\n");
  const keep = await writeFixtureFile(root, "assets/keep.json", keepJson);
  await writeFixtureFile(root, "assets/not-allowed.txt", "must never ship\n");

  const manifest = {
    schemaVersion: 0,
    generator: "fixture",
    entrypoints: ["index.html"],
    scannedSources: ["index.html", "first.js", "second.js", "first.css", "second.css"],
    files: [
      {
        path: "assets/keep.json",
        bytes: keep.byteLength,
        sha256: sha256(keep),
      },
    ],
  };
  await writeFixtureFile(root, "tools/assets/runtime-files-v0.json", `${JSON.stringify(manifest, null, 2)}\n`);

  return { root, manifest };
}

async function outputFiles(root, profile) {
  const outputRoot = path.join(root, "dist", profile);
  const entries = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else entries.push(path.relative(outputRoot, absolute).replaceAll(path.sep, "/"));
    }
  }
  await visit(outputRoot);
  return entries.sort();
}

test("standard builds an allowlisted, hashed, minified and precompressed release", async () => {
  const { root } = await createFixture();
  await writeFixtureFile(root, "tools/assets/standard-compliance-v0.json", '{"valid":true}\n');

  const result = await buildProduction({ projectRoot: root, profile: "standard" });
  const files = await outputFiles(root, "standard");
  const html = await readFile(path.join(root, "dist/standard/index.html"), "utf8");

  assert.match(result.javascript.file, /^app\.[a-f0-9]{12}\.js$/);
  assert.match(result.stylesheet.file, /^app\.[a-f0-9]{12}\.css$/);
  assert.equal((html.match(/<script\b[^>]*\bsrc=/gi) || []).length, 1);
  assert.equal((html.match(/<link\b[^>]*\brel=["']stylesheet["']/gi) || []).length, 1);
  assert.match(html, new RegExp(`src=["']${result.javascript.file}["']`));
  assert.match(html, new RegExp(`href=["']${result.stylesheet.file}["']`));
  assert.doesNotMatch(html, /first\.js|second\.js|first\.css|second\.css/);
  assert.doesNotMatch(html, /buildingEditor|mapEditorGlobalStatus|mapEditorCursorLayer|editorScrim/);
  assert.doesNotMatch(html, /map-editor-loader|fixtureLoaderAfterBundle/);

  const javascript = await readFile(path.join(root, "dist/standard", result.javascript.file), "utf8");
  const stylesheet = await readFile(path.join(root, "dist/standard", result.stylesheet.file), "utf8");
  assert.ok(javascript.length < 90 * 80, "JavaScript should be minified");
  assert.ok(stylesheet.length < 90 * 90, "CSS should be minified");
  assert.ok(javascript.indexOf("fixtureValues") < javascript.indexOf("fixtureBuildOrder"), "script order must be stable");

  assert.ok(files.includes("assets/keep.json"));
  assert.ok(!files.includes("assets/not-allowed.txt"));
  assert.ok(!files.includes("first.js"));
  assert.ok(!files.includes("map-editor-standalone.js"));
  assert.ok(files.includes("assets/keep.json.br"));
  assert.ok(files.includes("assets/keep.json.gz"));
  assert.ok(files.includes(`${result.javascript.file}.br`));
  assert.ok(files.includes(`${result.javascript.file}.gz`));
  assert.ok(files.includes(`${result.stylesheet.file}.br`));
  assert.ok(files.includes(`${result.stylesheet.file}.gz`));

  const metadataBefore = await readFile(path.join(root, "dist/standard/build-meta.json"), "utf8");
  const javascriptBrotliBefore = await readFile(path.join(root, "dist/standard", `${result.javascript.file}.br`));
  const javascriptGzipBefore = await readFile(path.join(root, "dist/standard", `${result.javascript.file}.gz`));
  assert.doesNotMatch(metadataBefore, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(metadataBefore, /generatedAt|timestamp|date/i);

  await buildProduction({ projectRoot: root, profile: "standard" });
  const metadataAfter = await readFile(path.join(root, "dist/standard/build-meta.json"), "utf8");
  assert.equal(metadataAfter, metadataBefore, "metadata must be deterministic");
  assert.deepEqual(
    await readFile(path.join(root, "dist/standard", `${result.javascript.file}.br`)),
    javascriptBrotliBefore,
    "Brotli output must be deterministic",
  );
  assert.deepEqual(
    await readFile(path.join(root, "dist/standard", `${result.javascript.file}.gz`)),
    javascriptGzipBefore,
    "gzip output must be deterministic",
  );
});

test("legacy-dev retains the editor loader and copies its dynamic bundle", async () => {
  const { root } = await createFixture();

  const result = await buildProduction({ projectRoot: root, profile: "legacy-dev" });
  const html = await readFile(path.join(root, "dist/legacy-dev/index.html"), "utf8");
  const bundlePosition = html.indexOf(result.javascript.file);
  const loaderPosition = html.indexOf('data-role="map-editor-loader"');

  assert.ok(bundlePosition >= 0);
  assert.ok(loaderPosition > bundlePosition, "the inline loader must remain after the app bundle");
  assert.match(html, /id="buildingEditor"/);
  assert.match(html, /fixtureLoaderAfterBundle/);
  assert.equal(await readFile(path.join(root, "dist/legacy-dev/map-editor-standalone.js"), "utf8"), "window.fixtureMapEditor = true;\n");
});

test("legacy creates a publishable release without editor while allowing inherited art", async () => {
  const { root } = await createFixture();

  const result = await buildProduction({ projectRoot: root, profile: "legacy" });
  const files = await outputFiles(root, "legacy");
  const html = await readFile(path.join(root, "dist/legacy/index.html"), "utf8");

  assert.equal(result.profile, "legacy");
  assert.doesNotMatch(html, /buildingEditor|mapEditorGlobalStatus|mapEditorCursorLayer|editorScrim/);
  assert.doesNotMatch(html, /map-editor-loader|fixtureLoaderAfterBundle/);
  assert.ok(!files.includes("map-editor-standalone.js"));
  assert.ok(files.includes("assets/keep.json"));
});

test("standard fails closed without a valid compliance gate", async () => {
  const { root } = await createFixture();

  await assert.rejects(
    buildProduction({ projectRoot: root, profile: "standard" }),
    /standard-compliance-v0\.json.*valid.*true/i,
  );

  await writeFixtureFile(root, "tools/assets/standard-compliance-v0.json", '{"valid":false}\n');
  await assert.rejects(
    buildProduction({ projectRoot: root, profile: "standard" }),
    /standard-compliance-v0\.json.*valid.*true/i,
  );
});

test("rejects a tampered allowlisted runtime file before replacing a previous build", async () => {
  const { root } = await createFixture();
  await mkdir(path.join(root, "dist/legacy-dev"), { recursive: true });
  await writeFile(path.join(root, "dist/legacy-dev/previous.txt"), "previous release\n");
  await writeFile(path.join(root, "assets/keep.json"), '{"tampered":true}\n');

  await assert.rejects(
    buildProduction({ projectRoot: root, profile: "legacy-dev" }),
    /SHA-256.*assets\/keep\.json/i,
  );
  assert.equal(await readFile(path.join(root, "dist/legacy-dev/previous.txt"), "utf8"), "previous release\n");
});

test("rejects traversal paths and output directories outside dist", async () => {
  const { root, manifest } = await createFixture();
  manifest.files.push({ path: "../secret.txt", bytes: 1, sha256: "0".repeat(64) });
  await writeFixtureFile(root, "tools/assets/runtime-files-v0.json", `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    buildProduction({ projectRoot: root, profile: "legacy-dev" }),
    /ruta.*segura|path.*safe|traversal/i,
  );
  await assert.rejects(
    buildProduction({ projectRoot: root, profile: "legacy-dev", outDir: path.join(root, "release") }),
    /dist/i,
  );
});
