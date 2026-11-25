import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksOf } from "./blocks.ts";
import { assertSnapshot, dumpTokens } from "./snapshot.ts";
import { scopesOf, tokenizePjx, type ScopedToken } from "./tokenize.ts";

const isJinja = (token: ScopedToken) => token.scopes.some((scope) => scope.startsWith("meta.scope.jinja"));
const jinjaTokens = (tokens: ScopedToken[]) => tokens.filter(isJinja).map((token) => token.text);

test("golden: Jinja inside tag, attribute and comment positions", async () => {
  const source = `<a href="{{ url_for('x', id=item.id) }}" {% if on %}class="on"{% endif %} title="{# c #}">l</a>`;
  const tokens = await tokenizePjx(source);
  assertSnapshot("jinja-in-tag", dumpTokens(tokens));
  assert.ok(scopesOf(tokens, "url_for").includes("meta.scope.jinja.variable"));
  assert.ok(scopesOf(tokens, "if").includes("meta.scope.jinja.tag"));
  assert.ok(scopesOf(tokens, "class").includes("entity.other.attribute-name.html"));
  assert.ok(scopesOf(tokens, "endif").includes("meta.scope.jinja.tag"));
});

test("an attribute name glued to Jinja stays a name", async () => {
  const tokens = await tokenizePjx("<input big{% endif %} other>");
  assert.ok(scopesOf(tokens, "big").includes("entity.other.attribute-name.html"));
  assert.ok(scopesOf(tokens, "endif").includes("meta.scope.jinja.tag"));
  assert.ok(scopesOf(tokens, "other").includes("entity.other.attribute-name.html"));
});

test("Jinja inside a component attribute string", async () => {
  const tokens = await tokenizePjx('<Card title="{{ t }}"/>');
  assert.ok(scopesOf(tokens, "t").includes("meta.scope.jinja.variable"));
});

test("{{ }} inside <script> and <style> is Jinja", async () => {
  const script = await tokenizePjx("<script>\nconst d = {{ data|tojson }};\n</script>");
  assert.ok(scopesOf(script, "tojson").includes("meta.scope.jinja.variable"));
  const style = await tokenizePjx('<style>\n.a { content: "{{ x }}"; }\n</style>');
  assert.ok(scopesOf(style, "x").includes("meta.scope.jinja.variable"));
});

test("Jinja does not apply inside {#css, {#js and {#python bodies", async () => {
  const css = await tokenizePjx('{#css\n.x::after { content: "{% raw %}"; }\n#}');
  const raw = css.find((token) => token.text.includes("{% raw %}"));
  assert.ok(raw?.scopes.includes("string.quoted.double.css"), raw?.scopes.join(" "));
  assert.deepEqual(jinjaTokens(css), []);
  assert.deepEqual(jinjaTokens(await tokenizePjx("{#js\nconst o = {{a: 1}};\nconst t = '{{ x }}';\n#}")), []);
  assert.deepEqual(jinjaTokens(await tokenizePjx("{#python\nx = '{{ y }}'\n#}")), []);
});

test("Jinja does not apply inside comments or raw regions in tags", async () => {
  assert.deepEqual(jinjaTokens(await tokenizePjx("{# <a href='{{ x }}'> #}")), []);
  const raw = await tokenizePjx("{% raw %}<a href='{{ x }}'>{% endraw %}");
  assert.ok(!raw.some((token) => token.scopes.includes("meta.scope.jinja.variable")));
});

test("Jinja inside HTML, JS and CSS comments still renders, so it is Jinja", async () => {
  const html = await tokenizePjx("<!-- {{ x }} -->");
  assert.ok(scopesOf(html, "x").includes("meta.scope.jinja.variable"));
  assert.ok(scopesOf(html, "x").includes("comment.block.html"));
  const js = await tokenizePjx("<script>\n// {{ c }}\n</script>");
  assert.ok(scopesOf(js, "c").includes("meta.scope.jinja.variable"));
  const css = await tokenizePjx("<style>\n/* {{ c }} */\n</style>");
  assert.ok(scopesOf(css, "c").includes("meta.scope.jinja.variable"));
});

test("a {#css block inside an HTML comment is still a block", async () => {
  const tokens = await tokenizePjx("<!-- old\n{#css\n.a { color: red; }\n#}\n-->\n<p></p>");
  assert.deepEqual(blocksOf(tokens), [{ keyword: "css", open_line: 2, close_line: 4 }]);
  assert.ok(scopesOf(tokens, "color").includes("support.type.property-name.css"));
  assert.ok(!scopesOf(tokens, "p").some((scope) => scope.startsWith("comment")));
});

test("{% raw %} inside an HTML comment is raw", async () => {
  const tokens = await tokenizePjx("<!-- {% raw %}{{ x }}{% endraw %} -->");
  assert.ok(!scopesOf(tokens, "x").includes("meta.scope.jinja.variable"));
});

test("an attribute name built with Jinja takes a normal value", async () => {
  for (const source of ['<div data-{{ k }}="v {{ w }}" x>', "<Card data-{{ k }}='v' x/>", '<div a-{% if x %}b{% endif %}="w">']) {
    const tokens = await tokenizePjx(source);
    assert.ok(!tokens.some((token) => token.scopes.some((scope) => scope.startsWith("invalid"))), source);
    const value = tokens.find((token) => token.text === "=");
    assert.ok(value?.scopes.includes("punctuation.separator.key-value.html"), source);
    const string = tokens.find((token) => token.text === "v " || token.text === "v" || token.text === "w");
    assert.ok(string?.scopes.some((scope) => scope.startsWith("string.quoted")), source);
    assert.ok(scopesOf(tokens, "x").some((scope) => scope.startsWith("entity.other.attribute-name")) || source.includes("{% if"));
  }
  assert.ok(scopesOf(await tokenizePjx('<div data-{{ k }}="v {{ w }}">'), "w").includes("meta.scope.jinja.variable"));
});
