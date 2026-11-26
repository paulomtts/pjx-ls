import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenizePjx, type ScopedToken } from "./tokenize.ts";

const code = [
  "from pkg.mod import Name",
  "import os",
  "",
  "class A(Base, react={K.X}):",
  '    """Doc."""',
  "    @classmethod",
  "    def f(cls, x: int | None = None) -> str:",
  '        return f"row-{x}"',
].join("\n");

/** The scopes the embedding adds around Python, which a plain .py does not have. */
const WRAPPERS = new Set(["text.pyjinhx", "meta.block.python.pyjinhx", "meta.embedded.block.python"]);
const bare = (tokens: ScopedToken[]) =>
  tokens.map(({ text, scopes }) => ({ text, scopes: scopes.filter((scope) => !WRAPPERS.has(scope)).join(" ") }));

const plain = async () => (await tokenizePjx(code, "source.python")).filter((token) => token.text.trim());

for (const [name, opener] of [
  ["directly after the opener", "{#python\n"],
  ["after a blank line", "{#python\n\n"],
]) {
  test(`a {#python block is scoped like a plain .py, ${name}`, async () => {
    const tokens = await tokenizePjx(`${opener}${code}\n#}\n<div></div>\n`);
    const inBlock = tokens.filter((token) => token.scopes.includes("meta.embedded.block.python") && token.text.trim());
    assert.deepEqual(bare(inBlock), bare(await plain()));
  });
}

test("the first import line after the opener is a real keyword", async () => {
  const tokens = await tokenizePjx(`{#python\n${code}\n#}\n`);
  const first = tokens.filter((token) => token.line === 2);
  for (const word of ["from", "import"]) {
    assert.ok(first.find((token) => token.text === word)?.scopes.includes("keyword.control.import.python"), word);
  }
});
