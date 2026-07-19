#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CELL_SIZE = 64;
const SOURCE_ROWS = { down: 0, left: 1, right: 2, up: 3 };

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

export function validateNpcWalkSheets(projectRoot) {
  const npcRoot = path.join(projectRoot, "assets", "sprites", "npcs");
  const contract = JSON.parse(fs.readFileSync(path.join(npcRoot, "npc-walk-contract.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(npcRoot, "overworld-manifest.json"), "utf8"));
  const runtime = fs.readFileSync(path.join(projectRoot, "script.js"), "utf8");
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };

  check(contract.grid?.columns === 6 && contract.grid?.rows === 8, "NPC contract must be a 6x8 grid");
  check(manifest.sprites?.length === 48, `manifest must contain 48 NPCs, got ${manifest.sprites?.length || 0}`);
  const actualFiles = fs.readdirSync(path.join(npcRoot, "overworld"))
    .filter((file) => file.endsWith("-walk.png"))
    .sort();
  const manifestFiles = (manifest.sprites || []).map((record) => path.basename(record.file)).sort();
  check(JSON.stringify(actualFiles) === JSON.stringify(manifestFiles), "overworld folder and manifest inventory differ");

  for (const record of manifest.sprites || []) {
    const outputFile = path.join(npcRoot, record.file);
    const sourceFile = path.join(npcRoot, record.source);
    check(fs.existsSync(outputFile), `missing runtime sheet: ${record.file}`);
    check(fs.existsSync(sourceFile), `missing legacy source: ${record.source}`);
    if (!fs.existsSync(outputFile) || !fs.existsSync(sourceFile)) continue;
    let output;
    let source;
    try {
      output = decodeRgbaPng(outputFile);
      source = decodeRgbaPng(sourceFile);
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    check(output.width === 384 && output.height === 512, `${record.id}: runtime sheet is not 384x512`);
    check(source.width === 256 && source.height === 256, `${record.id}: legacy source is not 256x256`);
    if (output.width !== 384 || output.height !== 512 || source.width !== 256 || source.height !== 256) continue;

    contract.rowOrder.forEach((direction, row) => {
      const authoredDirection = contract.derivedDirections[direction] || direction;
      const sourceRow = SOURCE_ROWS[authoredDirection];
      contract.frameOrderFromLegacy4x4.forEach((sourceColumn, column) => {
        const actual = extractCell(output, column, row);
        const expected = extractCell(source, sourceColumn, sourceRow);
        check(hasVisiblePixel(actual), `${record.id}: empty frame ${direction}[${column}]`);
        check(actual.equals(expected), `${record.id}: ${direction}[${column}] changed authored pixels`);
      });
    });
  }

  const strayRootSheets = fs.readdirSync(npcRoot).filter((file) => file.endsWith("-walk.png"));
  check(strayRootSheets.length === 0, `unorganized NPC sheets remain in npcs/: ${strayRootSheets.join(", ")}`);
  check(!fs.existsSync(path.join(projectRoot, "assets", "sprites", "npc-guide-walk.png")),
    "guide sheet remains outside the organized NPC folder");
  check(runtime.includes('const NPC_OVERWORLD_SHEET_BASE_URL = "assets/sprites/npcs/overworld"'),
    "runtime does not use the organized NPC folder");
  check(runtime.includes("const NPC_WALK_FRAME_COUNT = PLAYER_WALK_FRAME_COUNT"),
    "NPCs do not share the protagonist frame count");
  check(runtime.includes("const NPC_DIRECTION_ROWS = PLAYER_DIRECTION_ROWS"),
    "NPCs do not share the protagonist direction layout");

  return {
    valid: failures.length === 0,
    failures,
    spriteCount: manifest.sprites?.length || 0,
    contract: manifest.contract,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const report = validateNpcWalkSheets(projectRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}
