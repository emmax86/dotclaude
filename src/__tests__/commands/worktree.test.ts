import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

  it("add creates pool entry and workspace symlink", () => {
    const result = addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    const wtPath = paths.worktreeDir("myws", "myrepo", "feature-x");

    // Workspace entry is a symlink
    const lstat = lstatSync(wtPath);
    expect(lstat.isSymbolicLink()).toBe(true);

    // Symlink target points to pool
    const target = readlinkSync(wtPath);
    expect(target).toBe("../../worktrees/myrepo/feature-x");

    // Pool entry is a real directory
    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-x");
    expect(existsSync(poolEntry)).toBe(true);
    expect(lstatSync(poolEntry).isDirectory()).toBe(true);
    expect(lstatSync(poolEntry).isSymbolicLink()).toBe(false);
  });

  it("add then list includes worktree", () => {
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const result = listWorktrees("myws", "myrepo", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((w) => w.slug)).toContain("feature-x");
    }
  });

  it("list classifies pool symlinks as worktree type", () => {
    addWorktree("myws", "myrepo", "feature/x", { newBranch: true }, paths, GIT_ENV);
    const result = listWorktrees("myws", "myrepo", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const entry = result.value.find((w) => w.slug === "feature-x");
      expect(entry?.type).toBe("worktree");
    }
  });

  it("list classifies default-branch symlinks as linked type", () => {
    const result = listWorktrees("myws", "myrepo", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const linked = result.value.find((w) => w.type === "linked");
      expect(linked).toBeDefined();
    }
  });

  it("add with --new creates new branch", () => {
    const result = addWorktree(
      "myws",
      "myrepo",
      "brand-new-branch",
      { newBranch: true },
      paths,
      GIT_ENV,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slug).toBe("brand-new-branch");
      expect(result.value.type).toBe("worktree");
    }
  });

  it("add with --from branches off specified base", () => {
    const result = addWorktree(
      "myws",
      "myrepo",
      "feature/from-main",
      { newBranch: true, from: "main" },
      paths,
      GIT_ENV,
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
    const result = addWorktree(
      "myws",
      "myrepo",
      "feature-auth",
      { newBranch: true },
      paths,
      GIT_ENV,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SLUG_COLLISION");
    }
  });

  it("add to second workspace reuses pool entry", () => {
    addWorkspace("otherws", paths);
    addRepo("otherws", repoPath, undefined, paths, GIT_ENV);

    addWorktree("myws", "myrepo", "feature/shared", { newBranch: true }, paths, GIT_ENV);
    const result = addWorktree("otherws", "myrepo", "feature/shared", {}, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    // Both workspace entries are symlinks pointing to same pool
    const ws1Link = readlinkSync(paths.worktreeDir("myws", "myrepo", "feature-shared"));
    const ws2Link = readlinkSync(paths.worktreeDir("otherws", "myrepo", "feature-shared"));
    expect(ws1Link).toBe("../../worktrees/myrepo/feature-shared");
    expect(ws2Link).toBe("../../worktrees/myrepo/feature-shared");

    // worktrees.json lists both workspaces
    const poolRaw = readFileSync(paths.worktreePoolConfig, "utf-8");
    const pool = JSON.parse(poolRaw);
    expect(pool.myrepo["feature-shared"]).toContain("myws");
    expect(pool.myrepo["feature-shared"]).toContain("otherws");
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
    const poolEntryPath = paths.worktreePoolEntry("myrepo", "feature-dirty");
    writeFileSync(join(poolEntryPath, "dirty.txt"), "dirty");

    const result = removeWorktree("myws", "myrepo", "feature-dirty", {}, paths, GIT_ENV);
    expect(result.ok).toBe(false);
  });

  it("remove --force removes dirty worktree", () => {
    addWorktree("myws", "myrepo", "feature/dirty2", { newBranch: true }, paths, GIT_ENV);
    const poolEntryPath = paths.worktreePoolEntry("myrepo", "feature-dirty2");
    writeFileSync(join(poolEntryPath, "dirty.txt"), "dirty");

    const result = removeWorktree(
      "myws",
      "myrepo",
      "feature-dirty2",
      { force: true },
      paths,
      GIT_ENV,
    );
    expect(result.ok).toBe(true);
  });

  it("remove refuses to remove default branch symlink", () => {
    const result = removeWorktree("myws", "myrepo", "main", {}, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CANNOT_REMOVE_DEFAULT_BRANCH");
    }
  });

  it("remove refuses default branch symlink even when dangling", () => {
    // Break the two-hop chain by removing the workspace trees entry
    rmSync(paths.workspaceTreeEntry("myws", "myrepo"));
    const result = removeWorktree("myws", "myrepo", "main", {}, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CANNOT_REMOVE_DEFAULT_BRANCH");
    }
  });

  it("list includes dangling default branch symlink as linked type", () => {
    // Break the two-hop chain — main symlink is now dangling
    const treeEntry = paths.workspaceTreeEntry("myws", "myrepo");
    let removed = false;
    try {
      lstatSync(treeEntry);
      rmSync(treeEntry);
      removed = true;
    } catch {
      /* already gone from previous test */
    }

    const result = listWorktrees("myws", "myrepo", paths);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const main = result.value.find((w) => w.slug === "main");
      expect(main?.type).toBe("linked");
    }
  });

  it("worktrees.json updated on add and remove", () => {
    addWorktree("myws", "myrepo", "feature/tracked", { newBranch: true }, paths, GIT_ENV);

    // After add
    const afterAdd = JSON.parse(readFileSync(paths.worktreePoolConfig, "utf-8"));
    expect(afterAdd.myrepo["feature-tracked"]).toContain("myws");

    removeWorktree("myws", "myrepo", "feature-tracked", {}, paths, GIT_ENV);

    // After remove — entry should be gone
    const afterRemove = JSON.parse(readFileSync(paths.worktreePoolConfig, "utf-8"));
    expect(afterRemove.myrepo).toBeUndefined();
  });

  it("cross-workspace lifecycle: shared pool entry", () => {
    addWorkspace("otherws", paths);
    addRepo("otherws", repoPath, undefined, paths, GIT_ENV);

    // Add same branch to both workspaces
    addWorktree("myws", "myrepo", "feature/cross", { newBranch: true }, paths, GIT_ENV);
    addWorktree("otherws", "myrepo", "feature/cross", {}, paths, GIT_ENV);

    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-cross");

    // Remove from ws1
    const r1 = removeWorktree("myws", "myrepo", "feature-cross", {}, paths, GIT_ENV);
    expect(r1.ok).toBe(true);

    // ws1 symlink is gone
    let ws1Gone = false;
    try {
      lstatSync(paths.worktreeDir("myws", "myrepo", "feature-cross"));
    } catch {
      ws1Gone = true;
    }
    expect(ws1Gone).toBe(true);

    // Pool entry persists
    expect(existsSync(poolEntry)).toBe(true);

    // ws2 symlink intact
    expect(
      lstatSync(paths.worktreeDir("otherws", "myrepo", "feature-cross")).isSymbolicLink(),
    ).toBe(true);

    // worktrees.json has only otherws
    const pool1 = JSON.parse(readFileSync(paths.worktreePoolConfig, "utf-8"));
    expect(pool1.myrepo["feature-cross"]).toEqual(["otherws"]);

    // Remove from ws2
    const r2 = removeWorktree("otherws", "myrepo", "feature-cross", {}, paths, GIT_ENV);
    expect(r2.ok).toBe(true);

    // Pool entry is gone
    expect(existsSync(poolEntry)).toBe(false);

    // worktrees.json empty for myrepo
    const pool2 = JSON.parse(readFileSync(paths.worktreePoolConfig, "utf-8"));
    expect(pool2.myrepo).toBeUndefined();
  });
});
