import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "../helpers";
import { createPaths } from "../../constants";
import { addWorkspace } from "../../commands/workspace";
import { addRepo, listRepos, removeRepo } from "../../commands/repo";
import { addWorktree } from "../../commands/worktree";

describe("repo commands", () => {
  let tempDir: string;
  let repoPath: string;
  let paths: ReturnType<typeof createPaths>;

  beforeEach(() => {
    tempDir = createTestDir();
    repoPath = createTestGitRepo(tempDir, "myrepo");
    paths = createPaths(join(tempDir, "workspaces"));
    addWorkspace("myws", paths);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("add creates tree symlink and default branch symlink", () => {
    const result = addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    // repos/myrepo symlink exists
    expect(existsSync(paths.repoEntry("myrepo"))).toBe(true);
    expect(lstatSync(paths.repoEntry("myrepo")).isSymbolicLink()).toBe(true);

    // {workspace}/{repo}/main symlink exists
    const defaultSlugPath = join(paths.repoDir("myws", "myrepo"), "main");
    expect(existsSync(defaultSlugPath)).toBe(true);
    expect(lstatSync(defaultSlugPath).isSymbolicLink()).toBe(true);
  });

  it("add then list includes repo", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    const result = listRepos("myws", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((r) => r.name)).toContain("myrepo");
    }
  });

  it("add derives name from path basename", () => {
    const result = addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("myrepo");
    }
  });

  it("add with --name overrides derived name", () => {
    const result = addRepo("myws", repoPath, "customname", paths, GIT_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("customname");
    }
    expect(existsSync(paths.repoEntry("customname"))).toBe(true);
  });

  it("add fails if path is not a git repo", () => {
    const plainDir = join(tempDir, "notarepo");
    mkdirSync(plainDir);
    const result = addRepo("myws", plainDir, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_A_GIT_REPO");
    }
  });

  it("add to second workspace reuses existing global tree symlink", () => {
    addWorkspace("otherws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    const result = addRepo("otherws", repoPath, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    // Only one repos/myrepo entry
    const treeStat = lstatSync(paths.repoEntry("myrepo"));
    expect(treeStat.isSymbolicLink()).toBe(true);

    // Both workspaces have their own default branch symlinks
    const ws1Link = join(paths.repoDir("myws", "myrepo"), "main");
    const ws2Link = join(paths.repoDir("otherws", "myrepo"), "main");
    expect(lstatSync(ws1Link).isSymbolicLink()).toBe(true);
    expect(lstatSync(ws2Link).isSymbolicLink()).toBe(true);
  });

  it("add errors if repos/{name} already points to a different path", () => {
    const otherRepo = createTestGitRepo(tempDir, "myrepo2");
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    // Try to add a different repo with same derived name "myrepo" (use --name myrepo)
    const result = addRepo("myws", otherRepo, "myrepo", paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TREE_NAME_CONFLICT");
    }
  });

  it("add creates repos/ directory lazily on first use", () => {
    expect(existsSync(paths.repos)).toBe(false);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    expect(existsSync(paths.repos)).toBe(true);
  });

  it("remove excludes repo from list but global tree remains", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    const result = removeRepo("myws", "myrepo", {}, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    const list = listRepos("myws", paths);
    if (list.ok) {
      expect(list.value.map((r) => r.name)).not.toContain("myrepo");
    }

    // Global repo symlink stays
    expect(existsSync(paths.repoEntry("myrepo"))).toBe(true);
  });

  it("remove refuses if real worktrees exist without --force", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);

    const result = removeRepo("myws", "myrepo", {}, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("REPO_HAS_WORKTREES");
    }
  });

  it("remove --force removes worktrees then repo dir", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);

    const result = removeRepo("myws", "myrepo", { force: true }, paths, GIT_ENV);
    expect(result.ok).toBe(true);
    expect(existsSync(paths.repoDir("myws", "myrepo"))).toBe(false);
    // Global repo entry stays
    expect(existsSync(paths.repoEntry("myrepo"))).toBe(true);
  });

  it("dangling symlink reported in list status", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    // Remove the actual repo directory to make symlink dangling
    rmSync(repoPath, { recursive: true, force: true });

    const list = listRepos("myws", paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      const repo = list.value.find((r) => r.name === "myrepo");
      expect(repo?.status).toBe("dangling");
    }
  });
});
