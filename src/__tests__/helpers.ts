import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function createTestDir(): string {
  // realpathSync resolves macOS /var -> /private/var symlink so paths match git output
  return realpathSync(mkdtempSync(join(tmpdir(), "grove-test-")));
}

export async function createTestGitRepo(
  dir: string,
  name: string,
  defaultBranch = "main",
): Promise<string> {
  const repoPath = join(dir, name);
  mkdirSync(repoPath, { recursive: true });

  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    HOME: dir,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@test.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@test.com",
  };

  const run = (args: string[]) => {
    const result = Bun.spawnSync(args, { cwd: repoPath, env });
    if (!result.success) {
      throw new Error(`git ${args.join(" ")} failed: ${new TextDecoder().decode(result.stderr)}`);
    }
    return new TextDecoder().decode(result.stdout).trim();
  };

  run(["git", "init", "-b", defaultBranch]);
  run(["git", "config", "user.email", "test@test.com"]);
  run(["git", "config", "user.name", "Test"]);

  // Create initial commit so HEAD is valid
  const readmePath = join(repoPath, "README.md");
  await Bun.write(readmePath, `# ${name}\n`);
  run(["git", "add", "."]);
  run(["git", "commit", "-m", "Initial commit"]);

  return repoPath;
}

export function cleanup(...dirs: string[]): void {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export const GIT_ENV = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@test.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@test.com",
};
