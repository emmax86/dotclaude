import { type Paths } from "../constants";
import { type Result, ok, err, type WorktreeEntry } from "../types";
import { readConfig } from "../lib/config";
import { listRepos, type RepoInfo } from "./repo";
import { listWorktrees } from "./worktree";

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
    if (configResult.code === "CONFIG_NOT_FOUND") {
      return err(`Workspace "${workspace}" not found`, "WORKSPACE_NOT_FOUND");
    }
    return configResult;
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
