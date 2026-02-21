import { writeFileSync } from "node:fs";
import { type Paths } from "../constants";
import { type Result, ok, err } from "../types";
import { readConfig } from "./config";

export function generateVSCodeWorkspace(workspace: string, paths: Paths): Result<void> {
  const configResult = readConfig(paths.workspaceConfig(workspace));
  if (!configResult.ok) {
    if (configResult.code === "CONFIG_NOT_FOUND") {
      return err(`Workspace "${workspace}" not found`, "WORKSPACE_NOT_FOUND");
    }
    return configResult;
  }

  const { repos } = configResult.value;

  const folders = [
    { path: ".", name: `${workspace} (workspace)` },
    ...repos
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ path: `trees/${r.name}`, name: r.name })),
  ];

  const obj = {
    folders,
    settings: {
      "files.exclude": { trees: true },
    },
  };

  try {
    writeFileSync(paths.vscodeWorkspace(workspace), JSON.stringify(obj, null, 2) + "\n");
  } catch (e) {
    return err(String(e), "VSCODE_WORKSPACE_WRITE_FAILED");
  }

  return ok(undefined);
}
