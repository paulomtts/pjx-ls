import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGEND, translateTokens } from "../../src/core/semantic-tokens.ts";
import type { Legend } from "../../src/core/python-server.ts";

const view = { text: "", firstLine: 1, lastLine: 5 };
const typeOf = (name: string) => LEGEND.tokenTypes.indexOf(name as never);
const bit = (name: string) => 1 << LEGEND.tokenModifiers.indexOf(name as never);

// The server's order differs from LEGEND's on purpose.
const server: Legend = { tokenTypes: ["decorator", "class", "selfParameter", "bogus", "clsParameter"], tokenModifiers: ["builtin", "declaration", "defaultLibrary"] };

test("types are matched by name, not index", () => {
  assert.deepEqual(translateTokens([1, 0, 3, 1, 0], server, view), [1, 0, 3, typeOf("class"), 0]);
});

test("selfParameter and clsParameter become parameter", () => {
  assert.deepEqual(translateTokens([1, 0, 4, 2, 0, 1, 0, 3, 4, 0], server, view), [1, 0, 4, typeOf("parameter"), 0, 1, 0, 3, typeOf("parameter"), 0]);
});

test("an unknown type is dropped and the next token's deltas are recomputed", () => {
  // line 1 col 2 class | line 2 col 4 bogus | line 2 col 9 decorator
  const data = [1, 2, 3, 1, 0, 1, 4, 2, 3, 0, 0, 5, 1, 0, 0];
  assert.deepEqual(translateTokens(data, server, view), [1, 2, 3, typeOf("class"), 0, 1, 9, 1, typeOf("decorator"), 0]);
});

test("unknown modifier bits are cleared and known ones move to LEGEND's bit", () => {
  // builtin (bit 0), declaration (bit 1), defaultLibrary (bit 2)
  const data = [1, 0, 3, 1, 0b111];
  assert.deepEqual(translateTokens(data, server, view), [1, 0, 3, typeOf("class"), bit("declaration") | bit("defaultLibrary")]);
});

test("tokens outside the body are dropped", () => {
  // lines 0, 1, 5 and 6
  const data = [0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 4, 0, 1, 1, 0, 1, 0, 1, 1, 0];
  assert.deepEqual(translateTokens(data, server, view), [1, 0, 1, typeOf("class"), 0, 4, 0, 1, typeOf("class"), 0]);
});

test("no data, no tokens", () => assert.deepEqual(translateTokens([], server, view), []));

test("the twenty tokens of the card view keep their positions, self typed parameter", () => {
  const legend: Legend = {
    tokenTypes: ["namespace", "type", "class", "enum", "typeParameter", "parameter", "variable", "property", "enumMember", "function", "method", "keyword", "decorator", "selfParameter", "clsParameter"],
    tokenModifiers: ["declaration", "definition", "readonly", "static", "async", "defaultLibrary", "builtin", "classMember", "parameter"],
  };
  const t = (name: string) => legend.tokenTypes.indexOf(name);
  const absolute: [number, number, number, string][] = [
    [1, 5, 11, "namespace"], [1, 24, 9, "function"],
    [2, 5, 2, "namespace"], [2, 8, 4, "namespace"], [2, 20, 4, "class"],
    [5, 0, 1, "decorator"], [5, 1, 9, "decorator"],
    [6, 6, 14, "class"], [7, 4, 5, "property"], [7, 11, 3, "class"],
    [9, 8, 4, "method"], [9, 13, 4, "selfParameter"], [9, 19, 3, "parameter"],
    [9, 25, 14, "class"], [9, 45, 3, "class"],
    [10, 15, 4, "selfParameter"], [10, 20, 5, "property"], [10, 28, 3, "function"],
    [10, 32, 4, "class"], [10, 37, 5, "property"],
  ];
  const encode = (rows: [number, number, number, string][], type: (name: string) => number) => {
    let line = 0;
    let column = 0;
    return rows.flatMap(([l, c, length, name]) => {
      const out = [l - line, l === line ? c - column : c, length, type(name), 0];
      [line, column] = [l, c];
      return out;
    });
  };
  const wide = { text: "", firstLine: 0, lastLine: 20 };
  const mapped = absolute.map(([l, c, n, name]): [number, number, number, string] => [l, c, n, name.endsWith("Parameter") && name !== "parameter" ? "parameter" : name]);
  assert.deepEqual(translateTokens(encode(absolute, t), legend, wide), encode(mapped, typeOf));
});
