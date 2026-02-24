import { resolve } from "node:path";
import { type Paths } from "../constants";
import { type Result, type ExecResult, ok, err } from "../types";
import {
  type StandardCommand,
  loadCommandConfig,
  resolveCommand,
  spawnCommand,
} from "../lib/commands";
import { detectEcosystem } from "../lib/detect";
import { resolveRepoFromFile } from "../context";
import { readConfig } from "../lib/config";

export type { StandardCommand };

export interface ExecOptions {
  file?: string;
  match?: string;
  repo?: string;
  dryRun?: boolean;
}

export async function execCommand(
  workspace: string,
  command: StandardCommand,
  opts: ExecOptions,
  paths: Paths,
): Promise<Result<ExecResult>> {
  // 1. Resolve workspace config
  const configResult = await readConfig(paths.workspaceConfig(workspace));
  if (!configResult.ok) {
    if (configResult.code === "CONFIG_NOT_FOUND")
      return err(`Workspace "${workspace}" not found`, "WORKSPACE_NOT_FOUND");
    return configResult;
  }

  // 2. Resolve repo + worktree root
  let repo: string;
  let worktreeRoot: string;

  if (opts.repo) {
    const repoEntry = configResult.value.repos.find((r) => r.name === opts.repo);
    if (!repoEntry) {
      return err(
        `Repo "${opts.repo}" not registered in workspace "${workspace}"`,
        "REPO_NOT_FOUND",
      );
    }
    repo = repoEntry.name;
    worktreeRoot = repoEntry.path;
  } else if (opts.file) {
    const resolved = await resolveRepoFromFile(opts.file, workspace, paths);
    if (!resolved.ok) return resolved;
    repo = resolved.value.repo;
    worktreeRoot = resolved.value.worktreeRoot;
  } else {
    return err("No repo or file specified — pass --repo or a file path", "REPO_NOT_RESOLVED");
  }

  // 3. Get main repo path for ecosystem detection (lockfile lives there)
  const repoEntry = configResult.value.repos.find((r) => r.name === repo)!;

  // 4. Detect ecosystem and load config — both from the main repo root
  const ecosystem = detectEcosystem(repoEntry.path);
  const config = await loadCommandConfig(repoEntry.path);

  // 5. Resolve command — resolve file to absolute so it works when cwd ≠ worktreeRoot
  const file = opts.file ? resolve(opts.file) : undefined;
  const cmd = resolveCommand(command, config, ecosystem, { file, match: opts.match });
  if (!cmd) {
    const detail = config
      ? `configured commands: ${Object.keys(config).join(", ") || "none"}`
      : `no .dotclaude/commands.json and no ecosystem signal detected`;
    return err(
      `Command "${command}" is not configured for repo "${repo}". ${detail}`,
      "COMMAND_NOT_CONFIGURED",
    );
  }

  if (opts.dryRun) {
    return ok({ repo, cwd: worktreeRoot, command: cmd, exitCode: 0, stdout: "", stderr: "" });
  }

  // 6. Spawn
  const spawnResult = await spawnCommand(cmd, worktreeRoot);
  return ok({ repo, cwd: worktreeRoot, command: cmd, ...spawnResult });
}
