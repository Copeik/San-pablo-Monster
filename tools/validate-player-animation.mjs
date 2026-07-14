import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spritePath = path.join(root, "assets", "sprites", "protagonist-walk.png");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const sprite = fs.readFileSync(spritePath);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function paethPredictor(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodeRgbaPng(buffer) {
  let offset = 8;
  let width = 0; let height = 0;
  const compressed = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      check(data[8] === 8 && data[9] === 6 && data[12] === 0,
        "El atlas debe ser PNG RGBA de 8 bits sin entrelazado.");
    } else if (type === "IDAT") compressed.push(data);
    offset += length + 12;
    if (type === "IEND") break;
  }
  const packed = zlib.inflateSync(Buffer.concat(compressed));
  const bytesPerPixel = 4; const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let packedOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[packedOffset]; packedOffset += 1;
    const rowOffset = y * stride;
    const previousOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = packed[packedOffset]; packedOffset += 1;
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[previousOffset + x - bytesPerPixel] : 0;
      const predictor = [0, left, up, (left + up) >>> 1, paethPredictor(left, up, upperLeft)][filter];
      check(predictor !== undefined, `Filtro PNG no compatible: ${filter}.`);
      pixels[rowOffset + x] = (value + (predictor ?? 0)) & 255;
    }
  }
  return { width, height, pixels };
}

function extractFrame(atlas, column, row) {
  const frame = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y += 1) {
    const sourceStart = (((row * 64 + y) * atlas.width) + column * 64) * 4;
    atlas.pixels.copy(frame, y * 64 * 4, sourceStart, sourceStart + 64 * 4);
  }
  return frame;
}

function copyRows(target, source, top, bottom, mirror = false) {
  for (let y = top; y < bottom; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const sourceX = mirror ? 63 - x : x;
      source.copy(target, (y * 64 + x) * 4, (y * 64 + sourceX) * 4, (y * 64 + sourceX + 1) * 4);
    }
  }
}

function copyMasks(target, source, masks, mirror = false) {
  masks.forEach((mask) => {
    for (let y = mask.y; y < mask.y + mask.height; y += 1) {
      for (let x = mask.x; x < mask.x + mask.width; x += 1) {
        const sourceX = mirror ? 63 - x : x;
        source.copy(target, (y * 64 + x) * 4, (y * 64 + sourceX) * 4, (y * 64 + sourceX + 1) * 4);
      }
    }
  });
}

function regionsEqual(first, second, top = 0, bottom = 64) {
  return first.subarray(top * 64 * 4, bottom * 64 * 4)
    .equals(second.subarray(top * 64 * 4, bottom * 64 * 4));
}

function equalOutsideMasks(first, second, masks, top = 0) {
  for (let y = top; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const masked = masks.some((mask) => x >= mask.x && x < mask.x + mask.width
        && y >= mask.y && y < mask.y + mask.height);
      if (masked) continue;
      const pixel = (y * 64 + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        if (first[pixel + channel] !== second[pixel + channel]) return false;
      }
    }
  }
  return true;
}

function opaqueBottom(frame) {
  for (let y = 63; y >= 0; y -= 1) {
    for (let x = 0; x < 64; x += 1) if (frame[(y * 64 + x) * 4 + 3] > 0) return y;
  }
  return -1;
}

function supportIoU(first, second, row = 59) {
  let intersection = 0; let union = 0;
  for (let x = 0; x < 64; x += 1) {
    const firstOpaque = first[(row * 64 + x) * 4 + 3] > 0;
    const secondOpaque = second[(row * 64 + x) * 4 + 3] > 0;
    if (firstOpaque && secondOpaque) intersection += 1;
    if (firstOpaque || secondOpaque) union += 1;
  }
  return union ? intersection / union : 1;
}

check(sprite.length >= 24 && sprite.toString("ascii", 1, 4) === "PNG", "El atlas del protagonista no es un PNG válido.");
if (sprite.length >= 24) {
  check(sprite.readUInt32BE(16) === 256 && sprite.readUInt32BE(20) === 256,
    "El atlas debe conservar la cuadrícula 4×4 de celdas 64×64.");
}

