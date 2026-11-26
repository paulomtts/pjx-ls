import * as assert from "node:assert";
import * as vscode from "vscode";
import { virtualHtml } from "../../../src/core/virtual-html.ts";
import { VIEW_SCHEME, viewPath } from "../../../src/core/view-uri.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

suite("virtual documents", () => {
  test("the view of an open .pjx updates after an edit", async () => {
    const source = await vscode.workspace.openTextDocument({ language: "pyjinhx", content: "<p>{{ a }}</p>\n" });
    const view = await vscode.workspace.openTextDocument(
      vscode.Uri.from({ scheme: VIEW_SCHEME, path: viewPath(source.uri.toString()) }),
    );
    assert.strictEqual(view.getText(), virtualHtml(source.getText()));

    const edit = new vscode.WorkspaceEdit();
    edit.insert(source.uri, new vscode.Position(0, 0), "<i>{% x %}</i>\n");
    await vscode.workspace.applyEdit(edit);

    for (let attempt = 0; attempt < 20 && view.getText() !== virtualHtml(source.getText()); attempt++) await wait(100);
    assert.strictEqual(view.getText(), `<i>       </i>\n<p>       </p>\n`);
  });
});
