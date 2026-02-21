import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "../helpers";
import { createPaths } from "../../constants";
import { addWorkspace, listWorkspaces, removeWorkspace } from "../../commands/workspace";
import { addRepo } from "../../commands/repo";
import { addWorktree } from "../../commands/worktree";

describe("workspace commands", () => {
  let tempDir: string;
  let paths: ReturnType<typeof createPaths>;

  beforeEach(() => {
    tempDir = createTestDir();
    paths = createPaths(join(tempDir, "workspaces"));
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("add then list includes workspace", () => {
    const result = addWorkspace("myws", paths);
    expect(result.ok).toBe(true);

    const list = listWorkspaces(paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.map((w) => w.name)).toContain("myws");
    }
  });

  it("add fails if workspace already exists", () => {
    addWorkspace("myws", paths);
    const result = addWorkspace("myws", paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("WORKSPACE_EXISTS");
    }
  });

  it("add rejects reserved name 'repos'", () => {
    const result = addWorkspace("repos", paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESERVED_NAME");
    }
  });

  it("add rejects name with path separators", () => {
    const result = addWorkspace("my/ws", paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_NAME");
    }
  });

  it("list excludes repos/ directory", () => {
    addWorkspace("myws", paths);
    // Manually create a repos dir
    mkdirSync(paths.repos, { recursive: true });

    const list = listWorkspaces(paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.map((w) => w.name)).not.toContain("repos");
    }
  });

  it("remove then list excludes workspace", () => {
    addWorkspace("myws", paths);
    const result = removeWorkspace("myws", {}, paths);
    expect(result.ok).toBe(true);

    const list = listWorkspaces(paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.map((w) => w.name)).not.toContain("myws");
    }
  });

  it("remove does not touch global repos", () => {
    const repoPath = createTestGitRepo(tempDir, "repo");
    addWorkspace("myws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);

    removeWorkspace("myws", { force: true }, paths, GIT_ENV);

    // repo symlink should still exist
    expect(existsSync(paths.repoEntry("repo"))).toBe(true);
  });

  it("remove without force fails if workspace has repos", () => {
    const repoPath = createTestGitRepo(tempDir, "repo");
    addWorkspace("myws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);

    const result = removeWorkspace("myws", {}, paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("WORKSPACE_HAS_REPOS");
    }
  });

  it("remove --force removes workspace with repos and worktrees", () => {
    const repoPath = createTestGitRepo(tempDir, "repo");
    addWorkspace("myws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "repo", "feature/x", { newBranch: true }, paths, GIT_ENV);

    const result = removeWorkspace("myws", { force: true }, paths, GIT_ENV);
    expect(result.ok).toBe(true);
    expect(existsSync(paths.workspace("myws"))).toBe(false);
  });

  it("returns error when removing non-existent workspace", () => {
    const result = removeWorkspace("ghost", {}, paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("WORKSPACE_NOT_FOUND");
    }
  });

  it("addWorkspace generates .code-workspace file", () => {
    const result = addWorkspace("myws", paths);
    expect(result.ok).toBe(true);

    const wsFilePath = paths.vscodeWorkspace("myws");
    const content = JSON.parse(require("node:fs").readFileSync(wsFilePath, "utf-8"));
    expect(content.folders[0]).toEqual({ path: ".", name: "myws (workspace)" });
    expect(content.settings["files.exclude"].trees).toBe(true);
  });

  it("add rejects reserved name 'worktrees'", () => {
    const result = addWorkspace("worktrees", paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESERVED_NAME");
    }
  });

  it("list excludes worktrees/ directory", () => {
    addWorkspace("myws", paths);
    mkdirSync(paths.worktreePool, { recursive: true });

    const list = listWorkspaces(paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.map((w) => w.name)).not.toContain("worktrees");
    }
  });

  it("remove --force with shared pool worktree preserves pool entry for other workspace", () => {
    const repoPath = createTestGitRepo(tempDir, "repo");
    addWorkspace("ws1", paths);
    addWorkspace("ws2", paths);
    addRepo("ws1", repoPath, undefined, paths, GIT_ENV);
    addRepo("ws2", repoPath, undefined, paths, GIT_ENV);
    addWorktree("ws1", "repo", "feature/shared", { newBranch: true }, paths, GIT_ENV);
    addWorktree("ws2", "repo", "feature/shared", {}, paths, GIT_ENV);

    const poolEntry = paths.worktreePoolEntry("repo", "feature-shared");

    const result = removeWorkspace("ws1", { force: true }, paths, GIT_ENV);
    expect(result.ok).toBe(true);
    expect(existsSync(paths.workspace("ws1"))).toBe(false);

    // Pool entry persists for ws2
    expect(existsSync(poolEntry)).toBe(true);
    expect(lstatSync(paths.worktreeDir("ws2", "repo", "feature-shared")).isSymbolicLink()).toBe(
      true,
    );
  });

  it("listWorkspaces returns empty array when root does not exist", () => {
    // paths.root doesn't exist (no workspaces created yet)
    const freshPaths = createPaths(join(tempDir, "nonexistent-root"));
    const result = listWorkspaces(freshPaths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});
