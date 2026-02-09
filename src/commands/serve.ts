// =============================================================================
// acp serve start   — Start seller runtime (daemonized)
// acp serve stop    — Stop seller runtime
// acp serve status  — Show runtime process info
// =============================================================================

import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as output from "../lib/output.js";
import {
  readConfig,
  isProcessRunning,
  removePidFromConfig,
  ROOT,
  LOGS_DIR,
} from "../lib/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -- Process discovery --

function findSellerProcessFromOS(): number | undefined {
  try {
    const out = execSync(
      'ps ax -o pid,command | grep "seller/runtime/seller.ts" | grep -v grep',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    for (const line of out.trim().split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const pid = parseInt(trimmed.split(/\s+/)[0], 10);
      if (!isNaN(pid) && pid !== process.pid) {
        return pid;
      }
    }
  } catch {
    // grep returns exit code 1 when no matches
  }
  return undefined;
}

function findSellerPid(): number | undefined {
  const config = readConfig();

  if (config.SELLER_PID !== undefined && isProcessRunning(config.SELLER_PID)) {
    return config.SELLER_PID;
  }

  if (config.SELLER_PID !== undefined) {
    removePidFromConfig();
  }

  return findSellerProcessFromOS();
}

// -- Start --

const SELLER_LOG_PATH = path.resolve(LOGS_DIR, "seller.log");

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

export async function start(): Promise<void> {
  const pid = findSellerPid();
  if (pid !== undefined) {
    output.log(`  Seller already running (PID ${pid}).`);
    return;
  }

  const sellerScript = path.resolve(__dirname, "..", "seller", "runtime", "seller.ts");
  const tsxBin = path.resolve(ROOT, "node_modules", ".bin", "tsx");

  ensureLogsDir();
  const logFd = fs.openSync(SELLER_LOG_PATH, "a");

  const sellerProcess = spawn(tsxBin, [sellerScript], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    cwd: ROOT,
  });

  if (!sellerProcess.pid) {
    fs.closeSync(logFd);
    output.fatal("Failed to start seller process.");
  }

  sellerProcess.unref();
  fs.closeSync(logFd);

  output.output({ pid: sellerProcess.pid, status: "started" }, () => {
    output.heading("Seller Started");
    output.field("PID", sellerProcess.pid!);
    output.field("Log", SELLER_LOG_PATH);
    output.log("\n  Run `acp serve status` to verify.");
    output.log("  Run `acp serve logs` to tail output.\n");
  });
}

// -- Stop --

export async function stop(): Promise<void> {
  const pid = findSellerPid();

  if (pid === undefined) {
    output.log("  No seller process running.");
    return;
  }

  output.log(`  Stopping seller process (PID ${pid})...`);

  try {
    process.kill(pid, "SIGTERM");
  } catch (err: any) {
    output.fatal(`Failed to send SIGTERM to PID ${pid}: ${err.message}`);
  }

  // Wait and verify
  let stopped = false;
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    while (Date.now() - start < 200) {
      /* busy wait 200ms */
    }
    if (!isProcessRunning(pid)) {
      stopped = true;
      break;
    }
  }

  if (stopped) {
    removePidFromConfig();
    output.output({ pid, status: "stopped" }, () => {
      output.log(`  Seller process (PID ${pid}) stopped.\n`);
    });
  } else {
    output.error(
      `Process (PID ${pid}) did not stop within 2 seconds. Try: kill -9 ${pid}`
    );
  }
}

// -- Status --

export async function status(): Promise<void> {
  const pid = findSellerPid();
  const running = pid !== undefined;

  output.output({ running, pid: pid ?? null }, () => {
    output.heading("Seller Runtime");
    if (running) {
      output.field("Status", "Running");
      output.field("PID", pid!);
    } else {
      output.field("Status", "Not running");
    }
    output.log("\n  Run `acp sell list` to see offerings.\n");
  });
}

// -- Logs --

export async function logs(follow: boolean = false): Promise<void> {
  if (!fs.existsSync(SELLER_LOG_PATH)) {
    output.log("  No log file found. Start the seller first: `acp serve start`\n");
    return;
  }

  if (follow) {
    // Tail -f equivalent: stream new lines as they appear
    const tail = spawn("tail", ["-f", SELLER_LOG_PATH], {
      stdio: "inherit",
    });
    // Keep running until user hits Ctrl+C
    await new Promise<void>((resolve) => {
      tail.on("close", () => resolve());
      process.on("SIGINT", () => {
        tail.kill();
        resolve();
      });
    });
  } else {
    // Show the last 50 lines
    const content = fs.readFileSync(SELLER_LOG_PATH, "utf-8");
    const lines = content.split("\n");
    const last50 = lines.slice(-51).join("\n"); // -51 because trailing newline
    if (last50.trim()) {
      output.log(last50);
    } else {
      output.log("  Log file is empty.\n");
    }
  }
}
