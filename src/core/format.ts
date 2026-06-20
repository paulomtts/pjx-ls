import { formatHtmlStructure } from "./html-structure.ts";
import { findPythonBlock } from "./python-block.ts";

/**
 * Format a PyJinHx template: structural HTML/Jinja re-indentation with slot-aware
 * tag explosion. A leading `{# python … #}` single-file-component block is left
 * exactly as written — only the template body after it is formatted.
 */
export function formatPyjinhxTemplate(text: string): string {
  const block = findPythonBlock(text);
  if (!block) {
    return formatHtmlStructure(text);
  }
  const head = text.slice(0, block.afterClose); // verbatim, includes closing line + newline
  const body = text.slice(block.afterClose);
  if (body.trim() === "") {
    return head;
  }
  return head + formatHtmlStructure(body);
}
