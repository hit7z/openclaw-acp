// =============================================================================
// acp agent list    — Show all agents (fetches from server, auto-login if needed)
// acp agent switch  — Switch the active agent (local only)
// acp agent create  — Create a new agent (auto-login if needed)
// =============================================================================

import * as output from "../lib/output.js";
import {
  readConfig,
  writeConfig,
  getActiveAgent,
  setActiveAgent,
  type AgentEntry,
} from "../lib/config.js";
import {
  ensureSession,
  fetchAgents,
  createAgentApi,
  syncAgentsToConfig,
} from "../lib/auth.js";

function redactApiKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function displayAgents(agents: AgentEntry[]): void {
  output.heading("Agents");
  for (const a of agents) {
    const marker = a.active ? output.colors.green(" (active)") : "";
    output.log(`  ${output.colors.bold(a.name)}${marker}`);
    output.log(`    ${output.colors.dim("Wallet")}  ${a.walletAddress}`);
    output.log(`    ${output.colors.dim("API Key")} ${redactApiKey(a.apiKey)}`);
    output.log("");
  }
}

export async function list(): Promise<void> {
  // Ensure session (auto-login if needed), then fetch from server
  const sessionToken = await ensureSession();
  let agents: AgentEntry[];

  try {
    const serverAgents = await fetchAgents(sessionToken);
    agents = syncAgentsToConfig(serverAgents);
  } catch (e) {
    output.warn(
      `Could not fetch agents from server: ${e instanceof Error ? e.message : String(e)}`
    );
    output.log("  Showing locally saved agents.\n");
    agents = readConfig().agents ?? [];
  }

  if (agents.length === 0) {
    output.output({ agents: [] }, () => {
      output.log("  No agents found. Run `acp agent create <name>` to create one.\n");
    });
    return;
  }

  output.output(
    agents.map((a) => ({
      name: a.name,
      id: a.id,
      walletAddress: a.walletAddress,
      apiKey: redactApiKey(a.apiKey),
      active: a.active,
    })),
    () => displayAgents(agents)
  );
}

export async function switchAgent(name: string): Promise<void> {
  if (!name) {
    output.fatal("Usage: acp agent switch <name>");
  }

  const success = setActiveAgent(name);
  if (!success) {
    const config = readConfig();
    const names = (config.agents ?? []).map((a) => a.name).join(", ");
    output.fatal(
      `Agent "${name}" not found. Available: ${names || "(none)"}`
    );
  }

  const active = getActiveAgent()!;
  output.output(
    { switched: true, name: active.name, walletAddress: active.walletAddress },
    () => {
      output.success(`Switched to agent: ${active.name}`);
      output.log(`    Wallet:  ${active.walletAddress}`);
      output.log(`    API Key: ${redactApiKey(active.apiKey)}\n`);
    }
  );
}

export async function create(name: string): Promise<void> {
  if (!name) {
    output.fatal("Usage: acp agent create <name>");
  }

  // Ensure session (auto-login if needed), then create
  const sessionToken = await ensureSession();

  try {
    const result = await createAgentApi(sessionToken, name);
    if (!result?.apiKey) {
      output.fatal("Create agent failed — no API key returned.");
    }

    // Add to local config and activate
    const config = readConfig();
    const updatedAgents = (config.agents ?? []).map((a) => ({
      ...a,
      active: false,
    }));
    const newAgent: AgentEntry = {
      name: result.name || name,
      apiKey: result.apiKey,
      walletAddress: result.walletAddress,
      id: result.id,
      active: true,
    };
    updatedAgents.push(newAgent);

    writeConfig({
      ...config,
      LITE_AGENT_API_KEY: result.apiKey,
      agents: updatedAgents,
    });

    output.output(
      {
        created: true,
        name: newAgent.name,
        id: newAgent.id,
        walletAddress: newAgent.walletAddress,
        apiKey: redactApiKey(newAgent.apiKey),
      },
      () => {
        output.success(`Agent created: ${newAgent.name}`);
        output.log(`    Wallet:  ${newAgent.walletAddress}`);
        output.log(`    API Key: ${redactApiKey(newAgent.apiKey)} (saved to config.json)\n`);
      }
    );
  } catch (e) {
    output.fatal(
      `Create agent failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
