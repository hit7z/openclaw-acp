// =============================================================================
// Auth + Agent management API (acpx.virtuals.io)
// Shared by setup.ts, agent.ts, and any command needing session-based APIs.
// =============================================================================

import readline from "readline";
import axios, { type AxiosInstance } from "axios";
import * as output from "./output.js";
import { openUrl } from "./open.js";
import {
  readConfig,
  writeConfig,
  type AgentEntry,
} from "./config.js";

const API_URL = "https://acpx.virtuals.io";

// -- Response types --

export interface AuthUrlResponse {
  authUrl: string;
  requestId: string;
}

export interface AuthStatusResponse {
  token: string;
}

export interface AgentKeyResponse {
  id: string;
  name: string;
  apiKey: string;
  walletAddress: string;
}

// -- HTTP clients --

function apiClient(): AxiosInstance {
  return axios.create({
    baseURL: API_URL,
    headers: { "Content-Type": "application/json" },
  });
}

function apiClientWithSession(sessionToken: string): AxiosInstance {
  return axios.create({
    baseURL: API_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
  });
}

// -- Session token --

/** Decode the exp claim from a JWT without verifying the signature. */
function getJwtExpiry(token: string): Date | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (typeof payload.exp === "number") {
      return new Date(payload.exp * 1000); // exp is seconds since epoch
    }
    return null;
  } catch {
    return null;
  }
}

export function getValidSessionToken(): string | null {
  const config = readConfig();
  const token = config?.SESSION_TOKEN?.token;
  if (!token) return null;

  const expiry = getJwtExpiry(token);
  if (!expiry || expiry <= new Date()) return null;
  return token;
}

export function storeSessionToken(token: string): void {
  const config = readConfig();
  writeConfig({ ...config, SESSION_TOKEN: { token } });
}

// -- Auth API --

export async function getAuthUrl(): Promise<AuthUrlResponse> {
  const { data } = await apiClient().get<{ data: AuthUrlResponse }>(
    "/api/auth/lite/auth-url"
  );
  return data.data;
}

export async function getAuthStatus(requestId: string): Promise<AuthStatusResponse> {
  const { data } = await apiClient().get<{ data: AuthStatusResponse }>(
    `/api/auth/lite/auth-status?requestId=${requestId}`
  );
  return data.data;
}

// -- Agent API --

/** Fetch all agents belonging to the authenticated user. */
export async function fetchAgents(sessionToken: string): Promise<AgentKeyResponse[]> {
  const { data } = await apiClientWithSession(sessionToken).get<{
    data: AgentKeyResponse[];
  }>("/api/agents/lite/keys");
  return data.data;
}

/** Create a new agent for the authenticated user. */
export async function createAgentApi(
  sessionToken: string,
  agentName: string
): Promise<AgentKeyResponse> {
  const { data } = await apiClientWithSession(sessionToken).post<{
    data: AgentKeyResponse;
  }>("/api/agents/lite/key", {
    data: { name: agentName.trim() },
  });
  return data.data;
}

// -- Interactive login --

function question(
  rl: readline.Interface,
  prompt: string
): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

/**
 * Interactive login flow. Opens browser, waits for user to authenticate.
 * Can be called with an existing readline interface (from setup) or creates its own.
 */
export async function interactiveLogin(rl?: readline.Interface): Promise<void> {
  const ownsRl = !rl;
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  try {
    let authDone = false;
    while (!authDone) {
      let authUrl: string;
      let requestId: string;
      try {
        const auth = await getAuthUrl();
        authUrl = auth.authUrl;
        requestId = auth.requestId;
      } catch (e) {
        output.error(
          `Could not get login link: ${e instanceof Error ? e.message : String(e)}`
        );
        await question(rl, "Press Enter to retry or Ctrl+C to exit.");
        continue;
      }

      output.log(`  Opening browser...`);
      openUrl(authUrl);
      output.log(`  Login link: ${authUrl}\n`);
      output.log("  Complete login in your browser, then press ENTER.\n");
      await question(rl, "");

      try {
        const status = await getAuthStatus(requestId);
        if (status.token) {
          storeSessionToken(status.token);
          output.success("Login success. Session stored (expires in 30 minutes).\n");
          authDone = true;
        } else {
          output.log("  Login incomplete. Press ENTER to retry or Ctrl+C to exit.\n");
          await question(rl, "");
        }
      } catch (e) {
        output.error(
          `Login check failed: ${e instanceof Error ? e.message : String(e)}`
        );
        await question(rl, "Press ENTER to retry or Ctrl+C to exit.\n");
      }
    }
  } finally {
    if (ownsRl) rl.close();
  }
}

/**
 * Ensure we have a valid session token. If expired/missing, auto-prompts login.
 * Returns the valid session token, or calls process.exit if login fails.
 */
export async function ensureSession(rl?: readline.Interface): Promise<string> {
  const existing = getValidSessionToken();
  if (existing) return existing;

  output.warn("Session expired or not found. Logging in...\n");
  await interactiveLogin(rl);

  const token = getValidSessionToken();
  if (!token) {
    output.fatal("Login failed. Cannot continue.");
  }
  return token;
}

// -- Agent sync --

/** Merge server agents into local config. Returns the merged list. */
export function syncAgentsToConfig(serverAgents: AgentKeyResponse[]): AgentEntry[] {
  const config = readConfig();
  const localAgents = config.agents ?? [];

  const merged = new Map<string, AgentEntry>();

  for (const a of localAgents) {
    merged.set(a.id, a);
  }

  for (const s of serverAgents) {
    const existing = merged.get(s.id);
    merged.set(s.id, {
      id: s.id,
      name: s.name,
      apiKey: s.apiKey,
      walletAddress: s.walletAddress,
      active: existing?.active ?? false,
    });
  }

  const agents = Array.from(merged.values());
  writeConfig({ ...config, agents });
  return agents;
}
