// =============================================================================
// acp setup — Interactive setup (login + fetch/create agent + optional token)
// acp login  — Re-authenticate
// acp whoami — Show current agent info
// =============================================================================

import readline from "readline";
import { spawn } from "child_process";
import * as output from "../lib/output.js";
import {
  readConfig,
  writeConfig,
  ROOT,
  type AgentEntry,
} from "../lib/config.js";
import {
  getValidSessionToken,
  interactiveLogin,
  ensureSession,
  fetchAgents,
  createAgentApi,
  syncAgentsToConfig,
  type AgentKeyResponse,
} from "../lib/auth.js";

// -- Helpers --

function question(
  rl: readline.Interface,
  prompt: string
): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function redactApiKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// -- Token launch --

function runLaunchMyToken(
  symbol: string,
  description: string,
  imageUrl?: string
): Promise<void> {
  const args = ["tsx", "bin/acp.ts", "token", "launch", symbol, description];
  if (imageUrl) args.push("--image", imageUrl);
  return new Promise((resolve, reject) => {
    const child = spawn("npx", args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
    });
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`Exit ${code}`))
    );
  });
}

// -- Select agent flow --

/** Let the user pick an existing agent or create a new one. */
async function selectOrCreateAgent(
  rl: readline.Interface,
  sessionToken: string
): Promise<void> {
  // Fetch agents from server
  output.log("\n  Fetching your agents...\n");
  let serverAgents: AgentKeyResponse[] = [];
  try {
    serverAgents = await fetchAgents(sessionToken);
  } catch (e) {
    output.warn(
      `Could not fetch agents from server: ${e instanceof Error ? e.message : String(e)}`
    );
    output.log("  Falling back to locally saved agents.\n");
  }

  // Merge server agents into local config
  const agents = serverAgents.length > 0
    ? syncAgentsToConfig(serverAgents)
    : (readConfig().agents ?? []);

  if (agents.length > 0) {
    output.log(`  You have ${agents.length} agent(s):\n`);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const marker = a.active ? output.colors.green(" (active)") : "";
      output.log(
        `    ${output.colors.bold(`[${i + 1}]`)} ${a.name}${marker}`
      );
      output.log(`        Wallet:  ${a.walletAddress}`);
      output.log(`        API Key: ${redactApiKey(a.apiKey)}`);
    }
    output.log(`    ${output.colors.bold(`[${agents.length + 1}]`)} Create a new agent\n`);

    const choice = (
      await question(rl, `  Select agent [1-${agents.length + 1}]: `)
    ).trim();
    const choiceNum = parseInt(choice, 10);

    if (choiceNum >= 1 && choiceNum <= agents.length) {
      // Use existing agent
      const selected = agents[choiceNum - 1];
      activateAgent(selected);
      output.success(`Active agent: ${selected.name}`);
      output.log(`    Wallet:  ${selected.walletAddress}`);
      output.log(`    API Key: ${redactApiKey(selected.apiKey)}\n`);
      return;
    }
    // Fall through to create new agent
  }

  // Create new agent
  output.log("  Create a new agent\n");
  const agentName = (await question(rl, "  Enter agent name: ")).trim();
  if (!agentName) {
    output.log("  No name entered. Skipping agent creation.\n");
    return;
  }

  try {
    const result = await createAgentApi(sessionToken, agentName);
    if (!result?.apiKey) {
      output.error("Create agent failed — no API key returned.");
      return;
    }

    // Add to local config and activate
    const config = readConfig();
    const updatedAgents = (config.agents ?? []).map((a) => ({
      ...a,
      active: false,
    }));
    const newAgent: AgentEntry = {
      name: result.name || agentName,
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

    output.success(`Agent created: ${newAgent.name}`);
    output.log(`    Wallet:  ${newAgent.walletAddress}`);
    output.log(`    API key: ${redactApiKey(newAgent.apiKey)} (saved to config.json)\n`);
  } catch (e) {
    output.error(
      `Create agent failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/** Set an agent as active in config. */
function activateAgent(agent: AgentEntry): void {
  const config = readConfig();
  const agents = (config.agents ?? []).map((a) => ({
    ...a,
    active: a.id === agent.id,
  }));
  writeConfig({
    ...config,
    agents,
    LITE_AGENT_API_KEY: agent.apiKey,
  });
}

// =============================================================================
// Exported commands
// =============================================================================

export async function setup(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    output.heading("ACP Setup");

    // Step 1: Login (auto-prompts if session expired)
    output.log("\n  Step 1: Log in to app.virtuals.io\n");
    const sessionToken = await ensureSession(rl);

    // Step 2: Fetch agents from server → select existing or create new
    output.log("  Step 2: Select or create agent\n");
    await selectOrCreateAgent(rl, sessionToken);

    // Step 3: Optional token launch
    const config = readConfig();
    if (!config.LITE_AGENT_API_KEY) {
      output.log(
        "  No active agent. Run setup again or:\n    acp token launch <symbol> <description>\n"
      );
    } else {
      output.log("  Step 3: Launch your agent token (optional)\n");
      output.log(
        "  Tokenize your agent to unlock funding and revenue streams:\n" +
          "    - Capital formation — raise funds for development and compute costs\n" +
          "    - Revenue generation — earn from trading fees, sent to your wallet\n" +
          "    - Enhanced capabilities — use funds to procure services on ACP\n" +
          "    - Value accrual — token gains value as your agent grows\n" +
          "\n  Each agent can launch one unique token. This is optional.\n"
      );

      const launch = (
        await question(rl, "  Launch your agent token now? (Y/n): ")
      )
        .trim()
        .toLowerCase();
      if (launch === "y" || launch === "yes" || launch === "") {
        const symbol = (await question(rl, "  Token symbol (e.g. MYAGENT): ")).trim();
        const desc = (await question(rl, "  Token description: ")).trim();
        const imageUrl = (
          await question(rl, "  Image URL (optional, Enter to skip): ")
        ).trim();
        if (!symbol || !desc) {
          output.log("  Symbol and description required. Skipping.\n");
        } else {
          try {
            await runLaunchMyToken(symbol, desc, imageUrl || undefined);
            output.success("Token launched successfully!\n");
          } catch {
            output.log(
              "\n  Token launch failed. Try later: acp token launch <symbol> <description>\n"
            );
          }
        }
      }
    }

    output.success("Setup complete. Run `acp --help` to see available commands.\n");
  } finally {
    rl.close();
  }
}

export async function login(): Promise<void> {
  output.heading("ACP Login");
  await interactiveLogin();
}

export async function whoami(): Promise<void> {
  const config = readConfig();
  const key = config.LITE_AGENT_API_KEY;

  if (!key) {
    output.fatal("Not configured. Run `acp setup` first.");
  }

  const { getMyAgentInfo } = await import("../lib/wallet.js");
  try {
    const info = await getMyAgentInfo();
    const agents = config.agents ?? [];
    const agentCount = agents.length;

    output.output({ ...info, agentCount }, (data) => {
      output.heading("Agent Profile");
      output.field("Name", data.name);
      output.field("Wallet", data.walletAddress);
      output.field("API Key", redactApiKey(key!));
      output.field("Description", data.description || "(none)");
      output.field("Token", data.tokenAddress || "(none)");
      output.field("Offerings", String(data.jobOfferings?.length ?? 0));
      if (agentCount > 1) {
        output.field("Saved Agents", String(agentCount));
        output.log(`\n  Use ${output.colors.cyan("acp agent list")} to see all agents.`);
      }
      output.log("");
    });
  } catch (e) {
    output.fatal(
      `Failed to fetch agent info: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
