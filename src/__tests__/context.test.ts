import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
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

  it("validates repo segment against workspace.json repos list", () => {
    // Create a directory that looks like a repo but isn't registered
    const fakeRepoDir = join(paths.workspace("myws"), "fakerepo");
    mkdirSync(fakeRepoDir, { recursive: true });

    const ctx = inferContext(fakeRepoDir, wsRoot);
    expect(ctx.workspace).toBe("myws");
    expect(ctx.repo).toBeUndefined(); // not registered
  });
});
