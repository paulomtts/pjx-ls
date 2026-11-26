import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nodeServer, PythonServer, type Legend } from "../../src/core/python-server.ts";
import { pythonView } from "../../src/core/python-view.ts";
import { LEGEND, translateTokens } from "../../src/core/semantic-tokens.ts";

const server = fileURLToPath(new URL("../../dist/basedpyright/langserver.index.js", import.meta.url));
const fixture = fileURLToPath(new URL("../fixtures/python-block/", import.meta.url));

const sessions: PythonServer[] = [];
afterEach(() => sessions.splice(0).forEach((s) => s.dispose()));

// A session on a throwaway copy of the fixture project: tests write into it.
function project() {
  const root = mkdtempSync(join(tmpdir(), "pjx-block-"));
  cpSync(fixture, root, { recursive: true });
  const session = new PythonServer({
    start: () => nodeServer(server),
    folders: () => [{ uri: pathToFileURL(root).toString(), name: "project" }],
    pythonPath: async () => undefined,
    typeCheckingMode: () => "standard",
    log: () => {},
  });
  sessions.push(session);
  const open = (name: string, edit = (text: string) => text) => {
    const file = join(root, name);
    const source = edit(readFileSync(file, "utf8"));
    const view = pythonView(source)!;
    return { uri: pathToFileURL(file).toString(), view, source };
  };
  return { root, session, open };
}

// The server's relative data as 1-based line, column, text and type.
function decode(data: number[], legend: Legend, text: string) {
  const lines = text.split("\n");
  const tokens: { line: number; column: number; text: string; type: string }[] = [];
  let line = 0;
  let column = 0;
  for (let i = 0; i < data.length; i += 5) {
    line += data[i];
    column = data[i] ? data[i + 1] : column + data[i + 1];
    tokens.push({ line: line + 1, column, text: lines[line].slice(column, column + data[i + 2]), type: legend.tokenTypes[data[i + 3]] });
  }
  return tokens;
}

const show = (tokens: ReturnType<typeof decode>) => tokens.map((t) => `${t.line}:${t.column} ${t.text} ${t.type}`);

test("tokens of the card view match the spike", async () => {
  const { session, open } = project();
  const { uri, view } = open("ui/card.pjx");
  session.sync(uri, view.text);
  const answer = await session.semanticTokens(uri);
  assert.ok(answer);
  assert.deepEqual(show(decode(answer.data, answer.legend, view.text)), [
    "2:5 dataclasses namespace", "2:24 dataclass function",
    "3:5 ui namespace", "3:8 keys namespace", "3:20 Keys class",
    "6:0 @ decorator", "6:1 dataclass decorator",
    "7:6 TodoAppContext class", "8:4 count property", "8:11 int class",
    "10:8 load method", "10:13 self selfParameter", "10:19 ctx parameter",
    "10:25 TodoAppContext class", "10:45 int class",
    "11:15 self selfParameter", "11:20 count property", "11:28 len function",
    "11:32 Keys class", "11:37 TODOS property",
  ]);
});

test("an edit reaches the server", async () => {
  const { session, open } = project();
  const { uri, view, source } = open("ui/card.pjx");
  session.sync(uri, view.text);
  await session.semanticTokens(uri);
  const edited = pythonView(source.replace("    count: int = 0", "    total: int = 0"))!;
  session.sync(uri, edited.text);
  const answer = await session.semanticTokens(uri);
  const line8 = decode(answer!.data, answer!.legend, edited.text).filter((t) => t.line === 8);
  assert.ok(line8.some((t) => t.text === "total"));
});

test("a changed .py file is noticed once the session is told", async () => {
  const { root, session, open } = project();
  const { uri, view } = open("ui/card.pjx");
  session.sync(uri, view.text);
  await session.semanticTokens(uri);
  writeFileSync(join(root, "ui/keys.py"), 'class Keys:\n    DONE = "done"\n');
  session.filesChanged([{ uri: pathToFileURL(join(root, "ui/keys.py")).toString(), type: 2 }]);
  // The server reanalyses after the notification; ask until the token stops being a property.
  let todos: ReturnType<typeof decode>[number] | undefined;
  for (let i = 0; i < 40; i++) {
    const answer = await session.semanticTokens(uri);
    todos = decode(answer!.data, answer!.legend, view.text).find((t) => t.line === 11 && t.text === "TODOS");
    if (!todos || todos.type !== "property") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(!todos || todos.type !== "property");
});

test("translated tokens use only LEGEND and stay inside the body", async () => {
  const { session, open } = project();
  const { uri, view } = open("ui/card.pjx");
  session.sync(uri, view.text);
  const answer = await session.semanticTokens(uri);
  const tokens = decode(translateTokens(answer!.data, answer!.legend, view), { tokenTypes: [...LEGEND.tokenTypes], tokenModifiers: [...LEGEND.tokenModifiers] }, view.text);
  assert.equal(tokens.length, 20);
  assert.ok(tokens.every((t) => t.type !== undefined && t.line >= 2 && t.line <= 11));
  assert.deepEqual(tokens.filter((t) => t.text === "self").map((t) => t.type), ["parameter", "parameter"]);
});

test("typing: each sync asks for tokens and cancels the one before", async () => {
  const { session, open } = project();
  const { uri, source } = open("ui/card.pjx");
  let cancelPrevious = () => {};
  const asked: Promise<{ data: number[]; legend: Legend } | null>[] = [];
  let text = "";
  for (let i = 0; i < 20; i++) {
    text = pythonView(source.replace("    count: int = 0", `    count${"x".repeat(i)}: int = 0`))!.text;
    session.sync(uri, text);
    cancelPrevious();
    let cancelled = false;
    let listener = () => {};
    asked.push(session.semanticTokens(uri, { get cancelled() { return cancelled; }, onCancel: (l) => void (listener = l) }));
    cancelPrevious = () => {
      cancelled = true;
      listener();
    };
  }
  const answers = await Promise.all(asked);
  const last = answers[19]!;
  assert.ok(decode(last.data, last.legend, text).some((t) => t.line === 8 && t.text === `count${"x".repeat(19)}`));
});

test("a module created after the server started resolves once it is announced as created", async () => {
  const { root, session, open } = project();
  writeFileSync(join(root, "ui/fresh_user.pjx"), "{#python\nfrom ui.fresh import Fresh\n\nx = Fresh\n#}\n<p></p>\n");
  const { uri, view } = open("ui/fresh_user.pjx");
  session.sync(uri, view.text);
  const before = await session.semanticTokens(uri);
  assert.ok(!decode(before!.data, before!.legend, view.text).some((t) => t.text === "Fresh" && t.type === "class"));
  writeFileSync(join(root, "ui/fresh.py"), "class Fresh:\n    pass\n");
  session.filesChanged([{ uri: pathToFileURL(join(root, "ui/fresh.py")).toString(), type: 1 }]);
  let fresh: ReturnType<typeof decode>[number] | undefined;
  for (let i = 0; i < 40 && fresh?.type !== "class"; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const answer = await session.semanticTokens(uri);
    fresh = decode(answer!.data, answer!.legend, view.text).find((t) => t.line === 4 && t.text === "Fresh");
  }
  assert.equal(fresh?.type, "class");
});
