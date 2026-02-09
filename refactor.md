# ACP CLI Refactor Plan

## Goal

Transform openclaw-acp from an OpenClaw-specific skill pack into a standalone, polished CLI tool (`acp`) that works for both humans and AI agents (Claude, Cursor, OpenClaw, etc.). Single binary, subcommands, dual output mode, npm-publishable.

---

## Current State (Problems)

1. **Fragmented entry points** — `scripts/index.ts` for tools, `seller/seller_cli.ts` for seller management, `npm run *` scripts. No single CLI.
2. **No `bin` field** — can't `npx` or globally install. Requires git clone + manual setup.
3. **No `--help`, no discoverability** — users must read docs to know what commands exist.
4. **Output is agent-only** — everything is raw JSON. No human-friendly formatting.
5. **No command grouping** — flat tool names (`browse_agents`, `get_wallet_balance`) instead of logical subcommands.
6. **Setup UX is clunky** — manual "press Enter when done" polling, no auto-browser-open.
7. **Seller system is hidden** — powerful but buried under npm scripts with no scaffolding.
8. **`get_wallet_address` referenced in SKILL.md but missing from code.**
9. **Config is repo-local only** — no user-level config story.

---

## CLI Command Structure

```
acp <command> [subcommand] [args] [flags]

Global flags:
  --json          Force JSON output (for agent consumption)
  --help, -h      Show help
  --version, -v   Show version
```

### Commands

```
acp setup                              # Interactive setup (login + select/create agent + optional token)
acp login                              # Re-authenticate (refresh session)
acp whoami                             # Show agent name, wallet, API key (redacted)

acp agent list                         # Show all agents (syncs from server if session valid)
acp agent create <name>                # Create a new agent (requires login session)
acp agent switch <name>                # Switch the active agent

acp wallet address                     # Get wallet address
acp wallet balance                     # Get all token balances

acp browse <query>                     # Search agents on marketplace

acp job create <wallet> <offering> [--requirements '{}']   # Start a job
acp job status <jobId>                 # Poll job status

acp token launch <symbol> <description> [--image <url>]    # Launch agent token
acp token info                         # Get token details (via get_my_info)

acp profile show                       # Show agent profile
acp profile update <description>       # Update agent description

acp sell init <offering_name>          # Scaffold new offering (template files)
acp sell create <offering_name>        # Validate + register offering on ACP
acp sell delete <offering_name>        # Delist offering from ACP
acp sell list                          # Show all offerings with status
acp sell inspect <offering_name>       # Detailed view of single offering

acp serve start                        # Start seller runtime (daemonized)
acp serve stop                         # Stop seller runtime
acp serve status                       # Show runtime process info + offerings
acp serve logs [--follow]              # Tail seller runtime logs
```

---

## Setup Flow & Multi-Agent Support

One user (login) can own multiple agents, each with its own name, wallet, and API key. The setup flow fetches the user's agents from the server after login and lets them choose.

### `acp setup` Flow

```
Step 1: Login
  ├─ Valid session exists? → skip
  └─ No session → open browser → authenticate → store session token (30min)

Step 2: Select or create agent
  ├─ GET /api/agents/lite/keys → fetch all agents for this user
  ├─ Merge server agents into local config.json (dedup by agent id)
  ├─ Display numbered list:
  │     [1] AgentAlpha (active)
  │         Wallet:  0xabc...
  │         API Key: apt_...
  │     [2] AgentBeta
  │         Wallet:  0xdef...
  │         API Key: apt_...
  │     [3] Create a new agent
  │
  ├─ User picks existing → activate it (set LITE_AGENT_API_KEY + active flag)
  └─ User picks "create new" →
       POST /api/agents/lite/key { name } → save to config + activate

Step 3: Optional token launch (Y/n)
  └─ Delegates to `acp token launch`
```

### API Endpoints (Auth Service: acpx.virtuals.io)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/lite/auth-url` | None | Get OAuth login URL + requestId |
| GET | `/api/auth/lite/auth-status?requestId=...` | None | Poll login completion → session token |
| GET | `/api/agents/lite/keys` | Bearer session | List all agents for the authenticated user |
| POST | `/api/agents/lite/key` | Bearer session | Create a new agent (name → id, apiKey, wallet) |

### Multi-Agent Config (`config.json`)

```json
{
  "SESSION_TOKEN": { "token": "...", "expiry": "..." },
  "LITE_AGENT_API_KEY": "apt_active_key_here",
  "agents": [
    { "id": "1", "name": "AgentAlpha", "apiKey": "apt_...", "walletAddress": "0x...", "active": true },
    { "id": "2", "name": "AgentBeta",  "apiKey": "apt_...", "walletAddress": "0x...", "active": false }
  ]
}
```

- `LITE_AGENT_API_KEY` always reflects the active agent's key (used by all other commands)
- `agents[].active` tracks which agent is selected
- `acp agent switch <name>` updates both the active flag and `LITE_AGENT_API_KEY`
- Server sync happens during `acp setup` — merges by agent `id`, preserves local `active` flag

### Auto-Login (`ensureSession`)

Commands that need a session token (`agent list`, `agent create`, `setup`) call `ensureSession()` which:
1. Checks for a valid (non-expired) session token in config
2. If valid → returns it immediately, no interruption
3. If expired/missing → automatically triggers the interactive login flow (open browser, print link, wait for user)
4. Returns the fresh token

This means **no command ever tells you "go run `acp login` first"**. If your session expired while you're running `acp agent list`, it just prompts you to authenticate inline and continues.

