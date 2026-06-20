import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHtmlStructure } from "../../src/core/html-structure.ts";

test("nested block elements indent 2 spaces per level", () => {
  assert.equal(
    formatHtmlStructure("<div><div><p>Hello world text content here</p></div></div>"),
    "<div>\n  <div>\n    <p>Hello world text content here</p>\n  </div>\n</div>\n",
  );
});

test("inline element preserves significant spaces around interpolations", () => {
  assert.equal(
    formatHtmlStructure("<p>Hello {{ name }} world</p>"),
    "<p>Hello {{ name }} world</p>\n",
  );
});

test("expr-only element stays inline", () => {
  assert.equal(formatHtmlStructure("<span>{{ value }}</span>"), "<span>{{ value }}</span>\n");
});

test("self-closing tag does not change depth", () => {
  assert.equal(
    formatHtmlStructure("<div><PJXDivider/></div>"),
    "<div>\n  <PJXDivider/>\n</div>\n",
  );
});

test("single-line open tag with element children keeps '>' attached", () => {
  assert.equal(
    formatHtmlStructure('<div class="card" id="main" data-x="1"><span>{{ a }}</span></div>'),
    '<div class="card" id="main" data-x="1">\n  <span>{{ a }}</span>\n</div>\n',
  );
});

test("mixed text + element children go block", () => {
  assert.equal(
    formatHtmlStructure("<div>some leading text<span>child element here</span></div>"),
    "<div>\n  some leading text\n  <span>child element here</span>\n</div>\n",
  );
});

test("jinja if block nests and dedents", () => {
  assert.equal(
    formatHtmlStructure("<div>{% if x %}{{ a }}{% endif %}</div>"),
    "<div>\n  {% if x %}\n    {{ a }}\n  {% endif %}\n</div>\n",
  );
});

test("if/elif/else mid tags realign to the if column", () => {
  const input =
    "<div>\n{% if a %}\n<span>A</span>\n{% elif b %}\n<span>B</span>\n{% else %}\n<span>C</span>\n{% endif %}\n</div>";
  assert.equal(
    formatHtmlStructure(input),
    "<div>\n  {% if a %}\n    <span>A</span>\n  {% elif b %}\n    <span>B</span>\n  {% else %}\n    <span>C</span>\n  {% endif %}\n</div>\n",
  );
});

test("filter block open/close depth", () => {
  assert.equal(
    formatHtmlStructure("{% filter upper %}\n<span>txt</span>\n{% endfilter %}"),
    "{% filter upper %}\n  <span>txt</span>\n{% endfilter %}\n",
  );
});

test("interpolation containing < and quotes is not mis-tokenized", () => {
  assert.equal(
    formatHtmlStructure("<div>\n{{ 'a' if x < y else 'b' }}\n</div>"),
    "<div>{{ 'a' if x < y else 'b' }}</div>\n",
  );
});

test("a bare double-quote inside {{ }} in an attribute does not terminate the tag", () => {
  // Locks the {{ }}-skip in readQuotedString: without it, the " inside the
  // interpolation would close the attribute and corrupt the tag.
  assert.equal(
    formatHtmlStructure(`<div a="{{ x or "y" }}"><span>t</span></div>`),
    `<div a="{{ x or "y" }}">\n  <span>t</span>\n</div>\n`,
  );
});

test("macro block raw open keywords each nest depth +1", () => {
  assert.equal(
    formatHtmlStructure("{% macro foo() %}<span>x</span>{% endmacro %}"),
    "{% macro foo() %}\n  <span>x</span>\n{% endmacro %}\n",
  );
  assert.equal(
    formatHtmlStructure("{% block content %}<span>x</span>{% endblock %}"),
    "{% block content %}\n  <span>x</span>\n{% endblock %}\n",
  );
  assert.equal(
    formatHtmlStructure("{% raw %}<span>x</span>{% endraw %}"),
    "{% raw %}\n  <span>x</span>\n{% endraw %}\n",
  );
});

test("unknown jinja tags (set, include) are depth-neutral", () => {
  assert.equal(
    formatHtmlStructure("<div>{% set x = 1 %}<span>y</span></div>"),
    "<div>\n  {% set x = 1 %}\n  <span>y</span>\n</div>\n",
  );
  assert.equal(
    formatHtmlStructure("<div>{% include 'p.html' %}<span>y</span></div>"),
    "<div>\n  {% include 'p.html' %}\n  <span>y</span>\n</div>\n",
  );
});

test("a non-def {# comment #} is depth-neutral", () => {
  assert.equal(
    formatHtmlStructure("<div>{# a comment #}<span>x</span></div>"),
    "<div>\n  {# a comment #}\n  <span>x</span>\n</div>\n",
  );
});

test("empty input returned unchanged", () => {
  assert.equal(formatHtmlStructure(""), "");
});
