import { formatSlottedPascalTags } from "./slots.ts";
import { formatHtmlStructure } from "./html-structure.ts";

export function formatPyjinhxTemplate(text: string): string {
  return formatHtmlStructure(formatSlottedPascalTags(text));
}
