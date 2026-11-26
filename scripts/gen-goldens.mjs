// Generate golden formatter outputs for the progressive .pjx test fixtures.
//
// Inputs:   test/fixtures/templates/NN-name.pjx
// Goldens:  test/fixtures/expected/NN-name.pjx  (= formatPyjinhxTemplate(input))
//
// Goldens are a committed regression snapshot of the CURRENT formatter. This
// script SKIPS any fixture that already has a golden, so it can never silently
// re-baseline a reviewed contract — it only captures goldens for NEW fixtures.
// To deliberately re-baseline (e.g. after an intentional formatter change),
// delete the stale golden first, then re-run and review the diff.
import { readFileSync, writeFileSync, mkdirSync, globSync, existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPyjinhxTemplate } from "../src/core/format.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputs = globSync("test/fixtures/templates/*.pjx", { cwd: root });
let wrote = 0;
let skipped = 0;
for (const rel of inputs) {
  const outAbs = join(root, "test/fixtures/expected", basename(rel));
  if (existsSync(outAbs)) {
    skipped += 1;
    continue;
  }
  const golden = formatPyjinhxTemplate(readFileSync(join(root, rel), "utf8"));
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, golden, "utf8");
  wrote += 1;
}
console.log(`goldens: wrote ${wrote}, skipped ${skipped} existing`);
