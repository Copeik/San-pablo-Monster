import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseMapEditorSource } from "../map-editor-server.mjs";
import { createAppServer, sanitizeMapEditorData } from "../server.mjs";

async function startEditorServer({ env = {}, editorPersist } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "pokemon-map-editor-"));
  const editorDataPath = path.join(directory, "map-editor-data.js");
  const server = createAppServer({ env: { NODE_ENV: "test", ...env }, editorDataPath, editorPersist });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    directory, editorDataPath, server, origin,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function connectEventStream(url) {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next(expectedEvent, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary >= 0) {
          const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const event = block.match(/^event: (.+)$/m)?.[1];
          const data = block.match(/^data: (.+)$/m)?.[1];
          if (!event || !data || (expectedEvent && event !== expectedEvent)) continue;
          return { event, data: JSON.parse(data) };
        }
        const remaining = Math.max(1, deadline - Date.now());
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`SSE ${expectedEvent} agotó el tiempo`)), remaining);
        });
        const result = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
        if (result.done) throw new Error("SSE terminó antes del evento esperado");
        buffer += decoder.decode(result.value, { stream: true }).replace(/\r/g, "");
      }
      throw new Error(`No llegó el evento SSE ${expectedEvent}`);
    },
    async close() {
      controller.abort();
      await reader.cancel().catch(() => {});
    },
  };
}

test("normaliza y migra los datos del editor al esquema v3", () => {
  assert.deepEqual(sanitizeMapEditorData({
    tileOverrides: { "2,3": "encounter", "199,1": "blocked", nope: "walkable" },
    assetOverrides: { house: { x: 9000, y: 40, scale: 9, solid: false, label: "Casa editada" } },
    addedAssets: [{ id: "editor-bench-1", sprite: "bench", scene: "interior:house-1:abc", x: 120, y: 200, scale: .1 }],
    hiddenAssets: ["old-house", "old-house", "../bad"],
    npcOverrides: { guide: { col: 4, row: 5, direction: "left", name: "Guía" } },
    addedNpcs: [{ id: "npc-new", col: 7, row: 8, direction: "down", name: "Sol", sprite: "guide", lines: ["Hola"] }],
    hiddenNpcs: ["npc-old"],
    entrances: [{ id: "exit-north", col: 2, row: 1, action: "transition", targetMap: "route_1", targetX: 20, targetY: 30 }],
    events: [{ id: "thought-1", col: 8, row: 9, type: "thought", trigger: "step", message: "Algo se mueve", once: true }],
  }), {
    version: 3,
    tileOverrides: { "2,3": "encounter" },
    groundOverrides: {},
    mapSize: { cols: 79, rows: 79 },
    assetOverrides: { house: { x: 4096, y: 40, scale: 4, rotation: 0, solid: false, label: "Casa editada" } },
    addedAssets: [{ x: 120, y: 200, scale: .25, rotation: 0, solid: true, scene: "interior:house-1:abc", id: "editor-bench-1", sprite: "bench" }],
    hiddenAssets: ["old-house"],
    npcOverrides: { guide: { col: 4, row: 5, direction: "left", name: "Guía" } },
    addedNpcs: [{ id: "npc-new", col: 7, row: 8, direction: "down", name: "Sol", sprite: "guide", lines: ["Hola"] }],
    hiddenNpcs: ["npc-old"],
    entrances: [{ id: "exit-north", col: 2, row: 1, action: "transition", targetMap: "route_1", targetX: 20, targetY: 30 }],
    events: [{ id: "thought-1", col: 8, row: 9, type: "thought", trigger: "step", message: "Algo se mueve", once: true, enabled: true }],
  });
});

