# workspace

Manage workspaces in dotclaude. A workspace groups repos and their git worktrees under a named directory.

## Usage

```
dotclaude ws add <name>
dotclaude ws list [--porcelain]
dotclaude ws remove <name> [--force]
dotclaude ws status [workspace]
dotclaude ws path [workspace]
```

## Subcommands

### add

Create a new workspace. Creates the directory structure including a `.claude/` dir, `workspace.json` config, and a `.code-workspace` file for VS Code.

```
dotclaude ws add myproject
```

### list

List all workspaces. With `--porcelain`, outputs one name per line.

```
dotclaude ws list
dotclaude ws list --porcelain
```

### remove

Remove a workspace directory. Fails if repos are registered unless `--force` is passed. With `--force`, removes all worktrees first.

```
dotclaude ws remove myproject
dotclaude ws remove myproject --force
```

### status

Show an overview of repos and worktrees in a workspace.

```
dotclaude ws status myproject
dotclaude ws status          # uses current workspace from context
```

### path

Print the filesystem path of a workspace.

```
dotclaude ws path myproject
dotclaude ws path --porcelain   # plain path only
```

## Notes

- Reserved names: `repos`, `worktrees` cannot be used as workspace names.
- Workspace names may not contain `/`, `\`, or `..`.
- The current workspace is inferred by walking up from `$PWD` looking for `workspace.json`.
