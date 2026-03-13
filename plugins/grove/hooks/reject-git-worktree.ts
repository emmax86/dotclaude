#!/usr/bin/env bun
// PreToolUse hook: deny direct `git worktree` commands in grove workspaces.
//
// Strategy: split the command on shell operators (;  &  |  newline) to get
// individual command segments, then tokenize each segment and walk it
// structurally — no regex for the core detection.
//
// Known limitation: command substitution (`$(git worktree list)`) and
// heredoc-embedded calls are not detected. Full shell parsing is out of scope.

const DENY_OUTPUT = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "Direct git worktree commands are not allowed in grove workspaces.",
    additionalContext:
      "Use grove skills to manage worktrees:\n" +
      "- /worktree add [repo] <branch> [--new] — create a worktree\n" +
      "- /worktree list [repo] — list worktrees\n" +
      "- /worktree remove [repo] <slug> — remove a worktree\n" +
      "- /worktree prune — clean up stale worktrees\n\n" +
      "Or use the create-grove-worktree skill when starting work on a new branch.",
  },
};

// Git global options that consume the next token as a separate value argument.
const VALUE_FLAGS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

function isGitWorktreeSegment(segment: string): boolean {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  let i = 0;

  // Skip leading env var assignments (VAR=value).
  while (i < tokens.length && /^[A-Za-z_]\w*=/.test(tokens[i])) {
    i++;
  }

  // First non-env token must be exactly "git".
  if (tokens[i] !== "git") {
    return false;
  }
  i++;

  // Skip git global flags, consuming their value argument where applicable.
  while (i < tokens.length && tokens[i].startsWith("-")) {
    const flag = tokens[i++];
    if (VALUE_FLAGS.has(flag) && i < tokens.length && !tokens[i].startsWith("-")) {
      i++; // consume the flag's value (e.g. -C <path>)
    }
  }

  // The next token must be exactly the "worktree" subcommand.
  return tokens[i] === "worktree";
}

const input = JSON.parse(await Bun.stdin.text());
const command: string = input?.tool_input?.command ?? "";

const denied = command.split(/[;&|\n]/).some(isGitWorktreeSegment);

if (denied) {
  process.stdout.write(`${JSON.stringify(DENY_OUTPUT)}\n`);
  process.exit(2);
}

process.exit(0);
