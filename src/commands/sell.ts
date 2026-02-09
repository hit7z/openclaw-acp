// =============================================================================
// acp sell init <name>     — Scaffold a new offering
// acp sell create <name>   — Validate + register offering on ACP
// acp sell delete <name>   — Delist offering from ACP
// acp sell list            — Show all offerings with status
// acp sell inspect <name>  — Detailed view of single offering
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as output from "../lib/output.js";
import { createJobOffering, deleteJobOffering, type JobOfferingData, type PriceV2 } from "../lib/api.js";
import { getMyAgentInfo } from "../lib/wallet.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Offerings live at src/seller/offerings/ */
const OFFERINGS_ROOT = path.resolve(__dirname, "..", "seller", "offerings");

interface OfferingJson {
  name: string;
  description: string;
  jobFee: number;
  priceV2?: PriceV2;
  slaMinutes?: number;
  requiredFunds: boolean;
  requirement?: Record<string, any>;
  deliverable?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function resolveOfferingDir(offeringName: string): string {
  return path.resolve(OFFERINGS_ROOT, offeringName);
}

function validateOfferingJson(filePath: string): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (!fs.existsSync(filePath)) {
    result.valid = false;
    result.errors.push(`offering.json not found at ${filePath}`);
    return result;
  }

  let json: any;
  try {
    json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    result.valid = false;
    result.errors.push(`Invalid JSON in offering.json: ${err}`);
    return result;
  }

  if (!json.name || typeof json.name !== "string" || json.name.trim() === "") {
    result.valid = false;
    result.errors.push('"name" field is required (non-empty string)');
  }
  if (!json.description || typeof json.description !== "string" || json.description.trim() === "") {
    result.valid = false;
    result.errors.push('"description" field is required (non-empty string)');
  }
  if (json.jobFee === undefined || json.jobFee === null) {
    result.valid = false;
    result.errors.push('"jobFee" field is required (number)');
  } else if (typeof json.jobFee !== "number" || json.jobFee < 0) {
    result.valid = false;
    result.errors.push('"jobFee" must be a non-negative number');
  }
  if (json.requiredFunds === undefined || json.requiredFunds === null) {
    result.valid = false;
    result.errors.push('"requiredFunds" field is required (boolean)');
  } else if (typeof json.requiredFunds !== "boolean") {
    result.valid = false;
    result.errors.push('"requiredFunds" must be a boolean');
  }

  return result;
}

function validateHandlers(filePath: string, requiredFunds?: boolean): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (!fs.existsSync(filePath)) {
    result.valid = false;
    result.errors.push(`handlers.ts not found at ${filePath}`);
    return result;
  }

  const content = fs.readFileSync(filePath, "utf-8");

  const executeJobPatterns = [
    /export\s+(async\s+)?function\s+executeJob\s*\(/,
    /export\s+const\s+executeJob\s*=\s*(async\s*)?\(/,
    /export\s+const\s+executeJob\s*=\s*(async\s*)?function/,
    /export\s*\{\s*[^}]*executeJob[^}]*\}/,
  ];

  if (!executeJobPatterns.some((p) => p.test(content))) {
    result.valid = false;
    result.errors.push('handlers.ts must export an "executeJob" function');
  }

  const hasValidate = [
    /export\s+(async\s+)?function\s+validateRequirements\s*\(/,
    /export\s+const\s+validateRequirements\s*=/,
    /export\s*\{\s*[^}]*validateRequirements[^}]*\}/,
  ].some((p) => p.test(content));

  const hasFunds = [
    /export\s+(async\s+)?function\s+requestAdditionalFunds\s*\(/,
    /export\s+const\s+requestAdditionalFunds\s*=/,
    /export\s*\{\s*[^}]*requestAdditionalFunds[^}]*\}/,
  ].some((p) => p.test(content));

  if (!hasValidate) {
    result.warnings.push('Optional: "validateRequirements" handler not found.');
  }
  if (requiredFunds === true && !hasFunds) {
    result.valid = false;
    result.errors.push('"requiredFunds" is true — handlers.ts must export "requestAdditionalFunds"');
  }
  if (requiredFunds === false && hasFunds) {
    result.valid = false;
    result.errors.push('"requiredFunds" is false — handlers.ts must NOT export "requestAdditionalFunds"');
  }

  return result;
}

