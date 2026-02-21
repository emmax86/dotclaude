import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { type Paths } from "../constants";
import { type Result, ok, err, type WorkspaceConfig } from "../types";
import { writeConfig, readConfig } from "../lib/config";
import { generateVSCodeWorkspace } from "../lib/vscode";
import { removeWorktree, type GitEnv } from "../lib/git";
import {
  classifyWorktreeEntry,
  resolveRepoPath,
  removePoolWorktreeReference,
} from "../lib/worktree-utils";

const RESERVED_NAMES = new Set(["repos", "worktrees"]);

function validateName(name: string): Result<void> {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return err(`Invalid workspace name: "${name}"`, "INVALID_NAME");
  }
  if (RESERVED_NAMES.has(name)) {
    return err(
      `"${name}" is a reserved name and cannot be used as a workspace name`,
      "RESERVED_NAME",
    );
  }
  return ok(undefined);
}

export interface WorkspaceInfo {
  name: string;
  path: string;
}

export function addWorkspace(name: string, paths: Paths): Result<WorkspaceInfo> {
  const validation = validateName(name);
  if (!validation.ok) return validation;

  const wsPath = paths.workspace(name);
  if (existsSync(wsPath)) {
    return err(`Workspace "${name}" already exists`, "WORKSPACE_EXISTS");
  }

  mkdirSync(wsPath, { recursive: true });
  mkdirSync(paths.workspaceDotClaude(name), { recursive: true });

  const config: WorkspaceConfig = { name, repos: [] };
  const writeResult = writeConfig(paths.workspaceConfig(name), config);
  if (!writeResult.ok) return writeResult;

  const vscodeResult = generateVSCodeWorkspace(name, paths);
  if (!vscodeResult.ok) return vscodeResult;

  return ok({ name, path: wsPath });
}

export function listWorkspaces(paths: Paths): Result<WorkspaceInfo[]> {
  if (!existsSync(paths.root)) {
    return ok([]);
  }

  const entries = readdirSync(paths.root);
  const workspaces: WorkspaceInfo[] = [];

  for (const entry of entries) {
    if (RESERVED_NAMES.has(entry)) continue;
    const wsPath = paths.workspace(entry);
    try {
      const stat = statSync(wsPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    const configPath = paths.workspaceConfig(entry);
    if (!existsSync(configPath)) continue;
    workspaces.push({ name: entry, path: wsPath });
  }

  return ok(workspaces);
}

export function removeWorkspace(
  name: string,
  options: { force?: boolean },
  paths: Paths,
  env?: GitEnv,
): Result<void> {
  const wsPath = paths.workspace(name);
  if (!existsSync(wsPath)) {
    return err(`Workspace "${name}" not found`, "WORKSPACE_NOT_FOUND");
  }

  const configPath = paths.workspaceConfig(name);
  const configResult = readConfig(configPath);
  if (!configResult.ok) {
    return configResult;
  }

  const config = configResult.value;

  if (!options.force && config.repos.length > 0) {
    return err(
      `Workspace "${name}" has repos. Use --force to remove anyway.`,
      "WORKSPACE_HAS_REPOS",
    );
  }

  if (options.force && config.repos.length > 0) {
    const errors: string[] = [];

    for (const repo of config.repos) {
      const repoDir = paths.repoDir(name, repo.name);
      if (!existsSync(repoDir)) continue;

      let entries: string[];
      try {
        entries = readdirSync(repoDir);
      } catch {
        continue;
      }

      for (const slug of entries) {
        const wtPath = paths.worktreeDir(name, repo.name, slug);
        const kind = classifyWorktreeEntry(wtPath, paths);
        if (kind === "pool") {
          const removeResult = removePoolWorktreeReference(
            name,
            repo.name,
            slug,
            { force: true },
            paths,
            env,
          );
          if (!removeResult.ok) {
            errors.push(`${repo.name}/${slug}: ${removeResult.error}`);
          }
        } else if (kind === "legacy") {
          const repoPathResult = resolveRepoPath(repo.name, paths);
          if (!repoPathResult.ok) continue; // dangling — skip
          const removeResult = removeWorktree(repoPathResult.value, wtPath, true, env);
          if (!removeResult.ok) {
            errors.push(`${repo.name}/${slug}: ${removeResult.error}`);
          }
        }
        // null or linked: skip
      }
    }

    if (errors.length > 0) {
      return err(
        `Failed to remove some worktrees:\n${errors.join("\n")}`,
        "WORKTREE_REMOVE_FAILED",
      );
    }
  }

  rmSync(wsPath, { recursive: true, force: true });
  return ok(undefined);
}
