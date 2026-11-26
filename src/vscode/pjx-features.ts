import * as vscode from "vscode";
import type { CompletionItem as LspItem, Hover as LspHover } from "vscode-html-languageservice";
import { FORWARDING_SELECTOR } from "../config.ts";
import { componentCompletions, componentHover } from "../core/component-service.ts";
import { isForwardable } from "../core/forwarding.ts";
import { definitionAt, nameCompletions } from "../core/navigate.ts";
import type { Range as ManifestRange } from "../core/manifest.ts";
import { manifestPath, type Manifests } from "./manifest-service.ts";
import type { Views } from "./virtual-documents.ts";

const range = (r: ManifestRange) => new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
const markdown = (value: string) => new vscode.MarkdownString(value);

function completionItem(item: LspItem): vscode.CompletionItem {
  const edit = item.textEdit && "range" in item.textEdit ? item.textEdit : undefined;
  const result = new vscode.CompletionItem(item.label, item.kind ? item.kind - 1 : undefined);
  result.detail = item.detail;
  result.sortText = item.sortText;
  result.filterText = item.filterText;
  const doc = item.documentation;
  result.documentation = typeof doc === "string" ? doc : doc ? markdown(doc.value) : undefined;
  if (edit) {
    result.range = range({ start: { line: edit.range.start.line, character: edit.range.start.character }, end: { line: edit.range.end.line, character: edit.range.end.character } });
    result.insertText = item.insertTextFormat === 2 ? new vscode.SnippetString(edit.newText) : edit.newText;
  }
  if (item.command) result.command = { command: item.command.command, title: item.command.title };
  return result;
}

function hoverOf(hover: LspHover): vscode.Hover {
  const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
  const parts = contents.map((c) => markdown(typeof c === "string" ? c : c.value));
  return new vscode.Hover(parts, hover.range && range({ start: hover.range.start, end: hover.range.end }));
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
          return componentCompletions(manifest, view.html, view.scan, offset).map(completionItem);
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
        const hover = componentHover(manifest, view.html, view.scan, offset);
        return hover ? hoverOf(hover) : undefined;
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
