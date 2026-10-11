/**
 * The Robot read acceptance table, shared by test/robot-reads.ts and docs/ROBOT-READS.md.
 *
 * ENDPOINTS is the full read list from https://robot.hetzner.com/doc/webservice/en.html
 * (index read on 2026-10-11): 49 GETs plus POST /traffic, which only queries. Each row says
 * which tool and arguments reach it, or why it is left out. Values are synthetic; addresses
 * are from the documentation ranges (RFC 5737, RFC 3849).
 */
export type Args = Record<string, unknown>;
export type Row =
  | { endpoint: string; tool: string; args: Args; sends: string }
  | { endpoint: string; excluded: string };

export const IP = "203.0.113.10";
export const NET = "2001:db8::";
const FP = "15:28:b0:03:95:f0:77:b3:10:56:15:6b:77:22:a5:bb";
const ORDER_HISTORY =
  "left out: order history. Transaction reads can return a new server's root password, and operating servers never needs purchase history";
const STORAGEBOX =
  "left out: Storage Boxes moved to the Hetzner Console API, and these Robot endpoints only still serve the legacy BX10 type. storagebox_list reads them through the Console API";

export const ENDPOINTS: Row[] = [
  { endpoint: "GET /server", tool: "robot_list_servers", args: {}, sends: "GET /server" },
  { endpoint: "GET /server/{server-number}", tool: "robot_list_servers", args: { id: "321" }, sends: "GET /server/321" },
  { endpoint: "GET /server/{server-number}/cancellation", tool: "robot_list_servers", args: { id: "321", view: "cancellation" }, sends: "GET /server/321/cancellation" },
  { endpoint: "GET /ip", tool: "robot_list_ips", args: {}, sends: "GET /ip" },
  { endpoint: "GET /ip/{ip}", tool: "robot_list_ips", args: { id: IP }, sends: `GET /ip/${IP}` },
  { endpoint: "GET /ip/{ip}/cancellation", tool: "robot_list_ips", args: { id: IP, view: "cancellation" }, sends: `GET /ip/${IP}/cancellation` },
  { endpoint: "GET /ip/{ip}/mac", tool: "robot_list_ips", args: { id: IP, view: "mac" }, sends: `GET /ip/${IP}/mac` },
  { endpoint: "GET /subnet", tool: "robot_list_subnets", args: {}, sends: "GET /subnet" },
  { endpoint: "GET /subnet/{net-ip}", tool: "robot_list_subnets", args: { id: NET }, sends: `GET /subnet/${NET}` },
  { endpoint: "GET /subnet/{net-ip}/cancellation", tool: "robot_list_subnets", args: { id: NET, view: "cancellation" }, sends: `GET /subnet/${NET}/cancellation` },
  { endpoint: "GET /subnet/{net-ip}/mac", tool: "robot_list_subnets", args: { id: NET, view: "mac" }, sends: `GET /subnet/${NET}/mac` },
  { endpoint: "GET /rdns", tool: "robot_list_rdns", args: {}, sends: "GET /rdns" },
  { endpoint: "GET /rdns/{ip}", tool: "robot_list_rdns", args: { id: IP }, sends: `GET /rdns/${IP}` },
  { endpoint: "GET /failover", tool: "robot_list_failover", args: {}, sends: "GET /failover" },
  { endpoint: "GET /failover/{failover-ip}", tool: "robot_list_failover", args: { id: IP }, sends: `GET /failover/${IP}` },
  { endpoint: "GET /key", tool: "robot_list_ssh_keys", args: {}, sends: "GET /key" },
  { endpoint: "GET /key/{fingerprint}", tool: "robot_list_ssh_keys", args: { id: FP }, sends: `GET /key/${FP}` },
  { endpoint: "GET /firewall/{server-id}", tool: "robot_get_firewall", args: { id: "321" }, sends: "GET /firewall/321" },
  { endpoint: "GET /firewall/template", tool: "robot_list_firewall_templates", args: {}, sends: "GET /firewall/template" },
  { endpoint: "GET /firewall/template/{template-id}", tool: "robot_list_firewall_templates", args: { id: "123" }, sends: "GET /firewall/template/123" },
  { endpoint: "GET /boot/{server-number}", tool: "robot_get_boot", args: { id: "321" }, sends: "GET /boot/321" },
  { endpoint: "GET /boot/{server-number}/rescue", tool: "robot_get_boot", args: { id: "321", view: "rescue" }, sends: "GET /boot/321/rescue" },
  { endpoint: "GET /boot/{server-number}/rescue/last", tool: "robot_get_boot", args: { id: "321", view: "rescue_last" }, sends: "GET /boot/321/rescue/last" },
  { endpoint: "GET /boot/{server-number}/linux", tool: "robot_get_boot", args: { id: "321", view: "linux" }, sends: "GET /boot/321/linux" },
  { endpoint: "GET /boot/{server-number}/linux/last", tool: "robot_get_boot", args: { id: "321", view: "linux_last" }, sends: "GET /boot/321/linux/last" },
  { endpoint: "GET /boot/{server-number}/vnc", tool: "robot_get_boot", args: { id: "321", view: "vnc" }, sends: "GET /boot/321/vnc" },
  { endpoint: "GET /boot/{server-number}/windows", tool: "robot_get_boot", args: { id: "321", view: "windows" }, sends: "GET /boot/321/windows" },
  { endpoint: "GET /reset", tool: "robot_get_reset", args: {}, sends: "GET /reset" },
  { endpoint: "GET /reset/{server-number}", tool: "robot_get_reset", args: { id: "321" }, sends: "GET /reset/321" },
  { endpoint: "GET /wol/{server-number}", tool: "robot_get_wol", args: { id: "321" }, sends: "GET /wol/321" },
  { endpoint: "GET /vswitch", tool: "robot_list_vswitches", args: {}, sends: "GET /vswitch" },
  { endpoint: "GET /vswitch/{vswitch-id}", tool: "robot_list_vswitches", args: { id: "4321" }, sends: "GET /vswitch/4321" },
  { endpoint: "POST /traffic", tool: "robot_get_traffic", args: { type: "month", from: "2026-09-01", to: "2026-09-30", ip: [IP] }, sends: "POST /traffic" },
  { endpoint: "GET /order/server/product", tool: "robot_list_server_products", args: {}, sends: "GET /order/server/product" },
  { endpoint: "GET /order/server/product/{product-id}", tool: "robot_list_server_products", args: { id: "EX44" }, sends: "GET /order/server/product/EX44" },
  { endpoint: "GET /order/server_market/product", tool: "robot_list_server_market", args: {}, sends: "GET /order/server_market/product" },
  { endpoint: "GET /order/server_market/product/{product-id}", tool: "robot_list_server_market", args: { id: "282323" }, sends: "GET /order/server_market/product/282323" },
  { endpoint: "GET /order/server_addon/{server-number}/product", tool: "robot_list_server_addons", args: { id: "321" }, sends: "GET /order/server_addon/321/product" },
  { endpoint: "GET /order/currency", tool: "robot_get_order_currency", args: {}, sends: "GET /order/currency" },
  { endpoint: "GET /order/server/transaction", excluded: ORDER_HISTORY },
  { endpoint: "GET /order/server/transaction/{id}", excluded: ORDER_HISTORY },
  { endpoint: "GET /order/server_market/transaction", excluded: ORDER_HISTORY },
  { endpoint: "GET /order/server_market/transaction/{id}", excluded: ORDER_HISTORY },
  { endpoint: "GET /order/server_addon/transaction", excluded: ORDER_HISTORY },
  { endpoint: "GET /order/server_addon/transaction/{id}", excluded: ORDER_HISTORY },
  { endpoint: "GET /storagebox", excluded: STORAGEBOX },
  { endpoint: "GET /storagebox/{storagebox-id}", excluded: STORAGEBOX },
  { endpoint: "GET /storagebox/{storagebox-id}/snapshot", excluded: STORAGEBOX },
  { endpoint: "GET /storagebox/{storagebox-id}/snapshotplan", excluded: STORAGEBOX },
  { endpoint: "GET /storagebox/{storagebox-id}/subaccount", excluded: STORAGEBOX },
];

