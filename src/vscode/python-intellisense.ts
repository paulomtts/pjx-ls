import * as vscode from "vscode";
import {
  buildPythonVirtualContent,
  isOffsetInPythonBlock,
} from "../core/python-virtual-doc.ts";

const SCHEME = "pjx-python";
const SELECTOR: vscode.DocumentSelector = [{ language: "pyjinhx", scheme: "file" }];

/** Latest virtual Python text per source `.pjx` document, keyed by its path. */
const virtualContent = new Map<string, string>();

function virtualUriFor(doc: vscode.TextDocument): vscode.Uri {
  // A `.py` suffix makes VS Code treat the virtual doc as Python so the user's
  // Python extension attaches to it. The original path is encoded for lookup.
  return vscode.Uri.parse(`${SCHEME}:${doc.uri.fsPath}.py`);
}

function inPythonBlock(doc: vscode.TextDocument, position: vscode.Position): boolean {
  return isOffsetInPythonBlock(doc.getText(), doc.offsetAt(position));
}

function refreshVirtual(doc: vscode.TextDocument): vscode.Uri {
  const uri = virtualUriFor(doc);
  virtualContent.set(uri.toString(), buildPythonVirtualContent(doc.getText()));
  return uri;
}

export function registerPythonIntellisense(context: vscode.ExtensionContext): void {
  const onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  context.subscriptions.push(onDidChangeEmitter);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
      onDidChange: onDidChangeEmitter.event,
      provideTextDocumentContent(uri) {
        return virtualContent.get(uri.toString()) ?? "";
      },
    }),
  );

  // Keep the virtual doc current as the user types.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== "pyjinhx") return;
      const uri = refreshVirtual(event.document);
      onDidChangeEmitter.fire(uri);
    }),
  );

  // Prune stale entries when a pyjinhx doc is closed.
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.languageId !== "pyjinhx") return;
      virtualContent.delete(virtualUriFor(doc).toString());
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      {
        async provideCompletionItems(document, position, _token, ctxArg) {
          if (!inPythonBlock(document, position)) return undefined;
          const uri = refreshVirtual(document);
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
        const uri = refreshVirtual(document);
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
        const uri = refreshVirtual(document);
        return vscode.commands.executeCommand<vscode.Location[]>(
          "vscode.executeDefinitionProvider",
          uri,
          position,
        );
      },
    }),
  );
}
