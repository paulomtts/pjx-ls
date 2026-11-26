import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./vscode/config.ts";
import { registerFormatting } from "./vscode/formatting.ts";
import { Views } from "./vscode/virtual-documents.ts";
import { registerForwarding } from "./vscode/forwarding.ts";
import { registerTyping } from "./vscode/typing.ts";
import { registerDiagnostics } from "./vscode/diagnostics.ts";
import { Manifests } from "./vscode/manifest-service.ts";
import { registerPjxFeatures } from "./vscode/pjx-features.ts";
import { registerStubFix } from "./vscode/stub-fix.ts";
import { registerStatus } from "./vscode/status.ts";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  output.appendLine("PyJinHx extension activated.");
  context.subscriptions.push(output);
  registerFormatting(context);
  registerTyping(context);
  const views = new Views();
  views.register(context);
  const manifests = new Manifests(output);
  registerForwarding(context, views, manifests);
  context.subscriptions.push(
    manifests,
    vscode.commands.registerCommand("pyjinhx.refreshManifest", () => manifests.refresh()),
    vscode.commands.registerCommand("pyjinhx.showOutput", () => output.show()),
  );
  registerPjxFeatures(context, manifests, views);
  registerDiagnostics(context, manifests);
  registerStatus(context, manifests);
  registerStubFix(context, manifests, output);
}

export function deactivate(): void {}
