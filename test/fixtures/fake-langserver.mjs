// A scripted language server for the client and session tests: speaks LSP framing on stdio
// and records what it is sent, which a `test/state` request reads back.
import { writeFileSync } from "node:fs";

const state = { configuration: null, documents: [], configurationAsked: 0, initialize: null, watched: [], nudges: 0 };
let buffer = Buffer.alloc(0);
let nextId = 1000;
const asked = new Map();

const send = (message) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }));
  process.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
};

// `FAKE_SECTIONS` lets a test choose which configuration sections the server asks for.
const sections = (process.env.FAKE_SECTIONS ?? "python,basedpyright,basedpyright.analysis").split(",");

function handle(message) {
  const { id, method, params } = message;
  if (method === undefined) {
    asked.get(id)?.(message.result);
    return;
  }
  switch (method) {
    case "initialize":
      state.initialize = params;
      send({
        id,
        result: {
          capabilities: {
            semanticTokensProvider: { legend: { tokenTypes: ["class", "selfParameter"], tokenModifiers: ["declaration", "builtin"] }, full: true },
          },
          serverInfo: { name: "fake" },
        },
      });
      break;
    case "initialized": {
      const requestId = nextId++;
      asked.set(requestId, (result) => (state.configuration = result));
      state.configurationAsked++;
      // Diagnostics for a document nobody opened, which a session must drop.
      publish("file:///work/stray.pjx", 1);
      send({ id: requestId, method: "workspace/configuration", params: { items: sections.map((section) => ({ section, scopeUri: params?.scopeUri })) } });
      break;
    }
    case "workspace/didChangeConfiguration":
      state.nudges++;
      break;
    case "textDocument/didOpen":
      state.documents.push({ event: "open", uri: params.textDocument.uri, version: params.textDocument.version, languageId: params.textDocument.languageId, text: params.textDocument.text });
      publish(params.textDocument.uri, params.textDocument.version);
      break;
    case "textDocument/didChange":
      state.documents.push({ event: "change", uri: params.textDocument.uri, version: params.textDocument.version, text: params.contentChanges[0].text });
      publish(params.textDocument.uri, params.textDocument.version);
      break;
    case "textDocument/didClose":
      state.documents.push({ event: "close", uri: params.textDocument.uri });
      break;
    case "workspace/didChangeWatchedFiles":
      state.watched.push(...params.changes.map((c) => c.uri));
      break;
    case "textDocument/semanticTokens/full":
      send({ id, result: { data: [1, 0, 3, 0, 1] } });
      break;
    case "test/state":
      send({ id, result: state });
      break;
    case "test/publish":
      send({ method: "textDocument/publishDiagnostics", params: params });
      break;
    case "shutdown":
      send({ id, result: null });
      break;
    case "exit":
      process.exit(0);
    case "test/crash":
      process.exit(7);
    default:
      if (id !== undefined) send({ id, result: null });
  }
}

// A diagnostic for every open document, so the session's version bookkeeping can be seen.
function publish(uri, version) {
  send({
    method: "textDocument/publishDiagnostics",
    params: { uri, version, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, message: "fake" }] },
  });
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const head = buffer.indexOf("\r\n\r\n");
    if (head < 0) return;
    const length = Number(/Content-Length: *(\d+)/i.exec(buffer.subarray(0, head).toString())[1]);
    if (buffer.length < head + 4 + length) return;
    const body = buffer.subarray(head + 4, head + 4 + length).toString("utf8");
    buffer = buffer.subarray(head + 4 + length);
    handle(JSON.parse(body));
    // A test that does not own our stdout reads what we recorded from this file.
    if (process.env.FAKE_STATE) writeFileSync(process.env.FAKE_STATE, JSON.stringify(state));
  }
});
