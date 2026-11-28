// Only the dedicated language: claiming html/jinja would compete with the user's own formatters.
export const TEMPLATE_LANGUAGE_ID = "pyjinhx";
export const TEMPLATE_SELECTOR = [{ language: TEMPLATE_LANGUAGE_ID, scheme: "file" }];

// Files and unsaved documents: the HTML view of either is served the same way.
export const FORWARDING_SELECTOR = [
  { language: TEMPLATE_LANGUAGE_ID, scheme: "file" },
  { language: TEMPLATE_LANGUAGE_ID, scheme: "untitled" },
];

export const OUTPUT_CHANNEL_NAME = "PyJinHx";
// The id is older than the command: it formatted slotted tags only. Kept for keybindings.
export const FORMAT_COMMAND = "pyjinhx.formatSlots";

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
