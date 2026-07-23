#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { readMediaMetadata } from "./lib/asset-inventory.mjs";

const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPORT_PATH = "tools/assets/standard-compliance-v0.json";
const REVIEW_PATH = "asset-vault/legacy-runtime/nonstandard-assets-v0.json";
const POKEMON_ANIMATION_ONLY_PROFILE = "pokemon-animation-only-v1";
const POKEMON_STANDARD_SLOTS = Object.freeze([
  "idle-front.webp",
  "idle-back.webp",
  "attack-physical-front.webp",
  "attack-physical-back.webp",
  "attack-special-front.webp",
  "attack-special-back.webp",
]);

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function exists(file) {
  try {
    const info = await fs.lstat(file);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

async function inspectMedia(projectRoot, repoPath) {
  if (!repoPath) return null;
  const absolute = path.resolve(projectRoot, ...normalizePath(repoPath).split("/"));
  if (!absolute.startsWith(`${path.resolve(projectRoot)}${path.sep}`) || !(await exists(absolute))) return null;
  const data = await fs.readFile(absolute);
  try {
    return {
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
      ...readMediaMetadata(repoPath, data),
    };
  } catch (error) {
    return { bytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), error: error.message };
  }
}

function between(source, opening, closing) {
  const start = source.indexOf(opening);
  const end = source.indexOf(closing, start + opening.length);
  if (start < 0 || end < 0) throw new Error(`No se pudo localizar el bloque ${opening}`);
  return source.slice(start + opening.length, end);
}

function parsePokemonAssets(scriptSource) {
  const block = between(
    scriptSource,
    "const CUSTOM_POKEMON_ASSETS = Object.freeze({",
    "const CUSTOM_POKEMON_FRAME_ASSETS",
  );
  return [...block.matchAll(/^\s*(\d+): \{ front: "([^"]+)", back: "([^"]+)" \},$/gm)]
    .map((match) => ({ speciesId: Number(match[1]), front: match[2], back: match[3] }))
    .sort((left, right) => left.speciesId - right.speciesId);
}

function parseMoves(scriptSource) {
  const block = between(scriptSource, "const MOVES = {", "Object.entries(MOVES).forEach");
  return [...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*): \{ name: "([^"]+)"/gm)]
    .map((match) => ({ moveId: match[1], displayName: match[2], entitySlug: slugify(match[2]) }))
    .sort((left, right) => left.moveId.localeCompare(right.moveId));
}

function parseMoveEffects(scriptSource) {
  const block = between(scriptSource, "const MOVE_PIXEL_EFFECTS = Object.freeze({", "function movePixelEffect");
  return Object.fromEntries([...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*): Object\.freeze\(\{[\s\S]*?^\s*src: "([^"]+)"/gm)]
    .map((match) => [match[1], match[2]]));
}

function loadAnimationAssets(source) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "sanpledex-animation-data.js" });
  return sandbox.SANPLEDEX_ANIMATION_ASSETS || {};
}

function animationSlotPaths(record) {
  return {
    "idle-front.webp": normalizePath(record?.idle?.front),
    "idle-back.webp": normalizePath(record?.idle?.back),
    "attack-physical-front.webp": normalizePath(record?.attacks?.physical?.front),
    "attack-physical-back.webp": normalizePath(record?.attacks?.physical?.back),
    "attack-special-front.webp": normalizePath(record?.attacks?.special?.front),
    "attack-special-back.webp": normalizePath(record?.attacks?.special?.back),
  };
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort());
}

function exactAnimationOnlyProfile(record) {
  return Boolean(record
    && record.profile === POKEMON_ANIMATION_ONLY_PROFILE
    && record.animationOnly === true
    && hasExactKeys(record.idle, ["front", "back"])
    && hasExactKeys(record.attacks, ["physical", "special"])
    && !("attack" in record)
    && !("pose" in record));
}

function currentAnimationPaths(record) {
  if (!record) return [];
  return [...new Set([
    record.idle?.front,
    record.idle?.back,
    record.attacks?.physical?.front,
    record.attacks?.physical?.back,
    record.attacks?.special?.front,
    record.attacks?.special?.back,
    record.attacks?.melee?.front,
    record.attacks?.melee?.back,
    record.attacks?.ranged?.front,
    record.attacks?.ranged?.back,
  ].filter(Boolean).map(normalizePath))];
}

