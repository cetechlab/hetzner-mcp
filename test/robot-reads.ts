/**
 * Offline acceptance test: every read endpoint of the Hetzner Robot webservice is either
 * served by a curated tool or left out with a stated reason. No network: fetch is stubbed.
 * The table lives in test/robot-endpoints.ts. Ids are validated against a strict pattern per
 * tool and then sent as the documentation's own curl examples write them, colons included
 * (RFC 3986 allows ':' in a path segment).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadConfig, type HetznerConfig } from "../src/config.js";
import { hetznerRequest } from "../src/http.js";
import { HetznerApiError } from "../src/errors.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../src/tools/register.js";
import { ENDPOINTS, DOC_READS, IP, NET, renderDoc, type Args, type Row } from "./robot-endpoints.js";

const DOC = new URL("../docs/ROBOT-READS.md", import.meta.url);
if (process.argv.includes("--write-doc")) writeFileSync(DOC, renderDoc());

let passed = 0;
let total = 0;
function assert(label: string, cond: boolean): void {
  total++;
  if (cond) passed++;
  process.stdout.write(`${cond ? "OK  " : "FAIL"} ${label}\n`);
}

// 0. The table is the documentation's list, once each.
assert(`A0: the documentation lists 50 reads (${DOC_READS.length})`, DOC_READS.length === 50 && new Set(DOC_READS).size === 50);
assert(`A0: the table has one row per documented read (${ENDPOINTS.length})`, ENDPOINTS.length === 50 && new Set(ENDPOINTS.map((r) => r.endpoint)).size === 50);
assert("A0: the table and the documentation name the same endpoints", DOC_READS.every((e) => ENDPOINTS.some((r) => r.endpoint === e)));
const covered = ENDPOINTS.filter((r): r is Extract<Row, { tool: string }> => "tool" in r);
const excluded = ENDPOINTS.filter((r): r is Extract<Row, { excluded: string }> => "excluded" in r);
let docText = "";
try {
  docText = readFileSync(DOC, "utf8");
} catch {
  docText = "";
}
assert("A0: docs/ROBOT-READS.md matches the table (regenerate with --write-doc)", docText === renderDoc());
assert(`A0: ${covered.length} covered, ${excluded.length} left out, each with a reason`, covered.length === 39 && excluded.length === 11 && excluded.every((r) => r.excluded.length > 40));

// Stubbed Robot: records each request and answers with a synthetic fixture that carries a
// password canary in every shape a Robot read can return one.
const CANARY = "FIXTURE_PW_CANARY_r0b0t";
const realFetch = globalThis.fetch;
let sent: Array<{ method: string; host: string; path: string; body: string }> = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = new URL(String(url));
  sent.push({ method: init?.method ?? "GET", host: u.host, path: u.pathname, body: typeof init?.body === "string" ? init.body : "" });
  const fixture = {
    fixture_marker: `served ${u.pathname}`,
    nested: { server_number: 321, password: CANARY, active: true, authorized_key: [{ key: { fingerprint: "aa:bb:cc" } }] },
    windows: { password: `${CANARY}W` },
    vnc: { password: `${CANARY}V` },
  };
  return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const SETUPS = {
  "read-only": loadConfig({ HETZNER_ROBOT_USER: "fixture-user", HETZNER_ROBOT_PASSWORD: "fixture-pass" }),
  "writes on": loadConfig({ HETZNER_ROBOT_USER: "fixture-user", HETZNER_ROBOT_PASSWORD: "fixture-pass", HETZNER_MCP_ALLOW_WRITES: "1" }),
};
async function connect(cfg: HetznerConfig, env: NodeJS.ProcessEnv = {}) {
  const server = new McpServer({ name: "hetzner-mcp", version: "test" });
  registerAllTools(server, cfg, env);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
async function call(client: Client, name: string, args: Args) {
  try {
    const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
    return { text: r.content.map((c) => c.text).join("\n"), isError: !!r.isError };
  } catch (e) {
    return { text: e instanceof Error ? e.message : String(e), isError: true };
  }
}

// 1. Every covered row sends exactly its one request, to Robot, and shows no password.
for (const [setup, cfg] of Object.entries(SETUPS)) {
  const client = await connect(cfg);
  for (const row of covered) {
    sent = [];
    const r = await call(client, row.tool, { ...row.args, verbose: true });
    const [method, path] = row.sends.split(" ");
    const one = sent.length === 1 && sent[0]!.method === method && sent[0]!.path === path && sent[0]!.host === "robot-ws.your-server.de";
    assert(`A1 (${setup}): ${row.endpoint} -> ${row.tool} sends exactly ${row.sends}`, one && !r.isError && r.text.includes(`served ${path}`));
    assert(`A1 (${setup}): ${row.tool} ${JSON.stringify(row.args)} shows no password`, !r.text.includes(CANARY));
  }
  await client.close();
}

// The traffic query is a POST carrying a form, nothing else.
{
  const client = await connect(SETUPS["read-only"]);
  sent = [];
  await call(client, "robot_get_traffic", { type: "day", from: "2026-10-01T00", to: "2026-10-01T23", ip: [IP, "198.51.100.7"], subnet: [NET], single_values: true });
  const body = new URLSearchParams(sent[0]?.body ?? "");
  assert("A2: traffic sends the query as a form", sent.length === 1 && body.get("type") === "day" && body.get("from") === "2026-10-01T00" && body.get("to") === "2026-10-01T23");
  assert("A2: traffic sends ip[] and subnet[] the way Robot expects", JSON.stringify(body.getAll("ip[]")) === JSON.stringify([IP, "198.51.100.7"]) && JSON.stringify(body.getAll("subnet[]")) === JSON.stringify([NET]));
  assert("A2: single_values is sent as true", body.get("single_values") === "true");
  for (const [label, args] of [
    ["no ip and no subnet", { type: "month", from: "2026-09-01", to: "2026-09-30" }],
    ["month with an hour", { type: "month", from: "2026-09-01T00", to: "2026-09-30", ip: [IP] }],
    ["day without an hour", { type: "day", from: "2026-09-01", to: "2026-09-01T23", ip: [IP] }],
    ["year with a day", { type: "year", from: "2026-01-01", to: "2026-09", ip: [IP] }],
    ["an unknown type", { type: "week", from: "2026-09-01", to: "2026-09-30", ip: [IP] }],
    ["an ip that is a path", { type: "month", from: "2026-09-01", to: "2026-09-30", ip: ["../order/server/transaction"] }],
    ["a subnet with a mask", { type: "month", from: "2026-09-01", to: "2026-09-30", subnet: ["2001:db8::/64"] }],
    ["a date with extra text", { type: "month", from: "2026-09-01&ip=1.2.3.4", to: "2026-09-30", ip: [IP] }],
  ] as const) {
    sent = [];
    const r = await call(client, "robot_get_traffic", args as unknown as Args);
    assert(`A2: traffic with ${label} is refused before fetch`, r.isError && sent.length === 0);
  }
  await client.close();
}

// 2. Ids are checked, so no argument can steer a tool to another endpoint.
{
  const client = await connect(SETUPS["read-only"]);
  const tools = [...new Set(covered.map((r) => r.tool))].filter((t) => t !== "robot_get_traffic" && t !== "robot_get_order_currency");
  const BAD_IDS = [
    "../order/server/transaction", "321/../../order/server/transaction", "..%2Forder%2Fserver%2Ftransaction", "%2e%2e",
    "321/cancellation", "321?x=1", "321#x", "321\n", " 321", "321 ", "-1", "1e3", "0x10", "321;", "B20220210-1843193-S33055/../..",
  ];
  for (const tool of tools) {
    let leaked = 0;
    for (const id of BAD_IDS) {
      sent = [];
      const r = await call(client, tool, { id });
      if (!r.isError || sent.length !== 0) leaked++;
    }
    assert(`A3: ${tool} refuses all ${BAD_IDS.length} malformed ids before fetch`, leaked === 0);
  }
  for (const [tool, args, label] of [
    ["robot_get_boot", { view: "rescue" }, "a view without an id"],
    ["robot_list_servers", { view: "cancellation" }, "a view without an id"],
    ["robot_get_boot", { id: "321", view: "../../order/server/transaction" }, "an unknown view"],
    ["robot_get_boot", { id: "321", view: "plesk" }, "a view Robot does not offer"],
    ["robot_get_order_currency", { id: "EUR" }, "an id on a tool that takes none"],
    ["robot_get_wol", {}, "no server number"],
    ["robot_list_server_addons", {}, "no server number"],
    ["robot_get_firewall", { id: "123", view: "template" }, "a view on a tool without views"],
  ] as const) {
    sent = [];
    const r = await call(client, tool, args as unknown as Args);
    assert(`A3: ${tool} with ${label} is refused before fetch`, r.isError && sent.length === 0);
  }
  await client.close();
}

// 3. Nothing in read-only mode reaches a left-out endpoint: every request any tool sent in
// this file was recorded, and none of them was an order transaction or a Storage Box.
// (Covered calls above already ran; repeat them and collect every path.)
{
  const client = await connect(SETUPS["read-only"]);
  const paths: string[] = [];
  for (const row of covered) {
    sent = [];
    await call(client, row.tool, row.args);
    paths.push(...sent.map((s) => `${s.method} ${s.path}`));
  }
  assert("A4: no covered call touches /order/*/transaction or /storagebox", paths.length === covered.length && paths.every((p) => !/\/transaction|\/storagebox/.test(p)));
  const listed = ((await client.listTools()) as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
  assert("A4: read-only offers no robot_request to reach them another way", !listed.includes("robot_request"));
  const robotTools = listed.filter((n) => n.startsWith("robot_"));
  const tableTools = new Set(covered.map((r) => r.tool));
  assert(`A4: every Robot tool in read-only appears in the table (${robotTools.length})`, robotTools.every((n) => tableTools.has(n)) && [...tableTools].every((n) => robotTools.includes(n)));
  await client.close();
}

