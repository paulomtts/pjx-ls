import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAMMAR_MODES, scopesOf, tokenizePjx } from "./tokenize.ts";

const HEADER = "meta.pyjinhx-def-header";
const isPython = (scope: string) => scope.endsWith(".python");

for (const mode of GRAMMAR_MODES) {

test(`${mode}: single-line {#def#} header is scoped as a def header`, async () => {
  const tokens = await tokenizePjx("{#def title: str #}\n<p></p>", mode);
  assert.ok(scopesOf(tokens, "def").includes("keyword.control.import.pyjinhx"));
  assert.ok(scopesOf(tokens, "title").includes("variable.parameter.python"));
  assert.ok(scopesOf(tokens, "title").includes(HEADER));
  assert.ok(scopesOf(tokens, "str").includes("support.type.python"));
});

test(`${mode}: multi-line {#def#} header is scoped on every line`, async () => {
  const tokens = await tokenizePjx("{#def\n  title: str,\n  count: int = 0\n#}\n<p></p>", mode);
  assert.ok(scopesOf(tokens, "title").includes("variable.parameter.python"));
  assert.ok(scopesOf(tokens, "count").includes("variable.parameter.python"));
  assert.ok(scopesOf(tokens, "int").includes("support.type.python"));
});

test(`${mode}: {#css body is not scoped as python`, async () => {
  const tokens = await tokenizePjx("{#css\n.card { padding: 1rem; }\n#}\n<p></p>", mode);
  const padding = tokens.find((token) => token.text.includes("padding"));
  assert.ok(padding);
  assert.ok(!padding.scopes.some(isPython), padding.scopes.join(" "));
  assert.ok(padding.scopes.some((scope) => scope.startsWith("comment.block")));
});

test(`${mode}: {#js body is not scoped as python`, async () => {
  const tokens = await tokenizePjx('{#js\nconst x = {"a": True};\n#}\n<p></p>', mode);
  for (const token of tokens) {
    assert.ok(!token.scopes.some(isPython), token.text);
  }
});

test(`${mode}: prose {# css tweaks #} stays a plain comment`, async () => {
  const tokens = await tokenizePjx("{# css tweaks: str #}\n<p></p>", mode);
  const comment = tokens.filter((t) => t.text.trim() && t.scopes.some((s) => s.startsWith("comment.block")));
  assert.ok(comment.length > 0);
  for (const token of comment) {
    assert.ok(!token.scopes.some(isPython), token.text);
    assert.ok(!token.scopes.includes(HEADER), token.text);
  }
});

test(`${mode}: {# #} and {#- -#} comments are pyjinhx comments, markup inside included`, async () => {
  for (const source of ["{# note: <b> #}", "{#- note: <b> -#}", "{#\n  note\n  <b>\n#}"]) {
    const tokens = await tokenizePjx(`${source}\n<p></p>`, mode);
    const comment = tokens.slice(0, tokens.findIndex((token) => token.text === "<p>" || token.text === "<"));
    const words = comment.filter((token) => token.text.trim());
    assert.ok(words.length > 0, source);
    for (const token of words) {
      assert.ok(token.scopes.includes("comment.block.pyjinhx"), `${source}: ${token.text} ${token.scopes.join(" ")}`);
    }
  }
});
}