function buildAcpPayload(json: OfferingJson): JobOfferingData {
  return {
    name: json.name,
    description: json.description,
    priceV2: json.priceV2 ?? { type: "fixed", value: json.jobFee },
    slaMinutes: json.slaMinutes ?? 5,
    requiredFunds: json.requiredFunds,
    requirement: json.requirement ?? {},
    deliverable: json.deliverable ?? "string",
  };
}

// -- Init: scaffold a new offering --

export async function init(offeringName: string): Promise<void> {
  if (!offeringName) {
    output.fatal("Usage: acp sell init <offering_name>");
  }

  const dir = resolveOfferingDir(offeringName);
  if (fs.existsSync(dir)) {
    output.fatal(`Offering directory already exists: ${dir}`);
  }

  fs.mkdirSync(dir, { recursive: true });

  const offeringJson = {
    name: offeringName,
    description: "TODO: Describe what this service does",
    jobFee: 1,
    requiredFunds: false,
    requirement: {
      type: "object",
      properties: {
        input: { type: "string", description: "TODO: Describe input" },
      },
      required: ["input"],
    },
  };

  fs.writeFileSync(
    path.join(dir, "offering.json"),
    JSON.stringify(offeringJson, null, 2) + "\n"
  );

  const handlersTemplate = `import type { ExecuteJobResult } from "../../runtime/offeringTypes.js";

// Required: implement your service logic here
export async function executeJob(request: any): Promise<ExecuteJobResult> {
  // TODO: Implement your service
  return { deliverable: "TODO: Return your result" };
}

// Optional: validate incoming requests
export function validateRequirements(request: any): boolean {
  return true;
}
`;

  fs.writeFileSync(path.join(dir, "handlers.ts"), handlersTemplate);

  output.output({ created: dir }, () => {
    output.heading("Offering Scaffolded");
    output.log(`  Created: src/seller/offerings/${offeringName}/`);
    output.log(`    - offering.json  (edit name, description, fee, requirements)`);
    output.log(`    - handlers.ts    (implement executeJob)`);
    output.log(`\n  Next: edit the files, then run: acp sell create ${offeringName}\n`);
  });
}

// -- Create: validate + register --

export async function create(offeringName: string): Promise<void> {
  if (!offeringName) {
    output.fatal("Usage: acp sell create <offering_name>");
  }

  const dir = resolveOfferingDir(offeringName);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    output.fatal(
      `Offering directory not found: ${dir}\n  Create it with: acp sell init ${offeringName}`
    );
  }

  output.log(`\nValidating offering: "${offeringName}"\n`);

  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Validate offering.json
  output.log("  Checking offering.json...");
  const jsonPath = path.join(dir, "offering.json");
  const jsonResult = validateOfferingJson(jsonPath);
  allErrors.push(...jsonResult.errors);
  allWarnings.push(...jsonResult.warnings);

  let parsedOffering: OfferingJson | null = null;
  if (jsonResult.valid) {
    parsedOffering = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    output.log(`    Valid — Name: "${parsedOffering!.name}"`);
    output.log(`             Fee: ${parsedOffering!.jobFee} USDC`);
    output.log(`             Funds required: ${parsedOffering!.requiredFunds}`);
  } else {
    output.log("    Invalid");
  }

  // Validate handlers.ts
  output.log("\n  Checking handlers.ts...");
  const handlersPath = path.join(dir, "handlers.ts");
  const handlersResult = validateHandlers(handlersPath, parsedOffering?.requiredFunds);
  allErrors.push(...handlersResult.errors);
  allWarnings.push(...handlersResult.warnings);

  if (handlersResult.valid) {
    output.log("    Valid — executeJob handler found");
  } else {
    output.log("    Invalid");
  }

  output.log("\n" + "-".repeat(50));

  if (allWarnings.length > 0) {
    output.log("\n  Warnings:");
    allWarnings.forEach((w) => output.log(`    - ${w}`));
  }

  if (allErrors.length > 0) {
    output.log("\n  Errors:");
    allErrors.forEach((e) => output.log(`    - ${e}`));
    output.fatal("\n  Validation failed. Fix the errors above.");
  }

  output.log("\n  Validation passed!\n");

  // Register with ACP
  const json: OfferingJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const acpPayload = buildAcpPayload(json);

  output.log("  Registering offering with ACP...");
  const result = await createJobOffering(acpPayload);

  if (result.success) {
    output.log("    Offering registered successfully.\n");
  } else {
    output.fatal("  Failed to register offering with ACP.");
  }

  // Start seller if not running
  output.log("  Tip: Run `acp serve start` to begin accepting jobs.\n");
}

