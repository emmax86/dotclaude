import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(import.meta.dir, "../../cli.ts");

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json?: Record<string, unknown>;
}

export function runCLI(
  args: string[],
  options: { cwd?: string; root?: string; pwd?: string; env?: Record<string, string> } = {},
): RunResult {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    GROVE_ROOT: options.root ?? "",
    // PWD lets context inference use the logical (symlink-preserving) path.
    // Falls back to cwd if not explicitly overridden.
    PWD: options.pwd ?? options.cwd ?? "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@test.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@test.com",
    ...options.env,
  };

  const result = Bun.spawnSync(["bun", "run", CLI, ...args], {
    cwd: options.cwd,
    env,
  });

  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();
  const exitCode = result.exitCode ?? 0;

  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(stdout);
  } catch {
    /* not JSON */
  }

  return { stdout, stderr, exitCode, json };
}

export function createTempRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "grove-e2e-")));
}

export function cleanupTempRoot(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** Create a minimal git repo with an initial commit and return its path. */
export function createGitRepo(parentDir: string, name: string, defaultBranch = "main"): string {
  const repoPath = join(parentDir, name);
  mkdirSync(repoPath, { recursive: true });

  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: parentDir,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@test.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@test.com",
  };

  const run = (args: string[]) => {
    const r = Bun.spawnSync(args, { cwd: repoPath, env });
    if (!r.success) {
      throw new Error(`git ${args.join(" ")} failed: ${new TextDecoder().decode(r.stderr)}`);
    }
  };

  run(["git", "init", "-b", defaultBranch]);
  run(["git", "config", "user.email", "test@test.com"]);
  run(["git", "config", "user.name", "Test"]);
  writeFileSync(join(repoPath, "README.md"), `# ${name}\n`);
  run(["git", "add", "."]);
  run(["git", "commit", "-m", "Initial commit"]);

  return repoPath;
}
