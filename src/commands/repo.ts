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
import { basename, resolve } from "node:path";
import { type Paths } from "../constants";
import { type Result, ok, err } from "../types";
import { type RepoEntry } from "../types";
import { readConfig, addRepoToConfig, removeRepoFromConfig } from "../lib/config";
import { generateVSCodeWorkspace } from "../lib/vscode";
import { isGitRepo, getDefaultBranch, removeWorktree, type GitEnv } from "../lib/git";
import { removePoolWorktreeReference } from "./worktree";
import { toSlug } from "../lib/slug";

export interface RepoInfo extends RepoEntry {
  status: "ok" | "dangling";
}

export function addRepo(
  workspace: string,
  repoPath: string,
  nameOverride: string | undefined,
  paths: Paths,
  env?: GitEnv,
): Result<RepoInfo> {
  const absPath = resolve(repoPath);

  if (!isGitRepo(absPath)) {
    return err(`"${absPath}" is not a git repository`, "NOT_A_GIT_REPO");
  }

  const name = nameOverride ?? basename(absPath);

  if (name === "trees") {
    return err(`"trees" is a reserved name and cannot be used as a repo name`, "RESERVED_NAME");
  }

  // Check if repos/{name} exists pointing to a different path
  const treePath = paths.repoEntry(name);
  if (existsSync(treePath)) {
    let existingTarget: string;
    try {
      existingTarget = realpathSync(treePath);
    } catch {
      // dangling symlink — treat as pointing to different path
      existingTarget = "";
    }
    const realAbsPath = (() => {
      try {
        return realpathSync(absPath);
      } catch {
        return absPath;
      }
    })();
    if (existingTarget !== realAbsPath) {
      return err(
        `repos/${name} already points to a different path. Use --name to pick a different name.`,
        "TREE_NAME_CONFLICT",
      );
    }
    // Same path — reuse existing tree symlink
  } else {
    // Create repos/ lazily
    mkdirSync(paths.repos, { recursive: true });
    symlinkSync(absPath, treePath);
  }

  // Create {workspace}/{repo-name}/ directory
  const repoDirPath = paths.repoDir(workspace, name);
  let repoDirCreated = false;
  let wsTreeCreated = false;
  let defaultBranchSlugPath: string | undefined;

  try {
    if (!existsSync(repoDirPath)) {
      mkdirSync(repoDirPath, { recursive: true });
      repoDirCreated = true;
    }

    // Create {workspace}/trees/ and workspace-local {workspace}/trees/{name} -> ../../repos/{name}
    mkdirSync(paths.workspaceTrees(workspace), { recursive: true });
    const wsTreeEntry = paths.workspaceTreeEntry(workspace, name);
    if (!existsSync(wsTreeEntry)) {
      symlinkSync(`../../repos/${name}`, wsTreeEntry);
      wsTreeCreated = true;
    }

    // Detect default branch and create symlink
    const branchResult = getDefaultBranch(absPath, env);
    if (!branchResult.ok) {
      throw new Error(branchResult.error);
    }

    const slug = toSlug(branchResult.value);
    defaultBranchSlugPath = paths.worktreeDir(workspace, name, slug);

    if (!existsSync(defaultBranchSlugPath)) {
      // Symlink: {workspace}/{repo}/{slug} -> ../trees/{repo}
      symlinkSync(`../trees/${name}`, defaultBranchSlugPath);
    }

    // Add to workspace.json
    const configResult = addRepoToConfig(paths.workspaceConfig(workspace), {
      name,
      path: absPath,
    });
    if (!configResult.ok) {
      throw new Error(configResult.error);
    }
  } catch (e) {
    // Clean up repo dir if we created it (don't touch global tree)
    if (repoDirCreated && existsSync(repoDirPath)) {
      rmSync(repoDirPath, { recursive: true, force: true });
    }
    if (wsTreeCreated) {
      const wsTreeEntry = paths.workspaceTreeEntry(workspace, name);
      try {
        lstatSync(wsTreeEntry);
        rmSync(wsTreeEntry);
      } catch {
        /* already gone */
      }
    }
    return err(String(e), "REPO_ADD_ERROR");
  }

  generateVSCodeWorkspace(workspace, paths);

  return ok({ name, path: absPath, status: "ok" });
}

