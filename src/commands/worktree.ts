import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, relative } from "node:path";
import { type Paths } from "../constants";
import { type Result, ok, err, type WorktreeEntry } from "../types";
import { readConfig, addPoolReference } from "../lib/config";
import {
  addWorktree as gitAddWorktree,
  removeWorktree as gitRemoveWorktree,
  type AddWorktreeOptions,
  type GitEnv,
} from "../lib/git";
import { toSlug } from "../lib/slug";
import {
  classifyWorktreeEntry,
  resolveRepoPath,
  removePoolWorktreeReference,
} from "../lib/worktree-utils";

export type { AddWorktreeOptions };

export function addWorktree(
  workspace: string,
  repo: string,
  branch: string,
  options: AddWorktreeOptions,
  paths: Paths,
  env?: GitEnv,
): Result<WorktreeEntry> {
  // Validate repo is registered
  const configResult = readConfig(paths.workspaceConfig(workspace));
  if (!configResult.ok) {
    if (configResult.code === "CONFIG_NOT_FOUND") {
      return err(`Workspace "${workspace}" not found`, "WORKSPACE_NOT_FOUND");
    }
    return configResult;
  }

  const repoEntry = configResult.value.repos.find((r) => r.name === repo);
  if (!repoEntry) {
    return err(`Repo "${repo}" is not registered in workspace "${workspace}"`, "REPO_NOT_FOUND");
  }

  // Resolve real repo path through repos/
  const repoPathResult = resolveRepoPath(repo, paths);
  if (!repoPathResult.ok) return repoPathResult;
  const realRepoPath = repoPathResult.value;

  const slug = toSlug(branch);
  const wtPath = paths.worktreeDir(workspace, repo, slug);

  // Check for slug collision at workspace level
  if (classifyWorktreeEntry(wtPath, paths) !== null) {
    return err(
      `Target directory already exists: "${wtPath}". Branch slug "${slug}" collides with an existing entry.`,
      "SLUG_COLLISION",
    );
  }

  const poolEntryPath = paths.worktreePoolEntry(repo, slug);
  let poolEntryCreated = false;

  // Check if pool entry exists
  if (classifyWorktreeEntry(poolEntryPath, paths) !== null) {
    // Already exists — reuse (flags silently ignored)
    poolEntryCreated = false;
  } else {
    // Create pool entry via git worktree add
    mkdirSync(paths.worktreePoolRepo(repo), { recursive: true });
    const gitResult = gitAddWorktree(
      realRepoPath,
      poolEntryPath,
      branch,
      { newBranch: options.newBranch, from: options.from },
      env,
    );
    if (!gitResult.ok) return gitResult;
    poolEntryCreated = true;
  }

  // Create workspace symlink → worktrees/{repo}/{slug}
  try {
    symlinkSync(relative(dirname(wtPath), paths.worktreePoolEntry(repo, slug)), wtPath);
  } catch (e) {
    // Rollback pool entry if we created it
    if (poolEntryCreated) {
      try {
        gitRemoveWorktree(realRepoPath, poolEntryPath, true, env);
      } catch {
        /* best-effort */
      }
    }
    return err(`Failed to create workspace symlink: ${String(e)}`, "SYMLINK_CREATE_FAILED");
  }

  // Register workspace in pool metadata
  const refResult = addPoolReference(paths.worktreePoolConfig, repo, slug, workspace);
  if (!refResult.ok) {
    // Rollback: remove symlink and optionally pool entry
    try {
      rmSync(wtPath);
    } catch {
      /* best-effort */
    }
    if (poolEntryCreated) {
      try {
        gitRemoveWorktree(realRepoPath, poolEntryPath, true, env);
      } catch {
        /* best-effort */
      }
    }
    return refResult;
  }

  return ok({ repo, slug, branch, type: "worktree" });
}

export function listWorktrees(
  workspace: string,
  repo: string,
  paths: Paths,
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
    const kind = classifyWorktreeEntry(wtPath, paths);
    if (kind === "pool" || kind === "legacy") {
      worktrees.push({ repo, slug, branch: slug, type: "worktree" });
    } else if (kind === "linked") {
      worktrees.push({ repo, slug, branch: slug, type: "linked" });
    }
    // null: skip
  }

  return ok(worktrees);
}

export function removeWorktree(
  workspace: string,
  repo: string,
  slug: string,
  options: { force?: boolean },
  paths: Paths,
  env?: GitEnv,
): Result<void> {
  const wtPath = paths.worktreeDir(workspace, repo, slug);
  const kind = classifyWorktreeEntry(wtPath, paths);

  if (kind === null) {
    return err(`Worktree "${slug}" not found in repo "${repo}"`, "WORKTREE_NOT_FOUND");
  }

  if (kind === "pool") {
    const refResult = removePoolWorktreeReference(workspace, repo, slug, options, paths, env);
    if (!refResult.ok) return refResult;
    try {
      rmSync(wtPath);
    } catch {
      /* best-effort */
    }
    return ok(undefined);
  }

  if (kind === "legacy") {
    const repoPathResult = resolveRepoPath(repo, paths);
    if (!repoPathResult.ok) return repoPathResult;
    return gitRemoveWorktree(repoPathResult.value, wtPath, options.force, env);
  }

  // linked (default-branch or unreadable symlink)
  return err(
    `Cannot remove default branch symlink "${slug}". Remove the repo instead.`,
    "CANNOT_REMOVE_DEFAULT_BRANCH",
  );
}
