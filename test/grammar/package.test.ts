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

test("no colour customization is contributed", () => {
  assert.equal(pkg.contributes.configurationDefaults?.["editor.tokenColorCustomizations"], undefined);
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

test("folding: indentation by default, markers only for multi-line pjx blocks", () => {
  const start = new RegExp(config.folding.markers.start);
  const end = new RegExp(config.folding.markers.end);
  for (const line of ["{#css", "{#js", "{#python", "{#def", "  {#css  "]) {
    assert.ok(start.test(line), line);
  }
  for (const line of ["#}", "  #}  "]) {
    assert.ok(end.test(line), line);
  }
  // Tags and Jinja blocks fold by indentation, so no marker may claim them.
  for (const line of [
    "{#css x #}", "{#def a: int #}", "{# css tweaks #}", '<Item value="{{ x }}"/>', "<div>", "<BR>",
    "{% if open %}x{% endif %}", "{% raw %}{% endraw %}", "{%- for i in xs %}", "{%+ if a %}",
  ]) {
    assert.ok(!start.test(line), line);
  }
  for (const line of ["</div>", "{% endif %}", "x #}"]) {
    assert.ok(!end.test(line), line);
  }
});

test("{ auto-closes everywhere (the pyjinhx configuration is the only one in effect); {# has no pair", () => {
  const closes = new Map<string, string>(config.autoClosingPairs.map((pair: { open: string; close: string }) => [pair.open, pair.close]));
  assert.equal(closes.get("{"), "}");
  assert.equal(closes.get("{{"), " }}");
  assert.equal(closes.get("{%"), " %}");
  assert.equal(closes.has("{#"), false);
});

test("Emmet is not enabled by default: it cannot be scoped away from code regions", () => {
  assert.equal(pkg.contributes.configurationDefaults?.["emmet.includeLanguages"], undefined);
});

test("autoCloseBefore keeps VS Code's defaults and adds <", () => {
  for (const char of ";:.,=}])> \n\t<") {
    assert.ok(config.autoCloseBefore.includes(char), JSON.stringify(char));
  }
});

test("a #} line is outdented relative to the body it closes", () => {
  const decrease = new RegExp(config.indentationRules.decreaseIndentPattern);
  for (const line of ["#}", "    #}", "\t#}  "]) assert.ok(decrease.test(line), line);
  for (const line of ["x = 1 #}", "{#python", "    x = 1", "# }"]) assert.ok(!decrease.test(line), line);
});

test("autoCloseBefore includes quotes, so { auto-closes before a closing attribute quote", () => {
  assert.ok(config.autoCloseBefore.includes('"'));
  assert.ok(config.autoCloseBefore.includes("'"));
});
