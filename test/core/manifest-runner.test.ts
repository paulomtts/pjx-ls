import { test } from "node:test";
import assert from "node:assert/strict";
import { Lane, nodeSpawn, type Exit } from "../../src/core/manifest-runner.ts";
import { fakeSpawn, manifestText } from "./fixture.ts";

const ok = { code: 0, stdout: manifestText(), stderr: "" };
const failure = (outcome: unknown) => (outcome as { failure: { kind: string } }).failure.kind;

test("the command is python -m pyjinhx.manifest with the arguments, and stdin goes to it", async () => {
  const { spawn, calls } = fakeSpawn();
  const run = new Lane(spawn).run("py", ["/w"], "text");
  calls[0].finish(ok);
  assert.ok("manifest" in (await run));
  assert.deepEqual([calls[0].command, calls[0].args, calls[0].input], ["py", ["-m", "pyjinhx.manifest", "/w"], "text"]);
});

test("a newer run kills the older, which answers superseded", async () => {
  const { spawn, calls } = fakeSpawn();
  const lane = new Lane(spawn);
  const first = lane.run("py", ["a"]);
  const second = lane.run("py", ["b"]);
  assert.equal(calls[0].killed, true);
  assert.deepEqual(await first, { superseded: true });
  calls[1].finish(ok);
  assert.ok("manifest" in (await second));
  assert.equal(calls[1].killed, false);
});

test("a run that takes too long is killed and is a timeout", async () => {
  const { spawn, calls } = fakeSpawn();
  const outcome = await new Lane(spawn, 10).run("py", []);
  assert.equal(failure(outcome), "timeout");
  assert.equal(calls[0].killed, true);
});

test("each way to fail is its own kind", async () => {
  const cases: [Partial<Exit> | "enoent", string][] = [
    ["enoent", "no-interpreter"],
    [{ code: 1, stderr: "ModuleNotFoundError: No module named 'pyjinhx'" }, "no-pyjinhx"],
    [{ code: 1, stderr: "/usr/bin/python: No module named pyjinhx.manifest" }, "old-pyjinhx"],
    [{ code: 2, stderr: "x: no such file or directory" }, "failed"],
    [{ code: 0, stdout: "Traceback" }, "bad-output"],
    [{ code: 0, stdout: JSON.stringify({ manifest_version: 2, components: [] }) }, "version"],
  ];
  for (const [result, kind] of cases) {
    const { spawn, calls } = fakeSpawn();
    const run = new Lane(spawn).run("py", []);
    if (result === "enoent") calls[0].fail(Object.assign(new Error("spawn"), { code: "ENOENT" }));
    else calls[0].finish({ code: 0, stdout: "", stderr: "", ...result });
    assert.equal(failure(await run), kind);
  }
});

test("nodeSpawn keeps a character whose bytes arrive in two chunks", async () => {
  const script = "process.stdout.write(Buffer.from([0x22, 0xc3])); setTimeout(() => process.stdout.write(Buffer.from([0xa9, 0x22])), 100);";
  const exit = await nodeSpawn(process.execPath, ["-e", script]).exit;
  assert.equal(exit.stdout, '"é"');
});
