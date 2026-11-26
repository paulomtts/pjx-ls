import * as vscode from "vscode";
import { FORWARDING_SELECTOR } from "./config.ts";
import { componentCompletions, componentHover, type Entry } from "../core/pjx-features.ts";
import { isForwardable } from "../core/forwarding.ts";
import { definitionAt, nameCompletions } from "../core/navigate.ts";
import type { Range as ManifestRange } from "../core/manifest.ts";
import { manifestPath, type Manifests } from "./manifest-service.ts";
import type { Views } from "./virtual-documents.ts";

const range = (r: ManifestRange) => new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
const KINDS = { component: vscode.CompletionItemKind.Class, prop: vscode.CompletionItemKind.Property, value: vscode.CompletionItemKind.Value };

function completionItem(document: vscode.TextDocument, entry: Entry): vscode.CompletionItem {
  const item = new vscode.CompletionItem(entry.label, KINDS[entry.kind]);
  item.detail = entry.detail;
  item.sortText = entry.sortText;
  item.documentation = entry.documentation && new vscode.MarkdownString(entry.documentation);
  item.range = new vscode.Range(document.positionAt(entry.replace.start), document.positionAt(entry.replace.end));
  if (entry.snippet) item.insertText = new vscode.SnippetString(entry.snippet);
  if (entry.retrigger) item.command = { command: "editor.action.triggerSuggest", title: "Suggest" };
  return item;
}

/** Completion, hover and go to definition for what is pjx's own: components, their props, and a template's own names. */
export function registerPjxFeatures(context: vscode.ExtensionContext, manifests: Manifests, views: Views): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      FORWARDING_SELECTOR,
      {
        provideCompletionItems(document, position) {
          const manifest = manifests.manifestFor(document.uri);
          if (!manifest) return undefined;
          const view = views.viewOf(document);
          const offset = document.offsetAt(position);
          const names = nameCompletions(manifest, manifestPath(document.uri), view.text, view.scan, offset);
          if (names.length) {
            return names.map((n) => {
              const item = new vscode.CompletionItem(n.label, n.kind === "method" ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Property);
              item.detail = n.detail;
              item.range = new vscode.Range(document.positionAt(n.replace.start), document.positionAt(n.replace.end));
              return item;
            });
          }
          if (!isForwardable(view.exclusions, offset, "cursor")) return undefined;
          return componentCompletions(manifest, view.text, view.scan, offset).map((e) => completionItem(document, e));
        },
      },
      "<", " ", '"', "'",
    ),

    vscode.languages.registerHoverProvider(FORWARDING_SELECTOR, {
      provideHover(document, position) {
        const manifest = manifests.manifestFor(document.uri);
        const view = manifest && views.viewOf(document);
        const offset = document.offsetAt(position);
        if (!manifest || !view || !isForwardable(view.exclusions, offset, "hover")) return undefined;
        const hover = componentHover(manifest, view.scan, offset);
        return hover && new vscode.Hover(new vscode.MarkdownString(hover.markdown), new vscode.Range(document.positionAt(hover.range.start), document.positionAt(hover.range.end)));
      },
    }),

    vscode.languages.registerDefinitionProvider(FORWARDING_SELECTOR, {
      provideDefinition(document, position) {
        const manifest = manifests.manifestFor(document.uri);
        if (!manifest) return undefined;
        const view = views.viewOf(document);
        const found = definitionAt(manifest, manifestPath(document.uri), view.text, view.scan, document.offsetAt(position));
        if (!found) return undefined;
        const link: vscode.LocationLink = {
          originSelectionRange: new vscode.Range(document.positionAt(found.origin.start), document.positionAt(found.origin.end)),
          targetUri: vscode.Uri.file(found.target.path),
          targetRange: range(found.target.range),
        };
        return [link];
      },
    }),
  );
}
