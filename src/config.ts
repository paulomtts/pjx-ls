export const INDENT = "  ";

export const TEMPLATE_LANGUAGE_IDS: ReadonlySet<string> = new Set([
  "html",
  "jinja",
  "jinja-html",
  "pyjinhx",
]);
export const TEMPLATE_EXTENSIONS = [".html", ".pjx"] as const;
export const COMPONENTS_PATH_SEGMENT = "/components/";

export const OUTPUT_CHANNEL_NAME = "PyJinHx";
export const CONFIG_SECTION = "pyjinhx";
export const FORMAT_ON_SAVE_KEY = "formatSlotsOnSave";
export const FORMAT_SLOTS_COMMAND = "pyjinhx.formatSlots";
