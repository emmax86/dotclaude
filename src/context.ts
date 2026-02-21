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
 *
 * Uses logical (unresolved) cwd first so pool worktrees accessed via symlinks are
 * correctly resolved back to their workspace. Falls back to the realpath cwd to
 * handle macOS /tmp → /private/tmp aliasing.
 */
export function inferContext(cwd: string, workspacesRoot: string): Context {
  const realRoot = tryRealpath(workspacesRoot);

  // Step 1: Walk logical cwd (existsSync follows symlinks, so this works for pool symlinks
  // as well as macOS /tmp aliases)
  let found: string | undefined;
  let effectiveCwd = cwd;

  let dir = cwd;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "workspace.json"))) {
      found = dir;
      break;
    }
    dir = dirname(dir);
  }

  // Step 2: Fall back to resolved cwd if logical walk failed (edge case: broken path components)
  if (!found) {
    const resolvedCwd = tryRealpath(cwd);
    if (resolvedCwd !== cwd) {
      effectiveCwd = resolvedCwd;
      let dir2 = resolvedCwd;
      while (dir2 !== dirname(dir2)) {
        if (existsSync(join(dir2, "workspace.json"))) {
          found = dir2;
          break;
        }
        dir2 = dirname(dir2);
      }
    }
  }

  if (!found) return {};

  const workspaceDir = found;
  const workspaceName = workspaceDir.split(sep).pop() ?? "";

  // Step 3-4: Resolve found dir for root-containment check
  const realFound = tryRealpath(found);
  const rel = relative(realRoot, realFound);
  if (rel.startsWith("..") || rel === "") {
    return {};
  }

  const context: Context = {
    workspace: workspaceName,
    workspacePath: workspaceDir,
  };

  // Step 5: Extract repo/worktree segments.
  // Both effectiveCwd and found are in the same domain (both logical or both resolved),
  // so relative() produces the correct answer.
  const relToCwd = relative(found, effectiveCwd);
  if (!relToCwd) {
    return context;
  }

  const segments = relToCwd.split(sep).filter(Boolean);
  if (segments.length === 0) return context;

  // Repos live under trees/ within the workspace directory
  const offset = segments[0] === "trees" ? 1 : 0;
  const repoSegment = segments[offset];
  if (!repoSegment) return context;

  // Validate repo segment against workspace.json
  const configResult = readConfig(join(workspaceDir, "workspace.json"));
  if (!configResult.ok) return context;

  const repoEntry = configResult.value.repos.find((r) => r.name === repoSegment);
  if (!repoEntry) return context;

  context.repo = repoSegment;

  if (segments.length >= offset + 2) {
    context.worktree = segments[offset + 1];
  }

  return context;
}
