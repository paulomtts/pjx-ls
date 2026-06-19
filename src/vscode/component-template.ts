import { sep } from "node:path";
import {
  COMPONENTS_PATH_SEGMENT,
  TEMPLATE_EXTENSIONS,
  TEMPLATE_LANGUAGE_IDS,
} from "../config.ts";

/**
 * The minimal slice of a `vscode.TextDocument` the scope guard needs. A real
 * `vscode.TextDocument` structurally satisfies this, so the guard can be unit
 * tested without the vscode runtime.
 */
export interface TemplateDocumentLike {
  uri: { scheme: string; fsPath: string };
  fileName: string;
  languageId: string;
}

function isTemplateExtension(fileName: string): boolean {
  return TEMPLATE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

/**
 * True only for on-disk component templates the formatter is allowed to touch:
 * file scheme, `.html`/`.pjx` extension, a path containing `/components/`, and a
 * supported template language id.
 */
export function isComponentTemplate(document: TemplateDocumentLike): boolean {
  if (document.uri.scheme !== "file") {
    return false;
  }
  if (!isTemplateExtension(document.fileName)) {
    return false;
  }
  // A `.pjx` file is the dedicated PyJinHx language, so it is always a component
  // template. An `.html` file is only treated as one when it lives under a
  // `/components/` path (avoids reformatting arbitrary HTML documents).
  if (!document.fileName.endsWith(".pjx")) {
    const normalizedPath = document.uri.fsPath.split(sep).join("/");
    if (!normalizedPath.includes(COMPONENTS_PATH_SEGMENT)) {
      return false;
    }
  }
  return TEMPLATE_LANGUAGE_IDS.has(document.languageId);
}