function pokemonSlug(asset, animationRecord) {
  const idleFront = normalizePath(animationRecord?.idle?.front);
  if (animationRecord?.profile === POKEMON_ANIMATION_ONLY_PROFILE && idleFront) {
    return path.posix.basename(path.posix.dirname(idleFront));
  }
  if (idleFront) return path.posix.basename(idleFront).replace(/-idle-front-pixellab\.webp$/i, "");
  if (asset?.front) return path.posix.basename(asset.front).replace(/-front\.png$/i, "");
  return "pokemon-sin-slug";
}

function expectedPokemonFolder(asset, animationRecord, entitySlug) {
  const idleFront = normalizePath(animationRecord?.idle?.front);
  if (animationRecord?.profile === POKEMON_ANIMATION_ONLY_PROFILE && idleFront) {
    return path.posix.dirname(idleFront);
  }
  const legacyReference = idleFront || normalizePath(asset?.front);
  const legacyRoot = legacyReference ? path.posix.dirname(legacyReference) : "assets/pokemon";
  return `${legacyRoot}/${entitySlug}`;
}

function validAnimationOnlyMedia(media, slot) {
  const idle = slot.startsWith("idle-");
  return Boolean(media
    && media.format === "webp"
    && media.width === 384
    && media.height === 384
    && media.hasAlpha === true
    && media.animated === true
    && media.frameCount >= 1
    && media.frameCount <= 8
    && media.durationMs === (idle ? 960 : 720)
    && media.loopCount === (idle ? 0 : 1));
}

async function inspectPokemon(projectRoot, assets, animationAssets) {
  const assetsById = new Map(assets.map((asset) => [asset.speciesId, asset]));
  const speciesIds = [...new Set([
    ...assetsById.keys(),
    ...Object.keys(animationAssets).map(Number).filter(Number.isFinite),
  ])].sort((left, right) => left - right);
  const records = [];

  for (const speciesId of speciesIds) {
    const asset = assetsById.get(speciesId) || null;
    const animationRecord = animationAssets[speciesId] || null;
    const entitySlug = pokemonSlug(asset, animationRecord);
    const standardFolder = expectedPokemonFolder(asset, animationRecord, entitySlug);
    const standardAbsolute = path.join(projectRoot, ...standardFolder.split("/"));
    const slots = animationSlotPaths(animationRecord);
    const issues = [];
    const slotMedia = {};

    if (animationRecord?.profile !== POKEMON_ANIMATION_ONLY_PROFILE) {
      issues.push("animation-only-profile-missing");
    } else if (!exactAnimationOnlyProfile(animationRecord)) {
      issues.push("animation-only-profile-invalid");
    }
    if (asset) issues.push("static-assets-still-registered");

    for (const slot of POKEMON_STANDARD_SLOTS) {
      const repoPath = slots[slot];
      const expectedPath = `${standardFolder}/${slot}`;
      if (!repoPath) {
        issues.push(`standard-slot-missing:${slot}`);
        continue;
      }
      if (repoPath !== expectedPath) issues.push(`standard-slot-path-invalid:${slot}`);
      const media = await inspectMedia(projectRoot, repoPath);
      slotMedia[slot] = media;
      if (!media) issues.push(`standard-slot-missing:${slot}`);
      else if (!validAnimationOnlyMedia(media, slot)) {
        issues.push(`standard-slot-invalid:${slot}:expected-animated-webp-384x384-alpha-standard-timing`);
      }
    }

    const standardBytes = Object.values(slotMedia).reduce((total, media) => total + (media?.bytes || 0), 0);
    if (animationRecord?.profile === POKEMON_ANIMATION_ONLY_PROFILE && standardBytes >= 1_000_000) {
      issues.push("standard-pack-budget-exceeded:1000000-bytes");
    }

    if (animationRecord?.profile === POKEMON_ANIMATION_ONLY_PROFILE) {
      let entries = null;
      try {
        entries = (await fs.readdir(standardAbsolute)).sort();
      } catch {
        issues.push("standard-folder-missing");
      }
      if (entries && JSON.stringify(entries) !== JSON.stringify([...POKEMON_STANDARD_SLOTS].sort())) {
        issues.push("standard-folder-topology-invalid");
      }
    }

    const currentPaths = [
      normalizePath(asset?.front),
      normalizePath(asset?.back),
      ...currentAnimationPaths(animationRecord),
    ].filter(Boolean);
    const animationPaths = currentAnimationPaths(animationRecord);
    const currentAnimationFiles = (await Promise.all(
      animationPaths.map((repoPath) => inspectMedia(projectRoot, repoPath)),
    )).filter(Boolean).length;
    records.push({
      speciesId,
      entitySlug,
      profile: animationRecord?.profile || "static-legacy",
      animationOnly: animationRecord?.animationOnly === true,
      status: issues.length ? "legacy-runtime" : "compliant",
      standardFolder,
      standardSlots: slots,
      standardBytes,
      currentPaths,
      currentAnimationFiles,
      hasStaticAssets: Boolean(asset),
      issues,
    });
  }
  return records;
}

