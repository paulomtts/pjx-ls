import { test } from "node:test";
import assert from "node:assert/strict";
import { blockDiagnostics } from "../../src/core/python-diagnostics.ts";
import type { Range } from "../../src/core/manifest.ts";
import type { ServerDiagnostic } from "../../src/core/python-server.ts";

const view = { text: "", firstLine: 1, lastLine: 5 };
const range = (sl: number, sc: number, el: number, ec: number): Range => ({ start: { line: sl, character: sc }, end: { line: el, character: ec } });
const item = (r: Range, message = "m"): ServerDiagnostic => ({ range: r, message });

test("an item on a body line is kept; one outside is dropped", () => {
  const items = [item(range(3, 0, 3, 4), "in"), item(range(0, 0, 0, 4), "above"), item(range(6, 0, 6, 4), "below")];
  assert.deepEqual(blockDiagnostics(items, view, []).map((d) => d.message), ["in"]);
});

test("an item that starts in the body and ends outside is dropped", () => {
  assert.deepEqual(blockDiagnostics([item(range(5, 0, 6, 1))], view, []), []);
});

test("an item that overlaps a manifest range is dropped", () => {
  const manifest = [range(2, 0, 2, 10)];
  assert.deepEqual(blockDiagnostics([item(range(2, 0, 2, 10))], view, manifest), []);
  assert.deepEqual(blockDiagnostics([item(range(2, 5, 2, 6))], view, manifest), []);
  assert.deepEqual(blockDiagnostics([item(range(2, 3, 2, 3))], view, manifest), []);
});

test("an item that only touches a manifest range's end is kept", () => {
  assert.equal(blockDiagnostics([item(range(2, 10, 2, 12))], view, [range(2, 0, 2, 10)]).length, 1);
});

test("manifest ranges on other lines change nothing", () => {
  assert.equal(blockDiagnostics([item(range(3, 0, 3, 4))], view, [range(2, 0, 2, 10), range(4, 0, 4, 10)]).length, 1);
});

test("order is preserved", () => {
  const items = [item(range(4, 0, 4, 1), "b"), item(range(2, 0, 2, 1), "a")];
  assert.deepEqual(blockDiagnostics(items, view, []).map((d) => d.message), ["b", "a"]);
});
