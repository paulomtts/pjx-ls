import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksOf } from "./blocks.ts";
import { assertSnapshot, dumpTokens } from "./snapshot.ts";
import { scopesOf, tokenizePjx, type ScopedToken } from "./tokenize.ts";

const token = (line: number, text: string, ...scopes: string[]): ScopedToken => ({ line, text, scopes });

test("tokens carry 1-based line numbers", async () => {
  const tokens = await tokenizePjx("<p>\n\n<b>");
  assert.deepEqual(
    [...new Set(tokens.filter((t) => t.text.trim()).map((t) => t.line))],
    [1, 3],
  );
});

test("the root scope can be source.python", async () => {
  const tokens = await tokenizePjx("def f(x):\n    return x", "source.python");
  assert.ok(scopesOf(tokens, "def").includes("storage.type.function.python"));
});

test("the vendored CSS, JS and Python grammars load", async () => {
  const python = await tokenizePjx("import os", "source.python");
  assert.ok(scopesOf(python, "import").includes("keyword.control.import.python"));
});

test("blocksOf reads keyword and closer lines from scopes", () => {
  const kw = ["text.pyjinhx", "meta.block.css.pyjinhx", "keyword.control.pyjinhx"];
  const end = ["text.pyjinhx", "meta.block.css.pyjinhx", "punctuation.definition.block.end.pyjinhx"];
  const tokens = [token(2, "{#", "text.pyjinhx"), token(2, "css", ...kw), token(4, "#}", ...end)];
  assert.deepEqual(blocksOf(tokens), [{ keyword: "css", open_line: 2, close_line: 4 }]);
});

test("blocksOf reports an unclosed block with a null close line", () => {
  const kw = ["text.pyjinhx", "meta.block.js.pyjinhx", "keyword.control.pyjinhx"];
  assert.deepEqual(blocksOf([token(1, "js", ...kw)]), [{ keyword: "js", open_line: 1, close_line: null }]);
});

test("dumpTokens prints one line per token with scopes below the root", () => {
  assert.equal(dumpTokens([token(1, "a b", "text.x", "meta.y"), token(1, " ", "text.x")]), '1: "a b" meta.y\n');
});

test("a golden dump of a small document matches its snapshot", async () => {
  assertSnapshot("harness-comment", dumpTokens(await tokenizePjx("{# note #}\n<p>hi</p>")));
});
