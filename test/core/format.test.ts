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

test("a {# python #} block is preserved verbatim; only the body is formatted", () => {
  const input =
    "{# python\nclass Counter(BaseComponent):\n    n: int = 0  # inline #} stays\n#}\n<div><span>{{ n }}</span></div>\n";
  const out = formatPyjinhxTemplate(input);
  // block is untouched (including the inline #} and the Python indentation)
  assert.match(out, /\{# python\nclass Counter\(BaseComponent\):\n    n: int = 0  # inline #\} stays\n#\}\n/);
  // body below is reindented as usual
  assert.match(out, /<div>\n  <span>\{\{ n \}\}<\/span>\n<\/div>/);
});

test("a file with only a python block and no body round-trips", () => {
  const input = "{# python\nx = 1\n#}\n";
  assert.equal(formatPyjinhxTemplate(input), input);
});

test("inline whitespace between text and interpolation is preserved", () => {
  // the documented limitation, now fixed: significant spaces survive
  assert.equal(
    formatPyjinhxTemplate("<span>{{ remaining }} left</span>\n"),
    "<span>{{ remaining }} left</span>\n",
  );
  assert.equal(
    formatPyjinhxTemplate("<p>Hello {{ name }}, welcome back</p>\n"),
    "<p>Hello {{ name }}, welcome back</p>\n",
  );
  assert.equal(
    formatPyjinhxTemplate("<b>{{ a }} {{ b }}</b>\n"),
    "<b>{{ a }} {{ b }}</b>\n",
  );
});
