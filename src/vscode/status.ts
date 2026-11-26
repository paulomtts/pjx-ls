import * as vscode from "vscode";
import { TEMPLATE_LANGUAGE_ID } from "./config.ts";
import type { Manifests } from "./manifest-service.ts";

/** "pyjinhx: limited" while a .pjx file is open in a folder whose manifest could not be read. */
export function registerStatus(context: vscode.ExtensionContext, manifests: Manifests): void {
  const item = vscode.window.createStatusBarItem("pyjinhx.limited", vscode.StatusBarAlignment.Right, 90);
  item.name = "PyJinHx";
  item.text = "pyjinhx: limited";
  item.command = "pyjinhx.showOutput";
  const update = () => {
    const document = vscode.window.activeTextEditor?.document;
    const reason = document?.languageId === TEMPLATE_LANGUAGE_ID ? manifests.limitedReason(document.uri) : undefined;
    if (!reason) return item.hide();
    item.tooltip = `Tags and props come from the .pjx files only: no hover details, no diagnostics.\n\n${reason}.\n\nFix: install pyjinhx 1.17 or later in the project's environment, or set pyjinhx.pythonPath.`;
    item.show();
  };
  context.subscriptions.push(item, manifests.onDidChange(update), vscode.window.onDidChangeActiveTextEditor(update));
  update();
}
