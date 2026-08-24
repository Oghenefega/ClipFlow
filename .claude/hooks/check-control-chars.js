#!/usr/bin/env node
// PostToolUse hook (Write|Edit): scan the edited file for invisible control
// characters (the s187 incident — a literal 0x08 landed in a regex, compiled,
// shipped, and silently never matched). Exit 2 blocks with feedback to Claude.
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let filePath;
  try {
    const input = JSON.parse(raw);
    filePath = (input.tool_input && input.tool_input.file_path) ||
      (input.tool_response && input.tool_response.filePath);
  } catch (e) {
    process.exit(0);
  }
  if (!filePath) process.exit(0);
  if (!/\.(js|jsx|ts|tsx|css|html|json|md|ps1|yml|yaml)$/i.test(filePath)) process.exit(0);
  const fs = require("fs");
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    process.exit(0);
  }
  const bad = [];
  for (let i = 0; i < text.length && bad.length < 5; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) bad.push({ i, c });
  }
  if (bad.length) {
    const line = text.slice(0, bad[0].i).split("\n").length;
    console.error(
      "Control character(s) in " + filePath + ": " +
      bad.map((b) => "charCode " + b.c + " at offset " + b.i).join(", ") +
      " (first at line " + line + "). This is the s187 invisible-byte class — remove them before building."
    );
    process.exit(2);
  }
  process.exit(0);
});