async function inspectMoves(projectRoot, moves, effects) {
  const records = [];
  for (const move of moves) {
    const legacyEffect = normalizePath(effects[move.moveId] || "");
    const legacyMedia = await inspectMedia(projectRoot, legacyEffect);
    const legacyEffectReady = Boolean(legacyMedia
      && legacyMedia.format === "webp"
      && legacyMedia.width === 128
      && legacyMedia.height === 128
      && legacyMedia.hasAlpha === true
      && legacyMedia.animated === true);
    const standardFolder = `public/assets/runtime/moves/${move.entitySlug}`;
    const standardAbsolute = path.join(projectRoot, ...standardFolder.split("/"));
    const issues = [];
    if (!(await exists(path.join(standardAbsolute, "effect.webp")))) issues.push("standard-effect-missing");
    if (!(await exists(path.join(standardAbsolute, "manifest.json")))) issues.push("standard-slot-missing:manifest.json");
    if (!(await exists(path.join(standardAbsolute, "credits.txt")))) issues.push("standard-slot-missing:credits.txt");
    if (legacyEffect && !legacyEffectReady) issues.push("legacy-effect-invalid");
    if (!legacyEffect) issues.push("dedicated-effect-missing");
    records.push({
      ...move,
      status: issues.length ? "legacy-runtime" : "compliant",
      standardFolder,
      legacyEffect: legacyEffect || null,
      legacyEffectReady,
      issues,
    });
  }
  return records;
}

async function inspectNpcs(projectRoot) {
  const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, "assets", "sprites", "npcs", "overworld-manifest.json"), "utf8"));
  const records = [];
  for (const record of [...manifest.sprites].sort((left, right) => left.id.localeCompare(right.id))) {
    const legacySheet = normalizePath(`assets/sprites/npcs/${record.file}`);
    const media = await inspectMedia(projectRoot, legacySheet);
    const geometryReady = Boolean(media
      && media.format === "png"
      && media.width === 384
      && media.height === 512
      && media.hasAlpha === true);
    const entitySlug = record.entitySlug || slugify(record.displayName || record.name || record.id);
    const standardFolder = `assets/sprites/npcs/overworld/${entitySlug}`;
    const standardAbsolute = path.join(projectRoot, ...standardFolder.split("/"));
    const issues = [];
    const packManifestPath = path.join(standardAbsolute, "manifest.json");
    const creditsPath = path.join(standardAbsolute, "credits.txt");
    if (!(await exists(path.join(standardAbsolute, "overworld.png")))) issues.push("standard-overworld-missing");
    if (!(await exists(packManifestPath))) issues.push("standard-slot-missing:manifest.json");
    if (!(await exists(creditsPath))) issues.push("standard-slot-missing:credits.txt");
    if (!geometryReady) issues.push("legacy-sheet-invalid:expected-png-384x512-rgba-6x8");
    try {
      const entries = (await fs.readdir(standardAbsolute)).sort();
      if (JSON.stringify(entries) !== JSON.stringify(["credits.txt", "manifest.json", "overworld.png"])) {
        issues.push("standard-folder-topology-invalid");
      }
    } catch {
      issues.push("standard-folder-missing");
    }
    if (await exists(packManifestPath)) {
      try {
        const pack = JSON.parse(await fs.readFile(packManifestPath, "utf8"));
        const metadataReady = pack.kind === "npc-overworld-pack"
          && pack.profile === "npc-overworld-v1"
          && pack.npcId === (record.npcId || record.id)
          && pack.spriteId === (record.spriteId || record.id)
          && pack.entitySlug === entitySlug
          && pack.slot === "overworld"
          && pack.path === "overworld.png"
          && pack.format === "png"
          && pack.width === 384
          && pack.height === 512
          && pack.mode === "RGBA"
          && pack.grid?.columns === 6
          && pack.grid?.rows === 8
          && pack.grid?.cellSize === 64
          && pack.sha256 === media?.sha256;
        if (!metadataReady) issues.push("standard-manifest-invalid");
      } catch {
        issues.push("standard-manifest-invalid-json");
      }
    }
    records.push({
      npcId: record.id,
      spriteId: record.id,
      entitySlug,
      status: issues.length ? "legacy-runtime" : "compliant",
      standardFolder,
      legacySheet,
      legacySource: normalizePath(`assets/sprites/npcs/${record.source}`),
      geometryReady,
      issues,
    });
  }
  return records;
}

