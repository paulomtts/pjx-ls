import * as assert from "node:assert";
import * as fs from "node:fs";
import * as vscode from "vscode";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const root = () => vscode.workspace.workspaceFolders![0].uri;
const file = () => vscode.Uri.joinPath(root(), "ui", "fmt_bodies.pjx");
const GLOBAL = vscode.ConfigurationTarget.Global;

async function eventually<T>(ask: () => Thenable<T> | T, holds: (v: T) => boolean): Promise<T> {
  let value = await ask();
  for (let attempt = 0; attempt < 30 && !holds(value); attempt++) {
    await wait(300);
    value = await ask();
  }
  return value;
}

// Rewrites the file on disk and shows a document that holds exactly that.
async function reset(text: string): Promise<vscode.TextDocument> {
  fs.writeFileSync(file().fsPath, text);
  const doc = await vscode.workspace.openTextDocument(file());
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand("workbench.action.files.revert");
  return eventually(() => doc, (d) => d.getText() === text);
}

// Format Document as the editor does it; returns how many edits were applied.
async function format(doc: vscode.TextDocument, tabSize = 2, insertSpaces = true): Promise<number> {
  const edits = (await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>("vscode.executeFormatDocumentProvider", doc.uri, { tabSize, insertSpaces })) ?? [];
  const change = new vscode.WorkspaceEdit();
  change.set(doc.uri, edits);
  await vscode.workspace.applyEdit(change);
  return edits.length;
}

const BLOCKS = "<p>hi</p>\n{#css\n.a{color:red}\n#}\n{#js\nlet a=1\n#}\n";
const BLOCKS_DONE = "<p>hi</p>\n{#css\n.a {\n  color: red\n}\n#}\n{#js\nlet a = 1\n#}\n";
const ELEMENTS = "<div><style>\n.a{color:red}\n</style>\n<script>\nlet a=1\n</script></div>\n";
const ELEMENTS_DONE = "<div>\n  <style>\n    .a {\n      color: red\n    }\n  </style>\n  <script>\n    let a = 1\n  </script>\n</div>\n";

