import { readFileSync, writeFileSync, mkdirSync, globSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Oracle = the EXISTING formatter (CommonJS), still present at this point.
const { formatPyjinhxTemplate } = require("../pyjinhx-highlight/format-slots.js");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputs = globSync("test/fixtures/components/**/*.html", { cwd: root });
let count = 0;
for (const rel of inputs) {
  const input = readFileSync(join(root, rel), "utf8");
  const golden = formatPyjinhxTemplate(input);
  const outRel = rel.replace("test/fixtures/components/", "test/fixtures/expected/");
  mkdirSync(join(root, dirname(outRel)), { recursive: true });
  writeFileSync(join(root, outRel), golden, "utf8");
  count += 1;
}
console.log(`wrote ${count} goldens`);
