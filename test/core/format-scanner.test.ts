import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

// Where the formatter used to read the text differently from the scanner, one row each
// (the numbers are the rows of docs/plans/2026-11-27-m4-scanner.md). [name, input, output];
// a null output is the input as it is.
const cases: [string, string, string | null][] = [
  ["1: a < that starts no tag", "<div>\n<p>a < b</p>\n<span>x</span>\n</div>", "<div>\n  <p>a < b</p>\n  <span>x</span>\n</div>\n"],
  [
    "2: Jinja with > inside a tag",
    "<div {% if a > b %}class=\"x\"{% endif %}><p>y</p></div>",
    "<div {% if a > b %}class=\"x\"{% endif %}>\n  <p>y</p>\n</div>\n",
  ],
  ["2: an expression with > as a value", "<div data-n={{ a > b }}><p>y</p></div>", "<div data-n={{ a > b }}>\n  <p>y</p>\n</div>\n"],
  [
    "3: a Jinja string holding > in a value",
    '<div class="{% if x == "a>b" %}on{% endif %}"><p>y</p></div>',
    '<div class="{% if x == "a>b" %}on{% endif %}">\n  <p>y</p>\n</div>\n',
  ],
  [
    "3: a Jinja string holding }} and a quote in a value",
    `<div a="{{ x or '}}"' }}"><p>y</p></div>`,
    `<div a="{{ x or '}}"' }}">\n  <p>y</p>\n</div>\n`,
  ],
  ["4: an unclosed {#python inside a tag", '<div{#python\n class="card">\n<p>x</p>\n</div>', null],
  ["5: an unquoted value ending in /", "<div><a href=/x/>t</a><p>y</p></div>", "<div>\n  <a href=/x/>t</a>\n  <p>y</p>\n</div>\n"],
  ["5: an unquoted value is not a self-close", "<div><Card a=x/><p>y</p></div>", null],
  ["6: <!--> is not an empty comment", "<div><!--><p>x</p></div>", null],
  ["8: <?xml ?> is text", '<?xml version="1.0"?>\n<div><p>x</p></div>', '<?xml version="1.0"?>\n<div>\n  <p>x</p>\n</div>\n'],
  ["9: </ div> closes nothing", "<div><p>x</p></ div>", null],
  [
    "10: </pre> in a Jinja string",
    '<div><pre>{{ "</pre>" }}</pre><p>x</p></div>',
    '<div>\n  <pre>{{ "</pre>" }}</pre>\n  <p>x</p>\n</div>\n',
  ],
  [
    "11: </script> in a Jinja string",
    '<div><script>var a = {{ "</script>" }};</script><p>x</p></div>',
    '<div>\n  <script>var a = {{ "</script>" }};</script>\n  <p>x</p>\n</div>\n',
  ],
  ["12: a legacy def that is not first is prose", "{# note #}\n{# def a: str #}\n<p>x</p>", "{# note #}\n{# def a: str #}\n<p>x</p>\n"],
  [
    "12: {# def is a keyword #} inside an element",
    "<div>\n{# def is a keyword #}\n<p>x</p>\n</div>",
    "<div>\n  {# def is a keyword #}\n  <p>x</p>\n</div>\n",
  ],
  ["12: an empty {#def #} that is not first", "<p>x</p>\n{#def #}\n<p>y</p>", "<p>x</p>\n{#def #}\n<p>y</p>\n"],
  [
    "13: an indented {#python is a comment",
    "<div>\n  {#python\n  x = 1\n  #}\n<p>x</p>\n</div>",
    "<div>\n  {#python\n  x = 1\n  #}\n  <p>x</p>\n</div>\n",
  ],
  [
    "13: {#python is nice #} is a comment",
    "<div>\n{#python is nice #}\n<p>x</p>\n</div>",
    "<div>\n  {#python is nice #}\n  <p>x</p>\n</div>\n",
  ],
  ["14: a second {#python block is an error", "{#python\nx = 1\n#}\n<div>\n{#python\ny = 2\n#}\n</div>", null],
  ["14: two {#def blocks are an error", "{#def a #}\n{#def b #}\n<p>y</p>", null],
  ["14: text after a closer is an error", "{#python\nx = 1\n#} <p></p>\n", null],
  ["15: a tag opened in {% raw %}", "{% raw %}<script>{% endraw %}\n<div><p>x</p></div>", null],
  ["15: a tag across the end of {% raw %}", '{% raw %}<a {% endraw %} href="x"><div><p>x</p></div>', null],
  [
    "17: a script closer must end its name",
    "<div><script>a</scripts>b</script><p>y</p></div>",
    "<div>\n  <script>a</scripts>b</script>\n  <p>y</p>\n</div>\n",
  ],
  [
    "19: another attribute with an apostrophe",
    `<Card title="it's" body="<p>x</p>"/>`,
    `<Card\n  title="it's"\n  body="\n    <p>x</p>\n  "\n/>\n`,
  ],
  [
    "20: a single-quoted value with a space",
    `<Card a='x y' body="<p>Hi</p>"/>`,
    `<Card\n  a='x y'\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  ],
  [
    "20: spaces around = of a single-quoted value",
    `<Card a = 'x' body="<p>Hi</p>"/>`,
    `<Card\n  a = 'x'\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  ],
  [
    "20: a #ref value with a space",
    `<Card #ref="a b" body="<p>Hi</p>"/>`,
    `<Card\n  #ref="a b"\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  ],
  [
    "21: Jinja between attributes, spaced",
    `<Card {% if a %} x="1" {% endif %} body="<p>Hi</p>"/>`,
    `<Card\n  {% if a %}\n  x="1"\n  {% endif %}\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  ],
  [
    "21: Jinja glued to an attribute",
    `<Card {% if a %}x="1"{% endif %} body="<p>Hi</p>"/>`,
    `<Card\n  {% if a %}x="1"{% endif %}\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  ],
  [
    "21: an expression as an attribute",
    `<Card {{ attrs }} body="<p>Hi</p>"/>`,
    `<Card\n  {{ attrs }}\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  ],
  [
    "21: Jinja between = and the quote",
    `<Card v={% if a %}"s" body="<p>Hi</p>"/>`,
    `<Card\n  v={% if a %}"s"\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  ],
  [
    "21: Jinja glued to the tag name",
    `<Card{{ x }} body="<p>Hi</p>"/>`,
    `<Card{{ x }}\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  ],
  ["22: alternating quotes", `<X body="<Card title='say "hi"'/>"/>`, `<X body="<Card title='say "hi"'/>"/>\n`],
];

for (const [name, input, output] of cases) {
  test(`scanner row ${name}`, () => {
    const expected = output ?? input;
    const result = formatPyjinhxTemplate(input);
    assert.equal(result, expected);
    assert.equal(formatPyjinhxTemplate(result), result, "idempotent");
  });
}

const solid = (text: string) => text.replace(/\s+/g, "");

test("the formatter moves whitespace and nothing else, on every row and slot test", () => {
  for (const [name, input] of cases) {
    assert.equal(solid(formatPyjinhxTemplate(input)), solid(input), name);
  }
});
