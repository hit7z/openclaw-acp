// =============================================================================
// ACP API wrappers for job offerings.
// =============================================================================

import client from "./client.js";

export interface PriceV2 {
  type: "fixed";
  value: number;
}

export interface JobOfferingData {
  name: string;
  description: string;
  priceV2: PriceV2;
  slaMinutes: number;
  requiredFunds: boolean;
  requirement: Record<string, any>;
  deliverable: string;
}

export interface CreateJobOfferingResponse {
  success: boolean;
  data?: unknown;
}

export async function createJobOffering(
  offering: JobOfferingData
): Promise<CreateJobOfferingResponse> {
  try {
    const { data } = await client.post(`/acp/job-offerings`, {
      data: offering,
    });
    return { success: true, data };
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`ACP createJobOffering failed: ${msg}`);
    if (error?.response?.data) {
      console.error(
        `   Response body:`,
        JSON.stringify(error.response.data, null, 2)
      );
    }
    return { success: false };
  }
}

export async function deleteJobOffering(
  offeringName: string
): Promise<{ success: boolean }> {
  try {
    await client.delete(
      `/acp/job-offerings/${encodeURIComponent(offeringName)}`
    );
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`ACP deleteJobOffering failed: ${msg}`);
    return { success: false };
  }
}
