import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { blockDiagnostics } from "../../src/core/python-diagnostics.ts";
import type { PythonServer, ServerDiagnostic } from "../../src/core/python-server.ts";
import { project } from "./helpers.ts";

// The diagnostics the server pushes for the text version it was last given.
async function diagnosticsFor(session: PythonServer, uri: string): Promise<ServerDiagnostic[]> {
  for (let i = 0; i < 100; i++) {
    const got = session.diagnostics(uri);
    if (got && got.version === session.versionOf(uri)) return got.items;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("no diagnostics for the current version");
}

// One line per item: 0-based line and columns, severity, code.
const show = (items: ServerDiagnostic[]) => items.map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${d.severity} ${d.code}`).sort();

test("standard: the optional access and the undefined name are errors on line 5", async () => {
  const { session, open } = project("standard");
  const { uri, view } = open("ui/bad.pjx");
  session.sync(uri, view.text);
  const items = await diagnosticsFor(session, uri);
  assert.deepEqual(show(items), ["5:19-5:24 1 reportOptionalMemberAccess", "5:28-5:35 1 reportUndefinedVariable"]);
  assert.equal(blockDiagnostics(items, view, []).length, 2);
  assert.ok(items.every((d) => d.range.start.line >= view.firstLine && d.range.end.line <= view.lastLine));
});

test("an unused parameter is a hint with the unnecessary tag, and stays", async () => {
  const { session, open } = project("standard");
  const { uri, view } = open("ui/card.pjx");
  session.sync(uri, view.text);
  const items = await diagnosticsFor(session, uri);
  assert.deepEqual(show(items), ["9:19-9:22 4 reportUnusedParameter"]);
  assert.deepEqual(items[0].tags, [1]);
});

test("off: nothing for bad.pjx, the hint stays on card.pjx", async () => {
  const { session, open } = project("off");
  const bad = open("ui/bad.pjx");
  const card = open("ui/card.pjx");
  session.sync(bad.uri, bad.view.text);
  session.sync(card.uri, card.view.text);
  assert.deepEqual(await diagnosticsFor(session, bad.uri), []);
  assert.deepEqual(show(await diagnosticsFor(session, card.uri)), ["9:19-9:22 4 reportUnusedParameter"]);
});

test("a project's own pyright configuration wins over the fallback", async () => {
  const { root, session, open } = project("strict");
  writeFileSync(join(root, "pyproject.toml"), '[tool.pyright]\ntypeCheckingMode = "off"\n');
  const { uri, view } = open("ui/bad.pjx");
  session.sync(uri, view.text);
  const codes = (await diagnosticsFor(session, uri)).map((d) => d.code);
  assert.ok(!codes.includes("reportOptionalMemberAccess"), codes.join());
});

test("an edit that removes the error clears it for the new version", async () => {
  const { session, open } = project("standard");
  const { uri, view, source } = open("ui/bad.pjx");
  session.sync(uri, view.text);
  await diagnosticsFor(session, uri);
  const fixed = open("ui/bad.pjx", () => source.replace(" + missing", "")).view;
  session.sync(uri, fixed.text);
  const codes = (await diagnosticsFor(session, uri)).map((d) => d.code);
  assert.ok(!codes.includes("reportUndefinedVariable"), codes.join());
  assert.ok(codes.includes("reportOptionalMemberAccess"));
});