// The read endpoints in the Robot documentation, copied from its index on 2026-10-11.
export const DOC_READS = [
  "GET /boot/{server-number}", "GET /boot/{server-number}/linux", "GET /boot/{server-number}/linux/last",
  "GET /boot/{server-number}/rescue", "GET /boot/{server-number}/rescue/last", "GET /boot/{server-number}/vnc",
  "GET /boot/{server-number}/windows", "GET /failover", "GET /failover/{failover-ip}", "GET /firewall/template",
  "GET /firewall/template/{template-id}", "GET /firewall/{server-id}", "GET /ip", "GET /ip/{ip}",
  "GET /ip/{ip}/cancellation", "GET /ip/{ip}/mac", "GET /key", "GET /key/{fingerprint}", "GET /order/currency",
  "GET /order/server/product", "GET /order/server/product/{product-id}", "GET /order/server/transaction",
  "GET /order/server/transaction/{id}", "GET /order/server_addon/transaction", "GET /order/server_addon/transaction/{id}",
  "GET /order/server_addon/{server-number}/product", "GET /order/server_market/product",
  "GET /order/server_market/product/{product-id}", "GET /order/server_market/transaction",
  "GET /order/server_market/transaction/{id}", "GET /rdns", "GET /rdns/{ip}", "GET /reset", "GET /reset/{server-number}",
  "GET /server", "GET /server/{server-number}", "GET /server/{server-number}/cancellation", "GET /storagebox",
  "GET /storagebox/{storagebox-id}", "GET /storagebox/{storagebox-id}/snapshot", "GET /storagebox/{storagebox-id}/snapshotplan",
  "GET /storagebox/{storagebox-id}/subaccount", "GET /subnet", "GET /subnet/{net-ip}", "GET /subnet/{net-ip}/cancellation",
  "GET /subnet/{net-ip}/mac", "GET /vswitch", "GET /vswitch/{vswitch-id}", "GET /wol/{server-number}", "POST /traffic",
];


