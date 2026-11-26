import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertSnapshot, dumpTokens } from "./snapshot.ts";
import { scopesOf, tokenizePjx, type ScopedToken } from "./tokenize.ts";

const python = (source: string) => tokenizePjx(source, "source.python");
const embedded = (tokens: ScopedToken[]) => tokens.filter((token) => token.scopes.includes("meta.embedded.block.pyjinhx"));

const inline = readFileSync(new URL("../fixtures/grammar-samples/06-inline.py", import.meta.url), "utf8");

test("golden: a class with an inline template", async () => {
  const tokens = await python(inline);
  assertSnapshot("python-inline-template", dumpTokens(tokens));
  assert.ok(scopesOf(tokens, "css").includes("keyword.control.pyjinhx"));
  assert.ok(scopesOf(tokens, "border-radius").includes("meta.embedded.block.css"));
  assert.ok(scopesOf(tokens, "Icon").includes("support.class.component.pyjinhx"));
  assert.ok(scopesOf(tokens, "{{").includes("meta.scope.jinja.variable"));
});

test("the closing quotes end the embedding", async () => {
  const tokens = await python('class A:\n    template = """<b>{{ x }}</b>"""\n    other = 1\n');
  assert.ok(scopesOf(tokens, "x").includes("meta.embedded.block.pyjinhx"));
  assert.ok(!scopesOf(tokens, "other").includes("meta.embedded.block.pyjinhx"));
});

test("an annotated and a raw template are matched", async () => {
  const tokens = await python("class A:\n    template: str = r'''<i></i>'''\n");
  assert.ok(scopesOf(tokens, "i").includes("meta.embedded.block.pyjinhx"));
});

test("f-strings, module-level and call-wrapped templates are not matched", async () => {
  for (const source of [
    'class A:\n    template = f"""<b></b>"""\n',
    'template = """<b></b>"""\n',
    'class A:\n    template = some_call("""<b></b>""")\n',
  ]) {
    assert.deepEqual(embedded(await python(source)), [], source);
  }
});

test("a template string inside a comment or another string is left alone", async () => {
  assert.deepEqual(embedded(await python('class A:\n    # template = """<b></b>"""\n')), []);
});

test("a half-typed tag does not outlive the closing quotes", async () => {
  for (const half of ['<Card title="x', "<div", "<p class='a", "{% if x", "{{ x"]) {
    const tokens = await python(`class A:\n    template = """\n    ${half}\n    """\n    other = 1\n`);
    const other = scopesOf(tokens, "other");
    assert.ok(!other.includes("meta.embedded.block.pyjinhx"), half);
    assert.ok(!other.some((scope) => scope.startsWith("meta.tag") || scope.startsWith("meta.scope.jinja")), `${half}: ${other.join(" ")}`);
    assert.deepEqual(other, ["source.python"], half);
  }
});

test("an unterminated block does not outlive the closing quotes", async () => {
  const tokens = await python('class A:\n    template = """\n    {#css\n    .a {\n    """\n    other = 1\n');
  assert.ok(!scopesOf(tokens, "other").some((scope) => scope.startsWith("meta.block")));
});

test("only a class-body template (4 spaces or a tab) is matched", async () => {
  // A function body at 4 spaces looks the same as a class body; deeper indentation never matches.
  const deeper = 'class A:\n    def f(self):\n        template = """<b></b>"""\n';
  assert.deepEqual(embedded(await python(deeper)), []);
  assert.ok(embedded(await python('class A:\n\ttemplate = """<b></b>"""\n')).length > 0);
  assert.deepEqual(embedded(await python('class A:\n  template = """<b></b>"""\n')), []);
});

test("a template annotation is scoped as Python", async () => {
  const tokens = await python('class A:\n    template: str = """<b></b>"""\n');
  assert.ok(scopesOf(tokens, "str").some((scope) => scope.includes("python")));
  assert.ok(scopesOf(tokens, "b").includes("meta.embedded.block.pyjinhx"));
});

test("a closing quote on the same line as content ends the embedding there", async () => {
  const tokens = await python('class A:\n    template = """\n    <b>x</b>"""\n    other = 1\n');
  assert.ok(!scopesOf(tokens, "other").includes("meta.embedded.block.pyjinhx"));
  assert.ok(scopesOf(tokens, "x").includes("meta.embedded.block.pyjinhx"));
});
