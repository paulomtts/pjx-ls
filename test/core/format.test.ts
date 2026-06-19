import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

test("end-to-end inline slot expansion adds trailing newline", () => {
  assert.equal(
    formatPyjinhxTemplate(`<Card body="<p>Hi</p>" />`),
    `<Card \nbody="\n  <p>Hi</p>\n" />\n`,
  );
});

test("already-canonical slot only gains a trailing newline", () => {
  assert.equal(
    formatPyjinhxTemplate(`<Card body="\n  <p>Hi</p>\n" />`),
    `<Card body="\n  <p>Hi</p>\n" />\n`,
  );
});

test("self-closing component with quoted interpolation survives intact", () => {
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
