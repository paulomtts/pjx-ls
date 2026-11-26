import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PythonServer, type ServerProcess } from "../../src/core/python-server.ts";

const fake = fileURLToPath(new URL("../fixtures/fake-langserver.mjs", import.meta.url));

const servers: PythonServer[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.dispose()));

// A server over the fake language server. `state()` reads what the fake recorded.
function setup(env: Record<string, string> = {}, python: (scope?: string) => Promise<string | undefined> = async () => "/py/bin/python", stableMs?: number) {
  const dir = mkdtempSync(join(tmpdir(), "pjx-fake-"));
  let starts = 0;
  const children: ServerProcess[] = [];
  const log: string[] = [];
  let mode = "standard";
  const server = new PythonServer({
    start: () => {
      starts++;
      const stateFile = join(dir, `state-${starts}.json`);
      const child = spawn(process.execPath, [fake], { env: { ...process.env, FAKE_STATE: stateFile, ...env }, stdio: ["pipe", "pipe", "ignore"] });
      const proc: ServerProcess = {
        stdin: child.stdin,
        stdout: child.stdout,
        kill: () => void child.kill(),
        onExit: (listener) => void child.on("exit", (code) => listener(code)),
      };
      children.push(proc);
      return proc;
    },
    folders: () => [{ uri: "file:///work", name: "work" }],
    pythonPath: python,
    typeCheckingMode: () => mode,
    log: (line) => log.push(line),
    stableMs,
  });
  servers.push(server);
  const state = () => {
    const file = join(dir, `state-${starts}.json`);
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  };
  return { server, state, starts: () => starts, log, children, setMode: (m: string) => void (mode = m) };
}

async function eventually<T>(read: () => T | undefined | false, what: string): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const value = read();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const URI = "file:///work/a.pjx";

test("nothing starts until the first sync", async () => {
  const { server, starts } = setup();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(starts(), 0);
  assert.equal(server.state, "idle");
  server.sync(URI, "x = 1\n");
  assert.equal(starts(), 1);
  assert.equal(server.state, "starting");
});

test("initialize carries the folders and the client capabilities", async () => {
  const { server, state } = setup();
  server.sync(URI, "x = 1\n");
  const { initialize } = await eventually(() => state().initialize && state(), "initialize");
  assert.equal(initialize.rootUri, "file:///work");
  assert.deepEqual(initialize.workspaceFolders, [{ uri: "file:///work", name: "work" }]);
  const { textDocument, workspace } = initialize.capabilities;
  assert.equal(workspace.configuration, true);
  assert.deepEqual(textDocument.semanticTokens.requests, { full: true });
  assert.deepEqual(textDocument.semanticTokens.formats, ["relative"]);
  assert.equal(textDocument.completion.completionItem.snippetSupport, false);
  assert.equal(textDocument.definition.linkSupport, true);
});

test("configuration is answered per section, in both shapes", async () => {
  const { server, state } = setup();
  server.sync(URI, "x = 1\n");
  const { configuration } = await eventually(() => state().configuration && state(), "configuration");
  const analysis = { diagnosticMode: "openFilesOnly", autoImportCompletions: false, typeCheckingMode: "standard" };
  assert.deepEqual(configuration, [{ pythonPath: "/py/bin/python" }, { analysis }, analysis]);
});

test("an unknown interpreter leaves the key out and other sections get {}", async () => {
  const { server, state } = setup({ FAKE_SECTIONS: "python,something" }, async () => undefined);
  server.sync(URI, "x = 1\n");
  const { configuration } = await eventually(() => state().configuration && state(), "configuration");
  assert.deepEqual(configuration, [{}, {}]);
});

test("views open as python at version 1 and rise by one per changed text", async () => {
  const { server, state } = setup();
  server.sync(URI, "a\n");
  server.sync(URI, "a\n"); // unchanged: nothing to send
  server.sync(URI, "b\n");
  await eventually(() => state().documents?.length === 1, "didOpen");
  server.sync(URI, "c\n");
  const { documents } = await eventually(() => state().documents?.length === 2 && state(), "didChange");
  assert.deepEqual(documents, [
    { event: "open", uri: URI, version: 1, languageId: "python", text: "b\n" },
    { event: "change", uri: URI, version: 2, text: "c\n" },
  ]);
  assert.equal(server.versionOf(URI), 2);
});

test("calls made while starting are sent in order once ready", async () => {
  const { server, state } = setup();
  server.sync("file:///work/a.pjx", "a\n");
  server.sync("file:///work/b.pjx", "b\n");
  server.close("file:///work/a.pjx");
  const { documents } = await eventually(() => state().documents?.length === 1 && state(), "documents");
  assert.deepEqual(documents.map((d: any) => d.uri), ["file:///work/b.pjx"]);
});

test("semantic tokens come back with the server's legend", async () => {
  const { server } = setup();
  server.sync(URI, "x = 1\n");
  const tokens = await server.semanticTokens(URI);
  assert.deepEqual(tokens, { data: [1, 0, 3, 0, 1], legend: { tokenTypes: ["class", "selfParameter"], tokenModifiers: ["declaration", "builtin"] } });
  assert.equal(await server.semanticTokens("file:///work/unknown.pjx"), null);
});

test("no server, no tokens", async () => {
  const { server } = setup();
  assert.equal(await server.semanticTokens(URI), null);
});

