import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverPython, type Lookups } from "../../src/core/python-discovery.ts";

const base = (over: Partial<Lookups> = {}): Lookups => ({
  folder: "/w",
  setting: "",
  platform: "linux",
  fromExtension: async () => undefined,
  exists: () => false,
  onPath: () => undefined,
  ...over,
});

test("the setting wins, even when nothing else exists", async () => {
  const found = await discoverPython(base({ setting: "/opt/py", fromExtension: async () => "/ext/py", exists: () => true }));
  assert.deepEqual(found, { python: "/opt/py", source: "setting" });
});

test("${workspaceFolder} in the setting is the folder", async () => {
  const found = await discoverPython(base({ setting: "${workspaceFolder}/bin/py" }));
  assert.equal(found?.python, "/w/bin/py");
});

test("then the Python extension's environment, if the interpreter is there", async () => {
  assert.deepEqual(await discoverPython(base({ fromExtension: async () => "/ext/py", exists: (p) => p === "/ext/py" })), { python: "/ext/py", source: "python-extension" });
  const gone = await discoverPython(base({ fromExtension: async () => "/ext/py", exists: (p) => p === "/w/.venv/bin/python" }));
  assert.equal(gone?.source, "venv");
});

test("then .venv in the folder, with Windows' layout on Windows", async () => {
  assert.equal((await discoverPython(base({ exists: (p) => p === "/w/.venv/bin/python" })))?.python, "/w/.venv/bin/python");
  const win = await discoverPython(base({ platform: "win32", exists: (p) => p.endsWith("Scripts/python.exe") }));
  assert.equal(win?.python, "/w/.venv/Scripts/python.exe");
});

test("then python3 on PATH, and nothing otherwise", async () => {
  assert.deepEqual(await discoverPython(base({ onPath: (n) => (n === "python3" ? "/usr/bin/python3" : undefined) })), { python: "/usr/bin/python3", source: "path" });
  assert.equal(await discoverPython(base()), null);
});

test("an extension that throws is skipped", async () => {
  const found = await discoverPython(base({ fromExtension: async () => { throw new Error("no"); }, onPath: () => "/usr/bin/python3" }));
  assert.equal(found?.source, "path");
});
