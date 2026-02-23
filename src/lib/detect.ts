import { existsSync } from "node:fs";
import { join } from "node:path";

export interface Ecosystem {
  name: string;
  signal: string;
  setup: string[];
  format: string[];
  test: string[];
}

export const ECOSYSTEMS: Ecosystem[] = [
  {
    name: "bun",
    signal: "bun.lock",
    setup: ["bun", "install"],
    format: ["bunx", "prettier", "--write"],
    test: ["bun", "test"],
  },
  {
    name: "pnpm",
    signal: "pnpm-lock.yaml",
    setup: ["pnpm", "install"],
    format: ["pnpm", "exec", "prettier", "--write"],
    test: ["pnpm", "test"],
  },
  {
    name: "npm",
    signal: "package-lock.json",
    setup: ["npm", "install"],
    format: ["npx", "prettier", "--write"],
    test: ["npm", "test"],
  },
  {
    name: "uv",
    signal: "uv.lock",
    setup: ["uv", "sync"],
    format: ["uv", "run", "ruff", "format"],
    test: ["uv", "run", "pytest"],
  },
];

export function detectEcosystem(repoRoot: string): Ecosystem | null {
  for (const eco of ECOSYSTEMS) {
    if (existsSync(join(repoRoot, eco.signal))) {
      return eco;
    }
  }
  return null;
}
