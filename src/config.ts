export const INDENT = "  ";

// Only the dedicated language: claiming html/jinja would compete with the user's own formatters.
export const TEMPLATE_LANGUAGE_IDS: ReadonlySet<string> = new Set(["pyjinhx"]);
export const TEMPLATE_SELECTOR = [{ language: "pyjinhx", scheme: "file" }];
export const TEMPLATE_EXTENSIONS = [".html", ".pjx"] as const;
export const COMPONENTS_PATH_SEGMENT = "/components/";

export const OUTPUT_CHANNEL_NAME = "PyJinHx";
export const FORMAT_SLOTS_COMMAND = "pyjinhx.formatSlots";