async function loadWorldAssetCatalog(projectRoot) {
  const context = vm.createContext({ window: { CITY_MAP_EDITOR_DATA: {} } });
  for (const relativePath of [
    "assets/generated/san-pablo-neighborhood/catalog.js",
    "assets/generated/san-pablo-barrio-c-pixellab/catalog.js",
    "map-layout.js",
  ]) {
    const source = await fs.readFile(path.join(projectRoot, ...relativePath.split("/")), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }
  const catalog = context.window.CITY_MAP_LAYOUT?.assetCatalog;
  if (!catalog || typeof catalog !== "object") throw new Error("No se pudo construir el catálogo canónico de assets del mundo.");
  return Object.entries(catalog).sort(([left], [right]) => left.localeCompare(right));
}

function worldEntitySlug(assetId) {
  return slugify(String(assetId).replace(/([a-z0-9])([A-Z])/g, "$1-$2"));
}

async function inspectWorldAssets(projectRoot) {
  const records = [];
  for (const [assetId, definition] of await loadWorldAssetCatalog(projectRoot)) {
    const legacyPath = normalizePath(String(definition.src || "").split(/[?#]/, 1)[0]);
    const legacyMedia = await inspectMedia(projectRoot, legacyPath);
    const legacyMediaReady = Boolean(legacyMedia
      && ["png", "webp"].includes(legacyMedia.format)
      && legacyMedia.width > 0
      && legacyMedia.height > 0);
    const entitySlug = worldEntitySlug(assetId);
    const standardFolder = `public/assets/runtime/world/${entitySlug}`;
    const standardAbsolute = path.join(projectRoot, ...standardFolder.split("/"));
    const issues = [];
    let entries = null;
    try {
      entries = (await fs.readdir(standardAbsolute)).sort();
    } catch {
      issues.push("standard-folder-missing");
    }
    if (entries) {
      for (const slot of ["asset.png", "manifest.json", "credits.txt"]) {
        if (!entries.includes(slot) || !(await exists(path.join(standardAbsolute, slot)))) {
          issues.push(`standard-slot-missing:${slot}`);
        }
      }
      const unexpected = entries.filter((entry) => !["asset.png", "manifest.json", "credits.txt"].includes(entry));
      if (unexpected.length) issues.push("standard-folder-topology-invalid");
      const standardMedia = await inspectMedia(projectRoot, `${standardFolder}/asset.png`);
      if (standardMedia && (standardMedia.format !== "png" || standardMedia.hasAlpha !== true)) {
        issues.push("standard-asset-invalid:expected-png-rgba");
      }
      const manifestPath = path.join(standardAbsolute, "manifest.json");
      if (await exists(manifestPath)) {
        try {
          const pack = JSON.parse(await fs.readFile(manifestPath, "utf8"));
          const metadataReady = pack.kind === "world-asset-pack"
            && pack.profile === "world-asset-v1"
            && pack.assetId === assetId
            && pack.entitySlug === entitySlug
            && pack.slot === "asset"
            && pack.path === "asset.png"
            && pack.logicalWidth === definition.w
            && pack.logicalHeight === definition.h
            && pack.sha256 === standardMedia?.sha256;
          if (!metadataReady) issues.push("standard-manifest-invalid");
        } catch {
          issues.push("standard-manifest-invalid-json");
        }
      }
    }
    if (!legacyMediaReady) issues.push("legacy-media-missing-or-invalid");
    records.push({
      assetId,
      entitySlug,
      kind: definition.kind || "prop",
      interior: Boolean(definition.interior),
      logicalWidth: Number(definition.w) || null,
      logicalHeight: Number(definition.h) || null,
      tags: Array.isArray(definition.tags) ? [...definition.tags] : [],
      colliders: Array.isArray(definition.colliders) ? definition.colliders : [],
      status: issues.length ? "legacy-runtime" : "compliant",
      standardFolder,
      legacyPath,
      legacyMediaReady,
      issues,
    });
  }
  return records;
}

export async function buildStandardCompliance(projectRoot = TOOL_ROOT) {
  const root = path.resolve(projectRoot);
  const [scriptSource, animationSource, runtimeManifest] = await Promise.all([
    fs.readFile(path.join(root, "script.js"), "utf8"),
    fs.readFile(path.join(root, "sanpledex-animation-data.js"), "utf8"),
    fs.readFile(path.join(root, "tools", "assets", "runtime-files-v0.json"), "utf8").then(JSON.parse),
  ]);
  const pokemon = await inspectPokemon(root, parsePokemonAssets(scriptSource), loadAnimationAssets(animationSource));
  const moves = await inspectMoves(root, parseMoves(scriptSource), parseMoveEffects(scriptSource));
  const npcs = await inspectNpcs(root);
  const world = await inspectWorldAssets(root);
  const runtimeSourceLeaks = runtimeManifest.policyWarnings?.length || 0;
  const summary = {
    pokemon: {
      total: pokemon.length,
      compliant: pokemon.filter((entry) => entry.status === "compliant").length,
      animationOnlyPacks: pokemon.filter((entry) => (
        entry.profile === POKEMON_ANIMATION_ONLY_PROFILE && entry.animationOnly
      )).length,
      completeLegacyAnimationPacks: pokemon.filter((entry) => (
        entry.profile === "pokemon-combat-legacy" && entry.currentAnimationFiles === 6
      )).length,
      missingOrInvalid: pokemon.filter((entry) => entry.issues.length).length,
    },
    moves: {
      total: moves.length,
      compliant: moves.filter((entry) => entry.status === "compliant").length,
      dedicatedLegacyEffects: moves.filter((entry) => entry.legacyEffectReady).length,
      missingOrInvalid: moves.filter((entry) => entry.issues.length).length,
    },
    npcs: {
      total: npcs.length,
      compliant: npcs.filter((entry) => entry.status === "compliant").length,
      geometryReadyLegacySheets: npcs.filter((entry) => entry.geometryReady).length,
      missingOrInvalid: npcs.filter((entry) => entry.issues.length).length,
    },
    world: {
      total: world.length,
      compliant: world.filter((entry) => entry.status === "compliant").length,
      legacyMediaReady: world.filter((entry) => entry.legacyMediaReady).length,
      missingOrInvalid: world.filter((entry) => entry.issues.length).length,
    },
    runtimeSourceLeaks,
  };
  const valid = summary.pokemon.compliant === summary.pokemon.total
    && summary.moves.compliant === summary.moves.total
    && summary.npcs.compliant === summary.npcs.total
    && summary.world.compliant === summary.world.total
    && runtimeSourceLeaks === 0;
  return {
    schemaVersion: 0,
    kind: "pokemon-adventure-standard-compliance",
    profile: "standard",
    valid,
    contracts: {
      pokemon: POKEMON_ANIMATION_ONLY_PROFILE,
      moves: "move-pixel-v1",
      npcs: "npc-overworld-v1",
      world: "world-asset-v1",
    },
    summary,
    runtimeSourceWarnings: runtimeManifest.policyWarnings || [],
    pokemon,
    moves,
    npcs,
    world,
  };
}

export function serializeCompliance(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function parseCli(argv) {
  const options = { root: TOOL_ROOT, check: false, quiet: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--check") options.check = true;
    else if (value === "--quiet") options.quiet = true;
    else if (value === "--root") options.root = path.resolve(argv[++index] || "");
    else throw new Error(`Opción desconocida: ${value}`);
  }
  return options;
}

async function writeOrCheck(root, relativePath, serialized, check) {
  const absolute = path.join(root, ...relativePath.split("/"));
  if (check) {
    const current = await fs.readFile(absolute, "utf8").catch(() => "");
    if (current !== serialized) throw new Error(`${relativePath} no representa el estado actual; regenéralo sin --check.`);
    return;
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, serialized, "utf8");
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const report = await buildStandardCompliance(options.root);
  const serialized = serializeCompliance(report);
  await writeOrCheck(options.root, REPORT_PATH, serialized, options.check);
  await writeOrCheck(options.root, REVIEW_PATH, serialized, options.check);
  if (!options.quiet) {
    process.stdout.write(`${JSON.stringify({ valid: report.valid, ...report.summary }, null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
