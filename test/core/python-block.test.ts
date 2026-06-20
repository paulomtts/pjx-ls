import { test } from "node:test";
import assert from "node:assert/strict";
import { findPythonBlock } from "../../src/core/python-block.ts";

test("returns null when there is no python block", () => {
  assert.equal(findPythonBlock("<div>{{ x }}</div>\n"), null);
});

test("finds a simple block and splits content from template", () => {
  const text = "{# python\nx = 1\n#}\n<p>{{ x }}</p>\n";
  const block = findPythonBlock(text);
  assert.ok(block);
  assert.equal(text.slice(block.contentStart, block.contentEnd), "x = 1\n");
  assert.equal(text.slice(block.afterClose), "<p>{{ x }}</p>\n");
  assert.equal(block.openLine, 0);
  assert.equal(block.closeLine, 2);
});

test("inline #} on a code line does not close the block", () => {
  const text = "{# python\nd = {}  # trailing #}\nclass C: ...\n#}\n<p></p>\n";
  const block = findPythonBlock(text);
  assert.ok(block);
  const content = text.slice(block.contentStart, block.contentEnd);
  assert.match(content, /d = \{\}/);
  assert.match(content, /class C: \.\.\./);
});

test("allows leading blank lines before the opener", () => {
  const block = findPythonBlock("\n\n{# python\nx = 1\n#}\n<p></p>\n");
  assert.ok(block);
  assert.equal(block.openLine, 2);
});

test("accepts whitespace-control opener and closer", () => {
  const block = findPythonBlock("{#- python\nx = 1\n-#}\n<p></p>\n");
  assert.ok(block);
});

test("returns null for an unterminated block (tolerant for live typing)", () => {
  assert.equal(findPythonBlock("{# python\nx = 1\n<p></p>\n"), null);
});

test("a non-python leading comment is not a block", () => {
  assert.equal(findPythonBlock("{# a normal comment #}\n<p></p>\n"), null);
});
