import * as vscode from "vscode";
import { FORWARDING_SELECTOR } from "../config.ts";
import { forwardable, syntheticSpans, touchesSynthetic, type Span } from "../core/forwarding.ts";
import type { View, Views } from "./virtual-documents.ts";

const run = <T>(command: string, ...args: unknown[]) => vscode.commands.executeCommand<T>(command, ...args);

/** Asks the HTML service about the view at the same position; null where the view holds no source text. */
async function ask<T>(
  views: Views,
  document: vscode.TextDocument,
  position: vscode.Position,
  command: string,
  ...rest: unknown[]
): Promise<{ result: T; view: View; spans: Span[] } | null> {
  const view = await views.ready(document);
  if (!forwardable(view.text, view.scan, document.offsetAt(position))) return null;
  const result = await run<T>(command, view.uri, position, ...rest);
  return { result, view, spans: syntheticSpans(view.text, view.scan) };
}

const clean = (spans: Span[], range: vscode.Range | undefined) => !range || !touchesSynthetic(spans, range);

function toSource(location: vscode.Location | vscode.LocationLink, view: View, source: vscode.Uri): vscode.Location | vscode.LocationLink | null {
  const own = (uri: vscode.Uri) => (uri.toString() === view.uri.toString() ? source : uri);
  const spans = syntheticSpans(view.text, view.scan);
  if ("targetUri" in location) {
    const inView = location.targetUri.toString() === view.uri.toString();
    if (inView && !clean(spans, location.targetRange)) return null;
    return { ...location, targetUri: own(location.targetUri) };
  }
  if (location.uri.toString() === view.uri.toString() && !clean(spans, location.range)) return null;
  return new vscode.Location(own(location.uri), location.range);
}

export function registerForwarding(context: vscode.ExtensionContext, views: Views): void {
  const at = new WeakMap<vscode.CompletionItem, { document: vscode.TextDocument; position: vscode.Position; index: number }>();
  const subscribe = (...disposables: vscode.Disposable[]) => context.subscriptions.push(...disposables);

  subscribe(
    vscode.languages.registerCompletionItemProvider(
      FORWARDING_SELECTOR,
      {
        async provideCompletionItems(document, position, _token, completion) {
          const answer = await ask<vscode.CompletionList>(views, document, position, "vscode.executeCompletionItemProvider", completion.triggerCharacter);
          if (!answer?.result) return undefined;
          const items = answer.result.items.filter((item) => {
            const range = item.range && "inserting" in item.range ? item.range.replacing : item.range;
            return clean(answer.spans, range) && (item.additionalTextEdits ?? []).every((e) => clean(answer.spans, e.range));
          });
          items.forEach((item, index) => at.set(item, { document, position, index }));
          return new vscode.CompletionList(items, answer.result.isIncomplete);
        },
        // The service resolves only what it is asked to resolve up front, so resolving
        // one item asks again, resolving as far as that item's position in the list.
        async resolveCompletionItem(item) {
          const origin = at.get(item);
          if (!origin) return item;
          const view = await views.ready(origin.document);
          const list = await run<vscode.CompletionList>("vscode.executeCompletionItemProvider", view.uri, origin.position, undefined, origin.index + 1);
          const resolved = list?.items.find((i) => i.label === item.label && i.sortText === item.sortText);
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
      async provideHover(document, position) {
        const answer = await ask<vscode.Hover[]>(views, document, position, "vscode.executeHoverProvider");
        if (!answer?.result?.length) return undefined;
        const range = answer.result.map((h) => h.range).find((r) => r && clean(answer.spans, r));
        return new vscode.Hover(answer.result.flatMap((h) => h.contents), range);
      },
    }),

    vscode.languages.registerSignatureHelpProvider(
      FORWARDING_SELECTOR,
      {
        async provideSignatureHelp(document, position, _token, context) {
          const answer = await ask<vscode.SignatureHelp>(views, document, position, "vscode.executeSignatureHelpProvider", context.triggerCharacter);
          return answer?.result ?? undefined;
        },
      },
      "(", ",",
    ),

    vscode.languages.registerDefinitionProvider(FORWARDING_SELECTOR, {
      async provideDefinition(document, position) {
        const answer = await ask<(vscode.Location | vscode.LocationLink)[]>(views, document, position, "vscode.executeDefinitionProvider");
        const found = (answer?.result ?? []).map((l) => (answer ? toSource(l, answer.view, document.uri) : null));
        return found.filter((l): l is vscode.Location | vscode.LocationLink => l !== null) as vscode.Location[];
      },
    }),

    vscode.languages.registerDocumentHighlightProvider(FORWARDING_SELECTOR, {
      async provideDocumentHighlights(document, position) {
        const answer = await ask<vscode.DocumentHighlight[]>(views, document, position, "vscode.executeDocumentHighlights");
        return answer?.result?.filter((h) => clean(answer.spans, h.range));
      },
    }),

    vscode.languages.registerColorProvider(FORWARDING_SELECTOR, {
      async provideDocumentColors(document) {
        const view = await views.ready(document);
        const spans = syntheticSpans(view.text, view.scan);
        const colors = (await run<vscode.ColorInformation[]>("vscode.executeDocumentColorProvider", view.uri)) ?? [];
        return colors.filter((c) => clean(spans, c.range) && forwardable(view.text, view.scan, document.offsetAt(c.range.start)));
      },
      async provideColorPresentations(color, { document, range }) {
        const view = await views.ready(document);
        return (await run<vscode.ColorPresentation[]>("vscode.executeColorPresentationProvider", color, { uri: view.uri, range })) ?? [];
      },
    }),
  );
}
