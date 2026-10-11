/**
 * Offline tests for the fail-closed write gate. No network: fetch is stubbed and counted.
 *
 * The gate lives in hetznerRequest, the one function every tool uses to reach Hetzner.
 * Writes (POST, PUT, PATCH, DELETE) are refused there, before fetch, unless the
 * configuration explicitly allows them. So a mistyped variable, a config built by hand
 * without the flag, or a new tool that forgets its own read-only check all stay read-only.
 */
import { loadConfig, type HetznerConfig } from "../src/config.js";
import { hetznerRequest } from "../src/http.js";
import { HetznerApiError } from "../src/errors.js";
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

// Synthetic credentials, made up for this test. Never a real login.
const CREDS = { HETZNER_CLOUD_TOKEN: "fixturetoken", HETZNER_ROBOT_USER: "fixture-user", HETZNER_ROBOT_PASSWORD: "fixture-pass" };

// 1. Configuration: read-only unless writes are switched on with the exact value "1".
assert("G1: no variables at all is read-only", loadConfig({}).readOnly === true);
assert("G1: credentials alone are read-only", loadConfig(CREDS).readOnly === true);
assert("G1: HETZNER_MCP_ALLOW_WRITES=1 enables writes", loadConfig({ ...CREDS, HETZNER_MCP_ALLOW_WRITES: "1" }).readOnly === false);
for (const v of ["true", "yes", "on", " 1", "1 ", "01", "", "0"]) {
  assert(`G1: HETZNER_MCP_ALLOW_WRITES=${JSON.stringify(v)} stays read-only`, loadConfig({ ...CREDS, HETZNER_MCP_ALLOW_WRITES: v }).readOnly === true);
}
for (const typo of ["HETZNER_MCP_ALLOW_WRITE", "HETZNER_MCP_ALLOWWRITES", "hetzner_mcp_allow_writes", "HETZNER_ALLOW_WRITES"]) {
  assert(`G1: misspelt ${typo}=1 stays read-only`, loadConfig({ ...CREDS, [typo]: "1" }).readOnly === true);
}
for (const typo of ["HETZNER_MCP_READ_ONLY", "HETZNER_READONLY", "HETZNER_MCP_READONY"]) {
  assert(`G1: misspelt read-only switch ${typo}=1 is still read-only`, loadConfig({ ...CREDS, [typo]: "1" }).readOnly === true);
}
assert(
  "G1: HETZNER_MCP_READONLY=1 wins over HETZNER_MCP_ALLOW_WRITES=1",
  loadConfig({ ...CREDS, HETZNER_MCP_ALLOW_WRITES: "1", HETZNER_MCP_READONLY: "1" }).readOnly === true,
);

// 2. The gate in hetznerRequest: a caller that skips its own check is still refused before fetch.
const realFetch = globalThis.fetch;
let fetched = 0;
const sent: string[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  fetched++;
  sent.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

async function attempt(cfg: HetznerConfig, surface: "cloud" | "storagebox" | "robot", method: string, path: string): Promise<{ ok: boolean; code?: string; message?: string }> {
  try {
    await hetznerRequest(cfg, { surface, method, path, body: { fixture: true } });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e instanceof HetznerApiError ? e.code : undefined, message: e instanceof Error ? e.message : String(e) };
  }
}

const roDefault = loadConfig(CREDS);
for (const surface of ["cloud", "storagebox", "robot"] as const) {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "post", "Delete"]) {
    fetched = 0;
    const r = await attempt(roDefault, surface, method, surface === "robot" ? "/reset/321" : "/servers/1");
    assert(`G2: ${surface} ${method} without the switch is refused before fetch`, !r.ok && r.code === "writes_disabled" && fetched === 0);
  }
}
fetched = 0;
const typoCfg = loadConfig({ ...CREDS, HETZNER_MCP_READ_ONLY: "1" });
const typoR = await attempt(typoCfg, "robot", "POST", "/boot/321/rescue");
assert("G2: a mistyped read-only variable cannot open writes: POST /boot rescue refused before fetch", !typoR.ok && fetched === 0);

// A config assembled by hand (a future tool, a test helper, a map action) that never sets readOnly.
const { readOnly: _dropped, ...noFlag } = loadConfig({ ...CREDS, HETZNER_MCP_ALLOW_WRITES: "1" });
fetched = 0;
const handBuilt = await attempt(noFlag as unknown as HetznerConfig, "robot", "POST", "/reset/321");
assert("G2: a config with no readOnly field is treated as read-only", !handBuilt.ok && handBuilt.code === "writes_disabled" && fetched === 0);
fetched = 0;
const truthy = await attempt({ ...roDefault, readOnly: 0 as unknown as boolean }, "cloud", "DELETE", "/servers/1");
assert("G2: only readOnly === false opens writes (0 does not)", !truthy.ok && fetched === 0);

fetched = 0;
const refused = await attempt(roDefault, "robot", "POST", "/reset/321");
assert("G2: the refusal names the switch, not a secret", !!refused.message?.includes("HETZNER_MCP_ALLOW_WRITES=1") && !refused.message.includes("fixture-pass"));

// Reads are untouched.
for (const surface of ["cloud", "storagebox", "robot"] as const) {
  for (const method of ["GET", "HEAD"]) {
    fetched = 0;
    sent.length = 0;
    const r = await attempt(roDefault, surface, method, "/servers");
    assert(`G3: ${surface} ${method} still reaches fetch in read-only`, r.ok && fetched === 1 && sent[0]!.startsWith(`${method} `));
  }
}

// Writes still work when explicitly enabled.
const rw = loadConfig({ ...CREDS, HETZNER_MCP_ALLOW_WRITES: "1" });
fetched = 0;
sent.length = 0;
const allowed = await attempt(rw, "cloud", "POST", "/servers/1/actions/poweron");
assert("G3: with HETZNER_MCP_ALLOW_WRITES=1 a POST reaches fetch", allowed.ok && fetched === 1 && sent[0] === "POST /v1/servers/1/actions/poweron");

// 3. Through a real MCP client: a write tool with the default configuration never reaches fetch.
async function call(cfg: HetznerConfig, name: string, args: Record<string, unknown>) {
  const server = new McpServer({ name: "hetzner-mcp", version: "test" });
  registerAllTools(server, cfg, {});
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
  await client.close();
  return { text: r.content.map((c) => c.text).join("\n"), isError: !!r.isError };
}
const rwTools = loadConfig({ ...CREDS, HETZNER_MCP_ALLOW_WRITES: "1" });
// Simulate a tool that forgot its own check: the per-tool flag says writable, the shared gate
// must still decide from the config the request carries.
fetched = 0;
const viaGeneric = await call({ ...rwTools, readOnly: undefined as unknown as boolean }, "robot_request", { method: "POST", path: "/reset/321", body: { type: "hw" }, confirm: true });
assert("G4: robot_request POST with an unset readOnly is refused before fetch", viaGeneric.isError && fetched === 0);

globalThis.fetch = realFetch;
process.stdout.write(`\n${passed}/${total} write-gate checks passed\n`);
if (passed !== total) process.exitCode = 1;
