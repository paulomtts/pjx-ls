import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, globSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

// Every .pjx fixture that is not a golden pair: the vendored corpus, the grammar samples,
// the project. format-corpus.json holds what the formatter answers for each; rewrite it
// with UPDATE_FORMAT_CORPUS=1 and review the diff, as for a golden.
const root = fileURLToPath(new URL("../..", import.meta.url));
const stored = join(root, "test/fixtures/format-corpus.json");
const files = globSync("test/fixtures/{pyjinhx/corpus,grammar-samples,project,python-block}/**/*.pjx", { cwd: root }).sort();
const templates = globSync("test/fixtures/templates/*.pjx", { cwd: root }).sort();
const solid = (text: string) => text.replace(/\s+/g, "");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

if (process.env.UPDATE_FORMAT_CORPUS) {
  const entries: Record<string, string> = {};
  for (const rel of files) entries[rel] = formatPyjinhxTemplate(read(rel));
  writeFileSync(stored, `${JSON.stringify(entries, null, 2)}\n`);
}

let expected: Record<string, string> = {};
try {
  expected = JSON.parse(readFileSync(stored, "utf8"));
} catch {
  // the "present" test below fails with a clearer message
}

test("the corpus is present", () => {
  assert.equal(files.length, 55);
  assert.equal(Object.keys(expected).length, 55);
});

for (const rel of files) {
  test(`corpus: ${rel}`, () => {
    const input = read(rel);
    const output = formatPyjinhxTemplate(input);
    assert.equal(output, expected[rel], "output must match the stored entry");
    assert.equal(formatPyjinhxTemplate(output), output, "formatter must be idempotent");
    assert.equal(solid(output), solid(input), "the formatter moves whitespace and nothing else");
  });
}

for (const rel of templates) {
  test(`template: ${rel}`, () => {
    const input = read(rel);
    const output = formatPyjinhxTemplate(input);
    assert.equal(formatPyjinhxTemplate(output), output, "formatter must be idempotent");
    assert.equal(solid(output), solid(input), "the formatter moves whitespace and nothing else");
  });
}
