import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

test("a slotted tag explodes: attributes one-per-line, slot recursively formatted", () => {
  assert.equal(
    formatPyjinhxTemplate(`<Card body="<p>Hi</p>" />`),
    `<Card\n  body="\n    <p>Hi</p>\n  "\n/>\n`,
  );
});

test("slot explosion is idempotent (already-exploded input is a fixed point)", () => {
  const exploded = `<Card\n  body="\n    <p>Hi</p>\n  "\n/>\n`;
  assert.equal(formatPyjinhxTemplate(exploded), exploded);
});

test("all attributes explode once a slot is present", () => {
  assert.equal(
    formatPyjinhxTemplate(`<PJXButton variant="secondary" start="<PJXIcon name='plus'/>" center="{{ t.add }}"/>`),
    `<PJXButton\n  variant="secondary"\n  start="\n    <PJXIcon name='plus'/>\n  "\n  center="{{ t.add }}"\n/>\n`,
  );
});

test("a tag without an HTML slot stays on one line", () => {
  const input = `<SidebarItem active="{{ 'true' if a == b else 'false' }}" center="{{ title }}"/>`;
  assert.equal(formatPyjinhxTemplate(input), `${input}\n`);
});

test("def header is followed by a blank line separating it from the rest", () => {
  assert.equal(
    formatPyjinhxTemplate(
      `{#def conversation: str, title: str, active: bool = False #}\n<div class="x">\n<span>hi</span>\n</div>`,
    ),
    `{#def conversation: str, title: str, active: bool = False #}\n\n<div class="x">\n  <span>hi</span>\n</div>\n`,
  );
});

test("the blank line after a def header is idempotent (not doubled)", () => {
  const formatted = `{#def x: str #}\n\n<div class="x">\n  <span>hi</span>\n</div>\n`;
  assert.equal(formatPyjinhxTemplate(formatted), formatted);
});

test("no whitespace is introduced between inline siblings", () => {
  for (const input of [
    "<p>x{{ a }}y</p>",
  ]) {
    assert.equal(formatPyjinhxTemplate(input), `${input}\n`);
  }
  assert.equal(formatPyjinhxTemplate("<p>a<!-- c -->b</p>"), "<p>\n  a<!-- c -->b\n</p>\n");
  assert.equal(
    formatPyjinhxTemplate("<p>Hello <b>world</b>!</p>"),
    "<p>\n  Hello\n  <b>world</b>!\n</p>\n",
  );
});

test("whitespace between inline siblings is preserved as a break", () => {
  assert.equal(
    formatPyjinhxTemplate("<p>a <!-- c --> b</p>"),
    "<p>\n  a\n  <!-- c -->\n  b\n</p>\n",
  );
});

test("void elements do not open a level", () => {
  assert.equal(
    formatPyjinhxTemplate('<div>\n<br>\n<input type="x">\n<img src="a.png">\n<p>y</p>\n</div>'),
    '<div>\n  <br>\n  <input type="x">\n  <img src="a.png">\n  <p>y</p>\n</div>\n',
  );
});

test("{%- and {%+ block tags nest like plain ones", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>\n{%- if a -%}\n<b>y</b>\n{%- endif -%}\n{%+ for i in x %}\n<i>z</i>\n{%+ endfor %}\n</div>"),
    "<div>\n  {%- if a -%}\n    <b>y</b>\n  {%- endif -%}\n  {%+ for i in x %}\n    <i>z</i>\n  {%+ endfor %}\n</div>\n",
  );
});

test("set, with, call and filter blocks nest; inline set does not", () => {
  assert.equal(
    formatPyjinhxTemplate(
      "<div>\n{% set a %}\n<b>1</b>\n{% endset %}\n{% set b = 2 %}\n{% with c=3 %}\n<b>2</b>\n{% endwith %}\n{% call f() %}\n<b>3</b>\n{% endcall %}\n</div>",
    ),
    "<div>\n  {% set a %}\n    <b>1</b>\n  {% endset %}\n  {% set b = 2 %}\n  {% with c=3 %}\n    <b>2</b>\n  {% endwith %}\n  {% call f() %}\n    <b>3</b>\n  {% endcall %}\n</div>\n",
  );
});

test("unbalanced structure is returned unchanged", () => {
  for (const input of [
    '<section>\n{% if a %}\n<div class="a">\n{% else %}\n<div class="b">\n{% endif %}\n<p>x</p>\n</div>\n</section>',
    "<div>\n<p>x</p>",
    "<div>\n<p>x</p>\n</span>\n</div>",
    "<div>\n{% if a %}\n<p>x</p>\n</div>",
    "<p>x</p>\n</div>",
  ]) {
    assert.equal(formatPyjinhxTemplate(input), input);
  }
});

test("CRLF input keeps CRLF line endings and opaque bytes", () => {
  assert.equal(
    formatPyjinhxTemplate("<div>\r\n<p>x</p>\r\n<pre>\r\n  a\r\n</pre>\r\n</div>\r\n"),
    "<div>\r\n  <p>x</p>\r\n  <pre>\r\n  a\r\n</pre>\r\n</div>\r\n",
  );
});

test("an already formatted CRLF document is left alone", () => {
  const formatted = "<div>\r\n  <p>x</p>\r\n</div>\r\n";
  assert.equal(formatPyjinhxTemplate(formatted), formatted);
});

test("mixed line endings are returned unchanged", () => {
  const input = "<div>\r\n<p>x</p>\n</div>";
  assert.equal(formatPyjinhxTemplate(input), input);
});

test("glued inline tags stay on one line", () => {
  for (const input of [
    "<span>a</span><span>b</span>",
    "<b>x</b><i>y</i>",
    '<a href="#">{% if a %}<b>x</b>{% else %}<i>y</i>{% endif %}</a>',
  ]) {
    assert.equal(formatPyjinhxTemplate(input), `${input}\n`);
  }
  assert.equal(formatPyjinhxTemplate("<p><Icon/><Icon/></p>"), "<p>\n  <Icon/><Icon/>\n</p>\n");
});

test("glued block-level tags break onto their own lines", () => {
  assert.equal(
    formatPyjinhxTemplate("<div><div><p>a</p></div></div>"),
    "<div>\n  <div>\n    <p>a</p>\n  </div>\n</div>\n",
  );
});

test("an inline element glued to text keeps its place", () => {
  assert.equal(formatPyjinhxTemplate("<p>a<b>c</b>d</p>"), "<p>\n  a<b>c</b>d\n</p>\n");
});

test("spaces inside an inline element are kept", () => {
  assert.equal(formatPyjinhxTemplate("<p>Hello<b> world</b>!</p>"), "<p>\n  Hello<b> world</b>!\n</p>\n");
  assert.equal(formatPyjinhxTemplate("<p><b>world </b>again</p>"), "<p>\n  <b>world </b>again\n</p>\n");
});

test("a set block whose filter argument contains = is still a block", () => {
  assert.equal(
    formatPyjinhxTemplate('<div>\n{% set x | replace("a", "=") %}\n<b>y</b>\n{% endset %}\n</div>'),
    '<div>\n  {% set x | replace("a", "=") %}\n    <b>y</b>\n  {% endset %}\n</div>\n',
  );
});

test("a slotted tag glued to text is not exploded", () => {
  assert.equal(
    formatPyjinhxTemplate('<p>Hi<Card body="<b>x</b>" />!</p>'),
    '<p>\n  Hi<Card body="<b>x</b>" />!\n</p>\n',
  );
});
