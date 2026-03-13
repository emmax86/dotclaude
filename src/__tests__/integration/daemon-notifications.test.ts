import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

import { addRepo } from "../../commands/repo";
import { addWorkspace } from "../../commands/workspace";
import { createPaths } from "../../constants";
import { startDaemon } from "../../lib/daemon";
import { cleanup, createTestDir, createTestGitRepo, GIT_ENV } from "../helpers";

describe("daemon push notifications", () => {
  let tempDir: string;
  let paths: ReturnType<typeof createPaths>;
  let daemonStop: () => Promise<void>;
  let mcpUrl: string;

  beforeEach(async () => {
    tempDir = await createTestDir();
    paths = createPaths(join(tempDir, "workspaces"));
    await addWorkspace("ws", paths);
    const repoPath = await createTestGitRepo(tempDir, "myrepo");
    await addRepo("ws", repoPath, undefined, paths, GIT_ENV);

    const daemon = await startDaemon({
      workspace: "ws",
      paths,
      gracePeriodMs: 1000,
    });
    mcpUrl = daemon.url;
    daemonStop = daemon.stop;
  });

  afterEach(async () => {
    await daemonStop();
    await cleanup(tempDir);
  });

  async function connectClient() {
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);
    return client;
  }

  /** Resolves when the next resourceListChanged notification arrives, rejects on timeout. */
  function waitForNotification(client: Client): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("timed out waiting for resourceListChanged notification")),
        2000,
      );
      client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  it("broadcasts resourceListChanged to all sessions after workspace_add_worktree", async () => {
    const client1 = await connectClient();
    const client2 = await connectClient();

    // Register waits before triggering the mutation
    const notif1 = waitForNotification(client1);
    const notif2 = waitForNotification(client2);

    const result = await client1.callTool({
      name: "workspace_add_worktree",
      arguments: {
        repo: "myrepo",
        branch: "notify-integration",
        newBranch: true,
      },
    });
    expect(result.isError).toBeFalsy();

    await Promise.all([notif1, notif2]);

    await client1.close();
    await client2.close();
  });

  it("broadcasts resourceListChanged after workspace_remove_worktree", async () => {
    const client = await connectClient();

    // Add worktree and wait for its notification before proceeding
    const addNotif = waitForNotification(client);
    await client.callTool({
      name: "workspace_add_worktree",
      arguments: { repo: "myrepo", branch: "to-remove", newBranch: true },
    });
    await addNotif;

    // Watch for the remove notification
    const removeNotif = waitForNotification(client);
    const result = await client.callTool({
      name: "workspace_remove_worktree",
      arguments: { repo: "myrepo", slug: "to-remove" },
    });
    expect(result.isError).toBeFalsy();

    await removeNotif;

    await client.close();
  });
});
