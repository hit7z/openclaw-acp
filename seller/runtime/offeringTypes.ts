// =============================================================================
// Shared types for offering handler contracts.
// =============================================================================

/** Optional token-transfer instruction returned by an offering handler. */
export interface TransferInstruction {
  /** Token contract address (e.g. ERC-20 CA). */
  ca: string;
  /** Amount to transfer. */
  amount: number;
}

/**
 * Result returned by an offering's `executeJob` handler.
 *
 * - `deliverable` — the job result (simple string or structured object).
 * - `transfer`    — optional: instructs the runtime to include a token transfer
 *                   in the deliver step (e.g. "return money to buyer").
 */
export interface ExecuteJobResult {
  deliverable: string | { type: string; value: unknown };
  transfer?: TransferInstruction;
}

/**
 * The handler set every offering must / can export.
 *
 * Required:
 *   executeJob(request) => ExecuteJobResult
 *
 * Optional:
 *   validateRequirements(request) => boolean
 *   requestAdditionalFunds(request) => { amount, ca, symbol }
 */
export interface OfferingHandlers {
  executeJob: (request: Record<string, any>) => Promise<ExecuteJobResult>;
  validateRequirements?: (request: Record<string, any>) => boolean;
  requestAdditionalFunds?: (
    request: Record<string, any>,
  ) => { amount: number; ca: string; symbol: string };
}
