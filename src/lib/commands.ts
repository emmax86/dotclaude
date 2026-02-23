import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Ecosystem } from "./detect";

export type StandardCommand = "setup" | "format" | "test" | "test:file" | "test:match" | "check";

export interface CommandConfig {
  setup?: string | string[];
  format?: string | string[];
  test?: string | string[];
  "test:file"?: string | string[];
  "test:match"?: string | string[];
  check?: string | string[];
}

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SpawnOptions {
  env?: Record<string, string | undefined>;
}

export async function loadCommandConfig(repoRoot: string): Promise<CommandConfig | null> {
  const configPath = join(repoRoot, ".dotclaude", "commands.json");
  try {
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw) as CommandConfig;
  } catch {
    return null;
  }
}

export function resolveCommand(
  command: StandardCommand,
  config: CommandConfig | null,
  ecosystem: Ecosystem | null,
  opts: { file?: string; match?: string },
): string[] | null {
  const raw = config?.[command];

  let cmd: string[] | null = null;

  if (raw !== undefined) {
    // Config takes precedence
    if (typeof raw === "string") {
      // String form: run via shell (supports && etc.)
      cmd = ["sh", "-c", raw];
    } else {
      cmd = raw.slice();
    }
  } else if (ecosystem) {
    // Auto-detect from ecosystem
    if (command === "setup") cmd = ecosystem.setup.slice();
    else if (command === "format") cmd = ecosystem.format.slice();
    else if (command === "test") cmd = ecosystem.test.slice();
    // test:file, test:match, check are not auto-detected
  }

  if (!cmd) return null;

  // Substitute {file} and {match} placeholders — each replaces exactly one array element
  return cmd.map((arg) => {
    if (arg === "{file}" && opts.file !== undefined) return opts.file;
    if (arg === "{match}" && opts.match !== undefined) return opts.match;
    return arg;
  });
}

export async function spawnCommand(
  cmd: string[],
  cwd: string,
  options?: SpawnOptions,
): Promise<SpawnResult> {
  process.stderr.write(`[exec] $ ${cmd.join(" ")}\n`);

  const proc = Bun.spawn(cmd, {
    cwd,
    env: options?.env ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode: exitCode ?? 1, stdout, stderr };
}
