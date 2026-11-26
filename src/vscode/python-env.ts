import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { discoverPython, type Found } from "../core/python-discovery.ts";

interface PythonApi {
  environments: {
    getActiveEnvironmentPath(resource?: vscode.Uri): { path: string };
    onDidChangeActiveEnvironmentPath: vscode.Event<unknown>;
  };
}

// The Python extension is used if it is installed, and is never required.
async function pythonApi(): Promise<PythonApi | undefined> {
  const extension = vscode.extensions.getExtension<PythonApi>("ms-python.python");
  return extension ? (extension.isActive ? extension.exports : await extension.activate()) : undefined;
}

// Waking the Python extension is only worth it when its environment is what would be used.
const wanted = () => {
  const extension = vscode.extensions.getExtension("ms-python.python");
  return !!extension && (extension.isActive || !vscode.workspace.getConfiguration("pyjinhx").get<string>("pythonPath", "").trim());
};

function onPath(name: string): string | undefined {
  const names = process.platform === "win32" ? [`${name}.exe`, `${name}.cmd`] : [name];
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .flatMap((dir) => names.map((n) => path.join(dir, n)))
    .find((candidate) => fs.existsSync(candidate));
}

export function findPython(folder: vscode.WorkspaceFolder): Promise<Found | null> {
  return discoverPython({
    folder: folder.uri.fsPath,
    setting: vscode.workspace.getConfiguration("pyjinhx", folder.uri).get<string>("pythonPath", ""),
    platform: process.platform,
    fromExtension: async () => (await pythonApi())?.environments.getActiveEnvironmentPath(folder.uri).path,
    exists: fs.existsSync,
    onPath,
  });
}

/** Calls `listener` when the Python extension's active environment changes. */
export async function onPythonEnvironmentChange(listener: () => void): Promise<vscode.Disposable | undefined> {
  if (!wanted()) return undefined;
  return (await pythonApi().catch(() => undefined))?.environments.onDidChangeActiveEnvironmentPath(listener);
}
