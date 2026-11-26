import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "../../src/core/regions.ts";

const corpus = fileURLToPath(new URL("../fixtures/pyjinhx/corpus/", import.meta.url));
const cases = globSync("*.pjx", { cwd: corpus }).sort();

// What the scanner found, written the way the corpus records it.
function recorded(source: string) {
  const { blocks, error } = scan(source);
  return {
    blocks: blocks.map((b) => ({
      keyword: b.keyword,
      open_line: b.openLine,
      ...(b.keyword === "def" ? {} : { body_lines: b.bodyLines }),
      close_line: b.closeLine,
    })),
    error,
  };
}

test("the whole corpus is vendored", () => {
  assert.equal(cases.length, 40);
});

for (const file of cases) {
  const name = basename(file, ".pjx");
  test(`corpus: ${name}`, () => {
    const expected = JSON.parse(readFileSync(corpus + name + ".json", "utf8"));
    const source = readFileSync(corpus + file, "utf8").replace(/^﻿/, "");
    const actual = recorded(source);
    if ("known_gap" in expected) {
      // pyjinhx differs from Jinja here, and so do we; this fails once that changes.
      assert.notDeepEqual(actual, { blocks: expected.blocks, error: expected.error });
    } else {
      assert.deepEqual(actual, { blocks: expected.blocks, error: expected.error });
    }
  });
}

test("a byte order mark is part of the text but not of column 0", () => {
  const source = readFileSync(corpus + "bom_before_block.pjx", "utf8");
  assert.ok(source.startsWith("﻿"));
  assert.deepEqual(recorded(source), recorded(source.slice(1)));
});
