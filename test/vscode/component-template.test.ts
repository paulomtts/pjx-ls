import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isComponentTemplate,
  type TemplateDocumentLike,
} from "../../src/vscode/component-template.ts";

const make = (over: Partial<TemplateDocumentLike> = {}): TemplateDocumentLike => ({
  uri: { scheme: "file", fsPath: "/proj/app/components/x/y.html" },
  fileName: "/proj/app/components/x/y.html",
  languageId: "html",
  ...over,
});

test("accepts a file-scheme html under /components/", () => {
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

test("accepts the jinja and jinja-html language ids", () => {
  assert.equal(isComponentTemplate(make({ languageId: "jinja" })), true);
  assert.equal(isComponentTemplate(make({ languageId: "jinja-html" })), true);
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
