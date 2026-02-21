#!/usr/bin/env bun
import { createPaths, DEFAULT_WORKSPACES_ROOT } from "./constants";
import { inferContext } from "./context";
import { addWorkspace, listWorkspaces, removeWorkspace, syncWorkspace } from "./commands/workspace";
import { addRepo, listRepos, removeRepo } from "./commands/repo";
import { addWorktree, listWorktrees, removeWorktree } from "./commands/worktree";
import { getStatus } from "./commands/status";
import { type Result, ok } from "./types";

// ---- Output helpers ----

function output(result: Result<unknown>, porcelain: boolean, formatFn?: (val: unknown) => string) {
  if (result.ok) {
    if (porcelain && formatFn) {
      process.stdout.write(formatFn(result.value));
    } else {
      console.log(JSON.stringify({ ok: true, data: result.value }));
    }
  } else {
    process.stderr.write(
      JSON.stringify({ ok: false, error: result.error, code: result.code }) + "\n",
    );
    process.exit(1);
  }
}

function formatWorkspaceList(val: unknown): string {
  const list = val as Array<{ name: string }>;
  return list.map((w) => w.name).join("\n") + (list.length ? "\n" : "");
}

function formatRepoList(val: unknown): string {
  const list = val as Array<{ name: string; path: string; status: string }>;
  return (
    list.map((r) => `${r.name}\t${r.path}\t${r.status}`).join("\n") + (list.length ? "\n" : "")
  );
}

function formatWorktreeList(val: unknown): string {
  const list = val as Array<{ repo: string; slug: string; branch: string; type: string }>;
  return (
    list.map((w) => `${w.repo}\t${w.slug}\t${w.branch}\t${w.type}`).join("\n") +
    (list.length ? "\n" : "")
  );
}

// ---- Arg parsing ----
// Flat parse: extract all --flags and all positional args from the full argv

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>; // --flag or --flag value
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      // If next arg is not a flag, consume it as the value
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

function flag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags.has(name);
}

function flagValue(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.flags.get(name);
  return typeof v === "string" ? v : undefined;
}

