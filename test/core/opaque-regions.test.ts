import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

// Each case is [name, input, exact output]; opaque regions keep their bytes.
const cases: [string, string, string][] = [
  [
    "script body with a comparison is not split",
    "<div>\n<script>\n  if (1 < 2) { go(); }\n</script>\n</div>",
    "<div>\n  <script>\n  if (1 < 2) { go(); }\n</script>\n</div>\n",
  ],
  [
    'script string containing "</div>" is not a close tag',
    '<div>\n<script>\n  const s = "</div>";\n</script>\n<p>x</p>\n</div>',
    '<div>\n  <script>\n  const s = "</div>";\n</script>\n  <p>x</p>\n</div>\n',
  ],
  [
    "style body is not collapsed",
    "<div>\n<style>\n.a > .b {\n    color: red;\n}\n</style>\n</div>",
    "<div>\n  <style>\n.a > .b {\n    color: red;\n}\n</style>\n</div>\n",
  ],
  [
    "html comment does not open an element",
    "<div>\n<!-- a comment -->\n<p>x</p>\n</div>",
    "<div>\n  <!-- a comment -->\n  <p>x</p>\n</div>\n",
  ],
  [
    "multi-line html comment keeps its inner layout",
    "<div>\n<!--\n   keep   <b>this\n-->\n</div>",
    "<div>\n  <!--\n   keep   <b>this\n-->\n</div>\n",
  ],
  [
    "pre keeps its whitespace",
    "<div>\n<pre>\n  a\n     b <b>\n</pre>\n</div>",
    "<div>\n  <pre>\n  a\n     b <b>\n</pre>\n</div>\n",
  ],
  [
    "textarea keeps its whitespace",
    "<div>\n<textarea>\n  <p>\n    raw\n</textarea>\n</div>",
    "<div>\n  <textarea>\n  <p>\n    raw\n</textarea>\n</div>\n",
  ],
  [
    "jinja comment with markup inside",
    "<div>\n{# <div> if (a < b) #}\n</div>",
    "<div>\n  {# <div> if (a < b) #}\n</div>\n",
  ],
  [
    "css block body is byte-identical",
    "{#css\n.a   >   .b {\n      color: red;\n}\n#}\n<p>x</p>",
    "{#css\n.a   >   .b {\n      color: red;\n}\n#}\n<p>x</p>\n",
  ],
  [
    "js block body is byte-identical",
    '{#js\nif (1 < 2) {\n        f("</div>");\n}\n#}\n<p>x</p>',
    '{#js\nif (1 < 2) {\n        f("</div>");\n}\n#}\n<p>x</p>\n',
  ],
  [
    "raw block is opaque",
    "<div>\n{% raw %}\n<b>  {{ not_jinja }}\n   {% if %}\n{% endraw %}\n</div>",
    "<div>\n  {% raw %}\n<b>  {{ not_jinja }}\n   {% if %}\n{% endraw %}\n</div>\n",
  ],
  [
    "opaque regions nested two levels deep",
    "<section>\n<div>\n<pre>  a\nb</pre>\n<!-- c\n d -->\n</div>\n</section>",
    "<section>\n  <div>\n    <pre>  a\nb</pre>\n    <!-- c\n d -->\n  </div>\n</section>\n",
  ],
  [
    "pre inside a list item",
    "<ul>\n<li><pre>  a\n b</pre></li>\n</ul>",
    "<ul>\n  <li>\n    <pre>  a\n b</pre>\n  </li>\n</ul>\n",
  ],
];

for (const [name, input, expected] of cases) {
  test(`opaque: ${name}`, () => {
    const out = formatPyjinhxTemplate(input);
    assert.equal(out, expected);
    assert.equal(formatPyjinhxTemplate(out), out, "formatting must be idempotent");
  });
}

test("html comment does not shift indentation of what follows", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>\n<!-- c -->\n<p>x</p>\n</div>"),
    "<div>\n  <!-- c -->\n  <p>x</p>\n</div>\n",
  );
});

test("a close tag inside a script string does not unindent following markup", () => {
  const out = formatPyjinhxTemplate('<div>\n<script>f("</div>");</script>\n<p>x</p>\n</div>');
  assert.equal(out, '<div>\n  <script>f("</div>");</script>\n  <p>x</p>\n</div>\n');
});

test("an unterminated construct returns the text unchanged", () => {
  const input = "<div>\n<p>x</p>\n{# never closed\n<span>";
  assert.equal(formatPyjinhxTemplate(input), input);
});

test("an unterminated script or comment returns the text unchanged", () => {
  for (const input of ["<div>\n<script>\nif (a < b) {\n</div>", "<div>\n<!-- open\n<p>x</p>"]) {
    assert.equal(formatPyjinhxTemplate(input), input);
  }
});

test("a slot value holding an opaque region is kept verbatim and stable over 3 passes", () => {
  const input = '<div>\n<Card body="<div><pre>  a\n\n   b</pre></div>" />\n</div>';
  const once = formatPyjinhxTemplate(input);
  assert.equal(
    once,
    '<div>\n  <Card\n    body="<div><pre>  a\n\n   b</pre></div>"\n  />\n</div>\n',
  );
  const twice = formatPyjinhxTemplate(once);
  assert.equal(twice, once);
  assert.equal(formatPyjinhxTemplate(twice), once);
});

test("a slot value holding a script, comment or css block is not re-indented", () => {
  for (const slot of [
    "<div><script>\nif (a) {\n  go();\n}\n</script></div>",
    "<div><!--\n  keep\n--></div>",
    "<div>{#css\n.a {}\n#}</div>",
  ]) {
    const out = formatPyjinhxTemplate(`<Card body="${slot}" />`);
    assert.equal(out, `<Card\n  body="${slot}"\n/>\n`);
    assert.equal(formatPyjinhxTemplate(out), out);
  }
});

test("raw blocks with + or - whitespace control are opaque", () => {
  for (const [open, close] of [
    ["{%+ raw %}", "{% endraw %}"],
    ["{%- raw -%}", "{%- endraw -%}"],
    ["{% raw +%}", "{%+ endraw +%}"],
  ]) {
    const raw = `${open}\n  <b>  {{ x }}\n${close}`;
    assert.equal(formatPyjinhxTemplate(`<div>\n${raw}\n</div>`), `<div>\n  ${raw}\n</div>\n`);
  }
});

test("%} and }} inside a quoted jinja string do not end the tag", () => {
  assert.equal(
    formatPyjinhxTemplate('<div>\n{% set x = "%}" %}\n<p>{{ x }}</p>\n</div>'),
    '<div>\n  {% set x = "%}" %}\n  <p>{{ x }}</p>\n</div>\n',
  );
  assert.equal(
    formatPyjinhxTemplate("<div>\n{{ '}}' ~ y }}\n<p>x</p>\n</div>"),
    "<div>\n  {{ '}}' ~ y }}\n  <p>x</p>\n</div>\n",
  );
  assert.equal(
    formatPyjinhxTemplate('<div>\n{{ "a\\"}}" }}\n</div>'),
    '<div>{{ "a\\"}}" }}</div>\n',
  );
});

test("a pre-* or script-* custom element is not a raw text element", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>\n<pre-view>\n<p>x</p>\n</pre-view>\n</div>"),
    "<div>\n  <pre-view>\n    <p>x</p>\n  </pre-view>\n</div>\n",
  );
  assert.equal(
    formatPyjinhxTemplate('<div>\n<script-loader src="x"></script-loader>\n<p>x</p>\n</div>'),
    '<div>\n  <script-loader src="x"></script-loader>\n  <p>x</p>\n</div>\n',
  );
});
