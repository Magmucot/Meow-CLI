// ═══════════════════════════════════════════════════════════════════════════
// api.js — Meow CLI API Layer (streaming + retry + smart error handling)
// ═══════════════════════════════════════════════════════════════════════════

import { TOOLS } from "./tools.js";
import { sanitizeMessagesForApi, sanitizeToolCallsForApi } from "./images.js";

// ─── Retry Config ───────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const RETRYABLE_CODES = [429, 500, 502, 503, 504];

function isRetryable(status, errorMsg = "") {
  if (RETRYABLE_CODES.includes(status)) return true;
  const msg = errorMsg.toLowerCase();
  return msg.includes("econnreset") ||
         msg.includes("timeout") ||
         msg.includes("fetch failed") ||
         msg.includes("network") ||
         msg.includes("socket hang up");
}

function getRetryDelay(attempt, status) {
  // 429 = rate limit → longer backoff
  const multiplier = status === 429 ? 3 : 1;
  return BASE_DELAY * Math.pow(2, attempt) * multiplier;
}

// ─── Standard API Call (non-streaming) ──────────────────────────────────────

async function callApi(messages, cfg) {
  if (!cfg.api_key) throw new Error("API Key not set. Use /key or set OPENAI_API_KEY.");

  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const url = cfg.api_base.replace(/\/+$/, "");
  const safeMessages = sanitizeToolCallsForApi(sanitizeMessagesForApi(messages));

  const payload = {
    model: cfg.model,
    messages: safeMessages,
    tools: TOOLS,
    tool_choice: "auto",
    temperature: profile.temperature,
  };

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutMs = cfg.api_timeout_ms || 120000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${url}/chat/completions/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const txt = await res.text().catch(() => "");

        // Check if context length error — don't retry, throw immediately
        if (txt.includes("context_length") || txt.includes("maximum context") || txt.includes("token")) {
          const err = new Error(`API ${res.status}: ${txt.slice(0, 300)}`);
          err.status = res.status;
          err.isContextError = true;
          throw err;
        }

        if (isRetryable(res.status) && attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt, res.status);
          lastError = new Error(`API ${res.status}: ${txt.slice(0, 200)}`);
          lastError.status = res.status;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw new Error(`API ${res.status}: ${txt.slice(0, 300)}`);
      }

      return await res.json();

    } catch (e) {
      if (e.isContextError) throw e;

      if (e.name === "AbortError") {
        e.message = `API timeout after ${(cfg.api_timeout_ms || 120000) / 1000}s`;
      }

      if (attempt < MAX_RETRIES && isRetryable(0, e.message)) {
        const delay = getRetryDelay(attempt, 0);
        lastError = e;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`Network error: ${e.message}`);
    }
  }

  throw lastError || new Error("API call failed after retries");
}

// ─── Streaming API Call ─────────────────────────────────────────────────────

async function callApiStream(messages, cfg, onChunk) {
  if (!cfg.api_key) throw new Error("API Key not set. Use /key or set OPENAI_API_KEY.");

  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const url = cfg.api_base.replace(/\/+$/, "");
  const safeMessages = sanitizeToolCallsForApi(sanitizeMessagesForApi(messages));

  const payload = {
    model: cfg.model,
    messages: safeMessages,
    tools: TOOLS,
    tool_choice: "auto",
    temperature: profile.temperature,
    stream: true,
  };

  const controller = new AbortController();
  const timeoutMs = cfg.api_timeout_ms || 120000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${txt.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let toolCalls = [];
    let finishReason = null;
    let usage = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") {
          if (trimmed === "data: [DONE]") finishReason = finishReason || "stop";
          continue;
        }
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          const finish = json.choices?.[0]?.finish_reason;

          if (finish) finishReason = finish;
          if (json.usage) usage = json.usage;

          if (!delta) continue;

          // Text content
          if (delta.content) {
            fullContent += delta.content;
            if (onChunk) onChunk({ type: "text", content: delta.content });
          }

          // Tool calls (streamed incrementally)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id || "",
                  type: "function",
                  function: { name: tc.function?.name || "", arguments: "" },
                };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    // Build final message
    const message = { role: "assistant", content: fullContent || null };
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls.filter(tc => tc && tc.id);
      if (!message.content) message.content = null;
    }

    return {
      choices: [{ message, finish_reason: finishReason }],
      usage: usage || null,
    };

  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      throw new Error(`API stream timeout after ${timeoutMs / 1000}s`);
    }
    throw e;
  }
}


export { callApi, callApiStream };