import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { isComponentTemplate } from "./component-template.ts";
import { findDefHeaderRange } from "../core/def-header.ts";

function checkDocument(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
): void {
  if (!isComponentTemplate(document)) {
    collection.delete(document.uri);
    return;
  }

  const range = findDefHeaderRange(document.getText());
  if (range === null) {
    collection.delete(document.uri);
    return;
  }

  const fsPath = document.uri.fsPath;
  const basename = path.basename(fsPath, path.extname(fsPath));
  const siblingPy = path.join(path.dirname(fsPath), basename + ".py");

  if (fs.existsSync(siblingPy)) {
    const startPos = document.positionAt(range.start);
    const endPos = document.positionAt(range.end);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(startPos, endPos),
      `This {#def#} header is ignored — a co-located Python class (${basename}.py) is registered for this component. Remove the header (or the class).`,
      vscode.DiagnosticSeverity.Warning,
    );
    collection.set(document.uri, [diagnostic]);
  } else {
    collection.delete(document.uri);
  }
}

export function registerDiagnostics(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  const collection = vscode.languages.createDiagnosticCollection("pyjinhx");
  context.subscriptions.push(collection);

  // Check all already-open documents on activation.
  for (const document of vscode.workspace.textDocuments) {
    checkDocument(document, collection);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      checkDocument(document, collection);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      checkDocument(event.document, collection);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      checkDocument(document, collection);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
    }),
  );

  output.appendLine("PyJinHx: stale {#def#} header diagnostics registered.");
}
