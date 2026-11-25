import { test } from "node:test";
import assert from "node:assert/strict";
import { scopesOf, tokenizePjx } from "./tokenize.ts";

const HEADER = "meta.pyjinhx-def-header";
const isPython = (scope: string) => scope.endsWith(".python");

test("single-line {#def#} header is scoped as a def header", async () => {
  const tokens = await tokenizePjx("{#def title: str #}\n<p></p>");
  assert.ok(scopesOf(tokens, "def").includes("keyword.control.import.pyjinhx"));
  assert.ok(scopesOf(tokens, "title").includes("variable.parameter.python"));
  assert.ok(scopesOf(tokens, "title").includes(HEADER));
  assert.ok(scopesOf(tokens, "str").includes("support.type.python"));
});

test("multi-line {#def#} header is scoped on every line", async () => {
  const tokens = await tokenizePjx("{#def\n  title: str,\n  count: int = 0\n#}\n<p></p>");
  assert.ok(scopesOf(tokens, "title").includes("variable.parameter.python"));
  assert.ok(scopesOf(tokens, "count").includes("variable.parameter.python"));
  assert.ok(scopesOf(tokens, "int").includes("support.type.python"));
});

test("{#css body is not scoped as python", async () => {
  const tokens = await tokenizePjx("{#css\n.card { padding: 1rem; }\n#}\n<p></p>");
  const padding = tokens.find((token) => token.text.includes("padding"));
  assert.ok(padding);
  assert.ok(!padding.scopes.some(isPython), padding.scopes.join(" "));
  assert.ok(padding.scopes.some((scope) => scope.startsWith("comment.block")));
});

test("{#js body is not scoped as python", async () => {
  const tokens = await tokenizePjx('{#js\nconst x = {"a": True};\n#}\n<p></p>');
  for (const token of tokens) {
    assert.ok(!token.scopes.some(isPython), token.text);
  }
});

test("prose {# css tweaks #} stays a plain comment", async () => {
  const tokens = await tokenizePjx("{# css tweaks: str #}\n<p></p>");
  const comment = tokens.filter((t) => t.text.trim() && t.scopes.some((s) => s.startsWith("comment.block")));
  assert.ok(comment.length > 0);
  for (const token of comment) {
    assert.ok(!token.scopes.some(isPython), token.text);
    assert.ok(!token.scopes.includes(HEADER), token.text);
  }
});
