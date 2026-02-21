import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createTestDir, cleanup } from "../helpers";
import {
  readConfig,
  writeConfig,
  addRepoToConfig,
  removeRepoFromConfig,
  readPoolConfig,
  writePoolConfig,
  addPoolReference,
  removePoolReference,
  getPoolSlugsForWorkspace,
} from "../../lib/config";

describe("config", () => {
  let tempDir: string;
  let wsDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = createTestDir();
    wsDir = join(tempDir, "myws");
    mkdirSync(wsDir, { recursive: true });
    configPath = join(wsDir, "workspace.json");
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("write then read roundtrip", () => {
    const config = { name: "myws", repos: [] };
    writeConfig(configPath, config);
    const result = readConfig(configPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(config);
    }
  });

  it("read non-existent file returns error", () => {
    const result = readConfig(join(tempDir, "nonexistent", "workspace.json"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFIG_NOT_FOUND");
    }
  });

  it("addRepoToConfig appends a repo", () => {
    writeConfig(configPath, { name: "myws", repos: [] });
    const result = addRepoToConfig(configPath, { name: "mrepo", path: "/some/path" });
    expect(result.ok).toBe(true);
    const config = readConfig(configPath);
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.value.repos).toHaveLength(1);
      expect(config.value.repos[0].name).toBe("mrepo");
    }
  });

  it("addRepoToConfig deduplicates by name", () => {
    writeConfig(configPath, { name: "myws", repos: [{ name: "mrepo", path: "/old" }] });
    addRepoToConfig(configPath, { name: "mrepo", path: "/new" });
    const config = readConfig(configPath);
    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.value.repos).toHaveLength(1);
      expect(config.value.repos[0].path).toBe("/new");
    }
  });

  it("removeRepoFromConfig removes a repo", () => {
    writeConfig(configPath, {
      name: "myws",
      repos: [{ name: "mrepo", path: "/p" }],
    });
    const result = removeRepoFromConfig(configPath, "mrepo");
    expect(result.ok).toBe(true);
    const config = readConfig(configPath);
    if (config.ok) {
      expect(config.value.repos).toHaveLength(0);
    }
  });

  it("removeRepoFromConfig handles missing repo gracefully", () => {
    writeConfig(configPath, { name: "myws", repos: [] });
    const result = removeRepoFromConfig(configPath, "nonexistent");
    expect(result.ok).toBe(true);
  });

  it("invalid JSON returns error", () => {
    writeFileSync(configPath, "not json");
    const result = readConfig(configPath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFIG_INVALID");
    }
  });

  it("valid JSON but wrong schema returns error", () => {
    writeFileSync(configPath, JSON.stringify({ wrong: "schema" }));
    const result = readConfig(configPath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFIG_INVALID");
    }
  });
});

describe("pool config", () => {
  let tempDir: string;
  let poolConfigPath: string;

  beforeEach(() => {
    tempDir = createTestDir();
    poolConfigPath = join(tempDir, "worktrees.json");
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("readPoolConfig returns {} when file doesn't exist", () => {
    const result = readPoolConfig(poolConfigPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({});
    }
  });

  it("readPoolConfig returns error on invalid JSON", () => {
    writeFileSync(poolConfigPath, "not json");
    const result = readPoolConfig(poolConfigPath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("POOL_CONFIG_INVALID");
    }
  });

  it("writePoolConfig then readPoolConfig roundtrip", () => {
    const pool = { myrepo: { "feature-x": ["ws1", "ws2"] } };
    writePoolConfig(poolConfigPath, pool);
    const result = readPoolConfig(poolConfigPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(pool);
    }
  });

  it("addPoolReference creates nested structure", () => {
    const result = addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    expect(result.ok).toBe(true);
    const pool = readPoolConfig(poolConfigPath);
    expect(pool.ok).toBe(true);
    if (pool.ok) {
      expect(pool.value.myrepo["feature-x"]).toEqual(["ws1"]);
    }
  });

  it("addPoolReference is idempotent (no duplicate ws entries)", () => {
    addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    const pool = readPoolConfig(poolConfigPath);
    if (pool.ok) {
      expect(pool.value.myrepo["feature-x"]).toEqual(["ws1"]);
    }
  });

  it("addPoolReference adds multiple workspaces", () => {
    addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws2");
    const pool = readPoolConfig(poolConfigPath);
    if (pool.ok) {
      expect(pool.value.myrepo["feature-x"]).toContain("ws1");
      expect(pool.value.myrepo["feature-x"]).toContain("ws2");
    }
  });

  it("removePoolReference returns remaining count", () => {
    addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws2");
    const result = removePoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remaining).toBe(1);
    }
  });

  it("removePoolReference cleans up empty entries (slug, then repo key)", () => {
    addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    removePoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    const pool = readPoolConfig(poolConfigPath);
    if (pool.ok) {
      expect(pool.value.myrepo).toBeUndefined();
    }
  });

  it("removePoolReference on non-existent repo/slug returns { remaining: 0 }", () => {
    const result = removePoolReference(poolConfigPath, "myrepo", "no-slug", "ws1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remaining).toBe(0);
    }
  });

  it("removePoolReference on non-existent workspace in existing entry returns unchanged count", () => {
    addPoolReference(poolConfigPath, "myrepo", "feature-x", "ws1");
    const result = removePoolReference(poolConfigPath, "myrepo", "feature-x", "ws-not-there");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remaining).toBe(1);
    }
  });

  it("getPoolSlugsForWorkspace filters by workspace", () => {
    addPoolReference(poolConfigPath, "myrepo", "feature-a", "ws1");
    addPoolReference(poolConfigPath, "myrepo", "feature-b", "ws1");
    addPoolReference(poolConfigPath, "myrepo", "feature-c", "ws2");
    const result = getPoolSlugsForWorkspace(poolConfigPath, "myrepo", "ws1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain("feature-a");
      expect(result.value).toContain("feature-b");
      expect(result.value).not.toContain("feature-c");
    }
  });

  it("getPoolSlugsForWorkspace returns empty array for unknown repo/workspace", () => {
    const result = getPoolSlugsForWorkspace(poolConfigPath, "unknown-repo", "ws1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});
