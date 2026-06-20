import * as vscode from "vscode";
import { execFile } from "node:child_process";

let warnedMissing = false;

/**
 * Format a chunk of Python source with `ruff format` (reads stdin, writes the
 * formatted source to stdout). Returns the formatted text, or null when ruff is
 * missing / errors / the source is unparseable — callers then leave the block
 * unchanged. `cwd` is the workspace folder so ruff picks up the project's
 * pyproject/ruff config (line length, etc.).
 */
export function runRuffFormat(
  source: string,
  command: string,
  cwd: string | undefined,
  output: vscode.OutputChannel,
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(command, ["format", "-"], { cwd }, (error, stdout, stderr) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          if (!warnedMissing) {
            warnedMissing = true;
            output.appendLine(
              `ruff not found ('${command}'); set pyjinhx.ruffPath to enable ` +
                `{# python #} formatting. Skipping.`,
            );
          }
        } else {
          // A syntax error in the block is expected mid-edit; log quietly.
          output.appendLine(`ruff format skipped: ${stderr || error.message}`);
        }
        resolve(null);
        return;
      }
      resolve(stdout);
    });
    child.stdin?.end(source);
  });
}
