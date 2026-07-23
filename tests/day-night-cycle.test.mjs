import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cycleSource = await readFile(path.join(ROOT, "day-night-cycle.js"), "utf8");
const runtimeSource = await readFile(path.join(ROOT, "script.js"), "utf8");
const htmlSource = await readFile(path.join(ROOT, "index.html"), "utf8");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(cycleSource, sandbox, { filename: "day-night-cycle.js" });
const DAY_NIGHT_CYCLE = sandbox.DAY_NIGHT_CYCLE;

test("el ciclo solar se publica como helper aislado", () => {
  assert.ok(DAY_NIGHT_CYCLE);
  assert.equal(typeof DAY_NIGHT_CYCLE.localMinutes, "function");
  assert.equal(typeof DAY_NIGHT_CYCLE.sampleAtMinutes, "function");
  assert.equal(typeof DAY_NIGHT_CYCLE.paint, "function");
});

test("la hora se obtiene de los getters locales del dispositivo", () => {
  const calls = [];
  const localClock = {
    getHours() { calls.push("hours"); return 21; },
    getMinutes() { calls.push("minutes"); return 37; },
    getSeconds() { calls.push("seconds"); return 30; },
    getMilliseconds() { calls.push("milliseconds"); return 500; },
    getUTCHours() { throw new Error("No debe consultar UTC"); },
  };

  assert.ok(Math.abs(DAY_NIGHT_CYCLE.localMinutes(localClock) - (21 * 60 + 37 + 30.5 / 60)) < 1e-9);
  assert.deepEqual(calls, ["hours", "minutes", "seconds", "milliseconds"]);
});

test("clasifica amanecer, día, atardecer y noche con límites estables", () => {
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(4 * 60).phase, "night");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(5 * 60 + 29).phase, "night");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(5 * 60 + 30).phase, "dawn");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(7 * 60 + 29).phase, "dawn");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(7 * 60 + 30).phase, "day");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(12 * 60).phase, "day");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(18 * 60 + 59).phase, "day");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(19 * 60).phase, "dusk");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(20 * 60 + 59).phase, "dusk");
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(21 * 60).phase, "night");
});

test("la interpolación es continua en medianoche y mantiene colores válidos", () => {
  const beforeMidnight = DAY_NIGHT_CYCLE.sampleAtMinutes(1439.999);
  const midnight = DAY_NIGHT_CYCLE.sampleAtMinutes(0);
  const afterMidnight = DAY_NIGHT_CYCLE.sampleAtMinutes(0.001);

  for (const channel of ["top", "bottom"]) {
    beforeMidnight[channel].forEach((value, index) => {
      const max = index === 3 ? 1 : 255;
      assert.ok(value >= 0 && value <= max);
      assert.ok(Math.abs(value - midnight[channel][index]) < 0.01);
      assert.ok(Math.abs(afterMidnight[channel][index] - midnight[channel][index]) < 0.01);
    });
  }
  assert.ok(midnight.strength > 0.3);
  assert.equal(DAY_NIGHT_CYCLE.sampleAtMinutes(12 * 60).strength, 0);
});

test("el pintor encapsula el estado del canvas y cubre todo el viewport", () => {
  const calls = [];
  const gradient = { addColorStop: (...args) => calls.push(["stop", ...args]) };
  const context = {
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    createLinearGradient: (...args) => {
      calls.push(["linear", ...args]);
      return gradient;
    },
    createRadialGradient: (...args) => {
      calls.push(["radial", ...args]);
      return gradient;
    },
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    set fillStyle(value) { calls.push(["fillStyle", value]); },
  };

  assert.equal(DAY_NIGHT_CYCLE.paint(context, 960, 624, DAY_NIGHT_CYCLE.sampleAtMinutes(23 * 60)), true);
  assert.deepEqual(calls[0], ["save"]);
  assert.ok(calls.some((entry) => entry[0] === "fillRect"
    && entry[1] === 0 && entry[2] === 0 && entry[3] === 960 && entry[4] === 624));
  assert.deepEqual(calls.at(-1), ["restore"]);
  assert.equal(DAY_NIGHT_CYCLE.paint(context, 960, 624, DAY_NIGHT_CYCLE.sampleAtMinutes(12 * 60)), false);
});

test("el juego carga y aplica el ciclo antes de script.js solo en escenas exteriores", () => {
  assert.ok(htmlSource.indexOf('src="day-night-cycle.js')
    < htmlSource.indexOf('src="script.js'));
  assert.match(runtimeSource, /const DAY_NIGHT_CYCLE = globalThis\.DAY_NIGHT_CYCLE/);
  assert.match(runtimeSource, /DAY_NIGHT_MAP_KINDS = new Set\(\["city", "district", "route"\]\)/);
  assert.match(runtimeSource, /DAY_NIGHT_CYCLE\.paint\(context, VIEW_WIDTH, VIEW_HEIGHT, snapshot\)/);
  assert.match(runtimeSource, /usesOutdoorDayNight\(\) && currentDayNightSnapshot\(\)\.isNight \? "city-night"/);
  assert.match(runtimeSource, /dayNightMusicSyncPending[\s\S]*backgroundMusic\.currentTrack\?\.id !== nextTrackId[\s\S]*startBackgroundMusic\(\)/);
  assert.match(runtimeSource, /dayNight:\s*\(\)\s*=>/);
});
