import * as vscode from "vscode";
import { TEMPLATE_SELECTOR } from "./config.ts";
import { nodeSpawn } from "../core/manifest-runner.ts";
import { GENERATE_STUB_COMMAND, needsStub, stubgenArgs } from "../core/stub-fix.ts";
import { findPython } from "./python-env.ts";
import type { Manifests } from "./manifest-service.ts";

/** A "Generate stub" quick fix on the manifest's `stub-missing` warning. */
export function registerStubFix(context: vscode.ExtensionContext, manifests: Manifests, output: vscode.OutputChannel): void {
  const fail = async (message: string) => {
    if ((await vscode.window.showErrorMessage(`PyJinHx: ${message}`, "Show output")) === "Show output") output.show();
  };

  const generate = async (uri: vscode.Uri) => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const python = folder && (await findPython(folder));
    if (!folder || !python) return fail("no Python interpreter found to run pyjinhx.stubgen");
    const exit = await nodeSpawn(python.python, stubgenArgs(uri.fsPath), undefined, folder.uri.fsPath).exit.catch((e) => ({ code: null, stdout: "", stderr: String(e) }));
    if (exit.code !== 0) {
      output.appendLine(`[${folder.name}] pyjinhx.stubgen failed (exit ${exit.code}): ${exit.stderr.trim()}`);
      return fail("could not generate the stub");
    }
    await manifests.refresh();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(GENERATE_STUB_COMMAND, generate),
    vscode.languages.registerCodeActionsProvider(
      TEMPLATE_SELECTOR,
      {
        provideCodeActions(document, _range, { diagnostics }) {
          return diagnostics.filter(needsStub).map((diagnostic) => {
            const action = new vscode.CodeAction("Generate stub for this document", vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            action.command = { command: GENERATE_STUB_COMMAND, title: action.title, arguments: [document.uri] };
            return action;
          });
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );
}
