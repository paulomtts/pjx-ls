import * as vscode from "vscode";
import { formatPyjinhxTemplate } from "../core/format.ts";
import { FORMAT_SLOTS_COMMAND, isComponentTemplate, TEMPLATE_SELECTOR } from "./config.ts";

function fullDocumentEdit(document: vscode.TextDocument, formattedText: string): vscode.TextEdit {
  const lastLine = document.lineAt(document.lineCount - 1);
  const fullRange = new vscode.Range(document.positionAt(0), lastLine.range.end);
  return vscode.TextEdit.replace(fullRange, formattedText);
}

/** Returns the formatted text only if it differs from the current document, else null. */
function nextFormattedText(document: vscode.TextDocument): string | null {
  if (!isComponentTemplate(document)) {
    return null;
  }
  const formatted = formatPyjinhxTemplate(document.getText());
  return formatted === document.getText() ? null : formatted;
}

export function registerFormatting(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(TEMPLATE_SELECTOR, {
      provideDocumentFormattingEdits(document) {
        const formatted = nextFormattedText(document);
        return formatted === null ? [] : [fullDocumentEdit(document, formatted)];
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(FORMAT_SLOTS_COMMAND, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const formatted = nextFormattedText(editor.document);
      if (formatted === null) {
        return;
      }
      await editor.edit((builder) => {
        builder.replace(
          new vscode.Range(
            editor.document.positionAt(0),
            editor.document.lineAt(editor.document.lineCount - 1).range.end,
          ),
          formatted,
        );
      });
    }),
  );
}
