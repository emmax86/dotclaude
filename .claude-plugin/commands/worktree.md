# worktree

Manage git worktrees inside a workspace. Worktrees are stored in a shared pool under `worktrees/{repo}/{slug}/` and referenced by symlinks from each workspace.

## Usage

```
grove ws worktree add [repo] <branch> [--new] [--from <base>]
grove ws worktree list [repo] [--porcelain]
grove ws worktree remove [repo] <slug> [--force]
grove ws worktree prune
```

## Subcommands

### add

Create a git worktree for a branch. The `repo` argument is optional when running inside a workspace repo directory.

- `--new` creates a new branch (equivalent to `git worktree add -b`)
- `--from <base>` sets the base branch when creating a new branch

```
grove ws worktree add myrepo feature/auth --new
grove ws worktree add myrepo feature/auth --new --from main
grove ws worktree add myrepo existing-branch
```

### list

List worktrees for a repo in the current workspace.

```
grove ws worktree list myrepo
grove ws worktree list myrepo --porcelain
```

### remove

Remove a worktree. Uses `--force` to remove dirty worktrees. The workspace symlink and (if last reference) the pool entry are both removed.

```
grove ws worktree remove myrepo feature-auth
grove ws worktree remove myrepo feature-auth --force
```

### prune

Remove dangling pool symlinks whose targets no longer exist (e.g., after `git worktree remove` or manual deletion). Scans all repos in the workspace.

```
grove ws worktree prune
```

## Notes

- Branch names are slugified (`/` → `-`) when used as directory names.
- The pool allows multiple workspaces to share the same git worktree.
- Default-branch symlinks (created by `repo add`) cannot be removed via `worktree remove`; use `repo remove` instead.
- `prune` also runs automatically as part of `ws sync`.
