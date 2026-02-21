import { type Paths } from "../constants";
import { type Result, ok, err } from "../types";
import { readConfig } from "../lib/config";
import { listRepos, type RepoInfo } from "./repo";
import { listWorktrees } from "./worktree";
import { type WorktreeEntry } from "../types";

export interface RepoStatus extends RepoInfo {
  worktrees: WorktreeEntry[];
}

export interface WorkspaceStatus {
  name: string;
  path: string;
  repos: RepoStatus[];
}

export function getStatus(workspace: string, paths: Paths): Result<WorkspaceStatus> {
  const wsPath = paths.workspace(workspace);
  const configResult = readConfig(paths.workspaceConfig(workspace));
  if (!configResult.ok) {
    return err(`Workspace "${workspace}" not found`, "WORKSPACE_NOT_FOUND");
  }

  const reposResult = listRepos(workspace, paths);
  if (!reposResult.ok) return reposResult;

  const repoStatuses: RepoStatus[] = [];

  for (const repo of reposResult.value) {
    const wtResult = listWorktrees(workspace, repo.name, paths);
    const worktrees = wtResult.ok ? wtResult.value : [];
    repoStatuses.push({ ...repo, worktrees });
  }

  return ok({
    name: workspace,
    path: wsPath,
    repos: repoStatuses,
  });
}
