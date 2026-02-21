import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "../helpers";
import { createPaths } from "../../constants";
import { addWorkspace } from "../../commands/workspace";
import { addRepo } from "../../commands/repo";
import { addWorktree } from "../../commands/worktree";
import { getStatus } from "../../commands/status";

describe("status command", () => {
  let tempDir: string;
  let repoPath: string;
  let paths: ReturnType<typeof createPaths>;

  beforeAll(() => {
    tempDir = createTestDir();
    repoPath = createTestGitRepo(tempDir, "myrepo");
    paths = createPaths(join(tempDir, "workspaces"));
    addWorkspace("myws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
  });

  afterAll(() => {
    cleanup(tempDir);
  });

  it("shows workspace name", () => {
    const result = getStatus("myws", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("myws");
    }
  });

  it("shows repo count > 0", () => {
    const result = getStatus("myws", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repos.length).toBeGreaterThan(0);
    }
  });

  it("shows worktree list per repo", () => {
    const result = getStatus("myws", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const repo = result.value.repos.find((r) => r.name === "myrepo");
      expect(repo).toBeDefined();
      if (repo) {
        expect(repo.worktrees.length).toBeGreaterThan(0);
        const slugs = repo.worktrees.map((w) => w.slug);
        expect(slugs).toContain("feature-x");
      }
    }
  });

  it("flags dangling symlinks", () => {
    // Remove repo to make dangling
    rmSync(repoPath, { recursive: true, force: true });
    const result = getStatus("myws", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const repo = result.value.repos.find((r) => r.name === "myrepo");
      expect(repo?.status).toBe("dangling");
    }
  });
});
