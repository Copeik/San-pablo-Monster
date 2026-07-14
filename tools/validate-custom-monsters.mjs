import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mapData = fs.readFileSync(path.join(root, "map-data.js"), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function sourceBetween(startMarker, endMarker) {
  const start = script.indexOf(startMarker);
  const end = script.indexOf(endMarker, start + startMarker.length);
  check(start >= 0 && end > start, `No se pudo aislar ${startMarker}.`);
  return start >= 0 && end > start ? script.slice(start, end) : "";
}

function idsFromTable(name, endMarker) {
  return [...sourceBetween(`const ${name} =`, endMarker).matchAll(/\bid:\s*(\d+)/g)].map((match) => Number(match[1]));
}

const pokemonSource = sourceBetween("const POKEMON =", "const SANPLEDEX_FAMILIES");
const rosterIds = [...pokemonSource.matchAll(/^\s*(\d+):\s*\{\s*id:\s*\1,/gm)].map((match) => Number(match[1]));
const roster = new Set(rosterIds);
check(rosterIds.length === 22, `El catálogo jugable debe contener 22 monstruos locales y contiene ${rosterIds.length}.`);
check(rosterIds.every((id) => id >= 9000), "El catálogo jugable conserva IDs de especies oficiales.");
check(!/Pokémon\s+[A-ZÁÉÍÓÚÑ]/.test(pokemonSource), "Las fichas locales aún describen criaturas como especies oficiales.");

const assetSource = sourceBetween("const CUSTOM_POKEMON_ASSETS", "const CUSTOM_POKEMON_MOTIONS");
const assetEntries = [...assetSource.matchAll(/(\d+):\s*\{\s*front:\s*"([^"]+)",\s*back:\s*"([^"]+)"\s*\}/g)];
const assetIds = new Set(assetEntries.map((match) => Number(match[1])));
check(assetIds.size === roster.size && rosterIds.every((id) => assetIds.has(id)), "Cada monstruo del catálogo debe tener modelos frontal y trasero locales.");
for (const [, id, front, back] of assetEntries) {
  check(fs.existsSync(path.join(root, front)), `${id}: falta el modelo frontal ${front}.`);
  check(fs.existsSync(path.join(root, back)), `${id}: falta el modelo trasero ${back}.`);
}

const encounterGroups = {
  city: idsFromTable("WILD_TABLE", "const PRISM_WILD_TABLE"),
  route: idsFromTable("ROUTE_WILD_TABLE", "const INTERIOR_PALETTES"),
  prism: idsFromTable("PRISM_WILD_TABLE", "const BUILDING_SPRITES"),
};
for (const [name, ids] of Object.entries(encounterGroups)) {
  check(ids.length > 0, `La tabla ${name} está vacía.`);
  check(ids.every((id) => roster.has(id)), `La tabla ${name} contiene una especie ajena al catálogo local.`);
}

const starterIds = [...sourceBetween("const STARTERS", "const WILD_TABLE").matchAll(/POKEMON\[(\d+)\]/g)].map((match) => Number(match[1]));
const secretIds = [...sourceBetween("const SECRET_MONSTER_IDS", "const LOCAL_DEX_SIZE").matchAll(/\b(\d{4})\b/g)].map((match) => Number(match[1]));
check(starterIds.length === 4 && starterIds.every((id) => roster.has(id)), "Los iniciales deben ser cuatro monstruos locales.");
check(secretIds.length > 0 && secretIds.every((id) => roster.has(id)), "El rescate de Prisma contiene una especie ajena al catálogo local.");

const officialNames = [
  "Bulbasaur", "Charmander", "Squirtle", "Caterpie", "Weedle", "Pidgey", "Rattata", "Pikachu",
  "Oddish", "Abra", "Magnemite", "Gastly", "Drowzee", "Cubone", "Eevee", "Dratini", "Dragonite",
  "Tyranitar", "Salamence", "Metagross", "Bidoof", "Garchomp", "Hydreigon", "Zubat", "Magikarp",
];
const visibleSource = `${html}\n${mapData}\n${pokemonSource}`.toLocaleLowerCase("es");
for (const name of officialNames) check(!visibleSource.includes(name.toLocaleLowerCase("es")), `Aún se muestra la especie oficial ${name}.`);
check(!script.includes("sprites/pokemon") && !script.includes("official-artwork"), "La aplicación todavía tiene un fallback de modelos de especies oficiales.");

const videoPath = path.join(root, "assets", "video", "fragmentos-prisma.mp4");
check(fs.existsSync(videoPath), "Falta assets/video/fragmentos-prisma.mp4.");
if (fs.existsSync(videoPath)) {
  const video = fs.readFileSync(videoPath);
  check(video.length > 100_000, "El vídeo de los fragmentos está vacío o incompleto.");
  check(video.subarray(0, 64).includes(Buffer.from("ftyp")), "El recurso de los fragmentos no tiene cabecera MP4.");
}
[
  'id="fragmentCinematicScreen"', 'id="fragmentCinematicVideo"', 'id="playFragmentCinematic"',
  'id="skipFragmentCinematic"', 'src="assets/video/fragmentos-prisma.mp4"',
].forEach((contract) => check(html.includes(contract), `Falta el contrato de interfaz ${contract}.`));
check(script.includes('showDialog(messages, "◇", shards >= 3 ? startFragmentCinematic : null)'), "El tercer fragmento no inicia la visión.");
check(script.includes("fragmentCinematicSeen: false"), "El estado inicial no registra la visión Prisma.");
check(script.includes("next.fragmentCinematicSeen = Boolean(saved.fragmentCinematicSeen)"), "La visión Prisma no se hidrata al cargar.");
check(script.includes("state.fragmentCinematicSeen = true"), "La finalización de la visión Prisma no se persiste.");

if (failures.length) {
  console.error(`Validación fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OK: 22 monstruos locales, iniciales y encuentros propios en ambos mundos, migración sin modelos oficiales y cinemática Prisma persistente.");
}
