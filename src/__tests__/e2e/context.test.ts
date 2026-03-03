import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { cleanupTempRoot, createGitRepo, createTempRoot, runCLI } from "./helpers";

describe("E2E: context inference via cwd", () => {
  let root: string;
  let repoPath: string;

  beforeEach(async () => {
    root = await createTempRoot();
    [repoPath] = await Promise.all([
      createGitRepo(root, "myrepo"),
      runCLI(["ws", "add", "myws"], { root }),
    ]);
    await runCLI(["ws", "repo", "add", "myws", repoPath], { root });
    await runCLI(["ws", "worktree", "add", "myrepo", "feature/ctx", "--new"], {
      root,
      cwd: join(root, "myws"),
    });
  });

  afterEach(() => {
    cleanupTempRoot(root);
  });

  it("workspace inferred from cwd at workspace root", async () => {
    const r = await runCLI(["ws", "repo", "list"], {
      root,
      cwd: join(root, "myws"),
    });
    expect(r.exitCode).toBe(0);
    const data = r.json?.data as Array<{ name: string }>;
    expect(data.map((r) => r.name)).toContain("myrepo");
  });

  it("workspace and repo inferred from cwd inside repo dir", async () => {
    const r = await runCLI(["ws", "worktree", "list"], {
      root,
      cwd: join(root, "myws", "trees", "myrepo"),
    });
    expect(r.exitCode).toBe(0);
    const data = r.json?.data as Array<{ slug: string }>;
    expect(data.map((w) => w.slug)).toContain("feature-ctx");
  });

  it("workspace inferred from cwd inside pool worktree (via symlink)", async () => {
    // The symlink at {ws}/trees/{repo}/{slug} points into the pool.
    // Logical cwd traversal should find workspace.json in myws.
    const wtLink = join(root, "myws", "trees", "myrepo", "feature-ctx");
    const r = await runCLI(["ws", "repo", "list"], { root, cwd: wtLink });
    expect(r.exitCode).toBe(0);
    const data = r.json?.data as Array<{ name: string }>;
    expect(data.map((r) => r.name)).toContain("myrepo");
  });

  it("ws status inferred from cwd", async () => {
    const r = await runCLI(["ws", "status"], { root, cwd: join(root, "myws") });
    expect(r.exitCode).toBe(0);
    const data = r.json?.data as Record<string, unknown>;
    expect(data.name).toBe("myws");
  });

  it("explicit arg overrides cwd context", async () => {
    await runCLI(["ws", "add", "otherws"], { root });
    // cwd is myws but we explicitly pass otherws
    const r = await runCLI(["ws", "repo", "list", "otherws"], {
      root,
      cwd: join(root, "myws"),
    });
    expect(r.exitCode).toBe(0);
    // otherws has no repos
    const data = r.json?.data as Array<unknown>;
    expect(data).toHaveLength(0);
  });
});

describe("E2E: ws status", () => {
  let root: string;
  let repoPath: string;

  beforeEach(async () => {
    root = await createTempRoot();
    [repoPath] = await Promise.all([
      createGitRepo(root, "myrepo"),
      runCLI(["ws", "add", "myws"], { root }),
    ]);
    await runCLI(["ws", "repo", "add", "myws", repoPath], { root });
  });

  afterEach(() => {
    cleanupTempRoot(root);
  });

  it("ws status returns workspace overview with repos and worktrees", async () => {
    await runCLI(["ws", "worktree", "add", "myrepo", "feature/s", "--new"], {
      root,
      cwd: join(root, "myws"),
    });
    const r = await runCLI(["ws", "status", "myws"], { root });
    expect(r.exitCode).toBe(0);
    const data = r.json?.data as Record<string, unknown>;
    expect(data.name).toBe("myws");
    const repos = data.repos as Array<Record<string, unknown>>;
    expect(repos.length).toBeGreaterThan(0);
    const worktrees = repos[0].worktrees as Array<{ slug: string }>;
    expect(worktrees.map((w) => w.slug)).toContain("feature-s");
  });
});
