# /worktree — Git Worktree Operations

Create and manage git worktrees inside a workspace. Worktrees are stored in a shared pool at `{root}/worktrees/{repo}/{slug}/` and accessed via symlinks from each workspace at `{workspace}/{repo}/{slug}`. Multiple workspaces can share the same branch's worktree — the real checkout is created once and cleaned up when the last workspace reference is removed.

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
- If a pool entry for the branch already exists (another workspace checked it out), the real worktree is reused — no new `git worktree add` is run.
- `--new` and `--from` flags are silently ignored when reusing an existing pool entry.
- `worktree remove` only removes the pool entry (the real checkout) when the last workspace reference is removed.

## Examples

```bash
# From inside ~/dotclaude-workspaces/myws/
dotclaude ws worktree add myrepo feature/auth --new
# Pool: ~/dotclaude-workspaces/worktrees/myrepo/feature-auth/  (real git worktree)
# Link: ~/dotclaude-workspaces/myws/myrepo/feature-auth → ../../worktrees/myrepo/feature-auth

dotclaude ws worktree add myrepo fix/v2 --new --from main
# Creates a new branch fix/v2 off main, checks it out in the pool

# From otherws — reuses same pool entry (no duplicate branch error)
dotclaude ws worktree add myrepo feature/auth
# Pool entry already exists; only adds workspace symlink and pool reference

dotclaude ws worktree list myrepo --porcelain
# myrepo  main          main          linked
# myrepo  feature-auth  feature/auth  worktree

dotclaude ws worktree remove myrepo feature-auth
# Removes workspace symlink; removes real worktree only if no other workspace references it
```
