import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type Paths } from "./constants";
import { getStatus } from "./commands/status";
import { listRepos } from "./commands/repo";
import { listWorktrees, addWorktree, removeWorktree } from "./commands/worktree";
import { syncWorkspace } from "./commands/workspace";
import { type AsyncMutex } from "./lib/mutex";

interface McpServerOptions {
  writeLock?: AsyncMutex;
}

function toErrorContent(error: string) {
  return { content: [{ type: "text" as const, text: error }], isError: true };
}

function toJsonContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function createMcpServer(
  workspace: string,
  paths: Paths,
  options?: McpServerOptions,
): McpServer {
  const { writeLock } = options ?? {};
  const server = new McpServer({ name: "dotclaude", version: "1.0.0" });

  // ── Resources ────────────────────────────────────────────────────

  server.registerResource(
    "workspace-status",
    "dotclaude://workspace/status",
    { description: "Current workspace state (name, repo count, worktree count)" },
    async () => {
      const result = await getStatus(workspace, paths);
      if (!result.ok)
        return {
          contents: [
            { uri: "dotclaude://workspace/status", text: JSON.stringify({ error: result.error }) },
          ],
        };
      const { name, repos } = result.value;
      const worktreeCount = repos.reduce((sum, r) => sum + r.worktrees.length, 0);
      const data = { name, repoCount: repos.length, worktreeCount };
      return { contents: [{ uri: "dotclaude://workspace/status", text: JSON.stringify(data) }] };
    },
  );

  server.registerResource(
    "workspace-repos",
    "dotclaude://workspace/repos",
    { description: "Registered repos with paths and status" },
    async () => {
      const result = await listRepos(workspace, paths);
      const data = result.ok ? result.value : [];
      return { contents: [{ uri: "dotclaude://workspace/repos", text: JSON.stringify(data) }] };
    },
  );

  server.registerResource(
    "workspace-worktrees",
    "dotclaude://workspace/worktrees",
    { description: "All worktrees across repos" },
    async () => {
      const reposResult = await listRepos(workspace, paths);
      const repos = reposResult.ok ? reposResult.value : [];
      const all = [];
      for (const repo of repos) {
        const wtResult = await listWorktrees(workspace, repo.name, paths);
        if (wtResult.ok) all.push(...wtResult.value);
      }
      return { contents: [{ uri: "dotclaude://workspace/worktrees", text: JSON.stringify(all) }] };
    },
  );

  server.registerResource(
    "workspace-context",
    "dotclaude://workspace/context",
    { description: "Full workspace context including repos and worktrees" },
    async () => {
      const result = await getStatus(workspace, paths);
      const data = result.ok ? result.value : { error: result.error };
      return { contents: [{ uri: "dotclaude://workspace/context", text: JSON.stringify(data) }] };
    },
  );

  // ── Tools ────────────────────────────────────────────────────────

  server.registerTool(
    "workspace_status",
    { description: "Get current workspace state" },
    async () => {
      const result = await getStatus(workspace, paths);
      if (!result.ok) return toErrorContent(result.error);
      return toJsonContent(result.value);
    },
  );

  server.registerTool(
    "workspace_path",
    { description: "Get the workspace root path" },
    async () => {
      return toJsonContent({ path: paths.workspace(workspace) });
    },
  );

  server.registerTool(
    "workspace_sync",
    { description: "Repair workspace: recreate missing symlinks, prune dangling worktrees" },
    async () => {
      const run = async () => syncWorkspace(workspace, paths);
      const result = await (writeLock ? writeLock.run(run) : run());
      if (!result.ok) return toErrorContent(result.error);
      return toJsonContent(result.value);
    },
  );

  server.registerTool(
    "workspace_add_worktree",
    {
      description: "Create a git worktree for a repo",
      inputSchema: {
        repo: z.string().describe("Repo name"),
        branch: z.string().describe("Branch name"),
        newBranch: z.boolean().optional().describe("Create a new branch"),
        from: z.string().optional().describe("Base branch to create from"),
      },
    },
    async ({ repo, branch, newBranch, from }) => {
      const run = async () => addWorktree(workspace, repo, branch, { newBranch, from }, paths);
      const result = await (writeLock ? writeLock.run(run) : run());
      if (!result.ok) return toErrorContent(result.error);
      return toJsonContent(result.value);
    },
  );

  server.registerTool(
    "workspace_remove_worktree",
    {
      description: "Remove a git worktree",
      inputSchema: {
        repo: z.string().describe("Repo name"),
        slug: z.string().describe("Worktree slug (branch name slugified)"),
        force: z.boolean().optional().describe("Force removal even if branch has changes"),
      },
    },
    async ({ repo, slug, force }) => {
      const run = async () => removeWorktree(workspace, repo, slug, { force }, paths);
      const result = await (writeLock ? writeLock.run(run) : run());
      if (!result.ok) return toErrorContent(result.error);
      return toJsonContent({ ok: true });
    },
  );

  return server;
}