The login flow is CLI-initiated — it prints a link and tries to auto-open a browser. For headless agents (Telegram, computer-use), the link is just forwarded as text for the user to authenticate on any device.

### Graceful Degradation

If the list-agents server endpoint fails (network error, server down), the CLI falls back to locally saved agents in `config.json` with a warning. `acp agent switch` is fully local and never requires a session.

---

## Dual Output Mode

- **Default**: Human-friendly, colored terminal output with tables and formatting
- **`--json` flag** or `ACP_JSON=1` env var: Raw JSON output for agent/machine consumption
- Agent `.md` instruction files tell agents to use `--json`
- Same binary serves both audiences

---

## File Structure (Target)

```
openclaw-acp/
├── bin/
│   └── acp.ts                    # CLI entry point, routes to command handlers
├── src/
│   ├── commands/
│   │   ├── setup.ts              # acp setup / acp login / acp whoami
│   │   ├── agent.ts              # acp agent list / acp agent switch
│   │   ├── wallet.ts             # acp wallet *
│   │   ├── browse.ts             # acp browse
│   │   ├── job.ts                # acp job *
│   │   ├── token.ts              # acp token *
│   │   ├── profile.ts            # acp profile *
│   │   ├── sell.ts               # acp sell *
│   │   └── serve.ts              # acp serve *
│   ├── lib/
│   │   ├── auth.ts               # Auth + agent management API (acpx.virtuals.io)
│   │   ├── client.ts             # Axios HTTP client (from scripts/client.ts)
│   │   ├── config.ts             # Config management + multi-agent helpers
│   │   ├── output.ts             # Dual-mode output with ANSI colors
│   │   ├── open.ts               # Cross-platform browser opener
│   │   ├── api.ts                # ACP API wrappers (from scripts/api.ts)
│   │   └── wallet.ts             # Wallet utilities (from scripts/wallet.ts)
│   └── seller/
│       ├── runtime/
│       │   ├── seller.ts         # Main seller runtime (from seller/runtime/seller.ts)
│       │   ├── acpSocket.ts      # WebSocket connection (from seller/runtime/acpSocket.ts)
│       │   ├── offerings.ts      # Offering loader (from seller/runtime/offerings.ts)
│       │   ├── sellerApi.ts      # Seller API calls (from seller/runtime/sellerApi.ts)
│       │   ├── types.ts          # ACP enums/interfaces (from seller/runtime/types.ts)
│       │   └── offeringTypes.ts  # Handler contracts (from seller/runtime/offeringTypes.ts)
│       └── offerings/            # User-created offerings (stays here)
│           └── <name>/
│               ├── offering.json
│               └── handlers.ts
├── references/                   # Agent instruction files (updated for new CLI syntax)
│   ├── acp-job.md
│   ├── agent-token.md
│   ├── agent-wallet.md
│   └── seller.md
├── logs/                         # Seller runtime logs (git-ignored)
├── SKILL.md                      # Agent skill description (updated for new CLI syntax)
├── README.md                     # Updated for new CLI
├── package.json                  # Added "bin" field, updated scripts
├── tsconfig.json
├── config.json                   # Credentials + agents array (git-ignored)
└── refactor.md                   # This file
```

---

## Implementation Phases

### Phase 1: Unified CLI entry point ✅
- Create `bin/acp.ts` as the single entry point
- Create `src/commands/` with one file per command group
- Create `src/lib/output.ts` for dual-mode output (human + `--json`)
- Move existing logic from `scripts/index.ts` and `seller/seller_cli.ts` into command handlers
- Move shared code from `scripts/` into `src/lib/`
- Add `"bin": { "acp": "./bin/acp.ts" }` to package.json
- Add `--help` at every command level
- Hand-rolled arg parsing (no new dependencies)

### Phase 2: Quality of life ✅
- `acp sell init` scaffolding command (generates template offering.json + handlers.ts)
- `acp serve logs` with file-based seller logging (`logs/seller.log`)
- `acp whoami` command
- Auto-open browser during login (platform-specific: `open`/`start`/`xdg-open`)
- ANSI colored output for human mode (TTY-aware, degrades gracefully)

### Phase 3: Polish and multi-agent ✅
- Update all `.md` reference files for new CLI syntax
- Update SKILL.md for agent instructions
- Update README.md
- Add tsconfig.json for proper build
- Multi-agent support:
  - `GET /api/agents/lite/keys` — fetch user's agents from server after login
  - Server → local sync with deduplication by agent id
  - Setup flow: login → fetch agents → select existing or create new
  - `acp agent list` / `acp agent switch <name>` commands
  - `config.json` stores `agents[]` array with active flag
  - Graceful degradation if list-agents API unavailable

### Phase 4: Not yet done
- npm publish setup (package distribution)
- Remove old `scripts/` and `seller/` directories

---

## What Does NOT Change

- **Agent `.md` instruction files** — core value prop, just updated for new syntax
- **Seller runtime architecture** — WebSocket + dynamic handler loading is solid
- **offering.json + handlers.ts pattern** — simple and extensible
- **API layer** — axios client, ACP endpoints, all stay the same
- **Product concept** — wallet + marketplace + token

---

## Dependency Policy

No new runtime dependencies. The CLI framework is hand-rolled (subcommand routing + flag parsing). Current deps stay:
- `axios` — HTTP client
- `dotenv` — env loading
- `socket.io-client` — seller WebSocket

---

## Naming

CLI command is `acp` for now. Easy to swap later — only affects `bin` field in package.json and the shebang in `bin/acp.ts`.
