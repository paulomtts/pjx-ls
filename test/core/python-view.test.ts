import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { inBody, pythonView, rangeInBody } from "../../src/core/python-view.ts";

const lines = (s: string) => s.split("\n");

test("everything outside the body is blanked, same lines and columns", () => {
  const view = pythonView("{#python\nx = 1\n#}\n<p>{{ x }}</p>\n");
  assert.deepEqual(view, { text: "        \nx = 1\n  \n              \n", firstLine: 1, lastLine: 1 });
});

test("CRLF survives and the line count is unchanged", () => {
  const source = "{#python\r\nx = 1\r\n#}\r\n<p></p>\r\n";
  const view = pythonView(source);
  assert.ok(view);
  assert.equal(view.text.split("\n").length, source.split("\n").length);
  assert.equal(view.text.split("\r\n").length, source.split("\r\n").length);
  assert.ok(view.text.includes("x = 1\r\n"));
});

test("body lines are byte-identical and the others are blank", () => {
  const source = "<div>\n{#python\na = 1\n\nb = 'é'\n#}\n<p>{{ a }}</p>\n";
  const view = pythonView(source);
  assert.ok(view);
  lines(source).forEach((line, i) => {
    const got = lines(view.text)[i];
    if (inBody(view, i)) assert.equal(got, line);
    else assert.match(got, /^ *\r?$/);
  });
});

test("a byte order mark becomes a blank", () => {
  const view = pythonView("﻿{#python\nx = 1\n#}\n");
  assert.ok(view);
  assert.ok(!view.text.includes("﻿"));
});

for (const [name, source] of Object.entries({
  "no block": "<p></p>\n",
  "css only": "{#css\na { color: red }\n#}\n",
  "def and python": "{#def a: int #}\n{#python\nx = 1\n#}\n",
  unclosed: "{#python\nx = 1\n",
  "empty body": "{#python\n#}\n",
  "block error": "{#python\nx = 1\n#}\n{#python\ny = 2\n#}\n",
})) {
  test(`null for ${name}`, () => assert.equal(pythonView(source), null));
}

test("inBody is true on both end lines and false one line outside", () => {
  const view = { text: "", firstLine: 2, lastLine: 5 };
  assert.deepEqual([1, 2, 5, 6].map((n) => inBody(view, n)), [false, true, true, false]);
});

test("rangeInBody needs both ends on body lines", () => {
  const view = { text: "", firstLine: 2, lastLine: 5 };
  const r = (a: number, b: number) => ({ start: { line: a }, end: { line: b } });
  assert.deepEqual([r(2, 5), r(3, 3), r(1, 3), r(5, 6), r(0, 9)].map((x) => rangeInBody(view, x)), [true, true, false, false, false]);
});

const corpus = fileURLToPath(new URL("../fixtures/pyjinhx/corpus/", import.meta.url));
for (const file of globSync("python_*.pjx", { cwd: corpus }).sort()) {
  const name = basename(file, ".pjx");
  test(`corpus: ${name}`, () => {
    const expected = JSON.parse(readFileSync(corpus + name + ".json", "utf8"));
    if ("known_gap" in expected || expected.error) return;
    const block = expected.blocks.find((b: { keyword: string }) => b.keyword === "python");
    const view = pythonView(readFileSync(corpus + file, "utf8").replace(/^﻿/, ""));
    if (!block?.body_lines || expected.blocks.some((b: { keyword: string }) => b.keyword === "def")) return assert.equal(view, null);
    assert.ok(view);
    assert.deepEqual([view.firstLine + 1, view.lastLine + 1], block.body_lines);
  });
}
