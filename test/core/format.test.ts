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

test("def header stays on its own line", () => {
  assert.equal(
    formatPyjinhxTemplate(
      `{#def conversation: str, title: str, active: bool = False #}\n<div class="x">\n<span>hi</span>\n</div>`,
    ),
    `{#def conversation: str, title: str, active: bool = False #}\n<div class="x">\n  <span>hi</span>\n</div>\n`,
  );
});
