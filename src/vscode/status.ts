import * as vscode from "vscode";
import { TEMPLATE_LANGUAGE_ID } from "./config.ts";
import type { Manifests } from "./manifest-service.ts";
import type { PythonBlocks } from "./python-server.ts";

/** "pyjinhx: limited" while a .pjx file is open in a folder whose manifest could not be read; the tooltip also says when the python block is off. */
export function registerStatus(context: vscode.ExtensionContext, manifests: Manifests, blocks: PythonBlocks): void {
  const item = vscode.window.createStatusBarItem("pyjinhx.limited", vscode.StatusBarAlignment.Right, 90);
  item.name = "PyJinHx";
  item.command = "pyjinhx.showOutput";
  const update = () => {
    const document = vscode.window.activeTextEditor?.document;
    const isTemplate = document?.languageId === TEMPLATE_LANGUAGE_ID;
    const reason = isTemplate ? manifests.limitedReason(document.uri) : undefined;
    const blockOff = isTemplate && blocks.hasBlock(document) ? blocks.offReason() : undefined;
    if (!reason && !blockOff) return item.hide();
    const limited = reason && `Tags and props come from the .pjx files only: no hover details, no diagnostics.\n\n${reason}.\n\nFix: install pyjinhx 1.17 or later in the project's environment, or set pyjinhx.pythonPath.`;
    item.text = reason ? "pyjinhx: limited" : "pyjinhx: python block off";
    item.tooltip = [limited, blockOff && `Python block: off — ${blockOff}.`].filter(Boolean).join("\n\n");
    item.show();
  };
  context.subscriptions.push(item, manifests.onDidChange(update), blocks.onDidChange(update), vscode.window.onDidChangeActiveTextEditor(update));
  update();
}
