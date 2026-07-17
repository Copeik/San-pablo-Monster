import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { createMapPackage } from "../tools/create-map.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

test("el registro publica una ruta jugable con regreso, NPC y encuentros propios", async () => {
  const sandbox = { console };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const filename of ["map-registry.js", "maps/route-test/editor-data.js", "maps/route-test/map.js"]) {
    vm.runInContext(await readFile(path.join(ROOT, filename), "utf8"), context, { filename });
  }
  const route = sandbox.GAME_MAP_REGISTRY.get("route-test");
  assert.equal(route.config.id, "route-test");
  assert.deepEqual({ width: route.config.width, height: route.config.height }, { width: 640, height: 640 });
  assert.equal(route.config.entrances[0].targetMap, "san-pablo");
  assert.equal(route.config.npcs[0].id, "exploradora-iris");
  assert.equal(route.config.encounters.length >= 4, true);
  assert.equal(route.editorData.mapSize.cols, 20);
});

test("map:new crea un paquete aislado y lo enlaza antes del bootstrap", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "pokemon-map-package-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "maps"));
  await writeFile(path.join(root, "index.html"), "<body>\n    <!-- GAME_MAP_PACKAGES -->\n</body>\n", "utf8");
  const result = await createMapPackage({ root, id: "ruta-luna", name: "Ruta Luna", cols: 24, rows: 18 });
  assert.equal(result.id, "ruta-luna");
  const [editor, map, svg, html] = await Promise.all([
    readFile(path.join(root, "maps/ruta-luna/editor-data.js"), "utf8"),
    readFile(path.join(root, "maps/ruta-luna/map.js"), "utf8"),
    readFile(path.join(root, "maps/ruta-luna/base.svg"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8"),
  ]);
  assert.match(editor, /cols: 24, rows: 18/);
  assert.match(map, /register\("ruta-luna"/);
  assert.match(svg, /width="768" height="576"/);
  assert.ok(html.indexOf("maps/ruta-luna/map.js") < html.indexOf("GAME_MAP_PACKAGES"));
});
