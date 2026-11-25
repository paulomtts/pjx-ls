import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

// Each case is [name, input, regions that must survive byte-for-byte].
const cases: [string, string, string[]][] = [
  [
    "script body with a comparison is not split",
    "<div>\n<script>\n  if (1 < 2) { go(); }\n</script>\n</div>",
    ["<script>\n  if (1 < 2) { go(); }\n</script>"],
  ],
  [
    'script string containing "</div>" is not a close tag',
    '<div>\n<script>\n  const s = "</div>";\n</script>\n<p>x</p>\n</div>',
    ['<script>\n  const s = "</div>";\n</script>'],
  ],
  [
    "style body is not collapsed",
    "<div>\n<style>\n.a > .b {\n    color: red;\n}\n</style>\n</div>",
    ["<style>\n.a > .b {\n    color: red;\n}\n</style>"],
  ],
  [
    "html comment does not open an element",
    "<div>\n<!-- a comment -->\n<p>x</p>\n</div>",
    ["<!-- a comment -->"],
  ],
  [
    "multi-line html comment keeps its inner layout",
    "<div>\n<!--\n   keep   <b>this\n-->\n</div>",
    ["<!--\n   keep   <b>this\n-->"],
  ],
  [
    "pre keeps its whitespace",
    "<div>\n<pre>\n  a\n     b <b>\n</pre>\n</div>",
    ["<pre>\n  a\n     b <b>\n</pre>"],
  ],
  [
    "textarea keeps its whitespace",
    "<div>\n<textarea>\n  <p>\n    raw\n</textarea>\n</div>",
    ["<textarea>\n  <p>\n    raw\n</textarea>"],
  ],
  [
    "jinja comment with markup inside",
    "<div>\n{# <div> if (a < b) #}\n</div>",
    ["{# <div> if (a < b) #}"],
  ],
  [
    "css block body is byte-identical",
    "{#css\n.a   >   .b {\n      color: red;\n}\n#}\n<p>x</p>",
    ["{#css\n.a   >   .b {\n      color: red;\n}\n#}"],
  ],
  [
    "js block body is byte-identical",
    '{#js\nif (1 < 2) {\n        f("</div>");\n}\n#}\n<p>x</p>',
    ['{#js\nif (1 < 2) {\n        f("</div>");\n}\n#}'],
  ],
  [
    "raw block is opaque",
    "<div>\n{% raw %}\n<b>  {{ not_jinja }}\n   {% if %}\n{% endraw %}\n</div>",
    ["{% raw %}\n<b>  {{ not_jinja }}\n   {% if %}\n{% endraw %}"],
  ],
];

for (const [name, input, regions] of cases) {
  test(`opaque: ${name}`, () => {
    const out = formatPyjinhxTemplate(input);
    for (const region of regions) {
      assert.ok(out.includes(region), `region mangled:\n${out}`);
    }
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
