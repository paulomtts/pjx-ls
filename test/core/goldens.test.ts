import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, globSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

// Progressive .pjx fixtures (simple -> complex), each exercising one more
// feature of the formatter. test/fixtures/templates/NN-name.pjx is the input;
// test/fixtures/expected/NN-name.pjx is the reviewed golden output. See
// test/fixtures/templates/README.md for the ladder.
const root = fileURLToPath(new URL("../..", import.meta.url));
const inputs = globSync("test/fixtures/templates/*.pjx", { cwd: root }).sort();

test("the progressive fixture suite is present", () => {
  assert.equal(inputs.length, 14);
});

for (const rel of inputs) {
  const goldenRel = join("test/fixtures/expected", basename(rel));
  test(`golden: ${basename(rel)}`, () => {
    const input = readFileSync(join(root, rel), "utf8");
    const golden = readFileSync(join(root, goldenRel), "utf8");
    const out = formatPyjinhxTemplate(input);
    assert.equal(out, golden, "formatter output must match the reviewed golden");
    assert.equal(formatPyjinhxTemplate(out), out, "formatter must be idempotent");
  });
}
