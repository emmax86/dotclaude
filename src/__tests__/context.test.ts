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

  beforeAll(async () => {
    tempDir = createTestDir();
    repoPath = await createTestGitRepo(tempDir, "myrepo");
    wsRoot = join(tempDir, "workspaces");
    paths = createPaths(wsRoot);
    await addWorkspace("myws", paths);
    await addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    await addWorktree("myws", "myrepo", "feature/ctx", { newBranch: true }, paths, GIT_ENV);
  });

  afterAll(() => {
    cleanup(tempDir);
  });

  it("cwd at workspace root → workspace only", async () => {
    const ctx = await inferContext(paths.workspace("myws"), wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBeUndefined();
    expect(ctx.worktree).toBeUndefined();
  });

  it("cwd at {workspace}/{repo}/ → workspace + repo", async () => {
    const ctx = await inferContext(paths.repoDir("myws", "myrepo"), wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBeUndefined();
  });

  it("cwd deep in worktree → workspace + repo + worktree", async () => {
    const deepPath = join(paths.worktreeDir("myws", "myrepo", "feature-ctx"), "src", "lib");
    const ctx = await inferContext(deepPath, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBe("feature-ctx");
  });

  it("cwd outside workspaces root → returns nothing", async () => {
    const ctx = await inferContext(tempDir, wsRoot);
    expect(ctx.workspace).toBeUndefined();
  });

  it("cwd at workspaces root → returns nothing", async () => {
    const ctx = await inferContext(wsRoot, wsRoot);
    expect(ctx.workspace).toBeUndefined();
  });

  it("cwd inside {workspace}/trees/ → workspace only", async () => {
    // trees/ dir is created by addRepo
    const treesDir = join(paths.workspace("myws"), "trees");
    const ctx = await inferContext(treesDir, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBeUndefined();
  });

  it("cwd inside {workspace}/trees/{repo}/ → workspace + repo", async () => {
    // trees/{repo}/ is the repo directory. context inference skips the "trees" segment
    // and correctly identifies the repo.
    const treesRepoDir = join(paths.workspace("myws"), "trees", "myrepo");
    const ctx = await inferContext(treesRepoDir, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBeUndefined();
  });

  it("infers correctly when cwd contains unresolved symlink prefix (macOS /tmp regression)", async () => {
    // Simulate macOS /tmp -> /private/tmp: a symlink alias that points to tempDir.
    // cwd passed in uses the alias path; wsRoot is the real path.
    // Before the fix, relative(workspaceDir, cwd) used the unresolved cwd and
    // produced a wrong relative path, causing repo/worktree to come back undefined.
    const alias = join(tempDir, "alias");
    symlinkSync(tempDir, alias);

    const cwdViaAlias = join(alias, "workspaces", "myws", "myrepo", "feature-ctx");
    const ctx = await inferContext(cwdViaAlias, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBe("feature-ctx");
  });

  it("validates repo segment against workspace.json repos list", async () => {
    // Create a directory that looks like a repo but isn't registered
    const fakeRepoDir = join(paths.workspace("myws"), "fakerepo");
    mkdirSync(fakeRepoDir, { recursive: true });

    const ctx = await inferContext(fakeRepoDir, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBeUndefined(); // not registered
  });

  it("cwd via workspace symlink into pool worktree infers full context", async () => {
    // The pool symlink is at {ws}/trees/{repo}/{slug} → ../../../worktrees/{repo}/{slug}
    // Logical walk from {ws}/trees/{repo}/{slug}/src/lib finds workspace.json at {ws}/
    // and correctly extracts repo + worktree without resolving the symlink.
    const deepPath = join(paths.worktreeDir("myws", "myrepo", "feature-ctx"), "src", "lib");
    const ctx = await inferContext(deepPath, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBe("myrepo");
    expect(ctx.worktree).toBe("feature-ctx");
  });

  it("cwd inside pool directory directly returns nothing (no workspace.json in pool)", async () => {
    // Pool is at {root}/worktrees/, which has no workspace.json
    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-ctx");
    // Only test if pool entry exists (it does because addWorktree in beforeAll created it)
    if (existsSync(poolEntry)) {
      const ctx = await inferContext(poolEntry, wsRoot);
      expect(ctx.workspace).toBeUndefined();
    }
  });
});