test("GET entrega snapshot y el POST completo legacy persiste atómicamente en v3", async (t) => {
  const app = await startEditorServer(); t.after(() => app.close());
  const availability = await fetch(`${app.origin}/api/dev/map-editor`);
  assert.equal(availability.status, 200);
  const initial = await availability.json();
  assert.equal(initial.enabled, true);
  assert.equal(initial.file, "map-editor-data.js");
  assert.equal(initial.revision, 0);
  assert.equal(initial.data.version, 3);
  assert.deepEqual(initial.collaboration, { enabled: false, requireToken: false });

  const response = await postJson(`${app.origin}/api/dev/map-editor`, {
    tileOverrides: { "8,9": "walkable" },
    addedAssets: [{ id: "editor-tree-1", sprite: "deciduous", x: 320, y: 640, scale: 1.2 }],
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.revision, 1);
  assert.equal(result.tiles, 1);
  assert.equal(result.objects, 1);
  assert.deepEqual(result.counts, { tiles: 1, ground: 0, objects: 1, npcs: 0, entrances: 0, events: 0 });
  const written = await readFile(app.editorDataPath, "utf8");
  assert.equal(parseMapEditorSource(written).version, 3);
  assert.match(written, /"editor-tree-1"/);

  const liveData = await fetch(`${app.origin}/map-editor-data.js?v=test`, { headers: { Connection: "close" } });
  assert.equal(liveData.status, 200);
  assert.equal(liveData.headers.get("cache-control"), "no-cache");
  await liveData.arrayBuffer();
});

test("operaciones concurrentes fusionan claves distintas y rechazan la misma clave obsoleta", async (t) => {
  const app = await startEditorServer(); t.after(() => app.close());
  const operation = (actorId, key, value, baseRevision = 0) => postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId, name: actorId, baseRevision, operations: [{ type: "tile.set", key, value }],
  });

  const distinct = await Promise.all([
    operation("alice", "1,1", "blocked"),
    operation("bob", "2,2", "encounter"),
  ]);
  assert.deepEqual(distinct.map((entry) => entry.status), [200, 200]);
  assert.deepEqual((await Promise.all(distinct.map((entry) => entry.json()))).map((entry) => entry.revision).sort(), [1, 2]);
  let snapshot = await (await fetch(`${app.origin}/api/dev/map-editor`)).json();
  assert.deepEqual(snapshot.data.tileOverrides, { "1,1": "blocked", "2,2": "encounter" });

  const collision = await Promise.all([
    operation("alice", "3,3", "blocked", snapshot.revision),
    operation("bob", "3,3", "walkable", snapshot.revision),
  ]);
  assert.deepEqual(collision.map((entry) => entry.status).sort(), [200, 409]);
  const conflict = await collision.find((entry) => entry.status === 409).json();
  assert.equal(conflict.code, "conflict");
  assert.deepEqual(conflict.conflicts, ["tile:3,3"]);
  assert.equal(conflict.current["tile:3,3"] === "blocked" || conflict.current["tile:3,3"] === "walkable", true);
  snapshot = await (await fetch(`${app.origin}/api/dev/map-editor`)).json();
  assert.equal(snapshot.revision, 3);
  assert.equal(Object.keys(snapshot.data.tileOverrides).length, 3);

  const persisted = parseMapEditorSource(await readFile(app.editorDataPath, "utf8"));
  assert.deepEqual(persisted.tileOverrides, snapshot.data.tileOverrides);
});

test("guarda suelo visual y amplía el mapa sin permitir reducciones", async (t) => {
  const app = await startEditorServer(); t.after(() => app.close());
  const expanded = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "builder", baseRevision: 0, transactionId: "ground-and-size",
    operations: [
      { type: "ground.set", key: "80,80", value: "grass|path-asphalt" },
      { type: "map.resize", value: { cols: 89, rows: 91 } },
    ],
  });
  assert.equal(expanded.status, 200);
  const expandedBody = await expanded.json();
  assert.equal(expandedBody.counts.ground, 1);

  const shrink = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "builder", baseRevision: 1, transactionId: "no-shrink",
    operations: [{ type: "map.resize", value: { cols: 80, rows: 80 } }],
  });
  assert.equal(shrink.status, 200);
  const snapshot = await (await fetch(`${app.origin}/api/dev/map-editor`)).json();
  assert.deepEqual(snapshot.data.mapSize, { cols: 89, rows: 91 });
  assert.deepEqual(snapshot.data.groundOverrides, { "80,80": "grass|path-asphalt" });
});

test("valida operaciones estrictamente, no trunca y mantiene el archivo anterior", async (t) => {
  const app = await startEditorServer(); t.after(() => app.close());
  const valid = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "strict", baseRevision: 0, transactionId: "valid-1",
    operations: [{ type: "tile.set", key: "1,1", value: "walkable" }],
  });
  assert.equal(valid.status, 200);
  const before = await readFile(app.editorDataPath, "utf8");
  const message = "x".repeat(1001);
  const invalid = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "strict", baseRevision: 1, transactionId: "invalid-1",
    operations: [{ type: "entity.set", entity: "event", collection: "events", id: "too-long", value: {
      id: "too-long", col: 2, row: 2, type: "dialogue", trigger: "step", message,
    } }],
  });
  assert.equal(invalid.status, 400);
  const body = await invalid.json();
  assert.equal(body.code, "validation");
  assert.match(body.errors.join(" "), /1000/);
  assert.equal(await readFile(app.editorDataPath, "utf8"), before);

  const outside = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "strict", baseRevision: 1, transactionId: "invalid-2",
    operations: [{ type: "entity.set", entity: "entrance", collection: "entrances", id: "outside", value: {
      id: "outside", col: 2, row: 2, action: "transition", targetMap: "current", targetX: 5000, targetY: 20,
    } }],
  });
  assert.equal(outside.status, 400);

  const invalidLayers = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "strict", baseRevision: 1, transactionId: "invalid-ground-layers",
    operations: [{ type: "ground.set", key: "3,3", value: "grass|asphalt" }],
  });
  assert.equal(invalidLayers.status, 400);
});