export function listRepos(workspace: string, paths: Paths): Result<RepoInfo[]> {
  const configResult = readConfig(paths.workspaceConfig(workspace));
  if (!configResult.ok) return configResult;

  return ok(
    configResult.value.repos.map((repo) => {
      const treePath = paths.repoEntry(repo.name);
      let status: RepoInfo["status"] = "ok";
      try {
        realpathSync(treePath);
      } catch {
        status = "dangling";
      }
      return { ...repo, status };
    }),
  );
}

export function removeRepo(
  workspace: string,
  name: string,
  options: { force?: boolean },
  paths: Paths,
  env?: GitEnv,
): Result<void> {
  const repoDir = paths.repoDir(workspace, name);
  if (existsSync(repoDir)) {
    // Three-way classification of entries:
    // 1. Default-branch symlink (../trees/) — skip, cleaned by rmSync(repoDir)
    // 2. Pool symlink (../../worktrees/) — count as worktree
    // 3. Legacy real directory — count as worktree
    const entries = readdirSync(repoDir);
    const poolSlugs: string[] = [];
    const legacySlugs: string[] = [];

    for (const slug of entries) {
      const wtPath = paths.worktreeDir(workspace, name, slug);
      try {
        const lstat = lstatSync(wtPath);
        if (lstat.isSymbolicLink()) {
          let target: string;
          try {
            target = readlinkSync(wtPath);
          } catch {
            continue;
          }
          if (target.startsWith("../../worktrees/")) {
            poolSlugs.push(slug);
          }
          // ../trees/ links: skip (default branch)
        } else if (lstat.isDirectory()) {
          legacySlugs.push(slug);
        }
      } catch {
        // skip
      }
    }

    const totalWorktrees = poolSlugs.length + legacySlugs.length;

    if (totalWorktrees > 0 && !options.force) {
      const all = [...poolSlugs, ...legacySlugs];
      return err(
        `Repo "${name}" has worktrees: ${all.join(", ")}. Use --force to remove.`,
        "REPO_HAS_WORKTREES",
      );
    }

    if (options.force && totalWorktrees > 0) {
      const treePath = paths.repoEntry(name);
      let realRepoPath: string;
      try {
        realRepoPath = realpathSync(treePath);
      } catch {
        realRepoPath = "";
      }

      for (const slug of poolSlugs) {
        const removeResult = removePoolWorktreeReference(
          workspace,
          name,
          slug,
          { force: true },
          paths,
          env,
        );
        if (!removeResult.ok) {
          return err(
            `Failed to remove pool worktree ${slug}: ${removeResult.error}`,
            "WORKTREE_REMOVE_FAILED",
          );
        }
      }

      for (const slug of legacySlugs) {
        const wtPath = paths.worktreeDir(workspace, name, slug);
        if (realRepoPath) {
          const removeResult = removeWorktree(realRepoPath, wtPath, true, env);
          if (!removeResult.ok) {
            return err(
              `Failed to remove worktree ${slug}: ${removeResult.error}`,
              "WORKTREE_REMOVE_FAILED",
            );
          }
        }
      }
    }

    rmSync(repoDir, { recursive: true, force: true });
  }

  // Remove workspace-local tree entry
  const wsTreeEntry = paths.workspaceTreeEntry(workspace, name);
  try {
    lstatSync(wsTreeEntry);
    rmSync(wsTreeEntry);
  } catch {
    /* not present, skip */
  }

  // Remove from workspace.json (global repo entry stays)
  const removeResult = removeRepoFromConfig(paths.workspaceConfig(workspace), name);
  if (!removeResult.ok) return removeResult;

  generateVSCodeWorkspace(workspace, paths);

  return ok(undefined);
}
