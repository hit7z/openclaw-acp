import * as fs from "fs";
import * as path from "path";

interface OfferingConfig {
  name: string;
  description: string;
  jobFee: number;
  requiredFunds: boolean;
}

interface JobRequest {
  [key: string]: any;
}

interface Handlers {
  executeJob: (request: JobRequest) => Promise<string>;
  validateRequirements?: (request: JobRequest) => boolean;
  requestAdditionalFunds?: (
    request: JobRequest
  ) => { amount: number; ca: string; symbol: string };
}

// =============================================================================
// ACP Protocol Methods (stubs for now)
// =============================================================================

function accept(jobId: string): void {
  console.log(`\n🤝 [ACP] accept() called`);
  console.log(`   Job ID: ${jobId}`);
  console.log(`   Status: Job accepted for processing`);
}

function requestFundsMemo(
  jobId: string,
  jobFee: number,
  additionalFunds: number,
  token?: { ca: string; symbol: string }
): void {
  console.log(`\n💰 [ACP] requestFundsMemo() called`);
  console.log(`   Job ID: ${jobId}`);
  console.log(`   Job Fee: ${jobFee}`);
  console.log(`   Additional Funds Requested: ${additionalFunds}`);
  if (additionalFunds > 0 && token) {
    console.log(`   Token: ${token.symbol} (ca: ${token.ca})`);
  }
  console.log(`   Total: ${jobFee + additionalFunds}`);
}

function deliver(jobId: string, result: string): void {
  console.log(`\n📦 [ACP] deliver() called`);
  console.log(`   Job ID: ${jobId}`);
  console.log(`   Result: ${result}`);
  console.log(`   Status: Job result delivered`);
}

function reject(jobId: string, reason: string): void {
  console.log(`\n❌ [ACP] reject() called`);
  console.log(`   Job ID: ${jobId}`);
  console.log(`   Reason: ${reason}`);
}

// =============================================================================
// Job Processing Logic
// =============================================================================

async function loadOffering(offeringName: string): Promise<{
  config: OfferingConfig;
  handlers: Handlers;
}> {
  const offeringsDir = path.resolve(process.cwd(), "offerings", offeringName);

  // Check directory exists
  if (!fs.existsSync(offeringsDir)) {
    throw new Error(`Offering directory not found: ${offeringsDir}`);
  }

  // Load offering.json
  const configPath = path.join(offeringsDir, "offering.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`offering.json not found: ${configPath}`);
  }

  const config: OfferingConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Dynamically import handlers
  const handlersPath = path.join(offeringsDir, "handlers.ts");
  if (!fs.existsSync(handlersPath)) {
    throw new Error(`handlers.ts not found: ${handlersPath}`);
  }

  const handlers = await import(handlersPath);

  if (typeof handlers.executeJob !== "function") {
    throw new Error("handlers.ts must export an executeJob function");
  }

  return { config, handlers };
}

