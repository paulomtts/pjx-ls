import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, globSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const inputs = globSync("test/fixtures/components/**/*.html", { cwd: root });

test("there are 21 component fixtures", () => {
  assert.equal(inputs.length, 21);
});

for (const rel of inputs) {
  const goldenRel = rel.replace("test/fixtures/components/", "test/fixtures/expected/");
  test(`golden: ${rel}`, () => {
    const input = readFileSync(join(root, rel), "utf8");
    const golden = readFileSync(join(root, goldenRel), "utf8");
    const out = formatPyjinhxTemplate(input);
    assert.equal(out, golden, "formatter output must match the committed golden");
    assert.equal(formatPyjinhxTemplate(out), out, "formatter must be idempotent");
  });
}
