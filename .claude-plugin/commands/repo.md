# repo

Manage repos registered in a workspace. A repo links an existing git repository into the workspace, creating a global symlink in `repos/` and a default-branch symlink.

## Usage

```
grove ws repo add [workspace] <path> [--name <name>]
grove ws repo list [workspace] [--porcelain]
grove ws repo remove [workspace] <name> [--force]
```

## Subcommands

### add

Register a git repository in a workspace. The repo name defaults to the directory basename.

- `--name <name>` overrides the derived name

```
grove ws repo add myproject /path/to/myapp
grove ws repo add myproject /path/to/myapp --name customname
grove ws repo add /path/to/myapp          # workspace from context
```

Creates:

- `repos/{name}` → symlink to the real repo
- `{workspace}/trees/{name}` → symlink for workspace-local access
- `{workspace}/{name}/{default-branch}` → default-branch symlink

### list

List repos registered in a workspace.

```
grove ws repo list myproject
grove ws repo list myproject --porcelain
```

Porcelain output: `name\tpath\tstatus` (status is `ok` or `dangling`).

### remove

Remove a repo from a workspace. Fails if worktrees exist unless `--force` is passed.

```
grove ws repo remove myproject myapp
grove ws repo remove myproject myapp --force
```

The global `repos/{name}` symlink is preserved (other workspaces may still use it).

## Notes

- Reserved name: `trees` cannot be used as a repo name.
- Repo names may not contain `/`, `\`, or `..`.
- Multiple workspaces can register the same repo — they share the global `repos/` symlink.
