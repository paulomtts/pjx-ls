import * as assert from "node:assert";
import * as vscode from "vscode";

suite("language", () => {
  test("a .pjx file opens with language id pyjinhx", async () => {
    const [folder] = vscode.workspace.workspaceFolders ?? [];
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder.uri, "ui", "alert.pjx"));
    assert.strictEqual(doc.languageId, "pyjinhx");
  });
});
