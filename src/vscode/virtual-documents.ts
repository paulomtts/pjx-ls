import * as vscode from "vscode";
import { TEMPLATE_LANGUAGE_ID } from "./config.ts";
import { Debouncer } from "../core/debounce.ts";
import { exclusions, syntheticSpans, type Exclusions, type Span } from "../core/forwarding.ts";
import { scan, type Scan } from "../core/regions.ts";
import { VIEW_SCHEME, sourceUriOf, viewPath, virtualHtml } from "../core/virtual-html.ts";

const REFRESH_DELAY_MS = 75;

export interface View {
  uri: vscode.Uri;
  version: number;
  text: string;
  scan: Scan;
  spans: Span[];
  exclusions: Exclusions;
  html: string;
}

/** The HTML view of every open .pjx document, served under the `pjx-embedded` scheme. */
export class Views implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;
  private readonly cache = new Map<string, View>();
  private htmlFeatures: Promise<unknown> | undefined;
  /** Whether a forwarded request has been answered yet in this session. */
  warmed = false;
  // Typing changes the text every keystroke; the view is rebuilt once typing pauses,
  // or at once when a request finds the editor's copy behind.
  private readonly refresh = new Debouncer(REFRESH_DELAY_MS, (key) => this.changed.fire(vscode.Uri.parse(key)));

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.changed,
      { dispose: () => this.refresh.dispose() },
      vscode.workspace.registerTextDocumentContentProvider(VIEW_SCHEME, this),
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.refreshSoon(document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.cache.delete(document.uri.toString())),
    );
  }

  private refreshSoon(document: vscode.TextDocument): void {
    // A document nobody asked a feature of has no view to keep fresh.
    if (document.languageId === TEMPLATE_LANGUAGE_ID && this.cache.has(document.uri.toString())) this.refresh.schedule(this.uriOf(document).toString());
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
      exclusions: exclusions(text, parsed),
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

  /**
   * The current view once the editor's copy of it has caught up with the source, or null if
   * it has not. A stale copy is refreshed at once rather than after the typing pause, and
   * continued typing moves the target, so the copy is compared with the view as it is now.
   */
  async ready(source: vscode.TextDocument, token?: vscode.CancellationToken): Promise<View | null> {
    // The HTML service starts with its extension; the first request must not race that.
    await (this.htmlFeatures ??= Promise.resolve(vscode.extensions.getExtension("vscode.html-language-features")?.activate()).catch(() => undefined));
    let nudged = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (token?.isCancellationRequested) return null;
      const view = this.viewOf(source);
      const copy = await vscode.workspace.openTextDocument(view.uri);
      const current = this.viewOf(source);
      if (copy.getText() === current.html) return current;
      if (!nudged) {
        nudged = true;
        if (!this.refresh.flush(view.uri.toString())) this.changed.fire(view.uri);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return null;
  }
}
