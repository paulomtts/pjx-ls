import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isComponentTemplate, TEMPLATE_SELECTOR, type TemplateDocumentLike } from "../../src/vscode/config.ts";

const make = (over: Partial<TemplateDocumentLike> = {}): TemplateDocumentLike => ({
  uri: { scheme: "file" },
  languageId: "pyjinhx",
  ...over,
});

test("accepts a file-scheme pyjinhx document", () => {
  assert.equal(isComponentTemplate(make()), true);
});

test("rejects non-file schemes", () => {
  assert.equal(isComponentTemplate(make({ uri: { scheme: "untitled" } })), false);
});

test("leaves every other language alone", () => {
  for (const languageId of ["html", "jinja", "jinja-html", "css"]) {
    assert.equal(isComponentTemplate(make({ languageId })), false, languageId);
  }
});

test("the formatter selector and activation events cover only the pyjinhx language", () => {
  assert.deepEqual(TEMPLATE_SELECTOR, [{ language: "pyjinhx", scheme: "file" }]);
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.deepEqual(pkg.activationEvents, ["onLanguage:pyjinhx"]);
});

test("the python block's settings exist with their defaults", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const settings = pkg.contributes.configuration.properties;
  assert.equal(settings["pyjinhx.pythonBlock.enabled"].default, true);
  assert.equal(settings["pyjinhx.pythonBlock.serverPath"].default, "");
  assert.ok(pkg.capabilities.untrustedWorkspaces.restrictedConfigurations.includes("pyjinhx.pythonBlock.serverPath"));
});

test("the block's diagnostics are on by default and fall back to standard", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const settings = pkg.contributes.configuration.properties;
  assert.equal(settings["pyjinhx.pythonBlock.diagnostics"].default, true);
  assert.equal(settings["pyjinhx.pythonBlock.typeCheckingMode"].default, "standard");
  assert.deepEqual(settings["pyjinhx.pythonBlock.typeCheckingMode"].enum, ["off", "basic", "standard", "strict", "recommended", "all"]);
});

test("the ruff formatting setting defaults on, and ruff is covered by the untrusted description", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const setting = pkg.contributes.configuration.properties["pyjinhx.format.python"];
  assert.equal(setting.default, "ruff");
  assert.deepEqual(setting.enum, ["ruff", "off"]);
  // Read for the document and written back to the folder, workspace or user, so it must be a resource setting.
  assert.equal(setting.scope, "resource");
  const untrusted = pkg.capabilities.untrustedWorkspaces;
  assert.deepEqual(untrusted.restrictedConfigurations, ["pyjinhx.pythonPath", "pyjinhx.pythonBlock.serverPath"]);
  assert.match(untrusted.description, /ruff/);
});
