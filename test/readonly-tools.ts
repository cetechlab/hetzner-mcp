/**
 * Offline tests: in read-only mode the server offers only tools that read.
 *
 * The write gate in hetznerRequest already refuses writes. This is the layer above it: a
 * read-only server does not even list a tool that could send one, so an MCP client sees
 * exactly what it can use, whatever its own allowlist says.
 */
import { loadConfig, type HetznerConfig } from "../src/config.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../src/tools/register.js";

let passed = 0;
let total = 0;
function assert(label: string, cond: boolean): void {
  total++;
  if (cond) passed++;
  process.stdout.write(`${cond ? "OK  " : "FAIL"} ${label}\n`);
}

// Synthetic credentials, made up for this test.
const CREDS = { HETZNER_CLOUD_TOKEN: "fixturetoken", HETZNER_ROBOT_USER: "fixture-user", HETZNER_ROBOT_PASSWORD: "fixture-pass" };
type Tool = { name: string; inputSchema: { properties?: Record<string, { enum?: string[] }> } };

async function connect(cfg: HetznerConfig, env: NodeJS.ProcessEnv = {}) {
  const server = new McpServer({ name: "hetzner-mcp", version: "test" });
  registerAllTools(server, cfg, env);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
async function list(cfg: HetznerConfig, env: NodeJS.ProcessEnv = {}): Promise<Tool[]> {
  const client = await connect(cfg, env);
  const { tools } = (await client.listTools()) as { tools: Tool[] };
  await client.close();
  return tools;
}

const rw = loadConfig({ ...CREDS, HETZNER_MCP_ALLOW_WRITES: "1" });
const ro = loadConfig(CREDS);
const roExplicit = loadConfig({ ...CREDS, HETZNER_MCP_ALLOW_WRITES: "1", HETZNER_MCP_READONLY: "1" });
const rwTools = await list(rw);
const roTools = await list(ro);
const names = (ts: Tool[]) => new Set(ts.map((t) => t.name));
const rwNames = names(rwTools);
const roNames = names(roTools);

// Every tool that can send a write when writes are on. Named, so a new write tool must be
// classified here, or the "every tool is accounted for" check below fails.
const WRITE_TOOLS = [...rwNames].filter((n) => /^cloud_(create|delete|attach|detach|assign|unassign)_/.test(n));
const RAW_REQUEST = ["cloud_request", "storagebox_request", "robot_request"];
// Tools that only read: the READS table shortcuts and the read-only reports. A new tool that
// fits none of the three groups fails T0 until someone decides which group it belongs to.
const isKnownRead = (n: string) =>
  /^(cloud|storagebox|robot)_(list|get)(_|$)/.test(n) ||
  ["storagebox_list", "contribute_or_report", "infra_map", "infra_audit", "find_capacity", "spend_history"].includes(n);
const READ_ONLY_TOOLS = [...rwNames].filter(isKnownRead);
const unclassified = [...rwNames].filter((n) => !WRITE_TOOLS.includes(n) && !RAW_REQUEST.includes(n) && !isKnownRead(n));
assert(`T0: every tool is classified as write, raw request or read (unclassified: ${unclassified.join(", ") || "none"})`, unclassified.length === 0);

assert(`T0: writes on, the write tools are listed (${WRITE_TOOLS.length})`, WRITE_TOOLS.length >= 20 && WRITE_TOOLS.includes("cloud_create_server") && WRITE_TOOLS.includes("cloud_delete_server"));
assert("T0: writes on, all three raw request tools are listed", RAW_REQUEST.every((n) => rwNames.has(n)));

for (const [label, cfg] of [["default", ro], ["HETZNER_MCP_READONLY=1 over ALLOW_WRITES=1", roExplicit]] as const) {
  const tools = label === "default" ? roTools : await list(cfg);
  const ns = names(tools);
  assert(`T1 (${label}): no write tool is listed`, WRITE_TOOLS.every((n) => !ns.has(n)));
  assert(`T1 (${label}): robot_request is not listed`, !ns.has("robot_request"));
  for (const n of ["cloud_request", "storagebox_request"]) {
    const t = tools.find((x) => x.name === n);
    const methods = t?.inputSchema.properties?.method?.enum;
    assert(`T1 (${label}): ${n} is listed and offers GET only`, !!t && JSON.stringify(methods) === JSON.stringify(["GET"]));
    assert(`T1 (${label}): ${n} has no body or confirm field`, !!t && !t.inputSchema.properties?.body && !t.inputSchema.properties?.confirm);
  }
  assert(`T1 (${label}): every read tool is still listed`, READ_ONLY_TOOLS.every((n) => ns.has(n)));
  assert(`T1 (${label}): nothing new appears`, [...ns].every((n) => rwNames.has(n)));
}

// A write attempted through what is left is refused before fetch.
const realFetch = globalThis.fetch;
let fetched = 0;
globalThis.fetch = (async () => {
  fetched++;
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const client = await connect(ro);
for (const [name, args] of [
  ["cloud_request", { method: "POST", path: "/servers/1/actions/poweroff" }],
  ["storagebox_request", { method: "DELETE", path: "/storage_boxes/1" }],
  ["robot_request", { method: "POST", path: "/reset/321", body: { type: "hw" }, confirm: true }],
  ["robot_request", { method: "GET", path: "/order/server/transaction" }],
  ["cloud_delete_server", { id: "1", confirm: true }],
] as const) {
  fetched = 0;
  let isError = false;
  try {
    const r = (await client.callTool({ name, arguments: args as Record<string, unknown> })) as { isError?: boolean };
    isError = !!r.isError;
  } catch {
    isError = true;
  }
  assert(`T2: ${name} ${args.method ?? "call"} ${"path" in args ? args.path : ""} in read-only fails before fetch`, isError && fetched === 0);
}
fetched = 0;
const read = (await client.callTool({ name: "cloud_request", arguments: { path: "/servers" } })) as { isError?: boolean };
assert("T2: cloud_request GET still works in read-only", !read.isError && fetched === 1);
await client.close();
globalThis.fetch = realFetch;

// Lean read-only keeps a way to read Cloud and Storage Box.
const lean = names(await list(ro, { HETZNER_MCP_TOOLS: "lean" }));
assert("T3: lean read-only keeps cloud_request and storagebox_request", lean.has("cloud_request") && lean.has("storagebox_request"));
assert("T3: lean read-only lists no write tool and no robot_request", WRITE_TOOLS.every((n) => !lean.has(n)) && !lean.has("robot_request"));
// Lean drops the list shortcuts because the raw request tools read the same data. Read-only
// has no robot_request, so the Robot read tools must stay or Robot could not be read at all.
const robotReads = READ_ONLY_TOOLS.filter((n) => n.startsWith("robot_"));
assert(`T3: lean read-only keeps every Robot read tool (${robotReads.length})`, robotReads.length >= 10 && robotReads.every((n) => lean.has(n)));
assert("T3: lean read-only still drops the Cloud list shortcuts", !lean.has("cloud_list_servers"));
const leanRw = names(await list(rw, { HETZNER_MCP_TOOLS: "lean" }));
assert("T3: lean with writes on is unchanged: robot_request, no Robot list shortcuts", leanRw.has("robot_request") && !leanRw.has("robot_list_servers"));

process.stdout.write(`\nread-only: ${roTools.length} tools, writes on: ${rwTools.length} tools\n`);
process.stdout.write(`\n${passed}/${total} read-only tool-list checks passed\n`);
if (passed !== total) process.exitCode = 1;
