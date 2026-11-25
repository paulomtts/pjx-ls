import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
const config = JSON.parse(readFileSync(`${root}language-configuration.json`, "utf8"));
const grammars: { scopeName: string; path: string; injectTo?: string[]; embeddedLanguages?: Record<string, string>; tokenTypes?: Record<string, string> }[] =
  pkg.contributes.grammars;

test("every contributed grammar path exists", () => {
  for (const grammar of grammars) {
    assert.ok(existsSync(`${root}${grammar.path}`), grammar.path);
  }
});

test("injections target only text.pyjinhx and source.python", () => {
  for (const grammar of grammars) {
    for (const target of grammar.injectTo ?? []) {
      assert.ok(["text.pyjinhx", "source.python"].includes(target), `${grammar.scopeName} -> ${target}`);
    }
  }
});

test("no colour customization is contributed; Emmet works in pyjinhx files", () => {
  const defaults = pkg.contributes.configurationDefaults;
  assert.equal(defaults["editor.tokenColorCustomizations"], undefined);
  assert.deepEqual(defaults["emmet.includeLanguages"], { pyjinhx: "html" });
});

test("text.pyjinhx maps embedded scopes to languages and keeps attribute values completable", () => {
  const main = grammars.find((grammar) => grammar.scopeName === "text.pyjinhx");
  assert.deepEqual(main?.embeddedLanguages, {
    "source.css": "css",
    "source.js": "javascript",
    "source.python": "python",
  });
  assert.equal(main?.tokenTypes?.["meta.tag string.quoted"], "other");
});

test("the Python template injection embeds pyjinhx", () => {
  const template = grammars.find((grammar) => grammar.scopeName === "pyjinhx.python-template");
  assert.deepEqual(template?.embeddedLanguages, {
    "meta.embedded.block.pyjinhx": "pyjinhx",
    "source.css": "css",
    "source.js": "javascript",
  });
});

test("{# #} stays the block comment and Jinja delimiters auto-close", () => {
  assert.deepEqual(config.comments.blockComment, ["{#", "#}"]);
  const closes = new Map<string, string>(config.autoClosingPairs.map((pair: { open: string; close: string }) => [pair.open, pair.close]));
  assert.equal(closes.get("{{"), " }}");
  assert.equal(closes.get("{%"), " %}");
  assert.equal(closes.has("{#"), false, "typing {#css must not yield {#css #}");
  assert.equal(closes.get("<!--"), " -->");
});

test("folding markers cover Jinja blocks and tags", () => {
  const start = new RegExp(config.folding.markers.start);
  const end = new RegExp(config.folding.markers.end);
  for (const line of ["{% if x %}", "  {%- for i in items %}", "<div class='a'>", "<Card title='x'>"]) {
    assert.ok(start.test(line), line);
  }
  for (const line of ["{% endif %}", "  {%- endfor -%}", "</div>", "</Card>"]) {
    assert.ok(end.test(line), line);
  }
  for (const line of ["<br>", "<p>text</p>", "{{ x }}", "{% set a = 1 %}"]) {
    assert.ok(!start.test(line), line);
  }
});
