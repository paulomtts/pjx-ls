import { test } from "node:test";
import assert from "node:assert/strict";
import { ManifestError, overlay, parseManifest } from "../../src/core/manifest.ts";
import { manifestText, PROJECT } from "./fixture.ts";

const manifest = parseManifest(manifestText());
const path = (file: string) => `${PROJECT}/ui/${file}`;

test("components are found by tag and by path", () => {
  assert.equal(manifest.byTag("Badge")?.kind, "split");
  assert.equal(manifest.byTag("Nope"), undefined);
  assert.deepEqual(manifest.forPath(path("badge.pjx")).map((c) => c.tag), ["Badge"]);
  assert.deepEqual(manifest.forPath(path("badge.py")).map((c) => c.tag), ["Badge"]);
});

test("all four kinds are read", () => {
  const kinds = Object.fromEntries(manifest.components.map((c) => [c.tag, c.kind]));
  assert.deepEqual(kinds, { Alert: "template", Badge: "split", Broken: "template", Modal: "py-template", Panel: "pjx-python", Stale: "split", Tokens: "pjx-python" });
});

test("lines become 0-based and columns stay", () => {
  const tone = manifest.byTag("Badge")!.props.find((p) => p.name === "tone")!;
  assert.deepEqual(tone.range, { start: { line: 7, character: 4 }, end: { line: 7, character: 8 } });
  assert.deepEqual(tone.literalValues, ["calm", "late"]);
  assert.equal(tone.required, false);
  assert.equal(manifest.byTag("Badge")!.classInfo!.path, path("badge.py"));
});

test("slots, children and header props are read", () => {
  const alert = manifest.byTag("Alert")!;
  assert.equal(alert.props.find((p) => p.name === "body")!.slot, true);
  assert.equal(manifest.byTag("Modal")!.props.find((p) => p.name === "content")!.children, true);
  assert.deepEqual(manifest.byTag("Badge")!.members.map((m) => m.name), ["shout"]);
});

test("diagnostics and the stale header flag", () => {
  assert.equal(manifest.byTag("Stale")!.hasStaleDefHeader, true);
  assert.equal(manifest.byTag("Badge")!.hasStaleDefHeader, false);
  const [error] = manifest.diagnosticsFor(path("broken.pjx"));
  assert.equal(error.code, "second-block");
  assert.equal(error.severity, "error");
  assert.equal(error.range.start.line, 4);
});

test("unknown keys are ignored", () => {
  const json = JSON.parse(manifestText());
  json.future = 1;
  json.components[0].future = [1];
  assert.equal(parseManifest(JSON.stringify(json)).components.length, manifest.components.length);
});

test("another manifest_version, bad JSON and a non-manifest are refused", () => {
  const json = JSON.parse(manifestText());
  json.manifest_version = 2;
  assert.throws(() => parseManifest(JSON.stringify(json)), (e) => e instanceof ManifestError && e.kind === "version");
  assert.throws(() => parseManifest("Traceback"), (e) => e instanceof ManifestError && e.kind === "bad-output");
  assert.throws(() => parseManifest("[]"), (e) => e instanceof ManifestError && e.kind === "bad-output");
});

test("a buffer's manifest replaces the entries of its path only", () => {
  const buffer = JSON.parse(manifestText());
  buffer.components = buffer.components.filter((c: { tag: string }) => c.tag === "Alert");
  buffer.components[0].props = [];
  buffer.diagnostics = [{ path: path("alert.pjx"), range: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, severity: "warning", code: "x", message: "m" }];
  const merged = overlay(manifest, path("alert.pjx"), parseManifest(JSON.stringify(buffer)));
  assert.equal(merged.byTag("Alert")!.props.length, 0);
  assert.equal(merged.byTag("Badge")!.props.length, 3);
  assert.deepEqual(merged.diagnosticsFor(path("alert.pjx")).map((d) => d.code), ["x"]);
  assert.equal(merged.diagnosticsFor(path("broken.pjx")).length, 1);
  assert.equal(manifest.byTag("Alert")!.props.length, 3);
});
