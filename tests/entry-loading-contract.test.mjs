import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(ROOT, "index.html"), "utf8");
const appScript = await readFile(path.join(ROOT, "script.js"), "utf8");

function inlineScript(role) {
  const pattern = new RegExp(`<script\\s+data-role=["']${role}["']>([\\s\\S]*?)<\\/script>`);
  const match = html.match(pattern);
  assert.ok(match, `No se encontró el script inline ${role}`);
  return match[1];
}

function evaluateEditorLoader({ protocol = "https:", hostname = "juego.example", search = "" } = {}) {
  const listeners = new Map();
  const appended = [];
  let enableCount = 0;
  let disableCount = 0;
  const document = {
    body: { append: (element) => appended.push(element) },
    createElement: () => ({
      dataset: {},
      addEventListener(type, listener) { this[`on${type}`] = listener; },
    }),
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const window = {
    location: { protocol, hostname, search },
    __pokemonMapEditorBridge: {
      enable() { enableCount += 1; },
      disable() { disableCount += 1; },
    },
  };
  vm.runInNewContext(inlineScript("map-editor-loader"), {
    document,
    Error,
    Promise,
    URLSearchParams,
    window,
  });
  return { appended, disableCount: () => disableCount, enableCount: () => enableCount, listeners, window };
}

test("los vídeos narrativos no descargan contenido durante la carga inicial", () => {
  for (const id of ["starterIntroVideo", "fragmentCinematicVideo"]) {
    assert.match(html, new RegExp(`<video\\s+id=["']${id}["'][^>]*\\bpreload=["']none["']`));
  }
  assert.doesNotMatch(html, /<video\b[^>]*\bpreload=["']auto["']/i);
});

test("la entrada no carga geografía auxiliar ni el bundle del editor de forma ansiosa", () => {
  assert.doesNotMatch(html, /<script\s+[^>]*src=["']map-geography\.js(?:\?[^"']*)?["']/i);
  assert.doesNotMatch(html, /<script\s+[^>]*src=["']map-editor-standalone\.js(?:\?[^"']*)?["']/i);
});

test("el runtime principal tolera que el paquete publicado omita todo el DOM del editor", () => {
  assert.match(appScript, /function hasBuildingEditor\(\)/);
  assert.match(appScript, /elements\.buildingEditorButton\?\.addEventListener/);
  assert.match(appScript, /elements\.closeBuildingEditor\?\.addEventListener/);
  assert.match(appScript, /elements\.editorScrim\?\.addEventListener/);
  assert.equal((appScript.match(/elements\.buildingEditorButton\.disabled\s*=/g) || []).length, 1,
    "solo el helper protegido puede escribir disabled");
  assert.equal((appScript.match(/elements\.buildingEditor\.classList\.contains/g) || []).length, 0,
    "las lecturas del panel deben pasar por el helper tolerante a null");
});

test("el juego publicado no activa ni descarga el editor al arrancar", () => {
  const runtime = evaluateEditorLoader();
  assert.equal(runtime.enableCount(), 0);
  assert.equal(runtime.appended.length, 0);
});

test("el editor local se ofrece sin descargar el bundle hasta que se abre", () => {
  const runtime = evaluateEditorLoader({ protocol: "http:", hostname: "localhost" });
  assert.equal(runtime.enableCount(), 1);
  assert.equal(runtime.appended.length, 0);

  runtime.listeners.get("map-editor-open")();
  assert.equal(runtime.appended.length, 1);
  assert.equal(runtime.appended[0].src, "map-editor-standalone.js?v=8");

  runtime.listeners.get("map-editor-open")();
  assert.equal(runtime.appended.length, 1, "dos aperturas no deben descargar dos bundles");
});

test("un enlace colaborativo ofrece el editor en un host remoto", () => {
  const runtime = evaluateEditorLoader({ search: "?editorToken=token-de-prueba" });
  assert.equal(runtime.enableCount(), 1);
  assert.equal(runtime.appended.length, 0);
});
