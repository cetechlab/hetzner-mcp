/**
 * Generic per-surface request tools. These give complete coverage of every Hetzner
 * endpoint, including ones without a curated wrapper, while still enforcing the
 * read-only and cost guards.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READ_ONLY_REFUSAL, type HetznerConfig, type SurfaceName } from "../config.js";
import { hetznerRequest } from "../http.js";
import { classifyCost, classifyDestructive, cloudServerPriceNote, normalizeCostPath } from "../cost.js";
import { isWrite, normalizeMethod } from "../security.js";
import { redactFields, resultBlocks } from "../format.js";
import { waitForActions, actionBlocks, anyActionFailed } from "../actions.js";
import { HetznerApiError } from "../errors.js";
import { oneLine } from "../text.js";

// Only messages we wrote go back to the model; anything else could echo input or a secret.
function errorText(err: unknown): string {
  if (err instanceof HetznerApiError) return `Error: ${oneLine(err.message, 300)}`;
  if (err instanceof Error && /^(path |unsupported HTTP method)/.test(err.message)) return `Error: ${oneLine(err.message, 160)}`;
  return "Error: the request failed before Hetzner answered.";
}

interface ToolText {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function textResult(value: unknown, isError = false): ToolText {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return { content: [{ type: "text", text }], isError };
}

const CONTRIBUTE_HINT =
  "If an endpoint you need is missing or misbehaving, use the contribute_or_report tool to open a prefilled issue or pull request.";

const SURFACE_LABEL: Record<SurfaceName, string> = {
  cloud: "Hetzner Cloud (api.hetzner.cloud)",
  storagebox: "Hetzner Storage Box (api.hetzner.com)",
  robot: "Hetzner Robot dedicated servers (robot-ws.your-server.de)",
};

const requestShape = {
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("HTTP method. Defaults to GET."),
  path: z.string().min(1).describe("Relative API path, for example /servers or /servers/123."),
  query: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Query string parameters."),
  body: z
    .union([z.record(z.string(), z.unknown()), z.string()])
    .optional()
    .describe(
      "Request body for write methods, as a JSON object, for example " +
        '{"name":"web1","type":"spread"}. A JSON string is also accepted and parsed.',
    ),
  confirm: z
    .boolean()
    .optional()
    .describe("Must be true to create a billed resource. Reads and free resources do not need it."),
  verbose: z
    .boolean()
    .optional()
    .describe("Return the full payload. Default false returns a compact, token-efficient view."),
};

// The GET form a read-only server offers: no write methods, no body, no confirm. Its arguments
// are a subset of the full form, so the one handler below serves both.
const getOnlyShape = {
  method: z.enum(["GET"]).optional().describe("HTTP method. Only GET: the server is read-only."),
  path: requestShape.path,
  query: requestShape.query,
  verbose: requestShape.verbose,
} as unknown as typeof requestShape;

function registerOne(server: McpServer, cfg: HetznerConfig, surface: SurfaceName, getOnly = false): void {
  server.registerTool(
    `${surface}_request`,
    {
      title: `${surface} raw request`,
      description: getOnly
        ? `Read any ${SURFACE_LABEL[surface]} endpoint with GET. Use a relative path like /servers. ` +
          `The server is read-only, so no other method is offered. ${CONTRIBUTE_HINT}`
        : `Call any ${SURFACE_LABEL[surface]} endpoint directly. Use a relative path like /servers. ` +
          `Reads are free. Writes obey the read-only and cost guards. ${CONTRIBUTE_HINT}`,
      inputSchema: getOnly ? getOnlyShape : requestShape,
    },
    async (args) => {
      try {
        const method = normalizeMethod(args.method);
        // Accept a JSON string body and parse it to an object, so any MCP client
        // works whether it forwards the body as an object or a JSON string.
        let bodyVal: unknown = args.body;
        if (typeof bodyVal === "string") {
          const trimmed = bodyVal.trim();
          if (trimmed.length > 0) {
            try {
              bodyVal = JSON.parse(trimmed);
            } catch {
              return textResult(
                `Error: the body was a string but not valid JSON. Pass a JSON object, for example {"name":"web1"}.`,
                true,
              );
            }
          }
        }
        if (isWrite(method) && cfg.readOnly) {
          return textResult(
            READ_ONLY_REFUSAL,
            true,
          );
        }
        if (isWrite(method)) {
          const cost = classifyCost(surface, method, args.path);
          if (cost.billed) {
            if (!cfg.allowBilled) {
              return textResult(
                `Blocked. Billed creation is disabled. Set HETZNER_MCP_ALLOW_BILLED=1 to allow billed creates with confirm. ${cost.reason}.`,
                true,
              );
            }
            if (args.confirm !== true) {
              let note = "";
              if (surface === "cloud" && normalizeCostPath(args.path) === "/servers") {
                const body = bodyVal as { server_type?: string } | undefined;
                const priced = await cloudServerPriceNote(cfg, body?.server_type);
                if (priced) note = " " + priced;
              }
              return textResult(
                `COST GUARD. ${cost.reason}. This costs money. Re-run with confirm set to true to proceed.${note}`,
                true,
              );
            }
          }
          const destructive = classifyDestructive(method, args.path, bodyVal);
          if (destructive.destructive && args.confirm !== true) {
            return textResult(
              `DESTRUCTIVE GUARD. ${destructive.reason}. Re-run with confirm set to true to proceed.`,
              true,
            );
          }
        }
        const result = await hetznerRequest(cfg, {
          surface,
          method,
          path: args.path,
          query: args.query,
          body: bodyVal,
        });
        const actions = surface === "cloud" && isWrite(method) ? await waitForActions(cfg, result) : [];
        // A Robot read can return rescue and install passwords (GET /boot/{n}). A read never
        // needs them; a write that sets one (POST /boot/{n}/rescue) still shows it once.
        const shown = surface === "robot" && !isWrite(method) ? redactFields(result) : result;
        return {
          content: [...resultBlocks(shown, args.verbose ?? false), ...actionBlocks(actions)],
          isError: anyActionFailed(actions),
        };
      } catch (err) {
        return textResult(errorText(err), true);
      }
    },
  );
}

export function registerGenericTools(server: McpServer, cfg: HetznerConfig): void {
  // Fail-closed like the gate in hetznerRequest: only readOnly === false offers writes.
  const readOnly = cfg.readOnly !== false;
  registerOne(server, cfg, "cloud", readOnly);
  registerOne(server, cfg, "storagebox", readOnly);
  // Read-only: no robot_request. Every Robot read has a curated, redacted tool, and the raw
  // tool would reach the reads deliberately left out, such as order transactions.
  if (!readOnly) registerOne(server, cfg, "robot");
}