test("close and file changes reach the server", async () => {
  const { server, state } = setup();
  server.sync(URI, "x\n");
  await eventually(() => state().documents?.length === 1, "didOpen");
  server.filesChanged([{ uri: "file:///work/k.py", type: 1 }]);
  server.close(URI);
  const seen = await eventually(() => state().documents?.length === 2 && state().watched?.length === 1 && state(), "close");
  assert.equal(seen.documents[1].event, "close");
  assert.deepEqual(seen.watched, ["file:///work/k.py"]);
});

test("configurationChanged nudges the server once more", async () => {
  const { server, state } = setup();
  server.sync(URI, "x\n");
  await eventually(() => state().nudges === 1, "the first nudge");
  server.configurationChanged();
  await eventually(() => state().nudges === 2, "the second nudge");
});

test("diagnostics are kept for open views with their version and forgotten on close", async () => {
  const { server } = setup();
  const seen: string[] = [];
  server.onDiagnostics((uri) => seen.push(uri));
  server.sync(URI, "x\n");
  await eventually(() => server.diagnostics(URI), "diagnostics");
  assert.equal(server.diagnostics(URI)!.version, 1);
  assert.equal(server.diagnostics(URI)!.items[0].message, "fake");
  server.sync(URI, "y\n");
  await eventually(() => server.diagnostics(URI)?.version === 2, "version 2");
  assert.deepEqual(seen.slice(0, 2), [URI, URI]);
  server.close(URI);
  assert.equal(server.diagnostics(URI), undefined);
});

test("diagnostics for a view that is not open are dropped", async () => {
  const { server } = setup();
  const seen: string[] = [];
  server.onDiagnostics((uri) => seen.push(uri));
  server.sync(URI, "x\n");
  // The fake publishes for "stray.pjx" right after `initialized`, before it sees the open.
  await eventually(() => server.diagnostics(URI), "diagnostics");
  assert.equal(server.diagnostics("file:///work/stray.pjx"), undefined);
  assert.ok(!seen.includes("file:///work/stray.pjx"));
});

test("an unexpected exit restarts on the next sync, with every view reopened at version 1", async () => {
  const { server, state, starts, children } = setup();
  server.sync(URI, "a\n");
  server.sync(URI, "b\n");
  await eventually(() => server.state === "ready", "ready");
  children[0].kill();
  await eventually(() => server.state === "idle", "idle after the exit");
  assert.equal(await server.semanticTokens(URI), null);
  server.sync(URI, "b\n");
  assert.equal(starts(), 2);
  const { documents } = await eventually(() => state().documents?.length === 1 && state(), "reopen");
  assert.deepEqual(documents, [{ event: "open", uri: URI, version: 1, languageId: "python", text: "b\n" }]);
  assert.equal(server.versionOf(URI), 1);
});

test("the third unexpected exit turns the server off for good", async () => {
  const { server, starts, children } = setup();
  for (let i = 0; i < 3; i++) {
    server.sync(URI, "a\n");
    await eventually(() => server.state === "ready", "ready");
    children[i].kill();
    await eventually(() => server.state !== "ready", "the exit");
  }
  assert.equal(server.state, "off");
  server.sync(URI, "b\n");
  assert.equal(starts(), 3);
});

test("dispose shuts the process down", async () => {
  const { server, children } = setup();
  server.sync(URI, "a\n");
  await eventually(() => server.state === "ready", "ready");
  let exited = false;
  children[0].onExit(() => (exited = true));
  server.dispose();
  await eventually(() => exited, "exit");
  assert.equal(server.state, "idle");
  server.sync(URI, "a\n");
  assert.equal(server.state, "idle");
});

test("a failing interpreter lookup still answers with one entry per item", async () => {
  const { server, state } = setup({}, async () => { throw new Error("no python"); });
  server.sync(URI, "x = 1\n");
  const { configuration } = await eventually(() => state().configuration && state(), "configuration");
  assert.equal(configuration.length, 3);
  assert.equal(configuration[0], null);
});

test("crashes are forgotten once a server has stayed up long enough", async () => {
  const { server, children } = setup({}, undefined, 150);
  for (let i = 0; i < 2; i++) {
    server.sync(URI, "a\n");
    await eventually(() => server.state === "ready", "ready");
    children[i].kill();
    await eventually(() => server.state === "idle", "the exit");
  }
  server.sync(URI, "a\n");
  await eventually(() => server.state === "ready", "ready");
  await new Promise((r) => setTimeout(r, 300));
  children[2].kill();
  await eventually(() => server.state === "idle", "the exit");
  assert.notEqual(server.state, "off");
});

test("a server that cannot be spawned rejects what waits on it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pjx-fake-"));
  const server = new PythonServer({
    start: () => {
      const child = spawn(join(dir, "missing-binary"), [], { stdio: ["pipe", "pipe", "ignore"] });
      return {
        stdin: child.stdin!,
        stdout: child.stdout!,
        kill: () => void child.kill(),
        onExit: (listener) => void child.on("error", () => listener(null)),
      };
    },
    folders: () => [],
    pythonPath: async () => undefined,
    typeCheckingMode: () => "standard",
    log: () => {},
  });
  servers.push(server);
  server.sync(URI, "x\n");
  assert.equal(await server.semanticTokens(URI), null);
  assert.equal(server.state, "idle");
});
