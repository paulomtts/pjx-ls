import * as assert from "node:assert";
import * as vscode from "vscode";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const root = () => vscode.workspace.workspaceFolders![0].uri;

// Opens a project file and puts `marked` in it, unsaved; `|` is where the cursor is.
async function edit(file: string, marked: string): Promise<{ doc: vscode.TextDocument; position: vscode.Position }> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root(), "ui", file));
  await vscode.window.showTextDocument(doc);
  const all = new vscode.Range(0, 0, doc.lineCount, 0);
  const change = new vscode.WorkspaceEdit();
  change.replace(doc.uri, all, marked.replace("|", ""));
  await vscode.workspace.applyEdit(change);
  return { doc, position: doc.positionAt(marked.indexOf("|")) };
}

const labelOf = (i: vscode.CompletionItem) => (typeof i.label === "string" ? i.label : i.label.label);

// The servers and the first manifest run start lazily, so each check asks until it holds.
async function eventually<T>(ask: () => Thenable<T> | T, holds: (v: T) => boolean): Promise<T> {
  let value = await ask();
  for (let attempt = 0; attempt < 30 && !holds(value); attempt++) {
    await wait(300);
    value = await ask();
  }
  return value;
}

async function complete(file: string, marked: string, holds: (labels: string[]) => boolean = (l) => l.length > 0): Promise<vscode.CompletionItem[]> {
  const { doc, position } = await edit(file, marked);
  const ask = async () => ((await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, position))?.items ?? []);
  return eventually(ask, (items) => holds(items.map(labelOf)));
}

