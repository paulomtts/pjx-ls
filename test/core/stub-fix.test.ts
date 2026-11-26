import { test } from "node:test";
import assert from "node:assert/strict";
import { AutoStubs, needsStub, stubgenArgs } from "../../src/core/stub-fix.ts";

const missing = (path: string) => ({ path, code: "stub-missing" });
const stale = (path: string) => ({ path, code: "stub-stale" });

test("stubgen is run as a module on the documents", () => {
  assert.deepEqual(stubgenArgs("/w/a/a.pjx"), ["-m", "pyjinhx.stubgen", "/w/a/a.pjx"]);
  assert.deepEqual(stubgenArgs("/w/a.pjx", "/w/b.pjx"), ["-m", "pyjinhx.stubgen", "/w/a.pjx", "/w/b.pjx"]);
});

test("only pyjinhx's stub diagnostics get the fix", () => {
  assert.equal(needsStub({ source: "pyjinhx", code: "stub-missing" }), true);
  assert.equal(needsStub({ source: "pyjinhx", code: "stub-stale" }), true);
  assert.equal(needsStub({ source: "pyjinhx", code: "stub-handwritten" }), false);
  assert.equal(needsStub({ source: "other", code: "stub-missing" }), false);
  assert.equal(needsStub({}), false);
});

test("every document with a missing or stale stub is run for at once, once", () => {
  const auto = new AutoStubs();
  const diagnostics = [missing("/w/a.pjx"), stale("/w/b.pjx"), { path: "/w/c.pjx", code: "second-block" }, missing("/w/a.pjx")];
  assert.deepEqual(auto.next(diagnostics), ["/w/a.pjx", "/w/b.pjx"]);
  assert.deepEqual(auto.next(diagnostics), [], "in flight");
});

test("a document whose run did not clear the diagnostic waits for a save", () => {
  const auto = new AutoStubs();
  const diagnostics = [missing("/w/a.pjx")];
  auto.next(diagnostics);
  auto.finished(["/w/a.pjx"]);
  assert.deepEqual(auto.next(diagnostics), []);
  auto.saved("/w/a.pjx");
  assert.deepEqual(auto.next(diagnostics), ["/w/a.pjx"]);
});

test("a fixed document is forgotten, so its next stale stub is run for", () => {
  const auto = new AutoStubs();
  auto.next([missing("/w/a.pjx")]);
  auto.finished(["/w/a.pjx"]);
  assert.deepEqual(auto.next([]), []);
  assert.deepEqual(auto.next([stale("/w/a.pjx")]), ["/w/a.pjx"]);
});
