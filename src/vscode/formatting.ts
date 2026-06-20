import * as vscode from "vscode";
import { formatPyjinhxTemplate } from "../core/format.ts";
import { findPythonBlock } from "../core/python-block.ts";
import { isComponentTemplate } from "./component-template.ts";
import { runRuffFormat } from "./ruff-format.ts";
import { CONFIG_SECTION, FORMAT_ON_SAVE_KEY, FORMAT_SLOTS_COMMAND } from "../config.ts";

const TEMPLATE_SELECTOR: vscode.DocumentSelector = [
  { language: "html", scheme: "file" },
  { language: "jinja", scheme: "file" },
  { language: "jinja-html", scheme: "file" },
  { language: "pyjinhx", scheme: "file" },
];

const FORMAT_PYTHON_KEY = "formatPythonOnSave";

function fullDocumentEdit(document: vscode.TextDocument, formattedText: string): vscode.TextEdit {
  const lastLine = document.lineAt(document.lineCount - 1);
  const fullRange = new vscode.Range(document.positionAt(0), lastLine.range.end);
  return vscode.TextEdit.replace(fullRange, formattedText);
}

/**
 * Format the `{# python #}` block of a `.pjx` with ruff and splice it back in.
 * Returns the text unchanged when there's no block, ruff is unavailable, or the
 * block is already formatted. Trust-gated — runs an external executable.
 */
async function formatPythonBlock(
  text: string,
  document: vscode.TextDocument,
  output: vscode.OutputChannel,
): Promise<string> {
  if (!document.fileName.endsWith(".pjx") || !vscode.workspace.isTrusted) {
    return text;
  }
  const block = findPythonBlock(text);
  if (!block) return text;

  const source = text.slice(block.contentStart, block.contentEnd);
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const command = config.get<string>("ruffPath", "") || "ruff";
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const formatted = await runRuffFormat(source, command, folder?.uri.fsPath, output);
  if (formatted === null || formatted === source) return text;
  return text.slice(0, block.contentStart) + formatted + text.slice(block.contentEnd);
}

/**
 * Compute the on-save formatted text: structural/slot formatting (gated by
 * `formatSlotsOnSave`) plus ruff formatting of the `{# python #}` block (gated
 * by `formatPythonOnSave`), combined into one result. Returns null when nothing
 * changed, so the caller emits no edit.
 */
async function nextFormattedText(
  document: vscode.TextDocument,
  output: vscode.OutputChannel,
): Promise<string | null> {
  if (!isComponentTemplate(document)) return null;
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const original = document.getText();

  let text = original;
  if (config.get(FORMAT_ON_SAVE_KEY, true)) {
    text = formatPyjinhxTemplate(text);
  }
  if (config.get(FORMAT_PYTHON_KEY, true)) {
    text = await formatPythonBlock(text, document, output);
  }
  return text === original ? null : text;
}

export function registerFormatting(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(TEMPLATE_SELECTOR, {
      async provideDocumentFormattingEdits(document) {
        const formatted = await nextFormattedText(document, output);
        return formatted === null ? [] : [fullDocumentEdit(document, formatted)];
      },
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (!isComponentTemplate(event.document)) return;
      event.waitUntil(
        nextFormattedText(event.document, output).then((formatted) =>
          formatted === null ? [] : [fullDocumentEdit(event.document, formatted)],
        ),
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(FORMAT_SLOTS_COMMAND, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const formatted = await nextFormattedText(editor.document, output);
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
