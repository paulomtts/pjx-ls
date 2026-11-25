import { test } from "node:test";
import assert from "node:assert/strict";
import { scopesOf, tokenizePjx } from "./tokenize.ts";

test("a component tag name carries the component and class scopes", async () => {
  const tokens = await tokenizePjx('<Card title="x"/>');
  const name = scopesOf(tokens, "Card");
  assert.ok(name.includes("entity.name.tag.component.pyjinhx"), name.join(" "));
  assert.ok(name.includes("support.class.component.pyjinhx"));
  assert.ok(name.includes("meta.tag.component.pyjinhx"));
});

test("attributes on a component tag are scoped: name, =, bare, and @click", async () => {
  const tokens = await tokenizePjx('<Card title="Hello" disabled @click="save()"/>');
  assert.ok(scopesOf(tokens, "title").some((scope) => scope.startsWith("entity.other.attribute-name")));
  assert.ok(scopesOf(tokens, "=").includes("punctuation.separator.key-value.html"));
  assert.ok(scopesOf(tokens, "disabled").some((scope) => scope.startsWith("entity.other.attribute-name")));
  assert.ok(scopesOf(tokens, "@click").some((scope) => scope.startsWith("entity.other.attribute-name")));
});

test("a plain string value is one string", async () => {
  const tokens = await tokenizePjx('<Card title="Hello world"/>');
  const value = tokens.find((token) => token.text === "Hello world");
  assert.ok(value);
  assert.ok(value.scopes.includes("string.quoted.double.html"), value.scopes.join(" "));
  assert.ok(!value.scopes.includes("meta.attribute.slot.pyjinhx"));
});

test("a one-line slot value holds HTML tags and a nested component tag", async () => {
  const tokens = await tokenizePjx(`<Modal footer="<b>ok</b><Button label='OK'/>"/>`);
  assert.ok(scopesOf(tokens, "b").includes("entity.name.tag.html"));
  assert.ok(scopesOf(tokens, "Button").includes("support.class.component.pyjinhx"));
  assert.ok(scopesOf(tokens, "ok").includes("meta.attribute.slot.pyjinhx"));
});

test("a multi-line slot value holds HTML tags and a nested component tag", async () => {
  const tokens = await tokenizePjx('<Modal\n  footer="\n    <p>hi</p>\n    <Button label=\'OK\'/>\n  "\n/>');
  assert.ok(scopesOf(tokens, "p").includes("entity.name.tag.html"));
  assert.ok(scopesOf(tokens, "Button").includes("support.class.component.pyjinhx"));
});

test("slot quotes stay string punctuation", async () => {
  const tokens = await tokenizePjx('<Modal footer="<b></b>"/>');
  const quotes = tokens.filter((token) => token.text === '"');
  assert.equal(quotes.length, 2);
  for (const quote of quotes) {
    assert.ok(quote.scopes.some((scope) => scope.startsWith("punctuation.definition.string")), quote.scopes.join(" "));
  }
});

test("slot values are only recognised on component tags", async () => {
  const tokens = await tokenizePjx('<div title="<b>">x</div>');
  assert.ok(!scopesOf(tokens, "b").includes("entity.name.tag.html"));
});

test("an all-caps tag is HTML, as in pyjinhx", async () => {
  for (const tag of ["BR", "A", "DIV", "H1"]) {
    const tokens = await tokenizePjx(`<${tag}>x</${tag}>`);
    const name = tokens.filter((token) => token.text === tag);
    assert.equal(name.length, 2, tag);
    for (const token of name) {
      assert.ok(!token.scopes.includes("meta.tag.component.pyjinhx"), `${tag}: ${token.scopes.join(" ")}`);
      assert.ok(!token.scopes.includes("support.class.component.pyjinhx"), tag);
    }
  }
});

test("a PascalCase name with a lowercase letter is a component", async () => {
  for (const tag of ["Card", "PJXButton", "Ab", "HTMLView", "X1y"]) {
    assert.ok(scopesOf(await tokenizePjx(`<${tag}/>`), tag).includes("support.class.component.pyjinhx"), tag);
  }
});
