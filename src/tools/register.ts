// Every tool the server exposes, in one place, so the server and the token-budget test match.
// HETZNER_MCP_TOOLS=lean skips the 27 list shortcuts; cloud_request GET covers the same reads.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HetznerConfig } from "../config.js";
import { registerGenericTools } from "./generic.js";
import { registerReadTools } from "./resources.js";
import { registerWriteTools } from "./write.js";
import { registerCloudWriteTools } from "./write-cloud.js";
import { registerContributeTool } from "./contribute.js";
import { registerMapTool } from "./map.js";
import { registerAuditTool } from "./audit.js";
import { registerCapacityTool } from "./capacity.js";
import { registerSpendTool } from "./spend.js";

export function isLean(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HETZNER_MCP_TOOLS === "lean";
}

export function registerAllTools(server: McpServer, cfg: HetznerConfig, env: NodeJS.ProcessEnv = process.env): void {
  registerGenericTools(server, cfg);
  if (!isLean(env)) registerReadTools(server, cfg);
  // Lean relies on the raw request tools for reads. A read-only server has no robot_request,
  // so it keeps the Robot read tools even in lean, or Robot could not be read at all.
  else if (cfg.readOnly !== false) registerReadTools(server, cfg, { robotOnly: true });
  // A read-only server lists no tool that could send a write (the gate in hetznerRequest
  // would refuse it anyway). Only readOnly === false offers them.
  if (cfg.readOnly === false) {
    registerWriteTools(server, cfg);
    registerCloudWriteTools(server, cfg);
  }
  registerContributeTool(server);
  registerMapTool(server, cfg);
  registerAuditTool(server, cfg);
  registerCapacityTool(server, cfg);
  registerSpendTool(server, cfg);
}
