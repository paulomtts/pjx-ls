import { test } from "node:test";
import assert from "node:assert/strict";
import { defHeaderRange } from "../../src/core/regions.ts";

test("defHeaderRange returns correct range for header with no leading whitespace", () => {
  const text = "{# def foo(bar: str) #}<div></div>";
  const result = defHeaderRange(text);
  assert.ok(result !== null);
  assert.equal(result.start, 0);
  assert.equal(result.end, 23);
  assert.equal(text.slice(result.start, result.end), "{# def foo(bar: str) #}");
});

test("defHeaderRange returns correct range when text has leading whitespace/newlines", () => {
  const text = "\n\n  {# def x: int = 0 #}\n<div></div>";
  const result = defHeaderRange(text);
  assert.ok(result !== null);
  assert.equal(text.slice(result.start, result.end), "{# def x: int = 0 #}");
});

test("defHeaderRange returns null for a non-def comment", () => {
  const text = "{# just a comment #}<div></div>";
  const result = defHeaderRange(text);
  assert.equal(result, null);
});

test("defHeaderRange returns null when there is no header", () => {
  const text = "<div><p>Hello</p></div>";
  const result = defHeaderRange(text);
  assert.equal(result, null);
});

test("defHeaderRange finds whitespace-control variant {#- def ... -#}", () => {
  const text = "{#- def title: str -#}\n<h1>{{ title }}</h1>";
  const result = defHeaderRange(text);
  assert.ok(result !== null);
  assert.equal(text.slice(result.start, result.end), "{#- def title: str -#}");
});

test("defHeaderRange returns null when first content is not a Jinja block", () => {
  const text = "   some text {# def foo #}";
  const result = defHeaderRange(text);
  assert.equal(result, null);
});

test("defHeaderRange handles a multiline def header", () => {
  const text = "{# def\n  name: str,\n  age: int\n#}\n<div></div>";
  const result = defHeaderRange(text);
  assert.ok(result !== null);
  assert.equal(text.slice(result.start, result.end), "{# def\n  name: str,\n  age: int\n#}");
});

test("defHeaderRange finds the {#def form wherever it stands", () => {
  const text = "{#css\n.a {}\n#}\n{#def a: int #}\n<p></p>";
  const result = defHeaderRange(text);
  assert.equal(text.slice(result!.start, result!.end), "{#def a: int #}");
});
