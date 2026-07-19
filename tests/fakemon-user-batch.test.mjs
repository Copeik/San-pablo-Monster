import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lines = [
  [9901, 9902, 9903], [9904, 9905], [9906, 9907, 9908], [9909, 9910, 9911],
  [9912, 9913], [9914, 9915], [9916, 9917], [9918], [9919, 9920],
  [9921, 9922, 9923], [9924, 9925, 9926], [9927, 9928], [9929, 9930],
  [9931, 9932], [9933, 9934, 9935], [9936], [9937, 9938, 9939],
  [9940, 9941, 9942], [9943, 9944], [9945, 9946], [9947],
  [9948, 9949, 9950], [9951, 9952, 9953],
];
const firstStages = lines.map(([id]) => id);
const evolvedStages = lines.flatMap((ids) => ids.slice(1));


test("the supplied batch registers 53 consecutive playable species and both sprite views", async () => {
  const script = await readFile(path.join(root, "script.js"), "utf8");
  const ids = lines.flat();
  assert.equal(ids.length, 53);
  assert.deepEqual(ids, Array.from({ length: 53 }, (_, index) => 9901 + index));

  for (const id of ids) {
    assert.match(script, new RegExp(`^\\s*${id}: \\{ id: ${id},`, "m"), `missing species ${id}`);
    const mapping = script.match(new RegExp(`^\\s*${id}: \\{ front: "([^"]+)", back: "([^"]+)" \\},`, "m"));
    assert.ok(mapping, `missing front/back mapping for ${id}`);
    await Promise.all(mapping.slice(1).map((relative) => access(path.join(root, relative))));
  }
});


test("only the supplied first stages enter normal wild encounter tables", async () => {
  const script = await readFile(path.join(root, "script.js"), "utf8");
  const wildSource = [...script.matchAll(/const\s+[A-Z_]*WILD_TABLE\s*=\s*\[([\s\S]*?)\];/g)]
    .map((match) => match[1])
    .join("\n");
  for (const id of firstStages) assert.match(wildSource, new RegExp(`\\{ id: ${id}, weight: \\d+ \\}`));
  for (const id of evolvedStages) assert.doesNotMatch(wildSource, new RegExp(`\\{ id: ${id},`));
});


test("Pipator and Culebrín expose two selectable evolution branches", async () => {
  const script = await readFile(path.join(root, "script.js"), "utf8");
  assert.match(script, /9948: \{[^\n]*evolutionBranches: \[9949, 9950\], evolveLevel: 20/);
  assert.match(script, /9951: \{[^\n]*evolutionBranches: \[9952, 9953\], evolveLevel: 20/);
  assert.match(script, /function evolutionTargetFor\(species\)/);
  assert.match(script, /Aceptar: \$\{first\.name\}/);
  assert.match(script, /Cancelar: \$\{second\.name\}/);
  assert.match(script, /const hpDelta = nextSpecies\.baseHp - species\.baseHp;/);
});


test("every supplied family records asset provenance", async () => {
  const script = await readFile(path.join(root, "script.js"), "utf8");
  const folders = new Set([...script.matchAll(/99\d{2}: \{ front: "assets\/pokemon\/([^/]+)\//g)].map((match) => match[1]));
  assert.equal(folders.size, 23);
  await Promise.all([...folders].map((folder) => access(path.join(root, "assets", "pokemon", folder, "CREDITS.txt"))));
});
