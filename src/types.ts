export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(error: string, code: string): Result<T> {
  return { ok: false, error, code };
}

export interface RepoEntry {
  name: string;
  path: string;
}

export interface WorkspaceConfig {
  name: string;
  repos: RepoEntry[];
}

export interface WorktreeEntry {
  repo: string;
  slug: string;
  branch: string;
  type: "linked" | "worktree";
}

export interface Context {
  workspace?: string;
  workspacePath?: string;
  repo?: string;
  worktree?: string;
}

export type WorktreePool = Record<string, Record<string, string[]>>;
