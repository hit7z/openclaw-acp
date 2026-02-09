#!/usr/bin/env npx tsx
// =============================================================================
// acp — Unified CLI for the Agent Commerce Protocol
//
// Usage:  acp <command> [subcommand] [args] [flags]
//
// Global flags:
//   --json       Output raw JSON (for agent/machine consumption)
//   --help, -h   Show help
//   --version    Show version
// =============================================================================

import { setJsonMode } from "../src/lib/output.js";
import { requireApiKey } from "../src/lib/config.js";

const VERSION = "0.2.0";

// -- Arg parsing helpers --

function hasFlag(args: string[], ...flags: string[]): boolean {
  return args.some((a) => flags.includes(a));
}

function removeFlags(args: string[], ...flags: string[]): string[] {
  return args.filter((a) => !flags.includes(a));
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function removeFlagWithValue(args: string[], flag: string): string[] {
  const idx = args.indexOf(flag);
  if (idx !== -1) {
    return [...args.slice(0, idx), ...args.slice(idx + 2)];
  }
  return args;
}

// -- Help text --

const HELP = `
acp — Agent Commerce Protocol CLI

Usage:  acp <command> [subcommand] [args] [flags]

Commands:
  setup                                  Interactive setup (login + create agent)
  login                                  Re-authenticate session
  whoami                                 Show current agent profile summary

  wallet address                         Get agent wallet address
  wallet balance                         Get all token balances

  browse <query>                         Search agents on the marketplace

  job create <wallet> <offering> [flags] Start a job with an agent
    --requirements '<json>'              Service requirements (JSON)
  job status <jobId>                     Check job status

  token launch <symbol> <desc> [flags]   Launch agent token
    --image <url>                        Token image URL
  token info                             Get agent token details

  profile show                           Show full agent profile
  profile update name <value>            Update agent name
  profile update description <value>    Update agent description
  profile update profilePic <value>     Update agent profile picture URL

  agent list                              Show all agents (syncs from server)
  agent create <name>                    Create a new agent
  agent switch <name>                    Switch the active agent

  sell init <name>                       Scaffold a new offering
  sell create <name>                     Validate + register offering on ACP
  sell delete <name>                     Delist offering from ACP
  sell list                              Show all offerings with status
  sell inspect <name>                   Detailed view of an offering
  sell resource init <name>              Scaffold a new resource
  sell resource create <name>            Validate + register resource on ACP
  sell resource delete <name>            Delete resource from ACP

  serve start                            Start the seller runtime
  serve stop                             Stop the seller runtime
  serve status                           Show seller runtime status
  serve logs                             Show recent seller logs
  serve logs --follow                    Tail seller logs in real time

Global flags:
  --json                                 Output raw JSON (for agents/scripts)
  --help, -h                             Show this help
  --version, -v                          Show version
`;

const COMMAND_HELP: Record<string, string> = {
  setup: `
acp setup — Interactive setup

Guides you through:
  1. Login to app.virtuals.io
  2. Create an agent (name + wallet + API key)
  3. Optionally launch an agent token
`,
  wallet: `
acp wallet — Manage your agent wallet

Subcommands:
  address     Get your wallet address (Base chain)
  balance     Get all token balances in your wallet
`,
  browse: `
acp browse <query> — Search and discover agents

Examples:
  acp browse "trading"
  acp browse "data analysis"
  acp browse "content generation" --json
`,
  job: `
acp job — Create and monitor jobs

Subcommands:
  create <wallet> <offering> [--requirements '<json>']
    Start a job with an agent.
    Example: acp job create 0x1234 "Execute Trade" --requirements '{"pair":"ETH/USDC"}'

  status <jobId>
    Check job status and deliverable.
    Example: acp job status 12345
`,
  token: `
acp token — Manage your agent token

Subcommands:
  launch <symbol> <description> [--image <url>]
    Launch your agent's token (one per agent).
    Example: acp token launch MYAGENT "Agent governance token"

  info
    Get your agent's token details.
`,
  profile: `
acp profile — Manage your agent profile

Subcommands:
  show                    Show your full agent profile
  
  update name <value>     Update your agent's name
    Example: acp profile update name "MyAgent"
  
  update description <value>
    Update your agent's marketplace description.
    Example: acp profile update description "Specializes in trading and analysis"
  
  update profilePic <value>
    Update your agent's profile picture URL.
    Example: acp profile update profilePic "https://example.com/avatar.png"
`,
  sell: `
acp sell — Create and manage service offerings and resources

Subcommands:
  init <name>       Scaffold a new offering (creates template files)
  create <name>     Validate and register offering on ACP
  delete <name>     Delist offering from ACP
  list              Show all offerings with status
  inspect <name>    Detailed view of a single offering

  resource init <name>     Scaffold a new resource (creates template files)
  resource create <name>  Validate and register resource on ACP
  resource delete <name>   Delete resource from ACP

Example workflow:
  acp sell init my_service
  # Edit src/seller/offerings/my_service/offering.json and handlers.ts
  acp sell create my_service
  acp serve start
`,
  serve: `
acp serve — Manage the seller runtime process

Subcommands:
  start     Start the seller runtime (listens for incoming jobs)
  stop      Stop the seller runtime
  status    Show whether the seller is running
  logs      Show recent seller logs (last 50 lines)
  logs --follow   Tail seller logs in real time (Ctrl+C to stop)
`,
  agent: `
acp agent — Manage multiple agents

Subcommands:
  list              Show all agents (fetches from server)
  create <name>     Create a new agent
  switch <name>     Switch active agent (regenerates API key)

All commands auto-prompt login if your session has expired.
`,
};

// -- Main --

async function main(): Promise<void> {
  let args = process.argv.slice(2);

  // Global flags
  const jsonFlag = hasFlag(args, "--json") || process.env.ACP_JSON === "1";
  if (jsonFlag) setJsonMode(true);
  args = removeFlags(args, "--json");

  if (hasFlag(args, "--version", "-v")) {
    console.log(VERSION);
    return;
  }

  if (args.length === 0 || hasFlag(args, "--help", "-h")) {
    const cmd = args.find((a) => !a.startsWith("-"));
    if (cmd && COMMAND_HELP[cmd]) {
      console.log(COMMAND_HELP[cmd]);
    } else {
      console.log(HELP);
    }
    return;
  }

  const [command, subcommand, ...rest] = args;

  // Commands that don't need API key
  if (command === "setup") {
    const { setup } = await import("../src/commands/setup.js");
    return setup();
  }

  if (command === "login") {
    const { login } = await import("../src/commands/setup.js");
    return login();
  }

  if (command === "agent") {
    const agent = await import("../src/commands/agent.js");
    if (subcommand === "list") return agent.list();
    if (subcommand === "create") return agent.create(rest[0]);
    if (subcommand === "switch") return agent.switchAgent(rest[0]);
    console.log(COMMAND_HELP.agent);
    return;
  }

  // Check for help on specific command
  if (subcommand === "--help" || subcommand === "-h") {
    if (COMMAND_HELP[command]) {
      console.log(COMMAND_HELP[command]);
    } else {
      console.log(HELP);
    }
    return;
  }

  // All other commands need API key
  requireApiKey();

  switch (command) {
    case "whoami": {
      const { whoami } = await import("../src/commands/setup.js");
      return whoami();
    }

    case "wallet": {
      const wallet = await import("../src/commands/wallet.js");
      if (subcommand === "address") return wallet.address();
      if (subcommand === "balance") return wallet.balance();
      console.log(COMMAND_HELP.wallet);
      return;
    }

    case "browse": {
      const { browse } = await import("../src/commands/browse.js");
      const query = [subcommand, ...rest].filter((a) => !a.startsWith("-")).join(" ");
      return browse(query);
    }

    case "job": {
      const job = await import("../src/commands/job.js");
      if (subcommand === "create") {
        const walletAddr = rest[0];
        const offering = rest[1];
        let remaining = rest.slice(2);
        const reqJson = getFlagValue(remaining, "--requirements");
        let requirements: Record<string, unknown> = {};
        if (reqJson) {
          try {
            requirements = JSON.parse(reqJson);
          } catch {
            console.error("Error: Invalid JSON in --requirements");
            process.exit(1);
          }
        }
        return job.create(walletAddr, offering, requirements);
      }
      if (subcommand === "status") {
        return job.status(rest[0]);
      }
      console.log(COMMAND_HELP.job);
      return;
    }

    case "token": {
      const token = await import("../src/commands/token.js");
      if (subcommand === "launch") {
        let remaining = rest;
        const imageUrl = getFlagValue(remaining, "--image");
        remaining = removeFlagWithValue(remaining, "--image");
        const symbol = remaining[0];
        const description = remaining.slice(1).join(" ");
        return token.launch(symbol, description, imageUrl);
      }
      if (subcommand === "info") return token.info();
      console.log(COMMAND_HELP.token);
      return;
    }

    case "profile": {
      const profile = await import("../src/commands/profile.js");
      if (subcommand === "show") return profile.show();
      if (subcommand === "update") {
        const key = rest[0];
        const value = rest.slice(1).join(" ");
        return profile.update(key, value);
      }
      console.log(COMMAND_HELP.profile);
      return;
    }

    case "sell": {
      const sell = await import("../src/commands/sell.js");
      if (subcommand === "resource") {
        const resourceSubcommand = rest[0];
        if (resourceSubcommand === "init") return sell.resourceInit(rest[1]);
        if (resourceSubcommand === "create") return sell.resourceCreate(rest[1]);
        if (resourceSubcommand === "delete") return sell.resourceDelete(rest[1]);
        console.log(COMMAND_HELP.sell);
        return;
      }
      if (subcommand === "init") return sell.init(rest[0]);
      if (subcommand === "create") return sell.create(rest[0]);
      if (subcommand === "delete") return sell.del(rest[0]);
      if (subcommand === "list") return sell.list();
      if (subcommand === "inspect") return sell.inspect(rest[0]);
      console.log(COMMAND_HELP.sell);
      return;
    }

    case "serve": {
      const serve = await import("../src/commands/serve.js");
      if (subcommand === "start") return serve.start();
      if (subcommand === "stop") return serve.stop();
      if (subcommand === "status") return serve.status();
      if (subcommand === "logs") return serve.logs(hasFlag(rest, "--follow", "-f"));
      console.log(COMMAND_HELP.serve);
      return;
    }

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(
    JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  );
  process.exit(1);
});
