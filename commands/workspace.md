# /workspace — Workspace & Repo Management

Manage dotclaude workspaces and repos. Workspaces live in `~/dotclaude-workspaces/` (or `$DOTCLAUDE_ROOT`).

## Usage

When the user invokes `/workspace`, detect their intent from their message and run the appropriate `dotclaude ws` command. Use `--porcelain` for parsing output in follow-up steps.

### Workspace operations

```bash
# Create a new workspace
dotclaude ws add <name>

# List all workspaces
dotclaude ws list
dotclaude ws list --porcelain   # one name per line

# Remove a workspace (use --force if it has repos)
dotclaude ws remove <name>
dotclaude ws remove <name> --force

# Print workspace directory path (useful for cd)
dotclaude ws path [workspace]
```

### Repo operations

```bash
# Add a repo to a workspace (name derived from directory basename)
dotclaude ws repo add [workspace] <path-to-repo>
dotclaude ws repo add [workspace] <path-to-repo> --name <override>

# List repos in a workspace
dotclaude ws repo list [workspace]
dotclaude ws repo list [workspace] --porcelain  # name\tpath\tstatus per line

# Remove a repo from a workspace (global tree symlink is kept)
dotclaude ws repo remove [workspace] <repo-name>
dotclaude ws repo remove [workspace] <repo-name> --force   # removes worktrees too
```

## Context inference

When run from inside a workspace directory, `[workspace]` and `[repo]` args are inferred automatically from `$PWD`.

## Key facts

- `repos/` is a global registry — one symlink per repo, shared across workspaces.
- Removing a repo from a workspace never removes the global repo symlink.
- The default branch is a symlink (`../trees/{repo}`), not a real worktree.
- Each workspace has a `trees/` subdirectory with per-workspace symlinks → `../../repos/{repo}`.
- The name `trees` is reserved and cannot be used as a repo name.
- `--force` on remove will run `git worktree remove --force` on all real worktrees first.

## Examples

```bash
# Set up a new workspace for the "cadence" project
dotclaude ws add cadence-project
dotclaude ws repo add cadence-project ~/Projects/cadence
dotclaude ws repo add cadence-project ~/Projects/cadence-api --name api

# Add a second workspace sharing the same repo
dotclaude ws add hotfix-ws
dotclaude ws repo add hotfix-ws ~/Projects/cadence   # reuses existing repos/cadence symlink
```
