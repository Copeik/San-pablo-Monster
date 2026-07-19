import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateNpcWalkSheets } from "../tools/validate-npc-walk-sheets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("all NPC walk sheets share the protagonist 6x8 composition and organized folder", () => {
  const report = validateNpcWalkSheets(projectRoot);
  assert.equal(report.valid, true, report.failures.join("\n"));
  assert.equal(report.spriteCount, 48);
  assert.equal(report.contract, "npc-walk-6x8");
});
