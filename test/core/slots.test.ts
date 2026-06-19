import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatSlottedPascalTags,
  isHtmlSlotValue,
  splitHtmlFragments,
} from "../../src/core/slots.ts";

test("inline HTML slot value is expanded onto its own lines", () => {
  assert.equal(
    formatSlottedPascalTags(`<PJXButton start="<PJXIcon name='plus'/>">Add</PJXButton>`),
    `<PJXButton \nstart="\n  <PJXIcon name='plus'/>\n">Add</PJXButton>`,
  );
});

test("plain string attribute is left untouched", () => {
  assert.equal(
    formatSlottedPascalTags(`<PJXButton variant="secondary">Add</PJXButton>`),
    `<PJXButton variant="secondary">Add</PJXButton>`,
  );
});

test("non-'<' leading text is not treated as HTML", () => {
  assert.equal(
    formatSlottedPascalTags(`<PJXButton label="Click <here>">Add</PJXButton>`),
    `<PJXButton label="Click <here>">Add</PJXButton>`,
  );
});

test("already-canonical slot value triggers the idempotency guard (no change)", () => {
  // content === formattedContent path: value already equals its canonical form.
  const input = `<Card body="\n  <p>Hi</p>\n" />`;
  assert.equal(formatSlottedPascalTags(input), input);
});

test("isHtmlSlotValue trims before testing for '<'", () => {
  assert.equal(isHtmlSlotValue("\n  <p>Hi</p>\n"), true);
  assert.equal(isHtmlSlotValue("secondary"), false);
  assert.equal(isHtmlSlotValue("Click <here>"), false);
  assert.equal(isHtmlSlotValue("</div>"), true);
});

test("splitHtmlFragments splits on '><' boundaries", () => {
  assert.deepEqual(splitHtmlFragments("<a/><b/>"), ["<a/>", "<b/>"]);
});
