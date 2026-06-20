import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("python-block injection grammar is valid and injects source.python", () => {
  const grammar = JSON.parse(
    readFileSync(root + "syntaxes/pyjinhx-injection-python-block.json", "utf8"),
  );
  assert.equal(grammar.scopeName, "pyjinhx.injection.python-block");
  const json = JSON.stringify(grammar);
  assert.match(json, /source\.python/);
  // closer must be a line-anchored #} so inline #} inside Python is safe
  assert.match(json, /\^\\\\s\*\(-\?#/);
});

test("package.json registers the python-block injection", () => {
  const pkg = JSON.parse(readFileSync(root + "package.json", "utf8"));
  const grammars = pkg.contributes.grammars;
  const entry = grammars.find((g: { scopeName: string; injectTo: string[] }) => g.scopeName === "pyjinhx.injection.python-block");
  assert.ok(entry, "python-block injection must be registered");
  assert.deepEqual(entry.injectTo, ["text.html.basic", "text.html.jinja", "text.pyjinhx"]);
});
