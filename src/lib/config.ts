import { readFileSync, writeFileSync } from "node:fs";
import { type Result, ok, err, type WorkspaceConfig, type RepoEntry } from "../types";

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

export function writeConfig(configPath: string, config: WorkspaceConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
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
  writeConfig(configPath, config);
  return ok(undefined);
}

export function removeRepoFromConfig(configPath: string, name: string): Result<void> {
  const result = readConfig(configPath);
  if (!result.ok) return result;

  const config = result.value;
  config.repos = config.repos.filter((r) => r.name !== name);
  writeConfig(configPath, config);
  return ok(undefined);
}
