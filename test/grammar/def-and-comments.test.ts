import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksOf } from "./blocks.ts";
import { GRAMMAR_MODES, scopesOf, tokenizePjx } from "./tokenize.ts";

const HEADER = "meta.block.def.pyjinhx";
const isPython = (scope: string) => scope.endsWith(".python");

for (const mode of GRAMMAR_MODES) {

test(`${mode}: single-line {#def#} header scopes the block, keyword and prop name`, async () => {
  const tokens = await tokenizePjx("{#def title: str #}\n<p></p>", mode);
  assert.ok(scopesOf(tokens, "def").includes("meta.block.def.pyjinhx"));
  assert.ok(scopesOf(tokens, "def").includes("keyword.control.pyjinhx"));
  assert.ok(scopesOf(tokens, "{#").includes("punctuation.definition.block.begin.pyjinhx"));
  assert.ok(scopesOf(tokens, "title").includes("variable.parameter.pyjinhx"));
  assert.ok(scopesOf(tokens, "str").some((scope) => scope.endsWith(".python")));
});

test(`${mode}: multi-line {#def#} header scopes a prop name on every line`, async () => {
  const tokens = await tokenizePjx("{#def\n  title: str,\n  count: int = 0\n#}\n<p></p>", mode);
  assert.ok(scopesOf(tokens, "title").includes("variable.parameter.pyjinhx"));
  assert.ok(scopesOf(tokens, "count").includes("variable.parameter.pyjinhx"));
  assert.ok(scopesOf(tokens, "int").some(isPython));
});

test(`${mode}: {#css body is CSS`, async () => {
  const tokens = await tokenizePjx("{#css\n.card { padding: 1rem; }\n#}\n<p></p>", mode);
  const padding = scopesOf(tokens, "padding");
  assert.ok(padding.includes("support.type.property-name.css"), padding.join(" "));
  assert.ok(padding.includes("meta.embedded.block.css"));
  assert.ok(!padding.some(isPython));
});

test(`${mode}: {#js body is JavaScript`, async () => {
  const tokens = await tokenizePjx('{#js\nconst x = {"a": True};\n#}\n<p></p>', mode);
  assert.ok(scopesOf(tokens, "const").includes("storage.type.js"));
  assert.ok(scopesOf(tokens, "const").includes("meta.embedded.block.js"));
  for (const token of tokens) {
    assert.ok(!token.scopes.some(isPython), token.text);
  }
});

test(`${mode}: {#python body is Python`, async () => {
  const tokens = await tokenizePjx("{#python\nimport os\n#}\n<p></p>", mode);
  assert.ok(scopesOf(tokens, "import").includes("keyword.control.import.python"));
  assert.ok(scopesOf(tokens, "import").includes("meta.embedded.block.python"));
});

test(`${mode}: a #} inside a CSS string ends the block, as in Jinja`, async () => {
  const tokens = await tokenizePjx('{#css\n.a::after { content: "x#}y"; }\n<p></p>', mode);
  assert.deepEqual(blocksOf(tokens), [{ keyword: "css", open_line: 1, close_line: 2 }]);
  assert.ok(!scopesOf(tokens, "p").some((scope) => scope.startsWith("meta.block.")));
});

test(`${mode}: an unclosed CSS brace does not swallow the closer`, async () => {
  const tokens = await tokenizePjx("{#css\n.a {\n#}\n<p></p>", mode);
  assert.deepEqual(blocksOf(tokens), [{ keyword: "css", open_line: 1, close_line: 3 }]);
  assert.ok(!scopesOf(tokens, "p").some((scope) => scope.startsWith("meta.block.")));
});

test(`${mode}: an open triple-quoted Python string does not swallow the closer`, async () => {
  const tokens = await tokenizePjx('{#python\nx = """abc\n#}\n<p></p>', mode);
  assert.deepEqual(blocksOf(tokens), [{ keyword: "python", open_line: 1, close_line: 3 }]);
  assert.ok(!scopesOf(tokens, "p").some((scope) => scope.startsWith("meta.block.")));
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
