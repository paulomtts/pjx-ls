import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { embeddedBodies } from "../../src/core/embedded-format.ts";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

const bodiesOf = (text: string) => embeddedBodies(text).map((b) => [b.kind, text.slice(b.range.start, b.range.end), b.tagStart, b.skip]);
const kinds = (text: string) => embeddedBodies(text).map((b) => [b.kind, b.skip]);
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/templates/${name}`, import.meta.url)), "utf8");

test("a css and a js block after markup", () => {
  const text = "<p>x</p>\n{#css\n.a{}\n#}\n{#js\nlet a=1\n#}\n";
  assert.deepEqual(bodiesOf(text), [
    ["css", ".a{}\n", null, null],
    ["js", "let a=1\n", null, null],
  ]);
});

test("an indented closer stays out of the range", () => {
  const text = "{#css\n.a{}\n  #}\n";
  assert.deepEqual(bodiesOf(text), [["css", ".a{}\n", null, null]]);
});

test("closer on the body line, empty and blank bodies are no body", () => {
  assert.deepEqual(bodiesOf("{#css\n.a{}#}\n"), []);
  assert.deepEqual(bodiesOf("{#js\n#}\n"), []);
  assert.deepEqual(bodiesOf("{#js\n \n\n#}\n"), []);
});

test("a block body with Jinja is still a body", () => {
  assert.deepEqual(kinds("{#css\n.a{color:{{ x }}}\n{% if a %}\n#}\n"), [["css", null]]);
});

test("elements at depth 0 and nested, and a multi-line open tag", () => {
  const text = '<style>\n.a{}\n</style>\n<div>\n  <script\n    type="module"\n    defer>\nlet a=1\n</script></div>\n';
  const bodies = embeddedBodies(text);
  assert.deepEqual(bodies.map((b) => b.kind), ["css", "js"]);
  assert.equal(bodies[0].tagStart, 0);
  assert.equal(bodies[1].tagStart, text.indexOf("<script"));
  assert.equal(bodies[1].line, 5);
});

test("script types", () => {
  for (const open of ['<SCRIPT TYPE="Module">', '<script type="text/javascript">', "<script type=''>", "<script>"]) {
    assert.deepEqual(kinds(`${open}\nlet a=1\n</script>`), [["js", null]], open);
  }
  for (const open of ['<script type="application/json">', '<script type="importmap">', '<script type="text/x-template">', '<script type="{{ t }}">']) {
    assert.deepEqual(kinds(`${open}\nlet a=1\n</script>`), [], open);
  }
});

test("style types and lang", () => {
  assert.deepEqual(kinds('<style type="text/css" media="print">\n.a{}\n</style>'), [["css", null]]);
  assert.deepEqual(kinds('<style lang="scss">\n.a{}\n</style>'), []);
  assert.deepEqual(kinds('<style type="text/less">\n.a{}\n</style>'), []);
});

test("one-line and blank element bodies are no body", () => {
  assert.deepEqual(kinds("<script>go()</script>"), []);
  assert.deepEqual(kinds('<script src="x.js"></script>'), []);
  assert.deepEqual(kinds("<style>\n \n</style>"), []);
});

test("an element body with Jinja is skipped", () => {
  for (const jinja of ["{{ x }}", "{% if a %}", "{# note #}", "{{ x"]) {
    assert.deepEqual(kinds(`<script>\nlet a = ${jinja}\n</script>`), [["js", "it holds Jinja"]], jinja);
  }
});

test("raw, comments and slot values", () => {
  assert.deepEqual(kinds("{% raw %}<style>\n.a{}\n</style>{% endraw %}"), [["css", "it holds Jinja"]]);
  assert.deepEqual(kinds("<!-- <style>\n.a{}\n</style> -->"), []);
  assert.deepEqual(kinds('<Card body="<style>\n.a{}\n</style>"/>'), []);
});

test("the fixtures after the pjx rules", () => {
  const one = formatPyjinhxTemplate(fixture("18-css-js-blocks.pjx"));
  assert.deepEqual(kinds(one), [["css", null], ["js", null]]);
  const two = formatPyjinhxTemplate(fixture("19-style-script.pjx"));
  assert.deepEqual(kinds(two), [["css", null], ["js", null], ["js", "it holds Jinja"]]);
});
