import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { basename, resolve } from "node:path";
import { type Paths } from "../constants";
import { type Result, ok, err, type RepoEntry } from "../types";
import { readConfig, addRepoToConfig, removeRepoFromConfig } from "../lib/config";
import { generateVSCodeWorkspace } from "../lib/vscode";
import { isGitRepo, getDefaultBranch, removeWorktree, type GitEnv } from "../lib/git";
import {
  classifyWorktreeEntry,
  resolveRepoPath,
  removePoolWorktreeReference,
} from "../lib/worktree-utils";
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

  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return err(`Invalid repo name: "${name}"`, "INVALID_NAME");
  }
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

  // Create {workspace}/trees/{repo-name}/ directory
  const repoDirPath = paths.repoDir(workspace, name);
  let repoDirCreated = false;

  function cleanup() {
    if (repoDirCreated && existsSync(repoDirPath)) {
      rmSync(repoDirPath, { recursive: true, force: true });
    }
  }

  if (!existsSync(repoDirPath)) {
    mkdirSync(repoDirPath, { recursive: true });
    repoDirCreated = true;
  }

  // Detect default branch and create symlink
  const branchResult = getDefaultBranch(absPath, env);
  if (!branchResult.ok) {
    cleanup();
    return branchResult; // preserves GIT_DEFAULT_BRANCH_ERROR
  }

  const slug = toSlug(branchResult.value);
  const defaultBranchSlugPath = paths.worktreeDir(workspace, name, slug);
  if (!existsSync(defaultBranchSlugPath)) {
    // Symlink: {workspace}/trees/{repo}/{slug} -> ../../../repos/{repo}
    symlinkSync(`../../../repos/${name}`, defaultBranchSlugPath);
  }

  // Add to workspace.json
  const configResult = addRepoToConfig(paths.workspaceConfig(workspace), {
    name,
    path: absPath,
  });
  if (!configResult.ok) {
    cleanup();
    return configResult; // preserves CONFIG_NOT_FOUND etc.
  }

  const vscodeResult = generateVSCodeWorkspace(workspace, paths);
  if (!vscodeResult.ok) return vscodeResult;

  return ok({ name, path: absPath, status: "ok" });
}

export function listRepos(workspace: string, paths: Paths): Result<RepoInfo[]> {
  const configResult = readConfig(paths.workspaceConfig(workspace));
  if (!configResult.ok) {
    if (configResult.code === "CONFIG_NOT_FOUND") {
      return err(`Workspace "${workspace}" not found`, "WORKSPACE_NOT_FOUND");
    }
    return configResult;
  }

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
      const kind = classifyWorktreeEntry(wtPath);
      if (kind === "pool") {
        poolSlugs.push(slug);
      } else if (kind === "legacy") {
        legacySlugs.push(slug);
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
      const repoPathResult = resolveRepoPath(name, paths);
      const realRepoPath = repoPathResult.ok ? repoPathResult.value : "";

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

  // Remove from workspace.json (global repo entry stays)
  const removeResult = removeRepoFromConfig(paths.workspaceConfig(workspace), name);
  if (!removeResult.ok) return removeResult;

  const vscodeResult = generateVSCodeWorkspace(workspace, paths);
  if (!vscodeResult.ok) return vscodeResult;

  return ok(undefined);
}
