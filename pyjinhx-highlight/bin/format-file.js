#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { formatPyjinhxTemplate } = require("../format-slots");

function usage() {
  process.stderr.write("Usage: format-file.js <path/to/template.html|template.pjx>\n");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  usage();
}

const normalizedPath = path.resolve(filePath).split(path.sep).join("/");
if (
  !normalizedPath.includes("/components/")
  || !(normalizedPath.endsWith(".html") || normalizedPath.endsWith(".pjx"))
) {
  process.exit(0);
}

const original = fs.readFileSync(filePath, "utf8");
const formatted = formatPyjinhxTemplate(original);
if (formatted !== original) {
  fs.writeFileSync(filePath, formatted, "utf8");
}
