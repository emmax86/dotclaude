import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { type Paths } from "../constants";
import { type Result, ok, err, type WorktreeEntry } from "../types";
import { readConfig, readPoolConfig, addPoolReference, removePoolReference } from "../lib/config";
import {
  addWorktree as gitAddWorktree,
  removeWorktree as gitRemoveWorktree,
  type GitEnv,
} from "../lib/git";
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
  const wtPath = paths.worktreeDir(workspace, repo, slug);

  // Check for slug collision at workspace level
  try {
    lstatSync(wtPath);
    return err(
      `Target directory already exists: "${wtPath}". Branch slug "${slug}" collides with an existing entry.`,
      "SLUG_COLLISION"
    );
  } catch { /* does not exist — proceed */ }

  const poolEntryPath = paths.worktreePoolEntry(repo, slug);
  let poolEntryCreated = false;

  // Step 3: Check if pool entry exists
  try {
    lstatSync(poolEntryPath);
    // Already exists — reuse (flags silently ignored)
    poolEntryCreated = false;
  } catch {
    // Create pool entry via git worktree add
    mkdirSync(paths.worktreePoolRepo(repo), { recursive: true });
    const gitResult = gitAddWorktree(
      realRepoPath,
      poolEntryPath,
      branch,
      { newBranch: options.newBranch, from: options.from },
      env
    );
    if (!gitResult.ok) return gitResult;
    poolEntryCreated = true;
  }

  // Step 4: Create workspace symlink → ../../worktrees/{repo}/{slug}
  try {
    symlinkSync(`../../worktrees/${repo}/${slug}`, wtPath);
  } catch (e) {
    // Rollback pool entry if we created it
    if (poolEntryCreated) {
      try {
        gitRemoveWorktree(realRepoPath, poolEntryPath, true, env);
      } catch { /* best-effort */ }
    }
    return err(`Failed to create workspace symlink: ${String(e)}`, "SYMLINK_CREATE_FAILED");
  }

  // Step 5: Register workspace in pool metadata
  const refResult = addPoolReference(paths.worktreePoolConfig, repo, slug, workspace);
  if (!refResult.ok) {
    // Rollback: remove symlink and optionally pool entry
    try { rmSync(wtPath); } catch { /* best-effort */ }
    if (poolEntryCreated) {
      try {
        gitRemoveWorktree(realRepoPath, poolEntryPath, true, env);
      } catch { /* best-effort */ }
    }
    return refResult;
  }

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
        let target: string;
        try {
          target = readlinkSync(wtPath);
        } catch {
          // Can't read link — treat as linked (safe fallback)
          worktrees.push({ repo, slug, branch: slug, type: "linked" });
          continue;
        }
        if (target.startsWith("../../worktrees/")) {
          worktrees.push({ repo, slug, branch: slug, type: "worktree" });
        } else {
          // Default-branch symlink (../trees/...) or unknown — treat as linked
          worktrees.push({ repo, slug, branch: slug, type: "linked" });
        }
      } else if (lstat.isDirectory()) {
        // Legacy real worktree directory
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

  // Use lstatSync so dangling symlinks are visible
  let lstat: ReturnType<typeof lstatSync>;
  try {
    lstat = lstatSync(wtPath);
  } catch {
    return err(`Worktree "${slug}" not found in repo "${repo}"`, "WORKTREE_NOT_FOUND");
  }

  if (lstat.isSymbolicLink()) {
    let target: string;
    try {
      target = readlinkSync(wtPath);
    } catch {
      // Can't read link — treat as default branch (safe fallback)
      return err(
        `Cannot remove default branch symlink "${slug}". Remove the repo instead.`,
        "CANNOT_REMOVE_DEFAULT_BRANCH"
      );
    }

    if (target.startsWith("../../worktrees/")) {
      // Pool symlink: call removePoolWorktreeReference first, then remove symlink
      const refResult = removePoolWorktreeReference(workspace, repo, slug, options, paths, env);
      if (!refResult.ok) return refResult;
      try { rmSync(wtPath); } catch { /* best-effort */ }
      return ok(undefined);
    }

    // Default-branch symlink (../trees/...) or unknown
    return err(
      `Cannot remove default branch symlink "${slug}". Remove the repo instead.`,
      "CANNOT_REMOVE_DEFAULT_BRANCH"
    );
  }

  // Legacy real worktree directory
  const treePath = paths.repoEntry(repo);
  let realRepoPath: string;
  try {
    realRepoPath = realpathSync(treePath);
  } catch {
    return err(`Repo "${repo}" has a dangling symlink`, "DANGLING_SYMLINK");
  }

  return gitRemoveWorktree(realRepoPath, wtPath, options.force, env);
}

/**
 * Remove a workspace's reference to a pool worktree entry.
 * If this is the last reference, also removes the git worktree from the pool.
 * Does NOT remove the workspace symlink — caller handles that.
 */
export function removePoolWorktreeReference(
  workspace: string,
  repo: string,
  slug: string,
  options: { force?: boolean },
  paths: Paths,
  env?: GitEnv
): Result<void> {
  const poolEntryPath = paths.worktreePoolEntry(repo, slug);
  const poolConfig = paths.worktreePoolConfig;

  // Read current count to decide if this is the last reference
  const poolResult = readPoolConfig(poolConfig);
  if (!poolResult.ok) return poolResult;

  const pool = poolResult.value;
  const currentList = pool[repo]?.[slug] ?? [];
  const remaining = currentList.filter((ws) => ws !== workspace).length;

  if (remaining === 0) {
    // Last reference — remove the actual git worktree first
    const treePath = paths.repoEntry(repo);
    let realRepoPath: string;
    try {
      realRepoPath = realpathSync(treePath);
    } catch {
      // Dangling repo symlink — just clean up pool entry directly
      try { rmSync(poolEntryPath, { recursive: true, force: true }); } catch { /* best-effort */ }
      const danglingRefResult = removePoolReference(poolConfig, repo, slug, workspace);
      if (!danglingRefResult.ok) return danglingRefResult;
      return ok(undefined);
    }

    const gitResult = gitRemoveWorktree(realRepoPath, poolEntryPath, options.force, env);
    if (!gitResult.ok) return gitResult;

    // Clean up empty worktrees/{repo}/ directory
    const poolRepoDir = paths.worktreePoolRepo(repo);
    try {
      const remaining2 = readdirSync(poolRepoDir);
      if (remaining2.length === 0) {
        rmSync(poolRepoDir, { recursive: true, force: true });
      }
    } catch { /* best-effort */ }
  }

  // Update metadata
  const finalRefResult = removePoolReference(poolConfig, repo, slug, workspace);
  if (!finalRefResult.ok) return finalRefResult;
  return ok(undefined);
}
