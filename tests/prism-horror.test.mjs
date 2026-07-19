import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [script, html, styles, contract, mapData] = await Promise.all([
  readFile(path.join(root, "script.js"), "utf8"),
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
  readFile(path.join(root, "DIMENSION-PRISMA-TERROR.md"), "utf8"),
  readFile(path.join(root, "map-data.js"), "utf8"),
]);

function generatedMaze() {
  const start = script.indexOf("function seededRandom");
  const end = script.indexOf("function firstOpenDirection");
  assert.ok(start >= 0 && end > start);
  const context = { result: null };
  vm.runInNewContext(
    `const clamp = (value, min, max) => Math.max(min, Math.min(max, value));\n${script.slice(start, end)}\nresult = generateMaze();`,
    context,
  );
  return context.result;
}

function reachable(grid, start, goal) {
  const queue = [start];
  const visited = new Set([`${start.x},${start.y}`]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === goal.x && current.y === goal.y) return true;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x = current.x + dx; const y = current.y + dy; const key = `${x},${y}`;
      if (grid[y]?.[x] === 0 && !visited.has(key)) {
        visited.add(key); queue.push({ x, y });
      }
    }
  }
  return false;
}

test("el laberinto genera exactamente tres salidas extra, distintas y alcanzables", () => {
  const maze = generatedMaze();
  assert.deepEqual(
    Array.from(maze.exits, (exit) => exit.id),
    ["stalePotion", "moldyBerry", "weakPokemon"],
  );
  assert.equal(new Set(maze.exits.map((exit) => `${exit.x},${exit.y}`)).size, 3);
  const critical = new Set([maze.start, maze.goal, maze.monster, maze.market].map((point) => `${point.x},${point.y}`));
  maze.exits.forEach((exit) => {
    assert.equal(maze.grid[exit.y]?.[exit.x], 0, exit.id);
    assert.equal(critical.has(`${exit.x},${exit.y}`), false, exit.id);
    assert.equal(reachable(maze.grid, maze.start, exit), true, exit.id);
  });
});

test("los dos objetos pochos tienen inventario y curación mínima", () => {
  assert.match(script, /key: "stalePotions"[\s\S]*?Apenas restaura 1 PS/);
  assert.match(script, /key: "moldyBerries"[\s\S]*?Restaura 2 PS/);
  assert.match(script, /key === "moldyBerries" \? 2 : 1/);
  assert.match(script, /activatePrismExit\(poi\.exit\)/);
  assert.match(styles, /\.inventory-item\.tainted/);
});

test("Jerusalén, Persépolis y Siracusa contienen los tres Fragmentos Prisma recogibles", () => {
  const mapContext = { window: { CITY_MAP_LAYOUT: { tileSize: 32 }, CITY_MAP_EDITOR_DATA: {} } };
  vm.runInNewContext(mapData, mapContext);
  const fragments = Array.from(mapContext.window.CITY_MAP_CONFIG.worldObjects || []);
  assert.deepEqual(fragments.map((item) => item.id), [
    "prism-shard-jerusalen", "prism-shard-persepolis", "prism-shard-siracusa",
  ]);
  fragments.forEach((item) => {
    assert.equal(item.dimension, "san_pablo");
    assert.equal(item.kind, "prismShards");
    assert.equal(item.amount, 1);
    assert.equal(item.crystal, true);
  });
  assert.match(script, /state\.inventory\.prismShards = Math\.min\(3, \(state\.inventory\.prismShards \|\| 0\) \+ object\.amount\)/);
  assert.match(script, /object\.kind !== "prismShards" \|\| state\.inventory\.prismShards < 3/);
  assert.match(script, /Has encontrado un Fragmento Prisma \(\$\{shards\} \/ 3\)/);
});

test("la salida débil cubre combate, captura, huida, derrota y retorno", () => {
  assert.match(script, /function startPrismExitBattle\(exit\)/);
  assert.match(script, /prismExitBattle: true/);
  assert.match(script, /completePrismWeakExit\(defeated, "derrotado"\)/);
  assert.match(script, /completePrismWeakExit\(enemy, "capturado"\)/);
  assert.match(script, /completePrismWeakExit\(battle\.enemy, "huida"\)/);
  assert.match(script, /lostAtPrismExit/);
  assert.match(script, /leavePrismDimension\(\);\s*finishBattle\(\);/);
});

test("la capa de terror expone HUD, atmósfera, táctil y accesibilidad", () => {
  [
    "prismAtmosphere", "prismStressMeter", "prismEndingTracker", "prismWhisper",
    "prismDangerAnnouncer", "prismFlashButton",
  ].forEach((id) => assert.ok(html.includes(`id="${id}"`), id));
  [
    ".prism-grain", ".prism-scanlines", ".prism-vignette", ".prism-danger-pulse",
    ".stress-track", ".prism-ending-tracker", "prefers-reduced-motion: reduce",
  ].forEach((selector) => assert.ok(styles.includes(selector), selector));
  assert.match(script, /function updatePrismAtmosphere/);
  assert.match(script, /function playPrismHeartbeat/);
  assert.match(script, /function drawPrismApparition/);
  assert.match(script, /function drawMazeExits/);
});

test("los portales desprenden fragmentos Prisma generados por PixelLab", async () => {
  assert.match(script, /PRISM_PORTAL_FRAGMENTS_URL/);
  assert.match(script, /function drawPortalFragments/);
  assert.match(script, /if \(state\.dimension === "prism"\) \{\s*drawPortalFragments/);
  assert.match(script, /drawPortalFragments\(context, \{/);
  const asset = await stat(path.join(root, "assets", "effects", "prisma", "portal-fragments-pixellab.png"));
  assert.ok(asset.size > 500, "el sprite de fragmentos no puede estar vacío");
});

test("el contrato entregado enumera exactamente 50 mejoras", () => {
  const numbered = contract.match(/^\d+\./gm) || [];
  assert.equal(numbered.length, 50);
  assert.equal(numbered[0], "1.");
  assert.equal(numbered.at(-1), "50.");
});
