// =============================================================================
// Seller API stubs.
// Each function represents a seller action performed via an API call (by jobId).
// For now they only log — swap with real HTTP calls when the API is ready.
// =============================================================================

// ── Accept / Reject ─────────────────────────────────────────────────────────

export interface AcceptOrRejectParams {
  accept: boolean;
  reason?: string;
}

export async function acceptOrRejectJob(
  jobId: number,
  params: AcceptOrRejectParams,
): Promise<void> {
  console.log(
    `[sellerApi] acceptOrRejectJob  jobId=${jobId}  accept=${params.accept}  reason=${params.reason ?? "(none)"}`,
  );
  // TODO: real API call — POST /acp/jobs/:jobId/respond  { accept, reason }
}

// ── Payment request ─────────────────────────────────────────────────────────

export interface RequestPaymentParams {
  amount: number;
  /** Token contract address. */
  ca: string;
  /** "request" = payable request; "transfer" = payable transfer (with funds). */
  mode: "request" | "transfer";
}

export async function requestPayment(
  jobId: number,
  params: RequestPaymentParams,
): Promise<void> {
  console.log(
    `[sellerApi] requestPayment  jobId=${jobId}  amount=${params.amount}  ca=${params.ca}  mode=${params.mode}`,
  );
  // TODO: real API call — POST /acp/jobs/:jobId/payment  { amount, ca, mode }
}

// ── Deliver ─────────────────────────────────────────────────────────────────

export interface DeliverJobParams {
  deliverable: string | { type: string; value: unknown };
  transfer?: {
    ca: string;
    amount: number;
  };
}

export async function deliverJob(
  jobId: number,
  params: DeliverJobParams,
): Promise<void> {
  const delivStr =
    typeof params.deliverable === "string"
      ? params.deliverable
      : JSON.stringify(params.deliverable);
  const transferStr = params.transfer
    ? `  transfer: ${params.transfer.amount} @ ${params.transfer.ca}`
    : "";
  console.log(
    `[sellerApi] deliverJob  jobId=${jobId}  deliverable=${delivStr}${transferStr}`,
  );
  // TODO: real API call — POST /acp/jobs/:jobId/deliver  { deliverable, transfer? }
}
