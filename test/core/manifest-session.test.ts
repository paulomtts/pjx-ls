import { test } from "node:test";
import assert from "node:assert/strict";
import { ManifestSession, type SessionOptions } from "../../src/core/manifest-session.ts";
import type { Exit, Spawn } from "../../src/core/manifest-runner.ts";
import { manifestText, PROJECT } from "./fixture.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness(over: Partial<SessionOptions> = {}, answer: (args: string[], input?: string) => Partial<Exit> | Error = () => ({})) {
  const runs: { args: string[]; input?: string }[] = [];
  const log: string[] = [];
  let changes = 0;
  const spawn: Spawn = (_command, args, input) => {
    runs.push({ args: args.slice(2), input });
    const result = answer(args.slice(2), input);
    const exit = result instanceof Error ? Promise.reject(result) : Promise.resolve({ code: 0, stdout: manifestText(), stderr: "", ...result });
    return { exit, kill() {} };
  };
  const session = new ManifestSession({
    folder: PROJECT,
    spawn,
    python: async () => ({ python: "py", source: "setting" }),
    settings: () => ({ paths: [], sysPath: [] }),
    trusted: () => true,
    files: async () => [{ path: `${PROJECT}/ui/zed.pjx`, text: "{#def a: int #}" }],
    log: (l) => log.push(l),
    onChange: () => changes++,
    fullDelayMs: 20,
    bufferDelayMs: 10,
    ...over,
  });
  return { session, runs, log, changes: () => changes };
}

test("a full run reads the manifest of the folder", async () => {
  const { session, runs, log } = harness();
  await session.refresh();
  assert.deepEqual(runs[0].args, [PROJECT]);
  assert.equal(session.mode.kind, "full");
  assert.equal(session.manifest.byTag("Badge")?.kind, "split");
  assert.match(log.join("\n"), /pyjinhx\.manifest.*ok in \d+ ms/);
});

test("settings add paths and --sys-path", async () => {
  const { session, runs } = harness({ settings: () => ({ paths: ["/a", "/b"], sysPath: ["/s"] }) });
  await session.refresh();
  assert.deepEqual(runs[0].args, ["--sys-path", "/s", "/a", "/b"]);
});

test("requests for a full run are debounced into one", async () => {
  const { session, runs } = harness();
  for (let i = 0; i < 5; i++) session.requestFull();
  await wait(80);
  assert.equal(runs.length, 1);
  session.dispose();
});

test("a dirty buffer is sent on stdin and its entries replace the disk's", async () => {
  const buffer = JSON.parse(manifestText());
  buffer.components = buffer.components.filter((c: { tag: string }) => c.tag === "Badge");
  buffer.components[0].props = [];
  const { session, runs } = harness({}, (args) => (args.includes("--stdin") ? { stdout: JSON.stringify(buffer) } : {}));
  await session.refresh();
  const path = `${PROJECT}/ui/badge.pjx`;
  session.requestBuffer(path, () => "<b>{{ x }}</b>");
  session.requestBuffer(path, () => "<b>{{ y }}</b>");
  await wait(60);
  const stdin = runs.filter((r) => r.args.includes("--stdin"));
  assert.equal(stdin.length, 1);
  assert.deepEqual(stdin[0].args.slice(0, 3), ["--stdin", "--filename", path]);
  assert.equal(stdin[0].input, "<b>{{ y }}</b>");
  assert.equal(session.manifest.byTag("Badge")!.props.length, 0);
  assert.equal(session.manifest.byTag("Alert")!.props.length, 3);
  session.settle(path);
  assert.equal(session.manifest.byTag("Badge")!.props.length, 3);
  session.dispose();
});

test("a full run keeps the buffers laid over it", async () => {
  const buffer = JSON.parse(manifestText());
  buffer.components = buffer.components.filter((c: { tag: string }) => c.tag === "Badge");
  buffer.components[0].props = [];
  const { session } = harness({}, (args) => (args.includes("--stdin") ? { stdout: JSON.stringify(buffer) } : {}));
  await session.refresh();
  session.requestBuffer(`${PROJECT}/ui/badge.pjx`, () => "x");
  await wait(40);
  await session.refresh();
  assert.equal(session.manifest.byTag("Badge")!.props.length, 0);
  session.dispose();
});

test("each failure leaves limited mode and the index of the .pjx files", async () => {
  const failures: [Partial<Exit> | Error, RegExp][] = [
    [Object.assign(new Error("x"), { code: "ENOENT" }), /cannot start/],
    [{ code: 1, stderr: "No module named 'pyjinhx'" }, /not installed/],
    [{ code: 1, stderr: "No module named pyjinhx.manifest" }, /upgrade/],
    [{ code: 0, stdout: "nope" }, /not JSON/],
    [{ code: 2, stderr: "bad" }, /exit 2/],
  ];
  for (const [failure, reason] of failures) {
    const { session } = harness({}, () => failure);
    await session.refresh();
    assert.equal(session.mode.kind, "limited");
    assert.match((session.mode as { reason: string }).reason, reason);
    assert.deepEqual(session.manifest.components.map((c) => c.tag), ["Zed"]);
  }
});

test("without an interpreter, or in an untrusted workspace, nothing is run", async () => {
  const none = harness({ python: async () => null });
  await none.session.refresh();
  assert.equal(none.runs.length, 0);
  assert.equal(none.session.mode.kind, "limited");
  const untrusted = harness({ trusted: () => false });
  await untrusted.session.refresh();
  assert.equal(untrusted.runs.length, 0);
  assert.match((untrusted.session.mode as { reason: string }).reason, /not trusted/);
  assert.equal(untrusted.session.manifest.byTag("Zed")?.kind, "template");
});

test("a buffer is not sent while limited", async () => {
  const { session, runs } = harness({ python: async () => null });
  await session.refresh();
  session.requestBuffer("/x.pjx", () => "");
  await wait(40);
  assert.equal(runs.length, 0);
  session.dispose();
});
