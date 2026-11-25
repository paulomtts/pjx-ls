import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { blocksOf } from "./blocks.ts";
import { tokenizePjx } from "./tokenize.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const data = JSON.parse(read("../fixtures/pyjinhx/block_grammar.json"));
const keywords = Object.keys(data.keywords);
const blocksIn = async (source: string) => blocksOf(await tokenizePjx(source));

test("block_grammar.json is a version this grammar was written for", () => {
  assert.equal(data.version, 1);
});

test("the first #} ends a block, as in Jinja", () => {
  assert.match(data.terminator_rule, /first #\}/);
});

test("every keyword has a meta.block rule", () => {
  const names = new Set<string>();
  JSON.stringify(JSON.parse(read("../../syntaxes/pyjinhx.json")), (key, value) => {
    if (key === "name" && typeof value === "string") names.add(value);
    return value;
  });
  for (const keyword of keywords) {
    assert.ok(names.has(`meta.block.${keyword}.pyjinhx`), keyword);
  }
});

test("a keyword must touch the opener", async () => {
  assert.equal(data.keyword_touches_opener, true);
  for (const keyword of keywords) {
    assert.deepEqual(await blocksIn(`{# ${keyword}\nx\n#}\n<p></p>`), [], keyword);
  }
});

test("whitespace control does not open a block", async () => {
  assert.equal(data.whitespace_control_is_a_block, false);
  for (const keyword of keywords) {
    assert.deepEqual(await blocksIn(`{#-${keyword}\nx\n#}\n<p></p>`), [], keyword);
  }
});

test("a keyword that must end its line is a comment when text follows", async () => {
  for (const [keyword, rule] of Object.entries<{ after_keyword: string }>(data.keywords)) {
    if (rule.after_keyword !== "end_of_line") continue;
    assert.deepEqual(await blocksIn(`{#${keyword} x #}\n<p></p>`), [], keyword);
  }
});

test("python opens only in column 0", async () => {
  assert.equal(data.keywords.python.opener_column, 0);
  assert.deepEqual(await blocksIn(" {#python\nx = 1\n#}\n<p></p>"), []);
  assert.equal((await blocksIn("{#python\nx = 1\n#}\n<p></p>")).length, 1);
});
