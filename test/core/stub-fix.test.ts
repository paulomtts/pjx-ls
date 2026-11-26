import { test } from "node:test";
import assert from "node:assert/strict";
import { needsStub, stubgenArgs } from "../../src/core/stub-fix.ts";

test("stubgen is run as a module on the one document", () => {
  assert.deepEqual(stubgenArgs("/w/a/a.pjx"), ["-m", "pyjinhx.stubgen", "/w/a/a.pjx"]);
});

test("only pyjinhx's stub-missing diagnostic gets the fix", () => {
  assert.equal(needsStub({ source: "pyjinhx", code: "stub-missing" }), true);
  assert.equal(needsStub({ source: "pyjinhx", code: "second-block" }), false);
  assert.equal(needsStub({ source: "other", code: "stub-missing" }), false);
  assert.equal(needsStub({}), false);
});
