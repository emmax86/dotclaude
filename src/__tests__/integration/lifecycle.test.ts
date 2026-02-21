import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "../helpers";
import { createPaths } from "../../constants";
import { addWorkspace, listWorkspaces } from "../../commands/workspace";
import { addRepo, listRepos } from "../../commands/repo";
import { addWorktree, listWorktrees, removeWorktree } from "../../commands/worktree";
import { getStatus } from "../../commands/status";
import { existsSync, lstatSync, readlinkSync, realpathSync } from "node:fs";

describe("lifecycle integration", () => {
  let tempDir: string;
  let repoPath: string;
  let paths: ReturnType<typeof createPaths>;

  beforeAll(() => {
    tempDir = createTestDir();
    repoPath = createTestGitRepo(tempDir, "myrepo");
    paths = createPaths(join(tempDir, "workspaces"));
  });

  afterAll(() => {
    cleanup(tempDir);
  });

  it("creates a workspace", () => {
    const result = addWorkspace("myws", paths);
    expect(result.ok).toBe(true);

    const list = listWorkspaces(paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.map((w) => w.name)).toContain("myws");
    }
  });

  it("adds a repo to the workspace", () => {
    const result = addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    const list = listRepos("myws", paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.map((r) => r.name)).toContain("myrepo");
    }

    // repo symlink exists
    expect(existsSync(paths.repoEntry("myrepo"))).toBe(true);

    // default branch symlink exists in workspace
    const defaultBranchPath = join(paths.repoDir("myws", "myrepo"), "main");
    const stat = lstatSync(defaultBranchPath);
    expect(stat.isSymbolicLink()).toBe(true);

    // full chain: {workspace}/trees/myrepo/main -> ../../../repos/myrepo -> actual path
    expect(realpathSync(defaultBranchPath)).toBe(realpathSync(repoPath));
  });

  it("adds a worktree", () => {
    const result = addWorktree(
      "myws",
      "myrepo",
      "feature/lifecycle",
      { newBranch: true },
      paths,
      GIT_ENV,
    );
    expect(result.ok).toBe(true);

    const list = listWorktrees("myws", "myrepo", paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      const slugs = list.value.map((w) => w.slug);
      expect(slugs).toContain("feature-lifecycle");
    }

    // Workspace entry is a symlink pointing to the pool
    const wsEntry = paths.worktreeDir("myws", "myrepo", "feature-lifecycle");
    expect(lstatSync(wsEntry).isSymbolicLink()).toBe(true);
    expect(readlinkSync(wsEntry)).toBe("../../../worktrees/myrepo/feature-lifecycle");

    // Pool entry is a real directory
    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-lifecycle");
    expect(existsSync(poolEntry)).toBe(true);
    expect(lstatSync(poolEntry).isDirectory()).toBe(true);
    expect(lstatSync(poolEntry).isSymbolicLink()).toBe(false);
  });

  it("ws status shows workspace overview", () => {
    const result = getStatus("myws", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("myws");
      expect(result.value.repos.length).toBeGreaterThan(0);
    }
  });

  it("two workspaces can share the same repo", () => {
    const ws2 = addWorkspace("otherws", paths);
    expect(ws2.ok).toBe(true);

    const repo2 = addRepo("otherws", repoPath, undefined, paths, GIT_ENV);
    expect(repo2.ok).toBe(true);

    // Global tree symlink still points to same place
    const list1 = listRepos("myws", paths);
    const list2 = listRepos("otherws", paths);
    expect(list1.ok && list2.ok).toBe(true);
    if (list1.ok && list2.ok) {
      expect(list1.value.find((r) => r.name === "myrepo")?.path).toBe(
        list2.value.find((r) => r.name === "myrepo")?.path,
      );
    }
  });

  it("two workspaces share a worktree via pool", () => {
    // otherws was created in the previous test
    addRepo("otherws", repoPath, undefined, paths, GIT_ENV);

    // Add same branch to both workspaces
    const r1 = addWorktree(
      "myws",
      "myrepo",
      "feature/pool-share",
      { newBranch: true },
      paths,
      GIT_ENV,
    );
    expect(r1.ok).toBe(true);
    const r2 = addWorktree("otherws", "myrepo", "feature/pool-share", {}, paths, GIT_ENV);
    expect(r2.ok).toBe(true);

    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-pool-share");

    // Both workspace entries are symlinks to same pool entry
    const ws1Link = paths.worktreeDir("myws", "myrepo", "feature-pool-share");
    const ws2Link = paths.worktreeDir("otherws", "myrepo", "feature-pool-share");
    expect(lstatSync(ws1Link).isSymbolicLink()).toBe(true);
    expect(lstatSync(ws2Link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(ws1Link)).toBe("../../../worktrees/myrepo/feature-pool-share");
    expect(readlinkSync(ws2Link)).toBe("../../../worktrees/myrepo/feature-pool-share");

    // Remove from ws1 — pool should persist for ws2
    const rm1 = removeWorktree("myws", "myrepo", "feature-pool-share", {}, paths, GIT_ENV);
    expect(rm1.ok).toBe(true);

    let ws1Gone = false;
    try {
      lstatSync(ws1Link);
    } catch {
      ws1Gone = true;
    }
    expect(ws1Gone).toBe(true);
    expect(existsSync(poolEntry)).toBe(true);
    expect(lstatSync(ws2Link).isSymbolicLink()).toBe(true);

    // Remove from ws2 — pool should be cleaned up
    const rm2 = removeWorktree("otherws", "myrepo", "feature-pool-share", {}, paths, GIT_ENV);
    expect(rm2.ok).toBe(true);
    expect(existsSync(poolEntry)).toBe(false);
  });
});
