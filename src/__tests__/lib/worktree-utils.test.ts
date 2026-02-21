import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { dirname, join } from "node:path";
import { mkdirSync, symlinkSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "../helpers";
import { createPaths } from "../../constants";
import {
  classifyWorktreeEntry,
  resolveRepoPath,
  removePoolWorktreeReference,
} from "../../lib/worktree-utils";
import { addWorkspace } from "../../commands/workspace";
import { addRepo } from "../../commands/repo";
import { addWorktree } from "../../commands/worktree";

describe("classifyWorktreeEntry", () => {
  let tempDir: string;
  let paths: ReturnType<typeof createPaths>;
  let repoPath: string;

  beforeEach(() => {
    tempDir = createTestDir();
    paths = createPaths(join(tempDir, "workspaces"));
    repoPath = createTestGitRepo(tempDir, "myrepo");
    addWorkspace("myws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("returns 'pool' for pool symlink", () => {
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const wtPath = paths.worktreeDir("myws", "myrepo", "feature-x");
    expect(classifyWorktreeEntry(wtPath, paths)).toBe("pool");
  });

  it("returns 'linked' for default-branch symlink", () => {
    // addRepo already created the default branch symlink
    const wtPath = paths.worktreeDir("myws", "myrepo", "main");
    expect(classifyWorktreeEntry(wtPath, paths)).toBe("linked");
  });

  it("returns 'legacy' for real directory", () => {
    const dir = join(tempDir, "realdir");
    mkdirSync(dir);
    expect(classifyWorktreeEntry(dir, paths)).toBe("legacy");
  });

  it("returns null for non-existent path", () => {
    expect(classifyWorktreeEntry(join(tempDir, "nonexistent"), paths)).toBe(null);
  });

  it("returns null for regular file", () => {
    const file = join(tempDir, "file.txt");
    writeFileSync(file, "hello");
    expect(classifyWorktreeEntry(file, paths)).toBe(null);
  });

  it("returns 'linked' for unknown symlink target (safe fallback)", () => {
    const wtPath = paths.worktreeDir("myws", "myrepo", "unknown-slug");
    mkdirSync(dirname(wtPath), { recursive: true });
    symlinkSync("/some/absolute/path", wtPath);
    expect(classifyWorktreeEntry(wtPath, paths)).toBe("linked");
  });

  it("returns 'pool' for dangling pool symlink", () => {
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const wtPath = paths.worktreeDir("myws", "myrepo", "feature-x");
    // Delete the pool entry to make the workspace symlink dangle
    rmSync(paths.worktreePoolEntry("myrepo", "feature-x"), { recursive: true, force: true });
    // classifyWorktreeEntry uses lstatSync (inspects symlink itself, not target)
    // and readlinkSync (reads raw target string), so it still classifies as "pool"
    expect(classifyWorktreeEntry(wtPath, paths)).toBe("pool");
  });
});

describe("resolveRepoPath", () => {
  let tempDir: string;
  let paths: ReturnType<typeof createPaths>;
  let repoPath: string;

  beforeEach(() => {
    tempDir = createTestDir();
    paths = createPaths(join(tempDir, "workspaces"));
    repoPath = createTestGitRepo(tempDir, "myrepo");
    addWorkspace("myws", paths);
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("resolves a valid repo symlink to its real path", () => {
    const result = resolveRepoPath("myrepo", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(repoPath);
    }
  });

  it("returns DANGLING_SYMLINK error when repo dir is removed", () => {
    rmSync(repoPath, { recursive: true, force: true });
    const result = resolveRepoPath("myrepo", paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DANGLING_SYMLINK");
    }
  });

  it("returns DANGLING_SYMLINK error for missing entry", () => {
    const result = resolveRepoPath("nonexistent", paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DANGLING_SYMLINK");
    }
  });
});

describe("removePoolWorktreeReference", () => {
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

  it("removes pool entry when it is the last reference", () => {
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-x");

    const result = removePoolWorktreeReference("myws", "myrepo", "feature-x", {}, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    // Pool entry is gone (git worktree removed)
    const { existsSync } = require("node:fs");
    expect(existsSync(poolEntry)).toBe(false);
  });

  it("preserves pool entry when other workspaces reference it", () => {
    addWorkspace("otherws", paths);
    addRepo("otherws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "myrepo", "feature/shared", { newBranch: true }, paths, GIT_ENV);
    addWorktree("otherws", "myrepo", "feature/shared", {}, paths, GIT_ENV);

    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-shared");

    const result = removePoolWorktreeReference(
      "myws",
      "myrepo",
      "feature-shared",
      {},
      paths,
      GIT_ENV,
    );
    expect(result.ok).toBe(true);

    // Pool entry persists for otherws
    const { existsSync } = require("node:fs");
    expect(existsSync(poolEntry)).toBe(true);
  });

  it("handles dangling repo symlink — cleans up pool entry directly", () => {
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    // Remove actual repo to make it dangling
    rmSync(repoPath, { recursive: true, force: true });

    const result = removePoolWorktreeReference("myws", "myrepo", "feature-x", {}, paths, GIT_ENV);
    expect(result.ok).toBe(true);
  });
});
