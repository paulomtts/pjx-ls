import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManifest } from "../../src/core/manifest.ts";
import { definitionAt, nameCompletions } from "../../src/core/navigate.ts";
import { scan } from "../../src/core/regions.ts";
import { manifestText, PROJECT } from "./fixture.ts";

const manifest = parseManifest(manifestText());
const ui = (file: string) => `${PROJECT}/ui/${file}`;

function parts(marked: string) {
  const offset = marked.lastIndexOf("|");
  const text = marked.slice(0, offset) + marked.slice(offset + 1);
  return { text, scan: scan(text), offset };
}
const define = (marked: string, file = "page.pjx") => {
  const { text, scan, offset } = parts(marked);
  return definitionAt(manifest, ui(file), text, scan, offset);
};
const names = (marked: string, file: string) => {
  const { text, scan, offset } = parts(marked);
  return nameCompletions(manifest, ui(file), text, scan, offset).map((i) => i.label);
};

test("a class component's tag goes to its class", () => {
  const found = define("<Ba|dge label='x'/>")!;
  assert.equal(found.target.path, ui("badge.py"));
  assert.deepEqual(found.target.range.start, { line: 5, character: 6 });
  assert.deepEqual(found.origin, { start: 1, end: 6 });
});

test("a template component's tag goes to the document", () => {
  const found = define("<Al|ert/>")!;
  assert.equal(found.target.path, ui("alert.pjx"));
  assert.deepEqual(found.target.range.start, { line: 0, character: 0 });
});

test("Badge-header goes to Badge, from the component's part of the name", () => {
  const found = define("<Badge-he|ader/>")!;
  assert.equal(found.target.path, ui("badge.py"));
  assert.deepEqual(found.origin, { start: 1, end: 6 });
  assert.equal(define("<Badge-he|ader/>")?.origin.end, 6);
});

test("an attribute goes to its prop", () => {
  const found = define("<Badge to|ne='calm'/>")!;
  assert.equal(found.target.path, ui("badge.py"));
  assert.deepEqual(found.target.range.start, { line: 7, character: 4 });
  assert.equal(define("<Alert to|ne='info'/>")!.target.path, ui("alert.pjx"));
});

test("unknown tags, unknown attributes and plain HTML go nowhere", () => {
  assert.equal(define("<No|pe/>"), null);
  assert.equal(define("<Badge zz|z='1'/>"), null);
  assert.equal(define("<di|v/>"), null);
});

test("a name in {{ }} of a component's own document goes to its prop or member", () => {
  assert.deepEqual(define("<span>{{ la|bel }}</span>", "badge.pjx")!.target.range.start, { line: 6, character: 4 });
  assert.equal(define("{% if sho|ut %}{% endif %}", "badge.pjx")!.target.path, ui("badge.py"));
  assert.equal(define("{{ la|bel }}", "page.pjx"), null);
  assert.equal(define("{{ x.la|bel }}", "badge.pjx"), null);
});

test("props and members are offered at the start of an expression", () => {
  assert.deepEqual(names("{{ |", "badge.pjx"), ["label", "tone", "count", "shout"]);
  assert.deepEqual(names("{{ co|", "badge.pjx"), ["label", "tone", "count", "shout"]);
  assert.deepEqual(names("{% if |", "badge.pjx"), ["label", "tone", "count", "shout"]);
  assert.deepEqual(names("{{ a + |", "badge.pjx"), ["label", "tone", "count", "shout"]);
});

test("nothing else in Jinja is completed", () => {
  assert.deepEqual(names("{{ x.|", "badge.pjx"), []);
  assert.deepEqual(names("{{ x | |", "badge.pjx"), []);
  assert.deepEqual(names("{{ 'a|", "badge.pjx"), []);
  assert.deepEqual(names("{% i|f x %}", "badge.pjx"), []);
  assert.deepEqual(names("<p>|", "badge.pjx"), []);
  assert.deepEqual(names("{{ |", "page.pjx"), []);
});
