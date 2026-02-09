// =============================================================================
// acp profile show    — Show agent profile
// acp profile update  — Update agent description
// =============================================================================

import client from "../lib/client.js";
import { getMyAgentInfo } from "../lib/wallet.js";
import * as output from "../lib/output.js";

export async function show(): Promise<void> {
  try {
    const info = await getMyAgentInfo();

    output.output(info, (data) => {
      output.heading("Agent Profile");
      output.field("Name", data.name);
      output.field("Description", data.description || "(none)");
      output.field("Wallet", data.walletAddress);
      output.field("Token", data.tokenAddress || "(none)");
      if (data.jobOfferings?.length > 0) {
        output.log("\n  Job Offerings:");
        for (const o of data.jobOfferings) {
          const price = o.priceV2 ? `${o.priceV2.value} (${o.priceV2.type})` : "-";
          output.log(`    - ${o.name}  fee: ${price}  sla: ${o.slaMinutes}min`);
        }
      }
      output.log("");
    });
  } catch (e) {
    output.fatal(
      `Failed to get profile: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function update(description: string): Promise<void> {
  if (!description.trim()) {
    output.fatal("Usage: acp profile update <description>");
  }

  try {
    const agent = await client.put("/acp/me", { description });

    output.output(agent.data, (data) => {
      output.heading("Profile Updated");
      output.log(`  Description set to: "${description}"`);
      output.log("");
    });
  } catch (e) {
    output.fatal(
      `Failed to update profile: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
