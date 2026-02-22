import { lstat, readdir, realpath, readlink, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { type Paths } from "../constants";
import { type Result, ok, err } from "../types";
import { readPoolConfig, removePoolReference } from "./config";
import { removeWorktree as gitRemoveWorktree, type GitEnv } from "./git";

/**
 * Classify a worktree entry path.
 * - "pool"   — symlink into the shared worktree pool
 * - "linked" — default-branch symlink, unreadable symlink, or other non-pool symlink
 * - "legacy" — real directory (old-style git worktree at workspace path)
 * - null     — entry doesn't exist or is not a symlink/directory (caller should skip)
 */
export async function classifyWorktreeEntry(
  wtPath: string,
  paths: Paths,
): Promise<"pool" | "linked" | "legacy" | null> {
  let lstatResult: Awaited<ReturnType<typeof lstat>>;
  try {
    lstatResult = await lstat(wtPath);
  } catch {
    return null;
  }

  if (lstatResult.isSymbolicLink()) {
    let target: string;
    try {
      target = await readlink(wtPath);
    } catch {
      return "linked"; // unreadable symlink — treat as linked (safe fallback)
    }
    const absoluteTarget = resolve(dirname(wtPath), target);
    const relToPool = relative(paths.worktreePool, absoluteTarget);
    return relToPool.startsWith("..") ? "linked" : "pool";
  }

  if (lstatResult.isDirectory()) return "legacy";

  return null;
}

/**
 * Resolve the real filesystem path of a repo through the repos/ symlink.
 */
export async function resolveRepoPath(repoName: string, paths: Paths): Promise<Result<string>> {
  const treePath = paths.repoEntry(repoName);
  try {
    return ok(await realpath(treePath));
  } catch {
    return err(`Repo "${repoName}" has a dangling symlink`, "DANGLING_SYMLINK");
  }
}

/**
 * Remove a workspace's reference to a pool worktree entry.
 * If this is the last reference, also removes the git worktree from the pool.
 * Does NOT remove the workspace symlink — caller handles that.
 */
export async function removePoolWorktreeReference(
  workspace: string,
  repo: string,
  slug: string,
  options: { force?: boolean },
  paths: Paths,
  env?: GitEnv,
): Promise<Result<void>> {
  const poolEntryPath = paths.worktreePoolEntry(repo, slug);
  const poolConfig = paths.worktreePoolConfig;

  const poolResult = await readPoolConfig(poolConfig);
  if (!poolResult.ok) return poolResult;

  const pool = poolResult.value;
  const currentList = pool[repo]?.[slug] ?? [];
  const remaining = currentList.filter((ws) => ws !== workspace).length;

  if (remaining === 0) {
    const repoPathResult = await resolveRepoPath(repo, paths);
    if (!repoPathResult.ok) {
      // Dangling repo symlink — clean up pool entry directly
      try {
        await rm(poolEntryPath, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
      const danglingRefResult = await removePoolReference(poolConfig, repo, slug, workspace);
      if (!danglingRefResult.ok) return danglingRefResult;
      return ok(undefined);
    }

    const gitResult = await gitRemoveWorktree(
      repoPathResult.value,
      poolEntryPath,
      options.force,
      env,
    );
    if (!gitResult.ok) return gitResult;

    // Clean up empty worktrees/{repo}/ directory
    const poolRepoDir = paths.worktreePoolRepo(repo);
    try {
      const entries = await readdir(poolRepoDir);
      if (entries.length === 0) {
        await rm(poolRepoDir, { recursive: true, force: true });
      }
    } catch {
      /* best-effort */
    }
  }

  const finalRefResult = await removePoolReference(poolConfig, repo, slug, workspace);
  if (!finalRefResult.ok) return finalRefResult;
  return ok(undefined);
}
