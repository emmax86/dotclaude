import { join } from "node:path";

export interface Paths {
  root: string;
  repos: string;
  workspace: (name: string) => string;
  workspaceConfig: (name: string) => string;
  workspaceDotClaude: (name: string) => string;
  workspaceTrees: (ws: string) => string;
  workspaceTreeEntry: (ws: string, repo: string) => string;
  repoEntry: (repoName: string) => string;
  repoDir: (workspace: string, repo: string) => string;
  worktreeDir: (workspace: string, repo: string, slug: string) => string;
  worktreePool: string;
  worktreePoolRepo: (repo: string) => string;
  worktreePoolEntry: (repo: string, slug: string) => string;
  worktreePoolConfig: string;
}

export function createPaths(root: string): Paths {
  return {
    root,
    repos: join(root, "repos"),
    workspace: (name) => join(root, name),
    workspaceConfig: (name) => join(root, name, "workspace.json"),
    workspaceDotClaude: (name) => join(root, name, ".claude"),
    workspaceTrees: (ws) => join(root, ws, "trees"),
    workspaceTreeEntry: (ws, repo) => join(root, ws, "trees", repo),
    repoEntry: (repoName) => join(root, "repos", repoName),
    repoDir: (workspace, repo) => join(root, workspace, repo),
    worktreeDir: (workspace, repo, slug) => join(root, workspace, repo, slug),
    worktreePool: join(root, "worktrees"),
    worktreePoolRepo: (repo) => join(root, "worktrees", repo),
    worktreePoolEntry: (repo, slug) => join(root, "worktrees", repo, slug),
    worktreePoolConfig: join(root, "worktrees.json"),
  };
}

export const DEFAULT_WORKSPACES_ROOT = join(
  process.env.HOME ?? "/tmp",
  "dotclaude-workspaces"
);
