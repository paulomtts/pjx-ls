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

suite("python block hover and definition", () => {
  // The position of `text` on a 0-based line, plus `offset` characters.
  const at = (doc: vscode.TextDocument, line: number, text: string, offset = 0) => new vscode.Position(line, doc.lineAt(line).text.indexOf(text) + offset);
  const textOf = (hover: vscode.Hover) => hover.contents.map((c) => (typeof c === "string" ? c : c.value)).join("\n");
  const hoversAt = (doc: vscode.TextDocument, position: vscode.Position) => vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, position);

  test("hover on a field gives its type, once", async () => {
    const doc = await open("tokens.pjx");
    await vscode.window.showTextDocument(doc);
    const hovers = await eventually(() => hoversAt(doc, at(doc, 9, "count")), (h) => h.length > 0);
    assert.strictEqual(hovers.length, 1, hovers.map(textOf).join("\n--\n"));
    assert.match(textOf(hovers[0]), /int/);
  });

  test("go to definition on a class in the block lands on its class line", async () => {
    const doc = await open("tokens.pjx");
    await vscode.window.showTextDocument(doc);
    const ask = () => vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>("vscode.executeDefinitionProvider", doc.uri, at(doc, 8, "TodoAppContext"));
    const found = await eventually(ask, (d) => d.length > 0);
    const target = (d: vscode.Location | vscode.LocationLink) => ("targetUri" in d ? { uri: d.targetUri, range: d.targetSelectionRange ?? d.targetRange } : d);
    assert.strictEqual(found.length, 1);
    assert.strictEqual(target(found[0]).uri.toString(), doc.uri.toString());
    assert.strictEqual(target(found[0]).range.start.line, 5);
  });

  test("on the markup line the server says nothing", async () => {
    const doc = await open("tokens.pjx");
    await vscode.window.showTextDocument(doc);
    const hovers = (await hoversAt(doc, at(doc, 11, "<p>", 1))) ?? [];
    assert.ok(hovers.every((h) => !textOf(h).includes("```python")), hovers.map(textOf).join("\n"));
  });
});

suite("python block completion and signature help", () => {
  const file = () => vscode.Uri.joinPath(root(), "ui", "typing_block.pjx");
  const head = '{#python\nfrom dataclasses import dataclass\n\n\n@dataclass\nclass TodoAppContext:\n    count: int = 0\n\n    def load(self, ctx: "TodoAppContext") -> int:\n';
  const labelOf = (i: vscode.CompletionItem) => (typeof i.label === "string" ? i.label : i.label.label);

  // Created here, not committed: the fixture project is also the manifest contract's project.
  suiteSetup(async () => vscode.workspace.fs.writeFile(file(), Buffer.from(head + "        return 0\n#}\n<p></p>\n")));
  suiteTeardown(async () => {
    await vscode.workspace.fs.delete(file(), { useTrash: false });
  });

  // Puts `marked` in the document, unsaved; `|` is where the cursor is.
  async function edit(marked: string) {
    const doc = await vscode.workspace.openTextDocument(file());
    await vscode.window.showTextDocument(doc);
    const change = new vscode.WorkspaceEdit();
    change.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), marked.replace("|", ""));
    await vscode.workspace.applyEdit(change);
    return { doc, position: doc.positionAt(marked.indexOf("|")) };
  }
  const complete = (doc: vscode.TextDocument, position: vscode.Position, holds: (labels: string[]) => boolean) =>
    eventually(
      async () => ((await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, position))?.items ?? []).map(labelOf),
      holds,
    );

  test("self. inside a method offers the field and the method", async () => {
    const { doc, position } = await edit(head + "        return self.|\n#}\n<p></p>\n");
    const labels = await complete(doc, position, (l) => l.includes("count"));
    assert.ok(labels.includes("count") && labels.includes("load"), labels.slice(0, 15).join());
  });

  test("a call shows its signature", async () => {
    const { doc, position } = await edit(head + "        return 0\n\n_c = TodoAppContext(|\n#}\n<p></p>\n");
    const ask = () => vscode.commands.executeCommand<vscode.SignatureHelp | undefined>("vscode.executeSignatureHelpProvider", doc.uri, position, "(");
    const help = await eventually(ask, (h) => !!h?.signatures.length);
    assert.match(help!.signatures[0].label, /count: int = 0/);
  });

  test("in the markup < still offers HTML tags and no Python names", async () => {
    const { doc, position } = await edit(head + "        return 0\n#}\n<|\n");
    const labels = await complete(doc, position, (l) => l.includes("div"));
    assert.ok(labels.includes("div"));
    assert.ok(!labels.includes("self") && !labels.includes("dataclass") && !labels.includes("TodoAppContext"), labels.join());
  });
});
