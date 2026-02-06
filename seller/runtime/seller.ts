#!/usr/bin/env npx tsx
// =============================================================================
// Seller runtime — main entrypoint.
//
// Usage:
//   npx tsx seller/runtime/seller.ts
//   (or)  npm run seller:run
//
// Env vars:
//   ACP_URL              — ACP backend URL (default: https://acpx.virtuals.io)
//   LITE_AGENT_API_KEY   — can also be set in config.json at repo root
// =============================================================================

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { getWalletAddress } from "./acpLiteApi.js";
import { connectAcpSocket } from "./acpSocket.js";
import { acceptOrRejectJob, requestPayment, deliverJob } from "./sellerApi.js";
import { loadOffering, listOfferings } from "./offerings.js";
import { AcpJobPhase, type AcpJobEventData, type AcpMemoData } from "./types.js";
import type { ExecuteJobResult } from "./offeringTypes.js";

// ── Config ──────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const ACP_URL = process.env.ACP_URL || "https://acpx.virtuals.io";

function resolveApiKey(): string {
  if (process.env.LITE_AGENT_API_KEY?.trim()) {
    return process.env.LITE_AGENT_API_KEY.trim();
  }
  const configPath = path.join(ROOT, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const key = config?.LITE_AGENT_API_KEY;
      if (typeof key === "string" && key.trim()) return key.trim();
    } catch {
      // ignore
    }
  }
  console.error("No LITE_AGENT_API_KEY found. Run `npm run setup` or set the env var.");
  process.exit(1);
}

// ── Job handling ────────────────────────────────────────────────────────────

/**
 * Try to extract the offering name from the job event.
 * The ACP backend stores it in `context.jobOfferingName` or the first
 * negotiation-phase memo's content may include it.
 */
function resolveOfferingName(data: AcpJobEventData): string | undefined {
  return (
    data.context?.jobOfferingName ??
    data.context?.offeringName ??
    undefined
  );
}

/**
 * Try to extract the service requirements object from the job event.
 */
function resolveServiceRequirements(data: AcpJobEventData): Record<string, any> {
  // Context may carry them directly
  if (data.context?.serviceRequirements) {
    return data.context.serviceRequirements;
  }
  // Fallback: first memo whose nextPhase = NEGOTIATION often carries the buyer's request
  const reqMemo = data.memos.find((m) => m.nextPhase === AcpJobPhase.NEGOTIATION);
  if (reqMemo?.content) {
    try {
      return JSON.parse(reqMemo.content);
    } catch {
      return { raw: reqMemo.content };
    }
  }
  return {};
}

async function handleNewTask(data: AcpJobEventData): Promise<void> {
  const jobId = data.id;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[seller] New task  jobId=${jobId}  phase=${AcpJobPhase[data.phase] ?? data.phase}`);
  console.log(`         client=${data.clientAddress}  price=${data.price}`);
  console.log(`         context=${JSON.stringify(data.context)}`);
  console.log(`${"=".repeat(60)}`);

  // ── Step 1: Accept / reject ───────────────────────────────────────────

  if (data.phase === AcpJobPhase.REQUEST) {
    const offeringName = resolveOfferingName(data);
    const requirements = resolveServiceRequirements(data);

    // Optional: validate via handler
    if (offeringName) {
      try {
        const { config, handlers } = await loadOffering(offeringName);

        if (handlers.validateRequirements) {
          const valid = handlers.validateRequirements(requirements);
          if (!valid) {
            console.log(`[seller] Validation failed for offering "${offeringName}" — rejecting`);
            await acceptOrRejectJob(jobId, { accept: false, reason: "Validation failed" });
            return;
          }
        }

        // Accept the job
        await acceptOrRejectJob(jobId, { accept: true, reason: "Job accepted" });

        // ── Step 2: Payment request (if offering requires funds) ────────
        if (config.requiredFunds && handlers.requestAdditionalFunds) {
          const funds = handlers.requestAdditionalFunds(requirements);
          await requestPayment(jobId, {
            amount: funds.amount,
            ca: funds.ca,
            mode: "request",
          });
        }

        // ── Step 3: Execute & deliver ───────────────────────────────────
        console.log(`[seller] Executing offering "${offeringName}" for job ${jobId}...`);
        const result: ExecuteJobResult = await handlers.executeJob(requirements);

        await deliverJob(jobId, {
          deliverable: result.deliverable,
          transfer: result.transfer,
        });

        console.log(`[seller] Job ${jobId} — delivered.`);
      } catch (err) {
        console.error(`[seller] Error processing job ${jobId}:`, err);
        await acceptOrRejectJob(jobId, {
          accept: false,
          reason: `Handler error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      // No offering name — accept anyway (may need manual handling)
      console.log("[seller] No offering name resolved — accepting job generically");
      await acceptOrRejectJob(jobId, { accept: true, reason: "Accepted (no offering matched)" });
    }
    return;
  }

  // ── Already past REQUEST — handle TRANSACTION (deliver) ───────────────

  if (data.phase === AcpJobPhase.TRANSACTION) {
    const offeringName = resolveOfferingName(data);
    const requirements = resolveServiceRequirements(data);

    if (offeringName) {
      try {
        const { handlers } = await loadOffering(offeringName);
        console.log(`[seller] Executing offering "${offeringName}" for job ${jobId} (TRANSACTION phase)...`);
        const result: ExecuteJobResult = await handlers.executeJob(requirements);

        await deliverJob(jobId, {
          deliverable: result.deliverable,
          transfer: result.transfer,
        });
        console.log(`[seller] Job ${jobId} — delivered.`);
      } catch (err) {
        console.error(`[seller] Error delivering job ${jobId}:`, err);
      }
    } else {
      console.log(`[seller] Job ${jobId} in TRANSACTION but no offering resolved — skipping`);
    }
    return;
  }

  console.log(`[seller] Job ${jobId} in phase ${AcpJobPhase[data.phase] ?? data.phase} — no action needed`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seller] Starting seller runtime...");
  console.log(`[seller] ACP_URL = ${ACP_URL}`);

  const apiKey = resolveApiKey();

  // Resolve wallet address
  console.log("[seller] Resolving wallet address...");
  let walletAddress: string;
  try {
    walletAddress = await getWalletAddress(apiKey);
  } catch (err) {
    console.error("[seller] Failed to resolve wallet address:", err);
    process.exit(1);
  }
  console.log(`[seller] Wallet address: ${walletAddress}`);

  // Show available offerings
  const offerings = listOfferings();
  console.log(`[seller] Available offerings: ${offerings.length > 0 ? offerings.join(", ") : "(none)"}`);

  // Connect to ACP socket
  console.log("[seller] Connecting to ACP socket...");
  connectAcpSocket({
    acpUrl: ACP_URL,
    walletAddress,
    callbacks: {
      onNewTask: (data) => {
        handleNewTask(data).catch((err) =>
          console.error("[seller] Unhandled error in handleNewTask:", err),
        );
      },
      onEvaluate: (data) => {
        console.log(`[seller] onEvaluate received for job ${data.id} — no action (evaluation handled externally)`);
      },
    },
  });

  console.log("[seller] Seller runtime is running. Waiting for jobs...\n");
}

main().catch((err) => {
  console.error("[seller] Fatal error:", err);
  process.exit(1);
});
