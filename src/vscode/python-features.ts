import * as fs from "node:fs";
import * as vscode from "vscode";
import { TEMPLATE_SELECTOR } from "./config.ts";
import { cancelOf, type PythonBlocks } from "./python-server.ts";
import type { Range as ManifestRange } from "../core/manifest.ts";
import type { CompletionEntry } from "../core/python-server.ts";
import { toSource } from "../core/python-locations.ts";
import { inBody, type PythonView } from "../core/python-view.ts";

const toRange = (r: ManifestRange) => new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
const inside = (view: PythonView, r: ManifestRange) => inBody(view, r.start.line) && inBody(view, r.end.line);

// A stub's first line says which .pjx it was generated from; 200 bytes are enough to read it.
function firstLine(uri: string): string | undefined {
  try {
    const fd = fs.openSync(vscode.Uri.parse(uri).fsPath, "r");
    try {
      const buffer = Buffer.alloc(200);
      return buffer.toString("utf8", 0, fs.readSync(fd, buffer, 0, 200, 0)).split("\n")[0];
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/** Hover, go to definition, completion and signature help for the Python in a `{#python` block; outside the body the other providers answer. */
export function registerPythonFeatures(context: vscode.ExtensionContext, blocks: PythonBlocks): void {
  // The view is synced here, in the provider, so the server has the text the position refers to.
  const bodyView = (document: vscode.TextDocument, position: vscode.Position) => {
    const view = blocks.viewOf(document);
    return view && inBody(view, position.line) ? view : null;
  };

  // What each shown item came from, so resolving it can ask the server with its own data.
  const entries = new WeakMap<vscode.CompletionItem, CompletionEntry>();

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      TEMPLATE_SELECTOR,
      {
        async provideCompletionItems(document, position, token, trigger) {
          const view = bodyView(document, position);
          if (!view) return undefined;
          const { items, incomplete } = await blocks.server.completion(document.uri.toString(), position, trigger.triggerCharacter, cancelOf(token));
          return new vscode.CompletionList(
            items.map((entry) => {
              // LSP's kinds are one more than the editor's.
              const item = new vscode.CompletionItem(entry.label, entry.kind ? entry.kind - 1 : undefined);
              item.detail = entry.detail;
              item.documentation = entry.documentation ? new vscode.MarkdownString(entry.documentation) : undefined;
              item.sortText = entry.sortText;
              item.filterText = entry.filterText;
              item.insertText = entry.insertText;
              // A range that leaves the body would edit blanked text; the editor's word range is used then.
              if (entry.replace && inside(view, entry.replace)) item.range = toRange(entry.replace);
              entries.set(item, entry);
              return item;
            }),
            incomplete,
          );
        },
        async resolveCompletionItem(item, token) {
          const entry = entries.get(item);
          if (!entry) return item;
          const resolved = await blocks.server.resolveCompletion(entry, cancelOf(token));
          item.detail = resolved.detail;
          item.documentation = resolved.documentation ? new vscode.MarkdownString(resolved.documentation) : undefined;
          return item;
        },
      },
      ".", "[", '"', "'",
    ),
    vscode.languages.registerSignatureHelpProvider(
      TEMPLATE_SELECTOR,
      {
        async provideSignatureHelp(document, position, token, trigger) {
          const view = bodyView(document, position);
          const help = view && (await blocks.server.signatureHelp(document.uri.toString(), position, trigger.triggerCharacter, trigger.isRetrigger, cancelOf(token)));
          if (!help) return undefined;
          const result = new vscode.SignatureHelp();
          result.signatures = help.signatures.map((s) => {
            const signature = new vscode.SignatureInformation(s.label, s.documentation ? new vscode.MarkdownString(s.documentation) : undefined);
            signature.parameters = s.parameters.map((p) => new vscode.ParameterInformation(p.label, p.documentation ? new vscode.MarkdownString(p.documentation) : undefined));
            return signature;
          });
          result.activeSignature = help.activeSignature;
          result.activeParameter = help.activeParameter;
          return result;
        },
      },
      { triggerCharacters: ["(", ","], retriggerCharacters: [")"] },
    ),
    vscode.languages.registerHoverProvider(TEMPLATE_SELECTOR, {
      async provideHover(document, position, token) {
        const view = bodyView(document, position);
        const answer = view && (await blocks.server.hover(document.uri.toString(), position, cancelOf(token)));
        if (!view || !answer) return undefined;
        return new vscode.Hover(new vscode.MarkdownString(answer.markdown), answer.range && inside(view, answer.range) ? toRange(answer.range) : undefined);
      },
    }),
    vscode.languages.registerDefinitionProvider(TEMPLATE_SELECTOR, {
      async provideDefinition(document, position, token) {
        const view = bodyView(document, position);
        const own = document.uri.toString();
        const found = view && (await blocks.server.definition(own, position, cancelOf(token)));
        if (!view || !found) return undefined;
        return found
          .map((location) => toSource(location, firstLine))
          // A target in this document that is not in the body is blank in the view: nothing to go to.
          .filter((location) => location.uri !== own || inside(view, location.range))
          .map((location) => new vscode.Location(vscode.Uri.parse(location.uri), toRange(location.range)));
      },
    }),
  );
}
