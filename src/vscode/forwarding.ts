import * as vscode from "vscode";
import { FORWARDING_SELECTOR } from "../config.ts";
import { forwardable, touchesSynthetic, type Mode } from "../core/forwarding.ts";
import type { View, Views } from "./virtual-documents.ts";

const run = <T>(command: string, ...args: unknown[]) => vscode.commands.executeCommand<T>(command, ...args);
const labelText = (item: vscode.CompletionItem) => (typeof item.label === "string" ? item.label : item.label.label);

/** Asks the HTML service about the view at the same position; null where the view holds no source text. */
async function ask<T>(
  views: Views,
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  mode: Mode,
  command: string,
  ...rest: unknown[]
): Promise<{ result: T; view: View } | null> {
  const view = await views.ready(document, token);
  if (!view || !forwardable(view.text, view.scan, document.offsetAt(position), mode)) return null;
  const result = await run<T>(command, view.uri, position, ...rest);
  return token.isCancellationRequested || !result ? null : { result, view };
}

const clean = (view: View, range: vscode.Range | undefined) => !range || !touchesSynthetic(view.spans, range);

function toSource(link: vscode.Location | vscode.LocationLink, view: View, source: vscode.Uri): vscode.Location | vscode.LocationLink | null {
  const ownUri = (uri: vscode.Uri) => (uri.toString() === view.uri.toString() ? source : uri);
  const inView = (uri: vscode.Uri) => uri.toString() === view.uri.toString();
  if ("targetUri" in link) {
    if (inView(link.targetUri) && !(clean(view, link.targetRange) && clean(view, link.targetSelectionRange))) return null;
    const origin = clean(view, link.originSelectionRange) ? link.originSelectionRange : undefined;
    return { ...link, originSelectionRange: origin, targetUri: ownUri(link.targetUri) };
  }
  if (inView(link.uri) && !clean(view, link.range)) return null;
  return new vscode.Location(ownUri(link.uri), link.range);
}

export function registerForwarding(context: vscode.ExtensionContext, views: Views): void {
  // The items last offered, with their documentation resolved, for the resolve step.
  let offered: { key: string; items: vscode.CompletionItem[] } | null = null;
  const origins = new WeakMap<vscode.CompletionItem, { document: vscode.TextDocument; position: vscode.Position }>();

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      FORWARDING_SELECTOR,
      {
        async provideCompletionItems(document, position, token, completion) {
          const answer = await ask<vscode.CompletionList>(views, document, position, token, "cursor", "vscode.executeCompletionItemProvider", completion.triggerCharacter);
          if (!answer) return undefined;
          const items = answer.result.items.filter((item) => {
            const range = item.range && "inserting" in item.range ? item.range.replacing : item.range;
            return clean(answer.view, range) && (item.additionalTextEdits ?? []).every((e) => clean(answer.view, e.range));
          });
          items.forEach((item) => origins.set(item, { document, position }));
          return new vscode.CompletionList(items, answer.result.isIncomplete);
        },
        // The service hands out documentation only for items it is asked to resolve up front,
        // so the first resolve asks once for all of them and later ones reuse the answer.
        async resolveCompletionItem(item, token) {
          const origin = origins.get(item);
          const view = origin && (await views.ready(origin.document, token));
          if (!origin || !view) return item;
          const key = `${view.uri}#${view.version}@${origin.position.line}:${origin.position.character}`;
          if (offered?.key !== key) {
            const list = await run<vscode.CompletionList>("vscode.executeCompletionItemProvider", view.uri, origin.position, undefined, 100_000);
            offered = { key, items: list?.items ?? [] };
          }
          const resolved = offered.items.find((i) => labelText(i) === labelText(item) && i.sortText === item.sortText);
          if (resolved) {
            item.documentation = resolved.documentation;
            item.detail = resolved.detail;
          }
          return item;
        },
      },
      ".", "<", "/", ":", "=", '"', "'", " ", "-", "@", "#",
    ),

    vscode.languages.registerHoverProvider(FORWARDING_SELECTOR, {
      async provideHover(document, position, token) {
        const answer = await ask<vscode.Hover[]>(views, document, position, token, "hover", "vscode.executeHoverProvider");
        if (!answer?.result.length) return undefined;
        const range = answer.result.map((h) => h.range).find((r) => r && clean(answer.view, r));
        return new vscode.Hover(answer.result.flatMap((h) => h.contents), range);
      },
    }),

    vscode.languages.registerSignatureHelpProvider(
      FORWARDING_SELECTOR,
      {
        async provideSignatureHelp(document, position, token, signature) {
          const answer = await ask<vscode.SignatureHelp>(views, document, position, token, "cursor", "vscode.executeSignatureHelpProvider", signature.triggerCharacter);
          return answer?.result;
        },
      },
      "(", ",",
    ),

    vscode.languages.registerDefinitionProvider(FORWARDING_SELECTOR, {
      async provideDefinition(document, position, token) {
        const answer = await ask<(vscode.Location | vscode.LocationLink)[]>(views, document, position, token, "hover", "vscode.executeDefinitionProvider");
        const found = (answer?.result ?? []).flatMap((l) => toSource(l, answer!.view, document.uri) ?? []);
        const links = found.filter((l): l is vscode.LocationLink => "targetUri" in l);
        return links.length ? links : found.filter((l): l is vscode.Location => !("targetUri" in l));
      },
    }),

    vscode.languages.registerDocumentHighlightProvider(FORWARDING_SELECTOR, {
      async provideDocumentHighlights(document, position, token) {
        const answer = await ask<vscode.DocumentHighlight[]>(views, document, position, token, "cursor", "vscode.executeDocumentHighlights");
        return answer?.result.filter((h) => clean(answer.view, h.range));
      },
    }),

    vscode.languages.registerColorProvider(FORWARDING_SELECTOR, {
      async provideDocumentColors(document, token) {
        const view = await views.ready(document, token);
        if (!view) return [];
        const colors = (await run<vscode.ColorInformation[]>("vscode.executeDocumentColorProvider", view.uri)) ?? [];
        return colors.filter((c) => clean(view, c.range) && forwardable(view.text, view.scan, document.offsetAt(c.range.start), "hover"));
      },
      async provideColorPresentations(color, { document, range }, token) {
        const view = await views.ready(document, token);
        if (!view) return [];
        return (await run<vscode.ColorPresentation[]>("vscode.executeColorPresentationProvider", color, { uri: view.uri, range })) ?? [];
      },
    }),
  );
}