// 4. The gate's one named exception: POST /traffic on Robot is a query, so read-only lets it out.
// Nothing else that looks like it does.
{
  const ro = SETUPS["read-only"];
  const tryReq = async (surface: "robot" | "cloud", method: string, path: string) => {
    sent = [];
    try {
      await hetznerRequest(ro, { surface, method, path, body: { type: "month" } });
      return { ok: true, sent: sent.length };
    } catch (e) {
      return { ok: false, sent: sent.length, code: e instanceof HetznerApiError ? e.code : "" };
    }
  };
  const allowed = await tryReq("robot", "POST", "/traffic");
  assert("A5: read-only lets robot POST /traffic out", allowed.ok && allowed.sent === 1);
  for (const [surface, method, path] of [
    ["robot", "POST", "/traffic/1"], ["robot", "POST", "/traffic/"], ["robot", "POST", "/Traffic"], ["robot", "POST", "/traffic?type=month"],
    ["robot", "PUT", "/traffic"], ["robot", "DELETE", "/traffic"], ["cloud", "POST", "/traffic"], ["robot", "POST", "traffic/../reset/321"],
  ] as const) {
    const r = await tryReq(surface, method, path);
    assert(`A5: read-only still refuses ${surface} ${method} ${path} before fetch`, !r.ok && r.sent === 0);
  }
}

globalThis.fetch = realFetch;
process.stdout.write(`\n${passed}/${total} Robot read coverage checks passed\n`);
if (passed !== total) process.exitCode = 1;
