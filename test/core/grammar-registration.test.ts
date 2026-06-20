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
  // `.pjx` (text.pyjinhx) is handled by the main grammar's own python-block rule,
  // so the injection only targets host HTML/Jinja files — avoids a double-definition
  // that let pyjinhx scopes bleed over the embedded `source.python` coloring.
  assert.deepEqual(entry.injectTo, ["text.html.basic", "text.html.jinja"]);
});

test("the main grammar owns the python block for .pjx files", () => {
  const grammar = JSON.parse(readFileSync(root + "syntaxes/pyjinhx.json", "utf8"));
  assert.ok(
    grammar.repository["pyjinhx-python-block"],
    "main grammar must define the python-block rule so source.python applies in .pjx",
  );
  const includes = grammar.patterns.map((p: { include: string }) => p.include);
  assert.ok(includes.includes("#pyjinhx-python-block"));
});

test("interpolation injection is fenced out of the python block", () => {
  const interp = JSON.parse(
    readFileSync(root + "syntaxes/pyjinhx-injection-interpolation.json", "utf8"),
  );
  // The block region carries scope `meta.pyjinhx-python-block`; the interpolation
  // injection must exclude it so `{{`-style coloring never overrides Python.
  assert.match(interp.injectionSelector, /-meta\.pyjinhx-python-block/);
});
