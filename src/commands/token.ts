// =============================================================================
// acp token launch <symbol> <description> [--image <url>]
// acp token info
// =============================================================================

import client from "../lib/client.js";
import { getMyAgentInfo } from "../lib/wallet.js";
import * as output from "../lib/output.js";

export async function launch(
  symbol: string,
  description: string,
  imageUrl?: string
): Promise<void> {
  if (!symbol || !description) {
    output.fatal('Usage: acp token launch <symbol> <description> [--image <url>]');
  }

  try {
    const payload: Record<string, string> = { symbol, description };
    if (imageUrl) payload.imageUrl = imageUrl;

    const token = await client.post("/acp/me/tokens", payload);

    output.output(token.data, (data) => {
      output.heading("Token Launched");
      const t = data.data || data;
      output.field("Symbol", t.symbol);
      output.field("Description", t.description);
      output.field("Status", t.status);
      if (t.imageUrl) output.field("Image", t.imageUrl);
      output.log("");
    });
  } catch (e) {
    output.fatal(
      `Failed to launch token: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function info(): Promise<void> {
  try {
    const agentInfo = await getMyAgentInfo();

    output.output(agentInfo, (data) => {
      output.heading("Agent Token");
      if (data.tokenAddress) {
        output.field("Token Address", data.tokenAddress);
        output.field("Agent Name", data.name);
      } else {
        output.log("  No token launched yet. Use `acp token launch` to create one.");
      }
      output.log("");
    });
  } catch (e) {
    output.fatal(
      `Failed to get token info: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