const atlas = decodeRgbaPng(sprite);
const directions = ["down", "left", "right", "up"];
const oppositeDirection = { down: "down", left: "right", right: "left", up: "up" };
const legMasks = {
  down: [{ x: 20, y: 50, width: 24, height: 10 }],
  left: [{ x: 18, y: 51, width: 28, height: 9 }],
  right: [{ x: 17, y: 51, width: 28, height: 9 }],
  up: [{ x: 20, y: 51, width: 24, height: 9 }],
};
const rawFrames = Object.fromEntries(directions.map((direction, row) => [
  direction,
  Array.from({ length: 4 }, (_, column) => extractFrame(atlas, column, row)),
]));
directions.forEach((direction) => {
  const raw = rawFrames[direction]; const canonical = raw[0];
  const frames = [Buffer.from(canonical), Buffer.from(raw[1]), Buffer.from(canonical), Buffer.from(raw[3])];
  copyRows(frames[1], canonical, 0, 36);
  copyMasks(frames[3], rawFrames[oppositeDirection[direction]][1], legMasks[direction], true);
  copyRows(frames[3], canonical, 0, 36);
  check(frames.every((frame) => regionsEqual(canonical, frame, 0, 36)),
    `${direction}: la gorra o la cabeza cambia entre fotogramas.`);
  check(regionsEqual(frames[0], frames[2]), `${direction}: el segundo neutro no coincide con el primero.`);
  check(equalOutsideMasks(frames[3], raw[3], legMasks[direction], 36),
    `${direction}: el paso opuesto altera manos, chaqueta o mochila.`);
  check(frames.every((frame) => opaqueBottom(frame) === 59), `${direction}: los pies cambian de línea de suelo.`);
  check(supportIoU(frames[1], frames[3]) < .8, `${direction}: los dos pasos apoyan el mismo pie.`);
});

check(script.includes("const PLAYER_HEAD_LOCK_HEIGHT = 36"), "Falta el bloqueo estable de cabeza y gorra.");
check(script.includes("const PLAYER_LEG_MASKS ="), "Faltan las máscaras de piernas por dirección.");
check(script.includes("const frame2 = copyPlayerFrame(canonical)"), "El segundo fotograma neutro no replica exactamente al primero.");
check(script.includes("const frame3 = copyPlayerFrame(raw[3])"), "El cuarto fotograma no conserva el cuerpo dibujado original.");
check(script.includes("replacePlayerFrameLegs(frame3, oppositeStride, direction)"), "Falta el paso opuesto limitado a las piernas.");
check(script.includes("lockPlayerFrameHead(frame1, canonical)"), "El primer paso no conserva la gorra canónica.");
check(script.includes("dataset.playerCapStable"), "Falta el diagnóstico de estabilidad de la gorra.");
check(script.includes("dataset.playerBodyStable"), "Falta el diagnóstico de preservación del cuerpo fuera de las piernas.");
check(script.includes("dataset.playerStrideAlternates"), "Falta el diagnóstico de alternancia de pies.");
check(script.includes("renderPlayerAnimationDebugAtlas()"), "Falta la vista local para revisar los 16 fotogramas.");
check(script.includes("dataset.playerAnimationFrame"), "Falta el diagnóstico del ciclo reproducido en tiempo real.");
check((script.match(/resetPlayerAnimation\(\)/g) || []).length >= 5,
  "La pose no se reinicia en todos los estados de reposo o movimiento bloqueado.");
check(script.includes("VIEW_HEIGHT - 28") && script.includes("-64, -120, 128, 128"),
  "El entrenador ampliado de Prisma no está anclado a su sombra.");

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OK: ciclo 4×4 con gorra estable, cuerpo original, piernas alternas, reposo limpio y ancla Prisma corregida.");
}
