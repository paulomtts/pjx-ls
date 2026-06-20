import { test } from "node:test";
import assert from "node:assert/strict";
import { findDefHeaderRange } from "../../src/core/def-header.ts";

test("findDefHeaderRange returns correct range for header with no leading whitespace", () => {
  const text = "{# def foo(bar: str) #}<div></div>";
  const result = findDefHeaderRange(text);
  assert.ok(result !== null);
  assert.equal(result.start, 0);
  assert.equal(result.end, 23);
  assert.equal(text.slice(result.start, result.end), "{# def foo(bar: str) #}");
});

test("findDefHeaderRange returns correct range when text has leading whitespace/newlines", () => {
  const text = "\n\n  {# def x: int = 0 #}\n<div></div>";
  const result = findDefHeaderRange(text);
  assert.ok(result !== null);
  assert.equal(text.slice(result.start, result.end), "{# def x: int = 0 #}");
});

test("findDefHeaderRange returns null for a non-def comment", () => {
  const text = "{# just a comment #}<div></div>";
  const result = findDefHeaderRange(text);
  assert.equal(result, null);
});

test("findDefHeaderRange returns null when there is no header", () => {
  const text = "<div><p>Hello</p></div>";
  const result = findDefHeaderRange(text);
  assert.equal(result, null);
});

test("findDefHeaderRange finds whitespace-control variant {#- def ... -#}", () => {
  const text = "{#- def title: str -#}\n<h1>{{ title }}</h1>";
  const result = findDefHeaderRange(text);
  assert.ok(result !== null);
  assert.equal(text.slice(result.start, result.end), "{#- def title: str -#}");
});

test("findDefHeaderRange returns null when first content is not a Jinja block", () => {
  const text = "   some text {# def foo #}";
  const result = findDefHeaderRange(text);
  assert.equal(result, null);
});

test("findDefHeaderRange handles a multiline def header", () => {
  const text = "{# def\n  name: str,\n  age: int\n#}\n<div></div>";
  const result = findDefHeaderRange(text);
  assert.ok(result !== null);
  assert.equal(text.slice(result.start, result.end), "{# def\n  name: str,\n  age: int\n#}");
});
