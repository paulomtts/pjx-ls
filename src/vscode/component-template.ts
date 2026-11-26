import { TEMPLATE_LANGUAGE_ID } from "../config.ts";

/**
 * The minimal slice of a `vscode.TextDocument` the scope guard needs. A real
 * `vscode.TextDocument` structurally satisfies this, so the guard can be unit
 * tested without the vscode runtime.
 */
export interface TemplateDocumentLike {
  uri: { scheme: string };
  languageId: string;
}

/** True only for on-disk documents in the dedicated `pyjinhx` language. */
export function isComponentTemplate(document: TemplateDocumentLike): boolean {
  return document.uri.scheme === "file" && document.languageId === TEMPLATE_LANGUAGE_ID;
}
