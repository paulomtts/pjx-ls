import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { blocksOf, type Block } from "./blocks.ts";
import { assertSnapshot, dumpTokens } from "./snapshot.ts";
import { tokenizePjx } from "./tokenize.ts";

const corpus = fileURLToPath(new URL("../fixtures/pyjinhx/corpus/", import.meta.url));

interface Expected {
  blocks: { keyword: string; open_line: number; close_line: number; body_lines?: [number, number] | null }[];
  error: { code: string; line: number } | null;
}

const decode = (name: string) =>
  readFileSync(`${corpus}${name}`, "utf8").replace(/^﻿/, "").replaceAll("\r\n", "\n");

// The corpus leaves an empty css/js block out; the grammar may still highlight it.
const isEmptyHighlight = (block: Block) =>
  (block.keyword === "css" || block.keyword === "js") && block.close_line !== null && block.close_line - block.open_line <= 1;

for (const file of readdirSync(corpus).filter((name) => name.endsWith(".pjx")).sort()) {
  const name = file.replace(/\.pjx$/, "");
  const expected: Expected = JSON.parse(readFileSync(`${corpus}${name}.json`, "utf8"));

  test(`corpus ${name}`, async () => {
    const source = decode(file);
    const tokens = await tokenizePjx(source);
    const got = blocksOf(tokens);

    if (expected.error) {
      assertSnapshot(`corpus-${name}`, dumpTokens(tokens));
      const closerAt = source.lastIndexOf("#}");
      if (closerAt < 0) {
        assert.ok(tokens.length > 0);
        assert.ok(got.every((block) => block.close_line === null), "no #} anywhere, so no block closes");
        return;
      }
      const lastCloser = source.slice(0, closerAt).split("\n").length;
      for (const token of tokens.filter((token) => token.line > lastCloser)) {
        assert.ok(!token.scopes.some((scope) => scope.startsWith("meta.block.")), `${token.text} after the last #}`);
      }
      return;
    }

    const want = expected.blocks.map(({ keyword, open_line, close_line }) => ({ keyword, open_line, close_line }));
    const extra = (block: Block) => isEmptyHighlight(block) && !want.some((w) => w.open_line === block.open_line);
    const matched = got.filter((block) => !extra(block));
    assert.deepEqual(matched, want);

    // A def block has no body; every other body is the lines between opener and closer.
    for (const [index, block] of expected.blocks.entries()) {
      if (block.keyword === "def") continue;
      const { open_line, close_line } = matched[index] as Block & { close_line: number };
      assert.deepEqual(block.body_lines ?? null, close_line - open_line > 1 ? [open_line + 1, close_line - 1] : null, block.keyword);
    }
  });
}