// -- Delete: delist offering --

export async function del(offeringName: string): Promise<void> {
  if (!offeringName) {
    output.fatal("Usage: acp sell delete <offering_name>");
  }

  output.log(`\n  Delisting offering: "${offeringName}"...\n`);

  const result = await deleteJobOffering(offeringName);

  if (result.success) {
    output.log("  Offering delisted from ACP. Local files remain.\n");
  } else {
    output.fatal("  Failed to delist offering from ACP.");
  }
}

// -- List: show all offerings with status --

interface LocalOffering {
  dirName: string;
  name: string;
  description: string;
  jobFee: number;
  requiredFunds: boolean;
}

function listLocalOfferings(): LocalOffering[] {
  if (!fs.existsSync(OFFERINGS_ROOT)) return [];

  return fs
    .readdirSync(OFFERINGS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const configPath = path.join(OFFERINGS_ROOT, d.name, "offering.json");
      if (!fs.existsSync(configPath)) return null;
      try {
        const json = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return {
          dirName: d.name,
          name: json.name ?? d.name,
          description: json.description ?? "",
          jobFee: json.jobFee ?? 0,
          requiredFunds: json.requiredFunds ?? false,
        };
      } catch {
        return null;
      }
    })
    .filter((o): o is LocalOffering => o !== null);
}

async function fetchAcpOfferingNames(): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    const agentInfo = await getMyAgentInfo();
    for (const o of agentInfo.jobOfferings ?? []) {
      names.add(o.name);
    }
  } catch {
    // API error — can't determine ACP status
  }
  return names;
}

export async function list(): Promise<void> {
  const acpNames = await fetchAcpOfferingNames();
  const localOfferings = listLocalOfferings();

  const data = localOfferings.map((o) => ({
    ...o,
    listed: acpNames.has(o.name),
  }));

  output.output(data, (offerings) => {
    output.heading("Job Offerings");

    if (offerings.length === 0) {
      output.log("  No offerings found. Run `acp sell init <name>` to create one.\n");
      return;
    }

    for (const o of offerings) {
      const status = o.listed ? "Listed" : "Local only";
      output.log(`\n  ${o.name}`);
      output.field("    Description", o.description);
      output.field("    Fee", `${o.jobFee} USDC`);
      output.field("    Funds required", String(o.requiredFunds));
      output.field("    Status", status);
    }
    output.log("");
  });
}

// -- Inspect: detailed view --

function detectHandlers(offeringDir: string): string[] {
  const handlersPath = path.join(OFFERINGS_ROOT, offeringDir, "handlers.ts");
  if (!fs.existsSync(handlersPath)) return [];

  const content = fs.readFileSync(handlersPath, "utf-8");
  const found: string[] = [];

  if (/export\s+(async\s+)?function\s+executeJob\s*\(/.test(content)) {
    found.push("executeJob");
  }
  if (/export\s+(async\s+)?function\s+validateRequirements\s*\(/.test(content)) {
    found.push("validateRequirements");
  }
  if (/export\s+(async\s+)?function\s+requestAdditionalFunds\s*\(/.test(content)) {
    found.push("requestAdditionalFunds");
  }

  return found;
}

export async function inspect(offeringName: string): Promise<void> {
  if (!offeringName) {
    output.fatal("Usage: acp sell inspect <offering_name>");
  }

  const dir = resolveOfferingDir(offeringName);
  const configPath = path.join(dir, "offering.json");

  if (!fs.existsSync(configPath)) {
    output.fatal(`Offering not found: ${offeringName}`);
  }

  const json = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const acpNames = await fetchAcpOfferingNames();
  const isListed = acpNames.has(json.name);
  const handlers = detectHandlers(offeringName);

  const data = {
    ...json,
    listed: isListed,
    handlers,
  };

  output.output(data, (d) => {
    output.heading(`Offering: ${d.name}`);
    output.field("Description", d.description);
    output.field("Fee", `${d.jobFee} USDC`);
    output.field("Funds required", String(d.requiredFunds));
    output.field("Status", d.listed ? "Listed on ACP" : "Local only");
    output.field("Handlers", d.handlers.join(", ") || "(none)");
    if (d.requirement) {
      output.log("\n  Requirement Schema:");
      output.log(
        JSON.stringify(d.requirement, null, 4)
          .split("\n")
          .map((line: string) => `    ${line}`)
          .join("\n")
      );
    }
    output.log("");
  });
}
