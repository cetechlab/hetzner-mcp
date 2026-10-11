/**
 * Curated read tools, generated from a declarative table to stay lean.
 * Every entry is a free GET. Optional id fetches a single resource.
 * Responses are compact by default for token efficiency, verbose on request.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HetznerConfig, SurfaceName } from "../config.js";
import { hetznerRequest } from "../http.js";
import { redactFields, resultBlocks } from "../format.js";
import { ROBOT_IP, ROBOT_ID, registerRobotTrafficTool } from "./robot-traffic.js";

interface ReadDef {
  surface: SurfaceName;
  name: string;
  path: string;
  desc: string;
  paginated: boolean;
  /** Sub-resource under a required id, for example /members under /networks/{id}. */
  sub?: string;
  /** The resource only exists per id, for example /firewall/{server-number}. */
  idRequired?: boolean;
  /** The endpoint takes no id at all, for example /order/currency. */
  noId?: boolean;
  /** Robot: the shape an id must have before it goes into the path. Checked, then sent as is. */
  idShape?: { pattern: RegExp; hint: string };
  /** Robot: fixed sub-paths under one object, chosen by name, for example /boot/{n}/rescue/last. */
  views?: Record<string, string>;
}

const SERVER_NUMBER = { pattern: ROBOT_ID.serverNumber, hint: "a server number such as 321" };
const IP_ADDRESS = { pattern: ROBOT_IP, hint: "an IPv4 or IPv6 address, without a mask" };
const NUMBER_ID = { pattern: ROBOT_ID.number, hint: "a numeric id" };
const CANCELLATION = { cancellation: "/cancellation" };
const MAC_AND_CANCELLATION = { mac: "/mac", cancellation: "/cancellation" };

const READS: ReadDef[] = [
  { surface: "cloud", name: "cloud_list_servers", path: "/servers", desc: "List cloud servers", paginated: true },
  { surface: "cloud", name: "cloud_list_ssh_keys", path: "/ssh_keys", desc: "List SSH keys", paginated: true },
  { surface: "cloud", name: "cloud_list_networks", path: "/networks", desc: "List private networks", paginated: true },
  { surface: "cloud", name: "cloud_list_firewalls", path: "/firewalls", desc: "List firewalls", paginated: true },
  { surface: "cloud", name: "cloud_list_volumes", path: "/volumes", desc: "List volumes", paginated: true },
  { surface: "cloud", name: "cloud_list_load_balancers", path: "/load_balancers", desc: "List load balancers", paginated: true },
  { surface: "cloud", name: "cloud_list_floating_ips", path: "/floating_ips", desc: "List floating IPs", paginated: true },
  { surface: "cloud", name: "cloud_list_primary_ips", path: "/primary_ips", desc: "List primary IPs", paginated: true },
  { surface: "cloud", name: "cloud_list_placement_groups", path: "/placement_groups", desc: "List placement groups", paginated: true },
  { surface: "cloud", name: "cloud_list_certificates", path: "/certificates", desc: "List certificates", paginated: true },
  { surface: "cloud", name: "cloud_list_images", path: "/images", desc: "List images", paginated: true },
  { surface: "cloud", name: "cloud_list_isos", path: "/isos", desc: "List ISOs", paginated: true },
  { surface: "cloud", name: "cloud_list_dns_zones", path: "/zones", desc: "List DNS zones, part of the Cloud API", paginated: true },
  { surface: "cloud", name: "cloud_list_server_types", path: "/server_types", desc: "List server types and specs", paginated: true },
  { surface: "cloud", name: "cloud_list_load_balancer_types", path: "/load_balancer_types", desc: "List load balancer types", paginated: true },
  { surface: "cloud", name: "cloud_list_locations", path: "/locations", desc: "List locations", paginated: true },
  { surface: "cloud", name: "cloud_list_network_members", path: "/networks", sub: "/members", desc: "List everything attached to a private network. Pass the network id", paginated: true },
  { surface: "cloud", name: "cloud_get_pricing", path: "/pricing", desc: "Get full pricing for the account currency", paginated: false },
  { surface: "storagebox", name: "storagebox_list", path: "/storage_boxes", desc: "List storage boxes", paginated: true },
  { surface: "storagebox", name: "storagebox_list_types", path: "/storage_box_types", desc: "List storage box types", paginated: true },
  { surface: "robot", name: "robot_list_servers", path: "/server", idShape: SERVER_NUMBER, views: CANCELLATION, desc: "List dedicated servers, or one by server number. view cancellation: cancellation status", paginated: false },
  { surface: "robot", name: "robot_list_ips", path: "/ip", idShape: IP_ADDRESS, views: MAC_AND_CANCELLATION, desc: "List single IPs, or one by address. view mac or cancellation for one", paginated: false },
  { surface: "robot", name: "robot_list_subnets", path: "/subnet", idShape: IP_ADDRESS, views: MAC_AND_CANCELLATION, desc: "List subnets, or one by net address without mask. view mac or cancellation for one", paginated: false },
  { surface: "robot", name: "robot_list_vswitches", path: "/vswitch", idShape: NUMBER_ID, desc: "List vSwitches, or one by id with its members", paginated: false },
  { surface: "robot", name: "robot_list_failover", path: "/failover", idShape: IP_ADDRESS, desc: "List failover IPs, or one by address", paginated: false },
  { surface: "robot", name: "robot_list_ssh_keys", path: "/key", idShape: { pattern: ROBOT_ID.fingerprint, hint: "an MD5 fingerprint such as 15:28:b0:...:a5:bb" }, desc: "List Robot SSH keys, or one by fingerprint", paginated: false },
  { surface: "robot", name: "robot_list_rdns", path: "/rdns", idShape: IP_ADDRESS, desc: "List reverse DNS entries, or one by IP address", paginated: false },
  { surface: "robot", name: "robot_get_firewall", path: "/firewall", idRequired: true, idShape: SERVER_NUMBER, desc: "Get the Robot firewall of a dedicated server: status, whitelist and rules. Pass the server number as id", paginated: false },
  { surface: "robot", name: "robot_list_firewall_templates", path: "/firewall/template", idShape: NUMBER_ID, desc: "List Robot firewall templates, or one by id with its rules", paginated: false },
  { surface: "robot", name: "robot_get_boot", path: "/boot", idRequired: true, idShape: SERVER_NUMBER, views: { rescue: "/rescue", rescue_last: "/rescue/last", linux: "/linux", linux_last: "/linux/last", vnc: "/vnc", windows: "/windows" }, desc: "Get a dedicated server's boot configuration, passwords redacted. id: server number. view: one option, or rescue_last/linux_last for the last activation", paginated: false },
  { surface: "robot", name: "robot_get_reset", path: "/reset", idShape: SERVER_NUMBER, desc: "Get reset options and operating status of all dedicated servers, or one by server number. Resets nothing", paginated: false },
  { surface: "robot", name: "robot_get_wol", path: "/wol", idRequired: true, idShape: SERVER_NUMBER, desc: "Get Wake on LAN availability of a dedicated server. Sends no wake-up. id: server number", paginated: false },
  { surface: "robot", name: "robot_list_server_products", path: "/order/server/product", idShape: { pattern: ROBOT_ID.product, hint: "a product id such as EX44" }, desc: "List orderable dedicated server products with prices, or one by product id. Catalogue only, orders nothing", paginated: false },
  { surface: "robot", name: "robot_list_server_market", path: "/order/server_market/product", idShape: NUMBER_ID, desc: "List Server Auction offers, or one by id. Catalogue only, orders nothing", paginated: false },
  { surface: "robot", name: "robot_list_server_addons", path: "/order/server_addon", sub: "/product", idRequired: true, idShape: SERVER_NUMBER, desc: "List orderable addons for a dedicated server, with prices. Catalogue only, orders nothing. id: server number", paginated: false },
  { surface: "robot", name: "robot_get_order_currency", path: "/order/currency", noId: true, desc: "Get the currency the Robot account orders in", paginated: false },
];

