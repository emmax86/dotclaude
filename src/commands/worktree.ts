import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { type Paths } from "../constants";
import { type Result, ok, err, type WorktreeEntry } from "../types";
import { readConfig } from "../lib/config";
import { addWorktree as gitAddWorktree, removeWorktree as gitRemoveWorktree, type GitEnv } from "../lib/git";
import { toSlug } from "../lib/slug";

export interface AddWorktreeOptions {
  newBranch?: boolean;
  from?: string;
}

export function addWorktree(
  workspace: string,
  repo: string,
  branch: string,
  options: AddWorktreeOptions,
  paths: Paths,
  env?: GitEnv
): Result<WorktreeEntry> {
  // Validate repo is registered
  const configResult = readConfig(paths.workspaceConfig(workspace));
  if (!configResult.ok) return configResult;

  const repoEntry = configResult.value.repos.find((r) => r.name === repo);
  if (!repoEntry) {
    return err(`Repo "${repo}" is not registered in workspace "${workspace}"`, "REPO_NOT_FOUND");
  }

  // Resolve real repo path through repos/
  const treePath = paths.repoEntry(repo);
  let realRepoPath: string;
  try {
    realRepoPath = realpathSync(treePath);
  } catch {
    return err(`Repo "${repo}" has a dangling symlink`, "DANGLING_SYMLINK");
  }

  const slug = toSlug(branch);
  const worktreePath = paths.worktreeDir(workspace, repo, slug);

  // Check for slug collision
  if (existsSync(worktreePath)) {
    return err(
      `Target directory already exists: "${worktreePath}". Branch slug "${slug}" collides with an existing entry.`,
      "SLUG_COLLISION"
    );
  }

  const result = gitAddWorktree(
    realRepoPath,
    worktreePath,
    branch,
    { newBranch: options.newBranch, from: options.from },
    env
  );

  if (!result.ok) return result;

  return ok({ repo, slug, branch, type: "worktree" });
}

export function listWorktrees(
  workspace: string,
  repo: string,
  paths: Paths
): Result<WorktreeEntry[]> {
  const repoDir = paths.repoDir(workspace, repo);
  if (!existsSync(repoDir)) {
    return ok([]);
  }

  let entries: string[];
  try {
    entries = readdirSync(repoDir);
  } catch {
    return ok([]);
  }

  const worktrees: WorktreeEntry[] = [];

  for (const slug of entries) {
    const wtPath = paths.worktreeDir(workspace, repo, slug);
    try {
      const lstat = lstatSync(wtPath);
      if (lstat.isSymbolicLink()) {
        worktrees.push({ repo, slug, branch: slug, type: "linked" });
      } else if (lstat.isDirectory()) {
        worktrees.push({ repo, slug, branch: slug, type: "worktree" });
      }
    } catch {
      // skip
    }
  }

  return ok(worktrees);
}

export function removeWorktree(
  workspace: string,
  repo: string,
  slug: string,
  options: { force?: boolean },
  paths: Paths,
  env?: GitEnv
): Result<void> {
  const wtPath = paths.worktreeDir(workspace, repo, slug);

  if (!existsSync(wtPath)) {
    return err(`Worktree "${slug}" not found in repo "${repo}"`, "WORKTREE_NOT_FOUND");
  }

  // Refuse to remove default branch (symlink)
  const lstat = lstatSync(wtPath);
  if (lstat.isSymbolicLink()) {
    return err(
      `Cannot remove default branch symlink "${slug}". Remove the repo instead.`,
      "CANNOT_REMOVE_DEFAULT_BRANCH"
    );
  }

  const treePath = paths.repoEntry(repo);
  let realRepoPath: string;
  try {
    realRepoPath = realpathSync(treePath);
  } catch {
    return err(`Repo "${repo}" has a dangling symlink`, "DANGLING_SYMLINK");
  }

  return gitRemoveWorktree(realRepoPath, wtPath, options.force, env);
}
