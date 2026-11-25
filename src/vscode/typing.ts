import * as vscode from "vscode";
import { strayBraceAfterBlockOpener } from "../core/block-opener.ts";

/**
 * `{` auto-closes to `{}`; typing `#` inside it starts a block opener, so the `}` goes.
 * Acts on a single-cursor, single-character `#` keystroke only (not paste, not multi-cursor).
 */
export function registerTyping(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
      const editor = vscode.window.activeTextEditor;
      const [change] = contentChanges;
      if (document.languageId !== "pyjinhx" || editor?.document !== document) return;
      if (contentChanges.length !== 1 || change.text !== "#" || change.rangeLength !== 0) return;
      const stray = strayBraceAfterBlockOpener(document.getText(), change.rangeOffset);
      if (stray === null) return;
      const range = new vscode.Range(document.positionAt(stray), document.positionAt(stray + 1));
      void editor.edit((edit) => edit.delete(range), { undoStopBefore: false, undoStopAfter: false });
    }),
  );
}
