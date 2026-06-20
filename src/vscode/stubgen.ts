// src/vscode/stubgen.ts
import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { CONFIG_SECTION } from "../config.ts";

export function registerStubgen(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId !== "pyjinhx") return;
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      if (!config.get("generateStubsOnSave", true)) return;

      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!folder) return;

      const python = config.get<string>("pythonPath", "") || "python";
      execFile(
        python,
        ["-m", "pyjinhx.stubgen", folder.uri.fsPath],
        { cwd: folder.uri.fsPath },
        (error, _stdout, stderr) => {
          if (error) {
            output.appendLine(`stubgen failed: ${stderr || error.message}`);
          }
        },
      );
    }),
  );
}
