import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { LspClient } from "../../src/core/lsp-client.ts";

const frame = (message: unknown) => {
  const body = Buffer.from(JSON.stringify(message));
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
};

// The client's two streams, with the server's side of each held by the test.
function pair() {
  const toClient = new PassThrough();
  const fromClient = new PassThrough();
  const sent: any[] = [];
  let buffer = Buffer.alloc(0);
  fromClient.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const head = buffer.indexOf("\r\n\r\n");
      if (head < 0) return;
      const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, head).toString())![1]);
      if (buffer.length < head + 4 + length) return;
      sent.push(JSON.parse(buffer.subarray(head + 4, head + 4 + length).toString()));
      buffer = buffer.subarray(head + 4 + length);
    }
  });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  return { client: new LspClient(toClient, fromClient), toClient, sent, tick };
}

test("a response resolves the request with its id", async () => {
  const { client, toClient, sent } = pair();
  const answer = client.request("a/b", { x: 1 });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent[0], { jsonrpc: "2.0", id: sent[0].id, method: "a/b", params: { x: 1 } });
  toClient.write(frame({ jsonrpc: "2.0", id: sent[0].id, result: 42 }));
  assert.equal(await answer, 42);
});

test("two responses in one chunk", async () => {
  const { client, toClient, sent, tick } = pair();
  const one = client.request("m", null);
  const two = client.request("m", null);
  await tick();
  toClient.write(Buffer.concat([frame({ id: sent[0].id, result: 1 }), frame({ id: sent[1].id, result: 2 })]));
  assert.deepEqual(await Promise.all([one, two]), [1, 2]);
});

test("a response split inside a multi-byte character", async () => {
  const { client, toClient, sent, tick } = pair();
  const answer = client.request("m", null);
  await tick();
  const bytes = frame({ id: sent[0].id, result: "café" });
  const cut = bytes.indexOf(0xc3) + 1;
  toClient.write(bytes.subarray(0, cut));
  await tick();
  toClient.write(bytes.subarray(cut));
  assert.equal(await answer, "café");
});

test("an error response rejects with its message", async () => {
  const { client, toClient, sent, tick } = pair();
  const answer = client.request("m", null);
  await tick();
  toClient.write(frame({ id: sent[0].id, error: { code: -32601, message: "no such method" } }));
  await assert.rejects(answer, /no such method/);
});

test("a server request gets its handler's result, or null without one", async () => {
  const { client, toClient, sent, tick } = pair();
  client.onRequest("workspace/configuration", (params) => [params.items.length]);
  toClient.write(frame({ id: 7, method: "workspace/configuration", params: { items: [1, 2] } }));
  toClient.write(frame({ id: "s", method: "unknown/thing" }));
  await tick();
  await tick();
  assert.deepEqual(sent.find((m) => m.id === 7), { jsonrpc: "2.0", id: 7, result: [2] });
  assert.deepEqual(sent.find((m) => m.id === "s"), { jsonrpc: "2.0", id: "s", result: null });
});

test("a notification reaches its handler", async () => {
  const { client, toClient, tick } = pair();
  const seen: unknown[] = [];
  client.onNotification("window/logMessage", (p) => seen.push(p));
  toClient.write(frame({ method: "window/logMessage", params: { message: "hi" } }));
  await tick();
  assert.deepEqual(seen, [{ message: "hi" }]);
});

test("notify writes a message without an id", async () => {
  const { client, sent, tick } = pair();
  client.notify("initialized", {});
  await tick();
  assert.deepEqual(sent[0], { jsonrpc: "2.0", method: "initialized", params: {} });
});

test("cancelling sends $/cancelRequest and a -32800 answer resolves null", async () => {
  const { client, toClient, sent, tick } = pair();
  let cancel!: () => void;
  const token = { cancelled: false, onCancel: (listener: () => void) => void (cancel = listener) };
  const answer = client.request("m", null, token);
  await tick();
  cancel();
  await tick();
  const request = sent.find((m) => m.method === "$/cancelRequest");
  assert.deepEqual(request.params, { id: sent[0].id });
  toClient.write(frame({ id: sent[0].id, error: { code: -32800, message: "cancelled" } }));
  assert.equal(await answer, null);
});

test("close and an ended input reject what is pending", async () => {
  const closed = pair();
  const a = closed.client.request("m", null);
  closed.client.close();
  await assert.rejects(a, /closed/);
  await assert.rejects(closed.client.request("m", null), /closed/);

  const ended = pair();
  const b = ended.client.request("m", null);
  ended.toClient.end();
  await assert.rejects(b, /closed/);
});

test("round trip through a real process", async () => {
  const server = spawn(process.execPath, [fileURLToPath(new URL("../fixtures/fake-langserver.mjs", import.meta.url))]);
  const client = new LspClient(server.stdout, server.stdin);
  try {
    const result: any = await client.request("initialize", { capabilities: {} });
    assert.deepEqual(result.capabilities.semanticTokensProvider.legend.tokenTypes, ["class", "selfParameter"]);
  } finally {
    server.kill();
  }
});