// Named to sort after the suites that count on a cold manifest (aa-cold-start, forwarding).
suite("format css and js bodies", () => {
  suiteSetup(async () => {
    fs.writeFileSync(file().fsPath, BLOCKS);
    await vscode.workspace.getConfiguration("pyjinhx").update("pythonBlock.enabled", false, GLOBAL);
  });
  suiteTeardown(async () => {
    await vscode.workspace.getConfiguration("pyjinhx").update("pythonBlock.enabled", undefined, GLOBAL);
    await vscode.commands.executeCommand("workbench.action.files.revert");
    fs.rmSync(file().fsPath, { force: true });
    const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    assert.ok(!tabs.some((t) => String((t.input as { uri?: vscode.Uri } | undefined)?.uri).startsWith("pjx-format:")), "a pjx-format tab is open");
    assert.deepStrictEqual(vscode.workspace.textDocuments.filter((d) => d.isDirty && d.uri.scheme === "pjx-format").map((d) => d.uri.toString()), []);
  });
  teardown(async () => {
    const pyjinhx = vscode.workspace.getConfiguration("pyjinhx");
    await pyjinhx.update("format.css", undefined, GLOBAL);
    await pyjinhx.update("format.js", undefined, GLOBAL);
    await vscode.workspace.getConfiguration("css").update("format.enable", undefined, GLOBAL);
    await vscode.workspace.getConfiguration("editor", { languageId: "pyjinhx" }).update("formatOnSave", undefined, GLOBAL, true);
    await vscode.commands.executeCommand("workbench.action.files.revert");
  });

  test("blocks are formatted in column 0, and a second run does nothing", async () => {
    const doc = await reset(BLOCKS);
    assert.ok((await format(doc)) > 0);
    assert.strictEqual(doc.getText(), BLOCKS_DONE);
    assert.strictEqual(await format(doc), 0);
  });

  test("elements are formatted one level inside their tags, and a second run does nothing", async () => {
    const doc = await reset(ELEMENTS);
    assert.ok((await format(doc)) > 0);
    assert.strictEqual(doc.getText(), ELEMENTS_DONE);
    assert.strictEqual(await format(doc), 0);
  });

  test("the editor's tabSize is used inside the body", async () => {
    const doc = await reset("{#css\n.a{color:red}\n#}\n");
    await format(doc, 4, true);
    assert.strictEqual(doc.getText(), "{#css\n.a {\n    color: red\n}\n#}\n");
    await format(doc, 4, false);
    assert.strictEqual(doc.getText(), "{#css\n.a {\n\tcolor: red\n}\n#}\n");
  });

  test("pyjinhx.format.css off leaves css as typed, and js off leaves js", async () => {
    await vscode.workspace.getConfiguration("pyjinhx").update("format.css", false, GLOBAL);
    let doc = await reset(BLOCKS);
    await format(doc);
    assert.strictEqual(doc.getText(), "<p>hi</p>\n{#css\n.a{color:red}\n#}\n{#js\nlet a = 1\n#}\n");
    await vscode.workspace.getConfiguration("pyjinhx").update("format.css", undefined, GLOBAL);
    await vscode.workspace.getConfiguration("pyjinhx").update("format.js", false, GLOBAL);
    doc = await reset(BLOCKS);
    await format(doc);
    assert.strictEqual(doc.getText(), "<p>hi</p>\n{#css\n.a {\n  color: red\n}\n#}\n{#js\nlet a=1\n#}\n");
  });

  test("css.format.enable off leaves css as typed and the markup is still formatted", async () => {
    await vscode.workspace.getConfiguration("css").update("format.enable", false, GLOBAL);
    const doc = await reset("<div><p>hi</p></div>\n{#css\n.a{color:red}\n#}\n");
    await format(doc);
    assert.strictEqual(doc.getText(), "<div>\n  <p>hi</p>\n</div>\n{#css\n.a{color:red}\n#}\n");
  });

  test("a body with Jinja and a script that is not javascript are left as typed", async () => {
    const text = "<script>\nconsole.log( {{ v }} )\n</script>\n<script type=\"application/json\">\n{\"a\":1}\n</script>\n";
    const doc = await reset(text);
    await format(doc);
    assert.ok(doc.getText().includes("\nconsole.log( {{ v }} )\n"));
    assert.ok(doc.getText().includes("\n{\"a\":1}\n"));
  });

  test("a template literal in a block keeps its second line", async () => {
    const doc = await reset("{#js\nlet a=`x\n  y`\n#}\n");
    await format(doc);
    assert.strictEqual(doc.getText(), "{#js\nlet a = `x\n  y`\n#}\n");
  });

  test("CRLF stays CRLF", async () => {
    const doc = await reset(BLOCKS.replaceAll("\n", "\r\n"));
    await format(doc);
    assert.strictEqual(doc.getText(), BLOCKS_DONE.replaceAll("\n", "\r\n"));
  });

  test("a python block, a css block and a style element are formatted in one run", async () => {
    const doc = await reset("{#python\nx=1\n#}\n<div><style>\n.a{color:red}\n</style></div>\n{#css\n.b{color:red}\n#}\n");
    await format(doc);
    assert.strictEqual(doc.getText(), "{#python\nx = 1\n#}\n<div>\n  <style>\n    .a {\n      color: red\n    }\n  </style>\n</div>\n{#css\n.b {\n  color: red\n}\n#}\n");
    assert.strictEqual(await format(doc), 0);
  });

  test("the pyjinhx.formatSlots command does the same", async () => {
    const doc = await reset(ELEMENTS);
    vscode.window.activeTextEditor!.options = { tabSize: 2, insertSpaces: true };
    await vscode.commands.executeCommand("pyjinhx.formatSlots");
    assert.strictEqual(doc.getText(), ELEMENTS_DONE);
  });

  test("on save the file on disk holds the formatted bodies", async () => {
    const doc = await reset(BLOCKS);
    vscode.window.activeTextEditor!.options = { tabSize: 2, insertSpaces: true };
    await vscode.workspace.getConfiguration("editor", { languageId: "pyjinhx" }).update("formatOnSave", true, GLOBAL, true);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(doc.lineCount - 1, 0), "\n");
    await vscode.workspace.applyEdit(edit);
    const undo = new vscode.WorkspaceEdit();
    undo.delete(doc.uri, new vscode.Range(doc.lineCount - 2, 0, doc.lineCount - 1, 0));
    await vscode.workspace.applyEdit(undo);
    assert.ok(doc.isDirty);
    await doc.save();
    assert.strictEqual(fs.readFileSync(doc.uri.fsPath, "utf8"), BLOCKS_DONE);
  });
});
