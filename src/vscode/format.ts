import * as path from "node:path";
import * as vscode from "vscode";
import { formatPyjinhxTemplate } from "../core/format.ts";
import { nodeSpawn } from "../core/manifest-runner.ts";
import { formatPythonBlock, Ruff, stdinFilename, usesRuff, type FormatBody, type RuffCommand } from "../core/python-format.ts";
import { FORMAT_SLOTS_COMMAND, isComponentTemplate, TEMPLATE_SELECTOR } from "./config.ts";
import { findPython, onPath, onPythonEnvironmentChange } from "./python-env.ts";
import { cancelOf } from "./python-server.ts";

function fullDocumentEdit(document: vscode.TextDocument, formattedText: string): vscode.TextEdit {
  const lastLine = document.lineAt(document.lineCount - 1);
  const fullRange = new vscode.Range(document.positionAt(0), lastLine.range.end);
  return vscode.TextEdit.replace(fullRange, formattedText);
}

// "Turn off" writes where the setting was resolved from: the folder or workspace if one set it, else the user's.
function targetOf(document: vscode.TextDocument): vscode.ConfigurationTarget {
  const setting = vscode.workspace.getConfiguration("pyjinhx", document.uri).inspect("format.python");
  if (setting?.workspaceFolderValue !== undefined) return vscode.ConfigurationTarget.WorkspaceFolder;
  if (setting?.workspaceValue !== undefined) return vscode.ConfigurationTarget.Workspace;
  return vscode.ConfigurationTarget.Global;
}

export function registerFormatting(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
  const log = (line: string) => output.appendLine(line);
  let noticeShown = false;

  // The one message about a missing ruff in a session; the output line is written every time it is not found.
  function noticeMissingRuff(document: vscode.TextDocument): void {
    if (noticeShown) return;
    noticeShown = true;
    const turnOff = "Turn off";
    void vscode.window
      .showInformationMessage("ruff was not found, so {#python bodies are not formatted. Install ruff in the project's environment or on PATH, or turn this off.", turnOff)
      .then(async (picked) => {
        if (picked !== turnOff) return;
        try {
          await vscode.workspace.getConfiguration("pyjinhx", document.uri).update("format.python", "off", targetOf(document));
        } catch (error) {
          log(`could not set pyjinhx.format.python to "off": ${error instanceof Error ? error.message : error}`);
        }
      });
  }

  const ruff = new Ruff(nodeSpawn, log);

  const candidates = (folder?: vscode.WorkspaceFolder) => async (): Promise<RuffCommand[]> => {
    const python = folder && (await findPython(folder));
    const binary = onPath("ruff");
    return [...(python ? [{ command: python.python, args: ["-m", "ruff"] }] : []), ...(binary ? [{ command: binary, args: [] }] : [])];
  };

  function pythonBody(document: vscode.TextDocument, token?: vscode.CancellationToken): FormatBody | null {
    const setting = vscode.workspace.getConfiguration("pyjinhx", document.uri).get("format.python", "ruff");
    if (!usesRuff(setting, vscode.workspace.isTrusted)) return null;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    return (body) =>
      ruff.format(body, {
        filename: stdinFilename(document.uri.fsPath),
        cwd: folder?.uri.fsPath ?? path.dirname(document.uri.fsPath),
        candidates: candidates(folder),
        cancel: token && cancelOf(token),
        onMissing: () => noticeMissingRuff(document),
      });
  }

  /** Returns the formatted text only if it differs from the current document, else null. */
  async function nextFormattedText(document: vscode.TextDocument, token?: vscode.CancellationToken): Promise<string | null> {
    if (!isComponentTemplate(document)) return null;
    const text = document.getText();
    const version = document.version;
    const format = pythonBody(document, token);
    const withPython = format ? await formatPythonBlock(text, format, log) : text;
    const formatted = formatPyjinhxTemplate(withPython);
    // An answer for text that has since changed is dropped; the next format does it again.
    return formatted === text || document.version !== version || token?.isCancellationRequested ? null : formatted;
  }

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(TEMPLATE_SELECTOR, {
      async provideDocumentFormattingEdits(document, _options, token) {
        const formatted = await nextFormattedText(document, token);
        return formatted === null ? [] : [fullDocumentEdit(document, formatted)];
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(FORMAT_SLOTS_COMMAND, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const formatted = await nextFormattedText(editor.document);
      if (formatted === null) {
        return;
      }
      await editor.edit((builder) => {
        builder.replace(
          new vscode.Range(
            editor.document.positionAt(0),
            editor.document.lineAt(editor.document.lineCount - 1).range.end,
          ),
          formatted,
        );
      });
    }),
  );

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("pyjinhx") && ruff.forget()));
  void onPythonEnvironmentChange(() => ruff.forget()).then((d) => d && context.subscriptions.push(d));
}
