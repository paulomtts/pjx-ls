import * as vscode from "vscode";
import { isComponentTemplate } from "./config.ts";
import { manifestPath, type Manifests } from "./manifest-service.ts";
import type { PythonBlocks } from "./python-server.ts";
import { blockDiagnostics } from "../core/python-diagnostics.ts";

const SEVERITY = [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning, vscode.DiagnosticSeverity.Information, vscode.DiagnosticSeverity.Hint];
const TAGS: Record<number, vscode.DiagnosticTag> = { 1: vscode.DiagnosticTag.Unnecessary, 2: vscode.DiagnosticTag.Deprecated };

/** The private server's diagnostics for the lines of a `{#python` block, in a collection of their own. */
export function registerPythonDiagnostics(context: vscode.ExtensionContext, blocks: PythonBlocks, manifests: Manifests): void {
  const collection = vscode.languages.createDiagnosticCollection("pyjinhx-python");

  const show = (document: vscode.TextDocument) => {
    if (!isComponentTemplate(document)) return;
    const enabled = vscode.workspace.getConfiguration("pyjinhx").get<boolean>("pythonBlock.diagnostics", true);
    // viewOf also syncs the document to the server, so a .pjx gets diagnostics once it is open.
    const view = enabled ? blocks.viewOf(document) : null;
    if (!view) return collection.delete(document.uri);
    const uri = document.uri.toString();
    const pushed = blocks.server.diagnostics(uri);
    // A list computed for older text must not paint its ranges onto newer text; a fresh one follows.
    if (!pushed || pushed.version !== blocks.server.versionOf(uri)) return;
    const manifestRanges = manifests.manifestFor(document.uri)?.diagnosticsFor(manifestPath(document.uri)).map((d) => ({ start: d.range.start, end: d.range.end })) ?? [];
    collection.set(
      document.uri,
      blockDiagnostics(pushed.items, view, manifestRanges).map((item) => {
        const { start, end } = item.range;
        const diagnostic = new vscode.Diagnostic(new vscode.Range(start.line, start.character, end.line, end.character), item.message, SEVERITY[(item.severity ?? 1) - 1]);
        diagnostic.source = "basedpyright";
        diagnostic.code = item.code;
        diagnostic.tags = item.tags?.flatMap((tag) => TAGS[tag] ?? []);
        return diagnostic;
      }),
    );
  };
  const showAll = () => vscode.workspace.textDocuments.forEach(show);

  blocks.server.onDiagnostics((uri) => {
    const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri);
    if (document) show(document);
  });
  context.subscriptions.push(
    collection,
    manifests.onDidChange(showAll),
    blocks.onDidChange(showAll),
    vscode.workspace.onDidOpenTextDocument(show),
    vscode.workspace.onDidChangeTextDocument((e) => show(e.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("pyjinhx.pythonBlock") && showAll()),
  );
  showAll();
}
