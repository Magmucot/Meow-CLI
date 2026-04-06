// ═══════════════════════════════════════════════════════════════════════════
// commands/cost.js — /cost command
// ═══════════════════════════════════════════════════════════════════════════

import { log } from "../../core.js";

const handleCost = async (ctx, input) => {
  if (!input.startsWith("/cost")) return null;

  if (!ctx.costTracker) {
    log.warn("Cost tracker not initialized");
    return { handled: true };
  }

  const parts = input.split(/\s+/);
  const arg = parts[1] || "";

  if (arg === "--total" || arg === "total") {
    ctx.costTracker.printTotal();
  } else if (arg === "reset") {
    ctx.costTracker.resetTotal();
    log.ok("Cost history reset");
  } else {
    ctx.costTracker.printSession();
  }

  return { handled: true };
};

export { handleCost };
