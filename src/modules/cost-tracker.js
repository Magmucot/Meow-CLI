import fs from "fs";
import path from "path";
import { COST_FILE } from "./config.js";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, WARNING, box, COLS } from "./ui.js";

/**
 * Pricing data per 1 million tokens in USD.
 * @type {Object<string, {input: number, output: number}>}
 */
const MODEL_PRICES = {
  "gpt-4-turbo":        { input: 10.0,  output: 30.0 },
  "gpt-4o":             { input: 2.5,   output: 10.0 },
  "gpt-4o-mini":        { input: 0.15,  output: 0.60 },
  "gpt-4":              { input: 30.0,  output: 60.0 },
  "gpt-3.5-turbo":      { input: 0.50,  output: 1.50 },
  "claude-sonnet-4-20250514":    { input: 3.0,  output: 15.0 },
  "claude-opus-4-20250514":    { input: 15.0,  output: 75.0 },
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022":  { input: 0.80, output: 4.0 },
  "deepseek-chat":      { input: 0.14,  output: 0.28 },
  "deepseek-coder":     { input: 0.14,  output: 0.28 },
  "_default":           { input: 2.0,   output: 8.0 },
};

/**
 * Retrieves the pricing for a given model name.
 * @param {string} model - The model name.
 * @returns {{input: number, output: number}} Price per 1M tokens.
 */
function getModelPrice(model) {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];

  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(MODEL_PRICES)) {
    if (lower.includes(key) || key.includes(lower)) return price;
  }

  return MODEL_PRICES._default;
}

/**
 * Tracks token usage and estimated costs across sessions.
 */
class CostTracker {
  constructor() {
    /** @type {Object} Session usage summary */
    this.sessionCost = { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0 };
    /** @type {Array<Object>} History of individual requests */
    this.history = [];
    /** @type {Object} All-time usage summary */
    this.totalCost = { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0, since: Date.now() };
    this._loadTotal();
  }

  /**
   * Loads total cost from persistent storage.
   * @private
   */
  _loadTotal() {
    try {
      if (fs.existsSync(COST_FILE)) {
        this.totalCost = JSON.parse(fs.readFileSync(COST_FILE, "utf8"));
      }
    } catch {
      // Keep defaults
    }
  }

  /**
   * Saves total cost to persistent storage.
   * @private
   */
  _saveTotal() {
    try {
      fs.mkdirSync(path.dirname(COST_FILE), { recursive: true });
      fs.writeFileSync(COST_FILE, JSON.stringify(this.totalCost, null, 2));
    } catch { }
  }

  /**
   * Records usage for an API request.
   * @param {Object} usage - Usage object from API response.
   * @param {string} model - Model used for the request.
   * @returns {Object|undefined} Summary of the recorded cost.
   */
  record(usage, model) {
    if (!usage) return;

    const price = getModelPrice(model);
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;

    this.sessionCost.input_tokens += inputTokens;
    this.sessionCost.output_tokens += outputTokens;
    this.sessionCost.total_usd += cost;
    this.sessionCost.requests++;

    this.totalCost.input_tokens += inputTokens;
    this.totalCost.output_tokens += outputTokens;
    this.totalCost.total_usd += cost;
    this.totalCost.requests++;
    this._saveTotal();

    this.history.push({
      time: Date.now(),
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
    });
    if (this.history.length > 100) this.history.shift();

    return { inputTokens, outputTokens, cost };
  }

  /**
   * Formats cost information for a single response.
   * @param {Object} usage - Usage object from API response.
   * @param {string} model - Model used.
   * @returns {string} Formatted cost string.
   */
  formatInline(usage, model) {
    if (!usage) return "";
    const price = getModelPrice(model);
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;

    return `${inputTokens}→${outputTokens} (${(inputTokens + outputTokens).toLocaleString()} total) ~$${cost.toFixed(4)}`;
  }

  /**
   * Prints the current session's cost summary.
   */
  printSession() {
    const s = this.sessionCost;
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Session Cost${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
    console.log(`  ${TEXT_DIM}Requests:${C.reset}      ${TEXT}${s.requests}${C.reset}`);
    console.log(`  ${TEXT_DIM}Input tokens:${C.reset}  ${TEXT}${s.input_tokens.toLocaleString()}${C.reset}`);
    console.log(`  ${TEXT_DIM}Output tokens:${C.reset} ${TEXT}${s.output_tokens.toLocaleString()}${C.reset}`);
    console.log(`  ${TEXT_DIM}Total tokens:${C.reset}  ${TEXT}${(s.input_tokens + s.output_tokens).toLocaleString()}${C.reset}`);
    console.log(`  ${TEXT_DIM}Estimated:${C.reset}     ${WARNING}$${s.total_usd.toFixed(4)}${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}\n`);
  }

  /**
   * Prints the all-time cost summary.
   */
  printTotal() {
    const t = this.totalCost;
    const s = this.sessionCost;
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Cost Summary${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
    console.log(`  ${TEXT}This session:${C.reset}`);
    console.log(`    ${TEXT_DIM}${s.requests} requests, ${(s.input_tokens + s.output_tokens).toLocaleString()} tokens${C.reset}`);
    console.log(`    ${WARNING}$${s.total_usd.toFixed(4)}${C.reset}`);
    console.log("");
    console.log(`  ${TEXT}All time:${C.reset} ${MUTED}(since ${new Date(t.since).toLocaleDateString()})${C.reset}`);
    console.log(`    ${TEXT_DIM}${t.requests} requests, ${(t.input_tokens + t.output_tokens).toLocaleString()} tokens${C.reset}`);
    console.log(`    ${WARNING}$${t.total_usd.toFixed(4)}${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}\n`);
  }

  /**
   * Resets the all-time cost tracking.
   */
  resetTotal() {
    this.totalCost = { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0, since: Date.now() };
    this._saveTotal();
  }
}

export { CostTracker, getModelPrice, MODEL_PRICES };
