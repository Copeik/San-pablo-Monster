#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FRAME_SIZE = 64;
const FRAME_COUNT = 6;
const DIRECTIONS = [
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
    image.pixels.copy(frame, y * FRAME_SIZE * 4, sourceStart, sourceStart + FRAME_SIZE * 4);
  }
  return frame;
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
      const alpha = frame[(y * FRAME_SIZE + x) * 4 + 3];
      if (alpha > 0 && alpha < 255) partialPixels += 1;
      if (!alpha) continue;
      opaquePixels += 1;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error("Sprite frame is empty");
  return {
    bbox: [left, top, right + 1, bottom + 1],
    width: right - left + 1,
    height: bottom - top + 1,
    centerX: (left + right) / 2,
    bottom,
    opaquePixels,
    partialRatio: partialPixels / Math.max(1, opaquePixels + partialPixels),
  };
}

function differentPixelCount(first, second) {
  let count = 0;
  for (let pixel = 0; pixel < FRAME_SIZE * FRAME_SIZE; pixel += 1) {
    const start = pixel * 4;
    if (!first.subarray(start, start + 4).equals(second.subarray(start, start + 4))) count += 1;
  }
  return count;
}

export function validatePlayerDirectionalSprite(file) {
  const image = decodeRgbaPng(readFileSync(file));
  const failures = [];
  const expectedWidth = FRAME_SIZE * FRAME_COUNT;
  const expectedHeight = FRAME_SIZE * DIRECTIONS.length;
  if (image.width !== expectedWidth || image.height !== expectedHeight) {
    failures.push(`atlas must be ${expectedWidth}x${expectedHeight}, got ${image.width}x${image.height}`);
  }
  if (failures.length) return { valid: false, failures, width: image.width, height: image.height, directions: {} };

  const reports = {};
  for (let row = 0; row < DIRECTIONS.length; row += 1) {
    const direction = DIRECTIONS[row];
    const frames = Array.from({ length: FRAME_COUNT }, (_, column) => extractFrame(image, column, row));
    const metrics = frames.map(frameMetrics);
    reports[direction] = metrics;
    metrics.forEach((metric, frame) => {
      if (metric.width < 30 || metric.width > 36) failures.push(`${direction}[${frame}] visible width is ${metric.width}`);
      if (metric.height < 53 || metric.height > 57) failures.push(`${direction}[${frame}] visible height is ${metric.height}`);
      if (metric.centerX < 28 || metric.centerX > 35) failures.push(`${direction}[${frame}] horizontal center is ${metric.centerX}`);
      if (metric.bottom < 56 || metric.bottom > 60) failures.push(`${direction}[${frame}] feet row is ${metric.bottom}`);
      if (metric.partialRatio > .01) failures.push(`${direction}[${frame}] has soft alpha (${metric.partialRatio.toFixed(3)})`);
    });
    const distinctFrames = frames.filter((frame, index) => frames.findIndex((candidate) => candidate.equals(frame)) === index);
    if (distinctFrames.length < FRAME_COUNT) failures.push(`${direction} does not contain six distinct PixelLab walk frames`);
    for (let frame = 1; frame < frames.length; frame += 1) {
      if (differentPixelCount(frames[frame - 1], frames[frame]) < 20) {
        failures.push(`${direction}[${frame - 1}→${frame}] does not visibly animate`);
      }
    }
  }

  const allMetrics = Object.values(reports).flat();
  const heights = allMetrics.map((metric) => metric.height);
  const scaleDrift = (Math.max(...heights) - Math.min(...heights)) / Math.max(...heights);
  if (scaleDrift > .1) failures.push(`direction scale drift is ${(scaleDrift * 100).toFixed(1)}%, expected <= 10%`);
  const bottoms = allMetrics.map((metric) => metric.bottom);
  if (Math.max(...bottoms) - Math.min(...bottoms) > 4) failures.push("walk-cycle vertical motion exceeds four pixels");

  return {
    valid: failures.length === 0,
    failures,
    width: image.width,
    height: image.height,
    frameCount: FRAME_COUNT,
    rowOrder: DIRECTIONS,
    scaleDriftPercent: Number((scaleDrift * 100).toFixed(2)),
    directions: reports,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] || new URL("../assets/sprites/protagonist-walk-pixellab.png", import.meta.url);
  const report = validatePlayerDirectionalSprite(file);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}
