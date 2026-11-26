export interface Lookups {
  folder: string;
  /** `pyjinhx.pythonPath`; empty when unset. */
  setting: string;
  platform: string;
  /** The Python extension's active environment, if that extension is installed. */
  fromExtension: () => Promise<string | undefined>;
  exists: (path: string) => boolean;
  onPath: (name: string) => string | undefined;
}

export interface Found {
  python: string;
  source: "setting" | "python-extension" | "venv" | "path";
}

/** The interpreter to run pyjinhx with: the setting, the Python extension, the folder's `.venv`, then `PATH`. */
export async function discoverPython(l: Lookups): Promise<Found | null> {
  if (l.setting.trim()) return { python: l.setting.trim().replaceAll("${workspaceFolder}", l.folder), source: "setting" };
  const extension = await l.fromExtension().catch(() => undefined);
  if (extension && l.exists(extension)) return { python: extension, source: "python-extension" };
  const windows = l.platform === "win32";
  const venv = `${l.folder}/.venv/${windows ? "Scripts/python.exe" : "bin/python"}`;
  if (l.exists(venv)) return { python: venv, source: "venv" };
  const python = l.onPath(windows ? "python" : "python3");
  return python ? { python, source: "path" } : null;
}
