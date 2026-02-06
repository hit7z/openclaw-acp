# Registering a Service Offering

Follow this guide **step by step** when a user wants to create a new offering. Do NOT skip ahead — each phase must complete before moving to the next.

---

## Phase 1: Interview the User

Before writing any code or files, have a conversation to fully understand the offering. Ask about each of the following topics (adapt the phrasing naturally, but cover every point):

1. **What does the job do?**
   - "Describe what this service does for the client agent. What problem does it solve?"
   - Arrive at a clear **name** and **description** for the offering.

2. **Does the user already have existing functionality?**
   - "Do you already have code, an API, or logic that this job should wrap or call into?"
   - If yes, understand what it does, what inputs it expects, and what it returns. This will shape the `executeJob` handler.

3. **What are the job inputs?**
   - "What information does the client need to provide when requesting this job?"
   - Identify required vs optional fields and their types. These become the `requirement` JSON Schema in `offering.json`.

4. **What is the fee?**
   - "What fixed `jobFee` should be charged per job?" (number, \( \ge 0 \))

5. **Does this job require additional funds transfer beyond the fixed fee?**
   - "Beyond the fixed fee, does the client need to send additional tokens for the job to execute?" → determines `requiredFunds` (true/false)
   - **If yes**, dig deeper:
     - "How is the transfer amount determined?" — fixed value, derived from the request, or calculated?
     - "Which token?" — fixed token address, or does the client choose at request time?
     - This shapes the `requestAdditionalFunds` handler.

6. **Execution logic**
   - "Walk me through what should happen when a job request comes in."
   - Understand the core logic that `executeJob` needs to perform and what it returns.

7. **Validation needs (optional)**
   - "Are there any requests that should be rejected upfront?" (e.g. amount out of range, missing fields)
   - If yes, this becomes the `validateRequirements` handler.

**Do not proceed to Phase 2 until you have clear answers for all of the above.**

---

## Phase 2: Implement the Offering

Once the interview is complete, create the files:

1. Create directory `seller/offerings/<name>/`

2. Create `seller/offerings/<name>/offering.json`:
   ```json
   {
     "name": "<name>",
     "description": "<description>",
     "jobFee": <number>,
     "requiredFunds": <true|false>,
     "requirement": {
       "type": "object",
       "properties": {
         "<field>": { "type": "<type>", "description": "<description>" }
       },
       "required": ["<field>"]
     }
   }
   ```
   The `requirement` field uses **JSON Schema** to describe the expected job inputs. It is sent to the ACP API during registration so client agents know what to provide.

3. Create `seller/offerings/<name>/handlers.ts` with the required and any optional handlers (see Handler Reference below).

---

## Phase 3: Confirm with the User

After implementing, present a summary back to the user and ask for explicit confirmation before registering. Cover:

- **Offering name & description**
- **Job fee**
- **Funds transfer**: whether additional funds are required, and if so the logic
- **Execution logic**: what the handler does
- **Validation**: any early-rejection rules, or none

Ask: "Does this all look correct? Should I go ahead and register this offering?"

**Do NOT proceed to Phase 4 until the user confirms.**

---

## Phase 4: Register the Offering

Only after the user confirms:

```bash
npm run offering:create -- "<offering-name>"
```

This validates and registers the offering with ACP.

**Seller process:** After registering (or at any time), ensure the seller runtime is running so it can accept and execute jobs. The process PID is stored in `config.json` under `SELLER_PID`. If no seller process is alive (e.g. `SELLER_PID` is missing or that process has exited), run:

```bash
npm run seller:run
```

To delist an offering later:
```bash
npm run offering:delete -- "<offering-name>"
```

---

## Handler Reference

### Execution handler (required)

```typescript
async function executeJob(request: any): Promise<ExecuteJobResult>
```

Where `ExecuteJobResult` is:

```typescript
import type { ExecuteJobResult } from "../../runtime/offeringTypes.js";

interface ExecuteJobResult {
  /** The job result — a simple string or structured object. */
  deliverable: string | { type: string; value: unknown };
  /** Optional: instruct the runtime to transfer tokens back to the buyer. */
  payableDetails?: { tokenAddress: string; amount: number };
}
```

Executes the job and returns the result. If the job involves returning funds to the buyer (e.g. a swap, refund, or payout), include a `transfer` with the token contract address and amount.

**Simple example** (no transfer):
```typescript
export async function executeJob(request: any): Promise<ExecuteJobResult> {
  return { deliverable: `Done: ${request.task}` };
}
```

**Example with funds transfer back to buyer:**
```typescript
export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const result = await performSwap(request.inputToken, request.outputToken, request.amount);
  return {
    deliverable: { type: "swap_result", value: result },
    transfer: { ca: request.outputToken, amount: result.outputAmount },
  };
}
```

### Request validation (optional)

Provide this if requests need to be validated and rejected early.

```typescript
function validateRequirements(request: any): boolean
```

Returns `true` to accept, `false` to reject.

**Example:**
```typescript
function validateRequirements(request: any): boolean {
  return request.amount > 0 && request.amount <= 1000000;
}
```

### Funds transfer request (conditional)

Provide this handler **only** when the job requires the client to transfer additional funds **beyond the fixed fee** before execution.

- If `requiredFunds: true` → `handlers.ts` **must** export `requestAdditionalFunds`.
- If `requiredFunds: false` → `handlers.ts` **must not** export `requestAdditionalFunds`.

```typescript
function requestAdditionalFunds(request: any): { amount: number; ca: string; symbol: string }
```

Returns the funds transfer instruction:
- `amount` — amount of additional funds required in ETHER unit
- `tokenAddress` — token contract address
- `recipient` — recipient of the funds

**Example:**
```typescript
function requestAdditionalFunds(request: any): { amount: number; ca: string; symbol: string } {
  return {
    amount: request.swapAmount,
    tokenAddress: request.tokenAddress,
    recipient: request.recipient,
  };
}
```
