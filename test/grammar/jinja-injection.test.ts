import { test } from "node:test";
import assert from "node:assert/strict";
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
