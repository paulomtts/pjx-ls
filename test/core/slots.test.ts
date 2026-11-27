import { test } from "node:test";
import assert from "node:assert/strict";
import { isHtmlSlotValue } from "../../src/core/slots.ts";

test("isHtmlSlotValue trims before testing for '<'", () => {
  assert.equal(isHtmlSlotValue("\n  <p>Hi</p>\n"), true);
  assert.equal(isHtmlSlotValue("<PJXIcon name='x'/>"), true);
  assert.equal(isHtmlSlotValue("</div>"), true);
  assert.equal(isHtmlSlotValue("secondary"), false);
  assert.equal(isHtmlSlotValue("Click <here>"), false);
  assert.equal(isHtmlSlotValue("{{ t.add }}"), false);
});
