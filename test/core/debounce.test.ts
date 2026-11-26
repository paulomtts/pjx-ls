import { test } from "node:test";
import assert from "node:assert/strict";
import { Debouncer } from "../../src/core/debounce.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a scheduled run happens once after the pause, however often it is scheduled", async () => {
  const runs: string[] = [];
  const debouncer = new Debouncer(20, (key) => runs.push(key));
  debouncer.schedule("a");
  debouncer.schedule("a");
  assert.deepEqual(runs, []);
  await wait(60);
  assert.deepEqual(runs, ["a"]);
});

test("flush runs a pending key now and not again later", async () => {
  const runs: string[] = [];
  const debouncer = new Debouncer(20, (key) => runs.push(key));
  debouncer.schedule("a");
  assert.equal(debouncer.flush("a"), true);
  assert.deepEqual(runs, ["a"]);
  await wait(60);
  assert.deepEqual(runs, ["a"]);
});

test("flush of a key with nothing pending does nothing", () => {
  const runs: string[] = [];
  assert.equal(new Debouncer(20, (key) => runs.push(key)).flush("a"), false);
  assert.deepEqual(runs, []);
});

test("keys are independent, and dispose cancels what is pending", async () => {
  const runs: string[] = [];
  const debouncer = new Debouncer(20, (key) => runs.push(key));
  debouncer.schedule("a");
  debouncer.schedule("b");
  debouncer.flush("a");
  debouncer.dispose();
  await wait(60);
  assert.deepEqual(runs, ["a"]);
});
