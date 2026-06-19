// Generate golden formatter outputs for fixtures that don't have one yet.
//
// The existing goldens are a FROZEN behavior contract (originally captured from
// the legacy JS formatter). This script intentionally SKIPS any fixture that
// already has a golden, so it can never silently re-baseline the contract — it
// only captures goldens for NEW fixtures dropped into test/fixtures/components.
// To deliberately re-baseline, delete the stale golden first, then re-run.
import { readFileSync, writeFileSync, mkdirSync, globSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPyjinhxTemplate } from "../src/core/format.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputs = globSync("test/fixtures/components/**/*.html", { cwd: root });
let wrote = 0;
let skipped = 0;
for (const rel of inputs) {
  const outRel = rel.replace("test/fixtures/components/", "test/fixtures/expected/");
  const outAbs = join(root, outRel);
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
