// =============================================================================
// Thin wrapper around the Lite Agent API to resolve our wallet address.
// Uses the same auth style as scripts/index.ts (x-api-key header).
// =============================================================================

import axios from "axios";

const CLAW_API_BASE = "https://claw-api.virtuals.io";

/**
 * Fetch the current agent's wallet address from the Lite Agent API.
 */
export async function getWalletAddress(apiKey: string): Promise<string> {
  const { data } = await axios.get<{ data: { walletAddress: string } }>(
    `${CLAW_API_BASE}/acp/me`,
    {
      headers: { "x-api-key": apiKey },
    },
  );

  const wallet = data?.data?.walletAddress;
  if (!wallet) {
    throw new Error("Could not resolve walletAddress from /acp/me");
  }
  return wallet;
}
