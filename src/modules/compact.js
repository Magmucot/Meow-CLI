// ═══════════════════════════════════════════════════════════════════════════
// compact.js — Meow CLI Context Compaction
// Manual and auto context compression with token estimation
// ═══════════════════════════════════════════════════════════════════════════

import { callApi } from "./api.js";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, WARNING } from "./ui.js";

// ─── Token Estimation ───────────────────────────────────────────────────────

function estimateTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === "string"
      ? msg.content : JSON.stringify(msg.content || "");
    total += Math.ceil(content.length / 3.5);
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += 50 + Math.ceil((tc.function?.arguments || "").length / 3.5);
      }
    }
  }
  return total;
}

// ─── Compact Messages ───────────────────────────────────────────────────────

async function compactMessages(messages, cfg, keepRecent = 4) {
  if (messages.length < 6) {
    return { messages, compressed: false, reason: "Too few messages to compact" };
  }

  const systemMsg = messages[0];
  const recentCount = Math.min(keepRecent, Math.floor(messages.length * 0.3));
  const recentMessages = messages.slice(-recentCount);
  const oldMessages = messages.slice(1, -recentCount);

  if (oldMessages.length < 3) {
    return { messages, compressed: false, reason: "Not enough old messages" };
  }

  const beforeTokens = estimateTokens(messages);

  // Build summary of old messages
  const summaryParts = [];
  let toolResults = 0;
  let filesMentioned = new Set();

  for (const msg of oldMessages) {
    const content = typeof msg.content === "string" ? msg.content : "";

    if (msg.role === "assistant" && content) {
      // Keep first 200 chars of assistant responses
      summaryParts.push(`Assistant: ${content.slice(0, 200)}`);
    }

    if (msg.role === "tool") {
      toolResults++;
      // Extract file paths from tool results
      const paths = content.match(/(?:\/[\w.-]+)+\.\w+/g) || [];
      paths.forEach(p => filesMentioned.add(p));
    }

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name || "";
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
        summaryParts.push(`Tool: ${name}(${args.path || args.cmd || args.query || "..."})`);
      }
    }
  }

  const summary = [
    `[CONTEXT COMPACTED — ${oldMessages.length} messages → summary]`,
    "",
    summaryParts.slice(-15).join("\n"),
    "",
    toolResults > 0 ? `Tool calls: ${toolResults}` : "",
    filesMentioned.size > 0 ? `Files referenced: ${[...filesMentioned].slice(0, 10).join(", ")}` : "",
    "",
    "Continue from the most recent context below.",
  ].filter(Boolean).join("\n");

  const compacted = [
    systemMsg,
    { role: "user", content: summary },
    ...recentMessages,
  ];

  const afterTokens = estimateTokens(compacted);

  return {
    messages: compacted,
    compressed: true,
    before: {
      messages: messages.length,
      tokens: beforeTokens,
    },
    after: {
      messages: compacted.length,
      tokens: afterTokens,
    },
    saved: {
      messages: messages.length - compacted.length,
      tokens: beforeTokens - afterTokens,
    },
  };
}

// ─── AI-powered compact (uses the model to summarize) ───────────────────────

async function compactWithAI(messages, cfg, keepRecent = 4) {
  if (messages.length < 8) {
    return compactMessages(messages, cfg, keepRecent);
  }

  const systemMsg = messages[0];
  const recentCount = Math.min(keepRecent, Math.floor(messages.length * 0.3));
  const recentMessages = messages.slice(-recentCount);
  const oldMessages = messages.slice(1, -recentCount);
  const beforeTokens = estimateTokens(messages);

  // Ask the model to summarize
  try {
    const summaryPrompt = [
      { role: "system", content: "You are a conversation summarizer. Summarize the following conversation history into a concise summary that preserves all important context: decisions made, files modified, code written, errors encountered, and current state. Be brief but complete. Return ONLY the summary." },
      { role: "user", content: oldMessages.map(m => {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content || "").slice(0, 200);
        return `[${m.role}]: ${content.slice(0, 300)}`;
      }).join("\n") },
    ];

    const data = await callApi(summaryPrompt, { ...cfg, profiles: { ...cfg.profiles, [cfg.profile]: { ...cfg.profiles[cfg.profile], temperature: 0.1 } } });
    const aiSummary = data.choices?.[0]?.message?.content || "";

    if (aiSummary) {
      const compacted = [
        systemMsg,
        { role: "user", content: `[CONTEXT COMPACTED by AI — ${oldMessages.length} messages summarized]\n\n${aiSummary}\n\nContinue from the most recent context below.` },
        ...recentMessages,
      ];

      const afterTokens = estimateTokens(compacted);
      return {
        messages: compacted,
        compressed: true,
        method: "ai",
        before: { messages: messages.length, tokens: beforeTokens },
        after: { messages: compacted.length, tokens: afterTokens },
        saved: { messages: messages.length - compacted.length, tokens: beforeTokens - afterTokens },
      };
    }
  } catch (e) {
    log.dim(`AI compact failed, falling back: ${e.message}`);
  }

  // Fallback to simple compact
  return compactMessages(messages, cfg, keepRecent);
}

// ─── Print compact result ───────────────────────────────────────────────────

function printCompactResult(result) {
  if (!result.compressed) {
    log.warn(result.reason || "Nothing to compact");
    return;
  }

  console.log("");
  console.log(`  ${SUCCESS}✓ Context compacted${C.reset}${result.method === "ai" ? ` ${MUTED}(AI summary)${C.reset}` : ""}`);
  console.log(`  ${TEXT_DIM}Messages:${C.reset} ${TEXT}${result.before.messages}${C.reset} → ${SUCCESS}${result.after.messages}${C.reset} ${MUTED}(−${result.saved.messages})${C.reset}`);
  console.log(`  ${TEXT_DIM}Tokens:${C.reset}   ~${TEXT}${result.before.tokens.toLocaleString()}${C.reset} → ~${SUCCESS}${result.after.tokens.toLocaleString()}${C.reset} ${MUTED}(−${result.saved.tokens.toLocaleString()})${C.reset}`);
  console.log("");
}

// ─── Auto-compact check ─────────────────────────────────────────────────────

function shouldAutoCompact(messages, warningThreshold = 80000) {
  const tokens = estimateTokens(messages);
  return {
    shouldCompact: tokens > warningThreshold,
    tokens,
    threshold: warningThreshold,
    percentage: Math.round((tokens / warningThreshold) * 100),
  };
}


export {
  estimateTokens,
  compactMessages,
  compactWithAI,
  printCompactResult,
  shouldAutoCompact,
};