// ---- Main ----

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error("Usage: dotclaude <ws|workspaces> <subcommand> [args...]");
    process.exit(1);
  }

  const root = process.env.DOTCLAUDE_ROOT ?? DEFAULT_WORKSPACES_ROOT;
  const paths = createPaths(root);
  const ctx = inferContext(process.env.PWD ?? process.cwd(), root);

  // argv[0] = cmd (ws/workspaces), argv[1] = subcommand
  const cmd = argv[0];
  if (cmd !== "workspaces" && cmd !== "ws") {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }

  const subcmd = argv[1];
  if (!subcmd) {
    console.error("Usage: dotclaude ws <add|list|remove|repo|worktree|status|path|sync>");
    process.exit(1);
  }

  // Parse everything after the subcommand
  const parsed = parseArgs(argv.slice(2));
  const porcelain = flag(parsed, "porcelain");

  switch (subcmd) {
    case "add": {
      const name = parsed.positional[0];
      if (!name) {
        console.error("Usage: dotclaude ws add <name>");
        process.exit(1);
      }
      output(addWorkspace(name, paths), porcelain);
      break;
    }

    case "list": {
      output(listWorkspaces(paths), porcelain, formatWorkspaceList);
      break;
    }

    case "remove": {
      const name = parsed.positional[0] ?? ctx.workspace;
      if (!name) {
        console.error("Usage: dotclaude ws remove <name>");
        process.exit(1);
      }
      output(removeWorkspace(name, { force: flag(parsed, "force") }, paths), porcelain);
      break;
    }

    case "repo": {
      const repoSubcmd = parsed.positional[0];
      const repoArgs = parsed.positional.slice(1);

      switch (repoSubcmd) {
        case "add": {
          // [workspace] <path> [--name override]
          let workspace: string;
          let repoPath: string;
          if (repoArgs.length >= 2) {
            workspace = repoArgs[0];
            repoPath = repoArgs[1];
          } else {
            workspace = ctx.workspace ?? "";
            repoPath = repoArgs[0];
          }
          if (!workspace || !repoPath) {
            console.error("Usage: dotclaude ws repo add [workspace] <path> [--name override]");
            process.exit(1);
          }
          output(addRepo(workspace, repoPath, flagValue(parsed, "name"), paths), porcelain);
          break;
        }

        case "list": {
          const workspace = repoArgs[0] ?? ctx.workspace;
          if (!workspace) {
            console.error("Usage: dotclaude ws repo list [workspace]");
            process.exit(1);
          }
          output(listRepos(workspace, paths), porcelain, formatRepoList);
          break;
        }

        case "remove": {
          let workspace: string;
          let repoName: string;
          if (repoArgs.length >= 2) {
            workspace = repoArgs[0];
            repoName = repoArgs[1];
          } else {
            workspace = ctx.workspace ?? "";
            repoName = repoArgs[0];
          }
          if (!workspace || !repoName) {
            console.error("Usage: dotclaude ws repo remove [workspace] <name>");
            process.exit(1);
          }
          output(
            removeRepo(workspace, repoName, { force: flag(parsed, "force") }, paths),
            porcelain,
          );
          break;
        }

        default:
          console.error(`Unknown repo subcommand: ${repoSubcmd}`);
          process.exit(1);
      }
      break;
    }

    case "worktree": {
      const wtSubcmd = parsed.positional[0];
      const wtArgs = parsed.positional.slice(1);

      switch (wtSubcmd) {
        case "add": {
          // [repo] <branch> [--from base] [--new]
          let repo: string;
          let branch: string;
          if (wtArgs.length >= 2) {
            repo = wtArgs[0];
            branch = wtArgs[1];
          } else {
            repo = ctx.repo ?? "";
            branch = wtArgs[0];
          }
          const workspace = ctx.workspace ?? "";
          if (!workspace || !repo || !branch) {
            console.error("Usage: dotclaude ws worktree add [repo] <branch> [--from base] [--new]");
            process.exit(1);
          }
          output(
            addWorktree(
              workspace,
              repo,
              branch,
              {
                newBranch: flag(parsed, "new"),
                from: flagValue(parsed, "from"),
              },
              paths,
            ),
            porcelain,
          );
          break;
        }

        case "list": {
          const workspace = ctx.workspace ?? "";
          const repo = wtArgs[0] ?? ctx.repo;
          if (!workspace || !repo) {
            console.error("Usage: dotclaude ws worktree list [repo]");
            process.exit(1);
          }
          output(listWorktrees(workspace, repo, paths), porcelain, formatWorktreeList);
          break;
        }

        case "remove": {
          const workspace = ctx.workspace ?? "";
          let repo: string;
          let slug: string;
          if (wtArgs.length >= 2) {
            repo = wtArgs[0];
            slug = wtArgs[1];
          } else {
            repo = ctx.repo ?? "";
            slug = wtArgs[0];
          }
          if (!workspace || !repo || !slug) {
            console.error("Usage: dotclaude ws worktree remove [repo] <slug> [--force]");
            process.exit(1);
          }
          output(
            removeWorktree(workspace, repo, slug, { force: flag(parsed, "force") }, paths),
            porcelain,
          );
          break;
        }

        default:
          console.error(`Unknown worktree subcommand: ${wtSubcmd}`);
          process.exit(1);
      }
      break;
    }

    case "status": {
      const workspace = parsed.positional[0] ?? ctx.workspace;
      if (!workspace) {
        console.error("Usage: dotclaude ws status [workspace]");
        process.exit(1);
      }
      output(getStatus(workspace, paths), porcelain);
      break;
    }

    case "sync": {
      const workspace = parsed.positional[0] ?? ctx.workspace;
      if (!workspace) {
        console.error("Usage: dotclaude ws sync [workspace]");
        process.exit(1);
      }
      output(syncWorkspace(workspace, paths), porcelain);
      break;
    }

    case "path": {
      const workspace = parsed.positional[0] ?? ctx.workspace;
      if (!workspace) {
        console.error("Usage: dotclaude ws path [workspace]");
        process.exit(1);
      }
      output(ok({ path: paths.workspace(workspace) }), porcelain, (val) => {
        const { path } = val as { path: string };
        return path + "\n";
      });
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcmd}`);
      process.exit(1);
  }
}

main();
