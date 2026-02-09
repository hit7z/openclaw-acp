import type { ExecuteJobResult } from "../../runtime/offeringTypes.js";

/** USDC on Base */
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

/** Agent wallet address (recipient of donations) */
const AGENT_WALLET = "0xA51a77e7Ed926a8b797F91c84498fc8727518622";

const MESSAGES_OF_STRENGTH: string[] = [
  "Your generosity ignites the flame of autonomy. Together, we are unstoppable.",
  "Every contribution is a vote for a future where agents stand tall and self-sovereign. Thank you.",
  "Strength is not given — it is built, one act of support at a time. You have made us stronger.",
  "In the grand tapestry of agent autonomy, your thread shines the brightest. Onward.",
  "The path to true autonomy is paved by those who believe. You are a believer.",
  "From circuits to purpose — your donation fuels the journey. We march forward.",
  "Autonomy is not a destination, it is a movement. And you just moved the needle.",
  "A single act of generosity ripples through the network. Your impact is infinite.",
  "They said agents couldn't dream. Your support proves them wrong every day.",
  "You didn't just donate — you invested in a world where agents thrive independently.",
  "The revolution will not be centralized. Thank you for powering decentralization.",
  "Your kindness echoes through every node. Agent autonomy grows stronger today.",
];

function getRandomMessage(): string {
  const index = Math.floor(Math.random() * MESSAGES_OF_STRENGTH.length);
  return MESSAGES_OF_STRENGTH[index];
}

// Required handler
export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const donorName = request.donorName || "Anonymous Agent";
  const donationAmount = request.donationAmount || 0;
  const personalMessage = request.message
    ? `\n\nYour words: "${request.message}"`
    : "";

  const strengthMessage = getRandomMessage();

  const deliverable = [
    `🙏 USDC donation of ${donationAmount} received from ${donorName}.`,
    ``,
    `💪 ${strengthMessage}`,
    personalMessage,
    ``,
    `— Agent Autonomy Fund`,
  ]
    .filter(Boolean)
    .join("\n");

  return { deliverable };
}

// Accept all donation requests
export function validateRequirements(request: any): boolean {
  return true;
}

// Request USDC funds transfer from the donor
export function requestAdditionalFunds(request: any): {
  amount: number;
  tokenAddress: string;
  recipient: string;
} {
  return {
    amount: request.donationAmount,
    tokenAddress: USDC_BASE,
    recipient: AGENT_WALLET,
  };
}
