import { test } from "node:test";
import assert from "node:assert/strict";
import { scan, type Range } from "../../src/core/regions.ts";

const slice = (text: string, r: Range) => text.slice(r.start, r.end);

test("a tag has a name, a range and no attributes", () => {
  const text = "<p>hi</p>";
  const { tags } = scan(text);
  assert.deepEqual(tags.map((t) => [t.name, t.closing, slice(text, t.range)]), [
    ["p", false, "<p>"],
    ["p", true, "</p>"],
  ]);
});

test("PascalCase with a lowercase letter is a component", () => {
  const names = ["Card", "PJXButton", "Card2", "card", "DIV", "PJX", "A", "my-el"];
  const text = names.map((n) => `<${n}/>`).join("");
  assert.deepEqual(
    scan(text).tags.map((t) => t.component),
    [true, true, true, false, false, false, false, false],
  );
});

test("a closing tag of a component is a component", () => {
  assert.deepEqual(scan("<Card></Card>").tags.map((t) => t.component), [true, true]);
});

test("attributes keep name and value ranges", () => {
  const text = `<div class="a b" id='c' hidden data-n=3 title = "t">`;
  const [tag] = scan(text).tags;
  assert.deepEqual(
    tag.attributes.map((a) => [slice(text, a.nameRange), a.value && slice(text, a.value)]),
    [
      ["class", "a b"],
      ["id", "c"],
      ["hidden", null],
      ["data-n", "3"],
      ["title", "t"],
    ],
  );
});

test("a tag spans lines and reports self-closing", () => {
  const text = `<Card\n  a="1"\n/>`;
  const [tag] = scan(text).tags;
  assert.equal(tag.selfClosing, true);
  assert.equal(slice(text, tag.range), text);
  assert.equal(tag.attributes.length, 1);
});

test("an attribute value may hold > and Jinja", () => {
  const text = `<a title="x > y" href="{{ url }}" {% if on %}hidden{% endif %}>`;
  const [tag] = scan(text).tags;
  assert.deepEqual(tag.attributes.map((a) => slice(text, a.nameRange)), ["title", "href", "hidden"]);
  assert.equal(slice(text, tag.attributes[1].value!), "{{ url }}");
  assert.equal(slice(text, tag.range), text);
});

test("a lone < is text, not a tag", () => {
  assert.deepEqual(scan("a < b <3 </ x").tags, []);
});

test("an unclosed tag runs to the end of the text", () => {
  const text = `<div class="a`;
  const [tag] = scan(text).tags;
  assert.equal(slice(text, tag.range), text);
  assert.equal(slice(text, tag.attributes[0].value!), "a");
});

test("Jinja regions have kinds and ranges", () => {
  const text = "{{ a }}{% if b %}{# c #}x";
  assert.deepEqual(
    scan(text).regions.map((r) => [r.kind, slice(text, r)]),
    [
      ["expression", "{{ a }}"],
      ["statement", "{% if b %}"],
      ["comment", "{# c #}"],
    ],
  );
});

test("whitespace control markers belong to the region", () => {
  const text = "{{- a -}}{%- if b -%}{#- c -#}";
  assert.deepEqual(scan(text).regions.map((r) => r.kind), ["expression", "statement", "comment"]);
});

test("strings in a tag may hold delimiters", () => {
  const text = `{{ "}}" }}{% set a = '%}' %}`;
  assert.deepEqual(scan(text).regions.map((r) => slice(text, r)), [`{{ "}}" }}`, `{% set a = '%}' %}`]);
});

test("a raw region keeps its body and marks its delimiters", () => {
  const text = "{%+ raw -%}{{ x }}{#{%- endraw +%}";
  const [raw] = scan(text).regions;
  assert.equal(raw.kind, "raw");
  assert.equal(slice(text, raw), text);
  assert.equal(slice(text, raw.body!), "{{ x }}{#");
});

test("a raw region is one region, and plain text to the html scan", () => {
  const { regions, tags } = scan("{% raw %}<b>{{ x }}</b>{% endraw %}<i>");
  assert.deepEqual(regions.map((r) => r.kind), ["raw"]);
  assert.deepEqual(tags.map((t) => t.name), ["b", "b", "i"]);
});

test("an unclosed delimiter swallows the rest of the text", () => {
  const text = "<p>{{ a\n<b>";
  const { regions, tags } = scan(text);
  assert.deepEqual(regions.map((r) => [r.kind, slice(text, r)]), [["expression", "{{ a\n<b>"]]);
  assert.deepEqual(tags.map((t) => t.name), ["p"]);
});

test("html comments hide tags", () => {
  const text = "<!-- <b> -->\n<i><!-- open";
  const { htmlComments, tags } = scan(text);
  assert.deepEqual(htmlComments.map((r) => slice(text, r)), ["<!-- <b> -->", "<!-- open"]);
  assert.deepEqual(tags.map((t) => t.name), ["i"]);
});

test("script and style bodies are embedded and not scanned for tags", () => {
  const text = `<script>if (a < b) { x = "<i>"; }</script><STYLE>a > b {}</STYLE>`;
  const { embedded, tags } = scan(text);
  assert.deepEqual(
    embedded.map((e) => [e.tag, slice(text, e.body)]),
    [
      ["script", `if (a < b) { x = "<i>"; }`],
      ["style", "a > b {}"],
    ],
  );
  assert.deepEqual(tags.map((t) => t.name), ["script", "script", "STYLE", "STYLE"]);
});

test("an unclosed script body runs to the end", () => {
  const text = "<script>a";
  assert.equal(slice(text, scan(text).embedded[0].body), "a");
});

test("a Jinja comment in a script body is a region, not script text", () => {
  const text = "<script>x{# </script> #}y</script>";
  const { embedded, regions } = scan(text);
  assert.deepEqual(regions.map((r) => r.kind), ["comment"]);
  assert.equal(slice(text, embedded[0].body), "x{# </script> #}y");
});

test("blocks carry opener, body and closer ranges", () => {
  const text = "<p></p>\n{#css\n.a {}\n#}\n";
  const [block] = scan(text).blocks;
  assert.equal(slice(text, block.opener), "{#css");
  assert.equal(slice(text, block.body), ".a {}\n");
  assert.equal(slice(text, block.closer), "#}");
  assert.deepEqual([block.openLine, block.bodyLines, block.closeLine], [2, [3, 3], 4]);
});

test("a def block's body is its signature", () => {
  const text = "{#def a: int #}\n<p></p>";
  const [block] = scan(text).blocks;
  assert.equal(block.keyword, "def");
  assert.equal(slice(text, block.body), " a: int ");
  assert.equal(block.bodyLines, null);
});

test("a css opener may follow markup on its line", () => {
  const text = "<p>{#css\n.a {}\n#}";
  assert.equal(scan(text).blocks[0].keyword, "css");
});

test("CRLF: lines count the same and a trailing CR is blank", () => {
  const text = "{#python\r\nx = 1\r\n#}\r\n<p/>\r\n{#js\r\nf();\r\n#}\r\n";
  const { blocks, error } = scan(text);
  assert.equal(error, null);
  assert.deepEqual(blocks.map((b) => [b.keyword, b.openLine, b.closeLine]), [
    ["python", 1, 3],
    ["js", 5, 7],
  ]);
  assert.equal(slice(text, blocks[0].body), "x = 1\r\n");
});

test("a block is not reported when the document has an error", () => {
  const { blocks, error } = scan("{#css\na\n#}\n{#css\nb\n#}\n");
  assert.deepEqual(blocks, []);
  assert.deepEqual(error, { code: "second-block", line: 4 });
});