/** Renders docs/ROBOT-READS.md from the table, so the document cannot drift from the test. */
export function renderDoc(): string {
  const show = (a: Args) =>
    Object.entries(a).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join("; ") || "(none)";
  const lines = [
    "# Robot read coverage",
    "",
    "Every read endpoint in the Robot webservice documentation",
    "(https://robot.hetzner.com/doc/webservice/en.html, index read on 2026-10-11): 49 GETs and",
    "`POST /traffic`, which only queries. Each row is served by a tool or left out with a reason.",
    "`test/robot-reads.ts` proves each covered call sends exactly that one request, with passwords",
    "redacted, in read-only mode and with writes on. This file is generated from",
    "`test/robot-endpoints.ts`; regenerate it with `npx tsx test/robot-reads.ts --write-doc`.",
    "",
    "Ids are checked before they go into a path: server numbers and numeric ids are digits,",
    "addresses are plain IPv4 or IPv6 without a mask, key fingerprints are MD5 hex pairs, product",
    "ids start with a letter. Views are fixed sub-paths chosen by name. Robot tools reject unknown",
    "arguments. `POST /traffic` is the one POST the read-only gate lets out.",
    "",
    "| # | Endpoint | Tool | Arguments, or why it is left out |",
    "|---|---|---|---|",
    ...ENDPOINTS.map((r, i) =>
      "tool" in r ? `| ${i + 1} | \`${r.endpoint}\` | \`${r.tool}\` | ${show(r.args)} |` : `| ${i + 1} | \`${r.endpoint}\` | none | ${r.excluded} |`,
    ),
    "",
    `Covered: ${ENDPOINTS.filter((r) => "tool" in r).length}. Left out: ${ENDPOINTS.filter((r) => "excluded" in r).length}. Total: ${ENDPOINTS.length}.`,
    "",
  ];
  return lines.join("\n");
}
