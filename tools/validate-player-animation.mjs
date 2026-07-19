import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlayerDirectionalSprite } from "./validate-player-directional-sprite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spritePath = path.join(root, "assets", "sprites", "protagonist-walk-pixellab.png");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const movement = fs.readFileSync(path.join(root, "player-movement.js"), "utf8");
const standard = JSON.parse(fs.readFileSync(
  path.join(root, "assets", "sprites", "player-directional-sprite-standard.json"),
  "utf8",
));
const report = validatePlayerDirectionalSprite(spritePath);
const failures = [...report.failures];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(report.valid, "El atlas PixelLab del protagonista no cumple el contrato 6x8.");
check(standard.source === "PixelLab MCP", "Falta la procedencia PixelLab en el contrato del atlas.");
check(standard.characterId === "b96197cb-8527-4fdf-bd6d-d48c01c41804",
  "El contrato no identifica al personaje Youngster de PixelLab.");
check(standard.grid?.columns === 6 && standard.grid?.rows === 8,
  "El contrato debe declarar seis fotogramas y ocho direcciones.");
check(script.includes("const PLAYER_WALK_FRAME_COUNT = 6"), "El runtime no usa el ciclo Walk de seis fotogramas.");
check(script.includes("protagonist-walk-pixellab.png"), "El runtime no carga el atlas Walk exportado de PixelLab.");
check(script.includes("pixellab:b96197cb-8527-4fdf-bd6d-d48c01c41804:walk"),
  "Falta el diagnóstico de procedencia PixelLab.");
check(movement.includes("const WALK_FRAME_COUNT = 6"), "El avance por distancia no usa seis fotogramas.");

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OK: Walk PixelLab de seis fotogramas integrado en las ocho direcciones.");
}
