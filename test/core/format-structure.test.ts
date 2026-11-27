import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

test("nested block elements indent 2 spaces per level", () => {
  assert.equal(
    formatPyjinhxTemplate("<div><div><p>Hello world text content here</p></div></div>"),
    "<div>\n  <div>\n    <p>Hello world text content here</p>\n  </div>\n</div>\n",
  );
});

test("inline element keeps the source spacing between text and expr children", () => {
  assert.equal(
    formatPyjinhxTemplate("<p>Hello {{ name }} world</p>"),
    "<p>Hello {{ name }} world</p>\n",
  );
});

test("expr-only element stays inline", () => {
  assert.equal(formatPyjinhxTemplate("<span>{{ value }}</span>"), "<span>{{ value }}</span>\n");
});

test("self-closing tag does not change depth", () => {
  assert.equal(
    formatPyjinhxTemplate("<div><PJXDivider/></div>"),
    "<div>\n  <PJXDivider/>\n</div>\n",
  );
});

test("single-line open tag with element children keeps '>' attached", () => {
  assert.equal(
    formatPyjinhxTemplate('<div class="card" id="main" data-x="1"><span>{{ a }}</span></div>'),
    '<div class="card" id="main" data-x="1">\n  <span>{{ a }}</span>\n</div>\n',
  );
});

test("text glued to an element stays on one line", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>some leading text<span>child element here</span></div>"),
    "<div>\n  some leading text<span>child element here</span>\n</div>\n",
  );
});

test("jinja if block nests and dedents", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>{% if x %}{{ a }}{% endif %}</div>"),
    "<div>\n  {% if x %}{{ a }}{% endif %}\n</div>\n",
  );
});

test("if/elif/else mid tags realign to the if column", () => {
  const input =
    "<div>\n{% if a %}\n<span>A</span>\n{% elif b %}\n<span>B</span>\n{% else %}\n<span>C</span>\n{% endif %}\n</div>";
  assert.equal(
    formatPyjinhxTemplate(input),
    "<div>\n  {% if a %}\n    <span>A</span>\n  {% elif b %}\n    <span>B</span>\n  {% else %}\n    <span>C</span>\n  {% endif %}\n</div>\n",
  );
});

test("filter block open/close depth", () => {
  assert.equal(
    formatPyjinhxTemplate("{% filter upper %}\n<span>txt</span>\n{% endfilter %}"),
    "{% filter upper %}\n  <span>txt</span>\n{% endfilter %}\n",
  );
});

test("interpolation containing < and quotes is not mis-tokenized", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>\n{{ 'a' if x < y else 'b' }}\n</div>"),
    "<div>\n  {{ 'a' if x < y else 'b' }}\n</div>\n",
  );
});

test("a bare double-quote inside {{ }} in an attribute does not terminate the tag", () => {
  // The scanner lexes Jinja before tags: without that, the " inside the
  // interpolation would close the attribute and corrupt the tag.
  assert.equal(
    formatPyjinhxTemplate(`<div a="{{ x or "y" }}"><span>t</span></div>`),
    `<div a="{{ x or "y" }}">\n  <span>t</span>\n</div>\n`,
  );
});

test("macro and block nest one level, and a raw block stays opaque", () => {
  assert.equal(
    formatPyjinhxTemplate("{% macro foo() %} <span>x</span> {% endmacro %}"),
    "{% macro foo() %}\n  <span>x</span>\n{% endmacro %}\n",
  );
  assert.equal(
    formatPyjinhxTemplate("{% block content %} <span>x</span> {% endblock %}"),
    "{% block content %}\n  <span>x</span>\n{% endblock %}\n",
  );
  assert.equal(
    formatPyjinhxTemplate("{% raw %}<span>x</span>{% endraw %}"),
    "{% raw %}<span>x</span>{% endraw %}\n",
  );
});

test("unknown jinja tags (set, include) are depth-neutral", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>{% set x = 1 %}<span>y</span></div>"),
    "<div>\n  {% set x = 1 %}<span>y</span>\n</div>\n",
  );
  assert.equal(
    formatPyjinhxTemplate("<div>{% include 'p.html' %} <span>y</span></div>"),
    "<div>\n  {% include 'p.html' %}\n  <span>y</span>\n</div>\n",
  );
});

test("a non-def {# comment #} is depth-neutral", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>{# a comment #}<span>x</span></div>"),
    "<div>\n  {# a comment #}<span>x</span>\n</div>\n",
  );
});

test("empty input returned unchanged", () => {
  assert.equal(formatPyjinhxTemplate(""), "");
});

test("the > of a multi-line open tag stays where it was written", () => {
  const wrapped = '<form class="a"\n      hx-post="/x">\n<span>t</span>\n</form>';
  assert.equal(
    formatPyjinhxTemplate(wrapped),
    '<form class="a"\n      hx-post="/x">\n  <span>t</span>\n</form>\n',
  );
  const own = '<div\n  class="a"\n>\n<p>x</p>\n</div>';
  assert.equal(formatPyjinhxTemplate(own), '<div\n  class="a"\n>\n  <p>x</p>\n</div>\n');
  for (const input of [wrapped, own]) {
    const once = formatPyjinhxTemplate(input);
    assert.equal(formatPyjinhxTemplate(once), once);
  }
});

// An element written as open tag, content lines, close tag stays that way; any other shape
// is joined on one line.
const broken: [string, string, string][] = [
  [
    "a wrapped open tag and its text",
    '<button class="a"\n        {% if not n %}disabled{% endif %}>\n  Clear ({{ n }})\n</button>',
    '<button class="a"\n        {% if not n %}disabled{% endif %}>\n  Clear ({{ n }})\n</button>\n',
  ],
  ["a single line of text", "<button>\n  Clear\n</button>", "<button>\n  Clear\n</button>\n"],
  [
    "several lines of text",
    "<p>\n      Hello {{ name }},\n  welcome\n</p>",
    "<p>\n  Hello {{ name }},\n  welcome\n</p>\n",
  ],
  ["written on one line", "<p>Hello {{ name }}</p>", "<p>Hello {{ name }}</p>\n"],
  ["a break on one side only", "<span>\n  a</span>", "<span> a</span>\n"],
];

for (const [name, input, output] of broken) {
  test(`an element written over several lines: ${name}`, () => {
    assert.equal(formatPyjinhxTemplate(input), output);
    assert.equal(formatPyjinhxTemplate(output), output);
  });
}
