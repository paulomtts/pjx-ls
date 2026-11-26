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
          const view = blocks.viewOf(document);
          const answer = view && (await blocks.server.semanticTokens(document.uri.toString(), cancelOf(token)));
          // No answer keeps the grammar's colours; an empty one would too, but would also cache.
          return answer && view ? new vscode.SemanticTokens(new Uint32Array(translateTokens(answer.data, answer.legend, view))) : undefined;
        },
      },
      new vscode.SemanticTokensLegend([...LEGEND.tokenTypes], [...LEGEND.tokenModifiers]),
    ),
  );
}
