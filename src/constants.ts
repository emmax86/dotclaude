import { join } from "node:path";

export interface Paths {
  root: string;
  repos: string;
  workspace: (name: string) => string;
  workspaceConfig: (name: string) => string;
  workspaceDotClaude: (name: string) => string;
  repoEntry: (repoName: string) => string;
  repoDir: (workspace: string, repo: string) => string;
  worktreeDir: (workspace: string, repo: string, slug: string) => string;
}

export function createPaths(root: string): Paths {
  return {
    root,
    repos: join(root, "repos"),
    workspace: (name) => join(root, name),
    workspaceConfig: (name) => join(root, name, "workspace.json"),
    workspaceDotClaude: (name) => join(root, name, ".claude"),
    repoEntry: (repoName) => join(root, "repos", repoName),
    repoDir: (workspace, repo) => join(root, workspace, repo),
    worktreeDir: (workspace, repo, slug) => join(root, workspace, repo, slug),
  };
}

export const DEFAULT_WORKSPACES_ROOT = join(
  process.env.HOME ?? "/tmp",
  "dotclaude-workspaces"
);
