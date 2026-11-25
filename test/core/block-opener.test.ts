import { test } from "node:test";
import assert from "node:assert/strict";
import { BraceTracker, strayBraceAfterBlockOpener } from "../../src/core/block-opener.ts";

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

test("tag mentions in HTML comments, Jinja comments and raw regions are not code", () => {
  assert.equal(at("<!-- add a <script> tag here -->\n{|}"), 36);
  assert.equal(at("{% raw %}<script>{% endraw %}\n{|}"), 32);
  assert.equal(at("{# a <style> note #}\n{|}"), 24);
  assert.equal(at("<!-- note\n{|}"), 13);
  assert.equal(at("<!-- x --><script>\n{|}"), null);
});

test("a pjx block opener inside a Jinja-looking comment pattern still counts as code", () => {
  assert.equal(at("{#css\n.a {}\n{|}"), null);
});

const keystroke = (offset: number, text: string, rangeLength = 0) => ({ offset, text, rangeLength });

test("only a } the editor just auto-inserted is removed", () => {
  const tracker = new BraceTracker();
  assert.equal(tracker.onChange(keystroke(0, "{}"), "{}"), null);
  assert.equal(tracker.onChange(keystroke(1, "#"), "{#}"), 2);
});

test("a } that was typed or already there stays", () => {
  const typed = new BraceTracker();
  typed.onChange(keystroke(0, "{"), "{");
  typed.onChange(keystroke(1, "}"), "{}");
  assert.equal(typed.onChange(keystroke(1, "#"), "{#}"), null);
  const existing = new BraceTracker();
  assert.equal(existing.onChange(keystroke(3, "#"), "<p>{#}</p>"), null);
});

test("any other change clears the memory", () => {
  const tracker = new BraceTracker();
  tracker.onChange(keystroke(0, "{}"), "{}");
  tracker.onChange(keystroke(1, "x"), "{x}");
  assert.equal(tracker.onChange(keystroke(2, "#"), "{x#}"), null);
  const moved = new BraceTracker();
  moved.onChange(keystroke(0, "{}"), "{}");
  assert.equal(moved.onChange(keystroke(5, "#"), "{}   {#}"), null);
});
