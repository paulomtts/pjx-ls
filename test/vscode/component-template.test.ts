import { readFileSync } from "node:fs";
import { TEMPLATE_SELECTOR } from "../../src/config.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isComponentTemplate,
  type TemplateDocumentLike,
} from "../../src/vscode/component-template.ts";

const make = (over: Partial<TemplateDocumentLike> = {}): TemplateDocumentLike => ({
  uri: { scheme: "file", fsPath: "/proj/app/components/x/y.html" },
  fileName: "/proj/app/components/x/y.html",
  languageId: "pyjinhx",
  ...over,
});

test("accepts a file-scheme .html under /components/ when its language is pyjinhx", () => {
  assert.equal(isComponentTemplate(make()), true);
});

test("accepts .pjx with pyjinhx language", () => {
  assert.equal(
    isComponentTemplate(
      make({
        fileName: "/proj/components/a.pjx",
        uri: { scheme: "file", fsPath: "/proj/components/a.pjx" },
        languageId: "pyjinhx",
      }),
    ),
    true,
  );
});

test("accepts a .pjx file anywhere, not just under /components/", () => {
  assert.equal(
    isComponentTemplate(
      make({
        fileName: "/home/me/scratch/demo.pjx",
        uri: { scheme: "file", fsPath: "/home/me/scratch/demo.pjx" },
        languageId: "pyjinhx",
      }),
    ),
    true,
  );
});

test("still requires /components/ for .html files", () => {
  assert.equal(
    isComponentTemplate(
      make({
        fileName: "/home/me/scratch/page.html",
        uri: { scheme: "file", fsPath: "/home/me/scratch/page.html" },
        languageId: "pyjinhx",
      }),
    ),
    false,
  );
});

test("rejects non-file scheme", () => {
  assert.equal(
    isComponentTemplate(make({ uri: { scheme: "untitled", fsPath: "/proj/components/x/y.html" } })),
    false,
  );
});

test("rejects path without /components/", () => {
  assert.equal(
    isComponentTemplate(
      make({ fileName: "/proj/app/pages/y.html", uri: { scheme: "file", fsPath: "/proj/app/pages/y.html" } }),
    ),
    false,
  );
});

test("rejects wrong extension", () => {
  assert.equal(
    isComponentTemplate(
      make({ fileName: "/proj/components/x/y.css", uri: { scheme: "file", fsPath: "/proj/components/x/y.css" } }),
    ),
    false,
  );
});

test("leaves plain html, jinja and jinja-html documents alone", () => {
  for (const languageId of ["html", "jinja", "jinja-html"]) {
    assert.equal(isComponentTemplate(make({ languageId })), false, languageId);
  }
});

test("rejects unsupported languageId", () => {
  assert.equal(isComponentTemplate(make({ languageId: "css" })), false);
});

test("requires the leading slash on /components/ (no substring trap)", () => {
  assert.equal(
    isComponentTemplate(
      make({ fileName: "/p/mycomponents/a.html", uri: { scheme: "file", fsPath: "/p/mycomponents/a.html" } }),
    ),
    false,
  );
});

test("the formatter selector and activation events cover only the pyjinhx language", () => {
  assert.deepEqual(TEMPLATE_SELECTOR, [{ language: "pyjinhx", scheme: "file" }]);
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.deepEqual(pkg.activationEvents, ["onLanguage:pyjinhx"]);
});
