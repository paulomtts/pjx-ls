import * as assert from "node:assert";
import * as vscode from "vscode";

// Named to sort first: this must be the first forwarded request of the session, asked once.
suite("cold start", () => {
  test("the first completion after activation already has HTML items", async () => {
    await vscode.extensions.getExtension("paulomtts.pyjinhx-syntax-support")?.activate();
    const doc = await vscode.workspace.openTextDocument({ language: "pyjinhx", content: "<di" });
    const list = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, new vscode.Position(0, 3));
    const labels = list.items.map((i) => (typeof i.label === "string" ? i.label : i.label.label));
    assert.ok(labels.includes("div"), `div among ${labels.length} items`);
  });
});
