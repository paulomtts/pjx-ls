import { afterEach } from "node:test";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nodeServer, PythonServer } from "../../src/core/python-server.ts";
import { pythonView } from "../../src/core/python-view.ts";

const server = fileURLToPath(new URL("../../dist/basedpyright/langserver.index.js", import.meta.url));
const fixture = fileURLToPath(new URL("../fixtures/python-block/", import.meta.url));

const sessions: PythonServer[] = [];
afterEach(() => sessions.splice(0).forEach((s) => s.dispose()));

// A session on a throwaway copy of the fixture project: tests write into it.
export function project(typeCheckingMode = "standard") {
  const root = mkdtempSync(join(tmpdir(), "pjx-block-"));
  cpSync(fixture, root, { recursive: true });
  const session = new PythonServer({
    start: () => nodeServer(server),
    folders: () => [{ uri: pathToFileURL(root).toString(), name: "project" }],
    pythonPath: async () => undefined,
    typeCheckingMode: () => typeCheckingMode,
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