type ReadArgs = { id?: string; view?: string; query?: Record<string, string | number | boolean>; verbose?: boolean };

/** Builds the request path from fixed parts and a checked id. Errors are ours and never echo input. */
function readPath(def: ReadDef, args: ReadArgs): string {
  if (def.noId && args.id) throw new Error(`${def.name} takes no id`);
  if (args.view !== undefined && !(def.views && Object.hasOwn(def.views, args.view))) throw new Error(`${def.name} has no such view`);
  if ((def.sub || def.idRequired || args.view !== undefined) && !args.id) throw new Error(`${def.name} needs an id`);
  if (!args.id) return def.path;
  // A Robot id is checked against its shape and then sent as Robot's documentation writes it,
  // so nothing in it can add a path segment, a query or a fragment. Other ids are encoded.
  if (def.idShape && !def.idShape.pattern.test(args.id)) throw new Error(`${def.name} needs ${def.idShape.hint} as id`);
  const id = def.idShape ? args.id : encodeURIComponent(args.id);
  return `${def.path}/${id}${def.sub ?? ""}${args.view !== undefined ? def.views![args.view] : ""}`;
}

function makeReadHandler(cfg: HetznerConfig, def: ReadDef) {
  return async (args: ReadArgs) => {
    try {
      const path = readPath(def, args);
      const query =
        def.paginated && (!args.id || def.sub) ? { per_page: 50, ...(args.query ?? {}) } : args.query;
      const result = await hetznerRequest(cfg, { surface: def.surface, path, query });
      // Robot reads can carry passwords (GET /boot). A read never needs to show one.
      const shown = def.surface === "robot" ? redactFields(result) : result;
      return { content: resultBlocks(shown, args.verbose ?? false) };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  };
}

export function registerReadTools(server: McpServer, cfg: HetznerConfig, opts: { robotOnly?: boolean } = {}): void {
  for (const def of READS) {
    if (opts.robotOnly && def.surface !== "robot") continue;
    const shape = {
      ...(def.noId ? {} : { id: z.string().optional().describe("Fetch one by id.") }),
      ...(def.views ? { view: z.enum(Object.keys(def.views) as [string, ...string[]]).optional().describe("Sub-view of one object. Needs id.") } : {}),
      query: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe("Filters, e.g. name, label_selector."),
      verbose: z.boolean().optional().describe("Full payload."),
    };
    server.registerTool(
      def.name,
      {
        description: `${def.desc}. Read only.`,
        // Robot tools reject unknown arguments instead of silently dropping them, so a view
        // passed to a tool that has none fails rather than returning something else.
        inputSchema: def.surface === "robot" ? z.object(shape).strict() : shape,
      },
      makeReadHandler(cfg, def),
    );
  }
  registerRobotTrafficTool(server, cfg);
}
