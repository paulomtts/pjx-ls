import * as vscode from "vscode";
import { TEMPLATE_LANGUAGE_ID } from "../config.ts";
import { syntheticSpans, type Span } from "../core/forwarding.ts";
import { scan, type Scan } from "../core/regions.ts";
import { virtualHtml } from "../core/virtual-html.ts";
import { VIEW_SCHEME, sourceUriOf, viewPath } from "../core/view-uri.ts";

const REFRESH_DELAY_MS = 75;

export interface View {
  uri: vscode.Uri;
  version: number;
  text: string;
  scan: Scan;
  spans: Span[];
  html: string;
}

/** The HTML view of every open .pjx document, served under the `pjx-embedded` scheme. */
export class Views implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;
  private readonly cache = new Map<string, View>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.changed,
      { dispose: () => this.timers.forEach(clearTimeout) },
      vscode.workspace.registerTextDocumentContentProvider(VIEW_SCHEME, this),
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.refreshSoon(document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.cache.delete(document.uri.toString())),
    );
  }

  // Typing changes the text every keystroke; the view is rebuilt once typing pauses.
  private refreshSoon(document: vscode.TextDocument): void {
    if (document.languageId !== TEMPLATE_LANGUAGE_ID) return;
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.changed.fire(this.uriOf(document));
      }, REFRESH_DELAY_MS),
    );
  }

  uriOf(source: vscode.TextDocument): vscode.Uri {
    return vscode.Uri.from({ scheme: VIEW_SCHEME, path: viewPath(source.uri.toString()) });
  }

  viewOf(source: vscode.TextDocument): View {
    const key = source.uri.toString();
    const cached = this.cache.get(key);
    if (cached?.version === source.version) return cached;
    const text = source.getText();
    const parsed = scan(text);
    const view = {
      uri: this.uriOf(source),
      version: source.version,
      text,
      scan: parsed,
      spans: syntheticSpans(text, parsed),
      html: virtualHtml(text, parsed),
    };
    this.cache.set(key, view);
    return view;
  }

  // Only pyjinhx documents have a view; any other source would hand its text to html extensions.
  provideTextDocumentContent(uri: vscode.Uri): string {
    const key = sourceUriOf(uri.path);
    const source = vscode.workspace.textDocuments.find((d) => d.uri.toString() === key);
    return source?.languageId === TEMPLATE_LANGUAGE_ID ? this.viewOf(source).html : "";
  }

  /** The view once the editor's copy of it has caught up with the source, or null if it has not. */
  async ready(source: vscode.TextDocument, token?: vscode.CancellationToken): Promise<View | null> {
    const view = this.viewOf(source);
    for (let attempt = 0; attempt < 20; attempt++) {
      if (token?.isCancellationRequested) return null;
      const copy = await vscode.workspace.openTextDocument(view.uri);
      if (copy.getText() === view.html) return this.viewOf(source) === view ? view : null;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }
}
