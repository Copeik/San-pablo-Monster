import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseMapEditorSource } from "../map-editor-server.mjs";
import { createAppServer } from "../server.mjs";

test("el servidor mantiene datos y revisiones independientes por mapa", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pokemon-multimap-editor-"));
  const cityPath = path.join(directory, "map-editor-data.js");
  const routePath = path.join(directory, "route-editor-data.js");
  const server = createAppServer({
    env: { NODE_ENV: "test" },
    editorDataPath: cityPath,
    editorDataPaths: { "route-test": routePath },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const changed = await fetch(`${origin}/api/dev/map-editor/operations?map=route-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actorId: "route-builder",
      baseRevision: 0,
      transactionId: "route-ground",
      operations: [{ type: "ground.set", key: "2,2", value: "grass|path-dirt" }],
    }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).mapId, "route-test");

  const city = await (await fetch(`${origin}/api/dev/map-editor`)).json();
  const route = await (await fetch(`${origin}/api/dev/map-editor?map=route-test`)).json();
  assert.deepEqual(city.data.groundOverrides, {});
  assert.deepEqual(route.data.groundOverrides, { "2,2": "grass|path-dirt" });
  assert.equal(city.revision, 0);
  assert.equal(route.revision, 1);
  assert.deepEqual(parseMapEditorSource(await readFile(routePath, "utf8")).groundOverrides, { "2,2": "grass|path-dirt" });

  const missing = await fetch(`${origin}/api/dev/map-editor?map=missing-map`);
  assert.equal(missing.status, 404);
});
