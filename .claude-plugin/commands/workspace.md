# workspace

Manage workspaces in grove. A workspace groups repos and their git worktrees under a named directory.

## Usage

```
grove ws add <name>
grove ws list [--porcelain]
grove ws remove <name> [--force]
grove ws status [workspace]
grove ws path [workspace]
grove ws sync [workspace]
```

## Subcommands

### add

Create a new workspace. Creates the directory structure including a `.claude/` dir, `workspace.json` config, and a `.code-workspace` file for VS Code.

```
grove ws add myproject
```

### list

List all workspaces. With `--porcelain`, outputs one name per line.

```
grove ws list
grove ws list --porcelain
```

### remove

Remove a workspace directory. Fails if repos are registered unless `--force` is passed. With `--force`, removes all worktrees first.

```
grove ws remove myproject
grove ws remove myproject --force
```

### status

Show an overview of repos and worktrees in a workspace.

```
grove ws status myproject
grove ws status          # uses current workspace from context
```

### path

Print the filesystem path of a workspace.

```
grove ws path myproject
grove ws path --porcelain   # plain path only
```

### sync

Repair a workspace's filesystem state to match `workspace.json`. Recreates any missing or dangling `repos/<name>` symlinks, `trees/<repo>/` directories, and default-branch symlinks. Regenerates the `.code-workspace` file. Safe to run repeatedly — idempotent.

Also prunes dangling pool worktree symlinks (equivalent to running `ws worktree prune`). The output includes a `pruned` array alongside the per-repo `repos` array.

Returns per-repo status: `ok` (nothing needed), `repaired` (something was fixed), or `dangling` (source path is no longer a git repo).

```
grove ws sync myproject
grove ws sync          # uses current workspace from context
```

## Notes

- Reserved names: `repos`, `worktrees` cannot be used as workspace names.
- Workspace names may not contain `/`, `\`, or `..`.
- The current workspace is inferred by walking up from `$PWD` looking for `workspace.json`.
