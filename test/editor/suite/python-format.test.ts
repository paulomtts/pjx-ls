import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { formatPyjinhxTemplate } from "../../../src/core/format.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const root = () => vscode.workspace.workspaceFolders![0].uri;
const file = () => vscode.Uri.joinPath(root(), "ui", "fmt_block.pjx");
const GLOBAL = vscode.ConfigurationTarget.Global;

const SOURCE = "{#python\nx=1\ny  =  2\n#}\n<div><p>hi</p></div>\n";
const FORMATTED = "{#python\nx = 1\ny = 2\n#}\n<div>\n  <p>hi</p>\n</div>\n";

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
async function format(doc: vscode.TextDocument): Promise<number> {
  const edits = (await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>("vscode.executeFormatDocumentProvider", doc.uri, { tabSize: 2, insertSpaces: true })) ?? [];
  const change = new vscode.WorkspaceEdit();
  change.set(doc.uri, edits);
  await vscode.workspace.applyEdit(change);
  return edits.length;
}

// Named to sort after the suites that count on a cold manifest (aa-cold-start, forwarding).
suite("format with ruff", () => {
  // The block's basedpyright is not wanted here, and starting it would change what the later suites find cold.
  suiteSetup(async () => {
    fs.writeFileSync(file().fsPath, SOURCE);
    await vscode.workspace.getConfiguration("pyjinhx").update("pythonBlock.enabled", false, GLOBAL);
  });
  suiteTeardown(async () => {
    await vscode.workspace.getConfiguration("pyjinhx").update("pythonBlock.enabled", undefined, GLOBAL);
    fs.rmSync(file().fsPath, { force: true });
  });
  teardown(async () => {
    await vscode.workspace.getConfiguration("pyjinhx").update("format.python", undefined, GLOBAL);
    await vscode.workspace.getConfiguration("editor", { languageId: "pyjinhx" }).update("formatOnSave", undefined, GLOBAL, true);
    await vscode.commands.executeCommand("workbench.action.files.revert");
  });

  test("Format Document formats the body and the markup, and a second run does nothing", async () => {
    const doc = await reset(SOURCE);
    assert.ok((await format(doc)) > 0);
    assert.strictEqual(doc.getText(), FORMATTED);
    assert.strictEqual(await format(doc), 0);
  });

  test("with pyjinhx.format.python off the body is left as typed", async () => {
    await vscode.workspace.getConfiguration("pyjinhx").update("format.python", "off", GLOBAL);
    const doc = await reset(SOURCE);
    await format(doc);
    assert.strictEqual(doc.getText(), "{#python\nx=1\ny  =  2\n#}\n<div>\n  <p>hi</p>\n</div>\n");
  });

  test("a body ruff rejects is left as typed, and the markup is still formatted", async () => {
    const doc = await reset(SOURCE.replace("x=1", "SYNTAX x=1"));
    await format(doc);
    assert.strictEqual(doc.getText(), "{#python\nSYNTAX x=1\ny  =  2\n#}\n<div>\n  <p>hi</p>\n</div>\n");
  });

  test("the pyjinhx.formatSlots command does the same", async () => {
    const doc = await reset(SOURCE);
    await vscode.commands.executeCommand("pyjinhx.formatSlots");
    assert.strictEqual(doc.getText(), FORMATTED);
  });

  test("a file without a block formats as before", async () => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root(), "ui", "alert.pjx"));
    await vscode.window.showTextDocument(doc);
    const expected = formatPyjinhxTemplate(doc.getText());
    await format(doc);
    assert.strictEqual(doc.getText(), expected);
    await vscode.commands.executeCommand("workbench.action.files.revert");
  });

  test("on save the file on disk holds the formatted body", async () => {
    const doc = await reset(SOURCE);
    await vscode.workspace.getConfiguration("editor", { languageId: "pyjinhx" }).update("formatOnSave", true, GLOBAL, true);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(doc.lineCount - 1, 0), "\n");
    await vscode.workspace.applyEdit(edit);
    const undo = new vscode.WorkspaceEdit();
    undo.delete(doc.uri, new vscode.Range(doc.lineCount - 2, 0, doc.lineCount - 1, 0));
    await vscode.workspace.applyEdit(undo);
    assert.ok(doc.isDirty);
    await doc.save();
    assert.strictEqual(fs.readFileSync(doc.uri.fsPath, "utf8"), FORMATTED);
    assert.strictEqual(doc.isDirty, false);
  });

  test("when ruff is nowhere, one notice offers to turn the setting off, once per session", async () => {
    // A PATH with node (the fake interpreter's shebang needs it) and no ruff.
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), "pjx-nopath-"));
    const node = (process.env.PATH ?? "").split(path.delimiter).map((d) => path.join(d, "node")).find((c) => fs.existsSync(c));
    assert.ok(node, "node is not on PATH");
    fs.symlinkSync(fs.realpathSync(node), path.join(bin, "node"));
    const oldPath = process.env.PATH;
    const shown: { message: string; buttons: string[] }[] = [];
    const real = vscode.window.showInformationMessage;
    (vscode.window as { showInformationMessage: unknown }).showInformationMessage = async (message: string, ...buttons: string[]) => (shown.push({ message, buttons }), "Turn off");
    process.env.PATH = bin;
    try {
      const doc = await reset(SOURCE.replace("x=1", "NOMODULE x=1"));
      await format(doc);
      assert.strictEqual(doc.getText(), "{#python\nNOMODULE x=1\ny  =  2\n#}\n<div>\n  <p>hi</p>\n</div>\n");
      await eventually(() => vscode.workspace.getConfiguration("pyjinhx").get("format.python"), (v) => v === "off");
      assert.strictEqual(shown.length, 1);
      assert.deepStrictEqual(shown[0].buttons, ["Turn off"]);
      assert.match(shown[0].message, /ruff/);
      assert.strictEqual(vscode.workspace.getConfiguration("pyjinhx").inspect("format.python")?.globalValue, "off");

      // Turned back on, still no ruff: the session has had its one notice.
      await vscode.workspace.getConfiguration("pyjinhx").update("format.python", "ruff", GLOBAL);
      await reset(SOURCE.replace("x=1", "NOMODULE x=1"));
      await format(doc);
      assert.strictEqual(shown.length, 1);
    } finally {
      process.env.PATH = oldPath;
      (vscode.window as { showInformationMessage: unknown }).showInformationMessage = real;
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });
});
