import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { blocksOf } from "./blocks.ts";
import { assertSnapshot, dumpTokens } from "./snapshot.ts";
import { tokenizePjx } from "./tokenize.ts";

const samples = fileURLToPath(new URL("../fixtures/grammar-samples/", import.meta.url));

for (const file of readdirSync(samples).filter((name) => name.endsWith(".pjx")).sort()) {
  test(`golden ${file}`, async () => {
    const tokens = await tokenizePjx(readFileSync(`${samples}${file}`, "utf8"));
    assertSnapshot(`sample-${file.replace(/\.pjx$/, "")}`, dumpTokens(tokens));
  });
}

test("prose that looks like a block keyword is a comment, not a block", async () => {
  const tokens = await tokenizePjx(readFileSync(`${samples}05-edge.pjx`, "utf8"));
  assert.deepEqual(
    blocksOf(tokens).map((block) => block.keyword),
    ["js", "css"],
  );
});
