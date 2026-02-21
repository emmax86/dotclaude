import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
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
});
