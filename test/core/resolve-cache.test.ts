import { test } from "node:test";
import assert from "node:assert/strict";
import { ResolveCache } from "../../src/core/resolve-cache.ts";

test("an empty cache asks to resolve up to the item", () => {
  assert.equal(new ResolveCache<string>().needed("k", 4), 5);
});

test("what was resolved is not asked for again", () => {
  const cache = new ResolveCache<string>();
  cache.store("k", 5, ["a", "b", "c", "d", "e"]);
  assert.equal(cache.needed("k", 4), null);
  assert.equal(cache.needed("k", 0), null);
  assert.deepEqual(cache.items("k"), ["a", "b", "c", "d", "e"]);
});

test("a later item asks for more, and the cache only grows", () => {
  const cache = new ResolveCache<string>();
  cache.store("k", 2, ["a", "b"]);
  assert.equal(cache.needed("k", 6), 7);
  cache.store("k", 7, ["a", "b", "c", "d", "e", "f", "g"]);
  assert.equal(cache.needed("k", 3), null);
});

test("a different request key starts over", () => {
  const cache = new ResolveCache<string>();
  cache.store("k", 5, ["a"]);
  assert.equal(cache.needed("other", 1), 2);
  assert.deepEqual(cache.items("other"), []);
});

test("clear forgets everything", () => {
  const cache = new ResolveCache<string>();
  cache.store("k", 5, ["a"]);
  cache.clear();
  assert.equal(cache.needed("k", 0), 1);
});
