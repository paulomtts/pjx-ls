export const STUB_MISSING = "stub-missing";
export const GENERATE_STUB_COMMAND = "pyjinhx.generateStub";

/** The arguments of `python` that write the `.pyi` stub of one document. */
export const stubgenArgs = (file: string) => ["-m", "pyjinhx.stubgen", file];

/** The diagnostics a stub can fix: the manifest's own, by code. */
export const needsStub = (d: { code?: unknown; source?: string }) => d.source === "pyjinhx" && d.code === STUB_MISSING;
