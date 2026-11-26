import * as vscode from "vscode";
import { TEMPLATE_SELECTOR, isComponentTemplate } from "./config.ts";
import { nodeSpawn } from "../core/manifest-runner.ts";
import { AutoStubs, GENERATE_STUB_COMMAND, needsStub, stubgenArgs } from "../core/stub-fix.ts";
import { findPython } from "./python-env.ts";
import { manifestPath, type Manifests } from "./manifest-service.ts";

/** Runs stubgen on `files` from the folder's interpreter; returns the error, if any. */
async function runStubgen(folder: vscode.WorkspaceFolder, files: string[]): Promise<string | undefined> {
  const python = await findPython(folder);
  if (!python) return "no Python interpreter found to run pyjinhx.stubgen";
  const exit = await nodeSpawn(python.python, stubgenArgs(...files), undefined, folder.uri.fsPath).exit.catch((e) => ({ code: null, stdout: "", stderr: String(e) }));
  return exit.code === 0 ? undefined : `pyjinhx.stubgen failed (exit ${exit.code}): ${exit.stderr.trim()}`;
}

/** A "Generate stub" quick fix on the manifest's stub warnings, and stubgen run on its own while `pyjinhx.generateStubs` is on. */
export function registerStubFix(context: vscode.ExtensionContext, manifests: Manifests, output: vscode.OutputChannel): void {
  const generate = async (uri: vscode.Uri) => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const error = folder ? await runStubgen(folder, [uri.fsPath]) : "no workspace folder for this document";
    if (error) {
      output.appendLine(error);
      if ((await vscode.window.showErrorMessage("PyJinHx: could not generate the stub", "Show output")) === "Show output") output.show();
      return;
    }
    await manifests.refresh();
  };

  const auto = new AutoStubs();
  const generateAll = async () => {
    if (!vscode.workspace.getConfiguration("pyjinhx").get<boolean>("generateStubs", true)) return;
    const files = auto.next(manifests.all().flatMap((m) => m.diagnostics));
    const byFolder = new Map<vscode.WorkspaceFolder, string[]>();
    for (const file of files) {
      const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
      if (folder) byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
      else auto.finished([file]);
    }
    if (!byFolder.size) return;
    await Promise.all(
      [...byFolder].map(async ([folder, group]) => {
        const error = await runStubgen(folder, group);
        output.appendLine(`[${folder.name}] ${error ?? `pyjinhx.stubgen wrote ${group.length} stub(s)`}`);
        auto.finished(group);
      }),
    );
    await manifests.refresh();
  };

  context.subscriptions.push(
    manifests.onDidChange(() => void generateAll()),
    vscode.workspace.onDidSaveTextDocument((document) => isComponentTemplate(document) && auto.saved(manifestPath(document.uri))),
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
