// ═══════════════════════════════════════════════════════════════════════════
// commands/compact.js — /compact command
// ═══════════════════════════════════════════════════════════════════════════

import {
  log, C, MUTED,
  compactMessages, compactWithAI, printCompactResult, estimateTokens,
} from "../../core.js";

const handleCompact = async (ctx, input) => {
  if (!input.startsWith("/compact")) return null;

  const parts = input.split(/\s+/);
  const useAI = parts.includes("--ai");
  const keepStr = parts.find(p => p.startsWith("--keep="));
  const keepRecent = keepStr ? parseInt(keepStr.split("=")[1], 10) : 4;

  const beforeTokens = estimateTokens(ctx.messages);
  log.dim(`Current context: ~${beforeTokens.toLocaleString()} tokens, ${ctx.messages.length} messages`);

  let result;
  if (useAI) {
    log.dim("Compacting with AI summary...");
    result = await compactWithAI(ctx.messages, ctx.cfg, keepRecent);
  } else {
    result = await compactMessages(ctx.messages, ctx.cfg, keepRecent);
  }

  if (result.compressed) {
    ctx.messages = result.messages;
    ctx.saveState();
  }

  printCompactResult(result);
  return { handled: true };
};

export { handleCompact };
