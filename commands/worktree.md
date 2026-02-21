# /worktree — Git Worktree Operations

Create and manage git worktrees inside a workspace. Each worktree is a `git worktree add` checkout in `{workspace}/{repo}/{branch-slug}/`.

## Usage

When the user invokes `/worktree`, detect their intent and run the appropriate `dotclaude ws worktree` command.

```bash
# Add a worktree for an existing branch
dotclaude ws worktree add [repo] <branch>

# Add a worktree with a new branch
dotclaude ws worktree add [repo] <branch> --new

# Add a worktree with a new branch from a specific base
dotclaude ws worktree add [repo] <branch> --new --from <base-branch>

# List worktrees for a repo
dotclaude ws worktree list [repo]
dotclaude ws worktree list [repo] --porcelain  # repo\tslug\tbranch\ttype per line

# Remove a worktree
dotclaude ws worktree remove [repo] <slug>
dotclaude ws worktree remove [repo] <slug> --force   # force remove even if dirty
```

## Notes

- Branch names are converted to slugs: `feature/auth` → `feature-auth` (slashes become dashes).
- The default branch (main/master) shows as type `linked` — it's a symlink, not a real worktree. You cannot remove it with `worktree remove`.
- If two branch names produce the same slug, `worktree add` will error with `SLUG_COLLISION`. Pick a different name.
- `[repo]` and workspace are inferred from `$PWD` when inside a workspace.

## Examples

```bash
# From inside ~/dotclaude-workspaces/myws/
dotclaude ws worktree add myrepo feature/auth --new
# Creates ~/dotclaude-workspaces/myws/myrepo/feature-auth/ as a real git worktree

dotclaude ws worktree add myrepo fix/v2 --new --from main
# Creates a new branch fix/v2 off main, checks it out as a worktree

dotclaude ws worktree list myrepo --porcelain
# myrepo  main          main          linked
# myrepo  feature-auth  feature/auth  worktree

dotclaude ws worktree remove myrepo feature-auth
```
