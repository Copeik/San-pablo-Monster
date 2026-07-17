import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("../game-music.js");

const music = globalThis.GAME_MUSIC;

test("la banda sonora contiene 20 temas originales y cinco categorías", () => {
  assert.ok(music);
  assert.equal(music.tracks.length, 20);
  assert.equal(new Set(music.tracks.map((track) => track.id)).size, 20);
  assert.deepEqual(
    music.tracksByCategory().map((category) => [category.id, category.tracks.length]),
    [["city", 4], ["exploration", 4], ["venues", 4], ["battle", 5], ["events", 3]],
  );
});

test("cada tema forma un bucle de cuatro compases válido para cuatro canales", () => {
  const noteToken = /^(?:-|~|[A-G](?:s|#|b)?-?\d)$/;
  const drumToken = /^(?:-|[KSH]+)$/;
  music.tracks.forEach((track) => {
    assert.equal(track.steps, 64, track.id);
    assert.equal(track.bars, 4, track.id);
    assert.ok(track.bpm >= 70 && track.bpm <= 180, track.id);
    ["lead", "harmony", "bass"].forEach((channelName) => {
      const channel = track.channels[channelName];
      assert.equal(channel.length, 64, `${track.id}:${channelName}`);
      channel.forEach((token) => assert.match(token, noteToken, `${track.id}:${channelName}:${token}`));
    });
    assert.equal(track.channels.drums.length, 64, `${track.id}:drums`);
    track.channels.drums.forEach((token) => assert.match(token, drumToken, `${track.id}:drums:${token}`));
  });
});

test("las notas se convierten a frecuencias temperadas", () => {
  assert.equal(Math.round(music.noteFrequency("A4")), 440);
  assert.equal(Math.round(music.noteFrequency("C4")), 262);
  assert.equal(music.noteFrequency("-"), 0);
  assert.equal(music.noteFrequency("nota-inválida"), 0);
});

test("la biblioteca se carga antes del juego y expone su interfaz", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../script.js", import.meta.url), "utf8"),
  ]);
  assert.ok(html.indexOf('src="game-music.js') < html.indexOf('src="script.js'));
  ["musicButton", "musicModal", "musicCatalog", "musicAutoButton"].forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`));
  });
  [
    "battle-wild", "battle-prism-boss", "crystal-cave", "ancient-ruins",
    "forest-whisper", "pokemon-center", "professor-lab", "grand-stadium",
    "city-azahar", "route-first", "city-night", "city-san-pablo",
  ].forEach((id) => {
    assert.ok(music.trackById(id), id);
    assert.ok(script.includes(`"${id}"`), id);
  });
});
