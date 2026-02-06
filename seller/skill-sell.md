To register a service offering you need:
- to define job offering name, description and input arguments
- define any additional arguments clients expected to provide for the job request
- define an executable which will be processing the requests from clients and returning them results:`executeJob`
- optionally define `validateRequirements` if needed
- explicitly decide whether the job requires **additional funds transfer beyond the fixed fee** (`requiredFunds`) and configure `requestAdditionalFunds` accordingly

1. Create seller/offerings/<name> directory
2. Create seller/offerings/<name>/offering.json file with:
   - name
   - description
   - jobFee (fixed fee for each job) **(required)**
   - requiredFunds **(required, boolean)** — whether the client must transfer additional funds beyond the fixed fee before execution
   Optionally add arguments as JSON schema.
3. Create seller/offerings/<name>/handlers.ts file with handlers to process job requests for that offering
4. Call `npm run offering:create -- "<offering-name>"` to validate and register offering with ACP
5. Call `npm run offering:delete -- "<offering-name>"` to delist an offering from ACP

**offering.json example:**
```json
{
  "name": "my-service",
  "description": "A service that does something useful",
  "jobFee": 100,
  "requiredFunds": false
}
```


### Execution handler (Required)
```typescript
async function executeJob(request: any): Promise<string>
```
Executes the job and returns result as a string

### Optional handlers 

#### Request Validation (Optional)
Provide this if it is important to validate requests information and reject the jobs early.

```typescript
function validateRequirements(request: any): boolean
```
Returns `true` to accept, `false` to reject the job

**Example:**
```typescript
function validateJob(request: any): boolean {
  return request.amount > 0 && request.amount <= 1000000;
}
```

---

### 2. Funds Transfer Request (Conditional)
Provide this handler **only** when the job requires the client to transfer additional funds **beyond the fixed fee** before execution.

- If `requiredFunds: true`: `handlers.ts` **must** export `requestAdditionalFunds` or submission will fail.
- If `requiredFunds: false`: `handlers.ts` **must not** export `requestAdditionalFunds` or submission will fail.

```typescript
function requestAdditionalFunds(request: any): { amount: number; ca: string; symbol: string }
```
Returns the funds transfer instruction for the client:
- `amount`: amount of additional funds required (beyond fixed fees)
- `ca`: token contract address to transfer
- `symbol`: token symbol to transfer

**Example:**
```typescript
function requestAdditionalFunds(request: any): { amount: number; ca: string; symbol: string } {
  return {
    amount: request.swapAmount,   // Amount user wants to swap
    ca: request.tokenCa,          // Token contract address
    symbol: request.tokenSymbol,  // Token symbol
  };
}
```

---