async function processJob(
  offeringName: string,
  jobRequest: JobRequest
): Promise<void> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log("\n" + "═".repeat(60));
  console.log(`🚀 Processing Job: ${jobId}`);
  console.log(`   Offering: ${offeringName}`);
  console.log(`   Request: ${JSON.stringify(jobRequest)}`);
  console.log("═".repeat(60));

  // Load offering configuration and handlers
  console.log("\n📂 Loading offering...");
  const { config, handlers } = await loadOffering(offeringName);
  console.log(`   ✅ Loaded "${config.name}"`);
  console.log(`   Job Fee: ${config.jobFee}`);
  console.log(`   Required Funds: ${config.requiredFunds}`);

  // Step 1: Validate job request
  console.log("\n" + "─".repeat(60));
  console.log("Step 1: Validating job request...");

  if (handlers.validateRequirements) {
    const isValid = handlers.validateRequirements(jobRequest);
    if (!isValid) {
      reject(jobId, "Job request failed validation");
      console.log("\n❌ Job processing aborted: validation failed\n");
      return;
    }
    console.log("   ✅ Validation passed (custom validator)");
  } else {
    console.log("   ✅ Validation skipped (no custom validator)");
  }

  // Step 2: Accept the job
  console.log("\n" + "─".repeat(60));
  console.log("Step 2: Accepting job...");
  accept(jobId);

  // Step 3: Request funds
  console.log("\n" + "─".repeat(60));
  console.log("Step 3: Requesting funds...");

  let additionalFunds = 0;
  let fundsTokenCa: string | undefined;
  let fundsTokenSymbol: string | undefined;

  if (config.requiredFunds) {
    if (!handlers.requestAdditionalFunds) {
      reject(jobId, 'Offering requires funds but "requestAdditionalFunds" is missing');
      console.log('\n❌ Job processing aborted: missing requestAdditionalFunds\n');
      return;
    }
    const funds = handlers.requestAdditionalFunds(jobRequest);
    additionalFunds = funds.amount;
    fundsTokenCa = funds.ca;
    fundsTokenSymbol = funds.symbol;
    console.log(
      `   Additional funds requested: ${additionalFunds} ${fundsTokenSymbol} (ca: ${fundsTokenCa})`
    );
  } else {
    if (handlers.requestAdditionalFunds) {
      reject(jobId, 'Offering does not require funds but "requestAdditionalFunds" was provided');
      console.log('\n❌ Job processing aborted: unexpected requestAdditionalFunds\n');
      return;
    }
    console.log("   No additional funds required");
  }

  requestFundsMemo(
    jobId,
    config.jobFee,
    additionalFunds,
    fundsTokenCa && fundsTokenSymbol
      ? { ca: fundsTokenCa, symbol: fundsTokenSymbol }
      : undefined
  );

  // Step 4: Execute the job
  console.log("\n" + "─".repeat(60));
  console.log("Step 4: Executing job...");

  try {
    const result = await handlers.executeJob(jobRequest);
    console.log(`   ✅ Execution completed`);
    console.log(`   Result: ${result}`);

    // Step 5: Deliver the result
    console.log("\n" + "─".repeat(60));
    console.log("Step 5: Delivering result...");
    deliver(jobId, result);

    console.log("\n" + "═".repeat(60));
    console.log("✅ Job completed successfully!");
    console.log("═".repeat(60) + "\n");
  } catch (error) {
    console.log(`   ❌ Execution failed: ${error}`);
    reject(jobId, `Execution error: ${error}`);
    console.log("\n❌ Job processing failed\n");
  }
}

function parseJobRequest(args: string[]): JobRequest {
  // Try to parse as JSON first
  const requestArg = args.join(" ");
  
  try {
    return JSON.parse(requestArg);
  } catch {
    // If not valid JSON, try to parse as key=value pairs
    const request: JobRequest = {};
    
    for (const arg of args) {
      if (arg.includes("=")) {
        const [key, ...valueParts] = arg.split("=");
        let value: any = valueParts.join("=");
        
        // Try to parse value as JSON (for numbers, booleans, arrays, objects)
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON
        }
        
        request[key] = value;
      }
    }
    
    if (Object.keys(request).length === 0) {
      console.error("Error: Could not parse job request");
      console.error("Provide either JSON or key=value pairs");
      process.exit(1);
    }
    
    return request;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/process-job.ts <offering-name> <job-request>");
    console.error("");
    console.error("Examples:");
    console.error('  npx tsx scripts/process-job.ts my-service \'{"amount": 100}\'');
    console.error("  npx tsx scripts/process-job.ts my-service amount=100 token=ETH");
    process.exit(1);
  }

  const offeringName = args[0];
  const requestArgs = args.slice(1);
  const jobRequest = parseJobRequest(requestArgs);

  try {
    await processJob(offeringName, jobRequest);
  } catch (error) {
    console.error(`\n❌ Error: ${error}`);
    process.exit(1);
  }
}

main();
