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

  beforeEach(async () => {
    tempDir = createTestDir();
    paths = createPaths(join(tempDir, "workspaces"));
    repoPath = await createTestGitRepo(tempDir, "myrepo");
    await addWorkspace("myws", paths);
    await addRepo("myws", repoPath, undefined, paths, GIT_ENV);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("returns 'pool' for pool symlink", async () => {
    await addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const wtPath = paths.worktreeDir("myws", "myrepo", "feature-x");
    expect(await classifyWorktreeEntry(wtPath, paths)).toBe("pool");
  });

  it("returns 'linked' for default-branch symlink", async () => {
    // addRepo already created the default branch symlink
    const wtPath = paths.worktreeDir("myws", "myrepo", "main");
    expect(await classifyWorktreeEntry(wtPath, paths)).toBe("linked");
  });

  it("returns 'legacy' for real directory", async () => {
    const dir = join(tempDir, "realdir");
    mkdirSync(dir);
    expect(await classifyWorktreeEntry(dir, paths)).toBe("legacy");
  });

  it("returns null for non-existent path", async () => {
    expect(await classifyWorktreeEntry(join(tempDir, "nonexistent"), paths)).toBe(null);
  });

  it("returns null for regular file", async () => {
    const file = join(tempDir, "file.txt");
    writeFileSync(file, "hello");
    expect(await classifyWorktreeEntry(file, paths)).toBe(null);
  });

  it("returns 'linked' for unknown symlink target (safe fallback)", async () => {
    const wtPath = paths.worktreeDir("myws", "myrepo", "unknown-slug");
    mkdirSync(dirname(wtPath), { recursive: true });
    symlinkSync("/some/absolute/path", wtPath);
    expect(await classifyWorktreeEntry(wtPath, paths)).toBe("linked");
  });

  it("returns 'pool' for dangling pool symlink", async () => {
    await addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const wtPath = paths.worktreeDir("myws", "myrepo", "feature-x");
    // Delete the pool entry to make the workspace symlink dangle
    rmSync(paths.worktreePoolEntry("myrepo", "feature-x"), { recursive: true, force: true });
    // classifyWorktreeEntry uses lstat (inspects symlink itself, not target)
    // and readlink (reads raw target string), so it still classifies as "pool"
    expect(await classifyWorktreeEntry(wtPath, paths)).toBe("pool");
  });
});

describe("resolveRepoPath", () => {
  let tempDir: string;
  let paths: ReturnType<typeof createPaths>;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = createTestDir();
    paths = createPaths(join(tempDir, "workspaces"));
    repoPath = await createTestGitRepo(tempDir, "myrepo");
    await addWorkspace("myws", paths);
    await addRepo("myws", repoPath, undefined, paths, GIT_ENV);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("resolves a valid repo symlink to its real path", async () => {
    const result = await resolveRepoPath("myrepo", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(repoPath);
    }
  });

  it("returns DANGLING_SYMLINK error when repo dir is removed", async () => {
    rmSync(repoPath, { recursive: true, force: true });
    const result = await resolveRepoPath("myrepo", paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DANGLING_SYMLINK");
    }
  });

  it("returns DANGLING_SYMLINK error for missing entry", async () => {
    const result = await resolveRepoPath("nonexistent", paths);
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

  beforeEach(async () => {
    tempDir = createTestDir();
    repoPath = await createTestGitRepo(tempDir, "myrepo");
    paths = createPaths(join(tempDir, "workspaces"));
    await addWorkspace("myws", paths);
    await addRepo("myws", repoPath, undefined, paths, GIT_ENV);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("removes pool entry when it is the last reference", async () => {
    await addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-x");

    const result = await removePoolWorktreeReference(
      "myws",
      "myrepo",
      "feature-x",
      {},
      paths,
      GIT_ENV,
    );
    expect(result.ok).toBe(true);

    // Pool entry is gone (git worktree removed)
    const { existsSync } = require("node:fs");
    expect(existsSync(poolEntry)).toBe(false);
  });

  it("preserves pool entry when other workspaces reference it", async () => {
    await addWorkspace("otherws", paths);
    await addRepo("otherws", repoPath, undefined, paths, GIT_ENV);
    await addWorktree("myws", "myrepo", "feature/shared", { newBranch: true }, paths, GIT_ENV);
    await addWorktree("otherws", "myrepo", "feature/shared", {}, paths, GIT_ENV);

    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-shared");

    const result = await removePoolWorktreeReference(
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

  it("handles dangling repo symlink — cleans up pool entry directly", async () => {
    await addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    // Remove actual repo to make it dangling
    rmSync(repoPath, { recursive: true, force: true });

    const result = await removePoolWorktreeReference(
      "myws",
      "myrepo",
      "feature-x",
      {},
      paths,
      GIT_ENV,
    );
    expect(result.ok).toBe(true);
  });
});
