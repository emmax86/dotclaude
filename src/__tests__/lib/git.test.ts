import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createTestDir, createTestGitRepo, cleanup, GIT_ENV } from "../helpers";
import {
  isGitRepo,
  getDefaultBranch,
  addWorktree,
  removeWorktree,
  listWorktrees,
} from "../../lib/git";

describe("git lib", () => {
  let tempDir: string;
  let repoPath: string;

  beforeAll(() => {
    tempDir = createTestDir();
    repoPath = createTestGitRepo(tempDir, "testrepo");
  });

  afterAll(() => {
    cleanup(tempDir);
  });

  describe("isGitRepo", () => {
    it("returns true for a git repo", () => {
      expect(isGitRepo(repoPath)).toBe(true);
    });

    it("returns false for a plain directory", () => {
      const plain = join(tempDir, "plain");
      mkdirSync(plain);
      expect(isGitRepo(plain)).toBe(false);
    });

    it("returns false for non-existent path", () => {
      expect(isGitRepo(join(tempDir, "nonexistent"))).toBe(false);
    });
  });

  describe("getDefaultBranch", () => {
    it("detects main branch", () => {
      const result = getDefaultBranch(repoPath, GIT_ENV);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("main");
      }
    });

    it("detects master branch", () => {
      const masterRepo = createTestGitRepo(tempDir, "masterrepo", "master");
      const result = getDefaultBranch(masterRepo, GIT_ENV);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("master");
      }
    });
  });

  describe("addWorktree", () => {
    it("adds a worktree for an existing branch", () => {
      // First create a branch
      Bun.spawnSync(["git", "branch", "existing-branch"], {
        cwd: repoPath,
        env: { ...process.env, ...GIT_ENV },
      });

      const wtPath = join(tempDir, "wt-existing");
      const result = addWorktree(repoPath, wtPath, "existing-branch", {}, GIT_ENV);
      expect(result.ok).toBe(true);

      // Verify it exists
      const wts = listWorktrees(repoPath, GIT_ENV);
      expect(wts.ok).toBe(true);
      if (wts.ok) {
        const found = wts.value.find((w) => w.path === wtPath);
        expect(found).toBeDefined();
      }
    });

    it("adds a worktree with --new creating a new branch", () => {
      const wtPath = join(tempDir, "wt-new");
      const result = addWorktree(repoPath, wtPath, "new-branch", { newBranch: true }, GIT_ENV);
      expect(result.ok).toBe(true);
    });

    it("adds a worktree with --new --from base", () => {
      const wtPath = join(tempDir, "wt-from");
      const result = addWorktree(
        repoPath,
        wtPath,
        "from-branch",
        { newBranch: true, from: "main" },
        GIT_ENV,
      );
      expect(result.ok).toBe(true);
    });

    it("fails when branch doesn't exist and not new", () => {
      const wtPath = join(tempDir, "wt-nonexistent");
      const result = addWorktree(repoPath, wtPath, "nonexistent-branch", {}, GIT_ENV);
      expect(result.ok).toBe(false);
    });

    it("fails when branch already checked out", () => {
      const wtPath = join(tempDir, "wt-main-dupe");
      const result = addWorktree(repoPath, wtPath, "main", {}, GIT_ENV);
      expect(result.ok).toBe(false);
    });
  });

  describe("removeWorktree", () => {
    it("removes a clean worktree", () => {
      const wtPath = join(tempDir, "wt-to-remove");
      Bun.spawnSync(["git", "branch", "to-remove"], {
        cwd: repoPath,
        env: { ...process.env, ...GIT_ENV },
      });
      addWorktree(repoPath, wtPath, "to-remove", {}, GIT_ENV);

      const result = removeWorktree(repoPath, wtPath, false, GIT_ENV);
      expect(result.ok).toBe(true);
    });

    it("fails without force on dirty worktree", () => {
      const wtPath = join(tempDir, "wt-dirty");
      Bun.spawnSync(["git", "branch", "dirty-branch"], {
        cwd: repoPath,
        env: { ...process.env, ...GIT_ENV },
      });
      addWorktree(repoPath, wtPath, "dirty-branch", {}, GIT_ENV);

      // Make it dirty
      writeFileSync(join(wtPath, "dirty.txt"), "dirty file");

      const result = removeWorktree(repoPath, wtPath, false, GIT_ENV);
      expect(result.ok).toBe(false);
    });

    it("removes dirty worktree with force", () => {
      const wtPath = join(tempDir, "wt-dirty-force");
      Bun.spawnSync(["git", "branch", "dirty-force-branch"], {
        cwd: repoPath,
        env: { ...process.env, ...GIT_ENV },
      });
      addWorktree(repoPath, wtPath, "dirty-force-branch", {}, GIT_ENV);

      // Make it dirty
      writeFileSync(join(wtPath, "dirty.txt"), "dirty file");

      const result = removeWorktree(repoPath, wtPath, true, GIT_ENV);
      expect(result.ok).toBe(true);
    });
  });

  describe("listWorktrees", () => {
    it("returns all worktrees with branch info", () => {
      const result = listWorktrees(repoPath, GIT_ENV);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should at least have the main worktree
        expect(result.value.length).toBeGreaterThan(0);
        const main = result.value.find((w) => w.path === repoPath);
        expect(main).toBeDefined();
        if (main) {
          expect(main.branch).toBe("main");
          expect(main.isDetached).toBe(false);
        }
      }
    });
  });
});
