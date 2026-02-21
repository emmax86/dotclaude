import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

  it("add creates repo dir and default branch symlink", () => {
    const result = addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    // repos/myrepo symlink exists
    expect(existsSync(paths.repoEntry("myrepo"))).toBe(true);
    expect(lstatSync(paths.repoEntry("myrepo")).isSymbolicLink()).toBe(true);

    // {workspace}/trees/myrepo is a directory
    const repoDir = paths.repoDir("myws", "myrepo");
    expect(existsSync(repoDir)).toBe(true);
    expect(lstatSync(repoDir).isDirectory()).toBe(true);
    expect(lstatSync(repoDir).isSymbolicLink()).toBe(false);

    // {workspace}/trees/myrepo/main symlink points to ../../../repos/myrepo
    const defaultSlugPath = join(repoDir, "main");
    expect(lstatSync(defaultSlugPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(defaultSlugPath)).toBe("../../../repos/myrepo");
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
    // repo dir under trees/ uses the override name
    expect(existsSync(paths.repoDir("myws", "customname"))).toBe(true);
    expect(lstatSync(paths.repoDir("myws", "customname")).isDirectory()).toBe(true);
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

    // Each workspace has its own trees/myrepo directory
    expect(lstatSync(paths.repoDir("myws", "myrepo")).isDirectory()).toBe(true);
    expect(lstatSync(paths.repoDir("otherws", "myrepo")).isDirectory()).toBe(true);

    // Both workspaces have their own default branch symlinks
    const ws1Link = join(paths.repoDir("myws", "myrepo"), "main");
    const ws2Link = join(paths.repoDir("otherws", "myrepo"), "main");
    expect(lstatSync(ws1Link).isSymbolicLink()).toBe(true);
    expect(lstatSync(ws2Link).isSymbolicLink()).toBe(true);
  });

  it("add rejects reserved repo name 'trees'", () => {
    const result = addRepo("myws", repoPath, "trees", paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESERVED_NAME");
    }
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

  it("add is idempotent for same repo and workspace", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    const result = addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    // Still only one entry in config
    const list = listRepos("myws", paths);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.filter((r) => r.name === "myrepo").length).toBe(1);
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

    // Repo dir under trees/ is removed
    expect(existsSync(paths.repoDir("myws", "myrepo"))).toBe(false);
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

  it("remove succeeds when repo dir is already missing", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    // Manually remove the repo dir before calling removeRepo
    rmSync(paths.repoDir("myws", "myrepo"), { recursive: true });
    const result = removeRepo("myws", "myrepo", {}, paths, GIT_ENV);
    expect(result.ok).toBe(true);
  });

  it("addRepo updates .code-workspace with repo folder", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    const content = JSON.parse(
      require("node:fs").readFileSync(paths.vscodeWorkspace("myws"), "utf-8"),
    );
    expect(content.folders).toHaveLength(2);
    expect(content.folders[1]).toEqual({ path: "trees/myrepo", name: "myrepo" });
  });

  it("removeRepo removes repo from .code-workspace", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    removeRepo("myws", "myrepo", {}, paths, GIT_ENV);
    const content = JSON.parse(
      require("node:fs").readFileSync(paths.vscodeWorkspace("myws"), "utf-8"),
    );
    expect(content.folders).toHaveLength(1);
    expect(content.folders[0].path).toBe(".");
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

  it("remove refuses if pool worktrees exist without --force", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "myrepo", "feature/pool", { newBranch: true }, paths, GIT_ENV);

    const result = removeRepo("myws", "myrepo", {}, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("REPO_HAS_WORKTREES");
    }
  });

  it("remove --force cleans up pool worktree", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "myrepo", "feature/pool", { newBranch: true }, paths, GIT_ENV);

    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-pool");
    expect(existsSync(poolEntry)).toBe(true);

    const result = removeRepo("myws", "myrepo", { force: true }, paths, GIT_ENV);
    expect(result.ok).toBe(true);
    expect(existsSync(paths.repoDir("myws", "myrepo"))).toBe(false);
    // Pool entry removed since last reference
    expect(existsSync(poolEntry)).toBe(false);
  });

  it("remove --force with shared pool worktree preserves pool entry for other workspace", () => {
    addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    addWorkspace("otherws", paths);
    addRepo("otherws", repoPath, undefined, paths, GIT_ENV);
    addWorktree("myws", "myrepo", "feature/shared", { newBranch: true }, paths, GIT_ENV);
    addWorktree("otherws", "myrepo", "feature/shared", {}, paths, GIT_ENV);

    const poolEntry = paths.worktreePoolEntry("myrepo", "feature-shared");

    // Remove from myws — pool entry should persist for otherws
    const result = removeRepo("myws", "myrepo", { force: true }, paths, GIT_ENV);
    expect(result.ok).toBe(true);

    // Pool entry persists
    expect(existsSync(poolEntry)).toBe(true);

    // otherws symlink intact
    expect(
      lstatSync(paths.worktreeDir("otherws", "myrepo", "feature-shared")).isSymbolicLink(),
    ).toBe(true);
  });

  it("addRepo rollback: cleans up repoDir and wsTreeEntry when getDefaultBranch fails", () => {
    // Create a repo and put HEAD in detached state so symbolic-ref fails
    const detachedRepoPath = join(tempDir, "detached-repo");
    mkdirSync(detachedRepoPath, { recursive: true });
    const env = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: tempDir,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@test.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@test.com",
    };
    Bun.spawnSync(["git", "init", "-b", "main", detachedRepoPath], { env });
    Bun.spawnSync(["git", "-C", detachedRepoPath, "config", "user.email", "test@test.com"], {
      env,
    });
    Bun.spawnSync(["git", "-C", detachedRepoPath, "config", "user.name", "Test"], { env });
    writeFileSync(join(detachedRepoPath, "README"), "x");
    Bun.spawnSync(["git", "-C", detachedRepoPath, "add", "."], { env });
    Bun.spawnSync(["git", "-C", detachedRepoPath, "commit", "-m", "init"], { env });
    // Detach HEAD — symbolic-ref will now fail
    const shaResult = Bun.spawnSync(["git", "-C", detachedRepoPath, "rev-parse", "HEAD"], { env });
    const sha = new TextDecoder().decode(shaResult.stdout).trim();
    writeFileSync(join(detachedRepoPath, ".git", "HEAD"), sha + "\n");

    const result = addRepo("myws", detachedRepoPath, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("GIT_DEFAULT_BRANCH_ERROR");
    }

    // Verify cleanup: repo dir should not exist
    expect(existsSync(paths.repoDir("myws", "detached-repo"))).toBe(false);
  });

  it("addRepo rollback: cleans up on config write failure", () => {
    // Write invalid JSON to workspace.json so addRepoToConfig fails
    writeFileSync(paths.workspaceConfig("myws"), "not-valid-json");

    const result = addRepo("myws", repoPath, undefined, paths, GIT_ENV);
    expect(result.ok).toBe(false);

    // Cleanup should have removed the repo dir
    expect(existsSync(paths.repoDir("myws", "myrepo"))).toBe(false);
  });

  it("addRepo rejects empty name", () => {
    const result = addRepo("myws", repoPath, "", paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_NAME");
    }
  });

  it("addRepo rejects name with path separator", () => {
    const result = addRepo("myws", repoPath, "a/b", paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_NAME");
    }
  });

  it("addRepo rejects name with double-dot traversal", () => {
    const result = addRepo("myws", repoPath, "a..b", paths, GIT_ENV);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_NAME");
    }
  });
});
