import * as vscode from "vscode";
import { TEMPLATE_LANGUAGE_ID } from "./config.ts";
import { defHeaderRange } from "../core/regions.ts";
import type { Manifest, Diagnostic } from "../core/manifest.ts";
import { isSource, manifestPath, type Manifests } from "./manifest-service.ts";

const SEVERITY: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
};

function convert(d: Diagnostic): vscode.Diagnostic {
  const r = d.range;
  const result = new vscode.Diagnostic(new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character), d.message, SEVERITY[d.severity] ?? vscode.DiagnosticSeverity.Information);
  result.code = d.code;
  result.source = "pyjinhx";
  return result;
}

function staleHeader(document: vscode.TextDocument, manifest: Manifest): vscode.Diagnostic[] {
  const component = manifest.forPath(manifestPath(document.uri)).find((c) => c.documentPath === manifestPath(document.uri));
  const header = component?.hasStaleDefHeader ? defHeaderRange(document.getText()) : null;
  if (!header) return [];
  const range = new vscode.Range(document.positionAt(header.start), document.positionAt(header.end));
  const diagnostic = new vscode.Diagnostic(range, `This {#def#} header is ignored: ${component!.tag} is defined by a Python class. Remove the header or the class.`, vscode.DiagnosticSeverity.Warning);
  diagnostic.code = "stale-def-header";
  diagnostic.source = "pyjinhx";
  return [diagnostic];
}

/** The manifest's diagnostics for every open source file, plus the stale `{#def#}` header. */
export function registerDiagnostics(context: vscode.ExtensionContext, manifests: Manifests): void {
  const collection = vscode.languages.createDiagnosticCollection("pyjinhx");
  const check = (document: vscode.TextDocument) => {
    const manifest = manifests.manifestFor(document.uri);
    if (!manifest || !isSource(document)) {
      return collection.delete(document.uri);
    }
    const own = manifest.diagnosticsFor(manifestPath(document.uri)).map(convert);
    collection.set(document.uri, document.languageId === TEMPLATE_LANGUAGE_ID ? [...own, ...staleHeader(document, manifest)] : own);
  };
  const checkAll = () => vscode.workspace.textDocuments.forEach(check);
  context.subscriptions.push(
    collection,
    manifests.onDidChange(checkAll),
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
  );
  checkAll();
}
