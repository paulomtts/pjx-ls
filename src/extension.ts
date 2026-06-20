import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./config.ts";
import { registerFormatting } from "./vscode/formatting.ts";
import { registerPythonIntellisense } from "./vscode/python-intellisense.ts";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  output.appendLine("PyJinHx extension activated.");
  context.subscriptions.push(output);
  registerFormatting(context, output);
  registerPythonIntellisense(context);
}

export function deactivate(): void {}
