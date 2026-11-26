import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackManifest } from "../../src/core/fallback-index.ts";

const file = (name: string, text: string) => ({ path: `/p/${name}`, text });

test("the tag comes from the file name, PascalCased", () => {
  const m = fallbackManifest([file("badge.pjx", "<b/>"), file("empty_state.pjx", "<p/>")]);
  assert.deepEqual(m.components.map((c) => c.tag), ["Badge", "EmptyState"]);
  assert.equal(m.byTag("EmptyState")!.documentPath, "/p/empty_state.pjx");
  assert.equal(m.byTag("Badge")!.kind, "template");
});

test("props come from the {#def header, with where each name is", () => {
  const text = '<i/>\n{#def tone: Literal["a", "b"] = "a", n: int, body: Slot = "" #}\n';
  const [c] = fallbackManifest([file("x.pjx", text)]).components;
  assert.deepEqual(c.props.map((p) => p.name), ["tone", "n", "body"]);
  assert.deepEqual(c.props.map((p) => p.required), [false, true, false]);
  assert.deepEqual(c.props[0].literalValues, ["a", "b"]);
  assert.equal(c.props[2].slot, true);
  assert.deepEqual(c.props[1].range, { start: { line: 1, character: 37 }, end: { line: 1, character: 38 } });
  assert.equal(c.props[0].default, '"a"');
});

test("commas inside brackets and strings do not split the header", () => {
  const [c] = fallbackManifest([file("x.pjx", '{#def a: dict[str, int] = {}, b: str = "x, y" #}')]).components;
  assert.deepEqual(c.props.map((p) => p.name), ["a", "b"]);
});

test("a document without a header has no props, and a bad stem is skipped", () => {
  const m = fallbackManifest([file("plain.pjx", "<p/>"), file("2bad.pjx", "<p/>"), file("not-a-tag.pjx", "")]);
  assert.deepEqual(m.components.map((c) => c.tag), ["Plain"]);
  assert.equal(m.components[0].props.length, 0);
});

test("there are no diagnostics", () => {
  assert.equal(fallbackManifest([file("a.pjx", "{#def x: int #}")]).diagnostics.length, 0);
});
