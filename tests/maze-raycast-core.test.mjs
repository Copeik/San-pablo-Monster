import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadCore() {
  const source = await readFile(path.join(root, "maze-raycast-core.js"), "utf8");
  const context = {};
  vm.runInNewContext(source, context);
  return context.MAZE_RAYCAST_CORE;
}

function legacyStepRay(grid, originX, originY, angle, maxDistance = 24) {
  const step = .025;
  for (let distance = step; distance < maxDistance; distance += step) {
    const x = originX + Math.cos(angle) * distance;
    const y = originY + Math.sin(angle) * distance;
    if (grid[Math.floor(y)]?.[Math.floor(x)] !== 0) return distance;
  }
  return maxDistance;
}

const grid = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
];

test("DDA conserva la distancia visual del ray marching con tolerancia de un paso", async () => {
  const { castGridRay } = await loadCore();
  const origins = [[1.5, 1.5], [3.25, 3.75], [5.5, 5.5]];
  const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 3, 2.17, 5.61];

  for (const [originX, originY] of origins) {
    for (const angle of angles) {
      const exact = castGridRay(grid, originX, originY, angle);
      const legacy = legacyStepRay(grid, originX, originY, angle);
      assert.ok(exact >= 0 && exact <= 24, `${originX},${originY} @ ${angle}`);
      assert.ok(Math.abs(legacy - exact) <= .025001, `${legacy} frente a ${exact}`);
    }
  }
});

test("DDA consulta celdas, no cientos de muestras por rayo", async () => {
  const { castGridRay } = await loadCore();
  let reads = 0;
  const openRows = Array.from({ length: 64 }, (_, y) => new Proxy(
    Array.from({ length: 64 }, (_, x) => (x === 0 || y === 0 || x === 63 || y === 63 ? 1 : 0)),
    { get(target, property, receiver) { if (/^\d+$/.test(String(property))) reads += 1; return Reflect.get(target, property, receiver); } },
  ));

  const distance = castGridRay(openRows, 32.5, 32.5, .371, 24);
  assert.equal(distance, 24);
  assert.ok(reads < 40, `se consultaron ${reads} celdas`);
});

test("el juego usa el núcleo DDA y no conserva el bucle de paso fijo", async () => {
  const [script, html] = await Promise.all([
    readFile(path.join(root, "script.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8"),
  ]);
  assert.match(html, /<script src="maze-raycast-core\.js"><\/script>/);
  assert.match(script, /MAZE_RAYCAST_CORE\.castGridRay/);
  const start = script.indexOf("function castMazeRay");
  const end = script.indexOf("function drawMaze3D", start);
  assert.doesNotMatch(script.slice(start, end), /distance \+= step/);
});
