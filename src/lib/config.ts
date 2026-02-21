import { readFileSync, writeFileSync } from "node:fs";
import {
  type Result,
  ok,
  err,
  type WorkspaceConfig,
  type RepoEntry,
  type WorktreePool,
} from "../types";

export function readConfig(configPath: string): Result<WorkspaceConfig> {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return err("Config file not found: " + configPath, "CONFIG_NOT_FOUND");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err("Invalid JSON in config: " + configPath, "CONFIG_INVALID");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).name !== "string" ||
    !Array.isArray((parsed as Record<string, unknown>).repos)
  ) {
    return err("Invalid workspace.json schema", "CONFIG_INVALID");
  }

  return ok(parsed as WorkspaceConfig);
}

export function writeConfig(configPath: string, config: WorkspaceConfig): Result<void> {
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    return ok(undefined);
  } catch (e) {
    return err(String(e), "CONFIG_WRITE_FAILED");
  }
}

export function addRepoToConfig(configPath: string, repo: RepoEntry): Result<void> {
  const result = readConfig(configPath);
  if (!result.ok) return result;

  const config = result.value;
  const existing = config.repos.findIndex((r) => r.name === repo.name);
  if (existing >= 0) {
    config.repos[existing] = repo;
  } else {
    config.repos.push(repo);
  }
  return writeConfig(configPath, config);
}

export function removeRepoFromConfig(configPath: string, name: string): Result<void> {
  const result = readConfig(configPath);
  if (!result.ok) return result;

  const config = result.value;
  config.repos = config.repos.filter((r) => r.name !== name);
  return writeConfig(configPath, config);
}

export function readPoolConfig(path: string): Result<WorktreePool> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return ok({});
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err("Invalid JSON in pool config: " + path, "POOL_CONFIG_INVALID");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return err("Invalid pool config schema", "POOL_CONFIG_INVALID");
  }

  return ok(parsed as WorktreePool);
}

export function writePoolConfig(path: string, pool: WorktreePool): Result<void> {
  try {
    writeFileSync(path, JSON.stringify(pool, null, 2) + "\n");
    return ok(undefined);
  } catch (e) {
    return err(String(e), "POOL_CONFIG_WRITE_FAILED");
  }
}

export function addPoolReference(
  path: string,
  repo: string,
  slug: string,
  workspace: string,
): Result<void> {
  const result = readPoolConfig(path);
  if (!result.ok) return result;

  const pool = result.value;
  if (!pool[repo]) pool[repo] = {};
  if (!pool[repo][slug]) pool[repo][slug] = [];
  if (!pool[repo][slug].includes(workspace)) {
    pool[repo][slug].push(workspace);
  }
  return writePoolConfig(path, pool);
}

export function removePoolReference(
  path: string,
  repo: string,
  slug: string,
  workspace: string,
): Result<{ remaining: number }> {
  const result = readPoolConfig(path);
  if (!result.ok) return result;

  const pool = result.value;
  if (!pool[repo] || !pool[repo][slug]) {
    return ok({ remaining: 0 });
  }

  const list = pool[repo][slug];
  const idx = list.indexOf(workspace);
  if (idx === -1) {
    return ok({ remaining: list.length });
  }

  list.splice(idx, 1);
  const remaining = list.length;

  if (remaining === 0) {
    delete pool[repo][slug];
    if (Object.keys(pool[repo]).length === 0) {
      delete pool[repo];
    }
  }

  const writeResult = writePoolConfig(path, pool);
  if (!writeResult.ok) return writeResult;
  return ok({ remaining });
}

export function getPoolSlugsForWorkspace(
  path: string,
  repo: string,
  workspace: string,
): Result<string[]> {
  const result = readPoolConfig(path);
  if (!result.ok) return result;

  const pool = result.value;
  if (!pool[repo]) return ok([]);

  const slugs = Object.entries(pool[repo])
    .filter(([, workspaces]) => workspaces.includes(workspace))
    .map(([slug]) => slug);

  return ok(slugs);
}
