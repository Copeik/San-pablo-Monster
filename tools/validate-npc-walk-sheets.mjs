#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CELL_SIZE = 64;
const EXPECTED_FILES = ["credits.txt", "manifest.json", "overworld.png"];
const EXPECTED_ROW_ORDER = [
  "down",
  "down-right",
  "right",
  "up-right",
  "up",
  "up-left",
  "left",
  "down-left",
];

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodeRgbaPng(file) {
  const buffer = fs.readFileSync(file);
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`Invalid PNG: ${file}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString("ascii", offset, offset + 4); offset += 4;
    const data = buffer.subarray(offset, offset + length); offset += length + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`Expected non-interlaced RGBA PNG: ${file}`);
  }
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset]; sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[sourceOffset]; sourceOffset += 1;
      const outputIndex = y * stride + x;
      const left = x >= bytesPerPixel ? pixels[outputIndex - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[outputIndex - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[outputIndex - stride - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft)
                : null;
      if (predictor === null) throw new Error(`Unsupported PNG filter ${filter}: ${file}`);
      pixels[outputIndex] = (raw + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

function extractCell(image, column, row) {
  const cell = Buffer.alloc(CELL_SIZE * CELL_SIZE * 4);
  for (let y = 0; y < CELL_SIZE; y += 1) {
    const sourceStart = (((row * CELL_SIZE + y) * image.width) + column * CELL_SIZE) * 4;
    image.pixels.copy(cell, y * CELL_SIZE * 4, sourceStart, sourceStart + CELL_SIZE * 4);
  }
  return cell;
}

function hasVisiblePixel(cell) {
  for (let index = 3; index < cell.length; index += 4) if (cell[index]) return true;
  return false;
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

export function validateNpcWalkSheets(projectRoot) {
  const npcRoot = path.join(projectRoot, "assets", "sprites", "npcs");
  const overworldRoot = path.join(npcRoot, "overworld");
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const readJson = (file, label) => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      return {};
    }
  };

  const contract = readJson(path.join(npcRoot, "npc-walk-contract.json"), "NPC walk contract");
  const rootManifest = readJson(path.join(npcRoot, "overworld-manifest.json"), "NPC root manifest");
  const runtime = fs.readFileSync(path.join(projectRoot, "script.js"), "utf8");
  const sprites = Array.isArray(rootManifest.sprites) ? rootManifest.sprites : [];
  const overworldEntries = fs.existsSync(overworldRoot)
    ? fs.readdirSync(overworldRoot, { withFileTypes: true })
    : [];
  const actualFolders = overworldEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const flatEntries = overworldEntries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name).sort();

  check(contract.grid?.columns === 6 && contract.grid?.rows === 8, "NPC contract must be a 6x8 grid");
  check(contract.profile === "npc-overworld-v1", "NPC contract profile must be npc-overworld-v1");
  check(
    contract.sourcePolicy?.canonicalPixels === "overworld.png"
      && contract.sourcePolicy?.compareWithLegacy === false,
    "NPC contract must treat each overworld.png as canonical",
  );
  check(rootManifest.schemaVersion === 1, "NPC root manifest must use schemaVersion 1");
  check(rootManifest.kind === "npc-overworld-catalog", "NPC root manifest kind must be npc-overworld-catalog");
  check(rootManifest.profile === "npc-overworld-v1", "NPC root manifest profile must be npc-overworld-v1");
  check(rootManifest.contract === "npc-walk-6x8", "NPC root manifest contract must be npc-walk-6x8");
  check(rootManifest.inventoryCount === 48, `root inventoryCount must be 48, got ${rootManifest.inventoryCount}`);
  check(sprites.length === 48, `manifest must contain 48 NPCs, got ${sprites.length}`);
  check(actualFolders.length === 48, `overworld must contain 48 individual folders, got ${actualFolders.length}`);
  check(flatEntries.length === 0, `overworld contains flat files: ${flatEntries.join(", ")}`);
  const expectedFolders = sprites.map(({ entitySlug }) => entitySlug).sort();
  check(same(actualFolders, expectedFolders), "overworld folders and root manifest inventory differ");

  const claimedIds = new Map();
  const claimedPaths = new Set();
  for (const rootRecord of sprites) {
    const label = rootRecord.spriteId || rootRecord.npcId || rootRecord.entitySlug || "unknown NPC";
    check(typeof rootRecord.npcId === "string" && rootRecord.npcId.length > 0, `${label}: npcId is required`);
    check(typeof rootRecord.spriteId === "string" && rootRecord.spriteId.length > 0, `${label}: spriteId is required`);
    check(typeof rootRecord.displayName === "string" && rootRecord.displayName.trim().length > 0, `${label}: displayName is required`);
    check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rootRecord.entitySlug || ""), `${label}: invalid entitySlug`);
    check(rootRecord.entitySlug === slugify(rootRecord.displayName), `${label}: entitySlug must derive from displayName`);
    check(Array.isArray(rootRecord.aliases), `${label}: aliases must be an array`);

    const expectedManifestPath = `overworld/${rootRecord.entitySlug}/manifest.json`;
    const expectedRuntimePath = `overworld/${rootRecord.entitySlug}/overworld.png`;
    check(rootRecord.id === rootRecord.spriteId, `${label}: compatibility id must match spriteId`);
    check(rootRecord.manifest === expectedManifestPath, `${label}: unexpected root manifest path`);
    check(rootRecord.slot === "overworld", `${label}: root slot must be overworld`);
    check(rootRecord.path === expectedRuntimePath, `${label}: unexpected root runtime path`);
    check(rootRecord.file === expectedRuntimePath, `${label}: compatibility file path must match runtime path`);
    check(rootRecord.source === `legacy-4x4/${rootRecord.spriteId}-walk.png`, `${label}: unexpected legacy source path`);
    check(!claimedPaths.has(rootRecord.path), `${label}: duplicate runtime path ${rootRecord.path}`);
    claimedPaths.add(rootRecord.path);

    for (const id of [rootRecord.npcId, rootRecord.spriteId, ...(rootRecord.aliases || [])]) {
      check(typeof id === "string" && id.length > 0, `${label}: empty catalog ID/alias`);
      const owner = claimedIds.get(id);
      check(!owner || owner === rootRecord.entitySlug, `${label}: catalog ID/alias ${id} collides with ${owner}`);
      claimedIds.set(id, rootRecord.entitySlug);
    }

    const folder = path.join(overworldRoot, rootRecord.entitySlug || "");
    if (!fs.existsSync(folder)) {
      failures.push(`${label}: missing individual folder ${rootRecord.entitySlug}`);
      continue;
    }
    const packEntries = fs.readdirSync(folder, { withFileTypes: true });
    const packFiles = packEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    check(packEntries.every((entry) => entry.isFile()), `${label}: pack may contain files only`);
    check(same(packFiles, EXPECTED_FILES), `${label}: pack must contain exactly ${EXPECTED_FILES.join(", ")}`);

    const pack = readJson(path.join(folder, "manifest.json"), `${label} manifest`);
    check(pack.schemaVersion === 1, `${label}: schemaVersion must be 1`);
    check(pack.kind === "npc-overworld-pack", `${label}: kind must be npc-overworld-pack`);
    check(pack.profile === "npc-overworld-v1", `${label}: profile must be npc-overworld-v1`);
    for (const field of ["npcId", "spriteId", "displayName", "entitySlug"]) {
      check(pack[field] === rootRecord[field], `${label}: root and pack ${field} differ`);
    }
    check(same(pack.aliases, rootRecord.aliases), `${label}: root and pack aliases differ`);
    check(pack.slot === "overworld" && pack.path === "overworld.png", `${label}: slot/path must be overworld/overworld.png`);
    check(pack.format === "png", `${label}: format must be png`);
    check(pack.width === 384 && pack.height === 512, `${label}: manifest dimensions must be 384x512`);
    check(pack.mode === "RGBA", `${label}: manifest mode must be RGBA`);
    check(pack.grid?.columns === 6 && pack.grid?.rows === 8 && pack.grid?.cellSize === 64,
      `${label}: manifest grid must be 6x8 with 64px cells`);
    check(same(pack.rowOrder, EXPECTED_ROW_ORDER), `${label}: invalid rowOrder`);
    check(/^[a-f0-9]{64}$/.test(pack.sha256 || ""), `${label}: invalid sha256`);
    check(typeof pack.sourceAssetId === "string" && pack.sourceAssetId.length > 0, `${label}: sourceAssetId is required`);
    check(typeof pack.sourcePath === "string" && pack.sourcePath.length > 0, `${label}: sourcePath is required`);
    check(pack.credits === "credits.txt", `${label}: credits must point to credits.txt`);

    const sourceAbsolute = typeof pack.sourcePath === "string"
      ? path.resolve(projectRoot, ...pack.sourcePath.split("/"))
      : "";
    const rootPrefix = `${path.resolve(projectRoot)}${path.sep}`;
    check(Boolean(sourceAbsolute) && sourceAbsolute.startsWith(rootPrefix), `${label}: sourcePath must stay inside the repository`);
    check(Boolean(sourceAbsolute) && fs.existsSync(sourceAbsolute), `${label}: declared legacy source does not exist`);
    const creditsFile = path.join(folder, "credits.txt");
    check(fs.existsSync(creditsFile) && fs.readFileSync(creditsFile, "utf8").trim().length > 0,
      `${label}: credits.txt must be non-empty`);

    const outputFile = path.join(folder, "overworld.png");
    if (!fs.existsSync(outputFile)) {
      failures.push(`${label}: missing overworld.png`);
      continue;
    }
    check(sha256(outputFile) === pack.sha256, `${label}: overworld.png SHA-256 differs from manifest`);
    let output;
    try {
      output = decodeRgbaPng(outputFile);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      continue;
    }
    check(output.width === 384 && output.height === 512, `${label}: overworld.png is not 384x512`);
    if (output.width !== 384 || output.height !== 512) continue;
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        check(hasVisiblePixel(extractCell(output, column, row)),
          `${label}: empty frame ${EXPECTED_ROW_ORDER[row]}[${column}]`);
      }
    }
  }

  const strayRootSheets = fs.readdirSync(npcRoot).filter((file) => file.endsWith("-walk.png"));
  check(strayRootSheets.length === 0, `unorganized NPC sheets remain in npcs/: ${strayRootSheets.join(", ")}`);
  check(!fs.existsSync(path.join(projectRoot, "assets", "sprites", "npc-guide-walk.png")),
    "guide sheet remains outside the organized NPC folder");
  check(runtime.includes("globalThis.NPC_ASSET_CATALOG"), "runtime does not consume the NPC asset catalog");
  check(runtime.includes("resolveNpcAssetUrl"), "runtime does not resolve NPC IDs through the catalog");
  check(!runtime.includes("NPC_OVERWORLD_SHEET_BASE_URL"), "runtime still constructs flat NPC sheet paths");
  check(runtime.includes("const NPC_WALK_FRAME_COUNT = PLAYER_WALK_FRAME_COUNT"),
    "NPCs do not share the protagonist frame count");
  check(runtime.includes("const NPC_DIRECTION_ROWS = PLAYER_DIRECTION_ROWS"),
    "NPCs do not share the protagonist direction layout");

  return {
    valid: failures.length === 0,
    failures,
    spriteCount: sprites.length,
    folderCount: actualFolders.length,
    contract: rootManifest.contract,
    profile: rootManifest.profile,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const report = validateNpcWalkSheets(projectRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}
