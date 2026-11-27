import { createHash } from "node:crypto";
import * as vscode from "vscode";
import { applyEdits, type Kind } from "../core/embedded-format.ts";

export interface Indentation {
  tabSize: number;
  insertSpaces: boolean;
}

const SCHEME = "pjx-format";
const TIME_LIMIT_MS = 3000;

const FORMATTERS = {
  css: { extension: "vscode.css-language-features", suffix: ".css", enabled: ["css", "format.enable"] },
  js: { extension: "vscode.typescript-language-features", suffix: ".js", enabled: ["javascript", "format.enable"] },
} as const;

/** The editor's own formatter for a stylesheet or a script, asked through a read-only document that holds just that text. */
export class BodyFormatter implements vscode.TextDocumentContentProvider {
  private readonly sources = new Map<string, string>();

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, this));
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.sources.get(uri.path) ?? "";
  }

  /** The formatted text, or null when no formatter answers, it is turned off, it takes too long or the request is cancelled. Never rejects. */
  async format(kind: Kind, source: string, indentation: Indentation, log: (line: string) => void, token?: vscode.CancellationToken): Promise<string | null> {
    const { extension: id, suffix, enabled } = FORMATTERS[kind];
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      if (vscode.workspace.getConfiguration(enabled[0]).get<boolean>(enabled[1], true) === false) return null;
      const path = `/${createHash("sha1").update(source).digest("hex")}${suffix}`;
      const uri = vscode.Uri.from({ scheme: SCHEME, path });
      this.sources.set(path, source);
      let document: vscode.TextDocument;
      try {
        document = await vscode.workspace.openTextDocument(uri);
      } finally {
        this.sources.delete(path);
      }
      const extension = vscode.extensions.getExtension(id);
      // The first request of a session would otherwise race the service's start.
      await extension?.activate();
      const gone = new Promise<"gone">((resolve) => {
        timer = setTimeout(() => resolve("gone"), TIME_LIMIT_MS);
        token?.onCancellationRequested(() => resolve("gone"));
      });
      const asked = Promise.resolve(vscode.commands.executeCommand<vscode.TextEdit[] | undefined>("vscode.executeFormatDocumentProvider", uri, indentation));
      const answer = await Promise.race([asked, gone]);
      if (answer === "gone") {
        log(`format ${kind}: no answer (cancelled or over ${TIME_LIMIT_MS} ms)`);
        return null;
      }
      // "No edits" is "already formatted" only when a formatter is there to say so.
      if (!answer?.length && !extension) return null;
      const result = applyEdits(
        source,
        (answer ?? []).map((e) => ({ start: document.offsetAt(e.range.start), end: document.offsetAt(e.range.end), newText: e.newText })),
      );
      log(`format ${kind}: ok in ${Date.now() - started} ms`);
      return result;
    } catch (error) {
      log(`format ${kind}: ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
