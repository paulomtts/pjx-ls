import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reencodeSemanticTokens,
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
} from "../../src/core/semantic-tokens.ts";

const OURS = {
  tokenTypes: SEMANTIC_TOKEN_TYPES,
  tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
};

test("translates a token's type by name, preserving position", () => {
  // Pylance legend where "parameter" is at index 0.
  const from = { tokenTypes: ["parameter", "variable"], tokenModifiers: [] };
  // one token at line 2, char 4, length 3, type "parameter"
  const data = [2, 4, 3, 0, 0];
  const out = reencodeSemanticTokens(data, from, OURS);
  const ourParam = SEMANTIC_TOKEN_TYPES.indexOf("parameter");
  assert.deepEqual(out, [2, 4, 3, ourParam, 0]);
});

test("maps Pylance custom types (clsParameter → parameter)", () => {
  const from = { tokenTypes: ["clsParameter"], tokenModifiers: [] };
  const out = reencodeSemanticTokens([0, 0, 3, 0, 0], from, OURS);
  assert.equal(out[3], SEMANTIC_TOKEN_TYPES.indexOf("parameter"));
});

test("drops an unknown type and re-bases the following token's delta", () => {
  const from = { tokenTypes: ["mysteryType", "variable"], tokenModifiers: [] };
  // token A: line 0 char 0, unknown type (dropped)
  // token B: same line, +5 chars, type variable (index 1)
  const data = [0, 0, 2, 0, 0, 0, 5, 4, 1, 0];
  const out = reencodeSemanticTokens(data, from, OURS);
  const ourVar = SEMANTIC_TOKEN_TYPES.indexOf("variable");
  // only B survives; its absolute char was 0+5=5, now the first (and only) token
  assert.deepEqual(out, [0, 5, 4, ourVar, 0]);
});

test("translates modifiers by name", () => {
  const from = {
    tokenTypes: ["variable"],
    tokenModifiers: ["readonly", "static"], // bits 0 and 1
  };
  // a variable with both readonly+static set (bitset 0b11 = 3)
  const out = reencodeSemanticTokens([0, 0, 3, 0, 0b11], from, OURS);
  const roBit = SEMANTIC_TOKEN_MODIFIERS.indexOf("readonly");
  const stBit = SEMANTIC_TOKEN_MODIFIERS.indexOf("static");
  assert.equal(out[4], (1 << roBit) | (1 << stBit));
});

test("empty input yields empty output", () => {
  assert.deepEqual(reencodeSemanticTokens([], { tokenTypes: [], tokenModifiers: [] }, OURS), []);
});
