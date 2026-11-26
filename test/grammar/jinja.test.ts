import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksOf } from "./blocks.ts";
import { assertSnapshot, dumpTokens } from "./snapshot.ts";
import { scopesOf, tokenizePjx } from "./tokenize.ts";

const PLACEHOLDER = "constant.character.format.placeholder.other.python";

const samples = {
  "jinja-variable": "<p>{{ url_for('x', id=item.id)|safe }}</p>",
  "jinja-for": "{% for item in items %}\n<li>{{ item }}</li>\n{% endfor %}",
  "jinja-whitespace-control": "{%- if on -%}\n<b></b>\n{%- endif -%}",
  "jinja-raw": "{% raw %}\n{{ not_a_var }} {# not a comment #}\n{#css\n#}\n{% endraw %}\n<p>{{ x }}</p>",
};

for (const [name, source] of Object.entries(samples)) {
  test(`golden ${name}`, async () => {
    assertSnapshot(name, dumpTokens(await tokenizePjx(source)));
  });
}

test("{{ }} is tokenized by the Jinja grammar, not as a Python placeholder", async () => {
  for (const source of Object.values(samples)) {
    for (const token of await tokenizePjx(source)) {
      assert.ok(!token.scopes.includes(PLACEHOLDER), `${token.text} in ${source}`);
    }
  }
  const tokens = await tokenizePjx("{{ item|safe }}");
  assert.ok(scopesOf(tokens, "{{").some((scope) => scope.startsWith("entity.other.jinja.delimiter")));
  assert.ok(scopesOf(tokens, "safe").some((scope) => scope.includes("jinja")));
});

test("nothing applies inside {% raw %}", async () => {
  const tokens = await tokenizePjx("{% raw %}{#css\n{{ x }}\n#}{% endraw %}");
  const inner = tokens.find((token) => token.text.includes("x"));
  assert.ok(inner);
  assert.ok(inner.scopes.includes("meta.scope.jinja.raw"));
  assert.ok(!inner.scopes.some((scope) => scope.startsWith("meta.block.") || scope.startsWith("comment.")));
});

test("{% raw %} and {% endraw %} are scoped like the Jinja grammar scopes them", async () => {
  const tokens = await tokenizePjx("{% raw %}x{% endraw %}");
  for (const word of ["raw", "endraw"]) {
    assert.ok(scopesOf(tokens, word).includes("keyword.control.jinja"), word);
  }
  const delimiters = tokens.filter((token) => token.text === "{%" || token.text === "%}");
  assert.equal(delimiters.length, 4);
  for (const token of delimiters) {
    assert.ok(token.scopes.includes("entity.other.jinja.delimiter.tag"), token.text);
  }
});

test("raw regions accept the + modifiers and keep blocks out", async () => {
  const tokens = await tokenizePjx("{%+ raw %}\n{#css\n#}\n{%+ endraw +%}\n<p></p>");
  assert.deepEqual(blocksOf(tokens), []);
  assert.ok(scopesOf(tokens, "{#css").includes("meta.scope.jinja.raw"));
});
