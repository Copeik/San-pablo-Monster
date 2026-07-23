#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NPC_ROOT = path.join(ROOT, "assets", "sprites", "npcs");
const ROW_ORDER = [
  "down",
  "down-right",
  "right",
  "up-right",
  "up",
  "up-left",
  "left",
  "down-left",
];

// spriteId and npcId intentionally preserve the identifiers already used by
// maps, saves and the editor. Human-readable names only determine the folder.
const DEFINITIONS = [
  ["abuela-morada", "Abuela morada", "abuela-morada"],
  ["abuelo-cana", "Abuelo canoso", "abuelo-canoso"],
  ["bailaora", "Bailaora", "bailaora"],
  ["camarera-azul", "Camarera de azul", "camarera-de-azul"],
  ["camarero-bandeja", "Camarero con bandeja", "camarero-con-bandeja"],
  ["campesino", "Campesino", "campesino"],
  ["chica-lazo", "Chica del lazo", "chica-del-lazo"],
  ["chica-mochila", "Chica con mochila", "chica-con-mochila"],
  ["doctor-potato", "Doctor Potato", "doctor-potato"],
  ["hortelano", "Hortelano", "hortelano"],
  ["mochilera", "Mochilera", "mochilera"],
  ["nina-turquesa", "Niña de turquesa", "nina-de-turquesa"],
  ["nino-polo", "Niño del polo", "nino-del-polo"],
  ["nino-sol", "Niño del sol", "nino-del-sol"],
  ["npc-01-nurse", "Enfermera", "enfermera"],
  ["npc-02-shopkeeper", "Dependiente", "dependiente"],
  ["npc-03-professor", "Investigador", "investigador"],
  ["npc-04-grandmother", "Abuela Lola", "abuela-lola"],
  ["npc-05-child", "Niño Teo", "nino-teo"],
  ["npc-06-fisher", "Pescador Berto", "pescador-berto"],
  ["npc-07-grandfather", "Don Ramón", "don-ramon"],
  ["npc-08-student", "Estudiante Ana", "estudiante-ana"],
  ["npc-09-merchant", "Comerciante Poli", "comerciante-poli"],
  ["npc-10-artist", "Artista Lua", "artista-lua"],
  ["npc-11-athlete", "Deportista Max", "deportista-max"],
  ["npc-12-caretaker", "Cuidadora Veva", "cuidadora-veva"],
  ["npc-13-gardener", "Jardinera Sol", "jardinera-sol"],
  ["npc-14-officer", "Agente Emilia", "agente-emilia"],
  ["npc-15-chef", "Chef Paco", "chef-paco"],
  ["npc-16-mechanic", "Mecánica Reme", "mecanica-reme"],
  ["npc-17-musician", "Músico Lolo", "musico-lolo"],
  ["npc-18-cyclist", "Ciclista Toni", "ciclista-toni"],
  ["npc-19-hiker", "Senderista Paca", "senderista-paca"],
  ["npc-20-office-worker", "Oficinista Julián", "oficinista-julian"],
  ["npc-21-teen-girl", "Entrenadora Nerea", "entrenadora-nerea"],
  ["npc-22-teen-boy", "Entrenador Dani", "entrenador-dani"],
  ["npc-23-baker", "Panadera Inés", "panadera-ines"],
  ["npc-24-builder", "Albañil Manolo", "albanil-manolo"],
  ["npc-25-doctor", "Doctor Mateo", "doctor-mateo"],
  ["npc-26-vendor", "Vendedora Chari", "vendedora-chari"],
  ["npc-27-librarian", "Bibliotecaria Maribel", "bibliotecaria-maribel"],
  ["npc-28-tourist", "Turista Tino", "turista-tino"],
  ["npc-29-dancer", "Bailarina Lola", "bailarina-lola"],
  ["npc-30-ranger", "Guardabosques Roque", "guardabosques-roque"],
  ["npc-guide", "Guía de San Pablo", "guia-de-san-pablo", ["guide"]],
  ["rival", "Rival", "rival"],
  ["skater-capucha", "Skater con capucha", "skater-con-capucha"],
  ["skater-verde", "Skater verde", "skater-verde"],
].map(([spriteId, displayName, entitySlug, aliases = []]) => ({
  npcId: spriteId,
  spriteId,
  displayName,
  entitySlug,
  aliases,
}));

function posixPath(...parts) {
  return parts.join("/");
}

