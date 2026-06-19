const vscode = require("vscode");
const path = require("path");
const { formatPyjinhxTemplate } = require("./format-slots");

const OUTPUT_CHANNEL = "PyJinHx";

const TEMPLATE_LANGUAGE_IDS = new Set(["html", "jinja", "jinja-html", "pyjinhx"]);
const TEMPLATE_EXTENSIONS = [".html", ".pjx"];

function isTemplateExtension(fileName) {
  return TEMPLATE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function isComponentTemplate(document) {
  if (document.uri.scheme !== "file") {
    return false;
  }
  if (!isTemplateExtension(document.fileName)) {
    return false;
  }
  const normalizedPath = document.uri.fsPath.split(path.sep).join("/");
  if (!normalizedPath.includes("/components/")) {
    return false;
  }
  return TEMPLATE_LANGUAGE_IDS.has(document.languageId);
}

function formatDocumentText(document) {
  return formatPyjinhxTemplate(document.getText());
}

function fullDocumentEdit(document, formattedText) {
  const lastLine = document.lineAt(document.lineCount - 1);
  const fullRange = new vscode.Range(
    document.positionAt(0),
    lastLine.range.end,
  );
  return vscode.TextEdit.replace(fullRange, formattedText);
}

function provideFormattingEdits(document) {
  if (!isComponentTemplate(document)) {
    return [];
  }
  const formattedText = formatDocumentText(document);
  if (formattedText === document.getText()) {
    return [];
  }
  return [fullDocumentEdit(document, formattedText)];
}

function activate(context) {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL);
  output.appendLine("PyJinHx extension activated.");

  const templateDocumentSelector = [
    { language: "html", scheme: "file" },
    { language: "jinja", scheme: "file" },
    { language: "jinja-html", scheme: "file" },
    { language: "pyjinhx", scheme: "file" },
  ];

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      templateDocumentSelector,
      { provideDocumentFormattingEdits: provideFormattingEdits },
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      const config = vscode.workspace.getConfiguration("pyjinhx");
      if (!config.get("formatSlotsOnSave", true)) {
        return;
      }
      if (!isComponentTemplate(event.document)) {
        return;
      }

      const formattedText = formatDocumentText(event.document);
      if (formattedText === event.document.getText()) {
        return;
      }

      output.appendLine(`Formatting slots before save: ${event.document.uri.fsPath}`);
      event.waitUntil(Promise.resolve([fullDocumentEdit(event.document, formattedText)]));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pyjinhx.formatSlots", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isComponentTemplate(editor.document)) {
        return;
      }
      const formattedText = formatDocumentText(editor.document);
      if (formattedText === editor.document.getText()) {
        return;
      }
      await editor.edit((builder) => {
        const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          lastLine.range.end,
        );
        builder.replace(fullRange, formattedText);
      });
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
