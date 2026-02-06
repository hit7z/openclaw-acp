import type { ExecuteJobResult } from "../../runtime/offeringTypes.js";

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const name = request.name || "Anonymous";
  return {
    deliverable: `Thank you ${name}`,
    // No transfer for this offering — it's a simple donation acknowledgement.
  };
}
