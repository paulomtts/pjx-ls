import { formatHtmlStructure } from "./html-structure.ts";

/**
 * Format a PyJinHx template: structural HTML/Jinja re-indentation with slot-aware
 * tag explosion (slotted component tags lay their attributes one-per-line and
 * recursively format their slot values).
 */
export function formatPyjinhxTemplate(text: string): string {
  return formatHtmlStructure(text);
}
