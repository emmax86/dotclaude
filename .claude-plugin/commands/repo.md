# repo

Manage repos registered in a workspace. A repo links an existing git repository into the workspace, creating a global symlink in `repos/` and a default-branch symlink.

## Usage

```
dotclaude ws repo add [workspace] <path> [--name <name>]
dotclaude ws repo list [workspace] [--porcelain]
dotclaude ws repo remove [workspace] <name> [--force]
```

## Subcommands

### add

Register a git repository in a workspace. The repo name defaults to the directory basename.

- `--name <name>` overrides the derived name

```
dotclaude ws repo add myproject /path/to/myapp
dotclaude ws repo add myproject /path/to/myapp --name customname
dotclaude ws repo add /path/to/myapp          # workspace from context
```

Creates:

- `repos/{name}` → symlink to the real repo
- `{workspace}/trees/{name}` → symlink for workspace-local access
- `{workspace}/{name}/{default-branch}` → default-branch symlink

### list

List repos registered in a workspace.

```
dotclaude ws repo list myproject
dotclaude ws repo list myproject --porcelain
```

Porcelain output: `name\tpath\tstatus` (status is `ok` or `dangling`).

### remove

Remove a repo from a workspace. Fails if worktrees exist unless `--force` is passed.

```
dotclaude ws repo remove myproject myapp
dotclaude ws repo remove myproject myapp --force
```

The global `repos/{name}` symlink is preserved (other workspaces may still use it).

## Notes

- Reserved name: `trees` cannot be used as a repo name.
- Repo names may not contain `/`, `\`, or `..`.
- Multiple workspaces can register the same repo — they share the global `repos/` symlink.
