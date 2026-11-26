import * as vscode from "vscode";
import { TEMPLATE_SELECTOR } from "./config.ts";
import { cancelOf, type PythonBlocks } from "./python-server.ts";
import { LEGEND, translateTokens } from "../core/semantic-tokens.ts";

/** Colours the names in a `{#python` block by type; the TextMate grammar keeps the rest of the file. */
export function registerPythonTokens(context: vscode.ExtensionContext, blocks: PythonBlocks): void {
  const changed = new vscode.EventEmitter<void>();
  context.subscriptions.push(
    changed,
    blocks.onDidChange(() => changed.fire()),
    vscode.languages.registerDocumentSemanticTokensProvider(
      TEMPLATE_SELECTOR,
      {
        onDidChangeSemanticTokens: changed.event,
        async provideDocumentSemanticTokens(document, token) {
          const uri = document.uri.toString();
          const view = blocks.viewOf(document);
          if (!view) return undefined;
          const version = blocks.server.versionOf(uri);
          const answer = await blocks.server.semanticTokens(uri, cancelOf(token));
          // The answer is for the text the server had when asked; if that moved on, the editor asks again.
          if (blocks.server.versionOf(uri) !== version) throw new vscode.CancellationError();
          // No answer keeps the grammar's colours; an empty one would too, but would also cache.
          return answer ? new vscode.SemanticTokens(new Uint32Array(translateTokens(answer.data, answer.legend, view))) : undefined;
        },
      },
      new vscode.SemanticTokensLegend([...LEGEND.tokenTypes], [...LEGEND.tokenModifiers]),
    ),
  );
}