test("una transacción repetida es idempotente y no duplica revisión", async (t) => {
  const app = await startEditorServer(); t.after(() => app.close());
  const body = {
    actorId: "alice", name: "Alice", baseRevision: 0, transactionId: "keepalive-1", label: "Trazo",
    operations: [{ type: "tile.set", key: "7,7", value: "blocked" }],
  };
  const first = await postJson(`${app.origin}/api/dev/map-editor/operations`, body);
  const firstResult = await first.json();
  assert.equal(first.status, 200);
  const retry = await postJson(`${app.origin}/api/dev/map-editor/operations`, body);
  const retryResult = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(retryResult.revision, firstResult.revision);
  const snapshot = await (await fetch(`${app.origin}/api/dev/map-editor`)).json();
  assert.equal(snapshot.revision, 1);
  assert.deepEqual(snapshot.data.tileOverrides, { "7,7": "blocked" });
});

test("dos editores sobre la misma entidad reciben copia autoritativa recuperable", async (t) => {
  const app = await startEditorServer(); t.after(() => app.close());
  const create = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "owner", baseRevision: 0, transactionId: "create-house",
    operations: [{ type: "entity.set", entity: "asset", collection: "addedAssets", id: "shared-house", value: {
      id: "shared-house", sprite: "institutional", x: 100, y: 200, scale: 1,
    } }],
  });
  assert.equal(create.status, 200);
  const baseRevision = (await create.json()).revision;
  const operation = (actorId, transactionId, x) => postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId, baseRevision, transactionId,
    operations: [{ type: "entity.set", entity: "asset", collection: "addedAssets", id: "shared-house", value: {
      id: "shared-house", sprite: "institutional", x, y: 200, scale: 1,
    } }],
  });
  const results = await Promise.all([operation("alice", "move-alice", 300), operation("bob", "move-bob", 500)]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const conflict = await results.find(({ status }) => status === 409).json();
  assert.deepEqual(conflict.conflicts, ["entity:asset:shared-house"]);
  assert.equal(conflict.current["entity:asset:shared-house"].id, "shared-house");
  assert.equal([300, 500].includes(conflict.current["entity:asset:shared-house"].x), true);
});

test("entity.set/delete usa colecciones explícitas y mantiene arrays por id", async (t) => {
  const app = await startEditorServer(); t.after(() => app.close());
  const response = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "builder", name: "Builder", baseRevision: 0,
    operations: [
      { type: "entity.set", entity: "asset", collection: "assetOverrides", id: "base-house", value: { x: 100, y: 200, label: "Casa base" } },
      { type: "entity.set", entity: "npc", collection: "addedNpcs", id: "npc-friend", value: { col: 4, row: 5, direction: "right", name: "Amigo", sprite: "guide", lines: ["Vamos"] } },
      { type: "entity.set", entity: "entrance", collection: "entrances", id: "to-route", value: { col: 5, row: 6, action: "transition", targetMap: "route_2", targetX: 50, targetY: 60 } },
      { type: "entity.set", entity: "event", collection: "events", id: "rumble", value: { col: 7, row: 8, type: "vibration", trigger: "step", intensity: 2, duration: 500 } },
    ],
  });
  assert.equal(response.status, 200);
  const snapshot = await (await fetch(`${app.origin}/api/dev/map-editor`)).json();
  assert.equal(snapshot.data.assetOverrides["base-house"].label, "Casa base");
  assert.equal(snapshot.data.addedNpcs[0].id, "npc-friend");
  assert.equal(snapshot.data.entrances[0].id, "to-route");
  assert.equal(snapshot.data.events[0].type, "vibration");

  const deletion = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "builder", name: "Builder", baseRevision: snapshot.revision,
    operations: [{ type: "entity.delete", entity: "asset", collection: "assetOverrides", id: "base-house", hide: true }],
  });
  assert.equal(deletion.status, 200);
  const afterDelete = await (await fetch(`${app.origin}/api/dev/map-editor`)).json();
  assert.equal(afterDelete.data.assetOverrides["base-house"], undefined);
  assert.deepEqual(afterDelete.data.hiddenAssets, ["base-house"]);
});

