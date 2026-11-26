import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LspClient } from "../../src/core/lsp-client.ts";

const dist = fileURLToPath(new URL("../../dist/basedpyright/", import.meta.url));

test("the bundled server starts and announces its legend", async () => {
  const server = spawn(process.execPath, [`${dist}langserver.index.js`, "--stdio"]);
  const client = new LspClient(server.stdout, server.stdin);
  try {
    const result: any = await client.request("initialize", { processId: null, rootUri: null, capabilities: {} });
    assert.equal(result.serverInfo.name, "basedpyright");
    const types = result.capabilities.semanticTokensProvider.legend.tokenTypes;
    for (const type of ["class", "property", "enumMember", "selfParameter"]) assert.ok(types.includes(type), type);
  } finally {
    server.kill();
  }
});

test("no source map is shipped", () => {
  assert.deepEqual(globSync("**/*.map", { cwd: dist }), []);
});
