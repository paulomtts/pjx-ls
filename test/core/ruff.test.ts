import { test } from "node:test";
import assert from "node:assert/strict";
import { Ruff, ruffArgs, stdinFilename, type RuffCommand } from "../../src/core/python-format.ts";
import type { Cancel } from "../../src/core/lsp-client.ts";
import { fakeSpawn } from "./fixture.ts";

const PY: RuffCommand = { command: "py", args: ["-m", "ruff"] };
const BIN: RuffCommand = { command: "/bin/ruff", args: [] };
const request = { filename: "/w/ui/total.py", cwd: "/w", candidates: async () => [PY, BIN] };
const noModule = { code: 1, stdout: "", stderr: "py: No module named ruff" };
const ok = { code: 0, stdout: "x = 1\n", stderr: "" };
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(timeoutMs?: number) {
  const { spawn, calls } = fakeSpawn();
  const log: string[] = [];
  const missing: string[] = [];
  const ruff = new Ruff(spawn, (l) => log.push(l), timeoutMs, (tried) => missing.push(tried));
  return { ruff, calls, log, missing };
}

test("the name and the arguments", () => {
  assert.equal(stdinFilename("/w/ui/total.pjx"), "/w/ui/total.py");
  assert.deepEqual(ruffArgs("/w/ui/total.py"), ["format", "--stdin-filename", "/w/ui/total.py", "-"]);
});

test("the first candidate gets the source on stdin, in the cwd", async () => {
  const { ruff, calls } = setup();
  const run = ruff.format("x=1\n", request);
  await tick();
  assert.deepEqual([calls[0].command, calls[0].args, calls[0].input, calls[0].cwd], ["py", ["-m", "ruff", "format", "--stdin-filename", "/w/ui/total.py", "-"], "x=1\n", "/w"]);
  calls[0].finish(ok);
  assert.equal(await run, "x = 1\n");
});

test("a missing module moves on, and the one that worked is remembered", async () => {
  const { ruff, calls } = setup();
  let asked = 0;
  const req = { ...request, candidates: async () => (asked++, [PY, BIN]) };
  const run = ruff.format("x=1\n", req);
  await tick();
  calls[0].finish(noModule);
  await tick();
  assert.equal(calls[1].command, "/bin/ruff");
  calls[1].finish(ok);
  assert.equal(await run, "x = 1\n");

  const next = ruff.format("x=1\n", req);
  await tick();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].command, "/bin/ruff");
  calls[2].finish(ok);
  await next;
  assert.equal(asked, 1);
});

test("ENOENT is a miss like a missing module", async () => {
  const { ruff, calls } = setup();
  const run = ruff.format("x=1\n", request);
  await tick();
  calls[0].fail(Object.assign(new Error("spawn"), { code: "ENOENT" }));
  await tick();
  calls[1].finish(ok);
  assert.equal(await run, "x = 1\n");
});

test("nothing found: null, said once per cwd, and the miss is not remembered", async () => {
  const { ruff, calls, log, missing } = setup();
  for (let i = 0; i < 2; i++) {
    const run = ruff.format("x=1\n", request);
    await tick();
    calls[i * 2].finish(noModule);
    await tick();
    calls[i * 2 + 1].fail(Object.assign(new Error("spawn"), { code: "ENOENT" }));
    assert.equal(await run, null);
  }
  assert.equal(calls.length, 4);
  assert.equal(log.length, 1);
  assert.ok(log[0].startsWith("ruff was not found"));
  assert.equal(missing.length, 1);
  assert.ok(missing[0].includes("py -m ruff") && missing[0].includes("/bin/ruff"));

  ruff.forget();
  const run = ruff.format("x=1\n", request);
  await tick();
  calls[4].fail(Object.assign(new Error("spawn"), { code: "ENOENT" }));
  await tick();
  calls[5].fail(Object.assign(new Error("spawn"), { code: "ENOENT" }));
  await run;
  assert.equal(log.length, 2);
});

