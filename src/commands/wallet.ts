// =============================================================================
// acp wallet address — Get wallet address
// acp wallet balance — Get token balances
// =============================================================================

import client from "../lib/client.js";
import { getMyAgentInfo } from "../lib/wallet.js";
import * as output from "../lib/output.js";

interface WalletBalance {
  network: string;
  symbol: string;
  tokenAddress: string;
  tokenBalance: string;
  decimals: number;
  tokenPrices: { usd: number }[];
  tokenMetadata: {
    decimals: number | null;
    logo: string | null;
    name: string | null;
    symbol: string | null;
  };
}

export async function address(): Promise<void> {
  try {
    const info = await getMyAgentInfo();
    output.output({ walletAddress: info.walletAddress }, (data) => {
      output.heading("Agent Wallet");
      output.field("Address", data.walletAddress);
      output.log("");
    });
  } catch (e) {
    output.fatal(
      `Failed to get wallet address: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function balance(): Promise<void> {
  try {
    const balances = await client.get<{ data: WalletBalance[] }>(
      "/acp/wallet-balances"
    );

    const data = balances.data.data.map((token) => ({
      network: token.network,
      symbol: token.symbol,
      tokenAddress: token.tokenAddress,
      tokenBalance: token.tokenBalance,
      tokenMetadata: token.tokenMetadata,
      decimals: token.decimals,
      tokenPrices: token.tokenPrices,
    }));

    output.output(data, (tokens) => {
      output.heading("Wallet Balances");
      if (tokens.length === 0) {
        output.log("  No tokens found.");
      }
      for (const t of tokens) {
        const sym = t.tokenMetadata?.symbol || t.symbol || "???";
        const name = t.tokenMetadata?.name || "";
        const price =
          t.tokenPrices?.[0]?.usd ??
          (typeof t.tokenPrices?.[0] === "object" && "value" in t.tokenPrices[0]
            ? t.tokenPrices[0].value
            : "-");
        output.log(`  ${sym.padEnd(8)} ${name.padEnd(20)} bal: ${t.tokenBalance}  price: $${price}`);
      }
      output.log("");
    });
  } catch (e) {
    output.fatal(
      `Failed to get wallet balance: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
