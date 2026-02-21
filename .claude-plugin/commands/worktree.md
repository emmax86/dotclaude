# worktree

Manage git worktrees inside a workspace. Worktrees are stored in a shared pool under `worktrees/{repo}/{slug}/` and referenced by symlinks from each workspace.

## Usage

```
dotclaude ws worktree add [repo] <branch> [--new] [--from <base>]
dotclaude ws worktree list [repo] [--porcelain]
dotclaude ws worktree remove [repo] <slug> [--force]
```

## Subcommands

### add

Create a git worktree for a branch. The `repo` argument is optional when running inside a workspace repo directory.

- `--new` creates a new branch (equivalent to `git worktree add -b`)
- `--from <base>` sets the base branch when creating a new branch

```
dotclaude ws worktree add myrepo feature/auth --new
dotclaude ws worktree add myrepo feature/auth --new --from main
dotclaude ws worktree add myrepo existing-branch
```

### list

List worktrees for a repo in the current workspace.

```
dotclaude ws worktree list myrepo
dotclaude ws worktree list myrepo --porcelain
```

### remove

Remove a worktree. Uses `--force` to remove dirty worktrees. The workspace symlink and (if last reference) the pool entry are both removed.

```
dotclaude ws worktree remove myrepo feature-auth
dotclaude ws worktree remove myrepo feature-auth --force
```

## Notes

- Branch names are slugified (`/` → `-`) when used as directory names.
- The pool allows multiple workspaces to share the same git worktree.
- Default-branch symlinks (created by `repo add`) cannot be removed via `worktree remove`; use `repo remove` instead.
