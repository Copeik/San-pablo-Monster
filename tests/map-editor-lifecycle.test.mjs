import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { buildMapEditorBundle } from "../tools/build-map-editor-bundle.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const [client, standalone, expectedStandalone] = await Promise.all([
  readFile(path.join(ROOT, "map-editor.js"), "utf8"),
  readFile(path.join(ROOT, "map-editor-standalone.js"), "utf8"),
  buildMapEditorBundle(),
]);

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      bodyStart = source.indexOf("{", index);
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `falta el cuerpo de ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`no se pudo aislar ${name}`);
}

test("el supervisor colaborativo se detiene por completo y de forma idempotente", () => {
  const active = functionSource(client, "realtimeLifecycleActive");
  const stop = functionSource(client, "stopRealtimeLifecycle");
  const start = functionSource(client, "startRealtimeLifecycle");

  assert.match(active, /enabled && bridge\.isOpen\(\) && document\.visibilityState !== "hidden"/);
  assert.match(stop, /eventSource\?\.close\(\)/);
  assert.match(stop, /eventSource = null/);
  for (const timer of ["reconnectTimer", "presenceTimer", "presenceMovementTimer", "presenceHeartbeatTimer", "diagnosticsTimer"]) {
    assert.match(stop, new RegExp(`clear(?:Timeout|Interval)\\(${timer}\\)`));
    assert.match(stop, new RegExp(`${timer} = 0`));
  }
  assert.match(start, /if \(!realtimeLifecycleActive\(\) \|\| soloMode\) \{[\s\S]*?stopRealtimeLifecycle\(\)/);
  assert.match(start, /if \(!eventSource\) openEventStream\(\)/);
  assert.match(start, /startPresenceHeartbeat\(\)/);
  assert.match(start, /sendPresence\(presenceCursor\)/);
});

test("SSE, reconexión y presencia no pueden reactivarse con editor cerrado u oculto", () => {
  for (const name of ["openEventStream", "scheduleReconnect", "publishPresence", "sendPresence", "startPresenceHeartbeat"]) {
    assert.match(functionSource(client, name), /realtimeLifecycleActive\(\)/, `${name} debe respetar el ciclo de vida`);
  }
  const stream = functionSource(client, "openEventStream");
  assert.match(stream, /const source = new EventSource\(url\)/);
  assert.match(stream, /source !== eventSource \|\| !realtimeLifecycleActive\(\)/);
  assert.match(functionSource(client, "scheduleReconnect"), /realtimeLifecycleActive\(\).*reconnectTimer/);
});

test("abrir, cerrar y cambiar visibilidad activan un único ciclo colaborativo", () => {
  assert.match(client, /document\.addEventListener\("map-editor-open", \(\) => \{[\s\S]*?prepareOpenEditor\(\);[\s\S]*?startRealtimeLifecycle\(\);[\s\S]*?\}\)/);
  assert.match(client, /document\.addEventListener\("map-editor-close", \(\) => \{[\s\S]*?commitTransientTransactions\(\);[\s\S]*?stopRealtimeLifecycle\(\);[\s\S]*?\}\)/);

  const binding = functionSource(client, "bindUi");
  const visibility = binding.slice(binding.indexOf('document.addEventListener("visibilitychange"'));
  assert.match(visibility, /document\.visibilityState === "hidden"[\s\S]*?stopRealtimeLifecycle\(\)/);
  assert.match(visibility, /if \(!bridge\.isOpen\(\)\) \{[\s\S]*?stopRealtimeLifecycle\(\);[\s\S]*?return;[\s\S]*?startRealtimeLifecycle\(\)/);
  assert.doesNotMatch(client, /openEventStream\(\); startPresenceHeartbeat\(\); sendPresence\(\)/);
});

test("el bundle clásico conserva exactamente el mismo ciclo de vida", () => {
  assert.equal(standalone, expectedStandalone);
  assert.match(standalone, /function stopRealtimeLifecycle\(\)/);
  assert.match(standalone, /function startRealtimeLifecycle\(\)/);
});
