#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FRAME_SIZE = 64;
const ALPHA_THRESHOLD = 24;
const DIRECTIONS = ["down-left", "down-right", "up-left", "up-right"];

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodeRgbaPng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("PNG signature is invalid");
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
    throw new Error(`Expected an 8-bit, non-interlaced RGBA PNG; got depth=${bitDepth}, color=${colorType}, interlace=${interlace}`);
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
      if (predictor === null) throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[outputIndex] = (raw + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

function extractFrame(image, column, row) {
  const frame = Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 4);
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const sourceStart = (((row * FRAME_SIZE + y) * image.width) + column * FRAME_SIZE) * 4;
    const targetStart = y * FRAME_SIZE * 4;
    image.pixels.copy(frame, targetStart, sourceStart, sourceStart + FRAME_SIZE * 4);
  }
  return frame;
}

function alphaAt(frame, x, y) {
  return frame[(y * FRAME_SIZE + x) * 4 + 3];
}

function frameMetrics(frame) {
  let left = FRAME_SIZE;
  let top = FRAME_SIZE;
  let right = -1;
  let bottom = -1;
  let opaquePixels = 0;
  let partialPixels = 0;
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const alpha = alphaAt(frame, x, y);
      if (alpha > 0 && alpha < 255) partialPixels += 1;
      if (alpha < ALPHA_THRESHOLD) continue;
      opaquePixels += 1;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error("Sprite frame is empty");
  const visibleHeight = bottom - top + 1;
  const headBottom = top + Math.max(1, Math.round(visibleHeight * .44));
  let headLeft = FRAME_SIZE;
  let headRight = -1;
  for (let y = top; y < headBottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (alphaAt(frame, x, y) < ALPHA_THRESHOLD) continue;
      headLeft = Math.min(headLeft, x);
      headRight = Math.max(headRight, x);
    }
  }
  return {
    bbox: [left, top, right + 1, bottom + 1],
    bottom,
    visibleHeight,
    headCenterX: (headLeft + headRight) / 2,
    headWidth: headRight - headLeft + 1,
    opaquePixels,
    partialRatio: partialPixels / Math.max(1, opaquePixels + partialPixels),
  };
}

function regionEqual(first, second, top, bottom) {
  const start = top * FRAME_SIZE * 4;
  const end = bottom * FRAME_SIZE * 4;
  return first.subarray(start, end).equals(second.subarray(start, end));
}

function differentPixelCount(first, second) {
  let count = 0;
  for (let pixel = 0; pixel < FRAME_SIZE * FRAME_SIZE; pixel += 1) {
    const start = pixel * 4;
    if (!first.subarray(start, start + 4).equals(second.subarray(start, start + 4))) count += 1;
  }
  return count;
}

function horizontalMirrorEqual(leftFrame, rightFrame) {
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const leftStart = (y * FRAME_SIZE + x) * 4;
      const rightStart = (y * FRAME_SIZE + (FRAME_SIZE - 1 - x)) * 4;
      if (!leftFrame.subarray(leftStart, leftStart + 4).equals(rightFrame.subarray(rightStart, rightStart + 4))) return false;
    }
  }
  return true;
}

export function validatePlayerDirectionalSprite(file) {
  const image = decodeRgbaPng(readFileSync(file));
  const failures = [];
  if (image.width !== 256 || image.height !== 256) failures.push(`atlas must be 256x256, got ${image.width}x${image.height}`);
  if (failures.length) return { valid: false, failures, width: image.width, height: image.height, directions: {} };

  const rows = DIRECTIONS.map((direction, row) => ({
    direction,
    frames: Array.from({ length: 4 }, (_, column) => extractFrame(image, column, row)),
  }));
  const reports = {};
  for (const row of rows) {
    const metrics = row.frames.map(frameMetrics);
    reports[row.direction] = metrics;
    metrics.forEach((metric, frame) => {
      if (metric.bottom !== 59) failures.push(`${row.direction}[${frame}] feet row is ${metric.bottom}, expected 59`);
      if (metric.visibleHeight < 50 || metric.visibleHeight > 56) failures.push(`${row.direction}[${frame}] visible height is ${metric.visibleHeight}`);
      if (Math.abs(metric.headCenterX - 31.5) > 1) failures.push(`${row.direction}[${frame}] head center is ${metric.headCenterX}`);
      if (metric.partialRatio > .12) failures.push(`${row.direction}[${frame}] has excessive soft alpha (${metric.partialRatio.toFixed(3)})`);
    });
    if (!row.frames[0].equals(row.frames[2])) failures.push(`${row.direction} neutral frames 0 and 2 differ`);
    if (!regionEqual(row.frames[0], row.frames[1], 0, 36) || !regionEqual(row.frames[0], row.frames[3], 0, 36)) {
      failures.push(`${row.direction} head/camera changes during the walk cycle`);
    }
    if (differentPixelCount(row.frames[0], row.frames[1]) < 24 || differentPixelCount(row.frames[0], row.frames[3]) < 24) {
      failures.push(`${row.direction} stride is not visibly animated`);
    }
    if (differentPixelCount(row.frames[1], row.frames[3]) < 16) failures.push(`${row.direction} stride A and B do not alternate`);
  }

  [[0, 1], [2, 3]].forEach(([leftRow, rightRow]) => {
    for (let frame = 0; frame < 4; frame += 1) {
      if (!horizontalMirrorEqual(rows[leftRow].frames[frame], rows[rightRow].frames[frame])) {
        failures.push(`${rows[leftRow].direction}[${frame}] is not an exact mirror of ${rows[rightRow].direction}[${frame}]`);
      }
    }
  });

  const allMetrics = Object.values(reports).flat();
  const heights = allMetrics.map((metric) => metric.visibleHeight);
  const scaleDrift = (Math.max(...heights) - Math.min(...heights)) / Math.max(...heights);
  if (scaleDrift > .05) failures.push(`direction scale drift is ${(scaleDrift * 100).toFixed(1)}%, expected <= 5%`);
  const areas = allMetrics.map((metric) => metric.opaquePixels);
  if (Math.max(...areas) / Math.min(...areas) > 1.4) failures.push("opaque body area changes by more than 40%");

  return {
    valid: failures.length === 0,
    failures,
    width: image.width,
    height: image.height,
    scaleDriftPercent: Number((scaleDrift * 100).toFixed(2)),
    directions: reports,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] || new URL("../assets/sprites/protagonist-walk-diagonal.png", import.meta.url);
  const report = validatePlayerDirectionalSprite(file);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}
