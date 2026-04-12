import { log, C, SUCCESS, ERROR, WARNING, MUTED, TEXT_DIM } from "../../core.js";

/**
 * Handles the /rewind and /checkpoint commands for restoring file system snapshots.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleRewind = async (ctx, input) => {
  if (!input.startsWith("/rewind") && !input.startsWith("/checkpoint")) return null;

  const parts = input.split(/\s+/);
  const arg = parts[1] || "";

  if (!ctx.checkpointMgr) {
    log.warn("Checkpoints not initialized for this session");
    return { handled: true };
  }

  if (arg === "--list" || arg === "list" || input === "/checkpoint") {
    ctx.checkpointMgr.printList();
    return { handled: true };
  }

  const steps = arg ? parseInt(arg, 10) : 1;
  if (isNaN(steps) || steps < 1) {
    log.err("Usage: /rewind [N] or /rewind --list");
    return { handled: true };
  }

  if (ctx.checkpointMgr.count === 0) {
    log.warn("No checkpoints to rewind to");
    return { handled: true };
  }

  const result = ctx.checkpointMgr.rewind(steps);

  if (!result.success) {
    log.err(result.message);
    return { handled: true };
  }

  console.log("");
  console.log(`  ${SUCCESS}✓ Rewound ${result.stepsRewound} checkpoint${result.stepsRewound > 1 ? "s" : ""}${C.reset}`);

  if (result.restored.length > 0) {
    for (const f of result.restored.slice(0, 10)) {
      console.log(`  ${TEXT_DIM}↩ ${f}${C.reset}`);
    }
    if (result.restored.length > 10) {
      console.log(`  ${MUTED}… +${result.restored.length - 10} more${C.reset}`);
    }
  }

  if (result.errors.length > 0) {
    for (const e of result.errors) {
      console.log(`  ${ERROR}✗ ${e}${C.reset}`);
    }
  }

  console.log(`  ${MUTED}${result.remaining} checkpoints remaining${C.reset}`);
  console.log("");

  return { handled: true };
};

export { handleRewind };
