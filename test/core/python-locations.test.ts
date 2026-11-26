import { test } from "node:test";
import assert from "node:assert/strict";
import { toSource } from "../../src/core/python-locations.ts";
import type { Range } from "../../src/core/manifest.ts";

const range: Range = { start: { line: 8, character: 6 }, end: { line: 8, character: 13 } };
const MARKER = "# pyjinhx.stubgen: generated from item_row.pjx; do not edit";
const LATER = `# a comment\n{% if x %}\n${MARKER}\nclass A: ...\n`;

test("a stub that stubgen wrote maps to its .pjx at the same range", () => {
  const got = toSource({ uri: "file:///p/ui/item_row.pyi", range }, () => MARKER);
  assert.deepEqual(got, { uri: "file:///p/ui/item_row.pjx", range });
});

test("the marker may be on any line, as stubgen's own check allows", () => {
  assert.equal(toSource({ uri: "file:///p/ui/item_row.pyi", range }, () => LATER).uri, "file:///p/ui/item_row.pjx");
  assert.equal(toSource({ uri: "file:///p/a.pyi", range }, () => "x = 1  # pyjinhx.stubgen: generated from a.pjx; do not edit").uri, "file:///p/a.pyi");
});

test("the file name in the marker is used, not the stub's stem", () => {
  const marker = "# pyjinhx.stubgen: generated from other.pjx; do not edit";
  assert.equal(toSource({ uri: "file:///p/ui/item_row.pyi", range }, () => marker).uri, "file:///p/ui/other.pjx");
});

test("a hand-written .pyi, a .py and an unreadable file are unchanged", () => {
  const cases: [string, string | undefined][] = [
    ["file:///p/a.pyi", "class A: ..."],
    ["file:///p/a.py", MARKER],
    ["file:///p/b.pyi", undefined],
  ];
  for (const [uri, first] of cases) assert.deepEqual(toSource({ uri, range }, () => first), { uri, range });
});

test("a directory in the stub's URI is kept, and a percent-encoded one too", () => {
  assert.equal(toSource({ uri: "file:///my%20dir/item_row.pyi", range }, () => MARKER).uri, "file:///my%20dir/item_row.pjx");
});
