import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "../helpers";
import { createPaths } from "../../constants";
import { addWorkspace, listWorkspaces } from "../../commands/workspace";
import { addRepo, listRepos } from "../../commands/repo";
import { addWorktree, listWorktrees } from "../../commands/worktree";
import { getStatus } from "../../commands/status";
import { existsSync, lstatSync, realpathSync } from "node:fs";

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

    // full chain: {workspace}/myrepo/main -> ../trees/myrepo -> ../../repos/myrepo -> actual path
    expect(realpathSync(defaultBranchPath)).toBe(realpathSync(repoPath));
  });

  it("adds a worktree", () => {
    const result = addWorktree(
      "myws",
      "myrepo",
      "feature/lifecycle",
      { newBranch: true },
      paths,
      GIT_ENV
    );
    expect(result.ok).toBe(true);

    const list = listWorktrees("myws", "myrepo", paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      const slugs = list.value.map((w) => w.slug);
      expect(slugs).toContain("feature-lifecycle");
    }

    // verify it's a real directory, not a symlink
    const stat = lstatSync(paths.worktreeDir("myws", "myrepo", "feature-lifecycle"));
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
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
        list2.value.find((r) => r.name === "myrepo")?.path
      );
    }
  });
});
