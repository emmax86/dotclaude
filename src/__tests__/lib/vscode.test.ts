import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createTestDir, cleanup } from "../helpers";
import { createPaths } from "../../constants";
import { writeConfig } from "../../lib/config";
import { generateVSCodeWorkspace } from "../../lib/vscode";

describe("generateVSCodeWorkspace", () => {
  let tempDir: string;
  let paths: ReturnType<typeof createPaths>;

  beforeEach(() => {
    tempDir = createTestDir();
    paths = createPaths(join(tempDir, "workspaces"));
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  function setupWorkspace(ws: string, repos: { name: string; path: string }[] = []) {
    mkdirSync(paths.workspace(ws), { recursive: true });
    writeConfig(paths.workspaceConfig(ws), { name: ws, repos });
  }

  it("generates .code-workspace with root folder only for empty workspace", () => {
    setupWorkspace("alpha");
    const result = generateVSCodeWorkspace("alpha", paths);
    expect(result.ok).toBe(true);

    const filePath = paths.vscodeWorkspace("alpha");
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(content.folders).toHaveLength(1);
    expect(content.folders[0].path).toBe(".");
    expect(content.folders[0].name).toBe("alpha (workspace)");
    expect(content.settings["files.exclude"].trees).toBe(true);
  });

  it("generates .code-workspace with repo folder entry", () => {
    setupWorkspace("alpha", [{ name: "myapp", path: "/some/path" }]);
    const result = generateVSCodeWorkspace("alpha", paths);
    expect(result.ok).toBe(true);

    const content = JSON.parse(readFileSync(paths.vscodeWorkspace("alpha"), "utf-8"));
    expect(content.folders).toHaveLength(2);
    expect(content.folders[0]).toEqual({ path: ".", name: "alpha (workspace)" });
    expect(content.folders[1]).toEqual({ path: "trees/myapp", name: "myapp" });
  });

  it("sorts repo folders alphabetically", () => {
    setupWorkspace("alpha", [
      { name: "zebra", path: "/p" },
      { name: "apple", path: "/p" },
      { name: "mango", path: "/p" },
    ]);
    const result = generateVSCodeWorkspace("alpha", paths);
    expect(result.ok).toBe(true);

    const content = JSON.parse(readFileSync(paths.vscodeWorkspace("alpha"), "utf-8"));
    expect(content.folders[0].path).toBe(".");
    expect(content.folders[1].name).toBe("apple");
    expect(content.folders[2].name).toBe("mango");
    expect(content.folders[3].name).toBe("zebra");
  });

  it("overwrites existing .code-workspace on regeneration", () => {
    setupWorkspace("alpha");
    // Write a file with extra keys
    writeFileSync(
      paths.vscodeWorkspace("alpha"),
      JSON.stringify({ folders: [], settings: {}, extraKey: "should-be-gone" }, null, 2) + "\n",
    );

    const result = generateVSCodeWorkspace("alpha", paths);
    expect(result.ok).toBe(true);

    const content = JSON.parse(readFileSync(paths.vscodeWorkspace("alpha"), "utf-8"));
    expect((content as Record<string, unknown>).extraKey).toBeUndefined();
    expect(content.folders).toHaveLength(1);
  });

  it("returns error for non-existent workspace", () => {
    const result = generateVSCodeWorkspace("ghost", paths);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("WORKSPACE_NOT_FOUND");
    }
  });
});
