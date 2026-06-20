import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildPythonVirtualContent, isOffsetInPythonBlock } from "../core/python-virtual-doc.ts";
import {
  reencodeSemanticTokens,
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
  type TokenLegend,
} from "../core/semantic-tokens.ts";

const SELECTOR: vscode.DocumentSelector = [{ language: "pyjinhx", scheme: "file" }];

const OUR_LEGEND = new vscode.SemanticTokensLegend(
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
);

// Real on-disk mirror `.py` files we have written, so we can clean them up.
// Pylance only analyses `file:` documents in the workspace, so the forwarding
// providers target a real mirror file rather than an in-memory virtual doc.
const liveMirrors = new Set<string>();
const gitignoredRoots = new Set<string>();

function mirrorPathFor(doc: vscode.TextDocument): string {
  const dir = path.dirname(doc.uri.fsPath);
  const stem = path.basename(doc.uri.fsPath, path.extname(doc.uri.fsPath));
  // A distinct stem (not `<stem>.py`) avoids shadowing the `.pjx` at runtime —
  // pyjinhx errors on a same-name `.py`/`.pjx` pair.
  return path.join(dir, `_pjx_virtual_${stem}.py`);
}

function ensureGitignore(doc: vscode.TextDocument): void {
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (!folder) return;
  const root = folder.uri.fsPath;
  if (gitignoredRoots.has(root)) return;
  gitignoredRoots.add(root);
  const gitignore = path.join(root, ".gitignore");
  const entry = "_pjx_virtual_*.py";
  try {
    const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : "";
    if (!current.split(/\r?\n/).includes(entry)) {
      const prefix = current && !current.endsWith("\n") ? "\n" : "";
      fs.appendFileSync(gitignore, `${prefix}${entry}\n`);
    }
  } catch {
    /* best effort */
  }
}

/**
 * Write (or refresh) the mirror `.py` for a `.pjx` doc and return its Uri, or
 * undefined when the doc has no `{# python #}` block (in which case any stale
 * mirror is removed). The mirror's lines map 1:1 to the `.pjx`, so positions
 * pass through unchanged.
 */
function syncMirror(doc: vscode.TextDocument): vscode.Uri | undefined {
  const content = buildPythonVirtualContent(doc.getText());
  const mirrorPath = mirrorPathFor(doc);
  if (content === "") {
    removeMirror(mirrorPath);
    return undefined;
  }
  try {
    ensureGitignore(doc);
    fs.writeFileSync(mirrorPath, content, "utf8");
    liveMirrors.add(mirrorPath);
    return vscode.Uri.file(mirrorPath);
  } catch {
    return undefined;
  }
}

function removeMirror(mirrorPath: string): void {
  if (!liveMirrors.has(mirrorPath)) return;
  liveMirrors.delete(mirrorPath);
  try {
    fs.unlinkSync(mirrorPath);
  } catch {
    /* already gone */
  }
}

function inPythonBlock(doc: vscode.TextDocument, position: vscode.Position): boolean {
  return isOffsetInPythonBlock(doc.getText(), doc.offsetAt(position));
}

let pylanceLegend: TokenLegend | undefined;

async function fetchPylanceLegend(uri: vscode.Uri): Promise<TokenLegend | undefined> {
  if (pylanceLegend) return pylanceLegend;
  const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend | undefined>(
    "vscode.provideDocumentSemanticTokensLegend",
    uri,
  );
  if (legend) {
    pylanceLegend = {
      tokenTypes: legend.tokenTypes,
      tokenModifiers: legend.tokenModifiers,
    };
  }
  return pylanceLegend;
}

export function registerPythonIntellisense(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  // Keep mirrors current with the editor's documents.
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "pyjinhx") syncMirror(doc);
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === "pyjinhx") syncMirror(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "pyjinhx") syncMirror(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.languageId === "pyjinhx") removeMirror(mirrorPathFor(doc));
    }),
    // Clean every mirror on shutdown.
    new vscode.Disposable(() => {
      for (const mirrorPath of [...liveMirrors]) removeMirror(mirrorPath);
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      {
        async provideCompletionItems(document, position, _token, ctxArg) {
          if (!inPythonBlock(document, position)) return undefined;
          const uri = syncMirror(document);
          if (!uri) return undefined;
          return vscode.commands.executeCommand<vscode.CompletionList>(
            "vscode.executeCompletionItemProvider",
            uri,
            position,
            ctxArg.triggerCharacter,
          );
        },
      },
      ".",
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SELECTOR, {
      async provideHover(document, position) {
        if (!inPythonBlock(document, position)) return undefined;
        const uri = syncMirror(document);
        if (!uri) return undefined;
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
          "vscode.executeHoverProvider",
          uri,
          position,
        );
        return hovers && hovers.length ? hovers[0] : undefined;
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(SELECTOR, {
      async provideDefinition(document, position) {
        if (!inPythonBlock(document, position)) return undefined;
        const uri = syncMirror(document);
        if (!uri) return undefined;
        return vscode.commands.executeCommand<vscode.Location[]>(
          "vscode.executeDefinitionProvider",
          uri,
          position,
        );
      },
    }),
  );

  // Semantic tokens: forward Pylance's own tokens for the block, translated onto
  // our legend by name so the theme colors them exactly as in a `.py` file.
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      SELECTOR,
      {
        async provideDocumentSemanticTokens(document) {
          const uri = syncMirror(document);
          if (!uri) {
            output.appendLine("[semantic] no python block; skipping");
            return undefined;
          }
          // Make sure Pylance is tracking the mirror file before we query it.
          try {
            await vscode.workspace.openTextDocument(uri);
          } catch {
            /* ignore */
          }
          const legend = await fetchPylanceLegend(uri);
          output.appendLine(
            `[semantic] legend: ${legend ? `${legend.tokenTypes.length} types` : "UNDEFINED"}`,
          );
          if (!legend) return undefined;
          const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens | undefined>(
            "vscode.provideDocumentSemanticTokens",
            uri,
          );
          output.appendLine(
            `[semantic] pylance tokens: ${tokens ? `${tokens.data.length / 5}` : "UNDEFINED"}`,
          );
          if (!tokens) return undefined;
          const data = reencodeSemanticTokens(Array.from(tokens.data), legend, {
            tokenTypes: SEMANTIC_TOKEN_TYPES,
            tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
          });
          const typeCounts: Record<string, number> = {};
          for (let i = 3; i < data.length; i += 5) {
            const name = SEMANTIC_TOKEN_TYPES[data[i]] ?? "?";
            typeCounts[name] = (typeCounts[name] ?? 0) + 1;
          }
          output.appendLine(
            `[semantic] forwarded ${data.length / 5} tokens: ${JSON.stringify(typeCounts)}`,
          );
          return new vscode.SemanticTokens(new Uint32Array(data));
        },
      },
      OUR_LEGEND,
    ),
  );
}
