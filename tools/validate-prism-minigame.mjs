import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function shortestDistance(grid, start, goal) {
  const queue = [{ ...start, distance: 0 }];
  const visited = new Set([`${start.x},${start.y}`]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === goal.x && current.y === goal.y) return current.distance;
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dy]) => {
      const x = current.x + dx; const y = current.y + dy; const key = `${x},${y}`;
      if (grid[y]?.[x] === 0 && !visited.has(key)) {
        visited.add(key);
        queue.push({ x, y, distance: current.distance + 1 });
      }
    });
  }
  return Infinity;
}

const mazeSourceStart = script.indexOf("function seededRandom");
const mazeSourceEnd = script.indexOf("function firstOpenDirection");
check(mazeSourceStart >= 0 && mazeSourceEnd > mazeSourceStart, "No se pudo aislar el generador del laberinto.");

let maze = null;
if (mazeSourceStart >= 0 && mazeSourceEnd > mazeSourceStart) {
  const context = { result: null };
  vm.runInNewContext(
    `const clamp = (value, min, max) => Math.max(min, Math.min(max, value));\n${script.slice(mazeSourceStart, mazeSourceEnd)}\nresult = generateMaze();`,
    context,
  );
  maze = context.result;
}

if (maze) {
  const marketDistance = shortestDistance(maze.grid, maze.start, maze.market);
  const goalDistance = shortestDistance(maze.grid, maze.start, maze.goal);
  const ratio = marketDistance / goalDistance;
  check(maze.grid[maze.market.y]?.[maze.market.x] === 0, "El mercado no está en una casilla abierta.");
  check(Number.isFinite(marketDistance), "El mercado no es alcanzable desde el inicio.");
  check(ratio >= .35 && ratio <= .5, `El mercado está fuera del tramo previsto de la ruta (${ratio.toFixed(2)}).`);
  check(![maze.start, maze.goal, maze.monster].some((point) => point.x === maze.market.x && point.y === maze.market.y), "El mercado se solapa con otro punto crítico.");
}

[
  'id="mazeObjective"', 'id="noiseLabel"', 'id="shopDialog"', 'id="shopEyebrow"', 'id="shopTip"',
].forEach((fragment) => check(html.includes(fragment), `Falta el contrato de interfaz ${fragment}.`));

check(script.includes('black_market: "Entrar al mercado negro"'), "Falta el prompt del mercado negro.");
check(script.includes('door.action === "prism"'), "La puerta Prisma no está conectada a la interacción del mapa.");
check(script.includes('draw: () => drawPortal(context, portalPosition.x, portalPosition.y'), "El portal Prisma no se dibuja en el mundo.");
check(script.includes('(entrance.col + .5) * CITY_MAP.tileSize'), "El portal visual no está alineado con la puerta Prisma activa.");
check(script.includes('? "Examinar portal"'), "La puerta Prisma no tiene un prompt reconocible.");
check(script.includes("drawMazeBlackMarket(context, fov, wallDepths)"), "El puesto no está conectado al render 3D.");
check(script.includes("const chance = master ? 1"), "La Master Ball no garantiza la captura.");
check(script.includes("savedBlackMarketPurchases"), "El stock limitado no se hidrata al cargar.");
check(script.includes('return "movement"'), "Falta el modo sin micrófono.");
check(script.includes("state.blackMarket.discovered && mazeDefinition.market"), "El punto de control no se restaura al volver al laberinto.");
check(script.includes("checkpointReached ? Math.max(1, remainingLightCharges) : 3"), "El punto de control regala una recarga completa.");
check(script.includes('event.key === "Tab"'), "El diálogo de tienda no contiene el foco de teclado.");
check(styles.includes(".shop-modal.black-market"), "Falta el tema visual del mercado negro.");
check(styles.includes("max-height: min(88vh, 720px)"), "La tienda puede desbordar una pantalla baja.");
check(styles.includes(".world-screen.maze-mode .coordinate-hud"), "El HUD de ciudad invade el laberinto.");

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OK: portal y mercado Prisma visibles, mercado alcanzable, stock persistente, objetos premium, fallback de ruido y contratos UI validados.");
}
