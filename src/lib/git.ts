import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Result, ok, err } from "../types";

export interface GitEnv {
  GIT_CONFIG_NOSYSTEM?: string;
  GIT_AUTHOR_NAME?: string;
  GIT_AUTHOR_EMAIL?: string;
  GIT_COMMITTER_NAME?: string;
  GIT_COMMITTER_EMAIL?: string;
  HOME?: string;
  [key: string]: string | undefined;
}

function spawnGit(
  args: string[],
  cwd: string,
  env?: GitEnv
): { success: boolean; stdout: string; stderr: string } {
  const mergedEnv = env ? { ...process.env, ...env } : process.env;
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    env: mergedEnv as Record<string, string>,
  });
  return {
    success: result.success,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  };
}

export function isGitRepo(path: string): boolean {
  if (!existsSync(path)) return false;
  const result = spawnGit(["rev-parse", "--git-dir"], path);
  return result.success;
}

export function getDefaultBranch(repoPath: string, env?: GitEnv): Result<string> {
  const result = spawnGit(["symbolic-ref", "--short", "HEAD"], repoPath, env);
  if (!result.success || !result.stdout) {
    return err("Could not determine default branch", "GIT_DEFAULT_BRANCH_ERROR");
  }
  return ok(result.stdout);
}

export interface AddWorktreeOptions {
  newBranch?: boolean;
  from?: string;
}

export function addWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  options: AddWorktreeOptions = {},
  env?: GitEnv
): Result<void> {
  let args: string[];

  if (options.newBranch) {
    args = ["worktree", "add", "-b", branch, worktreePath];
    if (options.from) {
      args.push(options.from);
    }
  } else {
    args = ["worktree", "add", worktreePath, branch];
  }

  const result = spawnGit(args, repoPath, env);
  if (!result.success) {
    return err(result.stderr || "git worktree add failed", "GIT_WORKTREE_ADD_ERROR");
  }
  return ok(undefined);
}

export function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force = false,
  env?: GitEnv
): Result<void> {
  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push(worktreePath);

  const result = spawnGit(args, repoPath, env);
  if (!result.success) {
    // If worktree dir already gone, git still succeeds usually, but handle edge cases
    if (
      result.stderr.includes("is not a working tree") ||
      result.stderr.includes("does not exist")
    ) {
      return ok(undefined);
    }
    return err(result.stderr || "git worktree remove failed", "GIT_WORKTREE_REMOVE_ERROR");
  }
  return ok(undefined);
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isDetached: boolean;
}

export function listWorktrees(repoPath: string, env?: GitEnv): Result<WorktreeInfo[]> {
  const result = spawnGit(["worktree", "list", "--porcelain"], repoPath, env);
  if (!result.success) {
    return err(result.stderr || "git worktree list failed", "GIT_WORKTREE_LIST_ERROR");
  }

  const worktrees: WorktreeInfo[] = [];
  const blocks = result.stdout.split("\n\n");

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    const pathLine = lines.find((l) => l.startsWith("worktree "));
    const branchLine = lines.find((l) => l.startsWith("branch "));
    const detachedLine = lines.find((l) => l === "detached");

    if (!pathLine) continue;
    const path = pathLine.slice("worktree ".length);
    const branch = branchLine ? branchLine.slice("branch refs/heads/".length) : "";
    const isDetached = !!detachedLine;

    worktrees.push({ path, branch, isDetached });
  }

  return ok(worktrees);
}

export function findMainWorktreePath(repoPath: string, env?: GitEnv): Result<string> {
  const result = listWorktrees(repoPath, env);
  if (!result.ok) return result;
  // The first worktree in the list is always the main one
  if (result.value.length === 0) {
    return err("No worktrees found", "GIT_WORKTREE_LIST_ERROR");
  }
  return ok(result.value[0].path);
}
