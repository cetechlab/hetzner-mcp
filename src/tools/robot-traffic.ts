/**
 * Robot traffic statistics, and the id shapes the Robot read tools accept.
 *
 * Robot answers a traffic query only to POST /traffic. It reads and changes nothing, so it is
 * the one POST the read-only gate in hetznerRequest lets out (see isReadOnlyPost). This tool
 * builds that request from checked fields only; no caller text becomes part of the path.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HetznerConfig } from "../config.js";
import { hetznerRequest } from "../http.js";
import { redactFields, resultBlocks } from "../format.js";

const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
/** An IPv4 address, or an IPv6 address written in hex and colons. No mask, no zone, nothing else. */
export const ROBOT_IP = new RegExp(`^(?:${OCTET}(?:\\.${OCTET}){3}|(?=[0-9a-fA-F:]*:)[0-9a-fA-F:]{2,39})$`);

export const ROBOT_ID = {
  /** A Robot server number. */
  serverNumber: /^[1-9][0-9]{0,9}$/,
  /** A numeric id: vSwitch, firewall template, server market offer. */
  number: /^[1-9][0-9]{0,9}$/,
  /** An MD5 key fingerprint as Robot lists it. */
  fingerprint: /^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){15}$/,
  /** A server product id such as EX44 or AX41-NVMe. */
  product: /^[A-Za-z][A-Za-z0-9-]{0,31}$/,
};

// The interval syntax Robot documents for each query type.
const INTERVAL: Record<"day" | "month" | "year", RegExp> = {
  day: /^\d{4}-\d{2}-\d{2}T\d{2}$/,
  month: /^\d{4}-\d{2}-\d{2}$/,
  year: /^\d{4}-\d{2}$/,
};
const INTERVAL_HINT = { day: "YYYY-MM-DDTHH", month: "YYYY-MM-DD", year: "YYYY-MM" };

const shape = {
  type: z.enum(["day", "month", "year"]).describe("day, month or year: hourly, daily or monthly data."),
  from: z.string().describe("day: YYYY-MM-DDTHH, month: YYYY-MM-DD, year: YYYY-MM."),
  to: z.string().describe("End, same format as from."),
  ip: z.array(z.string()).max(50).optional().describe("IP addresses."),
  subnet: z.array(z.string()).max(50).optional().describe("Subnet addresses, no mask."),
  single_values: z.boolean().optional().describe("Per period, not one sum."),
  verbose: z.boolean().optional().describe("Full payload."),
};
type TrafficArgs = { type: "day" | "month" | "year"; from: string; to: string; ip?: string[]; subnet?: string[]; single_values?: boolean; verbose?: boolean };

/** Checks every field and returns the form Robot expects. Errors are ours and never echo input. */
function trafficForm(a: TrafficArgs): Record<string, string | string[]> {
  const pattern = INTERVAL[a.type];
  if (!pattern) throw new Error("type must be day, month or year");
  if (!pattern.test(a.from) || !pattern.test(a.to)) throw new Error(`from and to must be ${INTERVAL_HINT[a.type]} for type ${a.type}`);
  const ips = a.ip ?? [];
  const subnets = a.subnet ?? [];
  if (ips.length + subnets.length === 0) throw new Error("give at least one ip or subnet");
  if (![...ips, ...subnets].every((x) => ROBOT_IP.test(x))) throw new Error("ip and subnet entries must be plain addresses, a subnet without its mask");
  const form: Record<string, string | string[]> = { type: a.type, from: a.from, to: a.to };
  if (ips.length) form["ip[]"] = ips;
  if (subnets.length) form["subnet[]"] = subnets;
  if (a.single_values) form.single_values = "true";
  return form;
}

export function registerRobotTrafficTool(server: McpServer, cfg: HetznerConfig): void {
  server.registerTool(
    "robot_get_traffic",
    {
      description:
        "Get traffic in GB for Robot IPs and subnets over an interval. Sent as POST /traffic, which only queries. Read only.",
      inputSchema: z.object(shape).strict(),
    },
    async (args: TrafficArgs) => {
      try {
        const result = await hetznerRequest(cfg, { surface: "robot", method: "POST", path: "/traffic", body: trafficForm(args) });
        return { content: resultBlocks(redactFields(result), args.verbose ?? false) };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );
}
