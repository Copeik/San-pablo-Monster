import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("las pistas largas se reproducen por streaming sin decodificarlas a PCM", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  const start = source.indexOf("function prepareDialogMusic");
  const end = source.indexOf("function applyDialogPresentation", start);
  const dialogMusic = source.slice(start, end);

  assert.match(source, /dialogMusicAudio\.preload\s*=\s*"metadata"/);
  assert.doesNotMatch(dialogMusic, /fetch\(|decodeAudioData|createBufferSource|getChannelData/);
  assert.doesNotMatch(source, /dialogMusicBuffer|dialogMusicSourceNode|dialogMusicGainNode/);
});

test("los sonidos de terror no precargan 10 MB durante el arranque", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  assert.match(source, /Object\.entries\(HORROR_AUDIO_URLS\)[\s\S]*?audio\.preload\s*=\s*"none"/);
  assert.match(source, /const audio = new Audio\(\);[\s\S]*?audio\.preload = "none";[\s\S]*?audio\.src = url;/);
  assert.doesNotMatch(source, /Object\.values\(horrorAudio\)\.forEach\(\(audio\) => audio\.load\(\)\)/);
});

test("las imágenes exclusivas de Prisma se cargan al entrar, no en portada", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  const loadAssetsStart = source.indexOf("function loadAssets");
  const loadAssetsEnd = source.indexOf("function updateAssetNotice", loadAssetsStart);
  const loadAssets = source.slice(loadAssetsStart, loadAssetsEnd);
  const enterStart = source.indexOf("async function enterPrismDimension");
  const enterEnd = source.indexOf("function leavePrismDimension", enterStart);

  assert.match(source, /function loadPrismAssets\(\)/);
  assert.doesNotMatch(loadAssets, /shadowStalkerImage\.src|prismPortalFragmentsImage\.src/);
  assert.match(source.slice(enterStart, enterEnd), /loadPrismAssets\(\)/);
});
