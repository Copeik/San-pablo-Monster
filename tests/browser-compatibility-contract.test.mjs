import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("el viewport y los controles táctiles cubren móvil, tablet y zonas seguras", async () => {
  const css = await readFile(path.join(root, "styles.css"), "utf8");
  assert.match(css, /@media\s*\(any-pointer:\s*coarse\)/);
  assert.match(css, /@media\s*\(any-pointer:\s*coarse\)[\s\S]*?\.touch-controls\s*\{[^}]*display:\s*flex/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

test("el núcleo no depende de Array.at ni Object.hasOwn", async () => {
  for (const file of ["script.js", "attack-effects.js", "perspective-zone-core.js"]) {
    const source = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /\.at\(-1\)/, `${file} usa Array.at`);
    assert.doesNotMatch(source, /Object\.hasOwn\(/, `${file} usa Object.hasOwn`);
  }
});

test("una navegación de mapa no recarga si no pudo persistir la partida", async () => {
  const source = await readFile(path.join(root, "script.js"), "utf8");
  assert.match(source, /const SAVE_TRANSFER_BACKUP_KEY\s*=/);
  assert.match(source, /function saveGame\([\s\S]*?return persisted;/);
  assert.match(source, /function navigateToRegisteredMap\([\s\S]*?if \(!saveGame\(\)\) \{/);
  assert.match(source, /sessionStorage\.getItem\(SAVE_TRANSFER_BACKUP_KEY\)/);
  assert.match(source, /fullscreenButton\.hidden\s*=\s*!supported/);
});