test("no candidates at all is a miss too", async () => {
  const { ruff, log } = setup();
  assert.equal(await ruff.format("x=1\n", { ...request, candidates: async () => [] }), null);
  assert.ok(log[0].startsWith("ruff was not found"));
});

test("a failing ruff leaves the body alone, is logged, and the command is remembered", async () => {
  const { ruff, calls, log } = setup();
  const run = ruff.format("x=1\n", request);
  await tick();
  calls[0].finish({ code: 2, stdout: "", stderr: "error: Failed to parse total.py:1:7: Expected …\n" });
  assert.equal(await run, null);
  assert.equal(calls.length, 1);
  assert.equal(log.length, 1);
  assert.ok(log[0].includes("exit 2") && log[0].includes("Failed to parse"));

  const next = ruff.format("x=1\n", request);
  await tick();
  assert.equal(calls[1].command, "py");
  calls[1].finish(ok);
  await next;
});

test("exit 1 with another message is a failure, not a miss", async () => {
  const { ruff, calls, missing } = setup();
  const run = ruff.format("x=1\n", request);
  await tick();
  calls[0].finish({ code: 1, stdout: "", stderr: "Traceback (most recent call last)" });
  assert.equal(await run, null);
  assert.equal(calls.length, 1);
  assert.equal(missing.length, 0);
});

test("a remembered command that goes missing is replaced in the same call", async () => {
  const { ruff, calls } = setup();
  let run = ruff.format("x=1\n", request);
  await tick();
  calls[0].finish(ok);
  await run;
  run = ruff.format("x=1\n", request);
  await tick();
  calls[1].finish(noModule);
  await tick();
  assert.equal(calls[2].command, "py");
  calls[2].finish(noModule);
  await tick();
  assert.equal(calls[3].command, "/bin/ruff");
  calls[3].finish(ok);
  assert.equal(await run, "x = 1\n");
  run = ruff.format("x=1\n", request);
  await tick();
  assert.equal(calls[4].command, "/bin/ruff");
  calls[4].finish(ok);
  await run;
});

test("a run that takes too long is killed and logged", async () => {
  const { ruff, calls, log } = setup(20);
  assert.equal(await ruff.format("x=1\n", request), null);
  assert.equal(calls[0].killed, true);
  assert.ok(log.some((l) => l.includes("no answer after")));
});

test("cancelling kills the process and says nothing", async () => {
  const { ruff, calls, log } = setup();
  let fire = () => {};
  const cancel: Cancel = { cancelled: false, onCancel: (l) => (fire = l) };
  const run = ruff.format("x=1\n", { ...request, cancel });
  await tick();
  fire();
  assert.equal(await run, null);
  assert.equal(calls[0].killed, true);
  assert.equal(log.length, 0);
});

test("an already cancelled request spawns nothing", async () => {
  const { ruff, calls } = setup();
  assert.equal(await ruff.format("x=1\n", { ...request, cancel: { cancelled: true, onCancel: () => {} } }), null);
  assert.equal(calls.length, 0);
});

test("two cwds remember separately", async () => {
  const { ruff, calls } = setup();
  const a = ruff.format("x=1\n", request);
  await tick();
  calls[0].finish(ok);
  await a;
  const b = ruff.format("x=1\n", { ...request, cwd: "/other" });
  await tick();
  assert.equal(calls[1].command, "py");
  calls[1].finish(noModule);
  await tick();
  calls[2].finish(ok);
  await b;
  const c = ruff.format("x=1\n", request);
  await tick();
  assert.equal(calls[3].command, "py");
  calls[3].finish(ok);
  await c;
});

test("a rejected candidates() is null, not a rejection", async () => {
  const { ruff } = setup();
  assert.equal(await ruff.format("x=1\n", { ...request, candidates: async () => Promise.reject(new Error("no")) }), null);
});
