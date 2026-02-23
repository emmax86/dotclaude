import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { createTestDir, cleanup } from "../helpers";
import { detectEcosystem, ECOSYSTEMS } from "../../lib/detect";

describe("detectEcosystem", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTestDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("returns null when no lockfile is present", () => {
    const result = detectEcosystem(tempDir);
    expect(result).toBeNull();
  });

  it("detects bun from bun.lock", () => {
    writeFileSync(join(tempDir, "bun.lock"), "");
    const result = detectEcosystem(tempDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("bun");
  });

  it("detects pnpm from pnpm-lock.yaml", () => {
    writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
    const result = detectEcosystem(tempDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("pnpm");
  });

  it("detects npm from package-lock.json", () => {
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    const result = detectEcosystem(tempDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("npm");
  });

  it("detects uv from uv.lock", () => {
    writeFileSync(join(tempDir, "uv.lock"), "");
    const result = detectEcosystem(tempDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("uv");
  });

  it("bun wins over npm when both lockfiles present (priority order)", () => {
    writeFileSync(join(tempDir, "bun.lock"), "");
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    const result = detectEcosystem(tempDir);
    expect(result!.name).toBe("bun");
  });

  it("bun setup command is array form", () => {
    writeFileSync(join(tempDir, "bun.lock"), "");
    const result = detectEcosystem(tempDir);
    expect(result!.setup).toEqual(["bun", "install"]);
  });

  it("bun format command includes --write and {file} placeholder", () => {
    writeFileSync(join(tempDir, "bun.lock"), "");
    const result = detectEcosystem(tempDir);
    expect(result!.format).toEqual(["bunx", "prettier", "--write", "{file}"]);
  });

  it("bun test command is array form", () => {
    writeFileSync(join(tempDir, "bun.lock"), "");
    const result = detectEcosystem(tempDir);
    expect(result!.test).toEqual(["bun", "test"]);
  });

  it("uv format uses ruff format with {file} placeholder", () => {
    writeFileSync(join(tempDir, "uv.lock"), "");
    const result = detectEcosystem(tempDir);
    expect(result!.format).toEqual(["uv", "run", "ruff", "format", "{file}"]);
  });

  it("uv test uses pytest", () => {
    writeFileSync(join(tempDir, "uv.lock"), "");
    const result = detectEcosystem(tempDir);
    expect(result!.test).toEqual(["uv", "run", "pytest"]);
  });

  it("all ecosystems have name, signal, setup, format, test fields", () => {
    for (const eco of ECOSYSTEMS) {
      expect(typeof eco.name).toBe("string");
      expect(typeof eco.signal).toBe("string");
      expect(Array.isArray(eco.setup)).toBe(true);
      expect(Array.isArray(eco.format)).toBe(true);
      expect(Array.isArray(eco.test)).toBe(true);
    }
  });
});
