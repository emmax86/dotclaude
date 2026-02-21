import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "./helpers";
import { createPaths } from "../constants";
import { addWorkspace } from "../commands/workspace";
import { addRepo } from "../commands/repo";
import { addWorktree } from "../commands/worktree";
import { inferContext } from "../context";

describe("context inference", () => {
  let tempDir: string;
  let repoPath: string;
  let paths: ReturnType<typeof createPaths>;
  let wsRoot: string;

  beforeAll(() => {
    tempDir = createTestDir();
    repoPath = createTestGitRepo(tempDir, "myrepo");
    wsRoot = join(tempDir, "workspaces");
    paths = createPaths(wsRoot);
    addWorkspace("myws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "myrepo", "feature/ctx", { newBranch: true }, paths, GIT_ENV);
  });

  afterAll(() => {
    cleanup(tempDir);
  });

  it("cwd at workspace root → workspace only", () => {
    const ctx = inferContext(paths.workspace("myws"), wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBeUndefined();
    expect(ctx.worktree).toBeUndefined();
  });

  it("cwd at {workspace}/{repo}/ → workspace + repo", () => {
    const ctx = inferContext(paths.repoDir("myws", "myrepo"), wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBeUndefined();
  });

  it("cwd deep in worktree → workspace + repo + worktree", () => {
    const deepPath = join(paths.worktreeDir("myws", "myrepo", "feature-ctx"), "src", "lib");
    const ctx = inferContext(deepPath, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBe("feature-ctx");
  });

  it("cwd outside workspaces root → returns nothing", () => {
    const ctx = inferContext(tempDir, wsRoot);
    expect(ctx.workspace).toBeUndefined();
  });

  it("cwd at workspaces root → returns nothing", () => {
    const ctx = inferContext(wsRoot, wsRoot);
    expect(ctx.workspace).toBeUndefined();
  });

  it("cwd inside {workspace}/trees/ → workspace only", () => {
    // trees/ dir is created by addRepo
    const treesDir = join(paths.workspace("myws"), "trees");
    const ctx = inferContext(treesDir, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBeUndefined();
  });

  it("cwd inside {workspace}/trees/{repo}/ → workspace only (logical path found)", () => {
    // trees/myrepo is a symlink. With logical-walk-first, we find {workspace}/workspace.json
    // before following any symlinks. The path segment "trees" is not a registered repo,
    // so only the workspace context is returned.
    const treesRepoDir = join(paths.workspace("myws"), "trees", "myrepo");
    const ctx = inferContext(treesRepoDir, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBeUndefined();
  });

  it("infers correctly when cwd contains unresolved symlink prefix (macOS /tmp regression)", () => {
    // Simulate macOS /tmp -> /private/tmp: a symlink alias that points to tempDir.
    // cwd passed in uses the alias path; wsRoot is the real path.
    // Before the fix, relative(workspaceDir, cwd) used the unresolved cwd and
    // produced a wrong relative path, causing repo/worktree to come back undefined.
    const alias = join(tempDir, "alias");
    symlinkSync(tempDir, alias);

    const cwdViaAlias = join(alias, "workspaces", "myws", "myrepo", "feature-ctx");
    const ctx = inferContext(cwdViaAlias, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBe("feature-ctx");
  });

  it("validates repo segment against workspace.json repos list", () => {
    // Create a directory that looks like a repo but isn't registered
    const fakeRepoDir = join(paths.workspace("myws"), "fakerepo");
    mkdirSync(fakeRepoDir, { recursive: true });

    const ctx = inferContext(fakeRepoDir, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBeUndefined(); // not registered
  });

  it("cwd via workspace symlink into pool worktree infers full context", () => {
    // The pool symlink is at {ws}/{repo}/{slug} → ../../worktrees/{repo}/{slug}
    // Logical walk from {ws}/{repo}/{slug}/src/lib finds workspace.json at {ws}/
    // and correctly extracts repo + worktree without resolving the symlink.
    const deepPath = join(paths.worktreeDir("myws", "myrepo", "feature-ctx"), "src", "lib");
    const ctx = inferContext(deepPath, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBe("feature-ctx");
  });

  it("cwd inside pool directory directly returns nothing (no workspace.json in pool)", () => {
    // Pool is at {root}/worktrees/, which has no workspace.json
    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-ctx");
    // Only test if pool entry exists (it does because addWorktree in beforeAll created it)
    if (existsSync(poolEntry)) {
      const ctx = inferContext(poolEntry, wsRoot);
      expect(ctx.workspace).toBeUndefined();
    }
  });
});