async function sha256(file) {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function creditsFor(record) {
  const sourcePath = posixPath("assets", "sprites", "npcs", "legacy-4x4", `${record.spriteId}-walk.png`);
  return `${record.displayName}\n${"=".repeat(record.displayName.length)}\n\n`
    + `NPC overworld asset for pokemon-adventure.\n\n`
    + `Immediate declared source: ${sourcePath}\n`
    + `Runtime asset: overworld.png\n\n`
    + `The canonical 384x512 sheet was moved into this individual pack byte-for-byte; no pixels were regenerated or edited.\n`
    + `See assets/sprites/CREDITS.txt for the project-level artwork provenance and attribution notes.\n`;
}

async function build() {
  if (DEFINITIONS.length !== 48) throw new Error(`Expected 48 NPC definitions, got ${DEFINITIONS.length}`);
  const entitySlugs = new Set(DEFINITIONS.map(({ entitySlug }) => entitySlug));
  if (entitySlugs.size !== DEFINITIONS.length) throw new Error("NPC entitySlug values must be unique");

  const sprites = [];
  const catalog = new Map();
  for (const record of DEFINITIONS) {
    const folder = path.join(NPC_ROOT, "overworld", record.entitySlug);
    const output = path.join(folder, "overworld.png");
    const sourcePath = posixPath("assets", "sprites", "npcs", "legacy-4x4", `${record.spriteId}-walk.png`);
    await fs.access(output);
    await fs.access(path.join(ROOT, ...sourcePath.split("/")));

    const manifest = {
      schemaVersion: 1,
      kind: "npc-overworld-pack",
      profile: "npc-overworld-v1",
      npcId: record.npcId,
      spriteId: record.spriteId,
      displayName: record.displayName,
      entitySlug: record.entitySlug,
      aliases: record.aliases,
      slot: "overworld",
      path: "overworld.png",
      format: "png",
      width: 384,
      height: 512,
      mode: "RGBA",
      grid: {
        columns: 6,
        rows: 8,
        cellSize: 64,
      },
      rowOrder: ROW_ORDER,
      sha256: await sha256(output),
      sourceAssetId: `${record.spriteId}-legacy-4x4`,
      sourcePath,
      credits: "credits.txt",
    };
    await fs.writeFile(path.join(folder, "manifest.json"), serialize(manifest), "utf8");
    await fs.writeFile(path.join(folder, "credits.txt"), creditsFor(record), "utf8");

    const runtimePath = posixPath("overworld", record.entitySlug, "overworld.png");
    sprites.push({
      id: record.spriteId,
      npcId: record.npcId,
      spriteId: record.spriteId,
      displayName: record.displayName,
      entitySlug: record.entitySlug,
      aliases: record.aliases,
      manifest: posixPath("overworld", record.entitySlug, "manifest.json"),
      slot: "overworld",
      path: runtimePath,
      file: runtimePath,
      source: posixPath("legacy-4x4", `${record.spriteId}-walk.png`),
    });
    const url = posixPath("assets", "sprites", "npcs", runtimePath);
    for (const id of [record.npcId, record.spriteId, ...record.aliases]) {
      const current = catalog.get(id);
      if (current && current !== url) throw new Error(`NPC catalog ID collision: ${id}`);
      catalog.set(id, url);
    }
  }

  const rootManifest = {
    schemaVersion: 1,
    kind: "npc-overworld-catalog",
    profile: "npc-overworld-v1",
    contract: "npc-walk-6x8",
    inventoryCount: sprites.length,
    grid: { columns: 6, rows: 8, cellSize: 64 },
    rowOrder: ROW_ORDER,
    sprites,
  };
  await fs.writeFile(path.join(NPC_ROOT, "overworld-manifest.json"), serialize(rootManifest), "utf8");

  const catalogObject = Object.fromEntries([...catalog.entries()].sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  )));
  const catalogSource = `(() => {\n  "use strict";\n  globalThis.NPC_ASSET_CATALOG = Object.freeze(${JSON.stringify(catalogObject, null, 2).replaceAll("\n", "\n  ")});\n})();\n`;
  await fs.writeFile(path.join(NPC_ROOT, "catalog.js"), catalogSource, "utf8");
  process.stdout.write(`Built ${sprites.length} NPC manifests and ${catalog.size} catalog IDs/aliases.\n`);
}

await build();
