import * as vscode from "vscode";
import { TEMPLATE_LANGUAGE_ID } from "../config.ts";
import { scan, type Scan } from "../core/regions.ts";
import { virtualHtml } from "../core/virtual-html.ts";
import { VIEW_SCHEME, sourceUriOf, viewPath } from "../core/view-uri.ts";

export interface View {
  uri: vscode.Uri;
  text: string;
  scan: Scan;
  html: string;
}

/** The HTML view of every open .pjx document, served under the `pjx-embedded` scheme. */
export class Views implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;
  private readonly cache = new Map<string, { version: number; view: View }>();

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.changed,
      vscode.workspace.registerTextDocumentContentProvider(VIEW_SCHEME, this),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        if (document.languageId === TEMPLATE_LANGUAGE_ID) this.changed.fire(this.uriOf(document));
      }),
      vscode.workspace.onDidCloseTextDocument((document) => this.cache.delete(document.uri.toString())),
    );
  }

  uriOf(source: vscode.TextDocument): vscode.Uri {
    return vscode.Uri.from({ scheme: VIEW_SCHEME, path: viewPath(source.uri.toString()) });
  }

  viewOf(source: vscode.TextDocument): View {
    const key = source.uri.toString();
    const cached = this.cache.get(key);
    if (cached?.version === source.version) return cached.view;
    const text = source.getText();
    const view = { uri: this.uriOf(source), text, scan: scan(text), html: virtualHtml(text) };
    this.cache.set(key, { version: source.version, view });
    return view;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const key = sourceUriOf(uri.path);
    const source = vscode.workspace.textDocuments.find((d) => d.uri.toString() === key);
    return source ? this.viewOf(source).html : "";
  }

  /** The view once the editor's copy of it has caught up with the source. */
  async ready(source: vscode.TextDocument): Promise<View> {
    const view = this.viewOf(source);
    for (let attempt = 0; attempt < 20; attempt++) {
      const copy = await vscode.workspace.openTextDocument(view.uri);
      if (copy.getText() === view.html) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    return view;
  }
}
