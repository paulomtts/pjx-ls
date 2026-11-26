import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceUriOf, viewPath } from "../../src/core/view-uri.ts";

test("a view path ends in .html, so the HTML service takes it", () => {
  assert.ok(viewPath("file:///a/b.pjx").endsWith(".html"));
});

test("the source uri comes back from the path", () => {
  for (const uri of ["file:///a/b.pjx", "file:///my%20dir/100%25.pjx", "untitled:Untitled-1", "file:///a/b.html.pjx"]) {
    assert.equal(sourceUriOf(viewPath(uri)), uri);
  }
});
