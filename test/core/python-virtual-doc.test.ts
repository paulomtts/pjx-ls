import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPythonVirtualContent,
  isOffsetInPythonBlock,
} from "../../src/core/python-virtual-doc.ts";

const TEXT = "{# python\nx = 1\ny = 2\n#}\n<p>{{ x }}</p>\n";

test("blanks non-python lines and keeps python lines at the same line numbers", () => {
  const virt = buildPythonVirtualContent(TEXT);
  const lines = virt.split("\n");
  assert.equal(lines[0], ""); // opener blanked
  assert.equal(lines[1], "x = 1"); // python verbatim, same line index
  assert.equal(lines[2], "y = 2");
  assert.equal(lines[3], ""); // closer blanked
  assert.equal(lines[4], ""); // template blanked
});

test("returns empty string when there is no block", () => {
  assert.equal(buildPythonVirtualContent("<p>{{ x }}</p>\n"), "");
});

test("isOffsetInPythonBlock is true inside the content, false outside", () => {
  const insideX = TEXT.indexOf("x = 1") + 1;
  const inTemplate = TEXT.indexOf("<p>") + 1;
  const inOpener = 2;
  assert.equal(isOffsetInPythonBlock(TEXT, insideX), true);
  assert.equal(isOffsetInPythonBlock(TEXT, inTemplate), false);
  assert.equal(isOffsetInPythonBlock(TEXT, inOpener), false);
});
