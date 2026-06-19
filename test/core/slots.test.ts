import { test } from "node:test";
import assert from "node:assert/strict";
import { isHtmlSlotValue, readDoubleQuotedContent } from "../../src/core/slots.ts";

test("isHtmlSlotValue trims before testing for '<'", () => {
  assert.equal(isHtmlSlotValue("\n  <p>Hi</p>\n"), true);
  assert.equal(isHtmlSlotValue("<PJXIcon name='x'/>"), true);
  assert.equal(isHtmlSlotValue("</div>"), true);
  assert.equal(isHtmlSlotValue("secondary"), false);
  assert.equal(isHtmlSlotValue("Click <here>"), false);
  assert.equal(isHtmlSlotValue("{{ t.add }}"), false);
});

test("readDoubleQuotedContent reads up to the closing quote", () => {
  const text = `x="hello" y="bar"`;
  const parsed = readDoubleQuotedContent(text, text.indexOf('"'));
  assert.equal(parsed?.content, "hello");
});

test("readDoubleQuotedContent skips single quotes inside the value", () => {
  const text = `start="<PJXIcon name='plus'/>" rest`;
  const parsed = readDoubleQuotedContent(text, text.indexOf('"'));
  assert.equal(parsed?.content, "<PJXIcon name='plus'/>");
});

test("readDoubleQuotedContent skips a double quote nested inside {{ }}", () => {
  const text = `a="{{ f(\"y\") }}" b="bar"`;
  const parsed = readDoubleQuotedContent(text, text.indexOf('"'));
  assert.equal(parsed?.content, `{{ f("y") }}`);
});
