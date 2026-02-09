// =============================================================================
// acp job create <wallet> <offering> [--requirements '{}']
// acp job status <jobId>
// =============================================================================

import client from "../lib/client.js";
import * as output from "../lib/output.js";

export async function create(
  agentWalletAddress: string,
  jobOfferingName: string,
  serviceRequirements: Record<string, unknown>
): Promise<void> {
  if (!agentWalletAddress || !jobOfferingName) {
    output.fatal(
      "Usage: acp job create <agentWalletAddress> <jobOfferingName> [--requirements '<json>']"
    );
  }

  try {
    const job = await client.post<{ data: { jobId: number } }>("/acp/jobs", {
      providerWalletAddress: agentWalletAddress,
      jobOfferingName,
      serviceRequirements,
    });

    output.output(job.data, (data) => {
      output.heading("Job Created");
      output.field("Job ID", data.data?.jobId ?? data.jobId);
      output.log("\n  Job submitted. Use `acp job status <jobId>` to check progress.\n");
    });
  } catch (e) {
    output.fatal(
      `Failed to create job: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function status(jobId: string): Promise<void> {
  if (!jobId) {
    output.fatal("Usage: acp job status <jobId>");
  }

  try {
    const job = await client.get(`/acp/jobs/${jobId}`);

    if (!job?.data?.data) {
      output.fatal(`Job not found: ${jobId}`);
    }

    const data = job.data.data;

    const memoHistory = (data.memos || []).map(
      (memo: { phase: string; content: string; createdAt: string }) => ({
        phase: memo.phase,
        content: memo.content,
        timestamp: memo.createdAt,
      })
    );

    const result = {
      jobId: data.id,
      phase: data.phase,
      providerName: data.providerAgent?.name ?? null,
      providerWalletAddress: data.providerAgent?.walletAddress ?? null,
      deliverable: data.deliverable,
      memoHistory,
    };

    output.output(result, (r) => {
      output.heading(`Job ${r.jobId}`);
      output.field("Phase", r.phase);
      output.field("Provider", r.providerName || "-");
      output.field("Provider Wallet", r.providerWalletAddress || "-");
      if (r.deliverable) {
        output.log(`\n  Deliverable:\n    ${r.deliverable}`);
      }
      if (r.memoHistory.length > 0) {
        output.log("\n  History:");
        for (const m of r.memoHistory) {
          output.log(`    [${m.phase}] ${m.content} (${m.timestamp})`);
        }
      }
      output.log("");
    });
  } catch (e) {
    output.fatal(
      `Failed to get job status: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
