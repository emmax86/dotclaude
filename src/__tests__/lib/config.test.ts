import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createTestDir, cleanup } from "../helpers";
import {
  readConfig,
  writeConfig,
  addRepoToConfig,
  removeRepoFromConfig,
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
