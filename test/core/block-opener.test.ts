import { test } from "node:test";
import assert from "node:assert/strict";
import { strayBraceAfterBlockOpener } from "../../src/core/block-opener.ts";

// "|" marks where the typed "#" landed; the text is the document after the keystroke.
const at = (marked: string) => {
  const offset = marked.indexOf("|");
  return strayBraceAfterBlockOpener(marked.replace("|", "#"), offset);
};

test("a # typed inside an auto-closed {} in markup removes the }", () => {
  assert.equal(at("<p></p>\n{|}\n<b></b>"), 10);
  assert.equal(at("{|}"), 2);
});

test("only a lone # between { and } counts", () => {
  assert.equal(at("{|"), null);
  assert.equal(at("|}"), null);
  assert.equal(at("{x|}"), null);
  assert.equal(strayBraceAfterBlockOpener("{a}", 1), null);
});

test("nothing happens inside a block body, script or style", () => {
  assert.equal(at("{#css\n.a {|}\n#}"), null);
  assert.equal(at("{#js\nconst o = {|}\n#}"), null);
  assert.equal(at("{#python\nx = {|}\n#}"), null);
  assert.equal(at("<script>\nconst o = {|}\n</script>"), null);
  assert.equal(at("<style>\n.a {|}\n</style>"), null);
});

test("after a block is closed, markup counts again", () => {
  assert.equal(at("{#css\n.a {}\n#}\n{|}"), 17);
  assert.equal(at("<style>a{}</style>\n{|}"), 21);
});