test("SSE emite snapshot, presencia y operaciones autoritativas", async (t) => {
  const app = await startEditorServer(); t.after(() => app.close());
  const stream = await connectEventStream(`${app.origin}/api/dev/map-editor/events?actorId=alice&name=Alice&color=%23ff0000`);
  t.after(() => stream.close());
  const initial = await stream.next("snapshot");
  assert.equal(initial.data.revision, 0);
  assert.equal(initial.data.data.version, 3);

  await stream.next("presence");
  const presenceResponse = await postJson(`${app.origin}/api/dev/map-editor/presence`, {
    actorId: "bob", name: "Bob", color: "#00ff00", cursor: { x: 40, y: 50 }, mode: "events",
    player: { x: 640, y: 2080, direction: "right", dimension: "san_pablo", moving: true, running: false, frame: 2 },
  });
  assert.equal(presenceResponse.status, 200);
  const presenceEvent = await stream.next("presence");
  assert.equal(presenceEvent.data.users.some((user) => user.actorId === "bob" && user.cursor.x === 40), true);
  const bob = presenceEvent.data.users.find((user) => user.actorId === "bob");
  assert.deepEqual(bob.player, {
    x: 640, y: 2080, direction: "right", dimension: "san_pablo", interior: null,
    moving: true, running: false, frame: 2,
  });

  const operationResponse = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "bob", name: "Bob", baseRevision: 0,
    operations: [{ type: "tile.set", key: "6,6", value: "event" }],
  });
  assert.equal(operationResponse.status, 200);
  const operationEvent = await stream.next("operations");
  assert.equal(operationEvent.data.actorId, "bob");
  assert.equal(operationEvent.data.revision, 1);
  assert.deepEqual(operationEvent.data.operations, [{ type: "tile.set", key: "6,6", value: "event" }]);
});

test("un fallo de persistencia no avanza memoria, revisión ni archivo", async (t) => {
  const app = await startEditorServer({ editorPersist: async () => { throw new Error("disk full"); } });
  t.after(() => app.close());
  const response = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    actorId: "alice", name: "Alice", baseRevision: 0,
    operations: [{ type: "tile.set", key: "1,1", value: "blocked" }],
  });
  assert.equal(response.status, 500);
  const snapshot = await (await fetch(`${app.origin}/api/dev/map-editor`)).json();
  assert.equal(snapshot.revision, 0);
  assert.deepEqual(snapshot.data.tileOverrides, {});
  await assert.rejects(readFile(app.editorDataPath, "utf8"), { code: "ENOENT" });
});

test("modo colaborativo acepta token en query, header o body y producción permanece oculta", async (t) => {
  const app = await startEditorServer({ env: {
    GAME_EDITOR_COLLAB: "1", GAME_EDITOR_TOKEN: "secret-token", GAME_EDITOR_REQUIRE_TOKEN: "1",
  } });
  t.after(() => app.close());
  assert.equal((await fetch(`${app.origin}/api/dev/map-editor`)).status, 401);
  const query = await fetch(`${app.origin}/api/dev/map-editor?editorToken=secret-token`);
  assert.equal(query.status, 200);
  const collaboration = (await query.json()).collaboration;
  assert.equal(collaboration.enabled, true);
  assert.equal(collaboration.requireToken, true);
  assert.equal(collaboration.inviteUrl === null || collaboration.inviteUrl.includes("editorToken=secret-token"), true);
  assert.equal((await fetch(`${app.origin}/api/dev/map-editor`, { headers: { "X-Editor-Token": "secret-token" } })).status, 200);
  const operation = await postJson(`${app.origin}/api/dev/map-editor/operations`, {
    editorToken: "secret-token", actorId: "friend", name: "Friend", baseRevision: 0,
    operations: [{ type: "tile.set", key: "4,4", value: "walkable" }],
  });
  assert.equal(operation.status, 200);

  const production = createAppServer({ env: { NODE_ENV: "production", GAME_EDITOR_COLLAB: "1", GAME_EDITOR_TOKEN: "secret-token" }, editorDataPath: app.editorDataPath });
  await new Promise((resolve) => production.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => production.close((error) => error ? reject(error) : resolve())));
  assert.equal((await fetch(`http://127.0.0.1:${production.address().port}/api/dev/map-editor?editorToken=secret-token`)).status, 404);
});
