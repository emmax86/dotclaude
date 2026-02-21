# /workspace-status — Workspace Overview

Show a status overview of the current (or specified) workspace: repos, worktrees, and health.

## Usage

```bash
dotclaude ws status [workspace]
```

When invoked from inside a workspace, workspace is inferred from `$PWD`.

## Output

JSON format (default):
```json
{
  "ok": true,
  "data": {
    "name": "myws",
    "path": "/Users/emma/dotclaude-workspaces/myws",
    "repos": [
      {
        "name": "cadence",
        "path": "/Users/emma/Projects/cadence",
        "status": "ok",
        "worktrees": [
          { "repo": "cadence", "slug": "main",         "branch": "main",         "type": "linked"   },
          { "repo": "cadence", "slug": "feature-auth", "branch": "feature-auth", "type": "worktree" }
        ]
      }
    ]
  }
}
```

## Health indicators

- `status: "ok"` — repo symlink is valid and resolves
- `status: "dangling"` — the repo has moved or been deleted; symlink is broken
- `type: "linked"` — default branch, accessed via `repos/` symlink
- `type: "worktree"` — real `git worktree` checkout

## Instructions

When the user invokes `/workspace-status`:
1. Run `dotclaude ws status` (infer workspace from cwd if not specified)
2. Parse the JSON output
3. Present a human-readable summary showing:
   - Workspace name and path
   - Each repo with its worktrees, noting any `dangling` repos
   - A count of total worktrees across all repos
4. If any repos are dangling, highlight them and suggest the repo path may have moved
