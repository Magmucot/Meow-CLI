import { TOOLS, ALL_TOOLS } from "./tools.js";
import { sanitizeMessagesForApi, sanitizeToolCallsForApi } from "./images.js";

/** @type {number} Maximum number of retries for transient API errors */
const MAX_RETRIES = 3;
/** @type {number} Base delay for exponential backoff in milliseconds */
const BASE_DELAY = 1000;
/** @type {Array<number>} HTTP status codes that should trigger a retry */
const RETRYABLE_CODES = [429, 500, 502, 503, 504];

/**
 * Determines if an error is retryable.
 * @param {number} status - HTTP status code.
 * @param {string} [errorMsg=""] - Error message text.
 * @returns {boolean} True if the request should be retried.
 */
function isRetryable(status, errorMsg = "") {
  if (RETRYABLE_CODES.includes(status)) return true;
  const msg = errorMsg.toLowerCase();
  return msg.includes("econnreset") ||
         msg.includes("timeout") ||
         msg.includes("fetch failed") ||
         msg.includes("network") ||
         msg.includes("socket hang up");
}

/**
 * Calculates retry delay with exponential backoff.
 * @param {number} attempt - Current attempt number.
 * @param {number} status - HTTP status code.
 * @returns {number} Delay in milliseconds.
 */
function getRetryDelay(attempt, status) {
  const multiplier = status === 429 ? 3 : 1;
  return BASE_DELAY * Math.pow(2, attempt) * multiplier;
}

/**
 * Makes a standard (non-streaming) request to the AI API.
 * @param {Array<Object>} messages - Conversation history.
 * @param {Object} cfg - Application configuration.
 * @returns {Promise<Object>} The API response data.
 * @throws {Error} If the API returns an error or fails after retries.
 */
async function callApi(messages, cfg) {
  if (!cfg.api_key) throw new Error("API Key not set. Use /key or set OPENAI_API_KEY.");

  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const url = cfg.api_base.replace(/\/+$/, "");
  const safeMessages = sanitizeToolCallsForApi(sanitizeMessagesForApi(messages));

  const payload = {
    model: cfg.model,
    messages: safeMessages,
    tools: ALL_TOOLS,
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

/**
 * Makes a streaming request to the AI API.
 * @param {Array<Object>} messages - Conversation history.
 * @param {Object} cfg - Application configuration.
 * @param {Function} onChunk - Callback for each received text chunk.
 * @returns {Promise<Object>} The final aggregated message and usage data.
 */
async function callApiStream(messages, cfg, onChunk) {
  if (!cfg.api_key) throw new Error("API Key not set. Use /key or set OPENAI_API_KEY.");

  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const url = cfg.api_base.replace(/\/+$/, "");
  const safeMessages = sanitizeToolCallsForApi(sanitizeMessagesForApi(messages));

  const payload = {
    model: cfg.model,
    messages: safeMessages,
    tools: ALL_TOOLS,
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

          if (delta.content) {
            fullContent += delta.content;
            if (onChunk) onChunk({ type: "text", content: delta.content });
          }

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
