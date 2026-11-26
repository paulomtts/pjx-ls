export const INDENT = "  ";

// Only the dedicated language: claiming html/jinja would compete with the user's own formatters.
export const TEMPLATE_LANGUAGE_ID = "pyjinhx";
export const TEMPLATE_SELECTOR = [{ language: TEMPLATE_LANGUAGE_ID, scheme: "file" }];

// Files and unsaved documents: the HTML view of either is served the same way.
export const FORWARDING_SELECTOR = [
  { language: TEMPLATE_LANGUAGE_ID, scheme: "file" },
  { language: TEMPLATE_LANGUAGE_ID, scheme: "untitled" },
];

export const OUTPUT_CHANNEL_NAME = "PyJinHx";
export const FORMAT_SLOTS_COMMAND = "pyjinhx.formatSlots";
