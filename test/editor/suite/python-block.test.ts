import * as assert from "node:assert";
import * as vscode from "vscode";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const root = () => vscode.workspace.workspaceFolders![0].uri;
const open = (file: string) => vscode.workspace.openTextDocument(vscode.Uri.joinPath(root(), "ui", file));

// The server starts lazily and analyses the first time slowly, so each ask is repeated until it holds.
async function eventually<T>(ask: () => Thenable<T> | T, holds: (v: T) => boolean): Promise<T> {
  let value = await ask();
  for (let attempt = 0; attempt < 60 && !holds(value); attempt++) {
    await wait(300);
    value = await ask();
  }
  return value;
}

const tokensOf = (uri: vscode.Uri) => vscode.commands.executeCommand<vscode.SemanticTokens | undefined>("vscode.provideDocumentSemanticTokens", uri);
const none = (t: vscode.SemanticTokens | undefined) => !t || t.data.length === 0;

// The tokens as line, column, text and type name.
function decode(doc: vscode.TextDocument, data: Uint32Array, legend: vscode.SemanticTokensLegend) {
  const out: { line: number; text: string; type: string }[] = [];
  let line = 0;
  let column = 0;
  for (let i = 0; i < data.length; i += 5) {
    line += data[i];
    column = data[i] ? data[i + 1] : column + data[i + 1];
    out.push({ line, text: doc.lineAt(line).text.slice(column, column + data[i + 2]), type: legend.tokenTypes[data[i + 3]] });
  }
  return out;
}

suite("python block tokens", () => {
  teardown(async () => {
    await vscode.workspace.getConfiguration("pyjinhx").update("pythonBlock.enabled", undefined, vscode.ConfigurationTarget.Global);
  });

  test("names in the block are coloured by type and the markup is left alone", async () => {
    const doc = await open("tokens.pjx");
    await vscode.window.showTextDocument(doc);
    const tokens = (await eventually(() => tokensOf(doc.uri), (t) => !none(t)))!;
    assert.ok(tokens.data.length > 0, "no tokens");
    const legend = (await vscode.commands.executeCommand<vscode.SemanticTokensLegend>("vscode.provideDocumentSemanticTokensLegend", doc.uri))!;
    const found = decode(doc, tokens.data, legend);
    const typeOf = (text: string, line: number) => found.find((t) => t.text === text && t.line === line)?.type;
    assert.strictEqual(typeOf("TodoAppContext", 5), "class");
    assert.strictEqual(typeOf("count", 6), "property");
    assert.strictEqual(typeOf("self", 8), "parameter");
    assert.ok(found.every((t) => t.line >= 1 && t.line <= 9), "a token outside the block");
  });

  test("a .pjx with no block has no tokens", async () => {
    const doc = await open("alert.pjx");
    await vscode.window.showTextDocument(doc);
    assert.ok(none(await tokensOf(doc.uri)));
  });

  test("with pyjinhx.pythonBlock.enabled off the block has no tokens", async () => {
    const doc = await open("tokens.pjx");
    await vscode.window.showTextDocument(doc);
    await eventually(() => tokensOf(doc.uri), (t) => !none(t));
    await vscode.workspace.getConfiguration("pyjinhx").update("pythonBlock.enabled", false, vscode.ConfigurationTarget.Global);
    assert.ok(none(await eventually(() => tokensOf(doc.uri), none)));
  });
});

suite("python block diagnostics", () => {
  const bad = () => vscode.Uri.joinPath(root(), "ui", "bad_block.pjx");
  const text = '{#python\nclass Keys:\n    TODOS = "todos"\n\n\ndef size(key: Keys | None) -> int:\n    return len(key.TODOS) + missing\n#}\n<p>{{ size }}</p>\n';
  const basedpyright = (uri: vscode.Uri) => vscode.languages.getDiagnostics(uri).filter((d) => d.source === "basedpyright");

  // Created here, not committed: the fixture project is also the manifest contract's project.
  suiteSetup(async () => vscode.workspace.fs.writeFile(bad(), Buffer.from(text)));
  suiteTeardown(async () => {
    await vscode.workspace.fs.delete(bad(), { useTrash: false });
  });
  teardown(async () => {
    await vscode.workspace.getConfiguration("pyjinhx").update("pythonBlock.diagnostics", undefined, vscode.ConfigurationTarget.Global);
  });

  test("errors lie on the block's lines, with source basedpyright", async () => {
    const doc = await vscode.workspace.openTextDocument(bad());
    await vscode.window.showTextDocument(doc);
    const found = await eventually(() => basedpyright(doc.uri), (d) => d.length === 2);
    assert.deepStrictEqual(found.map((d) => [d.range.start.line, d.severity, typeof d.code === "object" ? d.code.value : d.code]).sort(), [[6, vscode.DiagnosticSeverity.Error, "reportOptionalMemberAccess"], [6, vscode.DiagnosticSeverity.Error, "reportUndefinedVariable"]]);
    assert.ok(found.every((d) => d.range.start.line >= 1 && d.range.end.line <= 6));
  });

  test("a block with no errors has nothing above a hint", async () => {
    const doc = await open("tokens.pjx");
    await vscode.window.showTextDocument(doc);
    await eventually(() => tokensOf(doc.uri), (t) => !none(t));
    // The server's unused-parameter hint on `ctx` shows its analysis of this text is in.
    await eventually(() => basedpyright(doc.uri), (d) => d.some((x) => x.severity === vscode.DiagnosticSeverity.Hint));
    assert.deepStrictEqual(basedpyright(doc.uri).filter((d) => d.severity !== vscode.DiagnosticSeverity.Hint), []);
  });

  test("with pyjinhx.pythonBlock.diagnostics off there are none", async () => {
    const doc = await vscode.workspace.openTextDocument(bad());
    await vscode.window.showTextDocument(doc);
    await eventually(() => basedpyright(doc.uri), (d) => d.length > 0);
    await vscode.workspace.getConfiguration("pyjinhx").update("pythonBlock.diagnostics", false, vscode.ConfigurationTarget.Global);
    assert.deepStrictEqual(await eventually(() => basedpyright(doc.uri), (d) => d.length === 0), []);
  });
});
