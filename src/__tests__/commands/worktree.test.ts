import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { existsSync, lstatSync, writeFileSync } from "node:fs";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "../helpers";
import { createPaths } from "../../constants";
import { addWorkspace } from "../../commands/workspace";
import { addRepo } from "../../commands/repo";
import { addWorktree, listWorktrees, removeWorktree } from "../../commands/worktree";

describe("worktree commands", () => {
  let tempDir: string;
  let repoPath: string;
  let paths: ReturnType<typeof createPaths>;

  beforeEach(() => {
    tempDir = createTestDir();
    repoPath = createTestGitRepo(tempDir, "myrepo");
    paths = createPaths(join(tempDir, "workspaces"));
    addWorkspace("myws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("add creates real worktree directory", () => {
    const result = addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    const wtPath = paths.worktreeDir("myws", "myrepo", "feature-x");
    expect(existsSync(wtPath)).toBe(true);
    const lstat = lstatSync(wtPath);
    expect(lstat.isDirectory()).toBe(true);
    expect(lstat.isSymbolicLink()).toBe(false);
  });

  it("add then list includes worktree", () => {
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const result = listWorktrees("myws", "myrepo", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((w) => w.slug)).toContain("feature-x");
    }
  });

  it("list includes default branch symlink as linked type", () => {
    const result = listWorktrees("myws", "myrepo", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const linked = result.value.find((w) => w.type === "linked");
      expect(linked).toBeDefined();
    }
  });

  it("add with --new creates new branch", () => {
    const result = addWorktree(
      "myws", "myrepo", "brand-new-branch", { newBranch: true }, paths, GIT_ENV
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slug).toBe("brand-new-branch");
      expect(result.value.type).toBe("worktree");
    }
  });

  it("add with --from branches off specified base", () => {
    const result = addWorktree(
      "myws", "myrepo", "feature/from-main",
      { newBranch: true, from: "main" },
      paths, GIT_ENV
    );
    expect(result.ok).toBe(true);
  });

  it("add fails if repo not registered in workspace", () => {
    const result = addWorktree("myws", "unknown-repo", "branch", {}, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("REPO_NOT_FOUND");
    }
  });

  it("add detects slug collision (target dir already exists)", () => {
    addWorktree("myws", "myrepo", "feature/auth", { newBranch: true }, paths, GIT_ENV);
    // feature-auth slug already exists
    const result = addWorktree("myws", "myrepo", "feature-auth", { newBranch: true }, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SLUG_COLLISION");
    }
  });

  it("remove then list excludes worktree", () => {
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const result = removeWorktree("myws", "myrepo", "feature-x", {}, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    const list = listWorktrees("myws", "myrepo", paths);
    if (list.ok) {
      expect(list.value.map((w) => w.slug)).not.toContain("feature-x");
    }
  });

  it("remove refuses dirty worktree without --force", () => {
    addWorktree("myws", "myrepo", "feature/dirty", { newBranch: true }, paths, GIT_ENV);
    const wtPath = paths.worktreeDir("myws", "myrepo", "feature-dirty");
    writeFileSync(join(wtPath, "dirty.txt"), "dirty");

    const result = removeWorktree("myws", "myrepo", "feature-dirty", {}, paths, GIT_ENV);
    expect(result.ok).toBe(false);
  });

  it("remove --force removes dirty worktree", () => {
    addWorktree("myws", "myrepo", "feature/dirty2", { newBranch: true }, paths, GIT_ENV);
    const wtPath = paths.worktreeDir("myws", "myrepo", "feature-dirty2");
    writeFileSync(join(wtPath, "dirty.txt"), "dirty");

    const result = removeWorktree("myws", "myrepo", "feature-dirty2", { force: true }, paths, GIT_ENV);
    expect(result.ok).toBe(true);
  });

  it("remove refuses to remove default branch symlink", () => {
    const result = removeWorktree("myws", "myrepo", "main", {}, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CANNOT_REMOVE_DEFAULT_BRANCH");
    }
  });
});
