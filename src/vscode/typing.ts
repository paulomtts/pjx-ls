import * as vscode from "vscode";
import { BraceTracker } from "../core/block-opener.ts";
import { TEMPLATE_LANGUAGE_ID } from "./config.ts";

/**
 * `{` auto-closes to `{}`; typing `#` right after that starts a block opener, so the
 * `}` the editor inserted goes. Single-cursor keystrokes only (not paste, not multi-cursor),
 * and a `}` the user typed or that was already there stays.
 */
export function registerTyping(context: vscode.ExtensionContext): void {
  const trackers = new Map<string, BraceTracker>();
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => trackers.delete(document.uri.toString())),
    vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
      if (document.languageId !== TEMPLATE_LANGUAGE_ID) return;
      const key = document.uri.toString();
      const tracker = trackers.get(key) ?? trackers.set(key, new BraceTracker()).get(key)!;
      if (contentChanges.length !== 1) return tracker.reset();
      const [change] = contentChanges;
      const stray = tracker.onChange(
        { offset: change.rangeOffset, text: change.text, rangeLength: change.rangeLength },
        document.getText(),
      );
      const editor = vscode.window.activeTextEditor;
      if (stray === null || editor?.document !== document) return;
      const range = new vscode.Range(document.positionAt(stray), document.positionAt(stray + 1));
      void editor.edit((edit) => edit.delete(range), { undoStopBefore: false, undoStopAfter: false });
    }),
  );
}
