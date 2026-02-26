# workspace-status

Show a status overview for the current (or named) workspace, listing all repos and their worktrees.

## Usage

```
grove ws status [workspace]
```

The workspace is inferred from `$PWD` when not specified.

## Output

JSON output includes:

- `name` — workspace name
- `path` — filesystem path to the workspace
- `repos` — list of repos, each with:
  - `name` — repo name
  - `path` — original repo path
  - `status` — `"ok"` or `"dangling"` (symlink broken)
  - `worktrees` — list of worktrees with `repo`, `slug`, `branch`, `type` (`"linked"` or `"worktree"`)

## Example

```
grove ws status myproject
```

Returns JSON like:

```json
{
  "ok": true,
  "data": {
    "name": "myproject",
    "path": "/path/to/workspaces/myproject",
    "repos": [
      {
        "name": "myapp",
        "path": "/path/to/myapp",
        "status": "ok",
        "worktrees": [
          { "repo": "myapp", "slug": "main", "branch": "main", "type": "linked" },
          { "repo": "myapp", "slug": "feature-auth", "branch": "feature-auth", "type": "worktree" }
        ]
      }
    ]
  }
}
```
