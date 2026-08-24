#!/usr/bin/env node
// PreToolUse hook (Bash, git commands): a session-wrap commit ("... wrap ...")
// must not go through while CHANGELOG.md is completely untouched — the
// changelog-every-session rule is non-negotiable in CLAUDE.md. Exit 2 blocks
// the commit and tells Claude to update the changelog first.
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let cmd, cwd;
  try {
    const input = JSON.parse(raw);
    cmd = (input.tool_input && input.tool_input.command) || "";
    cwd = input.cwd || process.cwd();
  } catch (e) {
    process.exit(0);
  }
  if (!/git[\s\S]*commit/.test(cmd) || !/wrap/i.test(cmd)) process.exit(0);
  const { execSync } = require("child_process");
  let status = "";
  try {
    status = execSync("git status --porcelain -- CHANGELOG.md", { cwd, encoding: "utf8" });
    // Also treat a CHANGELOG.md change already committed this session's wrap-run as satisfied:
    if (status.trim() === "") {
      const last = execSync("git log -1 --name-only --format=", { cwd, encoding: "utf8" });
      if (/^CHANGELOG\.md$/m.test(last)) process.exit(0);
    }
  } catch (e) {
    process.exit(0);
  }
  if (status.trim() === "") {
    console.error(
      "Session-wrap commit without a CHANGELOG.md update — the changelog rule is non-negotiable. Update CHANGELOG.md first, then retry the commit."
    );
    process.exit(2);
  }
  process.exit(0);
});