suite("pjx layer", () => {
  suiteSetup(async () => {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root(), "ui", "alert.pjx")));
    await vscode.commands.executeCommand("pyjinhx.refreshManifest");
  });

  test("< offers HTML tags and components together", async () => {
    const labels = (await complete("alert.pjx", "<|", (l) => l.includes("Badge") && l.includes("div"))).map(labelOf);
    assert.ok(labels.includes("Badge") && labels.includes("div"), labels.join());
  });

  test("inside <Badge the props are offered, required ones first", async () => {
    const items = await complete("alert.pjx", "<Badge |", (l) => l.includes("tone"));
    const order = items.filter((i) => ["label", "tone", "count"].includes(labelOf(i))).sort((a, b) => a.sortText!.localeCompare(b.sortText!)).map(labelOf);
    assert.deepStrictEqual(order[0], "label");
    assert.deepStrictEqual(order.sort(), ["count", "label", "tone"]);
  });

  test('inside tone=" the Literal values are offered', async () => {
    const labels = (await complete("alert.pjx", '<Badge tone="|"', (l) => l.includes("calm"))).map(labelOf);
    assert.ok(labels.includes("calm") && labels.includes("late"), labels.join());
  });

  test("{{ offers the template's own props and members", async () => {
    const labels = (await complete("badge.pjx", "<b>{{ |", (l) => l.includes("label"))).map(labelOf);
    assert.ok(labels.includes("label") && labels.includes("shout"), labels.join());
  });

  test("a {#css block above the cursor does not break props or hover", async () => {
    const above = "{#css\n.a { color: red; }\n#}\n";
    const items = await complete("alert.pjx", `${above}<Badge |`, (l) => l.includes("tone"));
    assert.ok(items.map(labelOf).includes("tone"));
    const { doc } = await edit("alert.pjx", `${above}<Alert></Alert>\n<Badge label="x"></Badge>`);
    const hovers = await eventually(() => vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, new vscode.Position(4, 3)), (h) => h.length > 0);
    assert.match(hovers.flatMap((h) => h.contents).map((c) => (typeof c === "string" ? c : c.value)).join("\n"), /Badge\(label: str/);
  });

  test("what is typed reaches the manifest, and a revert takes it back", async () => {
    const items = await complete("alert.pjx", "{#def typed: int #}\n{{ |", (l) => l.includes("typed"));
    assert.ok(!items.map(labelOf).includes("tone"));
    const { doc } = await edit("alert.pjx", "{#def typed: int #}\n{{ ");
    await vscode.commands.executeCommand("workbench.action.files.revert");
    assert.ok(!doc.isDirty);
    // Line 3 of the saved file is `<div class="alert alert--{{ tone }}">`: column 28 is the start of `tone`.
    const names = () => vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, new vscode.Position(2, 28)).then((l) => (l?.items ?? []).map(labelOf));
    const after = await eventually(names, (l) => l.includes("dismissible"));
    assert.ok(after.includes("dismissible") && !after.includes("typed"), after.join());
  });

  test("a prop named like an HTML global attribute is offered once, and other HTML attributes stay", async () => {
    const items = await complete("alert.pjx", "<Modal |", (l) => l.includes("title") && l.includes("class"));
    assert.strictEqual(items.filter((i) => labelOf(i) === "title").length, 1);
    assert.ok(items.map(labelOf).includes("class"));
  });

  test("hover on a component tag shows its signature", async () => {
    const { doc } = await edit("alert.pjx", '<Badge label="x"></Badge>');
    const hovers = await eventually(() => vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, new vscode.Position(0, 3)), (h) => h.length > 0);
    const text = hovers.flatMap((h) => h.contents).map((c) => (typeof c === "string" ? c : c.value)).join("\n");
    assert.match(text, /Badge\(label: str, tone: Literal\["calm", "late"\] = "calm", count: int = 0\)/);
  });

  test("go to definition on a tag and on a prop", async () => {
    const { doc } = await edit("alert.pjx", '<Badge tone="late"></Badge>');
    const at = (character: number) => vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>("vscode.executeDefinitionProvider", doc.uri, new vscode.Position(0, character));
    const target = (l: vscode.Location | vscode.LocationLink) => ("targetUri" in l ? { uri: l.targetUri, line: l.targetRange.start.line } : { uri: l.uri, line: l.range.start.line });
    const tag = (await eventually(() => at(3), (r) => r.length > 0)).map(target);
    assert.ok(tag.some((t) => t.uri.path.endsWith("/ui/badge.py") && t.line === 5), JSON.stringify(tag));
    const prop = (await at(9)).map(target);
    assert.ok(prop.some((t) => t.uri.path.endsWith("/ui/badge.py") && t.line === 7), JSON.stringify(prop));
  });

  test("the manifest's diagnostics are shown with their code and source", async () => {
    const open = async (file: string) => vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root(), "ui", file)));
    const found = (file: string) => vscode.languages.getDiagnostics(vscode.Uri.joinPath(root(), "ui", file));
    await open("broken.pjx");
    const broken = await eventually(() => found("broken.pjx"), (d) => d.length > 0);
    assert.deepStrictEqual(broken.map((d) => [d.code, d.source, d.severity, d.range.start.line]), [["second-block", "pyjinhx", vscode.DiagnosticSeverity.Error, 4]]);
    await open("panel.pjx");
    const stub = await eventually(() => found("panel.pjx"), (d) => d.length > 0);
    assert.deepStrictEqual(stub.map((d) => [d.code, d.severity]), [["stub-missing", vscode.DiagnosticSeverity.Warning]]);
  });

  test("a stale {#def header is flagged on the header from the manifest, not from a sibling file", async () => {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root(), "ui", "stale.pjx")));
    const found = () => vscode.languages.getDiagnostics(vscode.Uri.joinPath(root(), "ui", "stale.pjx"));
    const [stale] = await eventually(found, (d) => d.length > 0);
    assert.strictEqual(stale.code, "stale-def-header");
    assert.strictEqual(stale.range.start.line, 0);
    assert.strictEqual(vscode.languages.getDiagnostics(vscode.Uri.joinPath(root(), "ui", "alert.pjx")).length, 0);
  });

  test("without pyjinhx the .pjx files still give tags, and definitions", async () => {
    const config = vscode.workspace.getConfiguration("pyjinhx", root());
    const before = config.inspect<string>("pythonPath")?.workspaceValue;
    try {
      await config.update("pythonPath", "/nonexistent/python", vscode.ConfigurationTarget.Workspace);
      await vscode.commands.executeCommand("pyjinhx.refreshManifest");
      const labels = (await complete("alert.pjx", "<Ba|", (l) => l.includes("Badge"))).map(labelOf);
      assert.ok(labels.includes("Badge"), labels.join());
      const { doc } = await edit("alert.pjx", "<Badge></Badge>");
      const found = await eventually(() => vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>("vscode.executeDefinitionProvider", doc.uri, new vscode.Position(0, 3)), (r) => r.length > 0);
      assert.ok(found.some((l) => ("targetUri" in l ? l.targetUri : l.uri).path.endsWith("/ui/badge.pjx")));
      assert.strictEqual(vscode.languages.getDiagnostics(vscode.Uri.joinPath(root(), "ui", "broken.pjx")).length, 0);
    } finally {
      await config.update("pythonPath", before, vscode.ConfigurationTarget.Workspace);
      await vscode.commands.executeCommand("pyjinhx.refreshManifest");
    }
  });
});
