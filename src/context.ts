import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { type Context } from "./types";
import { readConfig } from "./lib/config";

function tryRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Walk up from cwd looking for workspace.json to infer workspace/repo/worktree context.
 */
export function inferContext(cwd: string, workspacesRoot: string): Context {
  // Resolve symlinks so paths are comparable (macOS /tmp -> /private/tmp)
  const realCwd = tryRealpath(cwd);
  const realRoot = tryRealpath(workspacesRoot);

  // Find workspace.json by walking up
  let dir = realCwd;
  let found: string | undefined;

  while (dir !== dirname(dir)) {
    const candidate = join(dir, "workspace.json");
    if (existsSync(candidate)) {
      found = dir;
      break;
    }
    dir = dirname(dir);
  }

  if (!found) return {};

  // found is the workspace directory
  const workspaceDir = found;
  const workspaceName = workspaceDir.split(sep).pop() ?? "";

  // Make sure it's actually inside the workspaces root
  const rel = relative(realRoot, workspaceDir);
  if (rel.startsWith("..") || rel === "") {
    return {};
  }

  const context: Context = {
    workspace: workspaceName,
    workspacePath: workspaceDir,
  };

  // Compute relative path from workspace to cwd
  const relToCwd = relative(workspaceDir, realCwd);
  if (!relToCwd) {
    // At workspace root
    return context;
  }

  const segments = relToCwd.split(sep).filter(Boolean);
  if (segments.length === 0) return context;

  const repoSegment = segments[0];

  // Validate repo segment against workspace.json
  const configResult = readConfig(join(workspaceDir, "workspace.json"));
  if (!configResult.ok) return context;

  const repoEntry = configResult.value.repos.find((r) => r.name === repoSegment);
  if (!repoEntry) return context;

  context.repo = repoSegment;

  if (segments.length >= 2) {
    context.worktree = segments[1];
  }

  return context;
}
